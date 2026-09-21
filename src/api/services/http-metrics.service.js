'use strict';

const state = {
    startedAt: Date.now(),
    total: 0,
    inFlight: 0,
    responses: { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 },
    duration: { count: 0, totalMs: 0, maxMs: 0 },
    slowRequests: 0
};

function requestStarted() {
    state.total += 1;
    state.inFlight += 1;
}

function requestFinished(status, durationMs, slow) {
    state.inFlight = Math.max(0, state.inFlight - 1);
    const group = status >= 200 && status <= 599 ? `${Math.floor(status / 100)}xx` : 'other';
    state.responses[group] = (state.responses[group] || 0) + 1;
    state.duration.count += 1;
    state.duration.totalMs += durationMs;
    state.duration.maxMs = Math.max(state.duration.maxMs, durationMs);
    if (slow) state.slowRequests += 1;
}

function snapshot() {
    return {
        startedAt: new Date(state.startedAt).toISOString(),
        totalRequests: state.total,
        inFlight: state.inFlight,
        responses: { ...state.responses },
        durationMs: {
            count: state.duration.count,
            average: state.duration.count ? Number((state.duration.totalMs / state.duration.count).toFixed(3)) : 0,
            max: Number(state.duration.maxMs.toFixed(3))
        },
        slowRequests: state.slowRequests
    };
}

function resetForTests() {
    state.startedAt = Date.now();
    state.total = 0;
    state.inFlight = 0;
    Object.assign(state.responses, { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0, other: 0 });
    Object.assign(state.duration, { count: 0, totalMs: 0, maxMs: 0 });
    state.slowRequests = 0;
}

module.exports = { requestFinished, requestStarted, resetForTests, snapshot };
