// /src/public/js/script.js

async function carregarSessaoUsuario() {
    const statusUsuario = document.getElementById('status-usuario');
    if (!statusUsuario) return;

    const token = localStorage.getItem('token');

    if (!token) {
        statusUsuario.textContent = 'Você não está logado.';
        return;
    }

    try {
        const response = await fetch('/api/auth/me', {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (response.status === 401) {
            statusUsuario.textContent = 'Sessão inválida ou expirada. Faça login novamente.';
            return;
        }

        if (!response.ok) {
            throw new Error('Falha ao consultar sessão do usuário.');
        }

        const data = await response.json();
        statusUsuario.textContent = `Bem-vindo, ${data.usuario.nome_completo}! (${data.usuario.tipo})`;
    } catch (error) {
        console.error('Erro ao carregar sessão do usuário:', error);
        statusUsuario.textContent = 'Não foi possível carregar a sessão do usuário.';
    }
}

async function carregarCursos() {
    try {
        const response = await fetch('/api/cursos');

        if (!response.ok) {
            throw new Error('A resposta da rede não foi ok');
        }

        const cursos = await response.json();

        const listaHtml = document.getElementById('lista-de-cursos');
        if (!listaHtml) return;

        listaHtml.innerHTML = '';

        cursos.forEach(curso => {
            const item = document.createElement('li');
            item.textContent = `${curso.nome_curso} (${curso.carga_horaria}h)`;
            listaHtml.appendChild(item);
        });
    } catch (error) {
        console.error('Houve um problema com a operação de fetch dos cursos:', error);
        const listaHtml = document.getElementById('lista-de-cursos');
        if (listaHtml) {
            listaHtml.innerHTML = '<li>Não foi possível carregar os cursos.</li>';
        }
    }
}

window.addEventListener('load', async () => {
    await carregarSessaoUsuario();
    await carregarCursos();
});
