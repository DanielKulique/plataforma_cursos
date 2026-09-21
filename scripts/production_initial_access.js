'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { assertDatabaseConnectionEnvironment } = require('../src/config/database-connection');
const { assertDatabaseIdentity } = require('../src/config/database-identity');
const {
    assertUserBootstrapTarget,
    criarUsuarioPrivilegiado,
    hiddenPassword,
    validatePassword
} = require('./seed_admin_inicial');
const {
    validateManifest,
    configuration,
    inspectMaterials,
    applyBootstrap
} = require('./production_bootstrap');

const manifestPath = path.join(__dirname, '..', 'production-content', 'manifest.json');
function ensure(condition, message) {
    if (!condition) throw new Error(message);
}

async function promptConfirmedPassword(label) {
    const password = await hiddenPassword(`Senha de ${label} (entrada oculta): `);
    validatePassword(password);
    const confirmation = await hiddenPassword(`Confirmar senha de ${label} (entrada oculta): `);
    ensure(password === confirmation, `As senhas de ${label} não coincidem.`);
    return password;
}

async function bootstrapUser(identity, password, env) {
    return criarUsuarioPrivilegiado({
        env: {
            ...env,
            BOOTSTRAP_USER_NAME: identity.name,
            BOOTSTRAP_USER_EMAIL: identity.email,
            BOOTSTRAP_USER_ROLE: identity.role,
            BOOTSTRAP_USER_PASSWORD: password
        }
    });
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, options);
    let body = null;
    try { body = await response.json(); } catch { /* health endpoints may not return JSON */ }
    ensure(response.ok, `Smoke HTTP falhou em ${new URL(url).pathname}: status ${response.status}.`);
    return { response, body };
}

async function verifyLogin(baseUrl, identity, password, expectedClass) {
    const login = await requestJson(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: identity.email, senha: password })
    });
    const setCookie = login.response.headers.get('set-cookie') || '';
    ensure(/plataforma_session=/.test(setCookie), `Login ${identity.role} não retornou cookie de sessão.`);
    ensure(/;\s*HttpOnly/i.test(setCookie) && /;\s*Secure/i.test(setCookie) && /;\s*SameSite=Lax/i.test(setCookie),
        `Cookie ${identity.role} não contém as proteções esperadas.`);
    ensure(login.body?.usuario?.tipo === identity.role, `Login retornou perfil incompatível para ${identity.role}.`);
    const cookie = setCookie.split(';', 1)[0];
    const headers = { cookie };
    const me = await requestJson(`${baseUrl}/api/auth/me`, { headers });
    ensure(me.body?.usuario?.tipo === identity.role && me.body?.usuario?.email === identity.email,
        `Sessão ${identity.role} divergente.`);
    const csrf = await requestJson(`${baseUrl}/api/auth/csrf`, { headers });
    ensure(typeof csrf.body?.csrf_token === 'string' && csrf.body.csrf_token.length >= 32, `CSRF ${identity.role} inválido.`);

    if (identity.role === 'ADMIN') {
        const users = await requestJson(`${baseUrl}/api/admin/usuarios?limit=100`, { headers });
        ensure(JSON.stringify(users.body).includes(identity.email), 'ADMIN não acessou a gestão de usuários.');
        const courses = await requestJson(`${baseUrl}/api/cursos`, { headers });
        ensure(JSON.stringify(courses.body).includes('Plágio: não copie essa ideia 4.0'), 'ADMIN não visualizou o curso 4.0.');
        const classes = await requestJson(`${baseUrl}/api/turmas?limit=100`, { headers });
        ensure(JSON.stringify(classes.body).includes(expectedClass), 'ADMIN não visualizou a Turma 2026/2.');
    } else {
        const classes = await requestJson(`${baseUrl}/api/turmas/professor/${me.body.usuario.id_usuario}`, { headers });
        ensure(JSON.stringify(classes.body).includes(expectedClass), 'PROFESSOR não visualizou sua Turma 2026/2.');
    }

    await requestJson(`${baseUrl}/api/auth/logout`, {
        method: 'POST', headers: { ...headers, 'x-csrf-token': csrf.body.csrf_token }
    });
    return { role: identity.role, authenticated: true, cookieSecure: true, csrf: true };
}

async function verifyDatabaseState(manifest, env) {
    const target = assertDatabaseConnectionEnvironment(env);
    const connection = await mysql.createConnection({
        host: target.host, port: target.port, user: target.user,
        password: target.password, database: target.database, dateStrings: true
    });
    try {
        await assertDatabaseIdentity(connection, target);
        const [[state]] = await connection.query(`SELECT
            (SELECT COUNT(*) FROM Usuarios) AS users,
            (SELECT COUNT(*) FROM Cursos) AS courses,
            (SELECT COUNT(*) FROM Turmas) AS classes,
            (SELECT COUNT(*) FROM Modulos) AS lessons,
            (SELECT COUNT(*) FROM Certificados) AS certificates,
            (SELECT COUNT(*) FROM Q_Tentativas) AS attempts,
            (SELECT COUNT(*) FROM Matriculas) AS enrollments,
            (SELECT COUNT(*) FROM Usuarios WHERE nome_completo LIKE '%Demo%') AS demoUsers,
            (SELECT COUNT(*) FROM Cursos WHERE nome_curso LIKE '%Demo%' OR nome_curso = 'Plágio não copie essa ideia 3.0') AS legacyCourses`);
        ensure(Number(state.users) === 2 && Number(state.courses) === 1 && Number(state.classes) === 1,
            'Produção contém cardinalidade inesperada de usuários/curso/turma.');
        ensure(Number(state.lessons) === 9, 'Produção não contém exatamente 9 aulas.');
        ensure(['certificates', 'attempts', 'enrollments', 'demoUsers', 'legacyCourses']
            .every((key) => Number(state[key]) === 0), 'Produção contém dados demo ou atividade inesperada.');
        const [[group]] = await connection.query(
            `SELECT t.nome_turma, t.status, t.data_inicio, t.data_fim, c.nome_curso, c.carga_horaria,
                    u.nome_completo AS professor, u.email AS professor_email
             FROM Turmas t JOIN Cursos c USING (id_curso)
             JOIN Usuarios u ON u.id_usuario = t.id_professor
             WHERE t.nome_turma = ?`, [manifest.class.name]
        );
        ensure(group?.status === 'FECHADA' && group.nome_curso === manifest.course.name
            && Number(group.carga_horaria) === 6 && group.data_inicio === '2026-09-30'
            && group.data_fim === null && group.professor_email === manifest.class.teacherEmail,
        'Vínculo final de curso/turma/professor divergente.');
        return { ...state, classStatus: group.status };
    } finally {
        await connection.end();
    }
}

async function main() {
    const args = process.argv.slice(2);
    ensure(args.every((arg) => arg.startsWith('--materials=')), 'Use --materials=/diretorio/privado.');
    const materialsDir = args.find((arg) => arg.startsWith('--materials='))?.slice('--materials='.length);
    ensure(materialsDir, 'Informe --materials=/diretorio/privado.');
    ensure(process.env.NODE_ENV === 'production' && process.env.APP_ENV === 'production', 'Comando exclusivo de produção.');
    assertUserBootstrapTarget(process.env);
    ensure(process.env.ALLOW_PRODUCTION_CONTENT_BOOTSTRAP === 'I_UNDERSTAND',
        'Defina ALLOW_PRODUCTION_CONTENT_BOOTSTRAP=I_UNDERSTAND.');
    const baseUrl = String(process.env.APP_BASE_URL || '').replace(/\/$/, '');
    ensure(baseUrl.startsWith('https://'), 'APP_BASE_URL HTTPS é obrigatória.');
    const manifest = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));

    const adminPassword = await promptConfirmedPassword('Daniel Kulique');
    await bootstrapUser(manifest.users.admin, adminPassword, process.env);
    const teacherPassword = await promptConfirmedPassword('João Paulo Aires');
    await bootstrapUser(manifest.users.teacher, teacherPassword, process.env);

    const config = configuration(manifest, process.env);
    const materials = await inspectMaterials(manifest, materialsDir);
    const content = await applyBootstrap({ manifest, config, materials, env: process.env });
    const database = await verifyDatabaseState(manifest, process.env);
    const health = await requestJson(`${baseUrl}/healthz`);
    const ready = await requestJson(`${baseUrl}/readyz`);
    const logins = [
        await verifyLogin(baseUrl, manifest.users.admin, adminPassword, manifest.class.name),
        await verifyLogin(baseUrl, manifest.users.teacher, teacherPassword, manifest.class.name)
    ];
    console.log(JSON.stringify({
        status: 'PRODUCTION_INITIAL_ACCESS_READY',
        publicCourseLaunch: 'PUBLIC_COURSE_LAUNCH_PENDING',
        url: baseUrl,
        release: process.env.APP_RELEASE_SHA,
        health: health.response.status,
        ready: ready.response.status,
        logins,
        course: manifest.course,
        class: manifest.class,
        lessons: content.lessons.length,
        database
    }, null, 2));
}

if (require.main === module) main().catch((error) => {
    console.error(error.sql ? `Acesso inicial recusado (${error.code || 'DATABASE_ERROR'}).` : error.message);
    process.exitCode = 1;
});

module.exports = { promptConfirmedPassword, verifyLogin, verifyDatabaseState };
