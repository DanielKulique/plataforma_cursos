const { test, expect } = require('@playwright/test');

test.use({ trace: 'off' });

const password = 'E2e-only-password-42!';

async function login(page, email) {
    await page.route('https://**/*', (route) => route.abort());
    await page.goto('/login.html');
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Senha').fill(password);
    const responsePromise = page.waitForResponse((response) => response.url().endsWith('/api/auth/login'));
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect((await responsePromise).status()).toBe(200);
    const destination = email.startsWith('admin.') ? /admin\.html$/
        : email.startsWith('professor.') ? /professor\.html$/ : /sala-virtual\.html$/;
    await expect(page).toHaveURL(destination);
}

test('@full approved learning flow issues a private PDF and a publicly verifiable certificate', async ({ browser }) => {
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await login(admin, 'admin.e2e@example.test');
    const adminToken = (await (await admin.request.get('/api/auth/csrf')).json()).csrf_token;
    const sourceClass = await (await admin.request.get('/api/turmas/1')).json();
    const replication = await admin.request.post('/api/turmas/1/replicar', {
        headers: { 'X-CSRF-Token': adminToken, 'Idempotency-Key': 'e2e-certificate-class-000001' },
        data: {
            nome_turma: 'Turma E2E certificado isolado', id_professor: sourceClass.id_professor,
            data_inicio: '2026-09-01', data_fim: '2026-12-31', status: 'ABERTA'
        }
    });
    expect(replication.status()).toBe(201);
    const classId = (await replication.json()).turma.id_turma;

    const studentContext = await browser.newContext();
    const student = await studentContext.newPage();
    await login(student, 'aluno.e2e@example.test');

    const studentToken = (await (await student.request.get('/api/auth/csrf')).json()).csrf_token;
    const enrollmentResponse = await student.request.post('/api/matriculas', {
        headers: { 'X-CSRF-Token': studentToken }, data: { id_turma: classId }
    });
    expect(enrollmentResponse.status()).toBe(201);
    const contentsResponse = await student.request.get(`/api/turmas/${classId}/conteudos`);
    expect(contentsResponse.status()).toBe(200);
    const contents = (await contentsResponse.json()).conteudos;
    expect(contents).toHaveLength(5);
    // Four of five contents satisfy the 80% exam gate but leave the trail incomplete.
    for (const content of contents.slice(0, 4)) {
        const progress = await student.request.put(`/api/conteudos/${content.id_conteudo}/progresso`, {
            headers: { 'X-CSRF-Token': studentToken }, data: { status: 'CONCLUIDO' }
        });
        expect(progress.status()).toBe(200);
    }

    const classes = await student.request.get('/api/matriculas/minha-sala');
    expect(classes.status()).toBe(200);
    const enrollment = (await classes.json()).turmas.find((item) => item.id_turma === classId);
    expect(enrollment.conteudo_concluido).toBe(false);

    await student.goto(`/sala-avaliacoes.html?id_turma=${classId}`);
    const examLink = student.locator('#lista-provas a').filter({ hasText: 'Iniciar Teste Final' });
    await expect(examLink).toBeVisible();
    await student.goto(await examLink.getAttribute('href'));
    const answers = student.locator('input[type="checkbox"]');
    await expect(answers).toHaveCount(8);
    for (let index = 0; index < 8; index += 2) await answers.nth(index).check();
    const submitted = student.waitForResponse((response) => /\/api\/questionarios\/\d+\/submissoes$/.test(response.url()));
    await student.getByRole('button', { name: 'Finalizar questionário' }).click();
    expect((await submitted).status()).toBe(200);
    await expect(student.locator('#resultado-titulo')).toContainText('75.00%');
    await expect(student.locator('#resultado-descricao')).toContainText('APROVADO');

    const myCertificates = await student.request.get('/api/certificados/meus');
    expect(myCertificates.status()).toBe(200);
    const certificate = (await myCertificates.json()).certificados.find((item) => item.id_turma === classId);
    expect(certificate).toMatchObject({ status: 'ATIVO', id_turma: classId });
    const studentEmission = await student.request.post(`/api/certificados/matriculas/${enrollment.id_matricula}/emitir`, {
        headers: { 'X-CSRF-Token': studentToken }
    });
    expect(studentEmission.status()).toBe(403);

    const professorContext = await browser.newContext();
    const professor = await professorContext.newPage();
    await login(professor, 'professor.e2e@example.test');
    const professorToken = (await (await professor.request.get('/api/auth/csrf')).json()).csrf_token;
    const issuance = await professor.request.post(`/api/certificados/matriculas/${enrollment.id_matricula}/emitir`, {
        headers: { 'X-CSRF-Token': professorToken }
    });
    expect(issuance.status()).toBe(200);
    expect((await issuance.json()).reutilizado).toBe(true);
    const recoveredCertificate = (await issuance.json()).certificado;
    expect(recoveredCertificate.id_certificado).toBe(certificate.id_certificado);
    expect(recoveredCertificate.status).toBe('ATIVO');

    const publicLookup = await student.request.get(`/api/public/certificados/${certificate.codigo_publico}`);
    expect(publicLookup.status()).toBe(200);
    const publicResult = await publicLookup.json();
    expect(publicResult.resultado).toBe('VALIDO');
    const publicCertificate = publicResult.certificado;
    expect(publicCertificate.aluno).toBe('Aluno E2E');
    expect(JSON.stringify(publicCertificate)).not.toMatch(/cpf|sha256|storage_name/i);

    const privatePdf = await student.request.get(`/api/certificados/${certificate.id_certificado}/pdf`);
    expect(privatePdf.status()).toBe(200);
    expect(privatePdf.headers()['content-type']).toContain('application/pdf');
    expect((await privatePdf.body()).subarray(0, 5).toString()).toBe('%PDF-');

    const reissue = await admin.request.post(`/api/certificados/${certificate.id_certificado}/reemitir`, {
        headers: { 'X-CSRF-Token': adminToken },
        data: { motivo: 'Correção controlada pelo teste E2E.' }
    });
    expect(reissue.status()).toBe(201);
    const replacement = (await reissue.json()).certificado;
    expect(replacement.versao).toBe(2);
    expect(replacement.id_certificado_anterior).toBe(certificate.id_certificado);
    const history = await admin.request.get(`/api/certificados/${certificate.id_certificado}/historico`);
    expect((await history.json()).total).toBe(2);
    expect((await (await student.request.get(`/api/public/certificados/${certificate.codigo_publico}`)).json()).resultado)
        .toBe('REVOGADO');

    const revoked = await admin.request.post(`/api/certificados/${replacement.id_certificado}/revogar`, {
        headers: { 'X-CSRF-Token': adminToken },
        data: { motivo: 'Revogação de verificação E2E.' }
    });
    expect(revoked.status()).toBe(200);
    expect((await (await student.request.get(`/api/public/certificados/${replacement.codigo_publico}`)).json()).resultado)
        .toBe('REVOGADO');
    await Promise.all([studentContext.close(), professorContext.close(), adminContext.close()]);
});
