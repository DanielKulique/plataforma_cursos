# Playwright E2E

## Requisitos

- Docker Engine e `docker compose` v2.
- Node.js 20 ou superior e dependências do repositório instaladas.
- Browsers Playwright: `npx playwright install chromium firefox webkit` (Linux CI usa `npx playwright install --with-deps chromium firefox webkit`).
- Porta `3400` livre para servir a aplicação localmente.

## Execução

```sh
npm run test:e2e:smoke
npm run test:e2e
npm run test:e2e:firefox-critical
npm run test:e2e:webkit
npm run test:e2e:headed
npm run test:e2e:ui
npm run test:e2e:mobile
```

Cada execução cria um nome Compose isolado, inicializa um MySQL 8.4 vazio, aplica migrations, aplica migrations novamente para verificar NO-OP, executa o seed E2E duas vezes para conferir idempotência, sobe a aplicação e roda o browser. Ao final, remove os containers e volumes temporários. `compose.e2e.yaml` não monta `schema.sql` de snapshot e não publica porta do MySQL. A porta HTTP fica limitada ao loopback.

O banco usa a identidade canônica `plataforma_cursos_test`, mas está em instância MySQL efêmera criada pelo próprio projeto Compose. A conexão do app ao banco ocorre somente na rede privada do projeto, em `db:3306`. O serviço de integração existente em `127.0.0.1:33307` não é utilizado.

O seed contém contas `@example.test`, curso, turmas em três estados, matrícula, conteúdo texto/vídeo/link e prova final com quatro questões para verificar a fronteira de 75%. A senha existe apenas na fixture E2E e no ambiente descartável. `EMAIL_DELIVERY_ENABLED=false`, `PUBLIC_REGISTRATION_EMAIL_VERIFICATION_REQUIRED=false`, detector externo desligado e chamadas HTTP externas do browser são interceptadas.

Os fluxos E2E também cobrem escrita administrativa por perfil, replicação com estrutura e IDs independentes, ausência de matrícula/progresso/tentativas/respostas/certificados no destino, autoria de exercício pelo professor, resposta sem gabarito para o aluno, upload/download protegido de PDF com substituição inválida, conclusão acadêmica, certificado privado/público e ciclo de reemissão/revogação. A integração de replicação verifica diretamente os vínculos e a ausência de estado pessoal persistido.

A tela de certificados usa respostas interceptadas para os status HTTP 400, 401, 403, 404, 409, 422, 429, 500 e 503. O teste verifica mensagens seguras, ausência de erro não tratado e manutenção do contexto do curso quando a lista secundária falha. A matriz de papéis navega por telas privadas de aluno, professor e administrador.

O smoke de seis etapas valida landing, login, Sala Virtual, aula com YouTube, avaliações e progresso. A CI executa o conjunto completo em Chromium, Firefox e WebKit, sem retries. Os viewports incluem 320, 360, 390, 412, 768 e 1440 px, com verificação da largura global do documento nas telas críticas.

## Relatórios e depuração

- Relatório HTML: `playwright-report/index.html`.
- Screenshot e contexto de falha: `test-results/`.
- Trace em falha somente em testes sem sessão autenticada. Os fluxos com senha/cookie/CSRF desligam trace para impedir que credenciais transitórias apareçam em evidências.
- Não armazene screenshots, traces ou logs de sessões reais. As contas deste ambiente são descartáveis.
- A suíte não usa `sleep` para sincronizar; o runner aguarda `/readyz` e os testes aguardam respostas/elementos.

Os testes Playwright são organizados em `tests/e2e/`. Marque novos fluxos rápidos com `@smoke`; deixe casos de regressão extensa e responsividade com `@full`. Prefira roles/labels acessíveis. `test:e2e:smoke` seleciona o smoke; `test:e2e` executa os grupos smoke e full.

Neste workspace Linux, o WebKit local está sem `libwebkitgtk-6.0.so.4`, `libjavascriptcoregtk-6.0.so.1` e outras bibliotecas requeridas; `playwright install-deps` não pode instalá-las porque a sessão não tem autorização `sudo`. Registre o teste WebKit como não validado localmente. O workflow instala essas dependências com `--with-deps` e guarda relatório, screenshot e trace em falha. A existência dessa etapa no workflow não comprova uma execução real: consulte o resultado do GitHub Actions antes de declarar WebKit validado.

O runner sempre remove os recursos Compose ao terminar, mesmo se migrations ou browser falharem. Relatórios permanecem no workspace para depuração.
