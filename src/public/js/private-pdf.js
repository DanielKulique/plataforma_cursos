import { authenticatedFetch } from './auth.js';

const PRIVATE_PDF_MESSAGES = Object.freeze({
    401: 'Sua sessão expirou. Faça login novamente.',
    403: 'Você não possui permissão para acessar este documento.',
    404: 'Este documento não existe.',
    503: 'Este documento está temporariamente indisponível.'
});

export class PrivatePdfError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'PrivatePdfError';
        this.status = status;
    }
}

export async function fetchPrivatePdf(url, { request = authenticatedFetch } = {}) {
    let response;
    try {
        response = await request(url);
    } catch {
        throw new PrivatePdfError('Não foi possível conectar ao servidor.', 0);
    }

    if (!response.ok) {
        throw new PrivatePdfError(
            PRIVATE_PDF_MESSAGES[response.status] || 'Não foi possível abrir este documento.',
            response.status
        );
    }

    const blob = await response.blob().catch(() => null);
    if (!blob || (blob.type && blob.type !== 'application/pdf')) {
        throw new PrivatePdfError('O servidor retornou um documento inválido.', 502);
    }
    return blob;
}

export async function transferPrivatePdf(url, options = {}) {
    const {
        download = false,
        filename = 'documento.pdf',
        request = authenticatedFetch,
        documentRef = document,
        view = window
    } = options;
    const preview = download ? null : view.open('about:blank', '_blank');
    if (preview) preview.opener = null;

    try {
        const blob = await fetchPrivatePdf(url, { request });
        const objectUrl = view.URL.createObjectURL(blob);
        if (download) {
            const link = documentRef.createElement('a');
            link.href = objectUrl;
            link.download = filename;
            link.hidden = true;
            documentRef.body.append(link);
            link.click();
            link.remove();
        } else if (preview) {
            preview.location.replace(objectUrl);
        } else {
            view.URL.revokeObjectURL(objectUrl);
            throw new PrivatePdfError('Permita a abertura de novas abas para visualizar o documento.', 0);
        }
        view.setTimeout(() => view.URL.revokeObjectURL(objectUrl), 60000);
    } catch (error) {
        preview?.close();
        throw error;
    }
}
