'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { gerarCertificadoPdf } = require('../src/api/services/certificate-pdf.service');

const outputRoot = path.resolve(process.argv[2] || 'docs/screenshots/certificado-institucional');
const env = {
    APP_NAME: 'Plágio — Não Copie Essa Ideia 4.0',
    APP_BASE_URL: 'https://certificados.example.test',
    CERTIFICATE_INSTITUTION_NAME: 'Universidade Tecnológica Federal do Paraná',
    CERTIFICATE_CAMPUS: 'Campus Ponta Grossa',
    CERTIFICATE_RESPONSIBLE_ROLE: 'Responsável acadêmico'
};

const base = {
    codigo_publico: 'CERT-12345678-90ABCDEF-12345678-90ABCDEF',
    aluno_cpf: '12345678901',
    carga_horaria: 40,
    emitido_em: new Date('2026-09-04T12:00:00.000Z'),
    data_certificado: new Date('2026-06-30T12:00:00.000Z'),
    responsavel_nome: 'Maria Helena da Costa'
};

const samples = [
    {
        name: 'a-curto',
        snapshot: {
            ...base,
            aluno_nome: 'Ana Lima',
            curso_nome: 'Integridade Acadêmica',
            turma_nome: 'Turma 2026/1',
            conteudos_abordados: ['Fundamentos de autoria', 'Citação e referências', 'Prevenção ao plágio']
        }
    },
    {
        name: 'b-campos-longos',
        snapshot: {
            ...base,
            aluno_nome: 'Ana Carolina de Albuquerque Montenegro dos Santos e Silva',
            curso_nome: 'Formação Avançada em Integridade Acadêmica, Autoria Responsável e Metodologias de Pesquisa Científica',
            turma_nome: 'Turma especial interdisciplinar de extensão universitária 2026/segundo semestre',
            carga_horaria: 120,
            conteudos_abordados: [
                'Fundamentos jurídicos e acadêmicos da autoria responsável',
                'Citações, paráfrases e referências em trabalhos científicos',
                'Ferramentas de detecção e análise responsável de similaridade',
                'Boas práticas para pesquisa e publicação científica'
            ]
        }
    },
    {
        name: 'c-muitos-conteudos',
        snapshot: {
            ...base,
            aluno_nome: 'Carlos Souza',
            curso_nome: 'Formação em Pesquisa Responsável',
            turma_nome: 'Turma 2026/2',
            conteudos_abordados: Array.from({ length: 24 }, (_, index) =>
                `Módulo ${index + 1}: fundamentos acadêmicos e práticas responsáveis`)
        }
    }
];

async function main() {
    fs.mkdirSync(outputRoot, { recursive: true });
    const entries = [];
    for (const sample of samples) {
        const pdfPath = path.join(outputRoot, `${sample.name}.pdf`);
        const buffer = await gerarCertificadoPdf(sample.snapshot, env);
        fs.writeFileSync(pdfPath, buffer, { mode: 0o644 });
        const prefix = path.join(outputRoot, sample.name);
        execFileSync('pdftoppm', ['-png', '-r', '100', pdfPath, prefix], { stdio: 'inherit' });
        entries.push(sample.name);
        process.stdout.write(`GENERATED ${sample.name}\n`);
    }
    const lines = [
        '# Validação visual — certificado institucional',
        '',
        'Amostras sintéticas geradas pelo mesmo serviço utilizado em produção.',
        '',
        'Após gerar as imagens, compare-as com as páginas do PPTX canônico.',
        '',
        '| Cenário | Página 1 | Página 2 | PDF |',
        '| --- | --- | --- | --- |',
        ...entries.map((name) => `| ${name} | [abrir](${name}-1.png) | [abrir](${name}-2.png) | [baixar](${name}.pdf) |`),
        '',
        'Cenários: A) campos curtos; B) nome, curso e turma longos; C) lista extensa de conteúdos.',
        ''
    ];
    fs.writeFileSync(path.join(outputRoot, 'README.md'), lines.join('\n'), { mode: 0o644 });
}

main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
});
