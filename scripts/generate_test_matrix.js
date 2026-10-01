'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const appSource = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
const routesDir = path.join(root, 'src/api/routes');
const publicDir = path.join(root, 'src/public');
const testsDir = path.join(root, 'src/__tests__');
const testFiles = [];
function listFiles(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) listFiles(fullPath);
        else if (entry.name.endsWith('.test.js')) testFiles.push(path.relative(root, fullPath));
    }
}
listFiles(testsDir);

const routeImports = new Map();
for (const match of appSource.matchAll(/const\s+(\w+)\s*=\s*require\(['"]\.\/src\/api\/routes\/([^'"]+)['"]\)/g)) {
    routeImports.set(match[1], `${match[2]}.js`);
}
const mounts = new Map();
for (const match of appSource.matchAll(/app\.use\(['"]([^'"]+)['"]\s*,\s*(\w+)\)/g)) {
    if (routeImports.has(match[2])) mounts.set(routeImports.get(match[2]), match[1]);
}

function roleFor(handler) {
    const hasAuth = /checkAuth|\bauth\b/.test(handler);
    const roles = [...handler.matchAll(/checkRole\(['"](ADMIN|PROFESSOR|ALUNO)['"]\)/g)].map((item) => item[1]);
    if (roles.length) return [...new Set(roles)].join(', ');
    if (hasAuth) return 'AUTHENTICATED; controller/owner policy';
    return 'PUBLIC';
}

function findEvidence(moduleName) {
    const key = moduleName.replace('.routes', '').replaceAll('-', '[ -_]?');
    return testFiles.filter((file) => new RegExp(key, 'i').test(path.basename(file))
        || new RegExp(`${key}.*integration|integration.*${key}`, 'i').test(file));
}

const apiRows = [];
let endpointId = 0;
const routeCoverage = new Map([
    ['/api/auth/login', 'tests/e2e/auth-roles.spec.js'],
    ['/api/auth/logout', 'tests/e2e/auth-roles.spec.js'],
    ['/api/auth/csrf', 'tests/e2e/auth-roles.spec.js'],
    ['/api/auth/me', 'tests/e2e/auth-roles.spec.js'],
    ['/api/certificados/:id_certificado/pdf', 'src/__tests__/integration/certificados.integration.test.js'],
    ['/api/conteudos/:id_conteudo/material', 'src/__tests__/integration/pdf-upload.integration.test.js'],
    ['/api/turmas/:id_turma/questionarios', 'src/__tests__/integration/question-authoring-types.integration.test.js'],
    ['/api/turmas/:id_turma/questionarios/disponivel', 'src/__tests__/integration/question-authoring-types.integration.test.js'],
    ['/api/questionarios/:id_questionario/submissoes', 'src/__tests__/integration/academic-exam.integration.test.js'],
    ['/api/turmas/:id/replicar', 'src/__tests__/integration/turma-replication.integration.test.js']
]);
for (const [route, evidence] of routeCoverage) {
    if (!fs.existsSync(path.join(root, evidence))) throw new Error(`Evidence missing for ${route}: ${evidence}`);
}
for (const [method, route, role, evidence] of [
    ['GET', '/certificados/validar', 'PUBLIC', 'tests/e2e/public-pages.spec.js'],
    ['GET', '/certificados/validar/:codigo', 'PUBLIC', 'tests/e2e/public-pages.spec.js'],
    ['GET', '/healthz', 'PUBLIC', 'tests/e2e/public-pages.spec.js'],
    ['GET', '/readyz', 'PUBLIC', 'tests/e2e/public-pages.spec.js']
]) {
    endpointId += 1;
    apiRows.push(`| API-${String(endpointId).padStart(3, '0')} | DIRECT | ${method} ${route} | ${role} | Browser E2E | \`${evidence}\` | Página/endpoint visitado; variações de erro e disponibilidade não foram exercitadas integralmente. | PARTIAL |`);
}
for (const file of fs.readdirSync(routesDir).filter((name) => name.endsWith('.routes.js')).sort()) {
    const source = fs.readFileSync(path.join(routesDir, file), 'utf8');
    const routePattern = /router\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
    const matches = [...source.matchAll(routePattern)];
    for (let i = 0; i < matches.length; i += 1) {
        const match = matches[i];
        const end = matches[i + 1]?.index ?? source.length;
        const handler = source.slice(match.index, end);
        const prefix = mounts.get(file) || '(not mounted in index.js)';
        const routePath = match[2] === '/' ? '' : match[2];
        const fullPath = `${prefix}${routePath}` || '/';
        const isAuthRelated = /auth|csrf|login/.test(fullPath);
        const isHealth = /health|healthz|readyz/.test(fullPath);
        const directEvidence = routeCoverage.get(fullPath);
        const evidence = directEvidence ? [directEvidence] : findEvidence(file.replace('.js', '')).slice(0, 3);
        const status = directEvidence ? 'COVERED' : 'PARTIAL';
        const area = isHealth ? 'HEALTH' : isAuthRelated ? 'AUTH' : file.replace('.routes.js', '').toUpperCase();
        endpointId += 1;
        const gap = status === 'PARTIAL'
            ? 'Contrato completo, incluindo autorização, falhas e limites, ainda não foi exercitado.' : '—';
        apiRows.push(`| API-${String(endpointId).padStart(3, '0')} | ${area} | ${match[1].toUpperCase()} ${fullPath} | ${roleFor(handler)} | API / integration | ${evidence.map((name) => `\`${name}\``).join(', ') || '—'} | ${gap} | ${status} |`);
    }
}

const pageNames = fs.readdirSync(publicDir).filter((name) => name.endsWith('.html')).sort();
const testedPages = new Set([
    'landing.html', 'index.html', 'cadastro.html', 'login.html', 'sala-virtual.html', 'sala-aula.html',
    'sala-aulas.html', 'sala-aula-detalhe.html', 'sala-avaliacoes.html', 'sala-progresso.html',
    'meus-certificados.html', 'professor.html', 'professor-turma.html', 'professor-turma-aulas.html',
    'professor-turma-avaliacoes.html', 'professor-turma-certificados.html', 'admin.html'
]);
const pageRows = pageNames.map((name, index) => {
    const status = 'PARTIAL';
    const evidence = testedPages.has(name)
        ? 'tests/e2e/protected-pages.spec.js; tests/e2e/responsive-roles.spec.js; tests/e2e/critical-learning-smoke.spec.js'
        : 'tests/e2e/public-pages.spec.js';
    const gap = testedPages.has(name)
        ? 'Navegação ou layout exercitados; todas as ações e falhas da página ainda não foram verificadas.'
        : 'Página inventariada sem cenário funcional completo no browser.';
    return `| PAGE-${String(index + 1).padStart(2, '0')} | FRONTEND | GET /${name} | PUBLIC shell; auth varies by page | Browser E2E | ${evidence} | ${gap} | ${status} |`;
});

const flowRows = [
    ['PUB-01', 'Landing, catálogo, cadastro e health', 'PUBLIC', 'E2E browser', 'tests/e2e/public-pages.spec.js', 'COVERED'],
    ['AUTH-01', 'Login válido e área de ALUNO, PROFESSOR e ADMIN', 'ALUNO / PROFESSOR / ADMIN', 'E2E browser', 'tests/e2e/auth-roles.spec.js', 'COVERED'],
    ['AUTH-02', 'Login com senha inválida', 'PUBLIC', 'E2E browser', 'tests/e2e/auth-roles.spec.js', 'COVERED'],
    ['AUTH-03', 'Logout, cookie HttpOnly/SameSite e sessão inválida após logout', 'AUTHENTICATED', 'E2E browser', 'tests/e2e/auth-roles.spec.js', 'COVERED'],
    ['AUTH-04', 'CSRF ausente e token correto', 'AUTHENTICATED', 'E2E browser + integration', 'tests/e2e/auth-roles.spec.js; integration/mvp-security.integration.test.js', 'COVERED'],
    ['REG-01', 'Cadastro público e login imediato sem entrega de e-mail', 'PUBLIC → ALUNO', 'E2E browser', 'tests/e2e/public-pages.spec.js', 'COVERED'],
    ['COURSE-01', 'Catálogo público mostra curso e turmas do seed E2E', 'PUBLIC', 'E2E browser', 'tests/e2e/public-pages.spec.js', 'COVERED'],
    ['ACADEMIC-01', 'Estados ABERTA/FECHADA/ENCERRADA, matrícula e bloqueio em 80%', 'ALUNO / ADMIN', 'Integration + browser', 'tests/e2e/learning-assessment.spec.js; integration/enrollment-lifecycle.integration.test.js', 'PARTIAL'],
    ['CONTENT-01', 'Conteúdo, progresso, aula e YouTube', 'ALUNO / PROFESSOR', 'Integration + browser', 'tests/e2e/learning-assessment.spec.js; integration/professor-content-management.integration.test.js', 'PARTIAL'],
    ['ASSESS-01', 'Autoria de exercício, gabarito privado e submissão final em 75%', 'ALUNO / PROFESSOR', 'E2E + integration', 'tests/e2e/roles-materials.spec.js; tests/e2e/learning-certificate-flow.spec.js; integration/academic-exam.integration.test.js', 'PARTIAL'],
    ['MATERIAL-01', 'Upload/download PDF autenticado e substituição inválida preserva arquivo', 'ALUNO / PROFESSOR', 'E2E + integration', 'tests/e2e/roles-materials.spec.js; integration/pdf-upload.integration.test.js', 'PARTIAL'],
    ['CERT-01', 'Elegibilidade, emissão, PDF privado, verificação, reemissão e revogação', 'ALUNO / PROFESSOR / ADMIN', 'E2E + integration', 'tests/e2e/learning-certificate-flow.spec.js; integration/certificados.integration.test.js', 'PARTIAL'],
    ['ADMIN-01', 'CRUD de curso e autorização de escrita', 'ADMIN / ALUNO / PROFESSOR', 'E2E browser', 'tests/e2e/roles-materials.spec.js', 'COVERED'],
    ['ADMIN-02', 'Replicação copia estrutura com IDs independentes e sem dados pessoais ou acadêmicos', 'ADMIN / PROFESSOR / ALUNO', 'Browser E2E + integration', 'tests/e2e/roles-materials.spec.js; src/__tests__/integration/turma-replication.integration.test.js', 'COVERED'],
    ['API-ERR-01', '400, 401, 403, 404, 409, 422, 429, 500 e 503 sem detalhe interno na interface', 'ALUNO', 'Browser E2E com intercept', 'tests/e2e/api-errors.spec.js', 'COVERED'],
    ['PAGE-ACCESS-01', 'Matriz das páginas privadas críticas, redirecionamento e IDOR', 'PUBLIC / ALUNO / PROFESSOR / ADMIN', 'Browser E2E + API', 'tests/e2e/protected-pages.spec.js; tests/e2e/roles-materials.spec.js', 'COVERED'],
    ['PROF-01', 'Autoria de exercício restrita à turma e visível sem gabarito para aluno', 'PROFESSOR / ALUNO', 'E2E browser', 'tests/e2e/roles-materials.spec.js', 'PARTIAL'],
    ['SEC-01', 'Autorização cruzada, IDOR, rate limit e mensagens de erro', 'ALL ROLES', 'E2E + unit + integration', 'tests/e2e/roles-materials.spec.js; admin.routes.security.test.js; conteudos.routes.security.test.js; integration/mvp-security.integration.test.js', 'PARTIAL'],
    ['RESP-01', 'Sem overflow global e sem corte à esquerda ou direita nas telas críticas em seis viewports', 'ALL ROLES', 'E2E browser', 'tests/e2e/responsive-roles.spec.js; tests/e2e/public-pages.spec.js', 'COVERED'],
    ['REG-03', 'URL embed do YouTube e CSP permitem o domínio configurado', 'ALUNO / PUBLIC', 'E2E browser', 'tests/e2e/critical-learning-smoke.spec.js; tests/e2e/public-pages.spec.js', 'COVERED'],
    ['REG-06', 'Falha de certificados não derruba Sala Virtual nem o contexto acadêmico', 'ALUNO', 'E2E browser com intercept', 'tests/e2e/critical-learning-smoke.spec.js; tests/e2e/api-errors.spec.js', 'COVERED'],
    ['REG-08', 'Recusa MySQL local 3306; sem fallback e execução E2E privada', 'SYSTEM', 'Unit + isolated E2E', 'database-isolation.test.js; compose.e2e.yaml', 'COVERED']
];

const flowGaps = {
    'ACADEMIC-01': 'Estados de turma e fronteira 80% têm testes separados; a jornada inteira por estado não foi exercitada no browser.',
    'CONTENT-01': 'Aula, progresso e vídeo têm evidência; todas as combinações de material e erro não foram exercitadas.',
    'ASSESS-01': 'Tipos de questão e nota foram exercitados; todas as variações de edição, ordem e resposta ainda não.',
    'MATERIAL-01': 'Upload e substituição inválida têm testes; criptografia, corrupção e symlink não têm E2E completo.',
    'CERT-01': 'Emissão e download têm E2E; reemissão e revogação dependem de integração.',
    'PROF-01': 'Autoria e privacidade têm testes; toda a matriz de edição e ownership não foi exercitada no browser.',
    'SEC-01': 'Papéis e IDOR críticos têm testes; a matriz integral de recursos ainda é parcial.'
};
const rows = flowRows.map((row) => `| ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} | ${row[4]} | ${flowGaps[row[0]] || '—'} | ${row[5]} |`).join('\n');
const unitCount = testFiles.filter((name) => !name.includes('/integration/')).length;
const integrationCount = testFiles.length - unitCount;
const e2eCount = fs.readdirSync(path.join(root, 'tests/e2e')).filter((name) => name.endsWith('.spec.js')).length;
const content = `# Full application test matrix\n\nGenerated from the Express router mounts, direct app routes, public HTML files and current test filenames. Regenerate with \`node scripts/generate_test_matrix.js\`.\n\nEvery row ends in one accepted status: COVERED, PARTIAL, NOT AUTOMATABLE, or OUT OF SCOPE. Each PARTIAL row names its remaining gap. COVERED API rows have an explicitly mapped test file.\n\n## Functional flows\n\n| ID | AREA / FLOW | ROLE | TYPE | TEST FILE | JUSTIFICATIVA / LACUNA | STATUS |\n|---|---|---|---|---|---|---|\n${rows}\n\n## HTML pages\n\n| ID | AREA | FLOW | ROLE | TEST TYPE | TEST FILE | JUSTIFICATIVA / LACUNA | STATUS |\n|---|---|---|---|---|---|---|---|\n${pageRows.join('\n')}\n\n## API route inventory\n\n| ID | AREA | FLOW / endpoint | ROLE | TEST TYPE | EXISTING TEST EVIDENCE | JUSTIFICATIVA / LACUNA | STATUS |\n|---|---|---|---|---|---|---|---|\n${apiRows.join('\n')}\n\n## Inventory totals\n\n- Public HTML files inventoried: ${pageNames.length}.\n- Express endpoints inventoried: ${endpointId}.\n- Jest unit test files: ${unitCount}; integration test files: ${integrationCount}.\n- Playwright specs: ${e2eCount}; configured projects: Chromium full, Firefox critical smoke and WebKit critical smoke.\n`;

const outDir = path.join(root, 'docs/testing');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'FULL_APPLICATION_TEST_MATRIX.md'), content);
console.log(`Wrote matrix: ${pageNames.length} pages, ${endpointId} endpoints, ${testFiles.length} Jest test files.`);
