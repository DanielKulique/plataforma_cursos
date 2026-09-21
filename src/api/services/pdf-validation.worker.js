'use strict';

const { parentPort, workerData } = require('worker_threads');
const { PDFDocument } = require('pdf-lib');

(async () => {
    try {
        const document = await PDFDocument.load(workerData, {
            ignoreEncryption: true,
            throwOnInvalidObject: true,
            updateMetadata: false
        });
        if (document.isEncrypted) {
            parentPort.postMessage({ ok: false, encrypted: true });
            return;
        }
        const pages = document.getPages();
        if (pages.length === 0) throw new Error('PDF sem páginas.');
        parentPort.postMessage({ ok: true, pages: pages.length });
    } catch (error) {
        parentPort.postMessage({
            ok: false,
            encrypted: false
        });
    }
})();
