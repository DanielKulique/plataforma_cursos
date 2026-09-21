#!/usr/bin/env node
'use strict';

const path = require('node:path');
const core = require('./lib/backup-core');

function options(args) {
    const parsed = { _: [] };
    for (let i = 0; i < args.length; i += 1) {
        if (!args[i].startsWith('--')) parsed._.push(args[i]);
        else {
            const key = args[i].slice(2);
            if (!args[i + 1] || args[i + 1].startsWith('--')) parsed[key] = true;
            else parsed[key] = args[++i];
        }
    }
    return parsed;
}

async function main() {
    const [command, ...rest] = process.argv.slice(2);
    const args = options(rest);
    if (command === 'create') {
        const manifest = await core.createManifest(path.resolve(args.dir), {
            backupId: args.id,
            createdAt: args.created,
            metadataFile: path.resolve(args.metadata),
            appCommit: args.commit,
            sourceSha256: args['source-sha'],
            workingTreeDirty: args.dirty === 'true'
        });
        console.log(JSON.stringify({ backup_id: manifest.backup_id, status: manifest.status }));
    } else if (command === 'checksums') {
        console.log(JSON.stringify({ files: await core.writeChecksums(path.resolve(args.dir)) }));
    } else if (command === 'verify') {
        const result = await core.verifyBackupDir(path.resolve(args.dir), { requireComplete: !args['allow-incomplete'] });
        console.log(JSON.stringify({ backup_id: result.backup_id, created_at: result.created_at, status: 'GOOD' }));
    } else if (command === 'complete') {
        const result = await core.markComplete(path.resolve(args.dir));
        console.log(JSON.stringify({ backup_id: result.backup_id, status: 'LOCAL_GOOD' }));
    } else if (command === 'latest') {
        const result = await core.updateLatestGood(path.resolve(args.root), path.resolve(args.dir), args.scope || 'local');
        console.log(JSON.stringify({ backup_id: result.backup_id, status: 'GOOD' }));
    } else if (command === 'retention') {
        const result = await core.applyRetention(path.resolve(args.root), Number(args.days));
        console.log(JSON.stringify(result));
    } else if (command === 'status') {
        const latest = await core.readLatestGood(path.resolve(args.root));
        console.log(JSON.stringify({ ...latest.pointer, ...core.rpoState(latest.pointer.created_at, Number(args['rpo-hours'] || 24)) }, null, 2));
    } else throw new Error('Uso: backup_manifest.js create|checksums|verify|complete|latest|retention|status ...');
}

main().catch((error) => {
    console.error(`BACKUP_${error.code || 'FAILED'}: ${error.message}`);
    process.exitCode = 1;
});
