// /src/public/js/script.js

// Quando a página terminar de carregar
window.addEventListener('load', () => {
    
    // 1. Pede os dados para a API do back-end
    // CORREÇÃO AQUI: o caminho começa com '/'
    fetch('/api/cursos')
        .then(response => {
            // Verifica se a requisição foi bem sucedida
            if (!response.ok) {
                throw new Error('A resposta da rede não foi ok');
            }
            return response.json(); // 2. Converte a resposta para JSON
        }) 
        .then(cursos => { // 3. 'cursos' é o array de dados: [{...}]
            
            const listaHtml = document.getElementById('lista-de-cursos');
            if (!listaHtml) return; // Garante que o elemento existe

            // Limpa qualquer conteúdo antigo
            listaHtml.innerHTML = '';

            // 4. Para cada curso recebido, cria um item <li> e o insere no HTML
            cursos.forEach(curso => {
                const item = document.createElement('li');
                item.textContent = `${curso.nome_curso} (${curso.carga_horaria}h)`;
                listaHtml.appendChild(item);
            });
        })
        .catch(error => {
            // Adiciona um tratamento de erro para ajudar a depurar
            console.error('Houve um problema com a sua operação de fetch:', error);
            const listaHtml = document.getElementById('lista-de-cursos');
            if (listaHtml) {
                listaHtml.innerHTML = '<li>Não foi possível carregar os cursos.</li>';
            }
        });
});
