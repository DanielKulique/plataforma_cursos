const {
    checkProfessorPermission,
    checkProfessorTurmaPermission,
    checkProfessorMatriculaPermission,
    checkMatriculaReadPermission,
    checkMatriculaCancelPermission
} = require('../middlewares/checkProfessorPermission.middleware');

const turmasModel = require('../api/models/turmas.models');
const matriculaModel = require('../api/models/matricula.models');

jest.mock('../api/models/turmas.models');
jest.mock('../api/models/matricula.models');

describe('Check Professor Permission Middleware', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            user: null,
            params: {}
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    describe('checkProfessorPermission', () => {
        it('deve chamar next() quando usuário for PROFESSOR', async () => {
            req.user = { id_usuario: 1, tipo: 'PROFESSOR' };

            await checkProfessorPermission(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('deve retornar 401 quando usuário não estiver autenticado', async () => {
            req.user = null;

            await checkProfessorPermission(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ mensagem: 'Acesso não autorizado.' });
            expect(next).not.toHaveBeenCalled();
        });

        it('deve retornar 403 quando usuário não for PROFESSOR', async () => {
            req.user = { id_usuario: 1, tipo: 'ALUNO' };

            await checkProfessorPermission(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    mensagem: expect.stringContaining('Apenas professores')
                })
            );
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('checkProfessorTurmaPermission', () => {
        it('deve chamar next() quando usuário for ADMIN', async () => {
            req.user = { id_usuario: 1, tipo: 'ADMIN' };

            await checkProfessorTurmaPermission(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('deve chamar next() quando PROFESSOR for dono da turma', async () => {
            req.user = { id_usuario: 5, tipo: 'PROFESSOR' };
            req.params = { id_turma: 10 };

            turmasModel.professorEhDaTurma.mockResolvedValue(true);

            await checkProfessorTurmaPermission(req, res, next);

            expect(turmasModel.professorEhDaTurma).toHaveBeenCalledWith(5, 10);
            expect(next).toHaveBeenCalled();
        });

        it('deve retornar 403 quando PROFESSOR não for dono da turma', async () => {
            req.user = { id_usuario: 5, tipo: 'PROFESSOR' };
            req.params = { id_turma: 10 };

            turmasModel.professorEhDaTurma.mockResolvedValue(false);

            await checkProfessorTurmaPermission(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    mensagem: expect.stringContaining('Acesso negado')
                })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('deve retornar 403 quando usuário não for PROFESSOR ou ADMIN', async () => {
            req.user = { id_usuario: 1, tipo: 'ALUNO' };

            await checkProfessorTurmaPermission(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('checkProfessorMatriculaPermission', () => {
        it('deve chamar next() quando usuário for ADMIN', async () => {
            req.user = { id_usuario: 1, tipo: 'ADMIN' };

            await checkProfessorMatriculaPermission(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('deve chamar next() quando PROFESSOR tiver permissão na matrícula', async () => {
            req.user = { id_usuario: 5, tipo: 'PROFESSOR' };
            req.params = { id: 100 };

            matriculaModel.professorPodeGerenciarMatricula.mockResolvedValue(true);

            await checkProfessorMatriculaPermission(req, res, next);

            expect(matriculaModel.professorPodeGerenciarMatricula).toHaveBeenCalledWith(5, 100);
            expect(next).toHaveBeenCalled();
        });

        it('deve retornar 403 quando PROFESSOR não tiver permissão na matrícula', async () => {
            req.user = { id_usuario: 5, tipo: 'PROFESSOR' };
            req.params = { id: 100 };

            matriculaModel.professorPodeGerenciarMatricula.mockResolvedValue(false);

            await checkProfessorMatriculaPermission(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('checkMatriculaReadPermission', () => {
        it('deve chamar next() quando usuário for ADMIN', async () => {
            req.user = { id_usuario: 1, tipo: 'ADMIN' };
            req.params = { id: 100 };

            await checkMatriculaReadPermission(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('deve chamar next() quando ALUNO for dono da matrícula', async () => {
            req.user = { id_usuario: 10, tipo: 'ALUNO' };
            req.params = { id: 100 };

            matriculaModel.buscarEscopoMatriculaPorId.mockResolvedValue({
                id_aluno: 10,
                id_professor: 5
            });

            await checkMatriculaReadPermission(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('deve chamar next() quando PROFESSOR for responsável pela matrícula', async () => {
            req.user = { id_usuario: 5, tipo: 'PROFESSOR' };
            req.params = { id: 100 };

            matriculaModel.buscarEscopoMatriculaPorId.mockResolvedValue({
                id_aluno: 10,
                id_professor: 5
            });

            await checkMatriculaReadPermission(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('deve retornar 401 quando usuário não estiver autenticado', async () => {
            req.user = null;
            req.params = { id: 100 };

            await checkMatriculaReadPermission(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('deve retornar 404 quando matrícula não for encontrada', async () => {
            req.user = { id_usuario: 10, tipo: 'ALUNO' };
            req.params = { id: 999 };

            matriculaModel.buscarEscopoMatriculaPorId.mockResolvedValue(null);

            await checkMatriculaReadPermission(req, res, next);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(next).not.toHaveBeenCalled();
        });

        it('deve retornar 403 quando usuário não tiver permissão de leitura', async () => {
            req.user = { id_usuario: 99, tipo: 'ALUNO' };
            req.params = { id: 100 };

            matriculaModel.buscarEscopoMatriculaPorId.mockResolvedValue({
                id_aluno: 10,
                id_professor: 5
            });

            await checkMatriculaReadPermission(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('checkMatriculaCancelPermission', () => {
        it('deve chamar next() quando usuário for ADMIN', async () => {
            req.user = { id_usuario: 1, tipo: 'ADMIN' };
            req.params = { id: 100 };

            await checkMatriculaCancelPermission(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('deve chamar next() quando ALUNO for dono da matrícula', async () => {
            req.user = { id_usuario: 10, tipo: 'ALUNO' };
            req.params = { id: 100 };

            matriculaModel.buscarEscopoMatriculaPorId.mockResolvedValue({
                id_aluno: 10,
                id_professor: 5
            });

            await checkMatriculaCancelPermission(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('deve retornar 404 quando matrícula não for encontrada', async () => {
            req.user = { id_usuario: 10, tipo: 'ALUNO' };
            req.params = { id: 999 };

            matriculaModel.buscarEscopoMatriculaPorId.mockResolvedValue(null);

            await checkMatriculaCancelPermission(req, res, next);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(next).not.toHaveBeenCalled();
        });

        it('deve retornar 403 quando ALUNO não for dono da matrícula', async () => {
            req.user = { id_usuario: 99, tipo: 'ALUNO' };
            req.params = { id: 100 };

            matriculaModel.buscarEscopoMatriculaPorId.mockResolvedValue({
                id_aluno: 10,
                id_professor: 5
            });

            await checkMatriculaCancelPermission(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });

        it('deve retornar 403 quando PROFESSOR tentar cancelar matrícula', async () => {
            req.user = { id_usuario: 5, tipo: 'PROFESSOR' };
            req.params = { id: 100 };

            matriculaModel.buscarEscopoMatriculaPorId.mockResolvedValue({
                id_aluno: 10,
                id_professor: 5
            });

            await checkMatriculaCancelPermission(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });
    });
});
