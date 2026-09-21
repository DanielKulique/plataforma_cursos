'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const storage = require('../api/services/private-storage.service');
const pdf = Buffer.from('%PDF-final bytes');
let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'storage-fault-')); });
afterEach(() => { jest.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

it('stages fsynced private bytes then atomically publishes final hash without pending', async () => {
    const file = await storage.stage(root, pdf, 'materials');
    expect(fs.existsSync(path.join(root, file.storage_name))).toBe(false);
    expect(fs.statSync(path.join(root, file.pending)).mode & 0o777).toBe(0o600);
    await storage.publish(root, file, 'materials');
    expect(fs.readdirSync(root)).toEqual([file.storage_name]);
    expect(await storage.hashFile(root, file.storage_name)).toMatchObject({ sha256: crypto.createHash('sha256').update(pdf).digest('hex'), size: pdf.length });
});

it('temp creation failure leaves no bytes', async () => {
    jest.spyOn(fs.promises, 'open').mockRejectedValueOnce(Object.assign(new Error('disk'), { code: 'EACCES' }));
    await expect(storage.stage(root, pdf, 'materials')).rejects.toMatchObject({ code: 'EACCES' });
    expect(fs.readdirSync(root)).toEqual([]);
});

it('partial temp write failure closes and compensates', async () => {
    const open = fs.promises.open.bind(fs.promises);
    jest.spyOn(fs.promises, 'open').mockImplementationOnce(async (...args) => {
        const handle = await open(...args);
        handle.writeFile = async () => { await handle.write(Buffer.from('%PDF-partial')); throw Object.assign(new Error('disk full'), { code: 'ENOSPC' }); };
        return handle;
    });
    await expect(storage.stage(root, pdf, 'materials')).rejects.toMatchObject({ code: 'ENOSPC' });
    expect(fs.readdirSync(root)).toEqual([]);
});

it('atomic move equivalent failure cannot expose final metadata or overwrite old bytes', async () => {
    const file = await storage.stage(root, pdf, 'materials');
    jest.spyOn(fs.promises, 'link').mockRejectedValueOnce(Object.assign(new Error('rename'), { code: 'EXDEV' }));
    await expect(storage.publish(root, file, 'materials')).rejects.toMatchObject({ code: 'EXDEV' });
    expect(fs.readdirSync(root)).toEqual([file.pending]);
});

it('cleanup failure is logged and leaves a classifiable UUID residual', async () => {
    const file = await storage.stage(root, pdf, 'materials');
    await storage.publish(root, file, 'materials');
    const log = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(fs.promises, 'unlink').mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }));
    await storage.compensate(root, file.storage_name, 'materials');
    expect(fs.existsSync(path.join(root, file.storage_name))).toBe(true);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('storage.compensation_failed'));
});

it('partial atomic publication is compensable even when unlink of pending failed', async () => {
    const file = await storage.stage(root, pdf, 'materials');
    jest.spyOn(fs.promises, 'unlink').mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }));
    await expect(storage.publish(root, file, 'materials')).rejects.toThrow();
    await storage.compensate(root, file.storage_name, 'materials');
    await storage.compensate(root, file.pending, 'materials');
    expect(fs.readdirSync(root)).toEqual([]);
});

it.each(['../outside.pdf', '/etc/passwd', 'x\\outside.pdf'])('refuses unsafe path %s', async name => {
    await expect(storage.safeFile(root, name)).rejects.toMatchObject({ code: 'UNSAFE_STORAGE' });
});

it('rejects symlink and hardlink even inside managed storage', async () => {
    const outside = path.join(root, 'evidence'); fs.writeFileSync(outside, pdf);
    const name = `${crypto.randomUUID()}.pdf`;
    fs.symlinkSync(outside, path.join(root, name));
    await expect(storage.hashFile(root, name)).rejects.toMatchObject({ code: 'UNSAFE_STORAGE' });
    await storage.compensate(root, name, 'materials');
    expect(fs.readFileSync(outside)).toEqual(pdf);
});
