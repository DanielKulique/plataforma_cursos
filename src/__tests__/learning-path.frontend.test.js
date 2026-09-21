const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '../public/js/learning-path.js'), 'utf8').replace(/export /g, '');
const context = vm.createContext({});
vm.runInContext(`${source}\nthis.path = { montarAulas, progressoAula, correspondeFiltro };`, context);
const { montarAulas, progressoAula, correspondeFiltro } = context.path;

describe('Jornada por aulas', () => {
    const modulos = [{ id_modulo: 5, ordem: 2, titulo: 'Referências' }, { id_modulo: 90, ordem: 1, titulo: 'Introdução' }];
    const conteudos = [
        { id_conteudo: 1, id_modulo: 90, ordem: 3, tipo: 'PDF', titulo: 'Guia', concluido: 0 },
        { id_conteudo: 99, id_modulo: 90, ordem: 1, tipo: 'TEXTO', titulo: 'Conceitos', concluido: 1 },
        { id_conteudo: 3, id_modulo: 5, ordem: 4, tipo: 'TEXTO', titulo: 'Referências', concluido: 1 }
    ];
    const questionarios = [
        { id_questionario: 20, id_modulo: 90, ordem: 2, tipo: 'EXERCICIO', titulo: 'Pratique', concluido: 1 },
        { id_questionario: 21, id_modulo: null, ordem: 10, tipo: 'PROVA', titulo: 'Final' }
    ];
    it('agrupa somente materiais da aula e intercala exercício pela ordem, sem depender de IDs', () => {
        const aulas = montarAulas(modulos, conteudos, questionarios);
        expect(aulas.map((aula) => aula.id_modulo)).toEqual([90, 5]);
        expect(aulas[0].itens.map((item) => item.titulo)).toEqual(['Conceitos', 'Pratique', 'Guia']);
        expect(aulas[1].itens.map((item) => item.titulo)).toEqual(['Referências']);
        expect(aulas.flatMap((aula) => aula.itens).some((item) => item.titulo === 'Final')).toBe(false);
    });
    it('usa conclusões reais, incluindo tentativa finalizada, sem aprovar aula vazia', () => {
        const aulas = montarAulas(modulos, conteudos, questionarios);
        expect(aulas[0].progresso).toEqual({ total: 3, concluidos: 2, percentual: 67, estado: 'Em andamento' });
        expect(aulas[1].progresso.estado).toBe('Concluída');
        expect(progressoAula([]).estado).toBe('Sem materiais publicados');
        expect(progressoAula([{ concluido: '0' }]).estado).toBe('Não iniciada');
    });
    it('filtros e pesquisa preservam registros, numeração e progresso completos', () => {
        const antes = JSON.stringify({ modulos, conteudos, questionarios });
        const aulas = montarAulas(modulos, conteudos, questionarios);
        expect(aulas[0].itens.filter((item) => correspondeFiltro(item, 'pdf', 'GUIA'))).toHaveLength(1);
        expect(aulas[0].progresso.total).toBe(3);
        expect(aulas[0].numero).toBe(1);
        expect(JSON.stringify({ modulos, conteudos, questionarios })).toBe(antes);
    });
});
