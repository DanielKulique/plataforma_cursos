const fs = require('fs');
const path = require('path');

const publicFile = (...parts) => path.join(__dirname, '..', 'public', ...parts);
const { cookieOptions } = require('../config/session');

describe('contratos de segurança do frontend do MVP', () => {
    it('configura o cookie de produção com atributos seguros', () => {
        expect(cookieOptions({ NODE_ENV: 'production', SESSION_TTL_SECONDS: '3600' })).toEqual({
            httpOnly: true,
            secure: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 3600000
        });
    });

    it('não persiste token de autenticação no navegador', () => {
        const auth = fs.readFileSync(publicFile('js', 'auth.js'), 'utf8');
        const scripts = fs.readdirSync(publicFile('js'))
            .filter((file) => file.endsWith('.js'))
            .map((file) => fs.readFileSync(publicFile('js', file), 'utf8'))
            .join('\n');
        expect(auth).not.toMatch(/localStorage|sessionStorage|Authorization\s*:/);
        expect(scripts).not.toMatch(/Bearer\s*\$\{|Bearer jwt|localStorage\.setItem\(['"]token/);
        expect(auth).toContain("headers.set('X-CSRF-Token'");
        expect(auth).toContain("credentials: 'same-origin'");
    });

    it('oferece recuperação acessível sem colocar o token na query string', () => {
        const login = fs.readFileSync(publicFile('login.html'), 'utf8');
        const recovery = fs.readFileSync(publicFile('recuperar-senha.html'), 'utf8');
        const reset = fs.readFileSync(publicFile('redefinir-senha.html'), 'utf8');
        const resetScript = fs.readFileSync(publicFile('js', 'redefinir-senha.js'), 'utf8');
        expect(login).toContain('/recuperar-senha.html');
        expect(recovery).toContain('form-recuperacao');
        expect(reset).toContain('form-redefinicao');
        expect(resetScript).toContain('window.location.hash');
        expect(resetScript).not.toContain('window.location.search');
    });
});
