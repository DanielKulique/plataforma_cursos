> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Checklist de staging

Execute em ambiente descartável equivalente à produção, com domínio HTTPS e Resend configurado. Registre data, commit, operador e resultado de cada item.

## Automação e infraestrutura

- [ ] `npm ci` e `npm run test:stability` concluem sem retry nas duas passagens.
- [ ] `docker build -t plataforma-cursos:staging .` conclui e a imagem executa como usuário `node`.
- [ ] `docker compose --env-file .env.production config --quiet` é válido.
- [ ] Somente 80/443 aparecem publicados; 3306 não está acessível externamente.
- [ ] `GET https://<dominio>/healthz` retorna 200 e os containers ficam saudáveis.
- [ ] Reiniciar `app` não perde dados; parar o MySQL torna o healthcheck do app indisponível.

## Sessão e autorização

- [ ] Login válido cria `plataforma_session` com `HttpOnly`, `Secure`, `SameSite=Lax` e sem JWT no corpo ou storage do navegador.
- [ ] Login inválido não autentica e o rate limit responde de forma controlada.
- [ ] `/api/auth/me` funciona com o cookie; mutação sem `X-CSRF-Token`, com token incorreto ou de outra sessão retorna 403.
- [ ] Perfis ALUNO, PROFESSOR e ADMIN só acessam suas rotas.
- [ ] Logout retorna 204, limpa o cookie e invalida a sessão anterior.

## Recuperação de senha

- [ ] E-mail existente e inexistente recebem exatamente status 202 e a mesma mensagem pública.
- [ ] A mensagem real chega pelo Resend e o link HTTPS mantém o token no fragmento `#token=`, não na query string.
- [ ] Token expirado, inválido ou reutilizado é recusado; senha fraca é recusada.
- [ ] Token válido troca a senha, invalida sessões antigas e só permite login com a senha nova.
- [ ] Logs do app/Caddy não contêm token, senha, cookie, JWT ou chave do Resend.

## Detector opcional e interface

- [ ] Com `DETECTOR_ENABLED=false`, dashboard/login/cursos continuam utilizáveis, o link do verificador fica oculto e as rotas retornam 503 controlado.
- [ ] Se o detector fizer parte da entrega, habilite a flag e valide autenticação interna, timeout e respostas sem depender do navegador acessar o FastAPI.
- [ ] Navegação por teclado, foco visível, labels de formulários, estados de carregamento/erro e layout móvel foram verificados nas páginas principais.

## Fluxos funcionais por papel

### ALUNO

- [ ] Login e logout funcionam; voltar/recarregar após logout não recupera a sessão.
- [ ] Catálogo e detalhe de curso/turma exibem carregamento, vazio, sucesso e erro de rede.
- [ ] Matrícula válida é criada; duplicidade e turma indisponível mostram erro seguro; cancelamento exige confirmação.
- [ ] Sala virtual lista somente as matrículas do aluno e abre conteúdos autorizados.
- [ ] PDF acadêmico retorna 404 pela URL estática, 401 sem sessão, 403 sem matrícula e 200 somente pela rota autenticada do conteúdo.
- [ ] Vídeo, texto, PDF, link e atividade expõem a mesma ação de conclusão; iniciar/concluir atualiza o progresso derivado e persiste após recarregar/reiniciar containers.
- [ ] Questionário ativo aceita exatamente uma resposta por pergunta, informa resultado e recusa payload incompleto, gabarito ou pontuação enviados pelo cliente.
- [ ] Repetir a mesma submissão após timeout/reload reutiliza a tentativa; refazer deliberadamente cria uma nova tentativa.
- [ ] Turma ENCERRADA bloqueia leitura acadêmica, progresso, submissões e mudanças na estrutura até ser reaberta.

### PROFESSOR

- [ ] Login redireciona para a área do professor e lista somente turmas autorizadas.
- [ ] Acompanhamento exibe alunos, notas, progresso automático e estados vazios/erro/sucesso.
- [ ] Professor altera nota/situação, mas não o progresso; aprovação/reprovação final exige 100% dos conteúdos e nota informada.
- [ ] Atualizações permitidas persistem; turmas de outro professor e operações administrativas retornam 403.
- [ ] Conteúdo/pergunta/questionário com histórico acadêmico não pode ser removido ou reescrito destrutivamente.
- [ ] Controles sem endpoint real não aparecem como ações disponíveis.

### ADMIN

- [ ] Bootstrap inicial é idempotente e não imprime senha; confirmação de produção é exigida.
- [ ] CRUD de usuários, cursos e turmas cobre criar, listar, editar e remover com confirmação.
- [ ] Duplicidades, último ADMIN, autoexclusão e vínculos acadêmicos são protegidos.
- [ ] Troca da própria senha encerra a sessão anterior e exige novo login.
- [ ] ALUNO e PROFESSOR não acessam painel nem endpoints administrativos.

## Operação

- [ ] Backup gerado, `gzip -t` aprovado e cópia transferida para armazenamento externo criptografado.
- [ ] Restore foi ensaiado em banco descartável e seguido de `npm run db:schema:verify` e smoke funcional.
- [ ] Migration foi aplicada duas vezes em cópia do banco e permaneceu idempotente; bootstrap também foi repetido sem duplicação.
- [ ] Segredos estão no cofre/arquivo restrito, não no Git; valores historicamente expostos foram rotacionados.
- [ ] Rollback para a imagem anterior foi ensaiado e possui responsável definido.
