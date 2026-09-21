# Segurança

A plataforma protege sessão, vínculos acadêmicos e arquivos privados no backend. Esconder
um botão ou conhecer um ID não concede nem retira permissão.

## Identidade e autorização

JWT em cookie HttpOnly, Secure em produção e SameSite=Lax; CSRF obrigatório em mutações
com cookie. O banco fornece perfil atual e versão de sessão. Senhas usam bcrypt. Reset
armazena hash do token e exige expiração/uso único. Fluxos de reenvio/recuperação evitam
revelar se uma conta existe; cadastro ainda possui suas validações próprias de disponibilidade.

ALUNO acessa sua matrícula; PROFESSOR administra apenas turmas pelas quais é responsável;
ADMIN tem funções globais, mas respeita invariantes acadêmicas. Autoria estrutural revalida
vínculo e estado sob lock transacional. Alterar professor ou encerrar turma impede escrita
que dependia do estado anterior. Campos não permitidos são rejeitados nos contratos aplicáveis.

## Arquivos e certificados

Materiais e certificados ficam fora da publicação estática. A rota `/assets/materiais`
é bloqueada para impedir bypass das referências legadas. Downloads conferem titularidade/vínculo,
cache privado e disponibilidade. Storage recusa paths inseguros e namespaces sobrepostos.

Upload de material exige autorização antes de multipart e novamente na persistência,
um arquivo PDF, nome/extensão/MIME/cabeçalho válidos e tamanho máximo (20 MB padrão).
Um worker valida estrutura e páginas com limite de tempo; PDF corrompido, vazio ou com
senha é recusado. O processo não é um antivírus nem uma análise de todo conteúdo possível de PDF.

Certificados usam snapshot, código e SHA-256 dos bytes finais. Comparação pública aceita
PDF em memória (10 MB padrão), sem armazenar upload anônimo permanentemente. Consulta pública
minimiza dados e não libera o arquivo. Revogação e reemissão preservam versões e auditoria.
Hash não equivale a assinatura digital de uma autoridade externa.

## Transporte, limites e erros

Caddy termina HTTPS; Express usa Helmet/CSP, JSON limitado a 256 KB, CORS configurado e
proxy confiável de um salto em produção. O app não deve ficar exposto por fora desse proxy.

| Controle | Padrão |
| --- | --- |
| Login por IP | 20 / 15 minutos |
| Recuperação / reset por IP | 5 / 10 por 15 minutos, respectivamente |
| Envio de código por IP / identidade | 20 / 5 por 15 minutos |
| Confirmação por IP / identidade | 60 / 10 por 15 minutos |
| Consulta / upload de certificado por IP | 30 / 10 por minuto |
| Detector contextual | Limites próprios configuráveis; capacidade opcional |

Consulte [variáveis](../getting-started/environment-variables.md). Limites em memória não são
um limitador distribuído entre múltiplas réplicas. Erros inesperados usam mensagem segura;
logs redigem secrets, tokens e dados sensíveis, sem body completo. Saúde pública é mínima;
diagnósticos e métricas exigem ADMIN. Fila de banco saturada tem erro controlado; investigue
a causa sem expor SQL ao cliente.

## Configuração e operação

Variáveis críticas, identidade do banco e storages são verificados em modo fail-closed.
O detector desabilitado não autoriza fallback externo. E-mail desabilitado não expõe códigos.
Credenciais reais permanecem fora do Git, imagens e backups. Backups têm checksums e destino
privado; secrets de recuperação são obtidos por canal independente.

O histórico do projeto registra que `.env.test` já esteve versionado. A rotação de credenciais
atingidas deve ser verificada pelo operador; arquivar ou remover um arquivo não revoga credenciais.
Veja [backup](../operations/backup-and-restore.md) e [autenticação](../api/authentication.md).
