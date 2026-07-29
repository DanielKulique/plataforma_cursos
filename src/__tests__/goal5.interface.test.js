const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const html = fs.readFileSync(path.join(publicDir, 'verificador.html'), 'utf8');
const script = fs.readFileSync(path.join(publicDir, 'js', 'verificador.js'), 'utf8');
const components = fs.readFileSync(path.join(publicDir, 'css', 'components.css'), 'utf8');
const responsive = fs.readFileSync(path.join(publicDir, 'css', 'responsive.css'), 'utf8');

function helpers() {
    const start = script.indexOf('export const RULE_GUIDANCE');
    const end = script.indexOf('\nfunction element', start);
    const source = script.slice(start, end).replace(/\bexport\s+/g, '');
    return new Function(`${source}\nreturn { RULE_GUIDANCE, formatPercent, getContextualErrorMessage, buildContextualPayload, isContextualResponse, getVerifierTabTargetIndex };`)();
}

function validResponse() {
    return {
        success: true,
        data: {
            versao_contrato: '1.0', status_analise: 'CONCLUIDO',
            resumo: { total_segmentos: 2, segmentos_analisados: 2, total_alertas: 0, gravidade_maxima: null },
            parametros_aplicados: { limiar_semantico: 0.8, limiar_lexical_reproducao: 0.7, limiar_lexical_parafrase: 0.2 },
            segmentos: [], alertas: [], citacoes: [], referencias: [], associacoes: []
        }
    };
}

describe('Goal Detector 4 — interface contextual e relatório de alertas', () => {
    it('usa sessão central, cliente HTTP e a rota Node contextual', () => {
        expect(script).toContain("import { APIError, post } from './api.js'");
        expect(script).toContain("const INCREMENTAL_ENDPOINT = '/analises/contextual/segmento'");
        expect(script).toContain("const COMPLETE_ENDPOINT = '/analises/contextual/documento'");
        expect(script).toContain('post(INCREMENTAL_ENDPOINT');
        expect(script).toContain('COMPLETE_ENDPOINT,');
        expect(script).toContain("initSessionUI({ requiredRoles: ['ALUNO', 'PROFESSOR', 'ADMIN'] })");
        expect(script).not.toContain('fetch(');
        expect(script).not.toContain('/api/plagio/analisar');
        expect(script).not.toContain('localhost:8000');
        expect(html).toContain('data-session-protected');
    });

    it('oferece entradas mínimas, metadados e parâmetros opcionais com limites canônicos', () => {
        expect(html).toMatch(/name="documento"[\s\S]*?maxlength="100000"/);
        expect(html).toMatch(/name="fonte_comparada"[\s\S]*?maxlength="50000"/);
        expect(html).toContain('id="sourceMetadata"');
        expect(html).toContain('id="advancedSettings"');
        expect(html).toContain('id="autores"');
        expect(html).toContain('id="limiarSemantico"');
        expect(html).toContain('id="btnResetSettings"');
        expect(html).toContain('id="modoFontes"');
        expect(html).toContain('value="BUSCA_AUTOMATICA"');
        expect(html).toContain('value="HIBRIDO"');
        expect(html).toContain('id="incrementalSegments"');
        expect(html).not.toContain('type="file"');

        const { buildContextualPayload } = helpers();
        expect(buildContextualPayload({
            documento: ' Documento ', fonteComparada: ' Fonte ', autores: 'Ana; Bruno', ano: '2024', titulo: 'Título', doi: '10.1/x', url: 'https://example.test',
            advancedOpen: true, limiarSemantico: '0.8', limiarReproducao: '0.7', limiarParafrase: '0.2'
        })).toEqual({
            documento: 'Documento', fonte_comparada: 'Fonte',
            metadados_fonte: { autores: ['Ana', 'Bruno'], ano: 2024, titulo: 'Título', doi: '10.1/x', url: 'https://example.test' },
            parametros: { limiar_semantico: 0.8, limiar_lexical_reproducao: 0.7, limiar_lexical_parafrase: 0.2 }
        });
    });

    it('valida o contrato contextual antes da renderização e trata listas vazias', () => {
        const { isContextualResponse } = helpers();
        expect(isContextualResponse(validResponse())).toBe(true);
        expect(isContextualResponse({ success: true, data: { versao_contrato: '1.0' } })).toBe(false);
        expect(script).toContain('if (!isCompleteResponse(payload) && !isContextualResponse(payload))');
        expect(script).toContain('Não há alertas contextuais para listar nesta análise.');
        expect(script).toContain('O detector não retornou segmentos para esta análise.');
        expect(script).toContain('Nenhuma citação foi identificada.');
    });

    it('apresenta resumo, segmentos, scores, citações, referências e associações', () => {
        ['summaryContent', 'alertsContent', 'segmentsContent', 'citationsContent', 'referencesContent', 'associationsContent'].forEach((id) => expect(html).toContain(`id="${id}"`));
        expect(script).toContain("renderScore('Similaridade semântica'");
        expect(script).toContain("renderScore('Sobreposição lexical'");
        expect(script).toContain("progress.setAttribute('aria-label'");
        expect(script).toContain('Similaridade não é percentual de plágio.');
        expect(script).toContain('Prioridades de revisão: Informativa, Baixa, Média e Alta.');
        expect(script).toContain('Mais de uma referência pode corresponder a esta citação.');
    });

    it('mapeia as sete regras para orientação educativa e não acusatória', () => {
        const { RULE_GUIDANCE } = helpers();
        expect(Object.keys(RULE_GUIDANCE)).toEqual(['REG-01', 'REG-02', 'REG-03', 'REG-04', 'REG-05', 'REG-06', 'REG-07']);
        expect(RULE_GUIDANCE['REG-05'].guidance).toContain('Inconsistência documental');
        expect(RULE_GUIDANCE['REG-01'].title).toContain('Possível');
        expect(script).toContain('Ação recomendada');
        expect(script).not.toMatch(/plágio detectado|plágio confirmado|culpado|fraude/i);
        expect(html).not.toMatch(/percentual de plágio|plágio detectado|plágio confirmado/i);
    });

    it('distingue validação, indisponibilidade, timeout e resposta incompatível', () => {
        const { getContextualErrorMessage } = helpers();
        expect(getContextualErrorMessage({ status: 422 })).toContain('Revise');
        expect(getContextualErrorMessage({ status: 503 })).toContain('temporariamente indisponível');
        expect(getContextualErrorMessage({ status: 504 })).toContain('conteúdo não foi perdido');
        expect(getContextualErrorMessage({ status: 502 })).toContain('formato incompatível');
        expect(script).toContain("setAnalysisState('loading'");
        expect(script).toContain("setAnalysisState('success'");
        expect(script).toContain("setAnalysisState('error'");
        expect(script).toContain('if (isAnalyzing) return');
    });

    it('mantém DOM seguro, privacidade local e links externos protegidos', () => {
        expect(script).toContain('document.createElement');
        expect(script).toContain('textContent');
        expect(script).toContain('document.createDocumentFragment');
        expect(script).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|\.onclick\s*=/);
        expect(script).not.toMatch(/localStorage|sessionStorage|console\.log/);
        expect(script).toContain('createIncrementalCoordinator');
        expect(script).toContain('reconcileEditorSegments');
        expect(script).toContain('incrementalCoordinator.schedule');
        expect(script).toContain("link.target = '_blank'");
        expect(script).toContain("link.rel = 'noopener noreferrer'");
        expect(html).not.toMatch(/\son[a-z]+\s*=/i);
        expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/i);
        expect(html).toContain('Evite inserir informações pessoais ou sigilosas.');
    });

    it('mantém teclado, foco, live regions, diálogos e responsividade', () => {
        expect(html).toContain('role="tablist"');
        expect(html).toContain('aria-live="polite"');
        expect(script).toContain('resultContent.focus');
        expect(script).toContain('invalid[0].focus');
        expect(script).toContain('dialog.showModal()');
        expect(script).toContain('lockPageScroll(document)');
        const { getVerifierTabTargetIndex } = helpers();
        expect(getVerifierTabTargetIndex('ArrowRight', 2, 3)).toBe(0);
        expect(getVerifierTabTargetIndex('ArrowLeft', 0, 3)).toBe(2);
        expect(components).toContain('.verificador-page .verifier-score-grid');
        expect(responsive).toContain('.verificador-page .verifier-form-grid');
        expect(responsive).toContain('grid-template-columns: minmax(0, 1fr)');
    });
});
