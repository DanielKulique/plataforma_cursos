'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const exec = promisify(execFile);
const root = path.join(__dirname, '../..');

describe('clean-checkout CI runner behavior', () => {
    let directory;
    let environment;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'goal22-ci-runner-'));
        const bin = path.join(directory, 'bin');
        fs.mkdirSync(bin);
        for (const command of ['npx', 'docker']) {
            fs.writeFileSync(path.join(bin, command), `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(process.env.CI_FIXTURE_LOG, JSON.stringify({ command: '${command}', args: process.argv.slice(2) }) + '\\n');
process.exit('${command}' === 'npx' ? Number(process.env.CI_FIXTURE_TEST_EXIT) : 0);
`, { mode: 0o700 });
        }
        environment = {
            ...process.env, CI: 'true', NODE_ENV: 'test',
            PATH: `${bin}:${process.env.PATH}`, CI_FIXTURE_LOG: path.join(directory, 'calls.jsonl'),
            CI_FIXTURE_TEST_EXIT: '0'
        };
    });

    afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

    function calls() {
        return fs.readFileSync(environment.CI_FIXTURE_LOG, 'utf8').trim().split('\n').map(JSON.parse);
    }

    it('collects the same nonempty complete E2E inventory in all three browsers', async () => {
        let reference;
        for (const project of ['chromium', 'firefox-critical', 'webkit-critical']) {
            const report = path.join(directory, `${project}.json`);
            await exec(process.execPath, [path.join(root, 'node_modules/playwright/cli.js'), 'test',
                '--list', `--project=${project}`, '--reporter=json'], {
                cwd: root, env: { ...environment, PLAYWRIGHT_JSON_OUTPUT_NAME: report }, timeout: 10000
            });
            const titles = [];
            function collect(suite) {
                for (const spec of suite.specs || []) titles.push(`${spec.file}:${spec.line}:${spec.title}`);
                (suite.suites || []).forEach(collect);
            }
            JSON.parse(fs.readFileSync(report, 'utf8')).suites.forEach(collect);
            expect(titles.length).toBeGreaterThan(0);
            titles.sort();
            if (!reference) reference = titles;
            expect(titles).toEqual(reference);
        }
    });

    it.each([0, 37])('integration CI needs no ignored .env.test and propagates test exit %i', async (exit) => {
        environment.CI_FIXTURE_TEST_EXIT = String(exit);
        expect(fs.existsSync(path.join(directory, '.env.test'))).toBe(false);
        const run = exec(process.execPath, [path.join(root, 'scripts/run_integration.js')], {
            cwd: directory, env: environment, timeout: 5000
        });
        if (exit === 0) await expect(run).resolves.toMatchObject({ stderr: '' });
        else await expect(run).rejects.toMatchObject({ code: 1 });
        expect(calls()).toEqual([{
            command: 'npx', args: ['jest', '--config=jest.integration.config.js', '--runInBand', '--detectOpenHandles']
        }]);
    });

    it.each([0, 37])('E2E waits for real asynchronous readiness, runs all tests without retry, and cleans on exit %i', async (exit) => {
        environment.CI_FIXTURE_TEST_EXIT = String(exit);
        const server = http.createServer((_req, res) => {
            setTimeout(() => res.writeHead(200).end('ready'), 200);
        });
        await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
        environment.E2E_BASE_URL = `http://127.0.0.1:${server.address().port}`;
        try {
            const run = exec(process.execPath, [path.join(root, 'scripts/run_e2e.js'), 'all', '--project=chromium'], {
                cwd: directory, env: environment, timeout: 10000
            });
            if (exit === 0) await expect(run).resolves.toMatchObject({ stderr: '' });
            else await expect(run).rejects.toMatchObject({ code: 1 });
            const commands = calls();
            expect(commands.find((call) => call.command === 'npx')).toEqual({ command: 'npx', args: [
                'playwright', 'test', '--project=chromium', '--grep=.*', '--retries=0', '--forbid-only', '--fail-on-flaky-tests'
            ] });
            const last = commands.at(-1);
            expect(last.command).toBe('docker');
            expect(last.args.slice(-3)).toEqual(['down', '--volumes', '--remove-orphans']);
        } finally {
            await new Promise((resolve) => server.close(resolve));
        }
    });
});
