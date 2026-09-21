#!/usr/bin/env python3
"""Validate this documentation snapshot without writing application or database state."""
from pathlib import Path
import hashlib
import json
import re
import sys

BASE = Path(__file__).resolve().parent
ROOT = BASE.parent.parent
errors = []
files = sorted(BASE.glob('*.md'))
texts = {p: p.read_text() for p in files}
required = ['README.md', 'EXECUTIVE_SUMMARY.md', '00-system-overview.md',
            '01-requirements.md', '02-business-rules.md', '03-architecture.md',
            '04-data-model.md', '05-api-and-authorization.md', '06-security.md',
            '07-deployment-infrastructure.md', '08-testing-quality.md',
            '09-risks-technical-debt.md', '10-traceability.md']
for filename in required:
    if not (BASE / filename).is_file():
        errors.append(f'Missing document: {filename}')
all_text = '\n'.join(texts.values())
counts = {}
for label, expected in [('RF', 47), ('RNF', 26), ('RN', 41)]:
    ids = re.findall(r'^#{2,3} (' + label + r'-\d{3}) —', all_text, re.M)
    counts[label] = len(ids)
    wanted = {f'{label}-{i:03d}' for i in range(1, expected + 1)}
    if set(ids) != wanted or len(ids) != expected:
        errors.append(f'Invalid definitions: {label}')
    cited = set(re.findall(r'\b' + label + r'-\d{3}\b', all_text))
    if cited - wanted:
        errors.append(f'Undefined references: {sorted(cited - wanted)}')
links = 0
for path, body in texts.items():
    for line_no, line in enumerate(body.splitlines(), 1):
        if line.rstrip() != line:
            errors.append(f'Trailing whitespace: {path.name}:{line_no}')
    for target in re.findall(r'\[[^\]]+\]\(([^)]+)\)', body):
        if re.match(r'https?://', target):
            continue
        target = target.split('#')[0]
        if not target:
            continue
        links += 1
        if not (path.parent / target).exists():
            errors.append(f'Missing link: {path.name}: {target}')
    for test in re.findall(r'`src/__tests__/([^`]+\.test\.js)`', body):
        if not (ROOT / 'src/__tests__' / test).is_file():
            errors.append(f'Missing test: {test}')
routes = json.loads((BASE / 'evidence/routes.json').read_text())
for route in routes:
    source = (ROOT / route['source']).read_text()
    local_path = route['path']
    if route['source'] == 'index.js':
        present = "app.get('/healthz'" in source
    else:
        present = any(local_path.endswith(p.rstrip('/')) for p in re.findall(
            r"router\." + route['method'].lower() + r"\(\s*'([^']+)'", source))
    if not present:
        errors.append(f"Missing route: {route['method']} {route['path']}")
manifest = json.loads((BASE / 'evidence/source-manifest.json').read_text())
for item, digest in manifest['files'].items():
    path = ROOT / item
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        errors.append(f'Source changed since baseline: {item}')
result = {'documents': len(files), 'requirements': counts, 'http_operations': len(routes),
          'mermaid_blocks': all_text.count('```mermaid'), 'local_links_checked': links,
          'source_files_verified': len(manifest['files']), 'errors': errors}
print(json.dumps(result, ensure_ascii=False, indent=2))
sys.exit(bool(errors))
