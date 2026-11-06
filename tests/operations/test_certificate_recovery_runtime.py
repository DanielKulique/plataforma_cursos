"""Exercise the production image with a new, private MySQL lab only.

python3 tests/operations/test_certificate_recovery_runtime.py \
    --image <built-image> --allow-lab-apply
"""

import argparse
import json
from pathlib import Path
import secrets
import subprocess
import time


ROOT = Path(__file__).resolve().parents[2]


def docker(*args, check=True):
    result = subprocess.run(['docker', *args], cwd=ROOT, text=True,
                            capture_output=True, check=False, timeout=180)
    if check and result.returncode:
        raise RuntimeError(f'Docker command failed: {result.stdout}\n{result.stderr}')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--image', required=True)
    parser.add_argument('--allow-lab-apply', action='store_true', required=True,
                        help='Authorize APPLY on this newly created synthetic lab only.')
    args = parser.parse_args()
    image = json.loads(docker('image', 'inspect', args.image).stdout)[0]['Id']
    project = 'certificate-recovery-lab-' + secrets.token_hex(8)
    database = project + '-db'
    fixture_container = project + '-fixture'
    migration_container = project + '-migrate'
    owner = 'certificate-recovery-lab=' + project
    environment = {
        'NODE_ENV': 'test', 'DB_HOST': 'db', 'DB_PORT': '3306',
        'DB_NAME': 'plataforma_cursos_test', 'DB_ENVIRONMENT_IDENTITY': 'plataforma_cursos_test',
        'DB_USER': 'lab', 'DB_PASSWORD': 'synthetic-lab-password-only',
        'JWT_SECRET': 'synthetic-lab-jwt-secret-never-used-outside-this-test',
        'APP_BASE_URL': 'http://certificate-recovery.example.test',
        'CERTIFICATE_STORAGE_DIR': '/tmp/plataforma-cursos-e2e/certificates',
        'MATERIAL_STORAGE_DIR': '/tmp/plataforma-cursos-e2e/materials',
        'EMAIL_DELIVERY_ENABLED': 'false', 'DETECTOR_ENABLED': 'false'
    }
    run_args = ['run', '--rm', '--network', project, '--label', owner]
    for key, value in environment.items():
        run_args.extend(['--env', f'{key}={value}'])
    try:
        docker('network', 'create', '--internal', '--label', owner, project)
        docker('run', '--detach', '--name', database, '--label', owner,
               '--network', project, '--network-alias', 'db',
               '--env', 'MYSQL_DATABASE=plataforma_cursos_test',
               '--env', 'MYSQL_USER=lab', '--env', 'MYSQL_PASSWORD=synthetic-lab-password-only',
               '--env', 'MYSQL_ROOT_PASSWORD=synthetic-root-password-only',
               '--health-cmd', 'mysqladmin ping -h 127.0.0.1 -uroot -psynthetic-root-password-only --silent',
               '--health-interval', '2s', '--health-timeout', '2s', '--health-retries', '45',
               'mysql:8.4')
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            state = json.loads(docker('inspect', database).stdout)[0]['State']
            if state.get('Health', {}).get('Status') == 'healthy':
                break
            if not state['Running'] or state.get('Health', {}).get('Status') == 'unhealthy':
                raise RuntimeError('Disposable MySQL failed readiness.')
            time.sleep(0.5)
        else:
            raise RuntimeError('Disposable MySQL readiness timeout.')
        migration = docker(*run_args, '--name', migration_container, image,
                           'node', 'scripts/migrate_database.js')
        print(migration.stdout, end='')
        fixture = ROOT / 'tests/operations/certificate_recovery_runtime.fixture.js'
        result = docker(*run_args, '--name', fixture_container,
                        '--mount', f'type=bind,source={fixture},target=/app/certificate-recovery-runtime.fixture.js,readonly',
                        image, 'node', 'certificate-recovery-runtime.fixture.js', '--allow-lab-apply')
        print(result.stdout, end='')
        print(json.dumps({'image_id': image, 'project': project, 'result': 'PASS'}))
    except Exception:
        print(docker('logs', database, check=False).stdout)
        raise
    finally:
        # Only exact names created above; never a broad prune or shared Compose cleanup.
        for name in (fixture_container, migration_container, database):
            docker('rm', '--force', '--volumes', name, check=False)
        docker('network', 'rm', project, check=False)
        for kind, command in [('containers', ['ps', '-aq']), ('volumes', ['volume', 'ls', '-q']),
                              ('networks', ['network', 'ls', '-q'])]:
            if docker(*command, '--filter', 'label=' + owner).stdout.strip():
                raise RuntimeError(f'Lab cleanup left {kind}.')
        print(json.dumps({'project': project, 'cleanup': 'PASS'}))


if __name__ == '__main__':
    main()
