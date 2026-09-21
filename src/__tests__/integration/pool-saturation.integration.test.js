'use strict';

const mysql = require('mysql2/promise');
const { databaseClientConfig } = require('../../config/database-connection');
const { assertDatabaseIdentity } = require('../../config/database-identity');

describe('pool MySQL com fila finita', () => {
    let pool;

    beforeAll(async () => {
        pool = mysql.createPool(databaseClientConfig(process.env, {
            waitForConnections: true,
            connectionLimit: 2,
            queueLimit: 1,
            connectTimeout: 5000
        }));
        await assertDatabaseIdentity(pool, {
            database: process.env.DB_NAME,
            identity: process.env.DB_ENVIRONMENT_IDENTITY
        });
    });

    afterAll(async () => pool.end());

    it('limita conexões, limita espera, recupera e não acumula fila infinita', async () => {
        const first = await pool.getConnection();
        const second = await pool.getConnection();
        const queued = pool.getConnection();
        await expect(pool.getConnection()).rejects.toThrow(/queue limit/i);

        first.release();
        const third = await queued;
        third.release();
        second.release();

        await expect(pool.query('SELECT 1 AS ok')).resolves.toEqual(expect.arrayContaining([
            expect.arrayContaining([expect.objectContaining({ ok: 1 })])
        ]));
    });
});
