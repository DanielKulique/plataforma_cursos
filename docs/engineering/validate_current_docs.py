#!/usr/bin/env python3
"""Check current documentation without importing the application or touching a DB.

Uses only Python's standard library. External URLs and historical source manifests
are deliberately not fetched or rewritten. Run from any working directory.
"""

from collections import Counter
import json
from pathlib import Path
import re
import sys
from urllib.parse import unquote


ROOT = Path(__file__).resolve().parents[2]
REQUIRED = [
    'README.md', 'docs/index.md',
    'docs/product/overview.md', 'docs/product/roles.md',
    'docs/product/business-rules.md', 'docs/product/certificates.md',
    'docs/architecture/overview.md', 'docs/architecture/backend.md',
    'docs/architecture/frontend.md', 'docs/architecture/database.md',
    'docs/getting-started/installation.md', 'docs/getting-started/local-development.md',
    'docs/getting-started/environment-variables.md', 'docs/api/overview.md',
    'docs/api/authentication.md', 'docs/database/schema.md',
    'docs/database/migrations.md', 'docs/security/overview.md',
    'docs/testing/overview.md', 'docs/operations/deployment.md',
    'docs/operations/backup-and-restore.md', 'docs/operations/monitoring.md',
    'docs/operations/troubleshooting.md', 'docs/adr/README.md',
    'docs/engineering/README.md', 'docs/engineering/goals/README.md',
    'docs/engineering/evidence/README.md', 'docs/engineering/PROJECT_CLEANUP_REPORT.md',
]
EXCLUDED = {'.git', 'node_modules', '.agents', '.deployments', '.azure-staging', 'storage'}


def prose(text):
    """Ignore fenced examples when checking headings and links."""
    lines = []
    fence = None
    for line in text.splitlines():
        match = re.match(r'^\s*(`{3,}|~{3,})', line)
        if match:
            marker = match[1]
            if fence is None:
                fence = marker
            elif marker[0] == fence[0] and len(marker) >= len(fence):
                fence = None
            continue
        if fence is None:
            lines.append(line)
    return '\n'.join(lines)


def anchors(text):
    result = set(re.findall(r'(?:id|name)=["\']([^"\']+)', text))
    seen = Counter()
    for heading in re.findall(r'^#{1,6}\s+(.+?)\s*#*$', prose(text), re.M):
        heading = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', heading)
        heading = re.sub(r'<[^>]+>', '', heading).lower()
        slug = re.sub(r'[^\w\- ]', '', heading).replace(' ', '-')
        suffix = '' if not seen[slug] else f'-{seen[slug]}'
        result.add(slug + suffix)
        seen[slug] += 1
    return result


def registered_routes():
    index = (ROOT / 'index.js').read_text()
    imports = dict(re.findall(
        r"const (\w+) = require\('\./(src/api/routes/[^']+)'\)", index))
    routes = {('GET', '/healthz'), ('GET', '/readyz')}
    for prefix, _, router in re.findall(
            r"app\.use\('([^']+)',\s*(?:(\w+),\s*)?(\w+)\);", index):
        if router not in imports:
            continue
        source = (ROOT / (imports[router] + '.js')).read_text()
        for method, path in re.findall(
                r"router\.(get|post|put|patch|delete)\(\s*'([^']+)'", source):
            routes.add((method.upper(), prefix + ('' if path == '/' else path)))
    return routes


def main():
    errors = []
    paths = [ROOT / 'README.md'] + sorted((ROOT / 'docs').rglob('*.md'))
    paths += sorted((ROOT / 'src').rglob('*.md'))
    paths = [p for p in paths if not EXCLUDED.intersection(p.relative_to(ROOT).parts)]
    texts = {p: p.read_text() for p in paths}
    count = 0
    for required in REQUIRED:
        path = ROOT / required
        if not path.is_file() or len(path.read_text().strip()) < 100:
            errors.append(f'Missing or empty document: {required}')
    for path, text in texts.items():
        clean = prose(text)
        targets = re.findall(r'!?\[[^\]]*\]\((<[^>]+>|[^)]+)\)', clean)
        targets += re.findall(r'^\s*\[[^\]]+\]:\s*(\S+)', clean, re.M)
        for target in targets:
            target = re.sub(r'\s+["\'].*$', '', target).strip('<>')
            if re.match(r'^[a-zA-Z][\w+.-]*:', target) or target.startswith('//'):
                continue
            raw, _, fragment = unquote(target).partition('#')
            raw = raw.split('?')[0]
            destination = (path.parent / raw).resolve() if raw else path
            count += 1
            if not destination.exists():
                errors.append(f'Missing link: {path.relative_to(ROOT)} -> {target}')
            elif fragment and destination.suffix == '.md':
                content = texts.get(destination)
                if content is None:
                    content = destination.read_text()
                if fragment not in anchors(content):
                    errors.append(f'Missing anchor: {path.relative_to(ROOT)} -> {target}')
    api = ROOT / 'docs/api/overview.md'
    documented = set(re.findall(
        r'^\| (GET|POST|PUT|PATCH|DELETE) \| `([^`]+)`', api.read_text(), re.M))
    actual = registered_routes()
    for method, route in sorted(actual - documented):
        errors.append(f'Undocumented route: {method} {route}')
    for method, route in sorted(documented - actual):
        errors.append(f'Unregistered route: {method} {route}')
    # Permanent guides must be discoverable and must not delegate basic behavior to Goals.
    index = (ROOT / 'docs/index.md').read_text()
    for name in REQUIRED:
        if name.startswith('docs/') and '/engineering/' not in name and name != 'docs/index.md':
            if name.removeprefix('docs/') not in index:
                errors.append(f'Guide missing from current index: {name}')
    for name in REQUIRED:
        if name.startswith('docs/') and '/engineering/' not in name:
            if re.search(r'\]\([^)]*engineering/goals/[^)]*GOAL', (ROOT / name).read_text()):
                errors.append(f'Current guide links to a Goal as reference: {name}')
    result = {
        'documents_checked': len(paths), 'local_links_checked': count,
        'http_operations_checked': len(actual), 'errors': errors,
        'scope': 'Markdown paths/anchors, required guides/index, static route inventory; no runtime tests',
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return bool(errors)


if __name__ == '__main__':
    sys.exit(main())
