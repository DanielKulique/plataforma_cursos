describe('Serviço de similaridade', () => {
    const fetchOriginal = global.fetch;

    afterEach(() => { global.fetch = fetchOriginal; jest.resetModules(); });

    it('envia o contrato esperado pelo FastAPI', async () => {
        global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'sucesso', score_similaridade: 82.5 }) });
        const service = require('../api/services/plagio.service');
        await expect(service.enviarParaAnaliseIA('original válido', 'suspeito válido')).resolves.toMatchObject({ score_similaridade: 82.5 });
        expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ texto_original: 'original válido', texto_suspeito: 'suspeito válido' });
    });

    it('rejeita entrada incompleta com 400', async () => {
        const service = require('../api/services/plagio.service');
        await expect(service.enviarParaAnaliseIA('', 'texto')).rejects.toMatchObject({ status: 400 });
    });

    it('traduz falha de rede para 503', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('offline'));
        const service = require('../api/services/plagio.service');
        await expect(service.enviarParaAnaliseIA('original', 'suspeito')).rejects.toMatchObject({ status: 503 });
    });
});
