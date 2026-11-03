"""Resolved Compose and fail-closed entrypoint tests, using only synthetic names."""

import copy
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import signal
import unittest
from unittest import mock


ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / 'scripts/lib/restore-isolation.py'
SPEC = importlib.util.spec_from_file_location('restore_isolation', HELPER)
isolation = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(isolation)
PROJECT = 'plataforma-restore-20261103t120000z-1234567890abcdef'
ENVIRONMENT = {
    'APP_ENV': 'staging', 'DB_NAME': 'plataforma_cursos_staging',
    'DB_ENVIRONMENT_IDENTITY': 'plataforma_cursos_staging', 'DB_USER': 'fixture',
    'DB_PASSWORD': 'fictional-$literal-password', 'MYSQL_ROOT_PASSWORD': 'fixture-root',
    'JWT_SECRET': 'fictional-only-jwt-secret-01234567890123456789',
    'APP_BASE_URL': 'https://fixture.invalid', 'APP_DOMAIN': 'fixture.invalid',
    'APP_NAME': 'GOAL19 fixture', 'CORS_ORIGIN': 'https://fixture.invalid',
    'RESEND_API_KEY': '', 'MAIL_FROM': 'fixture@example.test',
}


def resolved(env_file, override=None, project=PROJECT):
    args = ['docker', 'compose', '--project-name', project, '--env-file', str(env_file),
            '-f', 'compose.yaml', '-f', 'compose.restore-drill.yaml']
    if override:
        args += ['-f', str(override)]
    result = subprocess.run(args + ['config', '--format', 'json'], cwd=ROOT,
                            capture_output=True, text=True, check=True,
                            env={key: value for key, value in os.environ.items()
                                 if key not in {'COMPOSE_FILE', 'COMPOSE_PROJECT_NAME', 'COMPOSE_PROFILES', *ENVIRONMENT}})
    return json.loads(result.stdout)


class RestoreConfigurationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix='goal19-config-')
        cls.directory = Path(cls.temp.name)
        cls.env_file = cls.directory / 'fixture.env'
        cls.env_file.write_text('\n'.join(f"{key}='{value}'" for key, value in ENVIRONMENT.items()) + '\n')
        cls.config = resolved(cls.env_file)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_resolved_default_has_private_volumes_no_binds_no_public_ports(self):
        self.assertEqual(isolation.validate(self.config, PROJECT), '1234567890abcdef')
        self.assertEqual(set(self.config['services']), {'app', 'db'})
        self.assertTrue(self.config['networks']['backend']['internal'])

    def test_rejects_global_and_prefix_lookalike_names(self):
        for name in ['goal19-fictional-permanent-volume', f'{PROJECT}_foreign_alias']:
            with self.subTest(name=name):
                config = copy.deepcopy(self.config)
                config['volumes']['mysql_data']['name'] = name
                with self.assertRaisesRegex(isolation.UnsafeRestore, 'Global/aliased'):
                    isolation.validate(config, PROJECT)

    def test_rejects_external_even_with_expected_name(self):
        config = copy.deepcopy(self.config)
        config['volumes']['mysql_data']['external'] = True
        with self.assertRaisesRegex(isolation.UnsafeRestore, 'External volume'):
            isolation.validate(config, PROJECT)

    def test_rejects_bind_mount_including_read_only(self):
        for readonly in [False, True]:
            with self.subTest(readonly=readonly):
                config = copy.deepcopy(self.config)
                config['services']['app']['volumes'][0] = {
                    'type': 'bind', 'source': '/tmp/goal19-fictional-permanent',
                    'target': '/app/storage/materials', 'read_only': readonly}
                with self.assertRaisesRegex(isolation.UnsafeRestore, 'Bind/anonymous'):
                    isolation.validate(config, PROJECT)

    def test_rejects_local_driver_bind_alias(self):
        config = copy.deepcopy(self.config)
        config['volumes']['mysql_data']['driver_opts'] = {
            'type': 'none', 'o': 'bind', 'device': '/tmp/goal19-fictional-permanent'}
        with self.assertRaisesRegex(isolation.UnsafeRestore, 'drivers/options'):
            isolation.validate(config, PROJECT)

    def test_rejects_remote_network_and_database(self):
        for field in ['external', 'database', 'ports', 'host-network', 'configs']:
            with self.subTest(field=field):
                config = copy.deepcopy(self.config)
                if field == 'external':
                    config['networks']['backend']['external'] = True
                elif field == 'database':
                    config['services']['app']['environment']['DB_HOST'] = 'fictional-live-db'
                elif field == 'ports':
                    config['services']['db']['ports'] = [{'target': 3306, 'published': '33307'}]
                elif field == 'host-network':
                    config['services']['db']['network_mode'] = 'host'
                else:
                    config['configs'] = {'foreign': {'file': '/tmp/fictional'}}
                with self.assertRaises(isolation.UnsafeRestore):
                    isolation.validate(config, PROJECT)

    def fake_docker(self, *args, **_kwargs):
        if args[0] in {'ps', 'volume', 'network'} and ('inspect' not in args):
            return ''
        if 'inspect' in args:
            return None
        raise AssertionError('Unexpected/mutating command: ' + repr(args))

    def test_preexisting_namespace_is_rejected_and_not_cleaned(self):
        config = copy.deepcopy(self.config)
        for entries in [config['volumes'], config['networks'], config['services']]:
            for entry in entries.values():
                entry.setdefault('labels', {})[isolation.RUN_LABEL] = '1234567890abcdef'
        with mock.patch.object(isolation, 'docker', side_effect=self.fake_docker), \
                mock.patch.object(isolation, 'inspect', return_value={'Labels': {}}):
            with self.assertRaisesRegex(isolation.UnsafeRestore, 'not owned'):
                isolation.resources(config, PROJECT, fresh=True)

    def test_snapshot_is_private_and_preserves_literal_dollar(self):
        with tempfile.TemporaryDirectory(prefix='goal19-snapshot-') as directory:
            snapshot = Path(directory) / 'compose.json'
            with mock.patch.object(isolation, 'docker', side_effect=self.fake_docker):
                isolation.prepare(copy.deepcopy(self.config), PROJECT, snapshot)
            self.assertEqual(snapshot.stat().st_mode & 0o777, 0o600)
            isolation.load_snapshot(snapshot, PROJECT)
            result = subprocess.run(['docker', 'compose', '-f', str(snapshot), 'config', '--format', 'json'],
                                    cwd=ROOT, capture_output=True, text=True, check=True)
            actual = json.loads(result.stdout)['services']['app']['environment']['DB_PASSWORD']
            self.assertEqual(actual, self.config['services']['app']['environment']['DB_PASSWORD'])
            snapshot.chmod(0o644)
            with self.assertRaisesRegex(isolation.UnsafeRestore, '0600'):
                isolation.load_snapshot(snapshot, PROJECT)

    def test_cleanup_checks_every_owner_before_removing_any_container(self):
        config = copy.deepcopy(self.config)
        token = PROJECT.rsplit('-', 1)[1]
        for entries in [config['volumes'], config['networks'], config['services']]:
            for entry in entries.values():
                entry.setdefault('labels', {})[isolation.RUN_LABEL] = token

        def fake_docker(*args, **_kwargs):
            if args[0] == 'ps':
                return 'owned-container-id\n'
            if args[0] in ('volume', 'network') and args[1] == 'ls':
                return ''
            raise AssertionError('No mutation should be attempted: ' + repr(args))

        def fake_inspect(kind, _name):
            if kind == 'container':
                return {'Id': 'owned-container-id', 'Config': {'Labels': {
                    isolation.PROJECT_LABEL: PROJECT, isolation.RUN_LABEL: token,
                    'com.docker.compose.service': 'app'}}}
            return {'Labels': {isolation.PROJECT_LABEL: 'fictional-foreign-project'}}

        with mock.patch.object(isolation, 'docker', side_effect=fake_docker), \
                mock.patch.object(isolation, 'inspect', side_effect=fake_inspect):
            with self.assertRaisesRegex(isolation.UnsafeRestore, 'not owned'):
                isolation.cleanup(config, PROJECT)

    def test_unsafe_drill_rejects_before_any_mutating_docker_call(self):
        with tempfile.TemporaryDirectory(prefix='goal19-entry-') as directory:
            directory = Path(directory)
            override = directory / 'unsafe.yaml'
            override.write_text('volumes:\n  mysql_data:\n    name: goal19-fictional-permanent-volume\n')
            calls = directory / 'calls.jsonl'
            fake_bin = directory / 'bin'
            fake_bin.mkdir()
            real_docker = subprocess.check_output(['which', 'docker'], text=True).strip()
            wrapper = fake_bin / 'docker'
            wrapper.write_text('#!/usr/bin/env python3\nimport os,sys,json,subprocess\n'
                               'args=sys.argv[1:]\n'
                               'with open(os.environ["GOAL19_CALL_LOG"],"a") as f: f.write(json.dumps(args)+"\\n")\n'
                               'if "compose" in args and "config" in args:\n'
                               ' sys.exit(subprocess.run([os.environ["GOAL19_DOCKER"],*args]).returncode)\n'
                               'if args[:2]==["context","show"]: print("default"); sys.exit(0)\n'
                               'if args[:2]==["context","inspect"]: print("unix:///var/run/docker.sock"); sys.exit(0)\n'
                               'sys.exit(99)\n')
            wrapper.chmod(0o700)
            env = {**os.environ, 'PATH': f'{fake_bin}:{os.environ["PATH"]}',
                   'GOAL19_CALL_LOG': str(calls), 'GOAL19_DOCKER': real_docker,
                   'BACKUP_DRILL_DIR': str(directory / 'drills'),
                   'RESTORE_DRILL_ENV_FILE': str(self.env_file),
                   'RESTORE_DRILL_OVERRIDE_FILE': str(override)}
            # This override must also remove default binds, so use the real safe model
            # as the first override and put a dangerous alias into a standalone copy.
            override.write_text((ROOT / 'compose.restore-drill.yaml').read_text()
                                + '\nvolumes:\n  mysql_data:\n    name: goal19-fictional-permanent-volume\n')
            result = subprocess.run(['bash', 'scripts/restore_drill.sh'], cwd=ROOT, env=env,
                                    capture_output=True, text=True, timeout=20)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Global/aliased volume', result.stderr)
            self.assertIn('CLEANUP PASS', result.stdout)
            commands = [json.loads(line) for line in calls.read_text().splitlines()]
            self.assertTrue(all('config' in command or command[0] == 'context' for command in commands))
            self.assertEqual(list((directory / 'drills').iterdir()), [])

    def test_direct_isolated_restore_requires_owned_snapshot_before_verifier(self):
        env = {key: value for key, value in os.environ.items() if key != 'RESTORE_ISOLATION_CONFIG'}
        result = subprocess.run(['bash', 'scripts/restore_database.sh', '--mode', 'isolated',
                                 '--target', 'isolated-test', '--backup', '/nonexistent-goal19-fixture', '--apply'],
                                cwd=ROOT, env=env, capture_output=True, text=True, timeout=10)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('exige snapshot validado', result.stderr)
        self.assertNotIn('Target:', result.stdout)

    def test_subprocess_wrapper_preserves_regular_log_and_stdin(self):
        with tempfile.TemporaryDirectory(prefix='goal19-stdio-') as directory:
            log = Path(directory) / 'log'
            script = '''set -Eeuo pipefail
source scripts/lib/restore-isolation.sh
printf 'before\\n'
printf 'input\\n' > "$1"
restore_exec sh -c 'read -r line; printf "child:%s\\n" "$line"' < "$1"
printf 'after\\n'
'''
            with log.open('w') as output:
                subprocess.run(['bash', '-c', script, 'stdio-test', str(Path(directory) / 'input')],
                               cwd=ROOT, stdout=output, check=True)
            self.assertEqual(log.read_text(), 'before\nchild:input\nafter\n')

    def test_signal_cleanup_diagnostic_stays_on_controller_stdout(self):
        with tempfile.TemporaryDirectory(prefix='goal19-signal-') as directory:
            ready = Path(directory) / 'ready'
            script = '''set -Eeuo pipefail
source scripts/lib/restore-isolation.sh
trap 'echo cleanup' EXIT
trap 'restore_signal 143' TERM
restore_exec_to "$1" sh -c 'touch "$1"; sleep 30' child "$2"
'''
            process = subprocess.Popen(['bash', '-c', script, 'signal-test',
                                        str(Path(directory) / 'child-output'), str(ready)],
                                       cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                       text=True, start_new_session=True)
            try:
                deadline = time.monotonic() + 5
                while not ready.exists() and time.monotonic() < deadline:
                    time.sleep(.01)
                self.assertTrue(ready.exists())
                process.send_signal(signal.SIGTERM)
                output, _ = process.communicate(timeout=5)
                self.assertEqual(process.returncode, 143)
                self.assertEqual(output, 'cleanup\n')
            finally:
                if process.poll() is None:
                    process.kill()
                    process.wait()

    def test_backup_bind_cannot_escape_private_workspace_or_follow_symlinks(self):
        with tempfile.TemporaryDirectory(prefix='goal19-bind-') as directory:
            directory = Path(directory)
            downloads = directory / 'downloads'
            downloads.mkdir(mode=0o700)
            snapshot = directory / 'compose.json'
            bid = 'backup-20261103T120000Z-12345678-1234-1234-1234-123456789abc'
            private = downloads / bid
            private.mkdir()
            isolation.backup_path(snapshot, private)
            isolation.backup_path(snapshot, downloads, destination=True)
            foreign = directory / bid
            foreign.mkdir()
            with self.assertRaisesRegex(isolation.UnsafeRestore, 'private download'):
                isolation.backup_path(snapshot, foreign)
            private.rmdir()
            private.symlink_to(foreign, target_is_directory=True)
            with self.assertRaisesRegex(isolation.UnsafeRestore, 'symlink/alias'):
                isolation.backup_path(snapshot, private)


if __name__ == '__main__':
    unittest.main()
