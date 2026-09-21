'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SESSION_COOKIE_NAME = 'plataforma_session';
const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;

function sessionTtlSeconds(env = process.env) {
    const value = Number(env.SESSION_TTL_SECONDS || DEFAULT_SESSION_TTL_SECONDS);
    return Number.isInteger(value) && value >= 300 && value <= 7 * 24 * 60 * 60
        ? value
        : DEFAULT_SESSION_TTL_SECONDS;
}

function cookieOptions(env = process.env) {
    return {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: sessionTtlSeconds(env) * 1000
    };
}

function parseCookies(header = '') {
    return String(header)
        .split(';')
        .map((item) => item.trim())
        .filter(Boolean)
        .reduce((cookies, item) => {
            const separator = item.indexOf('=');
            if (separator < 1) return cookies;
            const name = item.slice(0, separator).trim();
            const value = item.slice(separator + 1).trim();
            try {
                cookies[name] = decodeURIComponent(value);
            } catch {
                cookies[name] = value;
            }
            return cookies;
        }, {});
}

function getSessionCookie(req) {
    return parseCookies(req.headers?.cookie)[SESSION_COOKIE_NAME] || null;
}

function createCsrfToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function createSessionToken(usuario, csrfToken = createCsrfToken(), env = process.env) {
    return {
        token: jwt.sign({
            id_usuario: usuario.id_usuario,
            tipo: usuario.tipo,
            csrf: csrfToken,
            sv: Number(usuario.versao_sessao || 0)
        }, env.JWT_SECRET, { expiresIn: sessionTtlSeconds(env) }),
        csrfToken
    };
}

function setSessionCookie(res, token, env = process.env) {
    res.cookie(SESSION_COOKIE_NAME, token, cookieOptions(env));
}

function clearSessionCookie(res, env = process.env) {
    const options = cookieOptions(env);
    delete options.maxAge;
    res.clearCookie(SESSION_COOKIE_NAME, options);
}

function safeEqual(left, right) {
    const leftBuffer = Buffer.from(String(left || ''));
    const rightBuffer = Buffer.from(String(right || ''));
    return leftBuffer.length > 0
        && leftBuffer.length === rightBuffer.length
        && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports = {
    SESSION_COOKIE_NAME,
    clearSessionCookie,
    cookieOptions,
    createCsrfToken,
    createSessionToken,
    getSessionCookie,
    parseCookies,
    safeEqual,
    sessionTtlSeconds,
    setSessionCookie
};
