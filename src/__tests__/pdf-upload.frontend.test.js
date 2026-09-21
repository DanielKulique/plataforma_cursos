'use strict';

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'professor-turma-aula.html'), 'utf8');
const script = fs.readFileSync(path.join(publicDir, 'js', 'professor-turma-aula.js'), 'utf8');
const css = fs.readFileSync(path.join(publicDir, 'css', 'components.css'), 'utf8');
const compose = fs.readFileSync(path.join(__dirname, '..', '..', 'compose.yaml'), 'utf8');

describe('interface de upload PDF do professor e administrador', () => {
    it('expõe seletor PDF acessível com limite, arquivo atual e estados ao vivo', () => {
        expect(html).toMatch(/id="conteudo-arquivo"[\s\S]*?type="file"[\s\S]*?accept="application\/pdf,\.pdf"/);
        expect(html).toContain('data-max-bytes="20971520"');
        expect(html).toContain('id="arquivo-atual"');
        expect(html).toContain('aria-live="polite"');
        expect(css).toContain('input[type="file"]::file-selector-button');
    });

    it('envia FormData sem forçar Content-Type e apresenta seleção, progresso e sucesso', () => {
        expect(script).toContain('const form = new FormData()');
        expect(script).toContain("form.append('arquivo', file)");
        expect(script).toContain('/api/turmas/${idTurma}/conteudos/pdf');
        expect(script).not.toMatch(/FormData\(\)[\s\S]{0,500}Content-Type/);
    });

    it('mantém o volume privado somente no app e oferece acesso administrativo à tela', () => {
        expect(compose).toContain('material_uploads:/app/storage/materials');
        const caddy = compose.slice(compose.indexOf('  caddy:'), compose.indexOf('\nnetworks:'));
        expect(caddy).not.toContain('material_uploads');
        expect(fs.readFileSync(path.join(publicDir, 'js', 'admin.js'), 'utf8'))
            .toContain('/professor-turma.html?id_turma=');
    });
});
