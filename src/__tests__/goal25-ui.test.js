'use strict';
const fs = require('node:fs');
const path = require('node:path');
function load(name, exports) {
    const source = fs.readFileSync(path.join(__dirname, '../public/js', name), 'utf8').replace(/^import .*;\n/gm, '').replace(/\bexport\s+/g, '');
    return new Function('userMessage', `${source};return {${exports}};`)(name === 'academic-ui.js' ? userMessage : undefined);
}
const { questionnaireRoute } = load('questionnaire-route.js', 'questionnaireRoute');
const { userMessage } = load('user-message.js', 'userMessage');

test.each(['', '?id_turma=', '?id_turma=0', '?id_turma=-1', '?id_turma=1.5', '?id_turma=NaN', '?id_turma=9007199254740992', '?id_turma=1&tipo=invalid', '?id_turma=1&id_questionario=', '?id_turma=1&id_questionario=-1'])('reject invalid assessment address %s', search => {
    expect(() => questionnaireRoute(search)).toThrow(/Volte à Sala Virtual/);
});
test('optional assessment id and legacy exercise default remain valid', () => {
    expect(questionnaireRoute('?id_turma=12')).toEqual({idTurma:12,idQuestionario:null,tipo:'exercicio'});
    expect(questionnaireRoute('?id_turma=12&id_questionario=8&tipo=PROVA')).toEqual({idTurma:12,idQuestionario:8,tipo:'prova'});
});
test.each(['HTTP 500 JSON syntax', 'TypeError: Failed to fetch', 'backend failure', 'stack trace /app/index.js', 'Unexpected token <', 'ER_ACCESS_DENIED_ERROR', 'SELECT senha FROM Usuarios'])('internal error %s stays out of UI', text => {
    expect(userMessage(text, 'Tente novamente.')).toBe('Tente novamente.');
});
test('meaningful instructions survive sanitization', () => {
    expect(userMessage('Conclua pelo menos 80% dos conteúdos.')).toBe('Conclua pelo menos 80% dos conteúdos.');
});
test('success expires and replacing a message cancels its previous timer', () => {
    jest.useFakeTimers();
    try {
        const {setAcademicMessage} = load('academic-ui.js', 'setAcademicMessage');
        const element={classList:{remove:jest.fn(),add:jest.fn()},setAttribute:jest.fn()};
        setAcademicMessage(element,'Salvo.','success');
        jest.advanceTimersByTime(8000);expect(element.hidden).toBe(true);expect(element.textContent).toBe('');
        setAcademicMessage(element,'Salvo.','success');
        setAcademicMessage(element,'Conclua os conteúdos.','info');
        jest.advanceTimersByTime(8000);expect(element.hidden).toBe(false);expect(element.textContent).toBe('Conclua os conteúdos.');
        setAcademicMessage(element,'Confira os campos.','error');
        expect(element.setAttribute).toHaveBeenCalledWith('role','alert');
    } finally {jest.useRealTimers();}
});
