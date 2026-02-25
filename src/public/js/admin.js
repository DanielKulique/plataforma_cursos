import { requireRole } from './auth.js';
import { getCurrentUser } from './auth.js';

function montarBlocoAdmin(titulo, descricao) {
    const article = document.createElement('article');
    article.className = 'admin-block';
    article.innerHTML = `<h3>${titulo}</h3><p>${descricao}</p>`;
    return article;
}

export async function initAdminPanel() {
    if (!(await requireRole(['ADMIN']))) {
        return;
    }

    const alvo = document.getElementById('admin-root') || document.body;
    const usuario = await getCurrentUser().catch(() => null);

    alvo.innerHTML = '';

    const statusUsuario = document.createElement('p');
    statusUsuario.className = 'admin-user';
    statusUsuario.textContent = usuario
        ? `Acesso autorizado para: ${usuario.nome_completo} (${usuario.tipo})`
        : 'Acesso administrativo autorizado.';

    const resumo = document.createElement('section');
    resumo.className = 'admin-summary';
    resumo.innerHTML = `
        <p class="admin-kicker">Painel pronto</p>
        <h2>Gestão administrativa</h2>
        <p>Estrutura inicial carregada com sucesso. Próximo passo: conectar CRUDs de cursos, turmas e usuários.</p>
    `;

    const grid = document.createElement('section');
    grid.className = 'admin-grid';
    grid.appendChild(montarBlocoAdmin('Cursos', 'Criação e manutenção de trilhas de aprendizado.'));
    grid.appendChild(montarBlocoAdmin('Turmas', 'Abertura de turmas e configuração de períodos.'));
    grid.appendChild(montarBlocoAdmin('Usuários', 'Controle de acesso e gerenciamento de perfis.'));

    alvo.appendChild(statusUsuario);
    alvo.appendChild(resumo);
    alvo.appendChild(grid);
}

initAdminPanel();