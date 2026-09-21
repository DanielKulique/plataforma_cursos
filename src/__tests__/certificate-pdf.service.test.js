'use strict';

const crypto = require('crypto');
const QRCode = require('qrcode');
const { PDFDocument } = require('pdf-lib');
const {
    PAGE_SIZE,
    calcularXCentralizado,
    criarUrlValidacao,
    formatarCpf,
    gerarCertificadoPdf,
    limitarConteudos,
    prepararConteudoCertificado
} = require('../api/services/certificate-pdf.service');

const snapshot = {
    codigo_publico: 'CERT-12345678-90ABCDEF-12345678-90ABCDEF',
    aluno_nome: 'João da Silva',
    aluno_cpf: '12345678901',
    curso_nome: 'Integridade Acadêmica',
    turma_nome: 'Turma encerrada 2026/1',
    carga_horaria: 40,
    emitido_em: new Date('2026-09-04T12:00:00.000Z'),
    data_certificado: new Date('2026-06-30T12:00:00.000Z'),
    responsavel_nome: 'Maria Responsável',
    conteudos_abordados: ['Introdução à integridade acadêmica', 'Citação e referências']
};

const env = {
    APP_NAME: 'Plágio — Não Copie Essa Ideia 4.0',
    APP_BASE_URL: 'https://certificados.example.test',
    CERTIFICATE_INSTITUTION_NAME: 'Universidade Tecnológica Federal do Paraná',
    CERTIFICATE_CAMPUS: 'Campus Ponta Grossa',
    CERTIFICATE_RESPONSIBLE_ROLE: 'Responsável acadêmico'
};

describe('geração do PDF institucional de certificado', () => {
    it('centraliza o brasão pela largura real da página e aceita ajuste óptico explícito', () => {
        expect(calcularXCentralizado(PAGE_SIZE[0], 80)).toBe(680);
        expect(calcularXCentralizado(PAGE_SIZE[0], 80, 1.5)).toBe(681.5);
    });

    it('gera duas páginas 16:9 e adiciona QR para a rota pública sem dados pessoais', async () => {
        const qrSpy = jest.spyOn(QRCode, 'toBuffer');
        const pdfBuffer = await gerarCertificadoPdf(snapshot, env);
        const document = await PDFDocument.load(pdfBuffer);

        expect(pdfBuffer.subarray(0, 5).toString()).toBe('%PDF-');
        expect(document.getPageCount()).toBe(2);
        document.getPages().forEach((page) => {
            expect(page.getWidth()).toBe(PAGE_SIZE[0]);
            expect(page.getHeight()).toBe(PAGE_SIZE[1]);
        });
        expect(document.getTitle()).toBe(`Certificado ${snapshot.codigo_publico}`);
        expect(qrSpy).toHaveBeenCalledWith(
            `https://certificados.example.test/certificados/validar/${snapshot.codigo_publico}`,
            expect.objectContaining({ type: 'png', errorCorrectionLevel: 'M' })
        );
        const qrPayload = qrSpy.mock.calls[0][0];
        expect(qrPayload).not.toContain(snapshot.aluno_nome);
        expect(qrPayload).not.toContain(snapshot.aluno_cpf);
        expect(qrPayload).not.toContain('cpf');
        qrSpy.mockRestore();
    });

    it('mapeia todos os campos dinâmicos sem manter dados demonstrativos do PPTX', () => {
        const values = prepararConteudoCertificado(snapshot, env);

        expect(values).toMatchObject({
            nomeAluno: 'João da Silva',
            cpf: '123.456.789-01',
            curso: 'Integridade Acadêmica',
            turma: 'Turma encerrada 2026/1',
            cargaHoraria: '40 horas',
            data: '30 de junho de 2026',
            ano: '2026',
            responsavel: 'Maria Responsável',
            conteudos: ['Introdução à integridade acadêmica', 'Citação e referências'],
            codigoValidacao: snapshot.codigo_publico
        });
        expect(JSON.stringify(values)).not.toMatch(/Daniel da Silva|João Paulo Aires|2024|6 horas|3\.0/);
    });

    it('suporta campos longos e limita listas extensas de forma previsível', async () => {
        const longSnapshot = {
            ...snapshot,
            aluno_nome: 'Ana Carolina de Albuquerque Montenegro dos Santos e Silva',
            curso_nome: 'Formação Avançada em Integridade Acadêmica, Autoria Responsável e Metodologias de Pesquisa Científica',
            turma_nome: 'Turma especial interdisciplinar de extensão universitária 2026/segundo semestre',
            conteudos_abordados: Array.from({ length: 24 }, (_, index) =>
                `Módulo ${index + 1}: fundamentos acadêmicos e práticas responsáveis`)
        };
        const buffer = await gerarCertificadoPdf(longSnapshot, env);
        const document = await PDFDocument.load(buffer);

        expect(document.getPageCount()).toBe(2);
        expect(limitarConteudos(longSnapshot.conteudos_abordados)).toHaveLength(12);
        expect(limitarConteudos(longSnapshot.conteudos_abordados).at(-1)).toBe(
            'Mais 13 módulos publicados na turma'
        );
    });

    it('produz bytes finais para hash SHA-256 calculado depois do QR e das duas páginas', async () => {
        const pdfBuffer = await gerarCertificadoPdf(snapshot, env);
        const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

        expect(hash).toMatch(/^[0-9a-f]{64}$/);
        expect(pdfBuffer.length).toBeGreaterThan(50_000);
    });

    it('formata CPF somente no documento individual', () => {
        expect(formatarCpf('12345678901')).toBe('123.456.789-01');
        expect(formatarCpf('inválido')).toBe('Não informado');
    });

    it('monta URL a partir do domínio configurado e somente do código público', () => {
        const url = criarUrlValidacao(snapshot.codigo_publico, {
            APP_BASE_URL: 'https://example.test/subdiretorio'
        });
        expect(url).toBe(`https://example.test/certificados/validar/${snapshot.codigo_publico}`);
    });
});
