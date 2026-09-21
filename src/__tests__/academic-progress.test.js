const fs = require('node:fs');
const path = require('node:path');
const { resumirProgresso, normalizarProgresso } = require('../api/services/academic-progress.service');

test.each([
    [0, 0, 0, false], [5, 0, 0, false], [5, 5, 100, true],
    [201, 200, 100, false], [3, 1, 33, false], [2, 3, 100, false], [2, -1, 0, false]
])('conclusão exata total=%i concluídos=%i', (total, concluidos, percentual, concluido) => {
    expect(resumirProgresso(total, concluidos)).toEqual({
        total_conteudos: total, conteudos_concluidos: concluidos,
        progresso_percentual: percentual, conteudo_concluido: concluido
    });
});

test('desconsidera percentual e booleano persistidos/obsoletos', () => {
    expect(normalizarProgresso({ total_conteudos: '201', conteudos_concluidos: '200',
        progresso_percentual: 100, conteudo_concluido: true })).toMatchObject({ conteudo_concluido: false });
    expect(normalizarProgresso({ total_conteudos: '2', conteudos_concluidos: '2',
        progresso_percentual: 0, conteudo_concluido: false })).toMatchObject({ conteudo_concluido: true });
});

test('área de alunos exibe progresso e situação como métricas distintas', () => {
    const source = fs.readFileSync(path.join(__dirname, '../public/js/professor-turma-alunos.js'), 'utf8');
    expect(source).toContain('student.progresso_percentual');
    expect(source).toContain('student.status_aprovacao');
    expect(source).not.toContain('name="progresso_percentual"');
});

test('consultas de estado acadêmico vinculam tentativas ao ciclo atual', () => {
    const service = fs.readFileSync(path.join(__dirname, '../api/services/academic-progress.service.js'), 'utf8');
    const questionarios = fs.readFileSync(path.join(__dirname, '../api/models/questoes.models.js'), 'utf8');
    expect(service).toContain('t.ciclo_matricula = m.ciclo_atual');
    expect(questionarios).toContain('t.ciclo_matricula = m.ciclo_atual');
    expect(questionarios).toContain('ciclo_matricula = ?');
    expect(questionarios).toContain('t.ciclo_matricula');
});

const { resumirRequisitos } = require('../api/services/academic-progress.service');
test.each([[0,10,false],[7,10,false],[8,10,true],[9,10,true],[10,10,true],
    [3,4,false],[4,5,true],[80,101,false],[81,101,true],[0,0,false]])(
    'trilha exata %i/%i', (feitos,total,liberada) => {
        expect(resumirRequisitos(resumirProgresso(total,feitos),0,0,0).prova_liberada).toBe(liberada);
    }
);
test('conclusão exata, liberação e prova são requisitos distintos',()=>{
    const r=resumirRequisitos(resumirProgresso(201,200),2,2,1);
    expect(r).toMatchObject({prova_liberada:true,conteudo_concluido:false,elegivel_aprovacao:false});
    expect(resumirRequisitos(resumirProgresso(1,1),2,0,1).elegivel_aprovacao).toBe(true);
});
