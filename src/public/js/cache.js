/**
 * @fileoverview Gerenciador de cache para dados do frontend
 * @description Cache em memória com suporte a expiração e persistência opcional
 */

// ============================================================
// CONFIGURAÇÃO
// ============================================================

const DEFAULT_DURATION = 5 * 60 * 1000; // 5 minutos
const STORAGE_PREFIX = 'cache:';

// ============================================================
// CACHE MANAGER
// ============================================================

/**
 * Gerenciador de cache com suporte a TTL
 */
class CacheManager {
    constructor() {
        /** @type {Map<string, {value: any, expiry: number}>} */
        this.cache = new Map();
        this.cleanupInterval = null;

        // Iniciar limpeza periódica
        this.startCleanup();
    }

    /**
     * Armazena valor no cache
     * @param {string} key - Chave do cache
     * @param {any} value - Valor a armazenar
     * @param {number} [duration] - Duração em ms (padrão: 5 min)
     */
    set(key, value, duration = DEFAULT_DURATION) {
        const expiry = Date.now() + duration;
        this.cache.set(key, { value, expiry });
    }

    /**
     * Obtém valor do cache
     * @param {string} key - Chave do cache
     * @returns {any|null} Valor ou null se não existir/expirado
     */
    get(key) {
        const item = this.cache.get(key);

        if (!item) {
            return null;
        }

        if (Date.now() > item.expiry) {
            this.cache.delete(key);
            return null;
        }

        return item.value;
    }

    /**
     * Verifica se chave existe e não está expirada
     * @param {string} key - Chave do cache
     * @returns {boolean}
     */
    has(key) {
        return this.get(key) !== null;
    }

    /**
     * Remove item do cache
     * @param {string} key - Chave do cache
     * @returns {boolean} Se o item existia
     */
    delete(key) {
        return this.cache.delete(key);
    }

    /**
     * Limpa todo o cache
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Remove itens expirados
     */
    cleanup() {
        const now = Date.now();
        for (const [key, item] of this.cache.entries()) {
            if (now > item.expiry) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Inicia limpeza periódica (a cada 1 minuto)
     */
    startCleanup() {
        if (this.cleanupInterval) return;

        this.cleanupInterval = setInterval(() => {
            this.cleanup();
        }, 60 * 1000);
    }

    /**
     * Para limpeza periódica
     */
    stopCleanup() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    /**
     * Obtém número de itens no cache
     * @returns {number}
     */
    get size() {
        return this.cache.size;
    }

    /**
     * Lista todas as chaves do cache
     * @returns {string[]}
     */
    keys() {
        return Array.from(this.cache.keys());
    }

    /**
     * Obtém ou define valor (get-or-set pattern)
     * @param {string} key - Chave do cache
     * @param {Function} factory - Função que retorna o valor se não existir
     * @param {number} [duration] - Duração em ms
     * @returns {Promise<any>}
     */
    async getOrSet(key, factory, duration = DEFAULT_DURATION) {
        const cached = this.get(key);
        if (cached !== null) {
            return cached;
        }

        const value = await factory();
        this.set(key, value, duration);
        return value;
    }
}

// ============================================================
// CACHE COM PERSISTÊNCIA (localStorage)
// ============================================================

/**
 * Gerenciador de cache com persistência em localStorage
 */
class PersistentCacheManager extends CacheManager {
    /**
     * @param {string} [namespace='app'] - Prefixo para chaves no localStorage
     */
    constructor(namespace = 'app') {
        super();
        this.namespace = namespace;
        this.loadFromStorage();
    }

    /**
     * Gera chave para localStorage
     * @param {string} key
     * @returns {string}
     */
    storageKey(key) {
        return `${STORAGE_PREFIX}${this.namespace}:${key}`;
    }

    /**
     * Armazena valor com persistência
     * @param {string} key
     * @param {any} value
     * @param {number} [duration]
     * @param {boolean} [persist=false] - Se deve persistir no localStorage
     */
    set(key, value, duration = DEFAULT_DURATION, persist = false) {
        super.set(key, value, duration);

        if (persist) {
            try {
                const expiry = Date.now() + duration;
                localStorage.setItem(
                    this.storageKey(key),
                    JSON.stringify({ value, expiry })
                );
            } catch (e) {
                console.warn('Erro ao persistir cache:', e);
            }
        }
    }

    /**
     * Obtém valor, verificando também localStorage
     * @param {string} key
     * @returns {any|null}
     */
    get(key) {
        // Primeiro verificar memória
        const memValue = super.get(key);
        if (memValue !== null) {
            return memValue;
        }

        // Verificar localStorage
        try {
            const stored = localStorage.getItem(this.storageKey(key));
            if (stored) {
                const { value, expiry } = JSON.parse(stored);
                if (Date.now() <= expiry) {
                    // Restaurar para memória
                    this.cache.set(key, { value, expiry });
                    return value;
                }
                // Expirado - remover
                localStorage.removeItem(this.storageKey(key));
            }
        } catch (e) {
            console.warn('Erro ao ler cache persistido:', e);
        }

        return null;
    }

    /**
     * Remove item do cache e localStorage
     * @param {string} key
     * @returns {boolean}
     */
    delete(key) {
        try {
            localStorage.removeItem(this.storageKey(key));
        } catch (e) {
            // Ignorar
        }
        return super.delete(key);
    }

    /**
     * Limpa cache de memória e localStorage
     */
    clear() {
        super.clear();

        try {
            const prefix = `${STORAGE_PREFIX}${this.namespace}:`;
            const keysToRemove = [];

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(prefix)) {
                    keysToRemove.push(key);
                }
            }

            keysToRemove.forEach((key) => localStorage.removeItem(key));
        } catch (e) {
            console.warn('Erro ao limpar cache persistido:', e);
        }
    }

    /**
     * Carrega itens não expirados do localStorage
     */
    loadFromStorage() {
        try {
            const prefix = `${STORAGE_PREFIX}${this.namespace}:`;
            const now = Date.now();

            for (let i = 0; i < localStorage.length; i++) {
                const storageKey = localStorage.key(i);
                if (storageKey && storageKey.startsWith(prefix)) {
                    const key = storageKey.replace(prefix, '');
                    const stored = localStorage.getItem(storageKey);

                    if (stored) {
                        const { value, expiry } = JSON.parse(stored);
                        if (now <= expiry) {
                            this.cache.set(key, { value, expiry });
                        } else {
                            localStorage.removeItem(storageKey);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('Erro ao carregar cache do storage:', e);
        }
    }
}

// ============================================================
// INSTÂNCIA GLOBAL
// ============================================================

/** Instância global do cache manager */
export const cacheManager = new CacheManager();

/** Cache com persistência para dados do usuário */
export const persistentCache = new PersistentCacheManager('plataforma');

// ============================================================
// EXPORTS
// ============================================================

export { CacheManager, PersistentCacheManager };
