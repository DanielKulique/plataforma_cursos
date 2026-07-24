const fs = require('fs');
const path = require('path');

function loadDialogHelper() {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'public', 'js', 'admin-dialog.js'),
        'utf8'
    ).replace(/\bexport\s+/g, '');
    const factory = new Function(
        `${source}\nreturn { showAdminDialog };`
    );
    return factory();
}

class FakeDialog {
    constructor() {
        this.attributes = {};
        this.listeners = {};
        this.isConnected = true;
    }

    setAttribute(name, value) {
        this.attributes[name] = String(value);
    }

    addEventListener(type, listener, options = {}) {
        this.listeners[type] ||= [];
        this.listeners[type].push({ listener, once: Boolean(options.once) });
    }

    dispatch(type, event = {}) {
        const listeners = [...(this.listeners[type] || [])];
        listeners.forEach(({ listener }) => listener(event));
        this.listeners[type] = (this.listeners[type] || []).filter(({ once }) => !once);
    }

    showModal() {
        this.open = true;
        this.showModalCalls = (this.showModalCalls || 0) + 1;
    }

    close() {
        this.closeCalls = (this.closeCalls || 0) + 1;
        this.open = false;
        this.dispatch('close');
    }

    focus() {
        this.focusCalls = (this.focusCalls || 0) + 1;
    }

    remove() {
        this.removed = true;
        this.isConnected = false;
    }
}

function setup() {
    const opener = { isConnected: true, focus: jest.fn() };
    const documentRef = {
        activeElement: opener,
        body: { style: { overflow: 'auto' } }
    };
    return { opener, documentRef, dialog: new FakeDialog() };
}

describe('ciclo de vida acessível do modal administrativo', () => {
    it('abre modalmente, bloqueia a rolagem do fundo e posiciona o foco dentro do diálogo', () => {
        const { showAdminDialog } = loadDialogHelper();
        const { documentRef, dialog } = setup();
        const initialFocus = { focus: jest.fn() };

        showAdminDialog(dialog, { initialFocus, documentRef });

        expect(dialog.showModalCalls).toBe(1);
        expect(dialog.attributes).toMatchObject({ 'aria-modal': 'true', tabindex: '-1' });
        expect(documentRef.body.style.overflow).toBe('hidden');
        expect(initialFocus.focus).toHaveBeenCalledTimes(1);
    });

    it('fecha com Escape, restaura a rolagem e devolve o foco ao acionador', async () => {
        const { showAdminDialog } = loadDialogHelper();
        const { opener, documentRef, dialog } = setup();
        const preventDefault = jest.fn();
        showAdminDialog(dialog, { documentRef });

        dialog.dispatch('cancel', { preventDefault });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(dialog.closeCalls).toBe(1);
        expect(dialog.removed).toBe(true);
        expect(documentRef.body.style.overflow).toBe('auto');
        expect(opener.focus).toHaveBeenCalledTimes(1);
    });

    it('também restaura foco e página ao fechar pelo botão ou após salvar', async () => {
        const { showAdminDialog } = loadDialogHelper();
        const { opener, documentRef, dialog } = setup();
        showAdminDialog(dialog, { documentRef });

        dialog.close();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(dialog.removed).toBe(true);
        expect(documentRef.body.style.overflow).toBe('auto');
        expect(opener.focus).toHaveBeenCalledTimes(1);
    });
});
