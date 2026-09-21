'use strict';

const fs = require('fs');
const { pipeline } = require('stream/promises');
const storage = require('./private-storage.service');

async function sendPrivatePdf(res, root, name, namespace, disposition) {
    let handle;
    try {
        const { file, stat } = await storage.safeFile(root, name);
        handle = await fs.promises.open(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        const opened = await handle.stat();
        if (opened.ino !== stat.ino || opened.dev !== stat.dev) throw Object.assign(new Error('Storage mudou.'), { code: 'STORAGE_CHANGED' });
        res.set('Content-Type', 'application/pdf');
        res.set('Content-Disposition', disposition);
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Cache-Control', 'private, no-store');
        res.set('Content-Length', String(opened.size));
        await pipeline(handle.createReadStream({ autoClose: false }), res);
    } catch (error) {
        storage.event(error.code === 'ENOENT' ? 'missing_detected' : 'download_unavailable', namespace, name, error);
        if (res.headersSent || res.destroyed) { if (!res.destroyed) res.destroy(); }
        else {
            res.removeHeader('Content-Length');
            res.removeHeader('Content-Disposition');
            res.status(503).json({ code: 'ARQUIVO_INDISPONIVEL', mensagem: 'O arquivo está temporariamente indisponível. Contate a administração.' });
        }
    } finally { if (handle) await handle.close(); }
}

module.exports = { sendPrivatePdf };
