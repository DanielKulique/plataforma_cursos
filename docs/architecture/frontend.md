# Frontend

O frontend é composto por páginas HTML, CSS e JavaScript em `src/public`, servido pelo Express.
Não há framework SPA, bundler ou etapa de transpilar a interface. Cada página carrega seus
scripts; módulos compartilhados evitam repetir sessão, navegação e contexto acadêmico.

## Áreas

| Área | Entradas principais |
| --- | --- |
| Público | `landing.html`, `index.html`, páginas institucionais, login e cadastro |
| Identidade | `verificar-email.html`, `recuperar-senha.html`, `redefinir-senha.html` |
| Aluno | `sala-virtual.html`, `sala-aula.html`, `sala-aulas.html`, `sala-avaliacoes.html`, `sala-progresso.html` |
| Professor | `professor.html`, `professor-turma.html` e páginas de aulas, alunos, avaliações e certificados |
| Administração | `admin.html` |
| Certificados | `meus-certificados.html`, `certificados-validar.html` |

`js/api.js` centraliza comunicação, erros e sessão; `auth.js`/`session-ui.js` tratam identidade
visível. `student-course-context.js` e `teacher-class-context.js` resolvem o contexto das turmas.
`learning-path.js` organiza apresentação de aulas e seus itens. O resumo visual da aula
não é o cálculo de aprovação do backend.

Os estilos se organizam em tokens, base, componentes, layouts, responsividade e folhas específicas.
Imagens publicadas ficam em `assets`; os originais de equipe foram preservados fora dali.
A pasta `assets/materiais` contém referências legadas, mas seu acesso estático é bloqueado:
a leitura passa pela API privada.

## Alterações e validação

Mantenha IDs e contratos usados pelos scripts da página. Trate carregamento, vazio, erro,
sessão expirada e recuperação sem loops de requisição. PDFs privados usam download autenticado;
não componha URLs diretas para storage. Não salve JWT em localStorage.

Confirme navegação e layout nos tamanhos relevantes quando mudar interface. Os
[testes](../testing/overview.md) incluem contratos de frontend, segurança e resiliência.
Capturas antigas são [evidência visual](../engineering/evidence/README.md), não prova de
que uma versão nova foi validada no navegador.
