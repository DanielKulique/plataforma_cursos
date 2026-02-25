import { clearToken, getCurrentUser, getToken } from './auth.js';

const statusUsuario = document.getElementById('status-usuario');
const mensagemTurma = document.getElementById('mensagem-turma');
const turmaTitle = document.getElementById('turma-title');
const tituloAlunos = document.getElementById('titulo-alunos');
const subtituloAlunos = document.getElementById('subtitulo-alunos');
const listaAlunosTurma = document.getElementById('lista-alunos-turma');
const btnLogout = document.getElementById('btn-logout');

// Elementos do modal
const modalEdicao = document.getElementById('modal-edicao');
const formEdicaoMatricula = document.getElementById('form-edicao-matricula');
const notaFinalInput = document.getElementById('nota-final');
const statusAprovacaoInput = document.getElementById('status-aprovacao');
const progressoInput = document.getElementById('progresso');
const fecharModal = document.getElementById('fechar-modal');
const cancelarModal = document.getElementById('cancelar-modal');

const params = new URLSearchParams(window.location.search);
const idTurma = Number(params.get('id_turma'));

// Variáveis para armazenar dados da matrícula sendo editada
let matriculaEditando = null;

function formatarStatusAprovacao(status) {
    const texto = String(status || '').trim();
    const upper = texto.toUpperCase();

    if (upper.includes('APROVADO')) return 'badge badge--success';
    if (upper.includes('CURSANDO')) return 'badge badge--warning';
    if (upper.includes('REPROVADO') || upper.includes('CANCELADO')) return 'badge badge--danger';
    return 'badge badge--neutral';
}

function formatarProgresso(progresso) {
    const valor = Number(progresso);
    if (isNaN(valor)) return '0%';
    
    if (valor >= 100) return 'Concluído';
    if (valor >= 75) return 'Avançado';
    if (valor >= 50) return 'Intermediário';
    if (valor >= 25) return 'Básico';
    return 'Iniciante';
}

function configurarLogout() {
    if (!btnLogout) return;

    btnLogout.addEventListener('click', () => {
        clearToken();
        window.location.href = '/login.html';
    });
}

function abrirModal(matricula) {
    matriculaEditando = matricula;
    
    // Preencher o formulário com os dados atuais
    notaFinalInput.value = matricula.nota_final || '';
    statusAprovacaoInput.value = matricula.status_aprovacao || 'CURSANDO';
    progressoInput.value = matricula.progresso_percentual || '';
    
    // Exibir o modal
    modalEdicao.style.display = 'block';
}

function fecharModalHandler() {
    modalEdicao.style.display = 'none';
    matriculaEditando = null;
}

function renderizarAlunos(alunos = []) {
    if (!listaAlunosTurma) return;

    listaAlunosTurma.innerHTML = '';

    if (alunos.length === 0) {
        listaAlunosTurma.innerHTML = `
            <tr>
                <td colspan="6" class="empty-state">Nenhum aluno matriculado nesta turma.</td>
            </tr>
        `;
        return;
    }

    alunos.forEach((aluno) => {
        const row = document.createElement('tr');
        
        row.innerHTML = `
            <td>${aluno.nome_completo || 'Nome não informado'}</td>
            <td>${aluno.email || 'Email não informado'}</td>
            <td>
                <div class="progress-cell">
                    <span class="progress-value">${aluno.progresso_percentual || 0}%</span>
                    <span class="progress-label">${formatarProgresso(aluno.progresso_percentual)}</span>
                </div>
            </td>
            <td>${aluno.nota_final !== null ? aluno.nota_final.toFixed(1) : 'N/A'}</td>
            <td><span class="${formatarStatusAprovacao(aluno.status_aprovacao)}">${aluno.status_aprovacao || 'N/A'}</span></td>
            <td>
                <button class="action-button action-button--small" onclick="abrirModal(${JSON.stringify(aluno).replace(/"/g, '"')})">
                    Editar
                </button>
            </td>
        `;

        listaAlunosTurma.appendChild(row);
    });
}

async function atualizarMatricula(matriculaId, dadosAtualizacao) {
    const token = getToken();
    
    try {
        const response = await fetch(`/api/matriculas/${matriculaId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(dadosAtualizacao)
        });

        if (response.status === 401) {
            clearToken();
            window.location.href = '/login.html?motivo=auth';
            return null;
        }

        if (response.status === 403) {
            throw new Error('Você não tem permissão para atualizar esta matrícula.');
        }

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.mensagem || 'Erro ao atualizar matrícula.');
        }

        const result = await response.json();
        return result;
    } catch (error) {
        console.error('Erro ao atualizar matrícula:', error);
        throw error;
    }
}

async function carregarAlunosTurma() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login.html?motivo=auth';
        return;
    }

    if (!Number.isInteger(idTurma) || idTurma <= 0) {
        window.location.href = '/professor.html?motivo=turma_invalida';
        return;
    }

    try {
        const usuario = await getCurrentUser();

        if (!usuario) {
            window.location.href = '/login.html?motivo=auth';
            return;
        }

        // Verificar se o usuário é professor
        if (String(usuario.tipo || '').toUpperCase() !== 'PROFESSOR') {
            window.location.href = '/index.html?motivo=nao_autorizado';
            return;
        }

        if (statusUsuario) {
            statusUsuario.textContent = `Professor logado: ${usuario.nome_completo}`;
        }

        // Carregar informações da turma
        const turmaResponse = await fetch(`/api/turmas/${idTurma}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (turmaResponse.status === 401) {
            clearToken();
            window.location.href = '/login.html?motivo=auth';
            return;
        }

        if (!turmaResponse.ok) {
            throw new Error('Não foi possível carregar os dados da turma.');
        }

        const turmaData = await turmaResponse.json();
        
        if (turmaTitle) {
            turmaTitle.textContent = turmaData.nome_turma || 'Turma';
        }
        
        if (tituloAlunos) {
            tituloAlunos.textContent = `Alunos Matriculados em ${turmaData.nome_turma}`;
        }
        
        if (subtituloAlunos) {
            subtituloAlunos.textContent = `Lista de alunos e seu desempenho na turma ${turmaData.nome_turma}.`;
        }

        // Carregar alunos matriculados na turma
        const alunosResponse = await fetch(`/api/matriculas/turma/${idTurma}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (alunosResponse.status === 401) {
            clearToken();
            window.location.href = '/login.html?motivo=auth';
            return;
        }

        if (alunosResponse.status === 403) {
            window.location.href = '/index.html?motivo=nao_autorizado';
            return;
        }

        if (!alunosResponse.ok) {
            throw new Error('Não foi possível carregar os alunos da turma.');
        }

        const alunosData = await alunosResponse.json();
        renderizarAlunos(Array.isArray(alunosData.matriculas) ? alunosData.matriculas : []);

        if (mensagemTurma) {
            const total = Array.isArray(alunosData.matriculas) ? alunosData.matriculas.length : 0;
            mensagemTurma.textContent = total > 0 
                ? `Esta turma tem ${total} aluno(s) matriculado(s).`
                : 'Esta turma não tem alunos matriculados no momento.';
        }
    } catch (error) {
        console.error('Erro ao carregar turma e alunos:', error);
        if (mensagemTurma) {
            mensagemTurma.textContent = error.message || 'Erro ao carregar dados da turma.';
        }
        if (listaAlunosTurma) {
            listaAlunosTurma.innerHTML = `
                <tr>
                    <td colspan="6" class="error-state">Erro ao carregar alunos da turma.</td>
                </tr>
            `;
        }
    }
}

// Event listeners para o modal
function setupModalEventListeners() {
    if (fecharModal) {
        fecharModal.onclick = fecharModalHandler;
    }
    
    if (cancelarModal) {
        cancelarModal.onclick = fecharModalHandler;
    }
    
    if (formEdicaoMatricula) {
        formEdicaoMatricula.onsubmit = async (event) => {
            event.preventDefault();
            
            if (!matriculaEditando) {
                alert('Nenhuma matrícula selecionada para edição.');
                return;
            }
            
            const dadosAtualizacao = {};
            
            if (notaFinalInput.value !== '') {
                dadosAtualizacao.nota_final = parseFloat(notaFinalInput.value);
            }
            
            if (statusAprovacaoInput.value) {
                dadosAtualizacao.status_aprovacao = statusAprovacaoInput.value;
            }
            
            if (progressoInput.value !== '') {
                dadosAtualizacao.progresso_percentual = parseInt(progressoInput.value);
            }
            
            try {
                const result = await atualizarMatricula(matriculaEditando.id_matricula, dadosAtualizacao);
                
                if (result) {
                    alert('Matrícula atualizada com sucesso!');
                    
                    // Fechar modal e recarregar a lista de alunos
                    fecharModalHandler();
                    carregarAlunosTurma();
                }
            } catch (error) {
                alert('Erro ao atualizar matrícula: ' + error.message);
            }
        };
    }
    
    // Fechar modal ao clicar fora dele
    window.onclick = (event) => {
        if (event.target === modalEdicao) {
            fecharModalHandler();
        }
    };
}

// Função global para abrir o modal (necessária para onclick no HTML)
window.abrirModal = abrirModal;

window.addEventListener('load', () => {
    configurarLogout();
    setupModalEventListeners();
    carregarAlunosTurma();
});