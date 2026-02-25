const jwt = require('jsonwebtoken');
const checkAuth = require('../middlewares/checkAuth.middleware');
const checkRole = require('../middlewares/checkRole.middleware');
const checkUserPermission = require('../middlewares/checkUserPermission.middleware');

jest.mock('jsonwebtoken');

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
        it('deve chamar next() quando token for válido', () => {
            const mockUser = { id_usuario: 1, tipo: 'ALUNO' };
            jwt.verify.mockReturnValue(mockUser);

            req.headers['authorization'] = 'Bearer valid-token';

            checkAuth(req, res, next);

            expect(jwt.verify).toHaveBeenCalledWith('valid-token', process.env.JWT_SECRET);
            expect(req.user).toEqual(mockUser);
            expect(next).toHaveBeenCalled();
        });

        it('deve retornar 401 quando token não for fornecido', () => {
            checkAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ mensagem: 'Token não fornecido' });
            expect(next).not.toHaveBeenCalled();
        });

        it('deve retornar 401 quando token for inválido', () => {
            jwt.verify.mockImplementation(() => {
                throw new Error('Token inválido');
            });

            req.headers['authorization'] = 'Bearer invalid-token';

            checkAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
            expect(res.json).toHaveBeenCalledWith({ mensagem: 'Token inválido' });
            expect(next).not.toHaveBeenCalled();
        });

        it('deve retornar 401 quando token não tiver prefixo Bearer', () => {
            req.headers['authorization'] = 'invalid-token';

            checkAuth(req, res, next);

            expect(res.status).toHaveBeenCalledWith(401);
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
