"""Run legacy-named smokes only in a newly created disposable Docker project."""
import argparse
import json
from pathlib import Path
import secrets
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-lab-writes', action='store_true', required=True)
    parser.parse_args()
    project = 'goal24-smoke-' + secrets.token_hex(8)
    credentials = '\n'.join([
        'BASIC_AUTH_USER=synthetic-lab', 'BASIC_AUTH_PASSWORD=synthetic-lab-only',
        'ADMIN_EMAIL=admin.e2e@example.test', 'ADMIN_PASSWORD=E2e-only-password-42!',
        'PROFESSOR_EMAIL=professor.e2e@example.test', 'DEMO_PASSWORD=E2e-only-password-42!',
        'ALUNO_EMAIL=aluno.e2e@example.test', 'UNENROLLED_EMAIL=aluno2.e2e@example.test'
    ]) + '\n'
    with tempfile.TemporaryDirectory(prefix='goal24-smoke-config-') as directory:
        config = Path(directory) / 'lab.json'
        compose = ['docker', 'compose', '--project-name', project, '--file', str(ROOT / 'compose.e2e.yaml'), '--file', str(config)]
        def run(*args, input=None, check=True):
            result = subprocess.run([*compose, *args], cwd=ROOT, input=input, text=True,
                                    capture_output=True, timeout=180)
            print(result.stdout, end='')
            if result.stderr:
                print(result.stderr, end='')
            if check and result.returncode:
                raise RuntimeError(f'Lab command failed with code {result.returncode}.')
            return result

        def configure(required, delivery):
            env = {
                'APP_ENV': 'test', 'APP_BASE_URL': 'http://app:3000',
                'STAGING_BASE_URL': 'http://app:3000', 'SMOKE_CREDENTIALS_STDIN': '1',
                'SMOKE_LAB_PROJECT': project, 'SMOKE_LAB_AUTHORIZATION': 'I_AUTHORIZE_DISPOSABLE_SMOKES',
                'EMAIL_DELIVERY_ENABLED': str(delivery).lower(),
                'PUBLIC_REGISTRATION_EMAIL_VERIFICATION_REQUIRED': str(required).lower(),
                'EMAIL_CODE_SEND_IP_RATE_LIMIT_MAX': '1000', 'EMAIL_CODE_SEND_IDENTITY_RATE_LIMIT_MAX': '5',
                'EMAIL_CODE_VERIFY_IP_RATE_LIMIT_MAX': '1000', 'EMAIL_CODE_VERIFY_IDENTITY_RATE_LIMIT_MAX': '10'
            }
            config.write_text(json.dumps({'services': {'app': {'environment': env}}, 'networks': {'e2e': {'internal': True}}}))

        def ready():
            container = subprocess.check_output([*compose, 'ps', '--quiet', 'app'], cwd=ROOT, text=True, timeout=30).strip()
            deadline = time.monotonic() + 60
            while time.monotonic() < deadline:
                health = subprocess.check_output(['docker', 'inspect', '--format', '{{.State.Health.Status}}', container], text=True, timeout=10).strip()
                if health == 'healthy':
                    return
                if health == 'unhealthy':
                    raise RuntimeError('Disposable application healthcheck failed.')
                time.sleep(0.25)
            raise RuntimeError('Disposable application readiness failed.')

        configure(False, False)
        completed = []
        try:
            run('up', '--detach', 'db')
            run('run', '--rm', 'migrate', 'node', 'scripts/migrate_database.js')
            run('run', '--rm', 'migrate', 'node', 'scripts/seed_e2e_database.js')
            for required, delivery in [(False, False), (False, True), (True, False), (True, True)]:
                configure(required, delivery)
                run('up', *(['--build'] if not completed else []), '--detach', '--force-recreate', 'app')
                ready()
                scripts = ['smoke_identity_email_staging.js']
                if not required and not delivery:
                    scripts = ['smoke_academic_completion_staging.js', 'smoke_enrollment_lifecycle_staging.js',
                               'smoke_certificate_versioning_staging.js', *scripts]
                for script in scripts:
                    run('exec', '-T', 'app', 'node', 'scripts/' + script, input=credentials)
                    completed.append({'script': script, 'verification_required': required, 'delivery_enabled': delivery, 'result': 'PASS'})
            print(json.dumps({'status': 'ACADEMIC_SMOKES_PASS', 'project': project, 'cases': completed}))
        except Exception:
            run('logs', '--no-color', '--timestamps', 'app', 'db', check=False)
            raise
        finally:
            run('down', '--volumes', '--remove-orphans')
            print(json.dumps({'project': project, 'cleanup': 'PASS'}))


if __name__ == '__main__':
    main()
