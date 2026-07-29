export const INCREMENTAL_DEBOUNCE_MS = 900;

const REFERENCES_HEADING = /^(referências|referencias|referências bibliográficas|referencias bibliograficas|bibliografia)$/i;

export function splitEditorSegments(text) {
    const value = String(text || '');
    const ranges = [];
    let cursor = 0;
    for (const match of value.matchAll(/(?:\r\n|\r|\n){2,}/g)) {
        ranges.push([cursor, match.index]);
        cursor = match.index + match[0].length;
    }
    ranges.push([cursor, value.length]);
    let referenceMode = false;
    return ranges.flatMap(([start, end]) => {
        const raw = value.slice(start, end);
        const left = raw.length - raw.trimStart().length;
        const trimmed = raw.trim();
        if (!trimmed) return [];
        const actualStart = start + left;
        const actualEnd = actualStart + trimmed.length;
        let tipo = 'PARAGRAFO';
        let analisavel = true;
        if (REFERENCES_HEADING.test(trimmed)) {
            tipo = 'TITULO';
            analisavel = false;
            referenceMode = true;
        } else if (referenceMode) {
            tipo = 'REFERENCIA';
            analisavel = false;
        }
        return [{ texto: trimmed, inicio: actualStart, fim: actualEnd, tipo, analisavel }];
    });
}

export function reconcileEditorSegments(previous, text, createId) {
    const parsed = splitEditorSegments(text);
    const before = Array.isArray(previous) ? previous : [];
    let prefix = 0;
    while (prefix < before.length && prefix < parsed.length
        && before[prefix].texto === parsed[prefix].texto) prefix += 1;
    let suffix = 0;
    while (suffix < before.length - prefix && suffix < parsed.length - prefix
        && before[before.length - 1 - suffix].texto === parsed[parsed.length - 1 - suffix].texto) suffix += 1;
    const oldMiddle = before.slice(prefix, before.length - suffix);
    const result = parsed.map((item, index) => {
        let existing = null;
        if (index < prefix) existing = before[index];
        else if (index >= parsed.length - suffix) {
            existing = before[before.length - (parsed.length - index)];
        } else {
            existing = oldMiddle[index - prefix] || null;
        }
        if (!existing) {
            return { ...item, segmento_id: createId(), indice: index, versao: 1 };
        }
        const changed = existing.texto !== item.texto
            || existing.tipo !== item.tipo
            || existing.analisavel !== item.analisavel;
        return {
            ...item,
            segmento_id: existing.segmento_id,
            indice: index,
            versao: changed ? existing.versao + 1 : existing.versao
        };
    });
    return result;
}

export function segmentAtCursor(segments, cursor) {
    if (!segments.length) return null;
    return segments.find((segment) => cursor >= segment.inicio && cursor <= segment.fim)
        || segments.find((segment) => cursor < segment.inicio)
        || segments.at(-1);
}

export function currentReferences(segments) {
    const references = segments
        .filter((segment) => segment.tipo === 'REFERENCIA')
        .map((segment) => segment.texto);
    return segments.some((segment) => segment.tipo === 'TITULO') ? references : null;
}

export function responseMatchesSegment(response, sessionId, segment) {
    return Boolean(
        response
        && response.sessao_id === sessionId
        && response.segmento_id === segment?.segmento_id
        && response.versao === segment?.versao
    );
}

export function createIncrementalCoordinator({
    sessionId,
    send,
    getCurrentSegment,
    onState,
    onResult,
    onDiscard = () => {},
    delay = INCREMENTAL_DEBOUNCE_MS,
    setTimer = setTimeout,
    clearTimer = clearTimeout
}) {
    const pending = new Map();

    function cancel(segmentId) {
        const item = pending.get(segmentId);
        if (!item) return;
        if (item.timer) clearTimer(item.timer);
        item.controller?.abort();
        pending.delete(segmentId);
    }

    function schedule(segment, buildPayload) {
        cancel(segment.segmento_id);
        onState(segment, 'PENDENTE');
        const item = { timer: null, controller: null };
        item.timer = setTimer(async () => {
            item.timer = null;
            item.controller = new AbortController();
            onState(segment, 'ANALISANDO');
            try {
                const envelope = await send(buildPayload(), item.controller.signal);
                const current = getCurrentSegment(segment.segmento_id);
                if (!responseMatchesSegment(envelope?.data, sessionId, current)) {
                    onDiscard(segment, envelope?.data);
                    return;
                }
                onResult(current, envelope.data);
            } catch (error) {
                if (error?.status !== 499 && !item.controller.signal.aborted) {
                    onState(segment, 'ERRO', error);
                }
            } finally {
                if (pending.get(segment.segmento_id) === item) pending.delete(segment.segmento_id);
            }
        }, delay);
        pending.set(segment.segmento_id, item);
    }

    function retain(segmentIds) {
        const valid = new Set(segmentIds);
        [...pending.keys()].forEach((id) => {
            if (!valid.has(id)) cancel(id);
        });
    }

    function cancelAll() {
        [...pending.keys()].forEach(cancel);
    }

    return { schedule, cancel, retain, cancelAll, pending };
}
