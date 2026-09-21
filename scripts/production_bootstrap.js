'use strict';

// Explicit initial import. Never invoked by application startup or ordinary seeds.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { assertDatabaseConnectionEnvironment } = require('../src/config/database-connection');
const { assertDatabaseIdentity } = require('../src/config/database-identity');

const manifestPath = path.join(__dirname, '..', 'production-content', 'manifest.json');
const hash = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
function ensure(condition, message) {
    if (!condition) throw new Error(message);
}

function validateManifest(manifest) {
    ensure(manifest.version === 1, 'Versão de manifesto desconhecida.');
    ensure(manifest.class.status === 'FECHADA', 'Bootstrap exige turma FECHADA.');
    ensure(manifest.lessons.length === 9, 'Manifesto exige exatamente 9 aulas.');
    const orders = new Set();
    manifest.lessons.forEach((lesson, index) => {
        ensure(lesson.order === index + 1 && lesson.title, 'Ordem/título de aula inválido.');
        for (const item of lesson.contents) {
            ensure(['VIDEO', 'LINK', 'PDF', 'XLSX'].includes(item.type), 'Tipo de material desconhecido.');
            ensure(Number.isInteger(item.order) && item.order > 0 && !orders.has(item.order), 'Ordem de conteúdo inválida/duplicada.');
            orders.add(item.order);
            ensure(item.title && item.title.length <= 255, 'Título de conteúdo inválido.');
            if (item.file) ensure(path.basename(item.file) === item.file && !item.file.includes('\\'), 'Nome de arquivo inseguro.');
            if (['PDF', 'XLSX'].includes(item.type)) ensure(item.file?.toLowerCase().endsWith(`.${item.type.toLowerCase()}`), 'Extensão de material inválida.');
            const url = new URL(item.url || item.sourceUrl);
            ensure(url.protocol === 'https:' && !url.username && !url.password, 'URL deve ser HTTPS sem credenciais.');
            if (item.type === 'VIDEO') ensure(url.hostname === 'www.youtube.com' && /^[\w-]{11}$/.test(url.searchParams.get('v')), 'Vídeo YouTube inválido.');
        }
    });
    ensure(manifest.assessments.length === 2, 'Esperados Simulado e Teste Final.');
    manifest.assessments.forEach((assessment, index) => {
        ensure(assessment.description === undefined || (typeof assessment.description === 'string' && assessment.description.length <= 255), 'Descrição de avaliação inválida.');
        ensure(assessment.type === (index === 0 ? 'EXERCICIO' : 'PROVA') && assessment.final === (index === 1), 'Tipo de avaliação inválido.');
        ensure(assessment.active === false && assessment.lessonOrder === 9, 'Avaliações iniciais devem permanecer indisponíveis na aula 9.');
        const questionOrders = new Set();
        for (const q of assessment.questions) {
            ensure(Number.isInteger(q.order) && q.order > 0 && !questionOrders.has(q.order), 'Ordem de questão inválida.');
            questionOrders.add(q.order);
            ensure(q.text && q.text.length <= 255 && q.options.length >= 2 && q.options.every((s) => s && s.length <= 255), 'Questão/alternativas inválidas.');
            ensure(['CONFIRMADO', 'PROPOSTO', 'REVISAR'].includes(q.answerStatus), 'Confiança de gabarito inválida.');
            ensure(q.points === null || (Number.isFinite(q.points) && q.points > 0), 'Pontuação inválida.');
            if (q.answerStatus === 'CONFIRMADO') ensure(Number.isInteger(q.correctOption) && q.correctOption >= 1 && q.correctOption <= q.options.length, 'Gabarito confirmado inválido.');
            else ensure(q.correctOption === null, 'Gabarito proposto não pode ser publicado.');
        }
    });
    return manifest;
}

function importableQuestion(q) {
    return q.complete && q.answerStatus === 'CONFIRMADO' && q.points !== null;
}

function configuration(manifest, env) {
    const hours = env.BOOTSTRAP_COURSE_HOURS || manifest.course.hours;
    const config = {
        hours: hours === null || hours === undefined ? null : Number(hours),
        teacherEmail: env.BOOTSTRAP_TEACHER_EMAIL || manifest.class.teacherEmail,
        startDate: env.BOOTSTRAP_START_DATE || manifest.class.startDate,
        endDate: env.BOOTSTRAP_END_DATE || manifest.class.endDate
    };
    if (config.hours !== null) ensure(Number.isInteger(config.hours) && config.hours > 0, 'Carga horária inválida.');
    for (const date of [config.startDate, config.endDate].filter(Boolean)) {
        ensure(/^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date, 'Data inválida.');
    }
    if (config.startDate && config.endDate) ensure(config.endDate >= config.startDate, 'Data final anterior à inicial.');
    return config;
}

function inspectMaterials(manifest, materialsDir) {
    const root = fs.realpathSync(materialsDir);
    const materials = new Map();
    for (const item of manifest.lessons.flatMap((l) => l.contents).filter((c) => c.file)) {
        const candidate = path.join(root, item.file);
        if (!fs.existsSync(candidate)) {
            materials.set(item.order, { status: 'MISSING_FILE' });
            continue;
        }
        const real = fs.realpathSync(candidate);
        ensure(path.dirname(real) === root, 'Material fora do diretório autorizado.');
        ensure(fs.statSync(real).size <= 20 * 1024 * 1024, 'Material excede 20 MB.');
        const buffer = fs.readFileSync(real);
        const sha256 = hash(buffer);
        if (item.sha256) ensure(sha256 === item.sha256, 'Checksum do material diverge do manifesto.');
        materials.set(item.order, { status: item.type === 'XLSX' ? 'UNSUPPORTED_PRIVATE_XLSX' : 'AVAILABLE', buffer, sha256 });
    }
    // Source forms and answer keys are evidence only, never learner materials.
    for (const source of manifest.sources) {
        ensure(path.basename(source.file) === source.file, 'Fonte inválida.');
        const sourcePath = path.join(root, source.file);
        ensure(fs.existsSync(sourcePath), `Fonte obrigatória ausente: ${source.file}`);
        ensure(path.dirname(fs.realpathSync(sourcePath)) === root, 'Fonte fora do diretório autorizado.');
        ensure(hash(fs.readFileSync(sourcePath)) === source.sha256, `Fonte alterada: ${source.file}`);
    }
    return materials;
}

function report(manifest, config, materials) {
    return {
        status: 'PRODUCTION_RELEASE_PARTIAL',
        configurationPending: [!config.hours && 'CARGA_HORARIA', !config.teacherEmail && 'PROFESSOR', !config.startDate && 'DATA_INICIO'].filter(Boolean),
        lessons: manifest.lessons.map((lesson) => ({
            order: lesson.order, title: lesson.title,
            contents: lesson.contents.map((item) => ({ type: item.type, title: item.title,
                status: materials.get(item.order)?.status || 'URL_CONFIGURED',
                ...(materials.get(item.order)?.sha256 ? { sha256: materials.get(item.order).sha256 } : {}) }))
        })),
        assessments: manifest.assessments.map((assessment) => ({
            title: assessment.title, active: false, availableQuestions: assessment.questions.length,
            importableQuestions: assessment.questions.filter(importableQuestion).length,
            pending: assessment.questions.filter((q) => !importableQuestion(q)).map((q) => ({
                order: q.order, answerStatus: q.answerStatus, points: q.points, complete: q.complete
            })),
            completeSource: assessment.complete
        }))
    };
}

function assertTarget(env) {
    const target = assertDatabaseConnectionEnvironment(env);
    const production = env.NODE_ENV === 'production' && env.APP_ENV === 'production'
        && target.database === 'plataforma_cursos' && target.identity === 'plataforma_cursos_prod';
    const test = env.NODE_ENV === 'test' && target.database === 'plataforma_cursos_test'
        && target.host === '127.0.0.1' && target.port === 33307;
    ensure(production || test, 'Bootstrap permitido somente na produção isolada ou MySQL Docker de teste em 33307.');
    ensure(env.ALLOW_PRODUCTION_CONTENT_BOOTSTRAP === 'I_UNDERSTAND', 'Defina ALLOW_PRODUCTION_CONTENT_BOOTSTRAP=I_UNDERSTAND.');
    return target;
}

function same(row, expected, label) {
    ensure(Object.entries(expected).every(([key, value]) => value === null ? row[key] === null : String(row[key]) === String(value)), `Conflito em ${label}; nenhum dado existente será sobrescrito.`);
}

async function applyBootstrap({ manifest, config, materials, env = process.env, createConnection = require('mysql2/promise').createConnection }) {
    validateManifest(manifest);
    const target = assertTarget(env);
    ensure(config.teacherEmail && config.startDate, 'Professor e data de início são obrigatórios.');
    const storage = require('../src/api/services/material-upload.service');
    const prepared = new Map();
    for (const lesson of manifest.lessons) for (const item of lesson.contents) {
        const file = materials.get(item.order);
        if (item.type === 'PDF' && file?.status === 'AVAILABLE') prepared.set(item.order, await storage.prepararArquivoPdf({
            originalname: item.file, size: file.buffer.length, buffer: file.buffer
        }));
    }
    const connection = await createConnection({ host: target.host, port: target.port, user: target.user, password: target.password, database: target.database, dateStrings: true });
    let locked = false;
    let commitStarted = false;
    let success = false;
    const staged = [];
    try {
        await assertDatabaseIdentity(connection, target);
        const [[lock]] = await connection.query("SELECT GET_LOCK('production_initial_bootstrap', 10) AS acquired");
        ensure(Number(lock.acquired) === 1, 'Bootstrap concorrente em execução.');
        locked = true;
        await connection.beginTransaction();
        const [[admin]] = await connection.query('SELECT * FROM Usuarios WHERE email = ? FOR UPDATE', [manifest.adminEmail]);
        ensure(admin?.tipo === 'ADMIN', 'Administrador inicial ausente ou com papel incompatível. Execute admin:bootstrap.');
        const [[teacher]] = await connection.query('SELECT * FROM Usuarios WHERE email = ? FOR UPDATE', [config.teacherEmail]);
        ensure(teacher?.tipo === 'PROFESSOR', 'Professor responsável deve existir com papel PROFESSOR.');
        let [[course]] = await connection.query('SELECT * FROM Cursos WHERE nome_curso = ? FOR UPDATE', [manifest.course.name]);
        if (!course) {
            ensure(config.hours, 'Confirme a carga horária antes de criar o curso.');
            const [result] = await connection.query('INSERT INTO Cursos (nome_curso, carga_horaria) VALUES (?, ?)', [manifest.course.name, config.hours]);
            course = { id_curso: result.insertId, carga_horaria: config.hours };
        }
        if (config.hours) same(course, { carga_horaria: config.hours }, 'carga horária');
        const expectedClass = { id_curso: course.id_curso, id_professor: teacher.id_usuario, data_inicio: config.startDate, data_fim: config.endDate || null, status: 'FECHADA' };
        let [[group]] = await connection.query('SELECT * FROM Turmas WHERE nome_turma = ? FOR UPDATE', [manifest.class.name]);
        if (group) same(group, expectedClass, 'turma');
        else {
            const [result] = await connection.query('INSERT INTO Turmas (nome_turma, id_curso, id_professor, data_inicio, data_fim, status) VALUES (?, ?, ?, ?, ?, ?)', [manifest.class.name, ...Object.values(expectedClass)]);
            group = { id_turma: result.insertId };
        }
        const [[enrollments]] = await connection.query('SELECT COUNT(*) AS total FROM Matriculas WHERE id_turma = ?', [group.id_turma]);
        ensure(Number(enrollments.total) === 0, 'Bootstrap inicial recusado: turma já possui matrículas.');
        const modules = new Map();
        for (const lesson of manifest.lessons) {
            let [[module]] = await connection.query('SELECT * FROM Modulos WHERE id_turma = ? AND ordem = ? FOR UPDATE', [group.id_turma, lesson.order]);
            if (module) same(module, { titulo: lesson.title }, `aula ${lesson.order}`);
            else {
                const [result] = await connection.query('INSERT INTO Modulos (id_turma, titulo, ordem) VALUES (?, ?, ?)', [group.id_turma, lesson.title, lesson.order]);
                module = { id_modulo: result.insertId };
            }
            modules.set(lesson.order, module.id_modulo);
            for (const item of lesson.contents) {
                if (item.type === 'XLSX' || (item.type === 'PDF' && !prepared.has(item.order))) continue;
                const expected = { id_modulo: module.id_modulo, titulo: item.title, tipo: item.type, url: item.url || null };
                const [[existing]] = await connection.query('SELECT c.*, a.sha256 FROM Conteudos c LEFT JOIN ArquivosMateriais a USING (id_arquivo_material) WHERE c.id_turma = ? AND c.ordem = ? FOR UPDATE', [group.id_turma, item.order]);
                if (existing) {
                    same(existing, expected, `conteúdo ${item.order}`);
                    if (item.type === 'PDF') same(existing, { sha256: materials.get(item.order).sha256 }, `PDF ${item.order}`);
                    continue;
                }
                let fileId = null;
                if (item.type === 'PDF') {
                    const file = prepared.get(item.order);
                    staged.push(file);
                    await storage.prepararStorage(file, connection);
                    await storage.publicarStorage(file);
                    const [asset] = await connection.query('INSERT INTO ArquivosMateriais (storage_name, original_name, mime_type, size_bytes, sha256, id_usuario_upload) VALUES (?, ?, ?, ?, ?, ?)', [file.storage_name, file.original_name, file.mime_type, file.size_bytes, file.sha256, admin.id_usuario]);
                    fileId = asset.insertId;
                }
                await connection.query('INSERT INTO Conteudos (id_turma, id_modulo, titulo, tipo, url, ordem, id_arquivo_material) VALUES (?, ?, ?, ?, ?, ?, ?)', [group.id_turma, module.id_modulo, item.title, item.type, item.url || null, item.order, fileId]);
            }
        }
        const [[count]] = await connection.query('SELECT COUNT(*) AS total FROM Modulos WHERE id_turma = ?', [group.id_turma]);
        ensure(Number(count.total) === 9, 'Turma contém aulas fora do manifesto.');
        for (const assessment of manifest.assessments) {
            const expected = { tipo: assessment.type, ativo: 0, prova_final: assessment.final ? 1 : null, id_modulo: modules.get(9), ordem: assessment.order };
            let [[quiz]] = await connection.query('SELECT * FROM Questionarios WHERE id_turma = ? AND titulo = ? FOR UPDATE', [group.id_turma, assessment.title]);
            if (quiz) same(quiz, { ...expected, descricao: assessment.description || '' }, assessment.title);
            else {
                const [result] = await connection.query('INSERT INTO Questionarios (id_curso, id_turma, titulo, descricao, tipo, ativo, prova_final, id_modulo, ordem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [course.id_curso, group.id_turma, assessment.title, assessment.description || '', ...Object.values(expected)]);
                quiz = { id_questionario: result.insertId };
            }
            const [[history]] = await connection.query('SELECT COUNT(*) AS total FROM Q_Tentativas WHERE id_questionario = ?', [quiz.id_questionario]);
            ensure(Number(history.total) === 0, 'Avaliação já possui histórico.');
            for (const question of assessment.questions.filter(importableQuestion)) {
                const expectedQuestion = { texto_pergunta: question.text, pontos: question.points, tipo_pergunta: 'MULTIPLA_ESCOLHA' };
                const [[existing]] = await connection.query('SELECT * FROM Q_Perguntas WHERE id_questionario = ? AND ordem = ? FOR UPDATE', [quiz.id_questionario, question.order]);
                if (existing) {
                    same({ ...existing, pontos: Number(existing.pontos) }, expectedQuestion, `questão ${question.order}`);
                    const [options] = await connection.query('SELECT * FROM Q_Opcoes WHERE id_pergunta = ? ORDER BY ordem', [existing.id_pergunta]);
                    ensure(options.length === question.options.length, 'Alternativas divergentes.');
                    options.forEach((option, i) => same(option, { texto_opcao: question.options[i], ordem: i + 1, correta: question.correctOption === i + 1 ? 1 : 0 }, 'alternativa'));
                    continue;
                }
                const [result] = await connection.query('INSERT INTO Q_Perguntas (id_questionario, texto_pergunta, pontos, tipo_pergunta, ordem) VALUES (?, ?, ?, ?, ?)', [quiz.id_questionario, ...Object.values(expectedQuestion), question.order]);
                for (const [i, option] of question.options.entries()) await connection.query('INSERT INTO Q_Opcoes (id_pergunta, texto_opcao, ordem, correta) VALUES (?, ?, ?, ?)', [result.insertId, option, i + 1, question.correctOption === i + 1 ? 1 : 0]);
            }
            const [[questionCount]] = await connection.query('SELECT COUNT(*) AS total FROM Q_Perguntas WHERE id_questionario = ?', [quiz.id_questionario]);
            ensure(Number(questionCount.total) === assessment.questions.filter(importableQuestion).length, 'Avaliação contém questões fora do manifesto confirmado.');
        }
        const [[quizCount]] = await connection.query('SELECT COUNT(*) AS total FROM Questionarios WHERE id_turma = ?', [group.id_turma]);
        ensure(Number(quizCount.total) === 2, 'Turma contém avaliações fora do manifesto.');
        const [[contentCount]] = await connection.query('SELECT COUNT(*) AS total FROM Conteudos WHERE id_turma = ?', [group.id_turma]);
        const expectedContents = manifest.lessons.flatMap((l) => l.contents).filter((c) => ['VIDEO', 'LINK'].includes(c.type) || prepared.has(c.order)).length;
        ensure(Number(contentCount.total) === expectedContents, 'Turma contém materiais fora do conjunto disponível para importação.');
        commitStarted = true;
        await connection.commit();
        success = true;
        return { ...report(manifest, config, materials), applied: true, courseId: course.id_curso, classId: group.id_turma, classStatus: 'FECHADA' };
    } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw error;
    } finally {
        try {
            for (const file of staged) await storage.finalizarStorage(file, commitStarted, success);
        } finally {
            if (locked) await connection.query("SELECT RELEASE_LOCK('production_initial_bootstrap')").catch(() => undefined);
            await connection.end();
        }
    }
}

async function main() {
    const args = process.argv.slice(2);
    ensure(args.every((arg) => arg === '--apply' || arg.startsWith('--materials=')), 'Use [--apply] --materials=/diretorio/privado.');
    const materialsDir = args.find((arg) => arg.startsWith('--materials='))?.slice('--materials='.length);
    ensure(materialsDir, 'Informe --materials=/diretorio/privado.');
    const manifest = validateManifest(JSON.parse(fs.readFileSync(manifestPath, 'utf8')));
    const config = configuration(manifest, process.env);
    const materials = inspectMaterials(manifest, materialsDir);
    const result = args.includes('--apply') ? await applyBootstrap({ manifest, config, materials }) : { ...report(manifest, config, materials), applied: false };
    console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main().catch((error) => {
    // Database errors may contain values. Never print raw SQL, parameters or credentials.
    console.error(error.sql ? `Bootstrap falhou (${error.code || 'DATABASE_ERROR'}).` : error.message);
    process.exitCode = 1;
});

module.exports = { validateManifest, importableQuestion, configuration, inspectMaterials, report, assertTarget, applyBootstrap };
