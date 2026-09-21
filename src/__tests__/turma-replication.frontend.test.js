'use strict';

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const script = fs.readFileSync(path.join(publicDir, 'js', 'admin.js'), 'utf8');
const components = fs.readFileSync(path.join(publicDir, 'css', 'components.css'), 'utf8');
const responsive = fs.readFileSync(path.join(publicDir, 'css', 'responsive.css'), 'utf8');

describe('interface administrativa de replicação de turmas', () => {
    it('oferece uma ação inequívoca e formulário completo para a nova turma', () => {
        expect(script).toContain("title: 'Replicar estrutura da turma'");
        expect(script).toContain("submitLabel: 'Replicar turma'");
        expect(script).toContain("label: 'Nome da nova turma'");
        expect(script).toContain("label: 'Professor responsável'");
        expect(script).toContain("label: 'Status inicial'");
        expect(script).toContain('Replicar estrutura da turma ${turma.nome_turma}');
        expect(script).toContain('/replicacao-resumo');
        expect(script).toContain('/replicar`');
    });

    it('explica o escopo sem sugerir cópia de histórico', () => {
        expect(script).toContain('Estrutura que será replicada');
        expect(script).toContain('Dados que ficarão de fora');
        expect(script).toContain('Alunos e matrículas');
        expect(script).toContain('Progresso e conclusões');
        expect(script).toContain('Tentativas, respostas e notas');
        expect(script).toContain('Certificados e histórico individual');
        expect(script).toContain('nova turma independente');
    });

    it('protege contra submissão dupla no cliente e envia idempotência ao servidor', () => {
        expect(script).toContain('if (submitting) return');
        expect(script).toContain("headers: { 'Idempotency-Key': replicationKey }");
        expect(script).toContain('globalThis.crypto?.randomUUID');
        expect(script).toContain('submit.disabled = busy');
    });

    it('confirma o sucesso e oferece abrir a configuração criada', () => {
        expect(script).toContain("text: 'Turma replicada com sucesso'");
        expect(script).toContain("actionButton('Abrir nova turma'");
        expect(script).toContain('openEditClass(novaTurma)');
    });

    it('mantém o resumo legível e responsivo no sistema visual atual', () => {
        expect(components).toContain('.admin-page .admin-dialog--replication');
        expect(components).toContain('.admin-page .admin-replication-groups');
        expect(components).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
        expect(responsive).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.admin-page \.admin-replication-groups\s*\{[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
    });
});
