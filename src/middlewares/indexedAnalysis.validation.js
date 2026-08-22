'use strict';

const SECTION_TYPES = new Set([
    'DOCUMENT_TITLE', 'ABSTRACT', 'KEYWORDS', 'INTRODUCTION', 'BACKGROUND',
    'LITERATURE_REVIEW', 'THEORETICAL_FRAMEWORK', 'METHODS', 'MATERIALS',
    'RESULTS', 'DISCUSSION', 'RESULTS_AND_DISCUSSION', 'CONCLUSION', 'LIMITATIONS',
    'ACKNOWLEDGMENTS', 'FUNDING', 'CONFLICT_OF_INTEREST', 'DATA_AVAILABILITY',
    'NOTES', 'REFERENCES', 'APPENDIX', 'SUPPLEMENTARY', 'OTHER'
]);
const ALLOWED_KEYS = new Set([
    'text', 'top_k', 'exclude_document_id', 'exclude_document_hash',
    'allowed_section_types', 'include_references', 'include_quotes',
    'maximum_candidates_per_query_segment'
]);

function validationError(res, message = 'Os dados da análise são inválidos.') {
    return res.status(422).json({ codigo: 'ANALISE_PAYLOAD_INVALIDO', mensagem: message });
}

function validateIndexedAnalysis(req, res, next) {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)
        || Object.keys(body).some((key) => !ALLOWED_KEYS.has(key))) return validationError(res);
    const maximumCharacters = Number(process.env.RETRIEVAL_MAX_QUERY_CHARACTERS || 50000);
    const maximumTopK = Number(process.env.RETRIEVAL_TOP_K_MAX || 50);
    if (typeof body.text !== 'string' || !body.text.trim()) return validationError(res, 'O texto deve ser não vazio.');
    if (body.text.length > maximumCharacters) {
        return res.status(413).json({ codigo: 'ANALISE_CONTEUDO_EXCESSIVO', mensagem: 'O texto excede o limite permitido.' });
    }
    for (const key of ['top_k', 'maximum_candidates_per_query_segment']) {
        if (body[key] !== undefined && (!Number.isInteger(body[key]) || body[key] < 1 || body[key] > maximumTopK)) {
            return validationError(res);
        }
    }
    if (body.exclude_document_id !== undefined
        && (typeof body.exclude_document_id !== 'string'
            || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.exclude_document_id))) {
        return validationError(res);
    }
    if (body.exclude_document_hash !== undefined
        && (typeof body.exclude_document_hash !== 'string' || !/^[0-9a-f]{64}$/.test(body.exclude_document_hash))) {
        return validationError(res);
    }
    if (body.allowed_section_types !== undefined
        && (!Array.isArray(body.allowed_section_types) || body.allowed_section_types.length > 32
            || body.allowed_section_types.some((value) => !SECTION_TYPES.has(value)))) return validationError(res);
    for (const key of ['include_references', 'include_quotes']) {
        if (body[key] !== undefined && typeof body[key] !== 'boolean') return validationError(res);
    }
    return next();
}

module.exports = { validateIndexedAnalysis, SECTION_TYPES };
