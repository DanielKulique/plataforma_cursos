const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

test.use({ trace: 'off' });

const password = 'E2e-only-password-42!';

async function login(page, email) {
    await page.route('https://**/*', (route) => route.abort());
    await page.goto('/login.html');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill(password);
    const loginResponse = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect((await loginResponse).status()).toBe(200);
    const destination = email.startsWith('admin.') ? '/admin.html'
        : email.startsWith('professor.') ? '/professor.html' : '/sala-virtual.html';
    await page.waitForURL((url) => url.pathname === destination, { waitUntil: 'load' });
    await expect(page.locator('body')).toHaveAttribute('data-session-state', email.split('.')[0]);
}

async function csrf(page) {
    const response = await page.request.get('/api/auth/csrf');
    expect(response.status()).toBe(200);
    return (await response.json()).csrf_token;
}

test('@full role boundaries protect administration and professor ownership', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    await login(adminPage, 'admin.e2e@example.test');
    const adminToken = await csrf(adminPage);

    const createdCourseResponse = await adminPage.request.post('/api/cursos', {
        headers: { 'X-CSRF-Token': adminToken },
        data: { nome_curso: 'Curso CRUD E2E', descricao: 'Ciclo automatizado.', carga_horaria: 3 }
    });
    expect(createdCourseResponse.status()).toBe(201);
    const createdCourse = await createdCourseResponse.json();
    const courseId = createdCourse.id_curso;

    const updatedCourse = await adminPage.request.put(`/api/cursos/${courseId}`, {
        headers: { 'X-CSRF-Token': adminToken },
        data: { nome_curso: 'Curso CRUD E2E atualizado', descricao: 'Ciclo automatizado.', carga_horaria: 4 }
    });
    expect(updatedCourse.status()).toBe(200);
    const publicCourse = await adminPage.request.get(`/api/cursos/${courseId}`);
    expect((await publicCourse.json()).nome_curso).toBe('Curso CRUD E2E atualizado');

    const studentContext = await browser.newContext();
    const studentPage = await studentContext.newPage();
    await login(studentPage, 'aluno.e2e@example.test');
    const studentToken = await csrf(studentPage);
    const studentAdminWrite = await studentPage.request.post('/api/cursos', {
        headers: { 'X-CSRF-Token': studentToken },
        data: { nome_curso: 'Não autorizado', carga_horaria: 1 }
    });
    expect(studentAdminWrite.status()).toBe(403);

    const professorContext = await browser.newContext();
    const professorPage = await professorContext.newPage();
    await login(professorPage, 'professor.e2e@example.test');
    const professorToken = await csrf(professorPage);
    const professorAdminWrite = await professorPage.request.post('/api/cursos', {
        headers: { 'X-CSRF-Token': professorToken },
        data: { nome_curso: 'Não autorizado', carga_horaria: 1 }
    });
    expect(professorAdminWrite.status()).toBe(403);
    const otherProfessorClasses = await professorPage.request.get('/api/turmas/professor/999999');
    expect(otherProfessorClasses.status()).toBe(403);

    const deletedCourse = await adminPage.request.delete(`/api/cursos/${courseId}`, {
        headers: { 'X-CSRF-Token': adminToken }
    });
    expect(deletedCourse.status()).toBe(204);
    await Promise.all([adminContext.close(), studentContext.close(), professorContext.close()]);
});

test('@full professor authors an exercise without exposing its answer key to learners', async ({ browser }) => {
    const professorContext = await browser.newContext();
    const professor = await professorContext.newPage();
    await login(professor, 'professor.e2e@example.test');
    const professorToken = await csrf(professor);
    const created = await professor.request.post('/api/turmas/1/questionarios', {
        headers: { 'X-CSRF-Token': professorToken },
        data: { titulo: 'Exercício criado no E2E', descricao: 'Autoria pelo papel PROFESSOR.', tipo: 'EXERCICIO', ativo: true }
    });
    expect(created.status()).toBe(201);
    const assessment = await created.json();
    const assessmentId = assessment.questionario.id_questionario;
    const questionResponse = await professor.request.post(`/api/questionarios/${assessmentId}/perguntas`, {
        headers: { 'X-CSRF-Token': professorToken },
        data: {
            texto_pergunta: 'Qual alternativa demonstra autoria válida?',
            ordem: 1,
            tipo_pergunta: 'MULTIPLA_ESCOLHA',
            pontos: 1,
            opcoes: [
                { texto_opcao: 'Opção correta E2E', ordem: 1, correta: true },
                { texto_opcao: 'Opção incorreta E2E', ordem: 2, correta: false }
            ]
        }
    });
    expect(questionResponse.status()).toBe(201);

    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await login(student, 'aluno.e2e@example.test');
    const available = await student.request.get('/api/turmas/1/questionarios/disponivel?tipo=exercicio');
    expect(available.status()).toBe(200);
    const payload = await available.json();
    expect(payload.questionario.id_questionario).toBe(assessmentId);
    expect(JSON.stringify(payload)).not.toMatch(/"correta"\s*:/i);
    await Promise.all([professorContext.close(), studentContext.close()]);
});

test('@full admin replicates class content without copying student enrollment state', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await login(admin, 'admin.e2e@example.test');
    const adminToken = await csrf(admin);
    const sourceSummary = await admin.request.get('/api/turmas/1/replicacao-resumo');
    expect(sourceSummary.status()).toBe(200);
    expect((await sourceSummary.json()).resumo.conteudos).toBe(5);

    const professorContext = await browser.newContext();
    const professor = await professorContext.newPage();
    await login(professor, 'professor.e2e@example.test');
    const profile = await professor.request.get('/api/auth/me');
    const professorId = (await profile.json()).usuario.id_usuario;

    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await login(student, 'aluno.e2e@example.test');
    const studentToken = await csrf(student);
    const sourceStructure = await (await student.request.get('/api/turmas/1/conteudos')).json();
    for (const content of sourceStructure.conteudos) {
        const sourceProgressUpdate = await student.request.put(`/api/conteudos/${content.id_conteudo}/progresso`, {
            headers: { 'X-CSRF-Token': studentToken },
            data: { status: 'CONCLUIDO' }
        });
        expect(sourceProgressUpdate.status()).toBe(200);
    }
    const availableExam = await (await student.request.get('/api/turmas/1/questionarios/disponivel?tipo=prova')).json();
    const sourceExamId = availableExam.questionario.id_questionario;
    await student.goto(`/questionario.html?id_turma=1&id_questionario=${sourceExamId}&tipo=prova`);
    await student.locator('#lista-questoes input[type="checkbox"]').first().check();
    const studentId = (await (await student.request.get('/api/auth/me')).json()).usuario.id_usuario;
    const sourceDraftKey = `questionario:${studentId}:${sourceExamId}`;
    const sourceDraft = await student.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), sourceDraftKey);
    expect(sourceDraft.submissionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(Object.values(sourceDraft.respostas).some(Boolean)).toBe(true);
    const examSubmission = await student.request.post(`/api/questionarios/${availableExam.questionario.id_questionario}/submissoes`, {
        headers: { 'X-CSRF-Token': studentToken },
        data: {
            submission_id: sourceDraft.submissionId,
            respostas: availableExam.questionario.perguntas.map((question) => ({
                id_pergunta: question.id_pergunta,
                id_opcao: question.opcoes[0].id_opcao
            }))
        }
    });
    expect(examSubmission.status()).toBe(200);
    const sourceProgress = await admin.request.get('/api/turmas/1/progresso');
    expect((await sourceProgress.json()).alunos.length).toBeGreaterThan(0);
    const sourceResults = await admin.request.get('/api/turmas/1/questionarios/resultados');
    expect((await sourceResults.json()).total).toBeGreaterThan(0);
    const sourceEnrollments = await admin.request.get('/api/matriculas/turma/1');
    expect((await sourceEnrollments.json()).total).toBeGreaterThan(0);

    const replication = await admin.request.post('/api/turmas/1/replicar', {
        headers: {
            'X-CSRF-Token': adminToken,
            'Idempotency-Key': 'e2e-class-replication-000001'
        },
        data: {
            nome_turma: 'Turma E2E Replicada',
            id_professor: professorId,
            data_inicio: '2026-09-01',
            data_fim: '2026-12-31',
            status: 'ABERTA'
        }
    });
    expect(replication.status()).toBe(201);
    const result = await replication.json();
    const clonedClassId = result.turma.id_turma;
    expect(result.resumo.conteudos).toBe(5);

    const clonedContents = await admin.request.get(`/api/turmas/${clonedClassId}/conteudos`);
    expect(clonedContents.status()).toBe(200);
    const sourceContentStructure = await (await admin.request.get('/api/turmas/1/conteudos')).json();
    const clonedContentStructure = await clonedContents.json();
    expect(clonedContentStructure.conteudos).toHaveLength(5);
    expect(clonedContentStructure.modulos.map((item) => item.id_modulo))
        .not.toEqual(sourceContentStructure.modulos.map((item) => item.id_modulo));
    expect(clonedContentStructure.conteudos.map((item) => item.id_conteudo))
        .not.toEqual(sourceContentStructure.conteudos.map((item) => item.id_conteudo));

    const sourceAssessments = await (await admin.request.get('/api/turmas/1/questionarios')).json();
    const clonedAssessments = await (await admin.request.get(`/api/turmas/${clonedClassId}/questionarios`)).json();
    for (const key of ['id_questionario', 'id_pergunta', 'id_opcao']) {
        const collect = (value) => Array.isArray(value)
            ? value.flatMap(collect)
            : value && typeof value === 'object'
                ? [...(Object.hasOwn(value, key) ? [value[key]] : []), ...Object.values(value).flatMap(collect)]
                : [];
        expect(collect(clonedAssessments.questionarios)).not.toEqual(collect(sourceAssessments.questionarios));
    }
    const clonedExam = clonedAssessments.questionarios.find((assessment) => assessment.prova_final);
    expect(clonedExam).toBeTruthy();
    expect(await student.evaluate((key) => sessionStorage.getItem(key), `questionario:${studentId}:${clonedExam.id_questionario}`)).toBeNull();

    const clonedModuleId = clonedContentStructure.modulos[0].id_modulo;
    const clonedContentId = clonedContentStructure.conteudos.find((item) => Number(item.id_modulo) === Number(clonedModuleId)).id_conteudo;
    const editClone = await admin.request.patch(`/api/conteudos/${clonedContentId}`, {
        headers: { 'X-CSRF-Token': adminToken, 'Content-Type': 'application/json' },
        data: { titulo: 'Conteúdo independente E2E' }
    });
    expect(editClone.status()).toBe(200);
    const originalAfterEdit = await (await admin.request.get('/api/turmas/1/conteudos')).json();
    expect(originalAfterEdit.conteudos.some((item) => item.titulo === 'Conteúdo independente E2E')).toBe(false);

    const clonedEnrollments = await admin.request.get(`/api/matriculas/turma/${clonedClassId}`);
    expect(clonedEnrollments.status()).toBe(200);
    expect((await clonedEnrollments.json()).total).toBe(0);
    const clonedProgress = await admin.request.get(`/api/turmas/${clonedClassId}/progresso`);
    expect((await clonedProgress.json()).alunos).toEqual([]);
    const clonedResults = await admin.request.get(`/api/turmas/${clonedClassId}/questionarios/resultados`);
    expect((await clonedResults.json()).resultados).toEqual([]);
    const learnerCertificates = await student.request.get('/api/certificados/meus');
    expect((await learnerCertificates.json()).certificados.some((item) => Number(item.id_turma) === clonedClassId)).toBe(false);
    for (const assessment of clonedAssessments.questionarios) {
        const history = await student.request.get(`/api/questionarios/historico?id_questionario=${assessment.id_questionario}`);
        expect((await history.json()).tentativas).toEqual([]);
    }
    await Promise.all([adminContext.close(), professorContext.close(), studentContext.close()]);
});

test('@full PDF material upload, authorized download and invalid replacement preserve the current file', async ({ browser }) => {
    const professorContext = await browser.newContext();
    const professor = await professorContext.newPage();
    await login(professor, 'professor.e2e@example.test');
    const professorToken = await csrf(professor);
    const validPdf = fs.readFileSync(path.join(__dirname, '../../src/__tests__/fixtures/valid-material.pdf'));
    const upload = await professor.request.post('/api/turmas/1/conteudos/pdf', {
        headers: { 'X-CSRF-Token': professorToken },
        multipart: {
            arquivo: { name: 'material-e2e.pdf', mimeType: 'application/pdf', buffer: validPdf },
            titulo: 'PDF E2E privado',
            ordem: '6',
            id_modulo: '1'
        }
    });
    expect(upload.status()).toBe(201);
    const contentId = (await upload.json()).conteudo.id_conteudo;

    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await login(student, 'aluno.e2e@example.test');
    const downloaded = await student.request.get(`/api/conteudos/${contentId}/material`);
    expect(downloaded.status()).toBe(200);
    expect(downloaded.headers()['content-type']).toContain('application/pdf');
    expect((await downloaded.body()).subarray(0, 5).toString()).toBe('%PDF-');

    const invalidReplacement = await professor.request.put(`/api/conteudos/${contentId}/pdf`, {
        headers: { 'X-CSRF-Token': professorToken },
        multipart: {
            arquivo: { name: 'invalid.pdf', mimeType: 'application/pdf', buffer: Buffer.from('not a PDF') },
            titulo: 'PDF E2E privado',
            ordem: '6'
        }
    });
    expect(invalidReplacement.status()).toBe(422);
    const stillAvailable = await student.request.get(`/api/conteudos/${contentId}/material`);
    expect(stillAvailable.status()).toBe(200);
    expect((await stillAvailable.body()).subarray(0, 5).toString()).toBe('%PDF-');
    await Promise.all([professorContext.close(), studentContext.close()]);
});
