const { test, expect } = require('@playwright/test');

test.use({ trace: 'off' });

async function login(page, email) {
    await page.route('https://**/*', (route) => route.abort());
    await page.goto('/login.html');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill('E2e-only-password-42!');
    const response = page.waitForResponse((item) => item.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect((await response).status()).toBe(200);
    const destination = email.startsWith('professor.') ? '/professor.html' : '/sala-virtual.html';
    await page.waitForURL((url) => url.pathname === destination, { waitUntil: 'load' });
}

async function saveQuestion(page) {
    const response = page.waitForResponse((item) => /\/api\/(questionarios\/\d+\/perguntas|perguntas\/\d+)$/.test(item.url())
        && ['POST', 'PATCH'].includes(item.request().method()));
    await page.locator('#salvar-pergunta').click();
    expect((await response).status()).toBeGreaterThanOrEqual(200);
    await expect(page.locator('#modal-pergunta')).not.toBeVisible();
}

async function expectResponsive(page, selector) {
    for (const width of [320, 360, 390, 412, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const bounds = await page.locator(selector).evaluate((element) => {
            const rect = element.getBoundingClientRect();
            return { left: rect.left, right: rect.right, viewport: document.documentElement.clientWidth,
                scroll: document.documentElement.scrollWidth };
        });
        expect(bounds.left, `${selector} at ${width}px`).toBeGreaterThanOrEqual(-1);
        expect(bounds.right, `${selector} at ${width}px`).toBeLessThanOrEqual(bounds.viewport + 2);
        expect(bounds.scroll, `${selector} overflow at ${width}px`).toBeLessThanOrEqual(bounds.viewport + 2);
    }
}

test('@full teacher builds all question types in the dialog and learner submits exact answers', async ({ browser }) => {
    test.setTimeout(90_000);
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    await login(teacher, 'professor.e2e@example.test');
    const token = (await (await teacher.request.get('/api/auth/csrf')).json()).csrf_token;
    const created = await teacher.request.post('/api/turmas/1/questionarios', {
        headers: { 'X-CSRF-Token': token },
        data: { titulo: 'Três tipos E2E', tipo: 'EXERCICIO', ativo: true }
    });
    expect(created.status()).toBe(201);
    const id = (await created.json()).questionario.id_questionario;
    await teacher.goto(`/professor-turma-avaliacao.html?id_turma=1&id_questionario=${id}`);
    await expect(teacher.locator('#nova-pergunta')).toBeEnabled();

    await teacher.locator('#nova-pergunta').click();
    await expectResponsive(teacher, '#modal-pergunta');
    await teacher.locator('#pergunta-texto').fill('Selecione duas respostas exatas');
    await teacher.locator('#opcao-texto-0').fill('Correta A');
    await teacher.locator('#opcao-texto-1').fill('Incorreta B');
    await teacher.locator('#adicionar-opcao').click();
    await teacher.locator('#opcao-texto-2').fill('Correta C');
    await teacher.getByRole('checkbox', { name: 'Marcar alternativa 1 como correta' }).check();
    await teacher.getByRole('checkbox', { name: 'Marcar alternativa 3 como correta' }).check();
    await saveQuestion(teacher);

    await teacher.locator('#nova-pergunta').click();
    await teacher.locator('#pergunta-texto').fill('O céu é azul');
    await teacher.locator('#pergunta-tipo').selectOption('VERDADEIRO_FALSO');
    await teacher.locator('#editor-verdadeiro-falso input[value="true"]').check();
    await saveQuestion(teacher);

    await teacher.locator('#nova-pergunta').click();
    await teacher.locator('#pergunta-texto').fill('Associe cada letra ao número');
    await teacher.locator('#pergunta-tipo').selectOption('ASSOCIACAO');
    await expectResponsive(teacher, '#modal-pergunta');
    await teacher.locator('#par-esquerda-0').fill('Letra A');
    await teacher.locator('#par-direita-0').fill('Número 1');
    await teacher.locator('#par-esquerda-1').fill('Letra B');
    await teacher.locator('#par-direita-1').fill('Número 2');
    await teacher.locator('#adicionar-par').click();
    await teacher.locator('#par-esquerda-2').fill('Letra C');
    await teacher.locator('#par-direita-2').fill('Número 3');
    await saveQuestion(teacher);

    const author = await (await teacher.request.get('/api/turmas/1/questionarios')).json();
    const questions = author.questionarios.find((item) => item.id_questionario === id).perguntas;
    expect(questions.map((item) => item.tipo_pergunta)).toEqual(['MULTIPLA_ESCOLHA', 'VERDADEIRO_FALSO', 'ASSOCIACAO']);
    expect(questions[0].opcoes.filter((item) => item.correta)).toHaveLength(2);
    expect(Boolean(questions[1].resposta_booleana)).toBe(true);
    expect(questions[2].pares).toHaveLength(3);

    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await login(student, 'aluno.e2e@example.test');
    const response = student.waitForResponse((item) => item.url().includes('/questionarios/disponivel'));
    await student.goto(`/questionario.html?id_turma=1&id_questionario=${id}&tipo=exercicio`);
    const delivered = await response;
    expect(delivered.status()).toBe(200);
    const studentQuestions = (await delivered.json()).questionario.perguntas;
    expect(JSON.stringify(studentQuestions)).not.toMatch(/"correta"\s*:|"resposta_booleana"\s*:|"pares"\s*:/i);
    expect(studentQuestions[2].itens_direita).toHaveLength(3);
    await expectResponsive(student, '#lista-questoes');
    await student.getByLabel('Correta A').check();
    await student.getByLabel('Correta C').check();
    await student.locator(`input[name="pergunta_${questions[1].id_pergunta}"][value="true"]`).check();
    for (const pair of questions[2].pares) {
        await student.getByLabel(new RegExp(pair.esquerda)).selectOption({ label: pair.direita });
    }
    await expect(student.locator('#contador-respostas')).toHaveText('3 de 3 respondidas');
    const submission = student.waitForResponse((item) => /\/submissoes$/.test(item.url()) && item.request().method() === 'POST');
    await student.locator('#btn-finalizar-questionario').click();
    expect((await submission).status()).toBe(200);
    await expect(student.locator('#resultado-descricao')).toContainText('Você acertou 3 de 3 questões');
    await expect(student.locator('#lista-historico')).toContainText('3/3 acertos');
    await Promise.all([teacherContext.close(), studentContext.close()]);
});
