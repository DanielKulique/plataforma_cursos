#!/usr/bin/env python3
"""Fail-closed validation and ownership-scoped cleanup for disposable restores.

No daemon mutations during prepare/check. The frozen Compose model is private and
is shared by the drill, downloader and restore instead of re-reading overrides.
"""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys


RUN_LABEL = 'io.plataforma.restore.run'
PROJECT_LABEL = 'com.docker.compose.project'
PROJECT_PATTERN = re.compile(r'plataforma-restore-[0-9]{8}t[0-9]{6}z-([a-f0-9]{16})')
VOLUME_KEYS = {'mysql_data', 'material_uploads', 'certificate_uploads', 'caddy_data', 'caddy_config'}
MOUNTS = {'db': {'/var/lib/mysql': 'mysql_data'}, 'app': {
    '/app/storage/materials': 'material_uploads',
    '/app/storage/certificates': 'certificate_uploads',
}}


class UnsafeRestore(Exception):
    pass


def require(condition, message):
    if not condition:
        raise UnsafeRestore(message)


def docker(*args, absent_ok=False):
    result = subprocess.run(['docker', *args], capture_output=True, text=True, check=False)
    if result.returncode:
        # Only a definite absence is safe. Connection/permission errors are failures.
        if absent_ok and re.search(r'no such (?:volume|network|object|image|container)|network .+ not found',
                                   result.stderr, re.IGNORECASE):
            return None
        raise UnsafeRestore('Docker diagnostic/operation failed: ' + ' '.join(args[:2]))
    return result.stdout


def inspect(kind, name):
    args = ('inspect', name) if kind == 'container' else (kind, 'inspect', name)
    output = docker(*args, absent_ok=True)
    return json.loads(output)[0] if output is not None else None


def labels(resource, kind):
    return (resource.get('Config', {}) if kind in ('container', 'image') else resource).get('Labels') or {}


def validate(config, project, frozen=False):
    match = PROJECT_PATTERN.fullmatch(project)
    require(match, 'Project must be a unique plataforma-restore timestamp/random run.')
    require(config.get('name') == project, 'Resolved project differs from restore project.')
    require(not config.get('configs') and not config.get('secrets'), 'File configs/secrets are not allowed in isolated restores.')
    require(set(config.get('services', {})) == {'app', 'db'}, 'Only app/db services are allowed.')
    volumes = config.get('volumes', {})
    require({'mysql_data', 'material_uploads', 'certificate_uploads'} <= set(volumes) <= VOLUME_KEYS,
            'Unexpected or missing restore volumes.')
    for key, volume in volumes.items():
        require(not volume.get('external'), 'External volume rejected: ' + key)
        require(volume.get('name') == f'{project}_{key}', 'Global/aliased volume name rejected: ' + key)
        require(volume.get('driver', 'local') == 'local' and not volume.get('driver_opts'),
                'Volume drivers/options can alias persistent storage: ' + key)
        if frozen:
            require((volume.get('labels') or {}).get(RUN_LABEL) == match[1], 'Missing volume ownership label.')
    networks = config.get('networks', {})
    require(set(networks) == {'backend'}, 'Only the isolated backend network is allowed.')
    for key, network in networks.items():
        require(not network.get('external') and network.get('name') == f'{project}_{key}',
                'External/global network rejected.')
        require(network.get('driver', 'bridge') == 'bridge' and not network.get('driver_opts')
                and network.get('internal') is True, 'Restore network must be a private internal bridge.')
        require(not network.get('ipam'), 'Custom network address configuration rejected.')
        if frozen:
            require((network.get('labels') or {}).get(RUN_LABEL) == match[1], 'Missing network ownership label.')
    for name, service in config['services'].items():
        for field in ('container_name', 'volumes_from', 'network_mode', 'pid', 'ipc', 'uts',
                      'devices', 'device_requests', 'privileged', 'cap_add', 'extra_hosts',
                      'ports', 'configs', 'secrets', 'develop', 'post_start', 'pre_stop'):
            require(not service.get(field), 'Unsafe service option rejected: ' + name + '.' + field)
        require(set(service.get('networks', {})) == {'backend'}, 'Service outside isolated network.')
        mounts = service.get('volumes', [])
        require(len(mounts) == len(MOUNTS[name]), 'Unexpected/missing mounts: ' + name)
        observed = set()
        for mount in mounts:
            target = mount.get('target')
            require(mount.get('type') == 'volume' and MOUNTS[name].get(target) == mount.get('source'),
                    'Bind/anonymous/unexpected mount rejected: ' + name)
            require(target not in observed and not mount.get('subpath') and not mount.get('volume', {}).get('subpath'),
                    'Duplicate/subpath mount rejected.')
            observed.add(target)
        environment = service.get('environment') or {}
        if name == 'app':
            require(environment.get('DB_HOST') == 'db' and str(environment.get('DB_PORT')) == '3306',
                    'Restore app must use its own db service.')
            require(str(environment.get('EMAIL_DELIVERY_ENABLED')).lower() == 'false'
                    and str(environment.get('DETECTOR_ENABLED')).lower() == 'false',
                    'External delivery/analysis must stay disabled.')
            require(environment.get('MATERIAL_STORAGE_DIR') == '/app/storage/materials'
                    and environment.get('CERTIFICATE_STORAGE_DIR') == '/app/storage/certificates',
                    'Storage paths differ from isolated mounts.')
            require(service.get('build'), 'App must be built from the reviewed repository.')
            require(not service.get('image') or service['image'] == f'{project}-app:latest',
                    'Shared app image tag rejected.')
            build = service['build']
            require(Path(build['context']).resolve() == Path(__file__).resolve().parents[2]
                    and build.get('dockerfile', 'Dockerfile') == 'Dockerfile'
                    and not build.get('additional_contexts') and not build.get('entitlements')
                    and not build.get('ssh') and not build.get('secrets'), 'Unexpected app build context/options.')
        if frozen:
            require((service.get('labels') or {}).get(RUN_LABEL) == match[1], 'Missing container ownership label.')
    return match[1]


def resources(config, project, fresh=False):
    """Inspect only the random run namespace; never follow a rejected alias."""
    token = validate(config, project, frozen=True)
    found = {'container': [], 'volume': [], 'network': [], 'image': []}
    ids = docker('ps', '-aq', '--filter', f'label={PROJECT_LABEL}={project}').split()
    for identifier in ids:
        item = inspect('container', identifier)
        require(item is not None, 'Container disappeared during ownership check; retry diagnosis.')
        owner = labels(item, 'container')
        require(owner.get(PROJECT_LABEL) == project and owner.get(RUN_LABEL) == token
                and owner.get('com.docker.compose.service') in config['services'],
                'Foreign container in restore project; refusing reuse/cleanup.')
        found['container'].append(item['Id'])
    for kind, entries in [('volume', config['volumes']), ('network', config['networks'])]:
        # Catch orphan resources too: cleanup never uses a broad --remove-orphans.
        listed = docker(kind, 'ls', '--format', '{{.Name}}', '--filter', f'label={PROJECT_LABEL}={project}').split()
        expected = {entry['name'] for entry in entries.values()}
        require(set(listed) <= expected, 'Unexpected resource in restore project: ' + kind)
        for name in sorted(expected):
            item = inspect(kind, name)
            if item is None:
                continue
            owner = labels(item, kind)
            require(owner.get(PROJECT_LABEL) == project and owner.get(RUN_LABEL) == token,
                    'Existing resource is not owned by this run: ' + name)
            found[kind].append(name)
    image = inspect('image', f'{project}-app:latest')
    if image is not None:
        owner = labels(image, 'image')
        require(owner.get(PROJECT_LABEL) == project and owner.get(RUN_LABEL) == token,
                'Shared/unowned app image; refusing reuse/cleanup.')
        found['image'].append(image['Id'])
    if fresh:
        require(not any(found.values()), 'Restore project must start without existing resources.')
    return found


def load_snapshot(file, project):
    path = Path(file)
    stat = path.lstat()
    require(not path.is_symlink() and path.is_file() and stat.st_uid == os.getuid()
            and stat.st_mode & 0o777 == 0o600, 'Snapshot must be an owned regular file with mode 0600.')
    config = json.loads(path.read_text())
    validate(config, project, frozen=True)
    return config


def prepare(config, project, destination):
    token = validate(config, project)
    for entries in (config['volumes'], config['networks'], config['services']):
        for entry in entries.values():
            entry.setdefault('labels', {})[RUN_LABEL] = token
    app = config['services']['app']
    app['image'] = f'{project}-app:latest'
    app['build'].setdefault('labels', {}).update({RUN_LABEL: token, PROJECT_LABEL: project})
    resources(config, project, fresh=True)
    # JSON is valid Compose YAML. `compose config` already escapes literal dollars
    # for re-use; do not interpolate or double-escape its serialized values again.
    fd = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, 'w') as stream:
        json.dump(config, stream)
        stream.write('\n')


def cleanup(config, project):
    owned = resources(config, project)
    # Check every owner before the first deletion. Delete exact IDs/names, no prune/down.
    for identifier in owned['container']:
        docker('rm', '-f', identifier)
    for kind in ('volume', 'network'):
        for name in owned[kind]:
            docker(kind, 'rm', name)
    for identifier in owned['image']:
        docker('image', 'rm', identifier)
    remaining = resources(config, project)
    require(not any(remaining.values()), 'Disposable resources remain after cleanup.')


def backup_path(snapshot, candidate, destination=False):
    """The only additional bind is a read-only download inside this run's workspace."""
    downloads = Path(snapshot).absolute().parent / 'downloads'
    path = Path(candidate).absolute()
    require(downloads.resolve() == downloads and not downloads.is_symlink(), 'Download workspace is aliased.')
    require(path.resolve() == path and path.is_dir(), 'Backup path is missing or uses a symlink/alias.')
    if destination:
        require(path == downloads, 'Download destination must be this run\'s private workspace.')
    else:
        require(downloads in path.parents and re.fullmatch(r'backup-[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}', path.name),
                'Read-only backup bind must remain inside this run\'s private download workspace.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['prepare', 'check', 'cleanup', 'backup-path', 'download-path'])
    parser.add_argument('--project', required=True)
    parser.add_argument('--snapshot', required=True)
    parser.add_argument('--path')
    args = parser.parse_args()
    require(not os.environ.get('DOCKER_HOST') and not os.environ.get('DOCKER_CONTEXT'),
            'Isolated restores require the local default Docker context.')
    endpoint = docker('context', 'inspect', 'default', '--format', '{{(index .Endpoints "docker").Host}}').strip()
    require(docker('context', 'show').strip() == 'default' and endpoint.startswith('unix://'),
            'Isolated restores require the local default Unix socket.')
    if args.action == 'prepare':
        prepare(json.load(sys.stdin), args.project, args.snapshot)
    else:
        config = load_snapshot(args.snapshot, args.project)
        if args.action in ('backup-path', 'download-path'):
            require(args.path, 'Missing backup/download path.')
            backup_path(args.snapshot, args.path, destination=args.action == 'download-path')
        elif args.action == 'cleanup':
            cleanup(config, args.project)
        else:
            resources(config, args.project)


if __name__ == '__main__':
    try:
        main()
    except (UnsafeRestore, OSError, ValueError, KeyError, TypeError) as error:
        print('RESTORE_ISOLATION_REJECTED: ' + str(error), file=sys.stderr)
        sys.exit(1)
