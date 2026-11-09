const {test,expect}=require('@playwright/test');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
let lab;
function compose(args, options={}) {
    const project=process.env.E2E_COMPOSE_PROJECT;
    if(!/^plataforma-cursos-e2e-\d+$/.test(project||''))throw new Error('Disposable E2E stack required');
    return execFileSync('docker',['compose','--project-name',project,'--file','compose.e2e.yaml',...args],{encoding:'utf8',...options});
}
function fixture(mode) {return compose(['exec','-T','app','node','-',mode],{input:fs.readFileSync(path.join(__dirname,'fixtures/goal25.js'))});}
test.beforeAll(()=>{lab=JSON.parse(fixture('seed').split('GOAL25_FIXTURE=')[1].trim());});
test.afterAll(()=>fixture('cleanup'));
test.beforeEach(async({context})=>{await context.route('https://**/*',r=>r.abort());});
async function login(page,email,role) {
    await page.goto('/login.html',{waitUntil:'domcontentloaded'});
    await page.getByLabel('E-mail',{exact:true}).fill(email);await page.getByLabel('Senha',{exact:true}).fill('E2e-only-password-42!');
    const response=page.waitForResponse(r=>r.url().endsWith('/api/auth/login'));
    await page.getByRole('button',{name:'Entrar',exact:true}).click();expect((await response).status()).toBe(200);
    await expect(page.locator('body')).toHaveAttribute('data-session-state',role);
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
}

test('@full Goal25 professor uploads opens downloads and replaces a private PDF',async({page},testInfo)=>{
    await login(page,'professor.e2e@example.test','professor');
    await page.goto(`/professor-turma-aula.html?id_turma=${lab.id}&id_aula=${lab.module}`);
    await page.getByRole('button',{name:'Novo conteúdo',exact:true}).click();
    const dialog=page.getByRole('dialog');await dialog.getByLabel('Título',{exact:true}).fill('PDF Goal25');
    await dialog.getByLabel('Tipo',{exact:true}).selectOption('PDF');
    const original=fs.readFileSync(path.join(__dirname,'../../src/__tests__/fixtures/valid-material.pdf'));
    await dialog.locator('input[type=file]').setInputFiles({name:'primeiro.pdf',mimeType:'application/pdf',buffer:original});
    await dialog.locator('#salvar-conteudo').click();await expect(dialog).not.toBeVisible();
    let row=page.getByRole('listitem').filter({has:page.getByRole('heading',{name:/PDF Goal25/})});
    await expect(row.getByRole('button',{name:'Visualizar PDF',exact:true})).toBeVisible();
    // Headless engines may download instead of rendering their built-in PDF viewer.
    // Observe the real popup's blob destination in either native browser behavior.
    const previewTarget = new Promise(resolve => page.once('popup', preview => {
        preview.on('framenavigated', frame => { if (/^blob:/.test(frame.url())) resolve({preview,url:frame.url()}); });
        preview.once('download', download => resolve({preview,url:download.url(),download}));
    }));
    await row.getByRole('button',{name:'Visualizar PDF',exact:true}).click();
    const opened=await previewTarget;expect(opened.url).toMatch(/^blob:/);
    if(opened.download) { const file=testInfo.outputPath('visualizacao.pdf');await opened.download.saveAs(file);expect(fs.readFileSync(file)).toEqual(original); }
    await opened.preview.close();
    let downloadEvent=page.waitForEvent('download');await row.getByRole('button',{name:'Baixar PDF',exact:true}).click();
    let download=await downloadEvent;expect(download.suggestedFilename()).toBe('primeiro.pdf');const file=testInfo.outputPath('primeiro.pdf');await download.saveAs(file);expect(fs.readFileSync(file)).toEqual(original);
    await row.getByRole('button',{name:'Editar',exact:true}).click();
    await expect(dialog.locator('#arquivo-atual')).toContainText('primeiro.pdf');
    await expect(dialog.getByRole('button',{name:'Visualizar PDF',exact:true})).toBeVisible();
    await expect(dialog.getByRole('button',{name:'Baixar PDF',exact:true})).toBeVisible();
    const replacement=fs.readFileSync(path.join(__dirname,'../../src/__tests__/fixtures/valid-xref-table.pdf'));
    await dialog.locator('input[type=file]').setInputFiles({name:'substituto.pdf',mimeType:'application/pdf',buffer:replacement});
    await dialog.locator('#salvar-conteudo').click();await expect(dialog).not.toBeVisible();
    await row.getByRole('button',{name:'Editar',exact:true}).click();await expect(dialog.locator('#arquivo-atual')).toContainText('substituto.pdf');
    downloadEvent=page.waitForEvent('download');await dialog.getByRole('button',{name:'Baixar PDF',exact:true}).click();download=await downloadEvent;
    expect(download.suggestedFilename()).toBe('substituto.pdf');const second=testInfo.outputPath('substituto.pdf');await download.saveAs(second);expect(fs.readFileSync(second)).toEqual(replacement);
    await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();
    // Remove only this test's PDF before the academic gate case: fixture has five contents.
    page.once('dialog',d=>d.accept());await row.getByRole('button',{name:'Excluir',exact:true}).click();await expect(row).toHaveCount(0);
});

test('@full Goal25 80% and 50% final persists failure for learner teacher and admin',async({page,browser},testInfo)=>{
    await login(page,'aluno.goal25@example.test','aluno');
    await page.goto(`/questionario.html?id_turma=${lab.id}&tipo=prova&id_questionario=${lab.final}`);
    await expect(page.locator('legend')).toHaveCount(4);
    for(let n=1;n<=4;n++) await page.getByLabel(n<=2?`Correta ${n}`:`Incorreta ${n}`,{exact:true}).check();
    const submission=page.waitForResponse(r=>r.url().endsWith('/submissoes'));await page.getByRole('button',{name:'Finalizar questionário',exact:true}).click();
    expect((await submission).status()).toBe(200);await expect(page.locator('#resultado-titulo')).toContainText('50.00%');
    await expect(page.locator('#resultado-descricao')).toContainText('Reprovado');await expect(page.locator('#resultado-descricao')).toContainText('não há nova tentativa');
    await page.reload();await expect(page.locator('#resultado-descricao')).toContainText('Reprovado');await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await page.goto('/sala-virtual.html');await expect(page.getByText('Reprovado',{exact:false})).toBeVisible();
    await page.goto(`/sala-progresso.html?id_turma=${lab.id}`);await expect(page.locator('#metrica-situacao')).toHaveText('Reprovado');await expect(page.locator('#metrica-prova')).toHaveText('50%');
    await expect(page.locator('#mensagem-progresso')).toContainText('Não há nova tentativa');
    for(const role of ['professor','admin']) {
        const context=await browser.newContext();await context.route('https://**/*',r=>r.abort());const manager=await context.newPage();await login(manager,`${role}.e2e@example.test`,role);
        await manager.goto(`/professor-turma-alunos.html?id_turma=${lab.id}`);
        await expect(manager.locator('#resumo-situacoes')).toContainText('Reprovado: 1');
        await manager.getByLabel('Filtrar alunos por situação').selectOption('REPROVADO');
        await expect(manager.locator('#pagina-alunos')).toContainText('1 alunos');
        for(const width of [320,390,1440]) {
            await manager.setViewportSize({width,height:900});
            const list=manager.locator(width<641?'#lista-alunos-mobile':'#lista-alunos');await expect(list).toContainText('50.00%');await expect(list).toContainText('80%');await expect(list.getByRole('button',{name:'Editar'})).toBeDisabled();
            expect(await manager.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+2)).toBe(true);
            await manager.screenshot({path:testInfo.outputPath(`${role}-${width}.png`)});
        }
        await manager.getByLabel('Filtrar alunos por situação').selectOption('APROVADO');await expect(manager.locator('#pagina-alunos')).toContainText('0 alunos');
        await context.close();
    }
});

test('@full Goal25 result survives restart of disposable app and database',async({page})=>{
    await login(page,'aluno.goal25@example.test','aluno');
    const response=await page.request.get(`/api/turmas/${lab.id}/questionarios/disponivel?tipo=prova&id_questionario=${lab.final}`);
    expect(response.status()).toBe(200);const q=(await response.json()).questionario;
    if(!q.tentativa_finalizada) {
        const csrf=(await (await page.request.get('/api/auth/csrf')).json()).csrf_token;
        const result=await page.request.post(`/api/questionarios/${lab.final}/submissoes`,{headers:{'X-CSRF-Token':csrf},data:{submission_id:require('node:crypto').randomUUID(),respostas:q.perguntas.map((p,i)=>({id_pergunta:p.id_pergunta,id_opcao:p.opcoes[i<2?0:1].id_opcao}))}});
        expect(result.status()).toBe(200);expect((await result.json()).resultado.percentual).toBe(50);
    }
    compose(['stop','app']);compose(['restart','db']);compose(['up','--detach','--wait','db']);compose(['up','--detach','--wait','app']);
    await page.goto(`/questionario.html?id_turma=${lab.id}&tipo=prova&id_questionario=${lab.final}`);
    await expect(page.locator('#resultado-descricao')).toContainText('Reprovado');await expect(page.locator('#resultado-titulo')).toContainText('50.00%');
});

test('@full Goal25 invalid addresses finish loading with clear recovery and no active form',async({page})=>{
    await login(page,'aluno.goal25@example.test','aluno');
    for(const query of ['', '?id_turma=-1', '?id_turma=NaN', '?id_turma=99999999', `?id_turma=${lab.id}&tipo=bad`, `?id_turma=${lab.id}&id_questionario=99999999`, `?id_turma=1&tipo=prova&id_questionario=${lab.final}`]) {
        await page.goto(`/questionario.html${query}`);
        await expect(page.getByRole('heading',{name:'Avaliação indisponível',exact:true})).toBeVisible();
        await expect(page.locator('#mensagem-questionario')).toHaveAttribute('role','alert');
        await expect(page.locator('#form-questionario')).toBeHidden();await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
        await expect(page.locator('main')).not.toContainText('Carregando');
        await expect(page.getByRole('link',{name:'Voltar à Sala Virtual',exact:true})).toHaveAttribute('href','/sala-virtual.html');
    }
    // Optional id_questionario remains supported.
    await page.goto(`/questionario.html?id_turma=${lab.id}&tipo=exercicio`);await expect(page.locator('legend')).toHaveCount(4);await expect(page.locator('#mensagem-questionario')).toBeHidden();
});

test('@full Goal25 public and private errors use safe language and clear loading',async({page})=>{
    await page.route('**/api/auth/login',r=>r.fulfill({status:503,json:{mensagem:'HTTP 503 JSON backend stack TypeError'}}),{times:1});
    await page.goto('/login.html');await page.getByLabel('E-mail',{exact:true}).fill('aluno.goal25@example.test');await page.getByLabel('Senha',{exact:true}).fill('E2e-only-password-42!');
    await page.getByRole('button',{name:'Entrar',exact:true}).click();
    await expect(page.locator('#mensagem-login')).toHaveAttribute('role','alert');
    await expect(page.locator('#mensagem-login')).toContainText('Confira sua conexão');
    await expect(page.locator('#mensagem-login')).not.toContainText('HTTP');await expect(page.locator('#form-login')).toHaveAttribute('aria-busy','false');
    await login(page,'aluno.goal25@example.test','aluno');
    await page.route('**/questionarios/disponivel?**',r=>r.fulfill({status:503,json:{mensagem:'HTTP JSON stack /app/private'}}),{times:1});
    await page.goto(`/questionario.html?id_turma=${lab.id}&tipo=prova&id_questionario=${lab.final}`);
    await expect(page.locator('#mensagem-questionario')).toHaveAttribute('role','alert');
    await expect(page.locator('#mensagem-questionario')).not.toContainText('HTTP');await expect(page.locator('#mensagem-questionario')).not.toContainText('/app/private');
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);await expect(page.locator('#form-questionario')).toBeHidden();
});

for(const [profile,email,role] of [['visitante',null,null],['aluno','aluno.goal25@example.test','aluno'],['professor','professor.e2e@example.test','professor'],['admin','admin.e2e@example.test','admin'],['expirada',null,null],['aluno-alheio','aluno2.e2e@example.test','aluno'],['professor-alheio','professor.goal25@example.test','professor']]) {
    test(`@full Goal25 page access matrix ${profile}`,async({page,context})=>{
        if(email)await login(page,email,role);
        if(profile==='expirada')await context.addCookies([{name:'plataforma_session',value:lab.expired,url:process.env.E2E_BASE_URL||'http://127.0.0.1:3400'}]);
        const paths=[['/sala-virtual.html',['aluno']], [`/sala-aulas.html?id_turma=${lab.id}`,['aluno']], [`/questionario.html?id_turma=${lab.id}&tipo=prova&id_questionario=${lab.final}`,['aluno']], [`/sala-progresso.html?id_turma=${lab.id}`,['aluno']], [`/meus-certificados.html?id_turma=${lab.id}`,['aluno']], [`/professor-turma-alunos.html?id_turma=${lab.id}`,['professor','admin']], ['/admin.html',['admin']]];
        for(const [url,roles] of paths) {
            const screen=await context.newPage();await screen.goto(url,{waitUntil:'commit'});
            if(!role)await expect(screen).toHaveURL(/login.html\?motivo=auth/);
            else if(!roles.includes(role))await expect(screen).toHaveURL(/index.html\?motivo=nao_autorizado/);
            else {
                await expect(screen.locator('body')).toHaveAttribute('data-session-state',role);
                if(profile.endsWith('-alheio')&&url.includes('id_turma')) {
                    await expect(screen.locator('main')).not.toContainText('Questão Goal25');
                    if(url.includes('professor-turma'))await expect(screen.locator('#mensagem-alunos')).toContainText('não possui acesso');
                    else if(url.includes('questionario'))await expect(screen.getByRole('heading',{name:'Avaliação indisponível'})).toBeVisible();
                }
            }
            await screen.waitForLoadState('load');await screen.close();
        }
    });
}
