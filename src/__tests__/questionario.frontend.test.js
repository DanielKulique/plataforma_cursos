const fs = require('fs');
const path = require('path');

const publicPath = (...parts) => path.join(__dirname, '..', 'public', ...parts);

function response(status, payload = {}) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: jest.fn().mockResolvedValue(payload)
    };
}

function loadAvailability() {
    const source = fs.readFileSync(
        publicPath('js', 'questionario-disponibilidade.js'),
        'utf8'
    ).replace(/^import .*;\n/gm, '').replace(/\bexport\s+/g, '');
    const factory = new Function(
        'authenticatedFetch',
        `${source}\nreturn { buscarQuestionarioDisponivel };`
    );
    return factory(jest.fn());
}

describe('questionário real no frontend do aluno', () => {
    const questionario = {
        id_questionario: 9,
        id_turma: 3,
        tipo: 'EXERCICIO',
        perguntas: [{
            id_pergunta: 11,
            texto_pergunta: 'Pergunta real',
            opcoes: [
                { id_opcao: 21, texto_opcao: 'A' },
                { id_opcao: 22, texto_opcao: 'B' }
            ]
        }]
    };

    it('torna disponível o questionário retornado pela API para a turma matriculada', async () => {
        const request = jest.fn().mockResolvedValue(response(200, { questionario }));
        const { buscarQuestionarioDisponivel } = loadAvailability();

        await expect(buscarQuestionarioDisponivel({
            idTurma: 3,
            tipo: 'exercicio',
            request
        })).resolves.toEqual(questionario);
        expect(request).toHaveBeenCalledWith(
            '/api/turmas/3/questionarios/disponivel?tipo=exercicio',
            { credentials: 'same-origin' }
        );
    });

    it.each([
        [403, 'aluno sem matrícula'],
        [404, 'questionário inativo ou ausente']
    ])('mantém o acesso invisível em HTTP %i (%s)', async (status) => {
        const { buscarQuestionarioDisponivel } = loadAvailability();
        await expect(buscarQuestionarioDisponivel({
            idTurma: 3,
            tipo: 'exercicio',
            request: jest.fn().mockResolvedValue(response(status))
        })).resolves.toBeNull();
    });

    it('recusa payload ativo sem pergunta e opções válidas', async () => {
        const { buscarQuestionarioDisponivel } = loadAvailability();
        await expect(buscarQuestionarioDisponivel({
            idTurma: 3,
            tipo: 'exercicio',
            request: jest.fn().mockResolvedValue(response(200, {
                questionario: { ...questionario, perguntas: [{ id_pergunta: 11, opcoes: [] }] }
            }))
        })).rejects.toThrow('O questionário ativo está incompleto.');
    });

    it('usa identificadores reais, uma opção por pergunta, submissão e histórico sem fallback mock', () => {
        const sala = fs.readFileSync(publicPath('js', 'sala-avaliacoes.js'), 'utf8');
        const paginaSala = fs.readFileSync(publicPath('sala-avaliacoes.html'), 'utf8');
        const fluxo = fs.readFileSync(publicPath('js', 'questionario.js'), 'utf8');
        const disponibilidade = fs.readFileSync(
            publicPath('js', 'questionario-disponibilidade.js'),
            'utf8'
        );

        expect(paginaSala).toContain('id="lista-provas"');
        expect(paginaSala).toContain('id="lista-exercicios"');
        expect(sala).toContain('/api/turmas/${idTurma}/questionarios');
        expect(sala).toContain('id_questionario=${encodeURIComponent(item.id_questionario)}');
        expect(sala).toContain('id_turma=${encodeURIComponent(idTurma)}');
        expect(fluxo).toContain("input.type = 'radio'");
        expect(fluxo).toContain('input.name = `pergunta_${pergunta.id_pergunta}`');
        expect(fluxo).toContain('/submissoes');
        expect(fluxo).toContain('/api/questionarios/historico?id_questionario=');
        expect(`${sala}\n${fluxo}\n${disponibilidade}`).not.toMatch(
            /\b(?:MOCK|mockData|fallbackQuestionario|demo=1)\b/
        );
    });

    it('mantém as mensagens acadêmicas coerentes com exercício, prova final e novas tentativas', () => {
        const sala = fs.readFileSync(publicPath('js', 'sala-avaliacoes.js'), 'utf8');
        const fluxo = fs.readFileSync(publicPath('js', 'questionario.js'), 'utf8');
        const modelo = fs.readFileSync(
            path.join(__dirname, '..', 'api', 'models', 'questoes.models.js'),
            'utf8'
        );

        expect(sala).toContain('Complete pelo menos ${requisito}% da trilha para liberar esta avaliação.');
        expect(sala).toContain('Seu progresso: ${progresso}%.');
        expect(fluxo).toContain('Você pode tentar novamente.');
        expect(fluxo).not.toMatch(/reprovad[oa]/i);
        expect(fluxo).toContain("questionario.prova_final ? 'PROVA FINAL · mínimo 75%'");
        expect(fluxo).toContain(": tipo === 'prova' ? 'Prova intermediária' : 'Exercício'");
        expect(modelo).toContain('somente disponibilidade, aula e ordem podem ser ajustadas.');
        expect(modelo).not.toContain('somente disponibilidade e organização.');
    });
});
