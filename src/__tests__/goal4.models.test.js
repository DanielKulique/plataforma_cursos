jest.mock('../config/database', () => ({
    query: jest.fn(),
    getConnection: jest.fn()
}));
jest.mock('bcrypt', () => ({
    hash: jest.fn(),
    compare: jest.fn()
}));

const db = require('../config/database');
const bcrypt = require('bcrypt');
const usuarios = require('../api/models/usuarios.models');
const cursos = require('../api/models/cursos.models');
const turmas = require('../api/models/turmas.models');

function connectionMock() {
    return {
        query: jest.fn(),
        beginTransaction: jest.fn().mockResolvedValue(),
        commit: jest.fn().mockResolvedValue(),
        rollback: jest.fn().mockResolvedValue(),
        release: jest.fn()
    };
}

function errorWith(props) {
    return Object.assign(new Error(props.message || 'erro'), props);
}

const semVinculos = {
    turmas: 0, matriculas: 0, tentativas: 0, respostas: 0, progresso: 0, analises: 0
};

describe('Goal 4 - modelo de usuários', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        bcrypt.hash.mockResolvedValue('hash-seguro');
        bcrypt.compare.mockResolvedValue(false);
    });

    it('cria usuário com hash e retorna somente campos seguros', async () => {
        db.query.mockResolvedValue([{ affectedRows: 1, insertId: 8 }]);
        const result = await usuarios.criarUsuario({
            nome_completo: 'Nome', cpf: '12345678901', email: 'a@b.test', senha: 'Senha@123', tipo: 'ALUNO'
        });
        expect(bcrypt.hash).toHaveBeenCalledWith('Senha@123', 10);
        expect(db.query.mock.calls[0][1][3]).toBe('hash-seguro');
        expect(result).not.toHaveProperty('senha');
        expect(result.telefone).toBeNull();
    });

    it.each([
        ['cpf', 'CPF_DUPLICADO'],
        ['email', 'EMAIL_DUPLICADO'],
        ['outra_chave', 'USUARIO_DUPLICADO']
    ])('traduz duplicidade de %s', async (chave, code) => {
        db.query.mockRejectedValue(errorWith({ errno: 1062, message: `Duplicate ${chave}` }));
        await expect(usuarios.criarUsuario({ senha: 'x' })).rejects.toMatchObject({ status: 409, code });
    });

    it('atualiza somente campos permitidos e trata ausência e duplicidade', async () => {
        db.query
            .mockResolvedValueOnce([{ affectedRows: 1 }])
            .mockResolvedValueOnce([[{ id_usuario: 2, nome_completo: 'Novo' }]]);
        await expect(usuarios.atualizarUsuario(2, { nome_completo: 'Novo', senha: 'ignorada' }))
            .resolves.toMatchObject({ nome_completo: 'Novo' });
        expect(db.query.mock.calls[0][0]).not.toContain('senha');

        await expect(usuarios.atualizarUsuario(2, { senha: 'x' })).rejects.toMatchObject({ status: 400 });
        db.query.mockReset().mockResolvedValue([{ affectedRows: 0 }]);
        await expect(usuarios.atualizarUsuario(99, { nome_completo: 'x' })).rejects.toMatchObject({ status: 404 });
        db.query.mockReset().mockRejectedValue(errorWith({ errno: 1062, message: 'uk_usuarios_email' }));
        await expect(usuarios.atualizarUsuario(2, { email: 'x@y.test' })).rejects.toMatchObject({ status: 409 });
    });

    it('consulta um usuário, lista coleção vazia e verifica disponibilidade', async () => {
        db.query.mockResolvedValueOnce([[{ id_usuario: 1 }]]);
        await expect(usuarios.buscarUsuarioPorId(1)).resolves.toEqual({ id_usuario: 1 });
        db.query.mockResolvedValueOnce([[]]);
        await expect(usuarios.buscarUsuarioPorId(99)).rejects.toMatchObject({ status: 404 });
        db.query.mockResolvedValueOnce([[]]);
        await expect(usuarios.buscarTodosUsuarios()).resolves.toEqual([]);
        db.query.mockResolvedValueOnce([[{ email: 'ocupado@test', cpf: '11111111111' }]]);
        await expect(usuarios.verificarDisponibilidade('ocupado@test', '22222222222')).resolves.toEqual({
            email_disponivel: false,
            cpf_disponivel: true
        });
    });

    it('faz atualização administrativa válida em transação', async () => {
        const conn = connectionMock();
        db.getConnection.mockResolvedValue(conn);
        conn.query
            .mockResolvedValueOnce([[{ id_usuario: 2, tipo: 'ALUNO' }]])
            .mockResolvedValueOnce([{}])
            .mockResolvedValueOnce([[{ id_usuario: 2, tipo: 'ALUNO', nome_completo: 'Novo' }]]);
        await expect(usuarios.atualizarUsuarioAdmin(2, { nome_completo: 'Novo' }))
            .resolves.toMatchObject({ nome_completo: 'Novo' });
        expect(conn.commit).toHaveBeenCalled();
        expect(conn.release).toHaveBeenCalled();
    });

    it('bloqueia usuário ausente, tipo inválido e último ADMIN', async () => {
        await expect(usuarios.atualizarUsuarioAdmin(1, { senha: 'x' })).rejects.toMatchObject({ status: 400 });
        await expect(usuarios.atualizarUsuarioAdmin(1, { tipo: 'ROOT' })).rejects.toMatchObject({ status: 400 });

        let conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[]]);
        await expect(usuarios.atualizarUsuarioAdmin(99, { tipo: 'ALUNO' })).rejects.toMatchObject({ status: 404 });
        expect(conn.rollback).toHaveBeenCalled();

        conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query
            .mockResolvedValueOnce([[{ id_usuario: 1, tipo: 'ADMIN' }]])
            .mockResolvedValueOnce([[{ id_usuario: 1 }]]);
        await expect(usuarios.atualizarUsuarioAdmin(1, { tipo: 'ALUNO' })).rejects.toMatchObject({ code: 'ULTIMO_ADMIN' });
    });

    it('bloqueia mudança de professor e aluno vinculados', async () => {
        let conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query
            .mockResolvedValueOnce([[{ id_usuario: 2, tipo: 'PROFESSOR' }]])
            .mockResolvedValueOnce([[{ ...semVinculos, turmas: 1 }]]);
        await expect(usuarios.atualizarUsuarioAdmin(2, { tipo: 'ALUNO' })).rejects.toMatchObject({ code: 'PROFESSOR_COM_TURMAS' });

        conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query
            .mockResolvedValueOnce([[{ id_usuario: 3, tipo: 'ALUNO' }]])
            .mockResolvedValueOnce([[{ ...semVinculos, progresso: 1 }]]);
        await expect(usuarios.atualizarUsuarioAdmin(3, { tipo: 'PROFESSOR' })).rejects.toMatchObject({ code: 'ALUNO_COM_VINCULOS' });
    });

    it('troca a própria senha e bloqueia alvo, ausência, senha incorreta e repetida', async () => {
        await expect(usuarios.alterarSenha(2, 1, 'a', 'b')).rejects.toMatchObject({ status: 403 });

        let conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[]]);
        await expect(usuarios.alterarSenha(1, 1, 'a', 'b')).rejects.toMatchObject({ status: 404 });

        conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[{ id_usuario: 1, senha: 'hash-antigo' }]]);
        bcrypt.compare.mockResolvedValueOnce(false);
        await expect(usuarios.alterarSenha(1, 1, 'errada', 'nova')).rejects.toMatchObject({ code: 'SENHA_ATUAL_INCORRETA' });

        conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[{ id_usuario: 1, senha: 'hash-antigo' }]]);
        bcrypt.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
        await expect(usuarios.alterarSenha(1, 1, 'certa', 'certa')).rejects.toMatchObject({ code: 'SENHA_REPETIDA' });

        conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[{ id_usuario: 1, senha: 'hash-antigo' }]]).mockResolvedValueOnce([{}]);
        bcrypt.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        bcrypt.hash.mockResolvedValueOnce('hash-novo');
        await expect(usuarios.alterarSenha(1, 1, 'certa', 'nova')).resolves.toBe(true);
        expect(conn.query).toHaveBeenLastCalledWith('UPDATE Usuarios SET senha = ? WHERE id_usuario = ?', ['hash-novo', 1]);
        expect(conn.commit).toHaveBeenCalled();
    });

    it('protege e executa exclusão física de usuário', async () => {
        await expect(usuarios.deletarUsuario(1, 1)).rejects.toMatchObject({ code: 'AUTOEXCLUSAO' });

        let conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[]]);
        await expect(usuarios.deletarUsuario(9, 1)).rejects.toMatchObject({ status: 404 });

        conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query
            .mockResolvedValueOnce([[{ id_usuario: 2, email: 'x@y', tipo: 'ALUNO' }]])
            .mockResolvedValueOnce([[{ ...semVinculos, analises: 1 }]]);
        await expect(usuarios.deletarUsuario(2, 1)).rejects.toMatchObject({ code: 'USUARIO_COM_VINCULOS' });

        conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query
            .mockResolvedValueOnce([[{ id_usuario: 2, email: 'x@y', tipo: 'ALUNO' }]])
            .mockResolvedValueOnce([[semVinculos]])
            .mockResolvedValueOnce([{}])
            .mockResolvedValueOnce([{}]);
        await expect(usuarios.deletarUsuario(2, 1)).resolves.toBe(true);
        expect(conn.commit).toHaveBeenCalled();
    });
});

describe('Goal 4 - modelo de cursos', () => {
    beforeEach(() => jest.clearAllMocks());

    it('lista, consulta, cria e atualiza cursos', async () => {
        db.query.mockResolvedValueOnce([[]]);
        await expect(cursos.buscarCursos()).resolves.toEqual([]);
        db.query.mockResolvedValueOnce([[{ id_curso: 1 }]]);
        await expect(cursos.buscarCursoPorId(1)).resolves.toEqual({ id_curso: 1 });
        db.query.mockResolvedValueOnce([{ insertId: 2 }]);
        await expect(cursos.criarCurso({ nome_curso: ' Curso ', descricao: '', carga_horaria: '20' }))
            .resolves.toEqual({ id_curso: 2, nome_curso: 'Curso', descricao: null, carga_horaria: 20 });
        db.query.mockResolvedValueOnce([{ affectedRows: 1 }]);
        await expect(cursos.atualizarCurso(2, { nome_curso: 'Novo', descricao: 'd', carga_horaria: 30 }))
            .resolves.toMatchObject({ id_curso: 2, nome_curso: 'Novo' });
    });

    it('trata ausências, duplicidades e integridade', async () => {
        db.query.mockResolvedValueOnce([[]]);
        await expect(cursos.buscarCursoPorId(9)).rejects.toMatchObject({ status: 404 });
        db.query.mockRejectedValueOnce(errorWith({ errno: 1062 }));
        await expect(cursos.criarCurso({ nome_curso: 'x', carga_horaria: 1 })).rejects.toMatchObject({ status: 409 });
        db.query.mockRejectedValueOnce(errorWith({ errno: 1452 }));
        await expect(cursos.atualizarCurso(1, { nome_curso: 'x', carga_horaria: 1 })).rejects.toMatchObject({ status: 409 });
        db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
        await expect(cursos.atualizarCurso(9, { nome_curso: 'x', carga_horaria: 1 })).rejects.toMatchObject({ status: 404 });
    });

    it('exclui curso livre e bloqueia ausência ou turma associada', async () => {
        let conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[]]);
        await expect(cursos.deletarCurso(9)).rejects.toMatchObject({ status: 404 });

        conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[{ id_curso: 1 }]]).mockResolvedValueOnce([[{ id_turma: 1 }]]);
        await expect(cursos.deletarCurso(1)).rejects.toMatchObject({ status: 409 });

        conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[{ id_curso: 1 }]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]);
        await expect(cursos.deletarCurso(1)).resolves.toBe(true);
        expect(conn.commit).toHaveBeenCalled();
    });
});

describe('Goal 4 - modelo de turmas', () => {
    beforeEach(() => jest.clearAllMocks());

    it('cria turma válida com referências verificadas', async () => {
        const conn = connectionMock();
        db.getConnection.mockResolvedValue(conn);
        conn.query
            .mockResolvedValueOnce([[{ id_curso: 1 }]])
            .mockResolvedValueOnce([[{ id_usuario: 2, tipo: 'PROFESSOR' }]])
            .mockResolvedValueOnce([{ insertId: 3 }]);
        await expect(turmas.criarTurma({
            nome_turma: ' Turma ', id_curso: 1, id_professor: 2, data_inicio: '2026-01-01'
        })).resolves.toMatchObject({ id_turma: 3, nome_turma: 'Turma', status: 'ABERTA' });
        expect(conn.commit).toHaveBeenCalled();
    });

    it('bloqueia status, datas, curso, professor ausente e papel incompatível', async () => {
        await expect(turmas.criarTurma({ nome_turma: 'x', data_inicio: '2026-01-01', status: 'ATIVA' }))
            .rejects.toMatchObject({ code: 'STATUS_INVALIDO' });
        await expect(turmas.criarTurma({ nome_turma: 'x', data_inicio: '2026-02-01', data_fim: '2026-01-01' }))
            .rejects.toMatchObject({ code: 'DATAS_INVALIDAS' });

        let conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[]]);
        await expect(turmas.criarTurma({ nome_turma: 'x', id_curso: 9, id_professor: 2, data_inicio: '2026-01-01' }))
            .rejects.toMatchObject({ code: 'CURSO_NAO_ENCONTRADO' });

        conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[{ id_curso: 1 }]]).mockResolvedValueOnce([[]]);
        await expect(turmas.criarTurma({ nome_turma: 'x', id_curso: 1, id_professor: 9, data_inicio: '2026-01-01' }))
            .rejects.toMatchObject({ code: 'PROFESSOR_NAO_ENCONTRADO' });

        conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[{ id_curso: 1 }]]).mockResolvedValueOnce([[{ tipo: 'ALUNO' }]]);
        await expect(turmas.criarTurma({ nome_turma: 'x', id_curso: 1, id_professor: 3, data_inicio: '2026-01-01' }))
            .rejects.toMatchObject({ code: 'USUARIO_NAO_PROFESSOR' });
    });

    it('traduz duplicidade de turma', async () => {
        const conn = connectionMock();
        db.getConnection.mockResolvedValue(conn);
        conn.query
            .mockResolvedValueOnce([[{ id_curso: 1 }]])
            .mockResolvedValueOnce([[{ tipo: 'PROFESSOR' }]])
            .mockRejectedValueOnce(errorWith({ errno: 1062 }));
        await expect(turmas.criarTurma({ nome_turma: 'x', id_curso: 1, id_professor: 2, data_inicio: '2026-01-01' }))
            .rejects.toMatchObject({ code: 'TURMA_DUPLICADA' });
    });

    it('atualiza turma mesclando dados atuais e trata ausência/campos vazios', async () => {
        await expect(turmas.atualizarTurma(1, { desconhecido: true })).rejects.toMatchObject({ status: 400 });

        let conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[]]);
        await expect(turmas.atualizarTurma(9, { status: 'FECHADA' })).rejects.toMatchObject({ status: 404 });

        conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query
            .mockResolvedValueOnce([[{
                id_turma: 1, nome_turma: 'T', id_curso: 1, id_professor: 2,
                data_inicio: new Date('2026-01-01T00:00:00Z'), data_fim: null, status: 'ABERTA'
            }]])
            .mockResolvedValueOnce([[{ id_curso: 1 }]])
            .mockResolvedValueOnce([[{ tipo: 'PROFESSOR' }]])
            .mockResolvedValueOnce([{}]);
        await expect(turmas.atualizarTurma(1, { status: 'ENCERRADA', data_fim: '2026-02-01' }))
            .resolves.toMatchObject({ status: 'ENCERRADA', data_fim: '2026-02-01' });
        expect(conn.commit).toHaveBeenCalled();
    });

    it('lista e consulta turmas enriquecidas e verifica vínculo do professor', async () => {
        db.query.mockResolvedValueOnce([[{ id_turma: 1, nome_curso: 'C', nome_professor: 'P' }]]);
        await expect(turmas.buscarTurmaPorId(1)).resolves.toMatchObject({ nome_curso: 'C' });
        db.query.mockResolvedValueOnce([[]]);
        await expect(turmas.buscarTurmaPorId(9)).rejects.toMatchObject({ status: 404 });
        db.query.mockResolvedValueOnce([[]]);
        await expect(turmas.buscarTodasTurmas()).resolves.toEqual([]);
        db.query.mockResolvedValueOnce([[{ id_turma: 1 }]]);
        await expect(turmas.buscarTurmasDoProfessor(2)).resolves.toHaveLength(1);
        db.query.mockResolvedValueOnce([[{ id_turma: 1 }]]);
        await expect(turmas.professorEhDaTurma(2, 1)).resolves.toBe(true);
        db.query.mockResolvedValueOnce([[]]);
        await expect(turmas.professorEhDaTurma(2, 9)).resolves.toBe(false);
    });

    it('exclui turma livre e bloqueia ausência ou matrícula', async () => {
        let conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[]]);
        await expect(turmas.deletarTurma(9)).rejects.toMatchObject({ status: 404 });

        conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[{ id_turma: 1 }]]).mockResolvedValueOnce([[{ id_matricula: 1 }]]);
        await expect(turmas.deletarTurma(1)).rejects.toMatchObject({ code: 'TURMA_COM_MATRICULAS' });

        conn = connectionMock();
        db.getConnection.mockResolvedValueOnce(conn);
        conn.query.mockResolvedValueOnce([[{ id_turma: 1 }]]).mockResolvedValueOnce([[]]).mockResolvedValueOnce([{}]);
        await expect(turmas.deletarTurma(1)).resolves.toBe(true);
        expect(conn.commit).toHaveBeenCalled();
    });
});
