const express = require('express');
const request = require('supertest');

jest.mock('../middlewares/checkAuth.middleware', () => (req, res, next) => {
    req.user = {
        id_usuario: Number(req.headers['x-user-id'] || 3),
        tipo: String(req.headers['x-role'] || 'ALUNO')
    };
    next();
});
jest.mock('../api/models/conteudos.models', () => ({
    buscarTurma: jest.fn(),
    professorEhDaTurma: jest.fn(),
    alunoEstaMatriculado: jest.fn(),
    listarModulos: jest.fn(),
    criarModulo: jest.fn(),
    buscarEscopoModulo: jest.fn(),
    atualizarModulo: jest.fn(),
    removerModulo: jest.fn(),
    listar: jest.fn(),
    criar: jest.fn(),
    atualizar: jest.fn(),
    remover: jest.fn(),
    buscarEscopo: jest.fn(),
    buscarMaterial: jest.fn(),
    registrarProgresso: jest.fn(),
    listarProgressoTurma: jest.fn()
}));
jest.mock('../api/models/questoes.models', () => ({
    buscarTurma: jest.fn(),
    professorEhDaTurma: jest.fn(),
    matriculado: jest.fn(),
    criarQuestionario: jest.fn(),
    criarPergunta: jest.fn(),
    escopoQuestionario: jest.fn(),
    escopoOpcao: jest.fn(),
    criarOpcao: jest.fn(),
    atualizarOpcao: jest.fn(),
    removerOpcao: jest.fn(),
    atualizarQuestionario: jest.fn(),
    removerQuestionario: jest.fn(),
    escopoPergunta: jest.fn(),
    listarMetadadosTurma: jest.fn(),
    listarAluno: jest.fn(),
    atualizarPergunta: jest.fn(),
    removerPergunta: jest.fn(),
    submeter: jest.fn(),
    historico: jest.fn(),
    resultadosTurma: jest.fn()
}));

const conteudosModel = require('../api/models/conteudos.models');
const questoesModel = require('../api/models/questoes.models');
const conteudosRoutes = require('../api/routes/conteudos.routes');
const questoesRoutes = require('../api/routes/questoes.routes');

const app = express();
app.use(express.json());
app.use('/api', conteudosRoutes);
app.use('/api', questoesRoutes);
app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    return res.status(error.status || 500).json({ mensagem: error.message });
});

describe('rotas do Goal 3', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        conteudosModel.buscarTurma.mockResolvedValue({ id_turma: 10, id_professor: 2 });
        conteudosModel.alunoEstaMatriculado.mockResolvedValue(true);
        conteudosModel.professorEhDaTurma.mockResolvedValue(true);
        conteudosModel.listarModulos.mockResolvedValue([
            { id_modulo: 1, id_turma: 10, titulo: 'Módulo real', ordem: 1 }
        ]);
        conteudosModel.listar.mockResolvedValue([
            { id_conteudo: 1, id_modulo: 1, titulo: 'Aula real', tipo: 'TEXTO', url: null }
        ]);
        questoesModel.buscarTurma.mockResolvedValue({ id_turma: 10, id_professor: 2 });
        questoesModel.professorEhDaTurma.mockResolvedValue(true);
        questoesModel.matriculado.mockResolvedValue(true);
        questoesModel.historico.mockResolvedValue({ items: [], total: 0 });
    });

    it('lista módulos e conteúdos reais para aluno matriculado', async () => {
        const response = await request(app).get('/api/turmas/10/conteudos');

        expect(response.status).toBe(200);
        expect(response.body.modulos[0].conteudos[0].titulo).toBe('Aula real');
        expect(conteudosModel.listar).toHaveBeenCalledWith('10', 3);
    });

    it('nega conteúdo ao aluno sem matrícula', async () => {
        conteudosModel.alunoEstaMatriculado.mockResolvedValue(false);

        const response = await request(app).get('/api/turmas/10/conteudos');

        expect(response.status).toBe(403);
        expect(conteudosModel.listar).not.toHaveBeenCalled();
    });

    it('remove URL insegura de conteúdo legado na saída', async () => {
        conteudosModel.listar.mockResolvedValue([
            { id_conteudo: 1, id_modulo: 1, titulo: 'Aula', tipo: 'LINK', url: 'javascript:alert(1)' }
        ]);

        const response = await request(app).get('/api/turmas/10/conteudos');

        expect(response.status).toBe(200);
        expect(response.body.conteudos[0]).toMatchObject({ url: null, url_bloqueada: true });
    });

    it('normaliza vídeo legado para o host incorporável permitido', async () => {
        conteudosModel.listar.mockResolvedValue([
            { id_conteudo: 1, id_modulo: 1, titulo: 'Aula', tipo: 'VIDEO', url: 'https://www.youtube.com/watch?v=JeaZc8_hqAk' }
        ]);

        const response = await request(app).get('/api/turmas/10/conteudos');

        expect(response.status).toBe(200);
        expect(response.body.conteudos[0]).toMatchObject({
            url: 'https://www.youtube-nocookie.com/embed/JeaZc8_hqAk',
            url_bloqueada: false
        });
    });

    it('lista questionário ativo sem expor gabarito', async () => {
        questoesModel.listarAluno.mockResolvedValue({
            id_questionario: 5,
            perguntas: [{ id_pergunta: 8, opcoes: [{ id_opcao: 13, texto_opcao: 'Resposta' }] }]
        });

        const response = await request(app)
            .get('/api/turmas/10/questionarios/disponivel?tipo=exercicio');

        expect(response.status).toBe(200);
        expect(JSON.stringify(response.body)).not.toContain('correta');
    });

    it('retorna metadados vazios com 200 para professor responsável', async () => {
        questoesModel.listarMetadadosTurma.mockResolvedValue([]);

        const response = await request(app)
            .get('/api/turmas/10/questionarios')
            .set('x-role', 'PROFESSOR')
            .set('x-user-id', '2');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ questionarios: [] });
    });

    it('nega metadados de turma alheia ao professor', async () => {
        questoesModel.professorEhDaTurma.mockResolvedValue(false);

        const response = await request(app)
            .get('/api/turmas/10/questionarios')
            .set('x-role', 'PROFESSOR')
            .set('x-user-id', '99');

        expect(response.status).toBe(403);
        expect(questoesModel.listarMetadadosTurma).not.toHaveBeenCalled();
    });

    it('rejeita alternativas com ordem repetida antes de iniciar a criação', async () => {
        const response = await request(app)
            .post('/api/questionarios/5/perguntas')
            .set('x-role', 'PROFESSOR')
            .set('x-user-id', '2')
            .send({
                texto_pergunta: 'Pergunta válida?',
                ordem: 1,
                pontos: 1,
                opcoes: [
                    { texto_opcao: 'Sim', ordem: 1, correta: true },
                    { texto_opcao: 'Não', ordem: 1, correta: false }
                ]
            });

        expect(response.status).toBe(400);
        expect(response.body.erros[0].msg).toContain('ordens diferentes');
        expect(questoesModel.criarPergunta).not.toHaveBeenCalled();
    });

    it('propaga erro de payload do modelo sem criar sucesso parcial', async () => {
        const error = new Error('Cada pergunta aceita no máximo uma resposta.');
        error.status = 400;
        questoesModel.submeter.mockRejectedValue(error);

        const response = await request(app)
            .post('/api/questionarios/5/submissoes')
            .send({
                submission_id: '11111111-1111-4111-8111-111111111111',
                respostas: [{ id_pergunta: 1, id_opcao: 2 }]
            });

        expect(response.status).toBe(400);
        expect(response.body.mensagem).toContain('no máximo uma resposta');
    });

    it('retorna histórico vazio como coleção válida', async () => {
        const response = await request(app).get('/api/questionarios/historico');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            items: [], tentativas: [], page: 1, limit: 50, total: 0
        });
    });
});
