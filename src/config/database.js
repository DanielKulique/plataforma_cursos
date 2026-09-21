const mysql = require('mysql2/promise');
const path = require('path');
const logger = require('../utils/logger');
const { assertDatabaseConnectionEnvironment, databaseClientConfig } = require('./database-connection');
const { assertDatabaseIdentity } = require('./database-identity');
const { loadEnvironment } = require('./loadEnvironment');
const { buildRuntimeConfig } = require('./runtime-config');
const { normalizePoolAcquisitionError } = require('./database-pool-errors');

const databaseKeysPresent = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'DB_ENVIRONMENT_IDENTITY']
	.every((key) => process.env[key] !== undefined && String(process.env[key]).trim() !== '');
if ((!databaseKeysPresent || process.env.NODE_ENV === 'test') && process.env.NODE_ENV !== 'production') {
	const mode = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined
		? 'test'
		: 'development';
	loadEnvironment(mode, path.join(__dirname, '..', '..'));
}

const runtime = buildRuntimeConfig(process.env);
const expected = assertDatabaseConnectionEnvironment(process.env);

const rawPool = mysql.createPool(databaseClientConfig(process.env, {
	waitForConnections: runtime.database.waitForConnections,
	connectionLimit: runtime.database.poolMax,
	queueLimit: runtime.database.queueLimit,
	connectTimeout: runtime.database.connectTimeoutMs
}));

const poolMetrics = {
	activeConnections: 0,
	pendingAcquisitions: 0,
	totalAcquisitions: 0,
	acquisitionFailures: 0,
	acquisitionLatencyCount: 0,
	acquisitionLatencyTotalMs: 0,
	acquisitionLatencyMaxMs: 0
};

let identityPromise;
function ensureDatabaseIdentity() {
	if (!identityPromise) {
		identityPromise = assertDatabaseIdentity(rawPool, expected).catch((error) => {
			identityPromise = undefined;
			throw error;
		});
	}
	return identityPromise;
}

function trackedConnection(connection) {
	let released = false;
	const rawRelease = connection.release.bind(connection);
	let releaseOverride;
	const trackedRelease = () => {
		if (released) return;
		released = true;
		poolMetrics.activeConnections = Math.max(0, poolMetrics.activeConnections - 1);
		rawRelease();
	};
	return new Proxy(connection, {
		get(target, property) {
			if (property === 'release') {
				return releaseOverride || trackedRelease;
			}
			const value = Reflect.get(target, property, target);
			return typeof value === 'function' ? value.bind(target) : value;
		},
		set(target, property, value) {
			// Instrumentation may wrap release temporarily. Keep that hook on the
			// proxy while the native mysql2 release remains immutable and leak-safe.
			if (property === 'release') {
				releaseOverride = value;
				return true;
			}
			return Reflect.set(target, property, value, target);
		}
	});
}

async function acquireConnection() {
	await ensureDatabaseIdentity();
	const startedAt = process.hrtime.bigint();
	poolMetrics.pendingAcquisitions += 1;
	try {
		const connection = await rawPool.getConnection();
		const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
		poolMetrics.totalAcquisitions += 1;
		poolMetrics.acquisitionLatencyCount += 1;
		poolMetrics.acquisitionLatencyTotalMs += durationMs;
		poolMetrics.acquisitionLatencyMaxMs = Math.max(poolMetrics.acquisitionLatencyMaxMs, durationMs);
		poolMetrics.activeConnections += 1;
		return trackedConnection(connection);
	} catch (error) {
		poolMetrics.acquisitionFailures += 1;
		throw normalizePoolAcquisitionError(error);
	} finally {
		poolMetrics.pendingAcquisitions = Math.max(0, poolMetrics.pendingAcquisitions - 1);
	}
}

async function withConnection(method, args) {
	const connection = await acquireConnection();
	try {
		return await connection[method](...args);
	} finally {
		connection.release();
	}
}

function metrics() {
	const latencyCount = poolMetrics.acquisitionLatencyCount;
	return {
		connectionLimit: runtime.database.poolMax,
		queueLimit: runtime.database.queueLimit,
		waitForConnections: runtime.database.waitForConnections,
		activeConnections: poolMetrics.activeConnections,
		pendingAcquisitions: poolMetrics.pendingAcquisitions,
		totalAcquisitions: poolMetrics.totalAcquisitions,
		acquisitionFailures: poolMetrics.acquisitionFailures,
		acquisitionLatencyMs: {
			count: latencyCount,
			average: latencyCount ? Number((poolMetrics.acquisitionLatencyTotalMs / latencyCount).toFixed(3)) : 0,
			max: Number(poolMetrics.acquisitionLatencyMaxMs.toFixed(3))
		}
	};
}

const pool = {
	async query(...args) {
		return withConnection('query', args);
	},
	async execute(...args) {
		return withConnection('execute', args);
	},
	async getConnection() {
		return acquireConnection();
	},
	end: (...args) => rawPool.end(...args),
	ensureDatabaseIdentity,
	metrics
};

logger.info('database.pool.created', {
	connectionLimit: runtime.database.poolMax,
	queueLimit: runtime.database.queueLimit,
	waitForConnections: runtime.database.waitForConnections,
	connectTimeoutMs: runtime.database.connectTimeoutMs
});

module.exports = pool;
