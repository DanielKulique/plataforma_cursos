(function initializeSecurityUtils(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.SecurityUtils = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function createSecurityUtils() {
    'use strict';

    const ALLOWED_EXTERNAL_ORIGINS = Object.freeze([
        'https://www.youtube.com',
        'https://www.youtube-nocookie.com'
    ]);

    const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

    function youtubeVideoId(value) {
        try {
            const parsed = new URL(String(value || '').trim());
            if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
            const hostname = parsed.hostname.toLowerCase();
            const parts = parsed.pathname.split('/').filter(Boolean);
            let id = null;
            if (hostname === 'youtu.be') id = parts.length === 1 ? parts[0] : null;
            else if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(hostname)) {
                if (parsed.pathname === '/watch') id = parsed.searchParams.get('v');
                else if (parts.length === 2 && ['shorts', 'embed'].includes(parts[0])) id = parts[1];
            } else if (['youtube-nocookie.com', 'www.youtube-nocookie.com'].includes(hostname)) {
                if (parts.length === 2 && parts[0] === 'embed') id = parts[1];
            }
            return YOUTUBE_VIDEO_ID.test(String(id || '')) ? id : null;
        } catch (_) {
            return null;
        }
    }

    function normalizeYouTubeEmbedUrl(value) {
        const id = youtubeVideoId(value);
        return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
    }

    function youtubeWatchUrl(value) {
        const id = youtubeVideoId(value);
        return id ? `https://www.youtube.com/watch?v=${id}` : null;
    }

    function toSafeUrl(value, {
        baseUrl = 'http://localhost',
        allowedOrigins = ALLOWED_EXTERNAL_ORIGINS
    } = {}) {
        const raw = String(value || '').trim();
        if (!raw) return null;

        try {
            const base = new URL(baseUrl);
            const parsed = new URL(raw, base);
            if (parsed.username || parsed.password) return null;
            const sameOrigin = parsed.origin === base.origin;
            const allowedExternal = parsed.protocol === 'https:' && allowedOrigins.includes(parsed.origin);
            if (!sameOrigin && !allowedExternal) return null;
            if (!['http:', 'https:'].includes(parsed.protocol)) return null;
            return parsed.href;
        } catch (_) {
            return null;
        }
    }

    function buildHighlightSegments(text, detections = []) {
        const source = String(text || '');
        const intervals = [];

        detections.forEach((detection) => {
            const needle = String(detection?.txt || '');
            if (!needle) return;
            const lowerSource = source.toLocaleLowerCase('pt-BR');
            const lowerNeedle = needle.toLocaleLowerCase('pt-BR');
            let fromIndex = 0;
            while (fromIndex < source.length) {
                const start = lowerSource.indexOf(lowerNeedle, fromIndex);
                if (start < 0) break;
                intervals.push({
                    start,
                    end: start + needle.length,
                    id: String(detection.id ?? ''),
                    level: detection.lvl === 'red' ? 'red' : 'amber'
                });
                fromIndex = start + Math.max(needle.length, 1);
            }
        });

        intervals.sort((a, b) => a.start - b.start || b.end - a.end);
        const selected = [];
        let occupiedUntil = 0;
        intervals.forEach((interval) => {
            if (interval.start < occupiedUntil) return;
            selected.push(interval);
            occupiedUntil = interval.end;
        });

        const segments = [];
        let cursor = 0;
        selected.forEach((interval) => {
            if (interval.start > cursor) segments.push({ text: source.slice(cursor, interval.start) });
            segments.push({
                text: source.slice(interval.start, interval.end),
                id: interval.id,
                level: interval.level,
                highlighted: true
            });
            cursor = interval.end;
        });
        if (cursor < source.length || source.length === 0) segments.push({ text: source.slice(cursor) });
        return segments;
    }

    function appendTextWithBreaks(parent, text, documentRef) {
        String(text).split('\n').forEach((part, index) => {
            if (index > 0) parent.append(documentRef.createElement('br'));
            parent.append(documentRef.createTextNode(part));
        });
    }

    function renderHighlightedText(container, text, detections = [], documentRef = document) {
        container.replaceChildren();
        buildHighlightSegments(text, detections).forEach((segment) => {
            if (!segment.highlighted) {
                appendTextWithBreaks(container, segment.text, documentRef);
                return;
            }
            const mark = documentRef.createElement('mark');
            mark.className = segment.level === 'red' ? 'hl-red' : 'hl-amber';
            mark.dataset.id = segment.id;
            mark.tabIndex = 0;
            mark.setAttribute('role', 'button');
            mark.setAttribute('aria-label', `Trecho destacado: ${segment.text.slice(0, 40)}`);
            appendTextWithBreaks(mark, segment.text, documentRef);
            container.append(mark);
        });
    }

    return {
        ALLOWED_EXTERNAL_ORIGINS,
        buildHighlightSegments,
        normalizeYouTubeEmbedUrl,
        renderHighlightedText,
        toSafeUrl,
        youtubeWatchUrl
    };
}));
