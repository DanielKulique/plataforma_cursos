const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const pages = [
    'sobre.html',
    'equipe.html',
    'cartilha.html',
    'parceiros.html',
    'materiais.html',
    'perguntas-frequentes.html'
];
const routes = pages.map((page) => `/${page}`);

function read(page) {
    return fs.readFileSync(path.join(publicDir, page), 'utf8');
}

describe('Páginas institucionais locais', () => {
    it.each(pages)('%s herda a identidade, a navegação e os recursos comuns', (page) => {
        const html = read(page);

        expect(html).toContain('class="landing-page institutional-page"');
        expect(html).toContain('href="/css/landing/landing.css"');
        expect(html).toContain('href="/css/institucional.css"');
        expect(html).toContain('src="/js/institucional.js"');
        expect(html).toContain('src="/js/theme.js"');
        expect(html).toContain('href="#conteudo-principal"');
        expect(html).toContain('id="conteudo-principal"');
        expect(html.match(/<h1\b/g)).toHaveLength(1);
        expect(html).toContain('aria-current="page"');
        routes.forEach((route) => expect(html).toContain(`href="${route}"`));
        expect(html).not.toContain('falandodeplagio.wixsite.com');
    });

    it('protege links externos abertos em nova aba', () => {
        pages.forEach((page) => {
            const html = read(page);
            const externalAnchors = [...html.matchAll(/<a\b[^>]*href="https?:\/\/[^>]+>/gi)]
                .map((match) => match[0]);

            externalAnchors.forEach((anchor) => {
                expect(anchor).toContain('target="_blank"');
                expect(anchor).toContain('rel="noopener noreferrer"');
            });
        });
    });

    it('mantém todos os destinos institucionais dentro da nova landing', () => {
        const landing = read('landing.html');

        routes.forEach((route) => expect(landing).toContain(`href="${route}"`));
        expect(landing).not.toContain('falandodeplagio.wixsite.com');
    });

    it('entrega localmente cartazes, fotos e marcas migradas', () => {
        const assetNames = [
            'material-marionete.webp',
            'material-identifica.webp',
            'material-mascara.webp',
            'material-originalidade.webp',
            'material-xadrez.webp',
            'joao-paulo-aires.webp',
            'fabiana-pinheiro.webp',
            'edna-ferreira-silva.webp',
            'daniel-passos.webp',
            'alexandre-costa.webp',
            'maria-eduarda-macedo.webp',
            'fundacao-araucaria.webp',
            'utfpr.webp',
            'ppgect.webp',
            'uniguairaca.webp',
            'faculdade-guarapuava.webp'
        ];

        assetNames.forEach((name) => {
            const assetPath = path.join(publicDir, 'assets', 'institucional', name);
            expect(fs.existsSync(assetPath)).toBe(true);
            expect(fs.statSync(assetPath).size).toBeGreaterThan(1024);
            expect(fs.statSync(assetPath).size).toBeLessThan(200 * 1024);
        });
    });

    it('preserva conteúdo verificável de cada página antiga', () => {
        expect(read('sobre.html')).toContain('Usar ferramentas com ética');
        expect(read('equipe.html')).toContain('João Paulo Aires');
        expect(read('cartilha.html')).toContain('produto educacional');
        expect(read('parceiros.html')).toContain('Fundação Araucária');
        expect(read('materiais.html')).toContain('Baixar cartaz');
        expect(read('perguntas-frequentes.html')).toContain('70 pontos');
    });

    it('identifica os integrantes e seus retratos na página da equipe', () => {
        const equipe = read('equipe.html');
        const integrantes = [
            'Fabiana Fátima do Prado Sedelak Pinheiro',
            'Edna Ferreira da Silva',
            'Daniel Ricardo Kulique dos Passos',
            'Alexandre Rosas Costa',
            'Maria Eduarda Macedo'
        ];

        integrantes.forEach((nome) => expect(equipe).toContain(nome));
        expect(equipe.match(/class="team-member"/g)).toHaveLength(5);
        expect(equipe.match(/alt="Retrato de /g)).toHaveLength(5);
    });
});
