'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const request = require('supertest');
const { sendPrivatePdf } = require('../api/services/private-download.service');
let root, name, app;
beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'private-download-'));
    name = `${crypto.randomUUID()}.pdf`;
    app = express();
    app.get('/pdf', (_req, res) => sendPrivatePdf(res, root, name, 'materials', 'inline; filename="fixture.pdf"'));
});
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });
it('streams private bytes without a hash scan', async () => {
    fs.writeFileSync(path.join(root, name), '%PDF-valid');
    const response = await request(app).get('/pdf');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body.toString()).toBe('%PDF-valid');
});
it('missing bytes return controlled 503 with no filesystem details', async () => {
    const response = await request(app).get('/pdf');
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('ARQUIVO_INDISPONIVEL');
    expect(JSON.stringify(response.body)).not.toMatch(/ENOENT|\/tmp|stack/);
});
it('symlink cannot expose an external file', async () => {
    const outside = path.join(root, 'outside'); fs.writeFileSync(outside, 'private secret');
    fs.symlinkSync(outside, path.join(root, name));
    const response = await request(app).get('/pdf');
    expect(response.status).toBe(503);
    expect(JSON.stringify(response.body)).not.toContain('private secret');
});
