'use strict';

const mockConnection = {
    query: jest.fn(),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    release: jest.fn()
};

jest.mock('../config/database', () => ({
    getConnection: jest.fn(async () => mockConnection),
    query: jest.fn()
}));
jest.mock('../api/models/certificados.models', () => ({
    buscarContextoEmissao: jest.fn(),
    buscarPorAlunoTurma: jest.fn(),
    inserir: jest.fn(),
    buscarPorId: jest.fn(),
    listarDoAluno: jest.fn(),
    buscarParaDownload: jest.fn(),
    buscarPorCodigo: jest.fn(),
    buscarPorHash: jest.fn(),
    listarConteudosAbordados: jest.fn(),
    revogar: jest.fn()
}));
jest.mock('../api/services/certificate-pdf.service', () => ({
    prepararDocumentoCertificado: jest.fn(),
    gerarCertificadoPdf: jest.fn()
}));
jest.mock('../api/services/certificate-storage.service', () => ({
    calcularSha256: jest.fn(),
    persistirPdfFinal: jest.fn(),
    removerArquivo: jest.fn(),
    resolverCaminhoCertificado: jest.fn()
}));

const model = require('../api/models/certificados.models');
const pdfService = require('../api/services/certificate-pdf.service');
const storage = require('../api/services/certificate-storage.service');
const service = require('../api/services/certificate.service');

const contexto = {
    id_matricula: 21,
    id_aluno: 3,
    id_turma: 8,
    status_aprovacao: 'APROVADO',
    aluno_nome: 'Aluno Teste',
    aluno_cpf: '12345678901',
    nome_curso: 'Curso Teste',
    nome_turma: 'Turma Teste',
    carga_horaria: 40,
    id_professor: 2,
    responsavel_nome: 'Professor Responsável',
    data_fim: new Date('2026-06-30T12:00:00Z'),
    status_turma: 'ENCERRADA'
};
const registro = {
    id_certificado: 31,
    id_aluno: 3,
    id_turma: 8,
    codigo_publico: 'CERT-12345678-90ABCDEF-12345678-90ABCDEF',
    aluno_nome: 'Aluno Teste',
    curso_nome: 'Curso Teste',
    turma_nome: 'Turma Teste',
    carga_horaria: 40,
    emitido_em: new Date('2026-09-04T12:00:00Z'),
    status: 'ATIVO',
    revogado_em: null,
    storage_name: '123e4567-e89b-42d3-a456-426614174000.pdf',
    sha256: 'a'.repeat(64)
};

function usuario(tipo, id_usuario) {
    return { tipo, id_usuario };
}

describe('regras do serviço de certificados', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockConnection.query.mockResolvedValue([[{ total: 1, concluidos: 1, prova_final_aprovada: 1 }]]);
        mockConnection.beginTransaction.mockResolvedValue();
        mockConnection.commit.mockResolvedValue();
        mockConnection.rollback.mockResolvedValue();
        model.buscarContextoEmissao.mockResolvedValue(contexto);
        model.buscarPorAlunoTurma.mockResolvedValue(null);
        model.listarConteudosAbordados.mockResolvedValue(['Módulo introdutório']);
        model.inserir.mockResolvedValue(31);
        model.buscarPorId.mockResolvedValue(registro);
        pdfService.gerarCertificadoPdf.mockResolvedValue(Buffer.from('%PDF-final'));
        storage.persistirPdfFinal.mockResolvedValue({
            storage_name: registro.storage_name,
            sha256: registro.sha256,
            tamanho_bytes: 10
        });
        storage.removerArquivo.mockResolvedValue();
    });

    it.each([[0, 0], [22, 18], [22, 20]])('emite com progresso %i/%i se o Teste Final está aprovado', async (total, concluidos) => {
        mockConnection.query
            .mockResolvedValueOnce([[{ total, concluidos }]])
            .mockResolvedValueOnce([[
                { status_aprovacao: 'APROVADO', ciclo_atual: 1, total_exercicios: 1, exercicios_realizados: 0,
                    prova_final_aprovada: 1, prova_final_tentada: 1, prova_final_percentual: 100, prova_final_id_tentativa: 9 }
            ]])
            .mockResolvedValueOnce([[]]);
        const resultado = await service.emitirCertificado(21, usuario('ADMIN', 1));
        expect(resultado.certificado.status).toBe('ATIVO');
        expect(model.inserir).toHaveBeenCalled();
    });

    it.each([
        ['ADMIN', 1],
        ['PROFESSOR', 2]
    ])('%s emite para matrícula aprovada, inclusive em turma encerrada', async (tipo, id) => {
        const resultado = await service.emitirCertificado(21, usuario(tipo, id));

        expect(resultado.reutilizado).toBe(false);
        expect(resultado.certificado).toMatchObject({ id_certificado: 31, status: 'ATIVO' });
        expect(pdfService.gerarCertificadoPdf).toHaveBeenCalledWith(expect.objectContaining({
            id_aluno: 3,
            id_turma: 8,
            aluno_cpf: '12345678901',
            responsavel_nome: 'Professor Responsável',
            conteudos_abordados: ['Módulo introdutório'],
            codigo_publico: expect.stringMatching(service.CODIGO_PUBLICO_PATTERN)
        }), process.env, undefined);
        expect(storage.persistirPdfFinal).toHaveBeenCalledWith(Buffer.from('%PDF-final'), mockConnection);
        expect(model.inserir).toHaveBeenCalledWith(mockConnection, expect.objectContaining({
            sha256: registro.sha256,
            storage_name: registro.storage_name
        }));
        expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['professor de outra turma', usuario('PROFESSOR', 99)],
        ['aluno', usuario('ALUNO', 3)]
    ])('impede emissão por %s', async (_label, actor) => {
        await expect(service.emitirCertificado(21, actor)).rejects.toMatchObject({
            code: 'EMISSAO_NAO_AUTORIZADA',
            status: 403
        });
        expect(pdfService.gerarCertificadoPdf).not.toHaveBeenCalled();
        expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    });

    it('impede emissão antes da aprovação acadêmica', async () => {
        model.buscarContextoEmissao.mockResolvedValue({ ...contexto, status_aprovacao: 'CURSANDO' });
        await expect(service.emitirCertificado(21, usuario('ADMIN', 1))).rejects.toMatchObject({
            code: 'ALUNO_NAO_APROVADO',
            status: 409
        });
        expect(pdfService.gerarCertificadoPdf).not.toHaveBeenCalled();
    });

    it('retorna o certificado existente sem gerar ou sobrescrever outro PDF', async () => {
        model.buscarPorAlunoTurma.mockResolvedValue(registro);
        const resultado = await service.emitirCertificado(21, usuario('ADMIN', 1));

        expect(resultado).toMatchObject({ reutilizado: true, certificado: { id_certificado: 31 } });
        expect(pdfService.gerarCertificadoPdf).not.toHaveBeenCalled();
        expect(storage.persistirPdfFinal).not.toHaveBeenCalled();
        expect(model.inserir).not.toHaveBeenCalled();
    });

    it('remove arquivo por compensação quando o INSERT falha', async () => {
        model.inserir.mockRejectedValue(Object.assign(new Error('falha do banco'), { code: 'ER_LOCK_DEADLOCK' }));
        await expect(service.emitirCertificado(21, usuario('ADMIN', 1))).rejects.toThrow('falha do banco');

        expect(storage.removerArquivo).toHaveBeenCalledWith(registro.storage_name);
        expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
        expect(mockConnection.commit).not.toHaveBeenCalled();
    });

    it('não cria registro nem arquivo quando a geração do PDF falha', async () => {
        pdfService.gerarCertificadoPdf.mockRejectedValue(new Error('template inválido'));
        await expect(service.emitirCertificado(21, usuario('ADMIN', 1))).rejects.toThrow('template inválido');

        expect(storage.persistirPdfFinal).not.toHaveBeenCalled();
        expect(model.inserir).not.toHaveBeenCalled();
        expect(storage.removerArquivo).not.toHaveBeenCalled();
        expect(mockConnection.rollback).toHaveBeenCalledTimes(1);
    });

    it('a emissão automática usa o responsável como emissor e é segura para retry', async () => {
        require('../config/database').query.mockResolvedValueOnce([[{ id_matricula: 21, id_professor: 2 }]]);
        const first = await service.emitirCertificadoAutomaticamente(3, 8);
        expect(first).toMatchObject({ status: 'ATIVO', reutilizado: false });
        expect(model.buscarPorAlunoTurma).toHaveBeenCalledWith(mockConnection, 3, 8, true);

        model.buscarPorAlunoTurma.mockResolvedValue(registro);
        require('../config/database').query.mockResolvedValueOnce([[{ id_matricula: 21, id_professor: 2 }]]);
        const second = await service.emitirCertificadoAutomaticamente(3, 8);
        expect(second).toMatchObject({ status: 'ATIVO', reutilizado: true });
        expect(model.inserir).toHaveBeenCalledTimes(1);
    });

    it('gera códigos públicos criptográficos com 128 bits e formato não enumerável', () => {
        const codigos = new Set(Array.from({ length: 100 }, () => service.gerarCodigoPublico()));
        expect(codigos.size).toBe(100);
        codigos.forEach((codigo) => expect(codigo).toMatch(service.CODIGO_PUBLICO_PATTERN));
    });

    it('lista somente certificados do próprio aluno e rejeita outros papéis', async () => {
        model.listarDoAluno.mockResolvedValue([registro]);
        await expect(service.listarMeusCertificados(usuario('ALUNO', 3)))
            .resolves.toEqual([expect.objectContaining({ id_certificado: 31 })]);
        expect(model.listarDoAluno).toHaveBeenCalledWith(3);
        await expect(service.listarMeusCertificados(usuario('PROFESSOR', 2)))
            .rejects.toMatchObject({ status: 403 });
    });

    it.each([
        ['ADMIN', 1],
        ['ALUNO', 3],
        ['PROFESSOR', 2]
    ])('autoriza download coerente para %s', async (tipo, id) => {
        model.buscarParaDownload.mockResolvedValue({ ...registro, id_professor: 2 });
        storage.resolverCaminhoCertificado.mockReturnValue('/privado/certificado.pdf');
        await expect(service.obterDownload(31, usuario(tipo, id))).resolves.toMatchObject({
            caminho: '/privado/certificado.pdf'
        });
    });

    it('nega acesso ao PDF de outro aluno e professor alheio', async () => {
        model.buscarParaDownload.mockResolvedValue({ ...registro, id_professor: 2 });
        await expect(service.obterDownload(31, usuario('ALUNO', 77))).rejects.toMatchObject({ status: 403 });
        await expect(service.obterDownload(31, usuario('PROFESSOR', 77))).rejects.toMatchObject({ status: 403 });
        expect(storage.resolverCaminhoCertificado).not.toHaveBeenCalled();
    });

    it('valida código ativo, informa revogação e não expõe campos privados', async () => {
        model.buscarPorCodigo
            .mockResolvedValueOnce(registro)
            .mockResolvedValueOnce({ ...registro, status: 'REVOGADO' });
        const ativo = await service.validarPorCodigo(registro.codigo_publico.toLowerCase());
        const revogado = await service.validarPorCodigo(registro.codigo_publico);

        expect(ativo.resultado).toBe('VALIDO');
        expect(revogado.resultado).toBe('REVOGADO');
        expect(ativo.certificado).toEqual({
            codigo: registro.codigo_publico,
            aluno: registro.aluno_nome,
            curso: registro.curso_nome,
            turma: registro.turma_nome,
            carga_horaria: 40,
            emitido_em: registro.emitido_em
        });
        expect(ativo.certificado).not.toHaveProperty('sha256');
        expect(ativo.certificado).not.toHaveProperty('id_aluno');
        expect(ativo.certificado).not.toHaveProperty('storage_name');
    });

    it('não consulta o banco para código malformado ou inexistente', async () => {
        await expect(service.validarPorCodigo('CERT-000001')).resolves.toEqual({ resultado: 'NAO_ENCONTRADO' });
        expect(model.buscarPorCodigo).not.toHaveBeenCalled();
        model.buscarPorCodigo.mockResolvedValue(null);
        await expect(service.validarPorCodigo(registro.codigo_publico))
            .resolves.toEqual({ resultado: 'NAO_ENCONTRADO' });
    });

    it('calcula o hash do upload no backend e diferencia original, alterado e revogado', async () => {
        const original = Buffer.from('%PDF-original');
        const alterado = Buffer.from('%PDF-original alterado');
        storage.calcularSha256.mockImplementation((buffer) => buffer === original ? 'hash-original' : 'hash-alterado');
        model.buscarPorHash
            .mockResolvedValueOnce(registro)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ ...registro, status: 'REVOGADO' });

        await expect(service.validarArquivo(original)).resolves.toMatchObject({ resultado: 'AUTENTICO' });
        await expect(service.validarArquivo(alterado)).resolves.toEqual({ resultado: 'NAO_VALIDADO' });
        await expect(service.validarArquivo(original)).resolves.toMatchObject({ resultado: 'REVOGADO' });
        expect(model.buscarPorHash).toHaveBeenNthCalledWith(1, 'hash-original');
        expect(model.buscarPorHash).toHaveBeenNthCalledWith(2, 'hash-alterado');
    });

    it('rejeita upload inválido antes de calcular hash', async () => {
        await expect(service.validarArquivo(Buffer.from('não é pdf'))).rejects.toMatchObject({
            code: 'PDF_INVALIDO',
            status: 422
        });
        expect(storage.calcularSha256).not.toHaveBeenCalled();
    });

    it('somente ADMIN revoga, registrando motivo sem apagar o PDF', async () => {
        await expect(service.revogarCertificado(31, 'Correção acadêmica', usuario('PROFESSOR', 2)))
            .rejects.toMatchObject({ code: 'REVOGACAO_NAO_AUTORIZADA', status: 403 });

        model.buscarPorId.mockResolvedValue(registro);
        model.revogar.mockResolvedValue({ ...registro, status: 'REVOGADO', revogado_em: new Date() });
        const revogado = await service.revogarCertificado(31, 'Correção acadêmica', usuario('ADMIN', 1));
        expect(revogado.status).toBe('REVOGADO');
        expect(model.revogar).toHaveBeenCalledWith(mockConnection, 31, 1, 'Correção acadêmica');
        expect(storage.removerArquivo).not.toHaveBeenCalled();
        expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    });
});

describe('versionamento administrativo', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        require('../config/database').getConnection.mockResolvedValue(mockConnection);
        mockConnection.beginTransaction.mockResolvedValue();
        mockConnection.commit.mockResolvedValue();
        mockConnection.rollback.mockResolvedValue();
        mockConnection.query.mockResolvedValue([[{ total: 1, concluidos: 1, prova_final_aprovada: 1 }]]);
        model.buscarContextoEmissao.mockResolvedValue(contexto);
        model.buscarPorAlunoTurma.mockResolvedValue({ ...registro, versao: 1 });
        model.listarConteudosAbordados.mockResolvedValue(['Módulo atual']);
        model.inserir.mockResolvedValue(32);
        model.buscarPorId.mockResolvedValue({ ...registro, id_certificado: 32, versao: 2 });
        pdfService.gerarCertificadoPdf.mockResolvedValue(Buffer.from('%PDF-nova-versao'));
        storage.persistirPdfFinal.mockResolvedValue({ storage_name: 'novo.pdf', sha256: 'b'.repeat(64), tamanho_bytes: 16 });
        storage.removerArquivo.mockResolvedValue();
        model.revogar.mockResolvedValue({ ...registro, status: 'REVOGADO' });
    });
    const corrigir = (motivo = 'Correção de nome', actor = usuario('ADMIN', 1)) =>
        service.emitirCertificado(21, actor, { id_certificado: 31, motivo });

    it.each(['ADMIN', 'PROFESSOR'])('histórico revogado bloqueia emissão normal por %s', async tipo => {
        model.buscarPorAlunoTurma.mockResolvedValue({ ...registro, status: 'REVOGADO', versao: 1 });
        await expect(service.emitirCertificado(21, usuario(tipo, tipo === 'ADMIN' ? 1 : 2)))
            .rejects.toMatchObject({ status: 409, code: 'REEMISSAO_ADMIN_NECESSARIA' });
        expect(pdfService.gerarCertificadoPdf).not.toHaveBeenCalled();
    });
    it.each(['PROFESSOR', 'ALUNO'])('nega reemissão por %s no serviço', async tipo => {
        await expect(corrigir('Correção', usuario(tipo, 2))).rejects.toMatchObject({ status: 403 });
        expect(mockConnection.beginTransaction).not.toHaveBeenCalled();
    });
    it.each(['', '  ', 'a', 'x'.repeat(501), null])('recusa motivo inválido', async motivo => {
        await expect(corrigir(motivo)).rejects.toMatchObject({ status: 400 });
    });
    it('prepara PDF antes de revogar e insere snapshot próprio e lineage', async () => {
        await corrigir();
        expect(storage.persistirPdfFinal.mock.invocationCallOrder[0]).toBeLessThan(model.revogar.mock.invocationCallOrder[0]);
        expect(model.inserir).toHaveBeenCalledWith(mockConnection, expect.objectContaining({
            versao: 2, id_certificado_anterior: 31, motivo_reemissao: 'Correção de nome',
            id_usuario_reemissor: 1, reemitido_em: expect.any(Date),
            snapshot_json: expect.objectContaining({ aluno_cpf: contexto.aluno_cpf, responsavel_nome: contexto.responsavel_nome })
        }));
    });
    it('mantém a revogação prévia quando reemite um documento já revogado', async () => {
        model.buscarPorAlunoTurma.mockResolvedValue({ ...registro, status: 'REVOGADO', versao: 1 });
        await corrigir();
        expect(model.revogar).not.toHaveBeenCalled();
        expect(model.inserir).toHaveBeenCalled();
    });
    it('rejeita alvo obsoleto sem produzir PDF', async () => {
        model.buscarPorAlunoTurma.mockResolvedValue({ ...registro, id_certificado: 32, versao: 2 });
        await expect(corrigir()).rejects.toMatchObject({ status: 409, code: 'VERSAO_JA_SUBSTITUIDA' });
        expect(pdfService.gerarCertificadoPdf).not.toHaveBeenCalled();
    });
    it.each([
        [{ total: 1, concluidos: 1, prova_final_aprovada: 0 }, 'PROVA_FINAL_PENDENTE']
    ])('revalida elegibilidade acadêmica', async (progress, code) => {
        mockConnection.query.mockResolvedValue([[progress]]);
        await expect(corrigir()).rejects.toMatchObject({ status: 409, code });
        expect(model.revogar).not.toHaveBeenCalled();
    });
    it.each(['pdf', 'storage', 'insert'])('compensa falha em %s sem remover documento anterior', async etapa => {
        const mock = etapa === 'pdf' ? pdfService.gerarCertificadoPdf : etapa === 'storage' ? storage.persistirPdfFinal : model.inserir;
        mock.mockRejectedValueOnce(new Error('Falha controlada'));
        await expect(corrigir()).rejects.toThrow('Falha controlada');
        expect(mockConnection.rollback).toHaveBeenCalled();
        expect(mockConnection.commit).not.toHaveBeenCalled();
        expect(storage.removerArquivo).not.toHaveBeenCalledWith(registro.storage_name);
        if (etapa === 'insert') expect(storage.removerArquivo).toHaveBeenCalledWith('novo.pdf');
        else expect(model.revogar).not.toHaveBeenCalled();
    });
    it('colisão do código prepara outro documento e mantém a mesma versão', async () => {
        model.inserir.mockRejectedValueOnce(Object.assign(new Error('uk_certificado_codigo_publico'), { code: 'ER_DUP_ENTRY' }));
        await corrigir();
        expect(model.inserir).toHaveBeenCalledTimes(2);
        expect(model.inserir.mock.calls.map(call => call[1].versao)).toEqual([2, 2]);
        expect(pdfService.gerarCertificadoPdf.mock.calls[0][0].codigo_publico)
            .not.toBe(pdfService.gerarCertificadoPdf.mock.calls[1][0].codigo_publico);
    });
    it('não apaga arquivo potencialmente confirmado quando a resposta do COMMIT se perde', async () => {
        mockConnection.commit.mockRejectedValueOnce(new Error('Resposta perdida'));
        await expect(corrigir()).rejects.toThrow('Resposta perdida');
        expect(storage.removerArquivo).not.toHaveBeenCalled();
    });
});
