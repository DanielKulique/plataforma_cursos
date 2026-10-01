# Goal 16 — Full application automated tests

**Goal 16 snapshot: `FULL_APPLICATION_TEST_SUITE_PARTIAL`.** These counts describe the Goal 16 local run. The current inventory and release gates are tracked in [Goal 17](GOAL_17_FINAL_APPLICATION_AUDIT.md). The workflow contains the WebKit step; configuration alone is not evidence of a completed run.

## Implemented

- Kept the existing Jest suites and added Playwright browser coverage in 10 specs.
- Uses a disposable Compose app, MySQL and storage stack. MySQL has no published port; the app binds only to `127.0.0.1:3400`. E2E does not connect to integration MySQL `127.0.0.1:33307`, local MySQL `3306`, or production.
- Each E2E run starts from an empty MySQL 8.4 schema, applies migrations twice to prove the second pass is a NO-OP, seeds twice, then removes the containers, volumes and network.
- Browser data uses test ADMIN, PROFESSOR, ALUNO and ALUNO_2 accounts. Email delivery and external analysis are disabled.
- Replication now starts with source enrollment, learner progress, a browser-stored question draft and a submitted attempt. Browser/API checks confirm new editable IDs, independent content edits, no destination enrollment/progress/results/certificate/history and no draft keyed to the cloned assessment. Integration assertions inspect stored enrollment, progress, attempts, answers and certificates.
- Intercepted API errors cover 400, 401, 403, 404, 409, 422, 429, 500 and 503. Tests assert safe UI messages, no uncaught browser error or internal message, and preservation of the course context when the certificate list fails. Client error handling filters unsafe server text while preserving safe domain messages.
- Browser navigation checks private student, professor, teacher-class and admin pages against PUBLIC, ALUNO, PROFESSOR and ADMIN roles. Existing API authorization tests cover 403 and professor ownership/IDOR boundaries.
- Responsive checks assert global document width and main-content bounds at 320, 360, 390, 412, 768 and 1440 px across learner, certificate, professor, teacher-class and admin screens.
- Critical browser smoke covers landing, login, Sala Virtual, video lesson with the expected YouTube embed, assessments and progress. CSP allows the configured YouTube origins. Separate regressions cover email-disabled immediate login, Sala Virtual availability during certificate API failure and invalid PDF replacement preserving the previous file.
- CI runs unit, integration and build through `npm run test:all`, then Chromium smoke, Firefox critical smoke and WebKit critical smoke. On failure it uploads the Playwright HTML report and `test-results/` screenshots/traces. This configuration is not evidence of a completed CI run.
- The integration runner owns a disposable MySQL 8.4 bound only to `127.0.0.1:33307` and fails closed instead of falling back to `3306`.
- Retained the existing fix that includes each question's active state in the learner learning-path query.

## Goal 16 local results

- Unit/Jest: 72 suites, 751 tests passed.
- MySQL integration: 20 suites, 266 tests passed on `127.0.0.1:33307`.
- Lint and production asset/database-isolation build: passed as part of `npm run test:all`.
- Full Chromium E2E: 20/20 passed.
- Chromium smoke: 7/7 passed.
- Firefox critical smoke: 7/7 passed.
- Responsive: all six widths passed with no global horizontal overflow or main-content clipping.
- WebKit command reached Playwright but the browser could not launch because the local host lacks WebKit libraries, including `libwebkitgtk-6.0.so.4` and `libjavascriptcoregtk-6.0.so.1`. The local result is not counted as WebKit validation. CI installs browser system dependencies using `playwright install --with-deps`; its actual result is still pending.
- Inventory at that run: 32 HTML pages and 85 router declarations; Goal 17 also counts four direct app routes. All rows in `FULL_APPLICATION_TEST_MATRIX.md` use `COVERED`, `PARTIAL`, `NOT AUTOMATABLE` or `OUT OF SCOPE`; noncritical pages and incompletely asserted routes remain `PARTIAL`.

## Commands

```sh
npm run test:all
npm run test:e2e
npm run test:e2e:smoke
npm run test:e2e:firefox-critical
npm run test:e2e:webkit
git diff --check
```

Do not change the suite status to `FULL_APPLICATION_TEST_SUITE_READY` until the real GitHub Actions WebKit smoke for this revision passes. See `docs/testing/overview.md`, `docs/testing/e2e.md` and `docs/testing/FULL_APPLICATION_TEST_MATRIX.md`.
