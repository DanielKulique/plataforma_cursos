'use strict';

const fs = require('fs');
const path = require('path');
const publicDir = path.join(__dirname, '..', 'public');
const read = (...parts) => fs.readFileSync(path.join(publicDir, ...parts), 'utf8');

describe('interface de certificados', () => {
    it('oferece validador público por código e PDF sem exigir sessão', () => {
        const html = read('certificados-validar.html');
        const script = read('js', 'certificados-validar.js');
        expect(html).toContain('id="form-validar-codigo"');
        expect(html).toContain('id="form-validar-arquivo"');
        expect(html).toContain('accept="application/pdf,.pdf"');
        expect(html).not.toContain('data-session-protected');
        expect(script).toContain('fetch(`/api/public/certificados/');
        expect(script).toContain("fetch('/api/public/certificados/validar-arquivo'");
        expect(script).not.toContain('authenticatedFetch');
    });

    it('distingue estados públicos sem dados pessoais ou IDs internos', () => {
        const combined = `${read('certificados-validar.html')}\n${read('js', 'certificados-validar.js')}`;
        expect(combined).toContain('Certificado válido');
        expect(combined).toContain('Certificado autêntico');
        expect(combined).toContain('Certificado revogado');
        expect(combined).toContain('Documento não validado');
        expect(combined).not.toMatch(/cpf|telefone|email_aluno|id_aluno|id_turma|id_certificado/i);
    });

    it('mantém certificados fora da Sala Virtual e em área dedicada', () => {
        const room = read('sala-virtual.html');
        const page = read('meus-certificados.html');
        const script = read('js', 'meus-certificados.js');
        expect(room).not.toContain('id="lista-meus-certificados"');
        expect(room).toContain('href="/meus-certificados.html"');
        expect(page).toContain('id="lista-certificados"');
        expect(script).toContain('getMeusCertificados({ retries: 1 })');
        expect(script).toContain('transferPrivatePdf(action.href');
        expect(script).toContain('group.sort');
        expect(script).toContain('Ver detalhe e histórico de versões');
        expect(script).toContain("certificate.status === 'REVOGADO'");
    });

    it('separa gestão da turma e preserva emissão, histórico, revogação e reemissão', () => {
        const html = read('professor-turma-certificados.html');
        const script = read('js', 'professor-turma-certificados.js');
        expect(html).toContain('minlength="3" maxlength="500"');
        expect(script).toContain('/api/certificados/matriculas/${id}/emitir');
        expect(script).toContain('/api/certificados/${student.id_certificado}/historico');
        expect(script).toContain('/api/certificados/${operating.id_certificado}/${operation}');
        expect(script).toContain("context.session.user.tipo === 'ADMIN'");
        expect(script).toContain('histórico preservado');
    });
});
