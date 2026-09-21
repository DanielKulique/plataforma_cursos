'use strict';

const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const PAGE_SIZE = Object.freeze([1440, 810]);
const ASSET_DIR = path.resolve(__dirname, '../../assets/certificates');
const BRASAO_CABECALHO = Object.freeze({
    width: 80,
    height: 91,
    y: 626,
    ajusteOpticoX: 0
});
const COLORS = Object.freeze({
    black: rgb(0.035, 0.031, 0.035),
    gold: rgb(1, 0.741, 0),
    gray: rgb(0.24, 0.24, 0.24),
    lightGray: rgb(0.55, 0.55, 0.55),
    white: rgb(1, 1, 1)
});

function normalizarTexto(value, fallback = 'Não informado') {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text || fallback;
}

function formatarData(valor) {
    const data = valor instanceof Date ? valor : new Date(valor);
    if (Number.isNaN(data.getTime())) return 'data não informada';
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        timeZone: 'America/Sao_Paulo'
    }).format(data);
}

function formatarCpf(valor) {
    const digits = String(valor || '').replace(/\D/g, '');
    if (digits.length !== 11) return 'Não informado';
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

function quebrarPalavra(word, font, size, maxWidth) {
    const parts = [];
    let current = '';
    for (const character of word) {
        const candidate = current + character;
        if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
            parts.push(current);
            current = character;
        } else {
            current = candidate;
        }
    }
    if (current) parts.push(current);
    return parts;
}

function quebrarLinhas(text, font, size, maxWidth) {
    const paragraphs = String(text || '').split(/\r?\n/);
    const lines = [];
    paragraphs.forEach((paragraph, paragraphIndex) => {
        const words = paragraph.trim().split(/\s+/).filter(Boolean);
        let line = '';
        for (const rawWord of words) {
            const pieces = font.widthOfTextAtSize(rawWord, size) > maxWidth
                ? quebrarPalavra(rawWord, font, size, maxWidth)
                : [rawWord];
            for (const word of pieces) {
                const candidate = line ? `${line} ${word}` : word;
                if (line && font.widthOfTextAtSize(candidate, size) > maxWidth) {
                    lines.push(line);
                    line = word;
                } else {
                    line = candidate;
                }
            }
        }
        if (line) lines.push(line);
        if (paragraphIndex < paragraphs.length - 1) lines.push('');
    });
    return lines.length ? lines : [''];
}

function ajustarBloco(text, font, maxWidth, maxHeight, initialSize, minimumSize, lineHeightRatio = 1.25) {
    for (let size = initialSize; size >= minimumSize; size -= 0.5) {
        const lines = quebrarLinhas(text, font, size, maxWidth);
        const lineHeight = size * lineHeightRatio;
        if (lines.length * lineHeight <= maxHeight) return { size, lineHeight, lines };
    }
    const size = minimumSize;
    return {
        size,
        lineHeight: size * lineHeightRatio,
        lines: quebrarLinhas(text, font, size, maxWidth)
    };
}

function desenharLinhas(page, lines, options) {
    const { x, y, size, lineHeight, font, color = COLORS.black } = options;
    lines.forEach((line, index) => {
        if (!line) return;
        page.drawText(line, { x, y: y - (index * lineHeight), size, font, color });
    });
    return y - (lines.length * lineHeight);
}

function calcularXCentralizado(slideWidth, elementWidth, ajusteOpticoX = 0) {
    return ((slideWidth - elementWidth) / 2) + ajusteOpticoX;
}

function desenharCentralizado(page, text, font, size, y, color = COLORS.black, maxWidth = 900) {
    const value = normalizarTexto(text);
    let finalSize = size;
    while (finalSize > 10 && font.widthOfTextAtSize(value, finalSize) > maxWidth) finalSize -= 0.5;
    const textWidth = font.widthOfTextAtSize(value, finalSize);
    page.drawText(value, {
        x: calcularXCentralizado(page.getWidth(), textWidth),
        y,
        size: finalSize,
        font,
        color
    });
}

function desenharCentralizadoNaArea(page, text, font, size, y, x, width, color = COLORS.black) {
    const value = normalizarTexto(text);
    let finalSize = size;
    while (finalSize > 9 && font.widthOfTextAtSize(value, finalSize) > width) finalSize -= 0.5;
    const textWidth = font.widthOfTextAtSize(value, finalSize);
    page.drawText(value, {
        x: x + ((width - textWidth) / 2),
        y,
        size: finalSize,
        font,
        color
    });
}

function limitarConteudos(conteudos, maximum = 12) {
    const values = [...new Set((Array.isArray(conteudos) ? conteudos : [])
        .map((item) => normalizarTexto(item, ''))
        .filter(Boolean))];
    if (values.length <= maximum) return values;
    const visible = values.slice(0, maximum - 1);
    visible.push(`Mais ${values.length - visible.length} módulos publicados na turma`);
    return visible;
}

function criarUrlValidacao(codigoPublico, env = process.env) {
    const base = String(env.APP_BASE_URL || `http://localhost:${env.APP_PORT || 3000}`);
    return new URL(
        `/certificados/validar/${encodeURIComponent(codigoPublico)}`,
        base
    ).toString();
}

function prepararConteudoCertificado(snapshot, env = process.env) {
    const data = snapshot.data_certificado || snapshot.emitido_em;
    const parsedDate = data instanceof Date ? data : new Date(data);
    return {
        nomeAluno: normalizarTexto(snapshot.aluno_nome),
        cpf: formatarCpf(snapshot.aluno_cpf),
        curso: normalizarTexto(snapshot.curso_nome),
        turma: normalizarTexto(snapshot.turma_nome),
        cargaHoraria: `${Number(snapshot.carga_horaria) || 0} horas`,
        data: formatarData(data),
        ano: Number.isNaN(parsedDate.getTime()) ? 'Não informado' : String(parsedDate.getFullYear()),
        responsavel: normalizarTexto(snapshot.responsavel_nome, 'Responsável acadêmico'),
        funcaoResponsavel: normalizarTexto(
            env.CERTIFICATE_RESPONSIBLE_ROLE,
            'Responsável acadêmico'
        ),
        instituicao: normalizarTexto(
            env.CERTIFICATE_INSTITUTION_NAME,
            'Universidade Tecnológica Federal do Paraná'
        ),
        campus: normalizarTexto(env.CERTIFICATE_CAMPUS, ''),
        conteudos: limitarConteudos(snapshot.conteudos_abordados),
        codigoValidacao: normalizarTexto(snapshot.codigo_publico)
    };
}

async function carregarAssets(pdf) {
    const [brasao, faixa, logo] = await Promise.all([
        fs.promises.readFile(path.join(ASSET_DIR, 'brasao-republica.jpg')),
        fs.promises.readFile(path.join(ASSET_DIR, 'faixa-amarela.png')),
        fs.promises.readFile(path.join(ASSET_DIR, 'logo-utfpr.png'))
    ]);
    const [brasaoImage, faixaImage, logoImage] = await Promise.all([
        pdf.embedJpg(brasao),
        pdf.embedPng(faixa),
        pdf.embedPng(logo)
    ]);
    return { brasaoImage, faixaImage, logoImage };
}

function desenharCabecalhoInstitucional(page, assets, fonts, values) {
    page.drawImage(assets.brasaoImage, {
        x: calcularXCentralizado(
            page.getWidth(),
            BRASAO_CABECALHO.width,
            BRASAO_CABECALHO.ajusteOpticoX
        ),
        y: BRASAO_CABECALHO.y,
        width: BRASAO_CABECALHO.width,
        height: BRASAO_CABECALHO.height
    });
    desenharCentralizado(page, 'República Federativa do Brasil', fonts.sans, 14, 610);
    desenharCentralizado(page, 'Ministério da Educação', fonts.sans, 14, 593);
    desenharCentralizado(page, values.instituicao, fonts.sansBold, 14, 574, COLORS.black, 570);
}

async function desenharPrimeiraPagina(pdf, values, assets, fonts, validationUrl) {
    const page = pdf.addPage(PAGE_SIZE);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_SIZE[0], height: PAGE_SIZE[1], color: COLORS.white });
    page.drawImage(assets.faixaImage, { x: 0, y: 0, width: 148, height: PAGE_SIZE[1] });
    page.drawImage(assets.logoImage, { x: 7, y: 15, width: 132, height: 52 });
    desenharCabecalhoInstitucional(page, assets, fonts, values);

    desenharCentralizado(page, 'DECLARAÇÃO', fonts.sansBold, 31, 409, COLORS.black, 700);
    const local = values.campus ? `${values.instituicao}, ${values.campus}` : values.instituicao;
    const statement = `${values.nomeAluno} concluiu com aprovação o curso “${values.curso}”, `
        + `promovido pela ${local}, em ${values.data}, com carga horária de ${values.cargaHoraria}.`;
    page.drawText('Declaramos que', { x: 210, y: 357, size: 21, font: fonts.sansBold, color: COLORS.black });
    const statementBlock = ajustarBloco(statement, fonts.sans, 1125, 112, 21, 15, 1.32);
    desenharLinhas(page, statementBlock.lines, {
        x: 210,
        y: 326,
        size: statementBlock.size,
        lineHeight: statementBlock.lineHeight,
        font: fonts.sans
    });

    page.drawLine({ start: { x: 650, y: 105 }, end: { x: 985, y: 105 }, thickness: 0.8, color: COLORS.lightGray });
    desenharCentralizadoNaArea(page, values.responsavel, fonts.sansBold, 15, 81, 650, 335);
    desenharCentralizadoNaArea(page, values.funcaoResponsavel, fonts.sans, 12, 62, 650, 335, COLORS.gray);

    const qrBuffer = await QRCode.toBuffer(validationUrl, {
        type: 'png',
        width: 256,
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#111111', light: '#FFFFFF' }
    });
    const qrImage = await pdf.embedPng(qrBuffer);
    page.drawImage(qrImage, { x: 1190, y: 55, width: 92, height: 92 });
    page.drawText('Valide este certificado', { x: 1168, y: 164, size: 11, font: fonts.sansBold });
    const codeBlock = ajustarBloco(values.codigoValidacao, fonts.sansBold, 245, 24, 9, 8, 1.12);
    desenharLinhas(page, codeBlock.lines, {
        x: 1132,
        y: 39,
        size: codeBlock.size,
        lineHeight: codeBlock.lineHeight,
        font: fonts.sansBold
    });
}

function desenharCampo(page, label, value, y, fonts) {
    page.drawText(`${label}:`, { x: 72, y, size: 20, font: fonts.sansBold, color: COLORS.black });
    const labelWidth = fonts.sansBold.widthOfTextAtSize(`${label}: `, 20);
    const block = ajustarBloco(value, fonts.sans, 1260 - labelWidth, 48, 20, 14, 1.2);
    desenharLinhas(page, block.lines, {
        x: 72 + labelWidth,
        y,
        size: block.size,
        lineHeight: block.lineHeight,
        font: fonts.sans
    });
    return y - Math.max(43, block.lines.length * block.lineHeight + 12);
}

function desenharSegundaPagina(pdf, values, fonts) {
    const page = pdf.addPage(PAGE_SIZE);
    page.drawRectangle({ x: 0, y: 0, width: PAGE_SIZE[0], height: PAGE_SIZE[1], color: COLORS.white });
    page.drawLine({ start: { x: 65, y: 700 }, end: { x: 1375, y: 700 }, thickness: 3, color: COLORS.gold });
    page.drawLine({ start: { x: 65, y: 130 }, end: { x: 1375, y: 130 }, thickness: 3, color: COLORS.gold });

    let y = 663;
    y = desenharCampo(page, 'Curso', values.curso, y, fonts);
    y = desenharCampo(page, 'Turma', values.turma, y, fonts);
    y = desenharCampo(page, 'Data', values.data, y, fonts);
    y = desenharCampo(page, 'Participante', values.nomeAluno, y, fonts);
    y = desenharCampo(page, 'CPF', values.cpf, y, fonts);
    y = desenharCampo(page, 'Carga horária', values.cargaHoraria, y, fonts);

    page.drawText('Conteúdos abordados:', { x: 72, y, size: 20, font: fonts.sansBold, color: COLORS.black });
    const topics = values.conteudos.length ? values.conteudos : ['Nenhum módulo ou conteúdo publicado.'];
    const availableHeight = Math.max(90, y - 156);
    let selected = null;
    for (let size = 18; size >= 11; size -= 0.5) {
        const lineHeight = size * 1.24;
        const blocks = topics.map((topic) => quebrarLinhas(topic, fonts.sans, size, 1210));
        const totalHeight = blocks.reduce((sum, lines) => sum + (lines.length * lineHeight) + 5, 0);
        if (totalHeight <= availableHeight) {
            selected = { size, lineHeight, blocks };
            break;
        }
    }
    selected = selected || {
        size: 11,
        lineHeight: 13.64,
        blocks: topics.map((topic) => quebrarLinhas(topic, fonts.sans, 11, 1210))
    };
    let topicY = y - 38;
    selected.blocks.forEach((lines) => {
        page.drawCircle({ x: 88, y: topicY + 5, size: 3.2, color: COLORS.black });
        desenharLinhas(page, lines, {
            x: 103,
            y: topicY,
            size: selected.size,
            lineHeight: selected.lineHeight,
            font: fonts.sans
        });
        topicY -= (lines.length * selected.lineHeight) + 5;
    });
}

async function prepararDocumentoCertificado() {
    const pdf = await PDFDocument.create();
    const [sans, sansBold] = await Promise.all([
        pdf.embedFont(StandardFonts.Helvetica),
        pdf.embedFont(StandardFonts.HelveticaBold)
    ]);
    return { pdf, fonts: { sans, sansBold }, assets: await carregarAssets(pdf) };
}

async function gerarCertificadoPdf(snapshot, env = process.env, preparado) {
    const { pdf, fonts, assets } = preparado || await prepararDocumentoCertificado();
    const values = prepararConteudoCertificado(snapshot, env);
    pdf.setTitle(`Certificado ${values.codigoValidacao}`);
    pdf.setSubject('Declaração institucional de conclusão emitida pela plataforma');
    pdf.setCreator(String(env.APP_NAME || 'Plataforma de Cursos'));
    pdf.setProducer('Plataforma de Cursos');
    pdf.setCreationDate(snapshot.emitido_em);
    pdf.setModificationDate(snapshot.emitido_em);

    const validationUrl = criarUrlValidacao(values.codigoValidacao, env);

    await desenharPrimeiraPagina(pdf, values, assets, fonts, validationUrl);
    desenharSegundaPagina(pdf, values, fonts);
    return Buffer.from(await pdf.save());
}

module.exports = {
    prepararDocumentoCertificado,
    PAGE_SIZE,
    calcularXCentralizado,
    criarUrlValidacao,
    formatarCpf,
    gerarCertificadoPdf,
    limitarConteudos,
    prepararConteudoCertificado,
    quebrarLinhas
};
