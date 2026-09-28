const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');

test.use({ trace: 'off' });

const password = 'E2e-only-password-42!';

async function login(page, email) {
    await page.route('https://**/*', (route) => route.abort());
    await page.goto('/login.html');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill(password);
    const response = page.waitForResponse((item) => item.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect((await response).status()).toBe(200);
    const destination = email.startsWith('admin.') ? 'admin\\.html' : email.startsWith('professor.') ? 'professor\\.html' : 'sala-virtual\\.html';
    await expect(page).toHaveURL(new RegExp(destination + '$'));
}

async function csrf(page) {
    const response = await page.request.get('/api/auth/csrf');
    expect(response.status()).toBe(200);
    return (await response.json()).csrf_token;
}

async function createQuestionnaire(professor, token, classId, title, type, active, final = false) {
    const created = await professor.request.post('/api/turmas/' + classId + '/questionarios', {
        headers: { 'X-CSRF-Token': token },
        data: { titulo: title, descricao: 'Fixture isolada do gate de liberação.', tipo: type, ativo: active, prova_final: final }
    });
    expect(created.status()).toBe(201);
    const id = (await created.json()).questionario.id_questionario;
    const question = await professor.request.post('/api/questionarios/' + id + '/perguntas', {
        headers: { 'X-CSRF-Token': token },
        data: {
            texto_pergunta: 'Questão de ' + title, tipo_pergunta: 'MULTIPLA_ESCOLHA', ordem: 1, pontos: 1,
            opcoes: [
                { texto_opcao: 'Resposta correta', ordem: 1, correta: true },
                { texto_opcao: 'Resposta incorreta', ordem: 2, correta: false }
            ]
        }
    });
    expect(question.status()).toBe(201);
    return id;
}

test('@full final exam stays visible at 75% and unlocks at exactly 80%', async ({ browser }) => {
    test.setTimeout(90_000);
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await login(admin, 'admin.e2e@example.test');
    const adminToken = await csrf(admin);
    const sourceClass = await (await admin.request.get('/api/turmas/1')).json();
    const createdClass = await admin.request.post('/api/turmas', {
        headers: { 'X-CSRF-Token': adminToken },
        data: {
            nome_turma: 'Turma E2E gate 80 exato', id_curso: sourceClass.id_curso,
            id_professor: sourceClass.id_professor, data_inicio: '2026-09-01', data_fim: '2026-12-31', status: 'ABERTA'
        }
    });
    expect(createdClass.status()).toBe(201);
    const classId = (await createdClass.json()).id_turma;
    await adminContext.close();

    const professorContext = await browser.newContext();
    const professor = await professorContext.newPage();
    await login(professor, 'professor.e2e@example.test');
    const professorToken = await csrf(professor);
    const createdModule = await professor.request.post('/api/turmas/' + classId + '/modulos', {
        headers: { 'X-CSRF-Token': professorToken }, data: { titulo: 'Gate 80', descricao: '', ordem: 1 }
    });
    expect(createdModule.status()).toBe(201);
    const moduleId = (await createdModule.json()).modulo.id_modulo;
    for (let order = 1; order <= 5; order += 1) {
        const createdContent = await professor.request.post('/api/turmas/' + classId + '/conteudos', {
            headers: { 'X-CSRF-Token': professorToken },
            data: { id_modulo: moduleId, titulo: 'Trilha ' + order, tipo: 'TEXTO', corpo: 'Conteúdo E2E', ordem: order }
        });
        expect(createdContent.status()).toBe(201);
    }
    await createQuestionnaire(professor, professorToken, classId, 'Exercício ativo', 'EXERCICIO', true);
    const secondExerciseId = await createQuestionnaire(professor, professorToken, classId, 'Exercício liberado depois', 'EXERCICIO', false);
    const finalId = await createQuestionnaire(professor, professorToken, classId, 'Teste Final E2E', 'PROVA', true, true);
    await professorContext.close();

    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await login(student, 'aluno.e2e@example.test');
    const studentToken = await csrf(student);
    const enrolled = await student.request.post('/api/matriculas', {
        headers: { 'X-CSRF-Token': studentToken }, data: { id_turma: classId }
    });
    expect(enrolled.status()).toBe(201);
    const contentsResponse = await student.request.get('/api/turmas/' + classId + '/conteudos');
    expect(contentsResponse.status()).toBe(200);
    const contents = (await contentsResponse.json()).conteudos;
    expect(contents).toHaveLength(5);
    for (const content of contents.slice(0, 3)) {
        const response = await student.request.put('/api/conteudos/' + content.id_conteudo + '/progresso', {
            headers: { 'X-CSRF-Token': studentToken }, data: { status: 'CONCLUIDO' }
        });
        expect(response.status()).toBe(200);
    }

    let payload = await (await student.request.get('/api/turmas/' + classId + '/questionarios')).json();
    let finalAssessment = payload.questionarios.find((item) => Number(item.id_questionario) === finalId);
    expect(finalAssessment.requisitos).toMatchObject({
        trilha_realizada: 3, total_trilha: 5, progresso_para_prova: 60,
        requisito_percentual_prova: 80, prova_liberada: false
    });
    expect(finalAssessment).toMatchObject({ bloqueada: true });
    expect(finalAssessment).not.toHaveProperty('perguntas');
    const browserDiagnostics = { sessionResponses: [], errors: [] };
    student.on('response', (response) => {
        if (response.url().includes('/api/auth/me')) browserDiagnostics.sessionResponses.push(response.status());
    });
    student.on('pageerror', (error) => browserDiagnostics.errors.push(error.message));
    await student.goto('/sala-avaliacoes.html?id_turma=' + classId);
    await expect(student.locator('body')).toHaveAttribute('data-session-state', 'aluno');
    const evaluationsText = await student.locator('body').innerText();
    expect(evaluationsText, 'Avaliações page at ' + student.url()).toContain('Avaliações');
    const locked = student.locator('#lista-provas .summary-row').filter({ hasText: 'Teste Final E2E' });
    await expect(locked).toContainText('Bloqueada · 60% da trilha');
    await expect(locked).toContainText('Complete pelo menos 80% da trilha para liberar o Teste Final.');
    await expect(locked).toContainText('Seu progresso: 60%.');
    await expect(locked.locator('a[aria-disabled="true"]')).toBeVisible();
    await expect(locked.locator('a[aria-disabled="true"]')).not.toHaveAttribute('href', /./);

    const activationProfessorContext = await browser.newContext();
    const activationProfessor = await activationProfessorContext.newPage();
    await login(activationProfessor, 'professor.e2e@example.test');
    const activationToken = await csrf(activationProfessor);
    const activated = await activationProfessor.request.patch('/api/questionarios/' + secondExerciseId, {
        headers: { 'X-CSRF-Token': activationToken }, data: { ativo: true }
    });
    expect(activated.status()).toBe(200);
    await activationProfessorContext.close();

    await student.goto('/questionario.html?tipo=exercicio&id_turma=' + classId + '&id_questionario=' + secondExerciseId);
    await student.getByLabel('Resposta correta').check();
    const exerciseSubmission = student.waitForResponse((item) => item.url().endsWith('/api/questionarios/' + secondExerciseId + '/submissoes'));
    await student.getByRole('button', { name: 'Finalizar questionário' }).click();
    expect((await exerciseSubmission).status()).toBe(200);

    const fourthContent = await student.request.put('/api/conteudos/' + contents[3].id_conteudo + '/progresso', {
        headers: { 'X-CSRF-Token': studentToken }, data: { status: 'CONCLUIDO' }
    });
    expect(fourthContent.status()).toBe(200);

    payload = await (await student.request.get('/api/turmas/' + classId + '/questionarios')).json();
    finalAssessment = payload.questionarios.find((item) => Number(item.id_questionario) === finalId);
    expect(finalAssessment.requisitos).toMatchObject({
        trilha_realizada: 4, total_trilha: 5, progresso_para_prova: 80,
        requisito_percentual_prova: 80, prova_liberada: true
    });
    expect(finalAssessment.bloqueada).toBe(false);

    await student.goto('/sala-avaliacoes.html?id_turma=' + classId);
    const available = student.locator('#lista-provas .summary-row').filter({ hasText: 'Teste Final E2E' });
    await expect(available).toContainText('Disponível');
    const start = available.getByRole('link', { name: 'Iniciar Teste Final' });
    await expect(start).toHaveAttribute('href', new RegExp('id_questionario=' + finalId));
    const delivered = student.waitForResponse((item) => item.url().includes('/questionarios/disponivel'));
    await start.click();
    const examResponse = await delivered;
    expect(examResponse.status()).toBe(200);
    const examPayload = await examResponse.json();
    expect(JSON.stringify(examPayload)).not.toMatch(/"correta"\s*:/i);
    await student.getByRole('heading', { name: 'Teste Final E2E', exact: true }).waitFor();
    const exam = examPayload.questionario;
    expect(exam.perguntas).toHaveLength(1);
    await student.getByLabel('Resposta incorreta').check();
    const failedAttempt = student.waitForResponse((item) => item.url().endsWith('/api/questionarios/' + finalId + '/submissoes'));
    await student.getByRole('button', { name: 'Finalizar questionário' }).click();
    const failedResult = await failedAttempt;
    expect(failedResult.status()).toBe(200);
    expect((await failedResult.json()).resultado.percentual).toBe(0);
    await expect(student.locator('#resultado-descricao')).toContainText('não há nova tentativa disponível');

    const studentTokenAfterResult = await csrf(student);
    const anotherAttempt = await student.request.post('/api/questionarios/' + finalId + '/submissoes', {
        headers: { 'X-CSRF-Token': studentTokenAfterResult },
        data: {
            submission_id: crypto.randomUUID(),
            respostas: [{
                id_pergunta: exam.perguntas[0].id_pergunta,
                id_opcao: exam.perguntas[0].opcoes.find((option) => option.texto_opcao === 'Resposta correta').id_opcao
            }]
        }
    });
    expect(anotherAttempt.status()).toBe(409);
    expect((await anotherAttempt.json()).code).toBe('PROVA_FINAL_JA_TENTADA');
    const certs = await student.request.get('/api/certificados/meus');
    expect(certs.status()).toBe(200);
    expect((await certs.json()).certificados).toHaveLength(0);
    await studentContext.close();
});
