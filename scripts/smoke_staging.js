'use strict';

require('./lib/disposable-smoke').assertDisposableSmoke();


const crypto = require('crypto');
const { PDFDocument } = require('pdf-lib');
const db = require('../src/config/database');

async function samplePdf(text) {
    const document = await PDFDocument.create();
    document.addPage().drawText(text);
    return Buffer.from(await document.save());
}

const ALTERNATE_PROFESSOR_EMAIL = 'professor.alheio.demo@example.test';
const AUTHORING_MODULE_TITLE = 'Validação de autoria no staging';
const AUTHORING_CONTENT_PREFIX = 'Material criado pelo professor no staging';

function parseEnv(text) {
    const result = {};
    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const separator = line.indexOf('=');
        if (separator < 1) continue;
        const key = line.slice(0, separator).trim();
        let value = line.slice(separator + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"'))
            || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        result[key] = value;
    }
    return result;
}

async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf8');
}

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function main() {
    const credentials = process.env.SMOKE_CREDENTIALS_STDIN === '1'
        ? parseEnv(await readStdin())
        : process.env;
    const baseUrl = String(process.env.STAGING_BASE_URL || '').replace(/\/$/, '');

    const basic = Buffer.from(
        `${credentials.BASIC_AUTH_USER}:${credentials.BASIC_AUTH_PASSWORD}`
    ).toString('base64');
    const basicHeaders = { Authorization: `Basic ${basic}` };
    const results = [];

    async function request(path, options = {}, expected = 200) {
        const headers = { ...basicHeaders, ...(options.headers || {}) };
        const response = await fetch(`${baseUrl}${path}`, { ...options, headers });
        const expectedStatuses = Array.isArray(expected) ? expected : [expected];
        assert(
            expectedStatuses.includes(response.status),
            `${options.method || 'GET'} ${path}: esperado ${expectedStatuses.join('/')}, recebido ${response.status}`
        );
        return response;
    }

    async function json(response) {
        return response.json();
    }

    async function login(email, password, expectedRole) {
        const response = await request('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha: password })
        });
        const body = await json(response);
        assert(body.usuario?.tipo === expectedRole, `papel inesperado para ${expectedRole}`);
        assert(typeof body.csrf_token === 'string' && body.csrf_token.length >= 20, 'CSRF ausente');
        const setCookie = response.headers.get('set-cookie') || '';
        assert(/plataforma_session=/.test(setCookie), 'cookie de sessão ausente');
        assert(/HttpOnly/i.test(setCookie), 'cookie sem HttpOnly');
        assert(!/;\s*Secure(?:;|$)/i.test(setCookie), 'laboratório HTTP deve usar cookie de teste');
        assert(/SameSite=Lax/i.test(setCookie), 'cookie sem SameSite=Lax');
        const cookie = setCookie.split(';', 1)[0];
        return {
            user: body.usuario,
            csrf: body.csrf_token,
            cookie,
            headers: { Cookie: cookie }
        };
    }

    const landing = await request('/');
    assert((landing.headers.get('content-type') || '').includes('text/html'), 'landing não retornou HTML');
    results.push('landing HTTPS + Basic Auth');

    const catalog = await json(await request('/api/cursos'));
    assert(Array.isArray(catalog) && catalog.length >= 1, 'catálogo vazio');
    results.push('catálogo público');

    const admin = await login(credentials.ADMIN_EMAIL, credentials.ADMIN_PASSWORD, 'ADMIN');
    const professor = await login(credentials.PROFESSOR_EMAIL, credentials.DEMO_PASSWORD, 'PROFESSOR');
    const alternateProfessor = await login(
        ALTERNATE_PROFESSOR_EMAIL,
        credentials.DEMO_PASSWORD,
        'PROFESSOR'
    );
    let student = await login(credentials.ALUNO_EMAIL, credentials.DEMO_PASSWORD, 'ALUNO');
    const unenrolled = await login(credentials.UNENROLLED_EMAIL, credentials.DEMO_PASSWORD, 'ALUNO');
    results.push('login ADMIN/PROFESSORES/ALUNO');

    if (process.env.SMOKE_PDF_CONTENT_ID) {
        const persistentId = Number(process.env.SMOKE_PDF_CONTENT_ID);
        assert(Number.isInteger(persistentId) && persistentId > 0, 'SMOKE_PDF_CONTENT_ID inválido');
        const persistentPdf = await request(
            `/api/conteudos/${persistentId}/material`,
            { headers: student.headers }
        );
        const bytes = Buffer.from(await persistentPdf.arrayBuffer());
        assert(bytes.subarray(0, 5).equals(Buffer.from('%PDF-')), 'PDF persistente perdeu a assinatura');
        assert((persistentPdf.headers.get('content-type') || '').includes('application/pdf'),
            'PDF persistente perdeu o MIME');
        console.log(`PERSISTENCE_OK pdf=${persistentId} bytes=${bytes.length}`);
        return;
    }

    for (const session of [admin, professor, alternateProfessor, student, unenrolled]) {
        const me = await json(await request('/api/auth/me', { headers: session.headers }));
        assert(Number(me.usuario?.id_usuario) === Number(session.user.id_usuario), 'sessão /me divergente');
    }
    results.push('sessões autenticadas');

    const room = await json(await request('/api/matriculas/minha-sala', { headers: student.headers }));
    const classId = Number(
        room.turmas?.[0]?.id_turma
        || room.matriculas?.[0]?.id_turma
        || room[0]?.id_turma
        || 1
    );
    assert(Number.isInteger(classId) && classId > 0, 'turma do aluno não encontrada');

    const contentsResponse = await json(await request(
        `/api/turmas/${classId}/conteudos`,
        { headers: student.headers }
    ));
    const contents = contentsResponse.conteudos || [];
    assert(contents.length >= 5, 'conteúdos de demonstração incompletos');
    const pdf = contents.find((item) => item.tipo === 'PDF');
    const video = contents.find((item) => item.tipo === 'VIDEO');
    assert(pdf && video, 'PDF ou vídeo de demonstração ausente');
    assert(String(video.url).startsWith('https://www.youtube.com/embed/'), 'URL de vídeo inesperada');
    const youtube = await fetch(video.url);
    assert(youtube.ok && (youtube.headers.get('content-type') || '').includes('text/html'),
        'embed público do YouTube indisponível');
    results.push('matrícula, sala, módulos, conteúdo e vídeo');

    const teacherPage = await request(`/professor-turma.html?id_turma=${classId}`, {
        headers: professor.headers
    });
    const teacherPageHtml = await teacherPage.text();
    assert(
        teacherPageHtml.includes('link-alunos')
            && teacherPageHtml.includes('link-aulas')
            && teacherPageHtml.includes('link-avaliacoes')
            && teacherPageHtml.includes('link-certificados')
            && !teacherPageHtml.includes('lista-conteudos')
            && !teacherPageHtml.includes('lista-perguntas'),
        'painel modular da turma ausente'
    );

    const previousAuthoringContents = contents.filter(
        (item) => String(item.titulo || '').startsWith(AUTHORING_CONTENT_PREFIX)
            && item.tipo !== 'PDF'
    );
    for (const item of previousAuthoringContents) {
        await request(`/api/conteudos/${item.id_conteudo}`, {
            method: 'DELETE',
            headers: { ...professor.headers, 'X-CSRF-Token': professor.csrf }
        });
    }
    const modulosComPdfRetido = new Set(contents.filter(
        (item) => String(item.titulo || '').startsWith(AUTHORING_CONTENT_PREFIX)
            && item.tipo === 'PDF'
    ).map((item) => Number(item.id_modulo)));
    const previousAuthoringModules = (contentsResponse.modulos || []).filter(
        (item) => item.titulo === AUTHORING_MODULE_TITLE
            && !modulosComPdfRetido.has(Number(item.id_modulo))
    );
    for (const item of previousAuthoringModules) {
        await request(`/api/modulos/${item.id_modulo}`, {
            method: 'DELETE',
            headers: { ...professor.headers, 'X-CSRF-Token': professor.csrf }
        });
    }

    const remainingModules = (contentsResponse.modulos || []).filter(
        (item) => !previousAuthoringModules.some(
            (previous) => Number(previous.id_modulo) === Number(item.id_modulo)
        )
    );
    const remainingContents = contents.filter(
        (item) => !previousAuthoringContents.some(
            (previous) => Number(previous.id_conteudo) === Number(item.id_conteudo)
        )
    );
    const moduleOrder = Math.max(0, ...remainingModules.map((item) => Number(item.ordem) || 0)) + 1;
    const contentOrder = Math.max(0, ...remainingContents.map((item) => Number(item.ordem) || 0)) + 1;
    const createdModule = await json(await request(`/api/turmas/${classId}/modulos`, {
        method: 'POST',
        headers: {
            ...professor.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': professor.csrf
        },
        body: JSON.stringify({
            titulo: AUTHORING_MODULE_TITLE,
            descricao: 'Módulo criado pelo smoke autenticado do professor.',
            ordem: moduleOrder
        })
    }, 201));
    const createdContent = await json(await request(`/api/turmas/${classId}/conteudos`, {
        method: 'POST',
        headers: {
            ...professor.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': professor.csrf
        },
        body: JSON.stringify({
            id_modulo: createdModule.modulo.id_modulo,
            titulo: `${AUTHORING_CONTENT_PREFIX} — rascunho`,
            descricao: 'Conteúdo criado e persistido durante a validação da revisão.',
            tipo: 'TEXTO',
            corpo: 'Material acadêmico de validação do fluxo de autoria.',
            duracao_minutos: 2,
            ordem: contentOrder
        })
    }, 201));
    const createdVideo = await json(await request(`/api/turmas/${classId}/conteudos`, {
        method: 'POST',
        headers: {
            ...professor.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': professor.csrf
        },
        body: JSON.stringify({
            id_modulo: createdModule.modulo.id_modulo,
            titulo: `${AUTHORING_CONTENT_PREFIX} — vídeo`,
            descricao: 'Vídeo incorporável associado pelo professor.',
            tipo: 'VIDEO',
            url: 'https://www.youtube.com/embed/M7lc1UVf-VE',
            duracao_minutos: 5,
            ordem: contentOrder + 1
        })
    }, 201));
    const pdfForm = new FormData();
    pdfForm.append('id_modulo', String(createdModule.modulo.id_modulo));
    pdfForm.append('titulo', `${AUTHORING_CONTENT_PREFIX} — PDF real`);
    pdfForm.append('descricao', 'PDF real enviado pelo professor e armazenado em volume privado.');
    pdfForm.append('duracao_minutos', '4');
    pdfForm.append('ordem', String(contentOrder + 2));
    pdfForm.append(
        'arquivo',
        new Blob([await samplePdf('Material staging')], { type: 'application/pdf' }),
        'guia-integridade-staging.pdf'
    );
    const createdPdf = await json(await request(`/api/turmas/${classId}/conteudos/pdf`, {
        method: 'POST',
        headers: {
            ...professor.headers,
            'X-CSRF-Token': professor.csrf
        },
        body: pdfForm
    }, 201));
    await request(`/api/conteudos/${createdContent.conteudo.id_conteudo}`, {
        method: 'PATCH',
        headers: {
            ...professor.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': professor.csrf
        },
        body: JSON.stringify({ titulo: `${AUTHORING_CONTENT_PREFIX} — revisado` })
    });

    const teacherRefresh = await json(await request(
        `/api/turmas/${classId}/conteudos`,
        { headers: professor.headers }
    ));
    const persistedContent = teacherRefresh.conteudos.find(
        (item) => Number(item.id_conteudo) === Number(createdContent.conteudo.id_conteudo)
    );
    assert(persistedContent?.titulo.endsWith('— revisado'), 'edição do professor não persistiu');
    const persistedVideo = teacherRefresh.conteudos.find(
        (item) => Number(item.id_conteudo) === Number(createdVideo.conteudo.id_conteudo)
    );
    const persistedPdf = teacherRefresh.conteudos.find(
        (item) => Number(item.id_conteudo) === Number(createdPdf.conteudo.id_conteudo)
    );
    assert(persistedVideo?.url === 'https://www.youtube.com/embed/M7lc1UVf-VE',
        'vídeo incorporável criado pelo professor não persistiu');
    assert(persistedPdf?.url === `/api/conteudos/${createdPdf.conteudo.id_conteudo}/material`,
        'PDF criado pelo professor expôs referência inesperada');
    assert(persistedPdf?.id_arquivo_material && persistedPdf?.arquivo_atual?.nome_original,
        'PDF enviado não expôs metadados públicos seguros');
    const studentRefresh = await json(await request(
        `/api/turmas/${classId}/conteudos`,
        { headers: student.headers }
    ));
    const authoredContentIds = [createdContent, createdVideo, createdPdf]
        .map((body) => Number(body.conteudo.id_conteudo));
    assert(authoredContentIds.every((id) => studentRefresh.conteudos.some(
        (item) => Number(item.id_conteudo) === id
    )), 'materiais criados não apareceram para o aluno matriculado');
    await request(`/api/conteudos/${createdContent.conteudo.id_conteudo}`, {
        method: 'PATCH',
        headers: {
            ...alternateProfessor.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': alternateProfessor.csrf
        },
        body: JSON.stringify({ titulo: 'Tentativa indevida' })
    }, 403);
    await request(`/api/conteudos/${createdContent.conteudo.id_conteudo}/progresso`, {
        method: 'PUT',
        headers: {
            ...professor.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': professor.csrf
        },
        body: JSON.stringify({ status: 'CONCLUIDO' })
    }, 403);
    results.push('interface, texto/vídeo/PDF, edição, refresh, aluno e isolamento entre professores');

    await request(`/api/turmas/${classId}/conteudos`, { headers: unenrolled.headers }, 403);
    await request(`/api/conteudos/${pdf.id_conteudo}/material`, { headers: unenrolled.headers }, 403);
    await request(`/api/conteudos/${pdf.id_conteudo}/material`, {}, 401);
    await request('/assets/materiais/guia-integridade-academica.pdf', { headers: student.headers }, 404);
    const protectedPdf = await request(
        `/api/conteudos/${pdf.id_conteudo}/material`,
        { headers: student.headers }
    );
    assert((protectedPdf.headers.get('content-type') || '').includes('application/pdf'), 'material não é PDF');
    assert((protectedPdf.headers.get('cache-control') || '').includes('no-store'), 'PDF sem no-store');
    const authoredProtectedPdf = await request(
        `/api/conteudos/${createdPdf.conteudo.id_conteudo}/material`,
        { headers: student.headers }
    );
    assert((authoredProtectedPdf.headers.get('content-type') || '').includes('application/pdf'),
        'PDF associado pelo professor não foi entregue ao aluno');
    results.push('controle de acesso do PDF');

    for (const id of authoredContentIds.filter(
        (item) => item !== Number(createdPdf.conteudo.id_conteudo)
    )) {
        await request(`/api/conteudos/${id}`, {
            method: 'DELETE',
            headers: { ...professor.headers, 'X-CSRF-Token': professor.csrf }
        });
    }
    results.push('limpeza segura dos materiais temporários; PDF real mantido para persistência');

    const replicationSummary = await json(await request(
        `/api/turmas/${classId}/replicacao-resumo`,
        { headers: admin.headers }
    ));
    assert(replicationSummary.resumo?.modulos >= 1, 'origem sem módulos para replicação');
    assert(replicationSummary.resumo?.conteudos >= 5, 'origem sem conteúdos suficientes');
    assert(replicationSummary.resumo?.pdfs >= 1, 'origem sem PDF protegido');
    assert(replicationSummary.resumo?.questionarios >= 1, 'origem sem questionário');
    assert(replicationSummary.resumo?.provas >= 1, 'origem sem prova');

    const replicationSuffix = `${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
    const replicationName = `Turma demonstração B ${replicationSuffix}`;
    const replicated = await json(await request(`/api/turmas/${classId}/replicar`, {
        method: 'POST',
        headers: {
            ...admin.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': admin.csrf,
            'Idempotency-Key': crypto.randomUUID()
        },
        body: JSON.stringify({
            nome_turma: replicationName,
            id_professor: professor.user.id_usuario,
            data_inicio: new Date().toISOString().slice(0, 10),
            data_fim: null,
            status: 'ABERTA'
        })
    }, 201));
    const replicatedClassId = Number(replicated.turma?.id_turma);
    assert(Number.isInteger(replicatedClassId) && replicatedClassId !== classId,
        'replicação não criou uma nova turma');

    const [sourceStructureAfterReplication, replicatedStructure, sourceQuestionnaires, replicatedQuestionnaires] =
        await Promise.all([
            json(await request(`/api/turmas/${classId}/conteudos`, { headers: admin.headers })),
            json(await request(`/api/turmas/${replicatedClassId}/conteudos`, { headers: admin.headers })),
            json(await request(`/api/turmas/${classId}/questionarios`, { headers: admin.headers })),
            json(await request(`/api/turmas/${replicatedClassId}/questionarios`, { headers: admin.headers }))
        ]);
    assert(replicatedStructure.modulos.length === sourceStructureAfterReplication.modulos.length,
        'módulos não foram replicados');
    assert(replicatedStructure.conteudos.length === sourceStructureAfterReplication.conteudos.length,
        'conteúdos não foram replicados');
    assert(replicatedStructure.modulos.every((item) => !sourceStructureAfterReplication.modulos.some(
        (source) => Number(source.id_modulo) === Number(item.id_modulo)
    )), 'módulos de origem e destino compartilham IDs');
    assert(replicatedStructure.conteudos.every((item) => !sourceStructureAfterReplication.conteudos.some(
        (source) => Number(source.id_conteudo) === Number(item.id_conteudo)
    )), 'conteúdos de origem e destino compartilham IDs');
    assert(replicatedQuestionnaires.questionarios.length === sourceQuestionnaires.questionarios.length,
        'avaliações não foram replicadas');
    assert(replicatedQuestionnaires.questionarios.every((item) => !sourceQuestionnaires.questionarios.some(
        (source) => Number(source.id_questionario) === Number(item.id_questionario)
    )), 'avaliações de origem e destino compartilham IDs');

    const replicatedEnrollments = await json(await request(
        `/api/matriculas/turma/${replicatedClassId}`,
        { headers: professor.headers }
    ));
    const replicatedProgress = await json(await request(
        `/api/turmas/${replicatedClassId}/progresso`,
        { headers: professor.headers }
    ));
    const replicatedResults = await json(await request(
        `/api/turmas/${replicatedClassId}/questionarios/resultados`,
        { headers: professor.headers }
    ));
    assert((replicatedEnrollments.matriculas || []).length === 0, 'destino recebeu matrícula da origem');
    assert((replicatedProgress.progresso || replicatedProgress.alunos || []).length === 0,
        'destino recebeu progresso da origem');
    assert((replicatedResults.resultados || []).length === 0, 'destino recebeu tentativas ou notas da origem');

    const replicatedModule = replicatedStructure.modulos[0];
    const replicatedText = replicatedStructure.conteudos.find((item) => item.tipo === 'TEXTO');
    const replicatedPdf = replicatedStructure.conteudos.find(
        (item) => item.titulo === `${AUTHORING_CONTENT_PREFIX} — PDF real`
    );
    const sourceUploadedPdf = sourceStructureAfterReplication.conteudos.find(
        (item) => Number(item.id_conteudo) === Number(createdPdf.conteudo.id_conteudo)
    );
    assert(replicatedPdf?.id_arquivo_material === sourceUploadedPdf?.id_arquivo_material,
        'replicação não compartilhou o ativo PDF imutável');
    const sourceText = sourceStructureAfterReplication.conteudos.find((item) => item.tipo === 'TEXTO');
    await request(`/api/modulos/${replicatedModule.id_modulo}`, {
        method: 'PATCH',
        headers: {
            ...admin.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': admin.csrf
        },
        body: JSON.stringify({ descricao: 'Módulo editado somente na turma B.' })
    });
    await request(`/api/conteudos/${replicatedText.id_conteudo}`, {
        method: 'PATCH',
        headers: {
            ...admin.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': admin.csrf
        },
        body: JSON.stringify({ corpo: 'Conteúdo editado somente na turma B.' })
    });
    const sourceAfterDestinationEdit = await json(await request(
        `/api/turmas/${classId}/conteudos`,
        { headers: admin.headers }
    ));
    assert(sourceAfterDestinationEdit.modulos[0].descricao !== 'Módulo editado somente na turma B.',
        'edição do módulo no destino alterou a origem');
    assert(sourceAfterDestinationEdit.conteudos.find(
        (item) => Number(item.id_conteudo) === Number(sourceText.id_conteudo)
    )?.corpo !== 'Conteúdo editado somente na turma B.', 'edição do conteúdo no destino alterou a origem');

    await request(`/api/turmas/${replicatedClassId}/conteudos`, { headers: unenrolled.headers }, 403);
    await request('/api/matriculas', {
        method: 'POST',
        headers: {
            ...unenrolled.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': unenrolled.csrf
        },
        body: JSON.stringify({ id_turma: replicatedClassId })
    }, 201);
    const enrolledReplicatedStructure = await json(await request(
        `/api/turmas/${replicatedClassId}/conteudos`,
        { headers: unenrolled.headers }
    ));
    assert(enrolledReplicatedStructure.conteudos.length === replicatedStructure.conteudos.length,
        'matrícula normal não liberou os conteúdos replicados');
    const replicatedProtectedPdf = await request(
        `/api/conteudos/${replicatedPdf.id_conteudo}/material`,
        { headers: unenrolled.headers }
    );
    assert((replicatedProtectedPdf.headers.get('content-type') || '').includes('application/pdf'),
        'PDF replicado não permaneceu protegido e acessível por matrícula');
    const replacementForm = new FormData();
    replacementForm.append('titulo', `${AUTHORING_CONTENT_PREFIX} — PDF do clone`);
    replacementForm.append('ordem', String(replicatedPdf.ordem));
    replacementForm.append(
        'arquivo',
        new Blob([await samplePdf('Clone independente')], { type: 'application/pdf' }),
        'clone-independente.pdf'
    );
    const replacedClone = await json(await request(
        `/api/conteudos/${replicatedPdf.id_conteudo}/pdf`,
        {
            method: 'PUT',
            headers: { ...admin.headers, 'X-CSRF-Token': admin.csrf },
            body: replacementForm
        }
    ));
    assert(replacedClone.conteudo?.id_arquivo_material !== sourceUploadedPdf.id_arquivo_material,
        'substituição no clone reutilizou incorretamente o ativo da origem');
    const sourceAfterPdfReplacement = await json(await request(
        `/api/turmas/${classId}/conteudos`, { headers: admin.headers }
    ));
    assert(sourceAfterPdfReplacement.conteudos.find(
        (item) => Number(item.id_conteudo) === Number(createdPdf.conteudo.id_conteudo)
    )?.id_arquivo_material === sourceUploadedPdf.id_arquivo_material,
    'substituição no clone alterou o PDF da origem');
    results.push('replicação A→B sem histórico, IDs independentes, edição isolada, PDF e nova matrícula');

    await request(`/api/conteudos/${pdf.id_conteudo}/progresso`, {
        method: 'PUT',
        headers: { ...student.headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'CONCLUIDO' })
    }, 403);
    await request(`/api/conteudos/${pdf.id_conteudo}/progresso`, {
        method: 'PUT',
        headers: {
            ...student.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': student.csrf
        },
        body: JSON.stringify({ status: 'CONCLUIDO' })
    });
    for (const content of contents.filter(
        (item) => !String(item.titulo || '').startsWith(AUTHORING_CONTENT_PREFIX)
    )) {
        if (Number(content.id_conteudo) === Number(pdf.id_conteudo)) continue;
        await request(`/api/conteudos/${content.id_conteudo}/progresso`, {
            method: 'PUT',
            headers: {
                ...student.headers,
                'Content-Type': 'application/json',
                'X-CSRF-Token': student.csrf
            },
            body: JSON.stringify({ status: 'CONCLUIDO' })
        });
    }
    results.push('CSRF e progresso persistível');

    await request(`/api/conteudos/${createdPdf.conteudo.id_conteudo}/progresso`, {
        method: 'PUT',
        headers: {
            ...student.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': student.csrf
        },
        body: JSON.stringify({ status: 'CONCLUIDO' })
    });

    const exercise = await json(await request(
        `/api/turmas/${classId}/questionarios/disponivel?tipo=EXERCICIO`,
        { headers: student.headers }
    ));
    const questionnaire = exercise.questionario;
    assert(questionnaire?.perguntas?.length >= 2, 'questionário incompleto');
    const answers = questionnaire.perguntas.map((question) => ({
        id_pergunta: question.id_pergunta,
        id_opcao: question.opcoes[0].id_opcao
    }));
    await request(`/api/questionarios/${questionnaire.id_questionario}/submissoes`, {
        method: 'POST',
        headers: {
            ...student.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': student.csrf
        },
        body: JSON.stringify({ submission_id: crypto.randomUUID(), respostas: answers })
    });
    const history = await json(await request('/api/questionarios/historico', { headers: student.headers }));
    assert(Array.isArray(history.tentativas) && history.tentativas.length >= 1, 'histórico vazio');
    const exam = await json(await request(
        `/api/turmas/${classId}/questionarios/disponivel?tipo=PROVA`,
        { headers: student.headers }
    ));
    assert(exam.questionario?.tipo === 'PROVA', 'prova indisponível');
    const examAnswers = [];
    for (const question of exam.questionario.perguntas) {
        const [[correct]] = await db.query('SELECT id_opcao FROM Q_Opcoes WHERE id_pergunta=? AND correta=1 ORDER BY ordem LIMIT 1', [question.id_pergunta]);
        assert(correct, 'Fixture de prova deve oferecer uma opção correta.');
        examAnswers.push({ id_pergunta: question.id_pergunta, id_opcao: correct.id_opcao });
    }
    await request(`/api/questionarios/${exam.questionario.id_questionario}/submissoes`, {
        method: 'POST',
        headers: {
            ...student.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': student.csrf
        },
        body: JSON.stringify({ submission_id: crypto.randomUUID(), respostas: examAnswers })
    });
    const resultsResponse = await json(await request(
        `/api/turmas/${classId}/questionarios/resultados`,
        { headers: professor.headers }
    ));
    assert(Array.isArray(resultsResponse.resultados) && resultsResponse.resultados.length >= 2,
        'resultados de exercício/prova ausentes');
    results.push('exercício, prova, submissões e resultados');

    const assignedClasses = await json(await request(
        `/api/turmas/professor/${professor.user.id_usuario}`,
        { headers: professor.headers }
    ));
    const assignedList = assignedClasses.turmas || assignedClasses;
    assert(Array.isArray(assignedList)
        && assignedList.some((item) => Number(item.id_turma) === classId),
    'turma atribuída não encontrada para professor');
    const closedClass = assignedList.find((item) => item.nome_turma === 'Turma Demo Fechada');
    const endedClass = assignedList.find((item) => item.nome_turma === 'Turma Demo Encerrada');
    assert(closedClass?.status === 'FECHADA', 'turma FECHADA de validação ausente');
    assert(endedClass?.status === 'ENCERRADA', 'turma ENCERRADA de validação ausente');

    const closedStructure = await json(await request(
        `/api/turmas/${closedClass.id_turma}/conteudos`,
        { headers: professor.headers }
    ));
    for (const module of (closedStructure.modulos || []).filter(
        (item) => item.titulo === 'Autoria permitida em turma fechada'
    )) {
        await request(`/api/modulos/${module.id_modulo}`, {
            method: 'DELETE',
            headers: { ...professor.headers, 'X-CSRF-Token': professor.csrf }
        });
    }
    const closedOrder = Math.max(
        0,
        ...(closedStructure.modulos || [])
            .filter((item) => item.titulo !== 'Autoria permitida em turma fechada')
            .map((item) => Number(item.ordem) || 0)
    ) + 1;
    await request(`/api/turmas/${closedClass.id_turma}/modulos`, {
        method: 'POST',
        headers: {
            ...professor.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': professor.csrf
        },
        body: JSON.stringify({
            titulo: 'Autoria permitida em turma fechada',
            descricao: 'Validação de que FECHADA bloqueia matrícula, não autoria.',
            ordem: closedOrder
        })
    }, 201);
    await request(`/api/turmas/${endedClass.id_turma}/modulos`, {
        method: 'POST',
        headers: {
            ...professor.headers,
            'Content-Type': 'application/json',
            'X-CSRF-Token': professor.csrf
        },
        body: JSON.stringify({ titulo: 'Tentativa em encerrada', ordem: 1 })
    }, 409);
    results.push('autoria em FECHADA e bloqueio estrutural em ENCERRADA');
    const enrollmentResponse = await json(await request(
        `/api/matriculas/turma/${classId}`,
        { headers: professor.headers }
    ));
    const enrollment = enrollmentResponse.matriculas?.find(
        (item) => Number(item.id_aluno) === Number(student.user.id_usuario)
    );
    assert(enrollment?.id_matricula, 'aluno matriculado não encontrado pelo professor');
    await request(`/api/turmas/${classId}/progresso`, { headers: professor.headers });
    const gradedEnrollment = await json(await request(
        `/api/matriculas/${enrollment.id_matricula}`,
        { headers: professor.headers }
    ));
    assert(gradedEnrollment.status_aprovacao === 'APROVADO'
        && gradedEnrollment.nota_final === null, 'aprovação automática não persistiu');
    results.push('turma, aluno, progresso e aprovação automática pela prova final');

    const capabilities = await json(await request('/api/capabilities', { headers: admin.headers }));
    assert(capabilities && typeof capabilities === 'object', 'capabilities inválidas');
    const users = await json(await request('/api/admin/usuarios', { headers: admin.headers }));
    assert(Array.isArray(users.items) && users.total >= 4, 'lista administrativa incompleta');
    await request('/api/admin/usuarios', { headers: student.headers }, 403);
    await request('/api/admin/usuarios', { headers: professor.headers }, 403);
    await request('/api/health', { headers: admin.headers });
    results.push('acesso ADMIN e isolamento de papéis');

    await request('/api/auth/logout', {
        method: 'POST',
        headers: { ...student.headers, 'X-CSRF-Token': student.csrf }
    }, 204);
    await request('/api/auth/me', { headers: student.headers }, 401);
    student = await login(credentials.ALUNO_EMAIL, credentials.DEMO_PASSWORD, 'ALUNO');
    const reopenedContents = await json(await request(
        `/api/turmas/${classId}/conteudos`,
        { headers: student.headers }
    ));
    const reopenedPdf = reopenedContents.conteudos.find(
        (item) => Number(item.id_conteudo) === Number(pdf.id_conteudo)
    );
    assert(reopenedPdf?.status_progresso === 'CONCLUIDO'
        || reopenedPdf?.status === 'CONCLUIDO', 'progresso não persistiu após novo login');
    const studentEnrollments = await json(await request(
        `/api/matriculas/aluno/${student.user.id_usuario}`,
        { headers: student.headers }
    ));
    const reopenedEnrollment = studentEnrollments.find(
        (item) => Number(item.id_matricula) === Number(enrollment.id_matricula)
    );
    assert(reopenedEnrollment?.status_aprovacao === 'APROVADO'
        && reopenedEnrollment.nota_final === null,
    'aprovação/nota não persistiram após novo login');
    results.push('logout/login e estado acadêmico persistido');

    for (const result of results) console.log(`PASS ${result}`);
    console.log(`SMOKE_OK checks=${results.length} class=${classId} pdf=${pdf.id_conteudo} uploaded_pdf=${createdPdf.conteudo.id_conteudo}`);
}

main().catch((error) => {
    console.error(`SMOKE_FAIL ${error.message}`);
    process.exitCode = 1;
}).finally(() => db.end());
