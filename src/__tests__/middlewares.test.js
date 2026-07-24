const jwt = require('jsonwebtoken');
const authModel = require('../api/models/auth.models');
const checkAuth = require('../middlewares/checkAuth.middleware');
const checkRole = require('../middlewares/checkRole.middleware');
const checkUserPermission = require('../middlewares/checkUserPermission.middleware');

jest.mock('jsonwebtoken');
jest.mock('../api/models/auth.models');

describe('Middlewares de Autenticação', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            headers: {},
            user: null
        };
        res = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn()
        };
        next = jest.fn();
        jest.clearAllMocks();
    });

    describe('checkAuth', () => {
        it('deve chamar next() com existência e papel atuais confirmados no banco', async () => {
            const tokenUser = { id_usuario: 1, tipo: 'ALUNO' };
            const currentUser = { id_usuario: 1, nome_completo: 'Usuário Atual', tipo: 'PROFESSOR' };
            jwt.verify.mockReturnValue(tokenUser);
            authModel.buscarUsuarioPorId.mockResolvedValue(currentUser);

            req.headers['authorization'] = 'Bearer valid-token';

            await checkAuth(req, res, next);

            expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.JWT_SECRET);
            expect(authModel.buscarUsuarioPorId).toHaveBeenCalledWith(1);
            expect(req.user).toEqual(currentUser);
            expect(next).toHaveBeenCalled();
        });

        it('deve retornar 401 quando token não for fornecido', async () => {
            await checkAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ mensagem: 'Token não fornecido' });
            expect(next).not.toHaveBeenCalled();
        });

        it('deve retornar 401 quando token for inválido', async () => {
            jwt.verify.mockImplementation(() => {
                throw new Error('Token inválido');
            });

            req.headers['authorization'] = 'Bearer invalid-token';

            await checkAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ mensagem: 'Token inválido' });
            expect(next).not.toHaveBeenCalled();
        });

        it('deve retornar 401 quando token não tiver prefixo Bearer', async () => {
            req.headers['authorization'] = 'invalid-token';

            await checkAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(next).not.toHaveBeenCalled();
        });

        it('deve retornar 401 quando o token não identificar um usuário', async () => {
            jwt.verify.mockReturnValue({ tipo: 'ALUNO' });
            req.headers['authorization'] = 'Bearer valid-token';

            await checkAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(authModel.buscarUsuarioPorId).not.toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
        });

        it('deve invalidar a sessão quando o usuário não existir mais', async () => {
            jwt.verify.mockReturnValue({ id_usuario: 99, tipo: 'ADMIN' });
            authModel.buscarUsuarioPorId.mockRejectedValue(new Error('Usuário não encontrado'));
            req.headers['authorization'] = 'Bearer valid-token';

            await checkAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ mensagem: 'Sessão inválida' });
            expect(next).not.toHaveBeenCalled();
        });

        it('deve responder 500 sem detalhes quando a consulta de sessão falhar', async () => {
            jwt.verify.mockReturnValue({ id_usuario: 1, tipo: 'ALUNO' });
            authModel.buscarUsuarioPorId.mockRejectedValue(new Error('falha SQL sensível'));
            req.headers['authorization'] = 'Bearer valid-token';

            await checkAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(500);
            expect(res.json).toHaveBeenCalledWith({ mensagem: 'Não foi possível validar a sessão.' });
            expect(next).not.toHaveBeenCalled();
        });
    });

    describe('checkRole', () => {
        it('deve chamar next() quando usuário tiver o role esperado', () => {
            req.user = { id_usuario: 1, tipo: 'ADMIN' };

            const middleware = checkRole('ADMIN');
            middleware(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('deve retornar 403 quando usuário não tiver o role esperado', () => {
            req.user = { id_usuario: 1, tipo: 'ALUNO' };

            const middleware = checkRole('ADMIN');
            middleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({
                    mensagem: expect.stringContaining('Acesso negado')
                })
            );
            expect(next).not.toHaveBeenCalled();
        });

        it('deve retornar 403 quando usuário não estiver autenticado', () => {
            req.user = null;

            const middleware = checkRole('ADMIN');
            middleware(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });

        it('deve funcionar para todos os tipos de role', () => {
            const roles = ['ALUNO', 'PROFESSOR', 'ADMIN'];

            roles.forEach(role => {
                req.user = { id_usuario: 1, tipo: role };
                next.mockReset();

                const middleware = checkRole(role);
                middleware(req, res, next);

                expect(next).toHaveBeenCalled();
            });
        });
    });

    describe('checkUserPermission', () => {
        it('deve chamar next() quando usuário logado for o mesmo da requisição', () => {
            req.user = { id_usuario: 5, tipo: 'ALUNO' };
            req.params = { id: '5' };

            checkUserPermission(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('deve chamar next() quando usuário for ADMIN', () => {
            req.user = { id_usuario: 1, tipo: 'ADMIN' };
            req.params = { id: '999' };

            checkUserPermission(req, res, next);

            expect(next).toHaveBeenCalled();
        });

        it('deve retornar 403 quando usuário tentar acessar dados de outro usuário', () => {
            req.user = { id_usuario: 5, tipo: 'ALUNO' };
            req.params = { id: '10' };

            checkUserPermission(req, res, next);

            expect(res.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
        });
    });
});
