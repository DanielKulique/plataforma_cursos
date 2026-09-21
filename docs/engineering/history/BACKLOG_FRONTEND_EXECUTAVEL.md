> **Histórico de engenharia.** Este registro preserva decisões e resultados da época; para desenvolver ou operar, use a [documentação vigente](../../index.md).

# Backlog pós-MVP do frontend

Os fluxos centrais estão implementados: catálogo público, login/logout por cookie, recuperação de senha, áreas de aluno e professor, CRUD administrativo e verificador condicionado à capacidade do servidor. Este arquivo substitui o backlog antigo baseado em JWT no `localStorage`.

Itens deliberadamente posteriores ao MVP:

- autoria avançada de conteúdos e questionários;
- upload e gestão de arquivos;
- e-commerce, pagamentos e assinaturas;
- certificados e gamificação;
- notificações e auditoria avançadas;
- internacionalização e aplicativo mobile;
- acessibilidade WCAG completa e testes end-to-end em múltiplos navegadores;
- refinamentos visuais que não bloqueiem login, catálogo, matrícula, estudo ou administração.

Novas tarefas devem indicar endpoint real, papel autorizado, estado de carregamento/erro/vazio, comportamento móvel, proteção CSRF em mutações e teste automatizado correspondente. Não reintroduza armazenamento de JWT no navegador nem chamadas diretas ao motor de IA.
