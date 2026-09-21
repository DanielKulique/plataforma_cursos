'use strict';

require('dotenv').config({ quiet: true });
const { reconcile } = require('../src/api/services/storage-reconciliation.service');
const { storagePolicy } = require('../src/config/storage-policy');

async function main() {
    const args = process.argv.slice(2);
    const options = { apply: false, only: [], policy: storagePolicy() };
    let json = false;
    for (let i = 0; i < args.length; i += 1) {
        if (args[i] === '--apply') options.apply = true;
        else if (args[i] === '--json') json = true;
        else if (args[i] === '--grace-hours' && args[i + 1]) {
            const hours = Number(args[++i]);
            if (!Number.isSafeInteger(hours) || hours < 0 || hours > 36500) throw new Error('--grace-hours inválido.');
            options.policy.graceHours = hours;
        }
        else if (args[i] === '--only' && args[i + 1]) options.only.push(args[++i]);
        else throw new Error(`Opção inválida: ${args[i]}`);
    }
    // Keep JSON stdout machine-readable; operational logs go to stderr in this CLI.
    console.info = console.error;
    const db = require('../src/config/database');
    try {
        const report = await reconcile(db, options);
        if (json) console.log(JSON.stringify(report, null, 2));
        else {
            console.log(`${report.mode}: retenção ${report.policy.retentionDays} dias; carência ${report.policy.graceHours} horas`);
            for (const [namespace, counts] of Object.entries(report.counts)) console.log(`${namespace}: ${JSON.stringify(counts)}`);
            for (const entry of report.entries) console.log(`${entry.namespace}:${entry.name || '-'} ${entry.classification} eligible=${entry.eligible}${entry.action ? ` action=${entry.action}` : ''}`);
        }
        if (report.entries.some((entry) => entry.action?.startsWith('FAILED:'))) process.exitCode = 1;
    } finally { await db.end(); }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
