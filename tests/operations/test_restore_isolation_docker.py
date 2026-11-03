"""Opt-in real Docker drill tests. No cloud, host MySQL, or real backup data.

RUN_RESTORE_DOCKER_TESTS=1 python3 -m unittest discover -s tests/operations \
    -p test_restore_isolation_docker.py -v
"""

import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import signal
import subprocess
import tarfile
import tempfile
import time
import unittest

from test_restore_isolation import ROOT, HELPER, ENVIRONMENT, resolved


def project_name():
    return 'plataforma-restore-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dt%H%M%Sz') + '-' + secrets.token_hex(8)


@unittest.skipUnless(os.environ.get('RUN_RESTORE_DOCKER_TESTS') == '1', 'Explicit opt-in required for disposable Docker tests.')
class RestoreDockerTests(unittest.TestCase):
    @classmethod
    def run_cli(cls, args, **kwargs):
        return subprocess.run(args, cwd=ROOT, env=cls.env, capture_output=True, check=True, **kwargs)

    @classmethod
    def compose(cls, *args, **kwargs):
        return cls.run_cli(['docker', 'compose', '-p', cls.source_project, '-f', str(cls.source_config), *args], **kwargs)

    @classmethod
    def setUpClass(cls):
        cls.env = {key: value for key, value in os.environ.items()
                   if key not in {'COMPOSE_FILE', 'COMPOSE_PROJECT_NAME', 'COMPOSE_PROFILES',
                                  'RESTORE_ISOLATION_CONFIG', 'DOCKER_HOST', 'DOCKER_CONTEXT', *ENVIRONMENT}}
        cls.temp = tempfile.TemporaryDirectory(prefix='goal19-real-restore-')
        cls.directory = Path(cls.temp.name)
        cls.addClassCleanup(cls.temp.cleanup)
        cls.env_file = cls.directory / 'fictional.env'
        cls.env_file.write_text('\n'.join(f"{key}='{value}'" for key, value in ENVIRONMENT.items()) + '\n')
        cls.env_file.chmod(0o600)
        cls.source_project = project_name()
        cls.source_config = cls.directory / 'source-compose.json'
        cls.run_cli(['python3', str(HELPER), 'prepare', '--project', cls.source_project,
                 '--snapshot', str(cls.source_config)], input=json.dumps(resolved(cls.env_file, project=cls.source_project)).encode())
        cls.addClassCleanup(cls.cleanup_source)
        cls.compose('build', 'app', timeout=180)
        cls.compose('up', '-d', 'db', timeout=120)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            try:
                cls.compose('exec', '-T', 'db', 'sh', '-c',
                            'mysqladmin ping -h 127.0.0.1 -uroot -p"$MYSQL_ROOT_PASSWORD" --silent')
                break
            except subprocess.CalledProcessError:
                time.sleep(0.5)
        else:
            raise AssertionError('Disposable fixture MySQL did not become ready.')
        cls.compose('run', '--rm', '--no-deps', '-T', '-e', 'ALLOW_PRODUCTION_MIGRATIONS=I_UNDERSTAND',
                    'app', 'node', 'scripts/migrate_database.js', timeout=120)
        # Synthetic rows only. PDF bytes come from the committed test fixture, never user storage.
        pdf_base64 = __import__('base64').b64encode((ROOT / 'src/__tests__/fixtures/valid-material.pdf').read_bytes()).decode()
        seed = r'''
const fs=require('fs'),crypto=require('crypto'),db=require('./src/config/database');
(async()=>{
 const bytes=Buffer.from('PDF_BASE64','base64'), hash=crypto.createHash('sha256').update(bytes).digest('hex');
 const [teacher]=await db.query("INSERT INTO Usuarios(nome_completo,cpf,email,senha,tipo) VALUES('GOAL19 Fictional Teacher','11111111111','teacher@fixture.invalid','not-a-login-hash','PROFESSOR')");
 const [student]=await db.query("INSERT INTO Usuarios(nome_completo,cpf,email,senha,tipo) VALUES('GOAL19 Fictional Student','22222222222','student@fixture.invalid','not-a-login-hash','ALUNO')");
 const [course]=await db.query("INSERT INTO Cursos(nome_curso,carga_horaria) VALUES('GOAL19 Fictional Course',6)");
 const [klass]=await db.query("INSERT INTO Turmas(id_curso,id_professor,nome_turma,data_inicio,status) VALUES(?,?,'GOAL19 Fictional Class','2026-11-03','FECHADA')",[course.insertId,teacher.insertId]);
 await db.query("INSERT INTO Matriculas(id_aluno,id_turma,status_aprovacao) VALUES(?,?,'APROVADO')",[student.insertId,klass.insertId]);
 const material=crypto.randomUUID()+'.pdf', certificate=crypto.randomUUID()+'.pdf';
 const [file]=await db.query("INSERT INTO ArquivosMateriais(storage_name,original_name,mime_type,size_bytes,sha256,id_usuario_upload) VALUES(?,'fictional.pdf','application/pdf',?,?,?)",[material,bytes.length,hash,teacher.insertId]);
 await db.query("INSERT INTO Conteudos(id_turma,titulo,tipo,ordem,id_arquivo_material) VALUES(?,'Fictional material','PDF',1,?)",[klass.insertId,file.insertId]);
 await db.query("INSERT INTO Certificados(id_aluno,id_turma,codigo_publico,aluno_nome,curso_nome,turma_nome,carga_horaria,sha256,storage_name,tamanho_bytes,id_usuario_emissor) VALUES(?,?,'CERT-00000000-00000000-00000000-00000001','Fictional Student','Fictional Course','Fictional Class',6,?,?,?,?)",[student.insertId,klass.insertId,hash,certificate,bytes.length,teacher.insertId]);
 for(const [root,name] of [[process.env.MATERIAL_STORAGE_DIR,material],[process.env.CERTIFICATE_STORAGE_DIR,certificate]]){
  fs.chmodSync(root,0o700);fs.writeFileSync(root+'/'+name,bytes,{mode:0o600});
 }
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1}).finally(()=>db.end());
'''.replace('PDF_BASE64', pdf_base64)
        cls.compose('run', '--rm', '--no-deps', '-T', 'app', 'node', '-', input=seed.encode(), timeout=40)
        cls.backup_id = 'backup-20261103T120000Z-' + str(__import__('uuid').uuid4())
        cls.backup = cls.directory / cls.backup_id
        cls.backup.mkdir(mode=0o700)
        # Save a real logical dump and both fixture volumes, in exactly the production backup format.
        dump = cls.compose('exec', '-T', 'db', 'sh', '-c',
                           'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --no-tablespaces "$MYSQL_DATABASE"').stdout
        (cls.backup / 'database.sql.gz').write_bytes(__import__('gzip').compress(dump))
        metadata = cls.compose('run', '--rm', '--no-deps', '-T', 'app', 'node', 'scripts/capture_backup_metadata.js').stdout
        (cls.backup / 'database-metadata.json').write_bytes(metadata)
        for namespace, mount in [('materials', '/app/storage/materials'), ('certificates', '/app/storage/certificates')]:
            destination = cls.backup / 'storage' / namespace
            destination.mkdir(parents=True, mode=0o700)
            content = cls.compose('run', '--rm', '--no-deps', '-T', 'app', 'tar', '-C', mount, '-cf', '-', '.').stdout
            archive = cls.directory / (namespace + '.tar')
            archive.write_bytes(content)
            with tarfile.open(archive) as packed:
                packed.extractall(destination, filter='data')
        manifest_script = r'''
const core=require('./scripts/lib/backup-core');
(async()=>{const dir=process.argv[1];await core.createManifest(dir,{backupId:process.argv[2],createdAt:new Date().toISOString(),metadataFile:dir+'/database-metadata.json',appCommit:'1d4111ebc6933f491da68ba990a114ee89aa8709',workingTreeDirty:true});await core.writeChecksums(dir);await core.markComplete(dir)})().catch(e=>{console.error(e);process.exitCode=1});
'''
        cls.run_cli(['node', '-e', manifest_script, str(cls.backup), cls.backup_id], timeout=20)
        cls.archive = cls.directory / 'package.tar.gz'
        with tarfile.open(cls.archive, 'w:gz') as packed:
            packed.add(cls.backup, arcname=cls.backup_id)
        (cls.directory / 'pointer.json').write_text(json.dumps({'format_version': 1, 'backup_id': cls.backup_id}))
        (cls.directory / 'complete.json').write_text(json.dumps({'status': 'COMPLETE', 'backup_id': cls.backup_id,
                                                               'package_sha256': hashlib.sha256(cls.archive.read_bytes()).hexdigest()}))
        cls.sentinel = 'goal19-fictional-permanent-' + secrets.token_hex(8)
        cls.run_cli(['docker', 'volume', 'create', '--label', 'io.plataforma.goal19.fixture=true', cls.sentinel])
        cls.addClassCleanup(lambda: cls.run_cli(['docker', 'volume', 'rm', cls.sentinel]))
        cls.run_cli(['docker', 'run', '--rm', '--network', 'none', '-v', cls.sentinel + ':/sentinel',
                 'alpine:3.18', 'sh', '-c', 'printf "GOAL19 fictional permanent sentinel\\n" > /sentinel/keep; chmod 600 /sentinel/keep'])
        cls.before_hash = cls.sentinel_hash()
        cls.fake_bin = cls.directory / 'bin'
        cls.fake_bin.mkdir()
        cls.real_docker = shutil.which('docker')
        (cls.fake_bin / 'az').write_text('''#!/usr/bin/env python3
import os,sys,shutil
from pathlib import Path
a=sys.argv[1:];root=Path(os.environ['GOAL19_FIXTURE_DIR'])
if a[:2]==['account','show']:sys.exit(0)
if a[:3]==['storage','container','show']:print('None');sys.exit(0)
if a[:3]==['storage','blob','download']:
 name=a[a.index('--name')+1];destination=a[a.index('--file')+1]
 source='pointer.json' if name.endswith('/latest-good.json') else 'complete.json' if name.endswith('/complete.json') else 'package.tar.gz'
 shutil.copyfile(root/source,destination);sys.exit(0)
sys.exit(91)
''')
        (cls.fake_bin / 'docker').write_text('''#!/usr/bin/env python3
import os,sys,json,subprocess,time
from pathlib import Path
a=sys.argv[1:]
with open(os.environ['GOAL19_CALL_LOG'],'a') as f:f.write(json.dumps(a)+'\\n')
status=subprocess.run([os.environ['GOAL19_REAL_DOCKER'],*a]).returncode
if status==0 and os.environ.get('GOAL19_BLOCK_VERIFIER')=='1' and 'run' in a and 'scripts/backup_manifest.js' in a:
 Path(os.environ['GOAL19_BARRIER']).write_text(os.environ['COMPOSE_PROJECT_NAME'])
 while True:time.sleep(.1)
sys.exit(status)
''')
        for entry in cls.fake_bin.iterdir():
            entry.chmod(0o700)
        cls.results = []
        cls.addClassCleanup(cls.write_evidence)

    @classmethod
    def cleanup_source(cls):
        cls.run_cli(['python3', str(HELPER), 'cleanup', '--project', cls.source_project,
                 '--snapshot', str(cls.source_config)], timeout=40)

    @classmethod
    def sentinel_hash(cls):
        return cls.run_cli(['docker', 'run', '--rm', '--network', 'none', '-v', cls.sentinel + ':/sentinel:ro',
                        'alpine:3.18', 'sha256sum', '/sentinel/keep']).stdout.decode().split()[0]

    @classmethod
    def write_evidence(cls):
        file = os.environ.get('GOAL19_EVIDENCE_FILE')
        if file:
            Path(file).write_text(json.dumps({'date': '2026-11-03', 'fixture': 'synthetic MySQL 8.4 schema 016, one material PDF, one certificate PDF',
                                             'source_project': cls.source_project, 'sentinel_volume': cls.sentinel,
                                             'sentinel_sha256_before': cls.before_hash, 'results': cls.results}, indent=2) + '\n')

    def exercise(self, label, failure=False, sent_signal=None):
        directory = self.directory / label
        directory.mkdir()
        command_log = directory / 'calls.jsonl'
        barrier = directory / 'barrier'
        env = {**self.env, 'PATH': f'{self.fake_bin}:{self.env["PATH"]}',
               'GOAL19_REAL_DOCKER': self.real_docker, 'GOAL19_FIXTURE_DIR': str(self.directory),
               'GOAL19_CALL_LOG': str(command_log), 'GOAL19_BARRIER': str(barrier),
               'GOAL19_BLOCK_VERIFIER': '1' if sent_signal else '0',
               'BACKUP_DRILL_DIR': str(directory / 'drills'),
               'RESTORE_DRILL_ENV_FILE': str(self.env_file), 'AZURE_STORAGE_ACCOUNT': 'goal19fixture',
               'RESTORE_FAILURE_INJECTION': 'mysql' if failure else ''}
        with (directory / 'output.log').open('w+') as output:
            process = subprocess.Popen(['bash', 'scripts/restore_drill.sh'], cwd=ROOT, env=env,
                                       stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
            try:
                if sent_signal:
                    deadline = time.monotonic() + 160
                    while not barrier.exists() and process.poll() is None and time.monotonic() < deadline:
                        time.sleep(.1)
                    self.assertTrue(barrier.exists(), 'Signal barrier not reached: ' + (directory / 'output.log').read_text()[-2500:])
                    # Signal the controller, not Docker or unrelated containers.
                    process.send_signal(sent_signal)
                status = process.wait(timeout=180)
            finally:
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=30)
            output.seek(0)
            log = output.read()
        expected = 130 if sent_signal == signal.SIGINT else 143 if sent_signal else 88 if failure else 0
        self.assertEqual(status, expected, log[-4500:])
        self.assertIn('RESTORE_ISOLATION_VALIDATED', log)
        self.assertIn('RESTORE_DRILL_TEMP_CLEANUP PASS', log)
        if not failure and not sent_signal:
            self.assertIn('RESTORE_VERIFIED', log)
            self.assertIn('RESTORE_SMOKE_OK mode=HEALTH_ONLY', log)
            self.assertIn('RESTORE_DRILL_GOOD', log)
        project = re.search(r'RESTORE_ISOLATION_VALIDATED project=(\S+)', log)[1]
        self.assertEqual(self.run_cli(['docker', 'ps', '-aq', '--filter', f'label=com.docker.compose.project={project}']).stdout, b'')
        for kind in ['volume', 'network']:
            self.assertEqual(self.run_cli(['docker', kind, 'ls', '-q', '--filter', f'label=com.docker.compose.project={project}']).stdout, b'')
        self.assertEqual(list((directory / 'drills').iterdir()), [])
        after_hash = self.sentinel_hash()
        self.assertEqual(after_hash, self.before_hash)
        self.results.append({'case': label, 'exit_code': status, 'project': project,
                             'cleanup': 'PASS', 'sentinel_sha256_after': after_hash,
                             'restore_verified': 'RESTORE_VERIFIED' in log})

    def test_01_successful_real_restore_and_cleanup(self):
        self.exercise('success')

    def test_02_restore_failure_and_cleanup(self):
        self.exercise('mysql-failure', failure=True)

    def test_03_sigint_cleanup_preserves_foreign_sentinel(self):
        self.exercise('sigint', sent_signal=signal.SIGINT)

    def test_04_sigterm_cleanup_preserves_foreign_sentinel(self):
        self.exercise('sigterm', sent_signal=signal.SIGTERM)

    def test_05_real_foreign_volume_and_bind_are_rejected_before_access(self):
        for kind in ['global', 'external', 'bind']:
            with self.subTest(kind=kind):
                directory = self.directory / ('unsafe-' + kind)
                directory.mkdir()
                override = directory / 'unsafe.yaml'
                config = (ROOT / 'compose.restore-drill.yaml').read_text()
                if kind in ['global', 'external']:
                    config += f'\nvolumes:\n  mysql_data:\n    name: {self.sentinel}\n'
                    if kind == 'external':
                        config += '    external: true\n'
                else:
                    # The bind contains only this test's fictional sentinel.
                    sentinel_dir = directory / 'foreign-bind'
                    sentinel_dir.mkdir()
                    (sentinel_dir / 'keep').write_text('GOAL19 fictional bind sentinel\n')
                    config = config.replace('- material_uploads:/app/storage/materials',
                                            f'- {sentinel_dir}:/app/storage/materials')
                override.write_text(config)
                env = {**self.env, 'BACKUP_DRILL_DIR': str(directory / 'drills'),
                       'RESTORE_DRILL_ENV_FILE': str(self.env_file), 'RESTORE_DRILL_OVERRIDE_FILE': str(override)}
                result = subprocess.run(['bash', 'scripts/restore_drill.sh'], cwd=ROOT, env=env,
                                        capture_output=True, text=True, timeout=20)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('RESTORE_ISOLATION_REJECTED', result.stderr)
                self.assertNotIn('RESTORE_ISOLATION_VALIDATED', result.stdout)
                self.assertEqual(self.sentinel_hash(), self.before_hash)
                if kind == 'bind':
                    self.assertEqual((sentinel_dir / 'keep').read_text(), 'GOAL19 fictional bind sentinel\n')
                self.results.append({'case': 'unsafe-' + kind, 'rejected_before_mutation': True,
                                     'sentinel_sha256_after': self.before_hash})


if __name__ == '__main__':
    unittest.main()
