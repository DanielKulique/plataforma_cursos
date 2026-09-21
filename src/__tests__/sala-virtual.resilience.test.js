'use strict';

const fs = require('fs');
const path = require('path');
const read = (...parts) => fs.readFileSync(path.join(__dirname, '..', 'public', ...parts), 'utf8');

describe('resiliência da nova Sala Virtual', () => {
    it('não acopla a lista de turmas à disponibilidade de certificados', () => {
        const room = read('js', 'sala-virtual.js');
        expect(room).toContain('await carregarTurmas()');
        expect(room).not.toContain('getMeusCertificados');
        expect(room).not.toContain('Promise.all');
    });

    it('mantém erro e vazio de turmas distintos', () => {
        const room = read('js', 'sala-virtual.js');
        expect(room).toContain('Você ainda não possui turma com acesso ativo');
        expect(room).toContain('Não foi possível carregar suas turmas');
        expect(room).toContain("mostrarEstadoLista('Carregando suas turmas...'"
        );
    });

    it('isola indisponibilidade e vazio na página dedicada de certificados', () => {
        const certificates = read('js', 'meus-certificados.js');
        expect(certificates).toContain('Você ainda não possui certificados emitidos.');
        expect(certificates).toContain('Seus certificados estão temporariamente indisponíveis.');
        expect(certificates).toContain('Não foi possível carregar seus certificados.');
    });
});
