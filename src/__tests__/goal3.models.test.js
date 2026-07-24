jest.mock('../config/database', () => ({
    query: jest.fn(),
    getConnection: jest.fn()
}));

const db = require('../config/database');
const conteudos = require('../api/models/conteudos.models');
const questoes = require('../api/models/questoes.models');

function conexaoMock() {
    return {
        beginTransaction: jest.fn().mockResolvedValue(undefined),
        query: jest.fn(),
        commit: jest.fn().mockResolvedValue(undefined),
        rollback: jest.fn().mockResolvedValue(undefined),
        release: jest.fn()
    };
}

describe('modelos do Goal 3', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('conteúdos e progresso', () => {
        it('consulta turma, permissões, módulos, conteúdos e escopo', async () => {
            db.query
                .mockResolvedValueOnce([[{ id_turma: 1, id_professor: 2 }]])
                .mockResolvedValueOnce([[{ 1: 1 }]])
                .mockResolvedValueOnce([[{ id_matricula: 3 }]])
                .mockResolvedValueOnce([[{ id_modulo: 4 }]])
                .mockResolvedValueOnce([[{ id_conteudo: 5 }]])
                .mockResolvedValueOnce([[{ id_conteudo: 5, id_turma: 1 }]]);

            await expect(conteudos.buscarTurma(1)).resolves.toMatchObject({ id_turma: 1 });
            await expect(conteudos.professorEhDaTurma(2, 1)).resolves.toBe(true);
            await expect(conteudos.alunoEstaMatriculado(3, 1)).resolves.toBe(true);
            await expect(conteudos.listarModulos(1)).resolves.toEqual([{ id_modulo: 4 }]);
            await expect(conteudos.listar(1, 3)).resolves.toEqual([{ id_conteudo: 5 }]);
            await expect(conteudos.buscarEscopo(5)).resolves.toMatchObject({ id_turma: 1 });
        });

        it('trata ausências nas consultas de escopo e permissão', async () => {
            db.query.mockResolvedValue([[]]);

            await expect(conteudos.buscarTurma(99)).resolves.toBeNull();
            await expect(conteudos.professorEhDaTurma(2, 99)).resolves.toBe(false);
            await expect(conteudos.alunoEstaMatriculado(3, 99)).resolves.toBe(false);
            await expect(conteudos.buscarEscopo(99)).resolves.toBeNull();
        });

        it('cria, atualiza, remove e lista progresso da turma', async () => {
            db.query
                .mockResolvedValueOnce([{ insertId: 7 }])
                .mockResolvedValueOnce([{ affectedRows: 1 }])
                .mockResolvedValueOnce([{ affectedRows: 1 }])
                .mockResolvedValueOnce([[{ id_aluno: 3, progresso_percentual: 25 }]]);

            await expect(conteudos.criar(1, {
                titulo: 'Aula', tipo: 'TEXTO', ordem: 1
            })).resolves.toMatchObject({ id_conteudo: 7, id_turma: 1 });
            await expect(conteudos.atualizar(7, { titulo: 'Nova aula', intruso: true })).resolves.toBe(true);
            await expect(conteudos.remover(7)).resolves.toBe(true);
            await expect(conteudos.listarProgressoTurma(1)).resolves.toHaveLength(1);
            await expect(conteudos.atualizar(7, { intruso: true })).resolves.toBe(false);
        });

        it('persiste conclusão e percentual na mesma transação', async () => {
            const conexao = conexaoMock();
            conexao.query
                .mockResolvedValueOnce([[{ id_conteudo: 8, id_turma: 1 }]])
                .mockResolvedValueOnce([[{ id_matricula: 9 }]])
                .mockResolvedValueOnce([{ affectedRows: 1 }])
                .mockResolvedValueOnce([[{ total: 2, concluidos: 1 }]])
                .mockResolvedValueOnce([{ affectedRows: 1 }])
                .mockResolvedValueOnce([[{
                    status: 'CONCLUIDO', iniciado_em: new Date(), concluido_em: new Date()
                }]]);
            db.getConnection.mockResolvedValue(conexao);

            const resultado = await conteudos.registrarProgresso(3, 8, 'CONCLUIDO');

            expect(resultado).toMatchObject({ status: 'CONCLUIDO', progresso_percentual: 50 });
            expect(conexao.commit).toHaveBeenCalledTimes(1);
            expect(conexao.rollback).not.toHaveBeenCalled();
            expect(conexao.release).toHaveBeenCalledTimes(1);
        });

        it('faz rollback para conteúdo inexistente ou ausência de matrícula', async () => {
            const semConteudo = conexaoMock();
            semConteudo.query.mockResolvedValueOnce([[]]);
            db.getConnection.mockResolvedValueOnce(semConteudo);
            await expect(conteudos.registrarProgresso(3, 999, 'INICIADO'))
                .rejects.toMatchObject({ status: 404, code: 'CONTEUDO_NAO_ENCONTRADO' });
            expect(semConteudo.rollback).toHaveBeenCalled();

            const semMatricula = conexaoMock();
            semMatricula.query
                .mockResolvedValueOnce([[{ id_conteudo: 8, id_turma: 1 }]])
                .mockResolvedValueOnce([[]]);
            db.getConnection.mockResolvedValueOnce(semMatricula);
            await expect(conteudos.registrarProgresso(3, 8, 'INICIADO'))
                .rejects.toMatchObject({ status: 403, code: 'ALUNO_NAO_MATRICULADO' });
            expect(semMatricula.rollback).toHaveBeenCalled();
        });
    });

    describe('questionários', () => {
        it('consulta turma, permissões e escopos', async () => {
            db.query
                .mockResolvedValueOnce([[{ id_turma: 1, id_professor: 2 }]])
                .mockResolvedValueOnce([[{ 1: 1 }]])
                .mockResolvedValueOnce([[{ 1: 1 }]])
                .mockResolvedValueOnce([[{ id_questionario: 4, id_turma: 1 }]])
                .mockResolvedValueOnce([[{ id_pergunta: 5, id_turma: 1 }]])
                .mockResolvedValueOnce([[{ id_questionario: 4, total_perguntas: 2 }]]);

            await expect(questoes.buscarTurma(1)).resolves.toMatchObject({ id_turma: 1 });
            await expect(questoes.professorEhDaTurma(2, 1)).resolves.toBe(true);
            await expect(questoes.matriculado(3, 1)).resolves.toBe(true);
            await expect(questoes.escopoQuestionario(4)).resolves.toMatchObject({ id_turma: 1 });
            await expect(questoes.escopoPergunta(5)).resolves.toMatchObject({ id_turma: 1 });
            await expect(questoes.listarMetadadosTurma(1)).resolves.toHaveLength(1);
        });

        it('trata consultas ausentes e cria questionário somente para turma existente', async () => {
            db.query
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([[]])
                .mockResolvedValueOnce([{ affectedRows: 1, insertId: 10 }])
                .mockResolvedValueOnce([{ affectedRows: 0, insertId: 0 }]);

            await expect(questoes.buscarTurma(99)).resolves.toBeNull();
            await expect(questoes.professorEhDaTurma(2, 99)).resolves.toBe(false);
            await expect(questoes.matriculado(3, 99)).resolves.toBe(false);
            await expect(questoes.escopoQuestionario(99)).resolves.toBeNull();
            await expect(questoes.criarQuestionario(1, {
                titulo: 'Exercício', tipo: 'EXERCICIO'
            })).resolves.toMatchObject({ id_questionario: 10 });
            await expect(questoes.criarQuestionario(99, {
                titulo: 'Exercício', tipo: 'EXERCICIO'
            })).resolves.toBeNull();
        });

        it('cria pergunta e opções de forma transacional', async () => {
            const conexao = conexaoMock();
            conexao.query
                .mockResolvedValueOnce([{ insertId: 11 }])
                .mockResolvedValueOnce([{ insertId: 12 }])
                .mockResolvedValueOnce([{ insertId: 13 }]);
            db.getConnection.mockResolvedValue(conexao);

            await expect(questoes.criarPergunta(4, {
                texto_pergunta: 'Pergunta', ordem: 1,
                opcoes: [
                    { texto_opcao: 'A', ordem: 1, correta: true },
                    { texto_opcao: 'B', ordem: 2, correta: false }
                ]
            })).resolves.toEqual({ id_pergunta: 11 });
            expect(conexao.commit).toHaveBeenCalled();
            expect(conexao.query).toHaveBeenCalledTimes(3);
        });

        it('faz rollback quando falha a criação da pergunta', async () => {
            const conexao = conexaoMock();
            conexao.query.mockRejectedValue(new Error('falha SQL'));
            db.getConnection.mockResolvedValue(conexao);

            await expect(questoes.criarPergunta(4, {
                texto_pergunta: 'Pergunta', ordem: 1, opcoes: []
            })).rejects.toThrow('falha SQL');
            expect(conexao.rollback).toHaveBeenCalled();
            expect(conexao.release).toHaveBeenCalled();
        });

        it('lista pergunta respondível sem gabarito e trata questionário ausente', async () => {
            db.query
                .mockResolvedValueOnce([[{
                    id_questionario: 4, id_turma: 1, titulo: 'Exercício', tipo: 'EXERCICIO'
                }]])
                .mockResolvedValueOnce([[{
                    id_pergunta: 5, texto_pergunta: 'Pergunta', tipo_pergunta: 'MULTIPLA_ESCOLHA'
                }]])
                .mockResolvedValueOnce([[
                    { id_opcao: 6, id_pergunta: 5, texto_opcao: 'A', ordem: 1 },
                    { id_opcao: 7, id_pergunta: 5, texto_opcao: 'B', ordem: 2 }
                ]])
                .mockResolvedValueOnce([[]]);

            const resultado = await questoes.listarAluno(1, 'EXERCICIO');
            expect(resultado.perguntas[0].opcoes).toEqual([
                { id_opcao: 6, texto_opcao: 'A', ordem: 1 },
                { id_opcao: 7, texto_opcao: 'B', ordem: 2 }
            ]);
            expect(JSON.stringify(resultado)).not.toContain('"correta"');
            await expect(questoes.listarAluno(1, 'PROVA')).resolves.toBeNull();
        });

        it('recusa RESPOSTA_CURTA no fluxo do aluno', async () => {
            db.query
                .mockResolvedValueOnce([[{ id_questionario: 4, id_turma: 1 }]])
                .mockResolvedValueOnce([[{ id_pergunta: 5, tipo_pergunta: 'RESPOSTA_CURTA' }]]);

            await expect(questoes.listarAluno(1, 'EXERCICIO'))
                .rejects.toMatchObject({ status: 409, code: 'TIPO_PERGUNTA_NAO_SUPORTADO' });
        });

        it('atualiza, remove e mantém operações vazias explícitas', async () => {
            db.query
                .mockResolvedValueOnce([{ affectedRows: 1 }])
                .mockResolvedValueOnce([{ affectedRows: 1 }]);

            await expect(questoes.atualizarPergunta(5, { texto_pergunta: 'Nova', invasor: true }))
                .resolves.toBe(true);
            await expect(questoes.removerPergunta(5)).resolves.toBe(true);
            await expect(questoes.atualizarPergunta(5, { invasor: true })).resolves.toBe(false);
        });

        it('submete, corrige e persiste uma tentativa completa', async () => {
            const conexao = conexaoMock();
            conexao.query
                .mockResolvedValueOnce([[{ id_questionario: 4, id_turma: 1, ativo: 1 }]])
                .mockResolvedValueOnce([[{ id_matricula: 9 }]])
                .mockResolvedValueOnce([[{
                    id_pergunta: 5, tipo_pergunta: 'MULTIPLA_ESCOLHA', pontos: '2.00'
                }]])
                .mockResolvedValueOnce([[{ id_opcao: 6, id_pergunta: 5, correta: 1 }]])
                .mockResolvedValueOnce([{ insertId: 20 }])
                .mockResolvedValueOnce([{ insertId: 21 }])
                .mockResolvedValueOnce([{ affectedRows: 1 }]);
            db.getConnection.mockResolvedValue(conexao);

            const resultado = await questoes.submeter(4, 3, [{ id_pergunta: 5, id_opcao: 6 }]);

            expect(resultado).toMatchObject({
                id_tentativa: 20, acertos: 1, total_perguntas: 1, pontuacao: 2, percentual: 100
            });
            expect(conexao.commit).toHaveBeenCalled();
            expect(conexao.rollback).not.toHaveBeenCalled();
        });

        it.each([
            ['questionário indisponível', [{ id_questionario: 4, id_turma: 1, ativo: 0 }], 404],
            ['aluno sem matrícula', [{ id_questionario: 4, id_turma: 1, ativo: 1 }], 403]
        ])('faz rollback para %s', async (caso, questionarioRows, status) => {
            const conexao = conexaoMock();
            conexao.query.mockResolvedValueOnce([questionarioRows]);
            if (status === 403) conexao.query.mockResolvedValueOnce([[]]);
            db.getConnection.mockResolvedValue(conexao);

            await expect(questoes.submeter(4, 3, [{ id_pergunta: 5, id_opcao: 6 }]))
                .rejects.toMatchObject({ status });
            expect(conexao.rollback).toHaveBeenCalled();
        });

        it('rejeita pergunta sem suporte, duplicidade e opção cruzada com rollback', async () => {
            const naoSuportada = conexaoMock();
            naoSuportada.query
                .mockResolvedValueOnce([[{ id_questionario: 4, id_turma: 1, ativo: 1 }]])
                .mockResolvedValueOnce([[{ id_matricula: 9 }]])
                .mockResolvedValueOnce([[{
                    id_pergunta: 5, tipo_pergunta: 'RESPOSTA_CURTA', pontos: 1
                }]]);
            db.getConnection.mockResolvedValueOnce(naoSuportada);
            await expect(questoes.submeter(4, 3, [{ id_pergunta: 5, id_opcao: 6 }]))
                .rejects.toMatchObject({ status: 409 });

            const duplicada = conexaoMock();
            duplicada.query
                .mockResolvedValueOnce([[{ id_questionario: 4, id_turma: 1, ativo: 1 }]])
                .mockResolvedValueOnce([[{ id_matricula: 9 }]])
                .mockResolvedValueOnce([[
                    { id_pergunta: 5, tipo_pergunta: 'MULTIPLA_ESCOLHA', pontos: 1 },
                    { id_pergunta: 8, tipo_pergunta: 'VERDADEIRO_FALSO', pontos: 1 }
                ]]);
            db.getConnection.mockResolvedValueOnce(duplicada);
            await expect(questoes.submeter(4, 3, [
                { id_pergunta: 5, id_opcao: 6 },
                { id_pergunta: 5, id_opcao: 7 }
            ])).rejects.toMatchObject({ status: 400, code: 'RESPOSTA_DUPLICADA' });

            const cruzada = conexaoMock();
            cruzada.query
                .mockResolvedValueOnce([[{ id_questionario: 4, id_turma: 1, ativo: 1 }]])
                .mockResolvedValueOnce([[{ id_matricula: 9 }]])
                .mockResolvedValueOnce([[{
                    id_pergunta: 5, tipo_pergunta: 'MULTIPLA_ESCOLHA', pontos: 1
                }]])
                .mockResolvedValueOnce([[{ id_opcao: 6, id_pergunta: 99, correta: 1 }]]);
            db.getConnection.mockResolvedValueOnce(cruzada);
            await expect(questoes.submeter(4, 3, [{ id_pergunta: 5, id_opcao: 6 }]))
                .rejects.toMatchObject({ status: 400, code: 'OPCAO_INVALIDA' });
        });

        it('consulta histórico com e sem filtro e resultados da turma', async () => {
            db.query
                .mockResolvedValueOnce([[{ id_tentativa: 1 }]])
                .mockResolvedValueOnce([[{ id_tentativa: 2 }]])
                .mockResolvedValueOnce([[{ id_tentativa: 3 }]]);

            await expect(questoes.historico(3)).resolves.toHaveLength(1);
            await expect(questoes.historico(3, 4)).resolves.toHaveLength(1);
            await expect(questoes.resultadosTurma(1)).resolves.toHaveLength(1);
        });
    });
});
