/**
 * @fileoverview Cliente HTTP centralizado para comunicação com a API
 * @description Gerencia requisições, autenticação, retry e tratamento de erros
 */

import { getToken, clearToken } from './auth.js';
import { cacheManager } from './cache.js';

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const API_BASE = '/api';
const DEFAULT_TIMEOUT = 30000; // 30 segundos
const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000; // 1 segundo
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);
const STATUS_MESSAGES = Object.freeze({
    400: 'Dados inválidos na requisição.',
    401: 'Sessão expirada. Faça login novamente.',
    403: 'Você não tem permissão para esta ação.',
    404: 'Recurso não encontrado.',
    408: 'Tempo limite excedido. Tente novamente.',
    409: 'A operação entrou em conflito com o estado atual.',
    429: 'Muitas solicitações. Aguarde e tente novamente.',
    500: 'O servidor não conseguiu concluir a solicitação.',
    502: 'Serviço temporariamente indisponível.',
    503: 'Serviço temporariamente indisponível.',
    504: 'O servidor demorou mais que o esperado.'
});

// ============================================================
// CLASSES DE ERRO
// ============================================================

/**
 * Erro personalizado para requisições de API
 */
export class APIError extends Error {
    /**
     * @param {string} message - Mensagem de erro
     * @param {number} status - Código HTTP
     * @param {Object} [data] - Dados adicionais do erro
     */
    constructor(message, status, data = null) {
        super(message);
        this.name = 'APIError';
        this.status = status;
        this.data = data;
    }

    /**
     * Verifica se é erro de autenticação
     * @returns {boolean}
     */
    isAuthError() {
        return this.status === 401;
    }

    /**
     * Verifica se é erro de permissão
     * @returns {boolean}
     */
    isPermissionError() {
        return this.status === 403;
    }

    /**
     * Verifica se é erro de rede
     * @returns {boolean}
     */
    isNetworkError() {
        return this.status === 0 || this.status === 503;
    }
}

// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

/**
 * Aguarda um tempo antes de continuar
 * @param {number} ms - Milissegundos para aguardar
 * @returns {Promise<void>}
 */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calcula delay para retry com backoff exponencial
 * @param {number} attempt - Número da tentativa (0-indexed)
 * @returns {number} - Delay em ms
 */
function getRetryDelay(attempt) {
    return RETRY_DELAY_BASE * Math.pow(2, attempt);
}

/**
 * Extrai mensagem de erro do payload da resposta
 * @param {Object} payload - Payload da resposta
 * @returns {string}
 */
function extractErrorMessage(payload) {
    return (
        payload?.mensagem ||
        payload?.message ||
        payload?.errors?.[0]?.msg ||
        'Erro na requisição'
    );
}

function getMethod(options) {
    return String(options.method || 'GET').toUpperCase();
}

function createHttpError(status, payload) {
    const fallback = STATUS_MESSAGES[status] || 'Erro na requisição';
    const message = status === 401 || status === 403
        ? fallback
        : extractErrorMessage(payload) || fallback;
    return new APIError(message === 'Erro na requisição' ? fallback : message, status, payload);
}

function isTransientFailure(error) {
    if (error instanceof APIError) return RETRYABLE_STATUS_CODES.has(error.status);
    return error?.name === 'AbortError' || error instanceof TypeError;
}

// ============================================================
// CLIENTE HTTP
// ============================================================

/**
 * Realiza requisição HTTP com suporte a retry e timeout
 * @param {string} endpoint - Endpoint da API (sem /api)
 * @param {Object} options - Opções do fetch
 * @param {Object} [config] - Configurações adicionais
 * @param {number} [config.retries] - Número de retries
 * @param {number} [config.timeout] - Timeout em ms
 * @param {boolean} [config.useCache] - Se deve usar cache
 * @param {number} [config.cacheDuration] - Duração do cache em ms
 * @returns {Promise<any>}
 */
export async function apiRequest(endpoint, options = {}, config = {}) {
    const {
        retries = MAX_RETRIES,
        timeout = DEFAULT_TIMEOUT,
        useCache = false,
        cacheDuration = 5 * 60 * 1000
    } = config;

    const method = getMethod(options);
    const url = `${API_BASE}${endpoint}`;
    const cacheKey = `api:${method}:${url}`;
    const maxAttempts = method === 'GET' ? Math.max(1, Number(retries) || 1) : 1;

    // Verificar cache para GET requests
    if (useCache && method === 'GET') {
        const cached = cacheManager.get(cacheKey);
        if (cached) {
            return cached;
        }
    }

    // Preparar headers
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers.Authorization = `Bearer ${token}`;
    }

    let lastError;

    // Loop de retry
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // Cada tentativa precisa de sinal e timeout independentes. Um sinal abortado
        // nunca pode contaminar uma tentativa posterior.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(url, {
                ...options,
                method,
                headers,
                signal: controller.signal
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({}));
                if (response.status === 401) clearToken();
                throw createHttpError(response.status, payload);
            }

            // Resposta vazia (204 No Content)
            if (response.status === 204) {
                return null;
            }

            const data = await response.json();

            // Armazenar em cache se configurado
            if (useCache && method === 'GET') {
                cacheManager.set(cacheKey, data, cacheDuration);
            }

            return data;
        } catch (error) {
            if (error.name === 'AbortError') {
                lastError = new APIError('Tempo limite excedido. Tente novamente.', 408);
            } else if (error instanceof APIError) {
                lastError = error;
            } else {
                lastError = new APIError(
                    error?.message || 'Falha na conexão. Verifique sua internet.',
                    0
                );
            }

            const canRetry = method === 'GET'
                && isTransientFailure(error)
                && attempt < maxAttempts - 1;
            if (!canRetry) throw lastError;

            if (attempt < maxAttempts - 1) {
                const delay = getRetryDelay(attempt);
                console.warn(`Tentativa ${attempt + 1} falhou. Retry em ${delay}ms...`);
                await sleep(delay);
            }
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // Todas as tentativas falharam
    if (lastError instanceof APIError) {
        throw lastError;
    }

    throw new APIError(lastError?.message || 'Falha na conexão. Verifique sua internet.', 0);
}

// ============================================================
// MÉTODOS HTTP SIMPLIFICADOS
// ============================================================

/**
 * Requisição GET
 * @param {string} endpoint - Endpoint da API
 * @param {Object} [config] - Configurações (useCache, cacheDuration, etc)
 * @returns {Promise<any>}
 */
export function get(endpoint, config = {}) {
    return apiRequest(endpoint, { method: 'GET' }, config);
}

/**
 * Requisição POST
 * @param {string} endpoint - Endpoint da API
 * @param {Object} [data] - Dados a enviar
 * @param {Object} [config] - Configurações
 * @returns {Promise<any>}
 */
export function post(endpoint, data = {}, config = {}) {
    return apiRequest(
        endpoint,
        {
            method: 'POST',
            body: JSON.stringify(data)
        },
        config
    );
}

/**
 * Requisição PUT
 * @param {string} endpoint - Endpoint da API
 * @param {Object} [data] - Dados a enviar
 * @param {Object} [config] - Configurações
 * @returns {Promise<any>}
 */
export function put(endpoint, data = {}, config = {}) {
    return apiRequest(
        endpoint,
        {
            method: 'PUT',
            body: JSON.stringify(data)
        },
        config
    );
}

/**
 * Requisição PATCH
 * @param {string} endpoint - Endpoint da API
 * @param {Object} [data] - Dados a enviar
 * @param {Object} [config] - Configurações
 * @returns {Promise<any>}
 */
export function patch(endpoint, data = {}, config = {}) {
    return apiRequest(
        endpoint,
        {
            method: 'PATCH',
            body: JSON.stringify(data)
        },
        config
    );
}

/**
 * Requisição DELETE
 * @param {string} endpoint - Endpoint da API
 * @param {Object} [config] - Configurações
 * @returns {Promise<any>}
 */
export function del(endpoint, config = {}) {
    return apiRequest(endpoint, { method: 'DELETE' }, config);
}

// ============================================================
// HANDLERS DE ERRO
// ============================================================

/**
 * Trata erro de API e redireciona se necessário
 * @param {Error} error - Erro capturado
 * @param {Object} [options] - Opções de redirecionamento
 * @param {string} [options.authRedirect] - URL para redirecionar em erro 401
 * @param {string} [options.permissionRedirect] - URL para redirecionar em erro 403
 * @returns {string} - Mensagem de erro formatada
 */
export function handleAPIError(error, options = {}) {
    const {
        authRedirect = '/login.html?motivo=auth',
        permissionRedirect = '/index.html?motivo=nao_autorizado'
    } = options;

    if (error instanceof APIError) {
        if (error.isAuthError()) {
            window.location.href = authRedirect;
            return error.message;
        }

        if (error.isPermissionError()) {
            window.location.href = permissionRedirect;
            return error.message;
        }

        return error.message;
    }

    // Erro de rede ou desconhecido
    console.error('Erro não tratado:', error);
    return 'Erro de conexão. Verifique sua internet e tente novamente.';
}

// ============================================================
// ENDPOINTS ESPECÍFICOS
// ============================================================

/**
 * Busca lista de cursos (com cache)
 * @returns {Promise<Array>}
 */
export function getCursos() {
    return get('/cursos', { useCache: true, cacheDuration: 5 * 60 * 1000 });
}

/**
 * Busca lista de turmas (com cache)
 * @returns {Promise<Array>}
 */
export function getTurmas() {
    return get('/turmas', { useCache: true, cacheDuration: 2 * 60 * 1000 });
}

/**
 * Busca turmas do professor
 * @param {number} idProfessor - ID do professor
 * @returns {Promise<Object>}
 */
export function getTurmasProfessor(idProfessor) {
    return get(`/turmas/professor/${idProfessor}`);
}

/**
 * Busca sala virtual do aluno
 * @returns {Promise<Object>}
 */
export function getMinhaSala() {
    return get('/matriculas/minha-sala');
}

/**
 * Verifica disponibilidade de email/CPF para cadastro
 * @param {string} email
 * @param {string} cpf
 * @returns {Promise<Object>}
 */
export function verificarDisponibilidade(email, cpf) {
    return post('/usuarios/verificar-disponibilidade', { email, cpf });
}

/**
 * Cadastra novo usuário
 * @param {Object} dados - Dados do usuário
 * @returns {Promise<Object>}
 */
export function cadastrarUsuario(dados) {
    return post('/usuarios', dados);
}

/**
 * Envia código de verificação por email
 * @param {string} email
 * @returns {Promise<Object>}
 */
export function enviarCodigoVerificacao(email) {
    return post('/auth/enviar-codigo-verificacao', { email });
}

/**
 * Invalida cache para um endpoint específico
 * @param {string} endpoint
 */
export function invalidateCache(endpoint) {
    const cacheKey = `api:GET:${API_BASE}${endpoint}`;
    cacheManager.delete(cacheKey);
}

/**
 * Invalida todo o cache de API
 */
export function invalidateAllCache() {
    cacheManager.clear();
}
