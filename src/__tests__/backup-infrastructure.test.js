'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

describe('infraestrutura de backup e restore', () => {
    it('agenda backup diário persistente e exige sucesso offsite no service', () => {
        const timer = read('deploy/systemd/plataforma-backup.timer');
        const service = read('deploy/systemd/plataforma-backup.service');
        const installer = read('scripts/install_backup_systemd.sh');
        const example = read('deploy/systemd/backup.env.example');
        expect(timer).toContain('OnCalendar=*-*-* 03:15:00 America/Sao_Paulo');
        expect(timer).toContain('Persistent=true');
        expect(service).toContain('Environment=BACKUP_REQUIRE_OFFSITE=true');
        expect(service).toContain('UMask=0077');
        expect(example).toContain("BACKUP_SCHEDULE='*-*-* 03:15:00 America/Sao_Paulo'");
        expect(installer).toContain('systemd-analyze calendar "$backup_schedule"');
        expect(installer).toContain('plataforma-backup.timer.d/schedule.conf');
    });

    it('mantém preflight antes do APPLY e mede a validação no relatório', () => {
        const restore = read('scripts/restore_database.sh');
        expect(restore.indexOf('backup_cli verify')).toBeLessThan(restore.indexOf('if [[ "$apply" != true ]]'));
        expect(restore.indexOf('if [[ "$apply" != true ]]')).toBeLessThan(restore.indexOf('DROP DATABASE IF EXISTS'));
        expect(restore).toContain('if [[ "$mode" == in-place ]]; then\n    "${COMPOSE[@]}" run --rm --no-deps -T app npm run db:identity:verify\nfi');
        expect(restore).toContain('"preflight":int(preflight)');
        expect(restore).toContain('Target não corresponde ao ambiente configurado');
        expect(restore).toContain('"$target" == "$configured_target"');
    });

    it('drill usa download offsite, stack isolada e smoke autenticado opcional sem argv secreto', () => {
        const drill = read('scripts/restore_drill.sh');
        expect(drill).toContain('backup_offsite.sh download latest');
        expect(drill).toContain('--target isolated-offsite-drill --mode isolated --apply');
        expect(drill).toContain('RESTORE_SMOKE_CREDENTIALS_FILE');
        expect(drill).toContain("printf '%s\\n%s\\n'");
        expect(drill).not.toMatch(/-e RESTORE_SMOKE_PASSWORD/);
    });

    it('verificador exige modos privados exatos e proprietário do volume', () => {
        const verifier = read('scripts/verify_restored_backup.js');
        expect(verifier).toContain('(rootStat.mode & 0o777) !== 0o700');
        expect(verifier).toContain('(actual.stat.mode & 0o777) !== 0o600');
        expect(verifier).toContain('actual.stat.uid !== rootStat.uid');
    });

    it('injeta falha somente após iniciar upload e antes do completion marker', () => {
        const backup = read('scripts/backup_database.sh');
        const offsite = read('scripts/backup_offsite.sh');
        expect(backup).not.toContain('BACKUP_FAILURE_INJECTION:-}" == during_upload');
        expect(offsite.indexOf('package.tar.gz" --file "$package"')).toBeLessThan(offsite.indexOf('BACKUP_FAILURE_INJECTION:-}" == during_upload'));
        expect(offsite.indexOf('BACKUP_FAILURE_INJECTION:-}" == during_upload')).toBeLessThan(offsite.indexOf('complete.json" --file "$completion"'));
    });

    it('download e status latest consomem o ponteiro remoto explícito', () => {
        const offsite = read('scripts/backup_offsite.sh');
        const status = read('scripts/backup_status.sh');
        expect(offsite).toContain('--name "$BACKUP_REMOTE_PREFIX/latest-good.json"');
        expect(status).toContain('--name "$BACKUP_REMOTE_PREFIX/latest-good.json"');
        expect(status).toContain('x.get("backup_id")==sys.argv[2]');
        expect(offsite).not.toContain("sort -r | head -n 1");
        expect(status).not.toContain("sort -r | head -n 1");
    });

    it('corrige ownership somente depois do SHA do pacote e preserva modos privados', () => {
        const offsite = read('scripts/backup_offsite.sh');
        const permissions = read('scripts/lib/backup-offsite-permissions.sh');
        const checksum = offsite.indexOf('[[ "$actual" == "$expected" ]]');
        const extraction = offsite.indexOf('tar -xzf "$package" -C "$extract_root"');
        expect(checksum).toBeGreaterThanOrEqual(0);
        expect(checksum).toBeLessThan(extraction);
        expect(offsite).toContain('--no-same-owner --no-same-permissions');
        expect(offsite).toContain('backup_prepare_verifier_tree "$extract_root" "$verifier_identity"');
        expect(offsite.indexOf('source "$ROOT/scripts/lib/backup-offsite-permissions.sh"')).toBeLessThan(offsite.indexOf('trap '));
        expect(permissions).toContain('chown -R -- "$verifier_identity" "$root"');
        expect(permissions).toContain('find "$root" -type d -exec chmod 700 -- {} +');
        expect(permissions).toContain('find "$root" -type f -exec chmod 600 -- {} +');
    });

    it('remove arquivos temporários se o SHA do pacote offsite falhar', () => {
        const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'backup-offsite-cleanup-'));
        try {
            const fakeBin = path.join(temporary, 'bin');
            const destination = path.join(temporary, 'download');
            fs.mkdirSync(fakeBin, { mode: 0o700 });
            fs.writeFileSync(path.join(fakeBin, 'az'), [
                '#!/bin/bash',
                'set -e',
                'if [[ "$1 $2" == "account show" ]]; then exit 0; fi',
                'if [[ "$1 $2 $3" == "storage container show" ]]; then echo None; exit 0; fi',
                'if [[ "$1 $2 $3" == "storage blob download" ]]; then',
                '  while (($#)); do',
                '    case "$1" in --name) name=$2; shift 2 ;; --file) file=$2; shift 2 ;; *) shift ;; esac',
                '  done',
                '  case "$name" in',
                '    */latest-good.json) printf \'{"format_version":1,"backup_id":"backup-20260928T061501Z-82b8376c-c008-498e-930a-bc449da1f477"}\\n\' > "$file" ;;',
                '    */complete.json) printf \'{"status":"COMPLETE","backup_id":"backup-20260928T061501Z-82b8376c-c008-498e-930a-bc449da1f477","package_sha256":"%064d"}\\n\' 0 > "$file" ;;',
                '    */package.tar.gz) printf invalid > "$file" ;;',
                '  esac',
                '  exit 0',
                'fi',
                'exit 1'
            ].join('\n'), { mode: 0o700 });
            const result = spawnSync('bash', [path.join(root, 'scripts/backup_offsite.sh'), 'download', 'latest', destination], {
                encoding: 'utf8',
                env: {
                    ...process.env,
                    PATH: `${fakeBin}:${process.env.PATH}`,
                    AZURE_STORAGE_ACCOUNT: 'backupacct'
                }
            });
            expect(result.status).toBe(1);
            expect(result.stderr).toContain('SHA-256 do pacote remoto divergiu');
            expect(fs.readdirSync(destination)).toEqual([]);
        } finally {
            fs.rmSync(temporary, { recursive: true, force: true });
        }
    });
});
