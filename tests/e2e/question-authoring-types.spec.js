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

for (const pairCount of [2, 3]) {
test(`@full teacher authors ${pairCount}-pair association and mobile learner restores draft and retries submission`, async ({ browser }) => {
    test.setTimeout(90_000);
    const teacherContext = await browser.newContext();
    const teacher = await teacherContext.newPage();
    await login(teacher, 'professor.e2e@example.test');
    const token = (await (await teacher.request.get('/api/auth/csrf')).json()).csrf_token;
    const created = await teacher.request.post('/api/turmas/1/questionarios', {
        headers: { 'X-CSRF-Token': token },
        data: { titulo: `Tipos E2E com ${pairCount} pares`, tipo: 'EXERCICIO', ativo: true }
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
    if (pairCount === 3) {
        await teacher.locator('#adicionar-par').click();
        await teacher.locator('#par-esquerda-2').fill('Letra C');
        await teacher.locator('#par-direita-2').fill('Número 3');
    }
    await saveQuestion(teacher);

    const author = await (await teacher.request.get('/api/turmas/1/questionarios')).json();
    const questions = author.questionarios.find((item) => item.id_questionario === id).perguntas;
    expect(questions.map((item) => item.tipo_pergunta)).toEqual(['MULTIPLA_ESCOLHA', 'VERDADEIRO_FALSO', 'ASSOCIACAO']);
    expect(questions[0].opcoes.filter((item) => item.correta)).toHaveLength(2);
    expect(Boolean(questions[1].resposta_booleana)).toBe(true);
    expect(questions[2].pares).toHaveLength(pairCount);

    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await login(student, 'aluno.e2e@example.test');
    const response = student.waitForResponse((item) => item.url().includes('/questionarios/disponivel'));
    await student.goto(`/questionario.html?id_turma=1&id_questionario=${id}&tipo=exercicio`);
    const delivered = await response;
    expect(delivered.status()).toBe(200);
    const studentQuestions = (await delivered.json()).questionario.perguntas;
    expect(JSON.stringify(studentQuestions)).not.toMatch(/"correta"\s*:|"resposta_booleana"\s*:|"pares"\s*:/i);
    expect(studentQuestions[2].itens_direita).toHaveLength(pairCount);
    for (const item of [...studentQuestions[2].itens_esquerda, ...studentQuestions[2].itens_direita]) {
        expect(Object.keys(item).sort()).toEqual(['id_item', 'texto']);
    }
    await expectResponsive(student, '#lista-questoes');
    await student.setViewportSize({ width: 320, height: 900 });
    await student.getByLabel('Correta A').check();
    await student.getByLabel('Correta C').check();
    await student.locator(`input[name="pergunta_${questions[1].id_pergunta}"][value="true"]`).check();
    for (const pair of questions[2].pares) {
        await student.getByLabel(new RegExp(pair.esquerda)).selectOption({ label: pair.direita });
    }
    await expect(student.locator('#contador-respostas')).toHaveText('3 de 3 respondidas');
    const readDraft = () => student.evaluate(() => {
        const key = Object.keys(sessionStorage).find((key) => key.startsWith('questionario:'));
        return JSON.parse(sessionStorage.getItem(key));
    });
    const beforeReload = await readDraft();
    const reloaded = student.waitForResponse((item) => item.url().includes('/questionarios/disponivel'));
    await student.reload();
    expect((await reloaded).status()).toBe(200);
    await expect(student.locator('#contador-respostas')).toHaveText('3 de 3 respondidas');
    expect(await readDraft()).toEqual(beforeReload);
    for (const pair of questions[2].pares) {
        await expect(student.getByLabel(new RegExp(pair.esquerda))).toHaveValue(pair.id_item_direita);
    }
    await student.screenshot({ path: test.info().outputPath(`association-mobile-${pairCount}.png`), fullPage: true });

    // Commit on the real server, then simulate a lost response. The UI must reuse
    // the draft UUID when the learner retries, without creating a second attempt.
    let firstResult;
    let resolveCommitted;
    const committed = new Promise((resolve) => { resolveCommitted = resolve; });
    await student.route('**/api/questionarios/*/submissoes', async (route) => {
        const result = await route.fetch();
        expect(result.status()).toBe(200);
        firstResult = (await result.json()).resultado;
        resolveCommitted();
        await route.abort('failed');
    }, { times: 1 });
    await student.locator('#btn-finalizar-questionario').click();
    await committed;
    await expect(student.locator('#btn-finalizar-questionario')).toBeEnabled();
    expect((await readDraft()).submissionId).toBe(beforeReload.submissionId);
    const submission = student.waitForResponse((item) => /\/submissoes$/.test(item.url()) && item.request().method() === 'POST');
    await student.locator('#btn-finalizar-questionario').click();
    const retried = await submission;
    expect(retried.status()).toBe(200);
    expect(retried.request().postDataJSON().submission_id).toBe(beforeReload.submissionId);
    expect((await retried.json()).resultado).toMatchObject({ reutilizada: true, id_tentativa: firstResult.id_tentativa });
    await expect(student.locator('#resultado-descricao')).toContainText('Você acertou 3 de 3 questões');
    await expect(student.locator('#lista-historico')).toContainText('3/3 acertos');
    await expect(student.locator('#lista-historico .history-item')).toHaveCount(1);
    await Promise.all([teacherContext.close(), studentContext.close()]);
});
}
