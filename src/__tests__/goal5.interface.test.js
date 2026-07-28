const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const cssDir = path.join(publicDir, 'css');
const html = fs.readFileSync(path.join(publicDir, 'verificador.html'), 'utf8');
const script = fs.readFileSync(path.join(publicDir, 'js', 'verificador.js'), 'utf8');
const service = fs.readFileSync(path.join(__dirname, '..', 'api', 'services', 'plagio.service.js'), 'utf8');
const components = fs.readFileSync(path.join(cssDir, 'components.css'), 'utf8');
const layouts = fs.readFileSync(path.join(cssDir, 'layouts.css'), 'utf8');
const responsive = fs.readFileSync(path.join(cssDir, 'responsive.css'), 'utf8');
const tokens = fs.readFileSync(path.join(cssDir, 'tokens.css'), 'utf8');
const styles = `${components}\n${layouts}\n${responsive}`;

function loadPureHelpers() {
    const start = script.indexOf('export function getVerifierTabTargetIndex');
    const end = script.indexOf('\nfunction createElement', start);
    const source = script.slice(start, end).replace(/\bexport\s+/g, '');
    return new Function(
        `${source}\nreturn { getVerifierTabTargetIndex, getSimilarityPresentation, getVerifierErrorMessage };`
    )();
}

describe('Goal Visual 5 - verificador de similaridade', () => {
    it('usa a cascata incremental, um único h1 e separa formulário e resultado', () => {
        const localStyles = [...html.matchAll(/<link\s+rel="stylesheet"\s+href="(\/css\/[^"]+)">/g)]
            .map((match) => match[1]);
        expect(localStyles).toEqual([
            '/css/tokens.css',
            '/css/base.css',
            '/css/style.css',
            '/css/components.css',
            '/css/layouts.css',
            '/css/responsive.css',
            '/css/utilities.css'
        ]);
        expect(html.match(/<h1\b/g)).toHaveLength(1);
        expect(html).toContain('id="verifier-title"');
        expect(html).toContain('id="verifier-form"');
        expect(html).toContain('class="verifier-card verifier-results"');
        expect(html).toContain('Similaridade é um indicador de apoio');
    });

    it('associa os campos do payload, preserva limites e oferece ações reais', () => {
        expect(html).toMatch(/<label for="textoOriginal">/);
        expect(html).toMatch(/name="texto_original"[\s\S]*?maxlength="15000"/);
        expect(html).toMatch(/<label for="textoSuspeito">/);
        expect(html).toMatch(/name="texto_suspeito"[\s\S]*?maxlength="15000"/);
        expect(html).toContain('id="btnAnalyze" type="submit"');
        expect(html).toContain('id="btnClear" type="button"');
        expect(html).not.toContain('type="file"');
        expect(html).not.toContain('Exportar relatório');
        expect(script).not.toContain('/api/extract');
        expect(script).not.toContain('Texto extraído');
    });

    it('preserva os dois endpoints, payload, autorização e timeout de 10 segundos', () => {
        expect(script).toContain("const ANALYSIS_ENDPOINT = '/api/plagio/analisar'");
        expect(script).toContain("method: 'POST'");
        expect(script).toContain("'Content-Type': 'application/json'");
        expect(script).toContain("Authorization: `Bearer ${getToken() || ''}`");
        expect(script).toContain('texto_original: original');
        expect(script).toContain('texto_suspeito: suspect');
        expect(service).toContain("'http://127.0.0.1:8000/api/analisar'");
        expect(service).toContain('IA_ANALISE_TIMEOUT_MS || 10000');
        expect(service).toContain('JSON.stringify({ texto_original, texto_suspeito })');
    });

    it('mantém o score bruto e não calcula originalidade ou métricas ausentes', () => {
        expect(script).toContain('payload?.resultado?.score_similaridade');
        expect(script).toContain('scoreValue.dataset.rawScore = String(rawScore)');
        expect(script).toContain('`${formatScore(rawScore)}%`');
        expect(script).not.toContain('Math.round');
        expect(script).not.toMatch(/100\s*-\s*(similaridade|numericScore|rawScore)/);
        expect(script).not.toContain('Math.min(100');
        expect(script).not.toContain('Math.max(0');
        expect(html).not.toContain('Plágio direto');
        expect(html).not.toContain('Paráfrases');
        expect(html).not.toContain('Distribuição por segmento');
    });

    it('preserva as faixas visuais existentes sem criar conclusão absoluta', () => {
        const { getSimilarityPresentation } = loadPureHelpers();
        expect(getSimilarityPresentation(59.99)).toMatchObject({
            level: 'low',
            label: 'Baixa similaridade'
        });
        expect(getSimilarityPresentation(60)).toMatchObject({
            level: 'moderate',
            label: 'Similaridade moderada'
        });
        expect(getSimilarityPresentation(80)).toMatchObject({
            level: 'high',
            label: 'Alta similaridade'
        });
        expect(html).not.toMatch(/plágio confirmado/i);
        expect(html).toContain('não confirma plágio por si só');
    });

    it('implementa tabs ARIA, painel oculto e navegação circular por teclado', () => {
        expect(html).toContain('role="tablist"');
        expect(html.match(/role="tab"/g)).toHaveLength(3);
        expect(html.match(/role="tabpanel"/g)).toHaveLength(3);
        expect(html).toContain('aria-selected="true" aria-controls="panel-result" tabindex="0"');
        expect(html).toContain('aria-selected="false" aria-controls="panel-details" tabindex="-1"');
        expect(html).toMatch(/id="panel-details"[\s\S]*?hidden/);
        expect(script).toContain("tab.setAttribute('aria-selected', String(selected))");
        expect(script).toContain('panel.hidden = panel.id !== `panel-${tabName}`');

        const { getVerifierTabTargetIndex } = loadPureHelpers();
        expect(getVerifierTabTargetIndex('ArrowRight', 2, 3)).toBe(0);
        expect(getVerifierTabTargetIndex('ArrowLeft', 0, 3)).toBe(2);
        expect(getVerifierTabTargetIndex('Home', 2, 3)).toBe(0);
        expect(getVerifierTabTargetIndex('End', 0, 3)).toBe(2);
        expect(getVerifierTabTargetIndex('Escape', 1, 3)).toBeNull();
    });

    it('expõe loading estável, aria-busy e bloqueio explícito de envio duplicado', () => {
        expect(html).toContain('id="verifier-form" novalidate aria-busy="false"');
        expect(html).toContain('id="resultLoading" role="status" hidden');
        expect(script).toContain('if (isAnalyzing) return');
        expect(script).toContain("form.setAttribute('aria-busy', String(busy))");
        expect(script).toContain('btnAnalyze.disabled = busy');
        expect(script).toContain('btnClear.disabled = busy');
        expect(script).toContain("setAnalysisState('loading'");
        expect(script).toContain("setAnalysisState('success'");
        expect(script).toContain("setAnalysisState('error'");
        expect(styles).toContain('.verificador-page[data-analysis-state="loading"]');
    });

    it('distingue validação 422, timeout, erro 500 e indisponibilidade 503', () => {
        const { getVerifierErrorMessage } = loadPureHelpers();
        const messages = {
            validation: getVerifierErrorMessage(422),
            timeout: getVerifierErrorMessage(undefined, { name: 'TimeoutError' }),
            internal: getVerifierErrorMessage(500),
            unavailable: getVerifierErrorMessage(503)
        };
        expect(messages.validation).toContain('validação');
        expect(messages.timeout).toContain('10 segundos');
        expect(messages.internal).toContain('erro interno');
        expect(messages.unavailable).toContain('indisponível');
        expect(new Set(Object.values(messages)).size).toBe(4);
        expect(script).toContain("error.code === 'empty_result'");
    });

    it('apresenta status, textos e fontes somente com dados reais e DOM seguro', () => {
        expect(html).toContain('id="motorStatus"');
        expect(html).toContain('id="resultOriginal"');
        expect(html).toContain('id="resultSuspect"');
        expect(html).toContain('id="sourcesContent"');
        expect(script).toContain("document.getElementById('resultOriginal').textContent = original");
        expect(script).toContain("document.getElementById('resultSuspect').textContent = suspect");
        expect(script).toContain('sourcesContent.replaceChildren()');
        expect(script).toContain('window.SecurityUtils?.toSafeUrl');
        expect(script).toContain('document.createElement');
        expect(script).toContain('textContent');
        expect(script).not.toContain('innerHTML');
        expect(script).not.toMatch(/\.onclick\s*=/);
        expect(html).not.toMatch(/\son[a-z]+\s*=/i);
        expect(html).not.toMatch(/<script(?![^>]*\bsrc=)/i);
    });

    it('usa dialogs nativos centralizados, com foco contido e restaurado', () => {
        expect(html.match(/<dialog\b/g)).toHaveLength(2);
        expect(html.match(/class="verificador-dialog/g)).toHaveLength(2);
        expect(html).toContain('aria-labelledby="shortcutsTitle"');
        expect(html).toContain('aria-describedby="shortcutsDescription"');
        expect(html).toContain('aria-labelledby="clearDialogTitle"');
        expect(script).toContain('dialog.showModal()');
        expect(script).toContain("if (event.key !== 'Tab') return");
        expect(script).toContain('lockPageScroll(document)');
        expect(script).not.toContain('.style.overflow');
        expect(script).toContain('returnFocus.focus()');
        expect(components).toMatch(/\.verificador-dialog\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*0;[\s\S]*?margin:\s*auto;/);
        expect(components).toMatch(/\.verificador-dialog::backdrop\s*\{[\s\S]*?inset:\s*0;/);
    });

    it('mantém temas semânticos, alvos de toque e layout sem overflow', () => {
        expect(tokens).toContain('.light-mode');
        expect(tokens).toContain('.dark-mode');
        expect(layouts).toMatch(/\.verificador-page\s*\{[\s\S]*?overflow-x:\s*hidden/);
        expect(components).toMatch(/\.verificador-page \.verifier-tab\s*\{[\s\S]*?min-block-size:\s*48px/);
        expect(components).toMatch(/\.verificador-page \.verifier-form-actions \.btn[\s\S]*?min-block-size:\s*44px/);
        expect(responsive).toContain('@media (max-width: 980px)');
        expect(responsive).toContain('@media (max-width: 640px)');
        expect(responsive).toMatch(/\.verificador-page \.verifier-comparison-grid\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
        expect(responsive).toContain('@media (max-height: 600px)');
    });
});
