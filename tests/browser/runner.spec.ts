import {test, expect, type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {createServer, type Server} from 'node:http';

let apiServer: Server;
let apiOrigin = '';
let requestCount = 0;

const specText = () =>
    JSON.stringify({
        openapi: '3.1.1',
        info: {
            title: 'Browser Runner Fixture',
            version: '1',
            description: 'Embedded emoji preview 🚀 :fire: 👩🏽‍💻 🫩 and native code `🚀`.',
        },
        servers: [{url: apiOrigin}],
        paths: {
            '/validate/{id}': {
                post: {
                    summary: 'Send permissive validation request',
                    parameters: [
                        {name: 'id', in: 'path', required: true, schema: {type: 'string', pattern: '^[0-9]+$'}},
                    ],
                    requestBody: {required: true, content: {'application/json': {schema: {type: 'object'}}}},
                    security: [{bearerAuth: []}],
                    responses: {
                        '200': {description: 'Accepted'},
                        '400': {
                            description: 'Invalid input',
                            content: {
                                'application/problem+json': {
                                    schema: {$ref: '#/components/schemas/Problem'},
                                    example: {error: 'bad input', details: {field: 'id'}},
                                },
                            },
                        },
                        '422': {description: 'Validation failed'},
                        '500': {description: 'Unexpected server failure'},
                    },
                },
            },
            '/billing/charges': {
                post: {
                    tags: ['Billing Folder'],
                    summary: 'Create customer charge',
                    description: 'Settlement wording is only in this description.',
                    responses: {'204': {description: 'Created'}},
                },
            },
            '/billing/refunds': {
                post: {
                    tags: ['Billing Folder'],
                    summary: 'Refund customer charge',
                    responses: {'204': {description: 'Refunded'}},
                },
            },
            '/reports/invoice-route': {
                get: {
                    tags: ['Reports'],
                    summary: 'Export monthly report',
                    responses: {'200': {description: 'Exported'}},
                },
            },
        },
        components: {
            securitySchemes: {bearerAuth: {type: 'http', scheme: 'bearer'}},
            schemas: {
                Problem: {
                    type: 'object',
                    properties: {
                        error: {type: 'string'},
                        details: {type: 'object', properties: {field: {type: 'string'}}},
                    },
                },
                Tiny: {type: 'object', properties: {id: {type: 'integer'}}},
            },
        },
    });

test.beforeAll(async () => {
    apiServer = createServer((request, response) => {
        response.setHeader('access-control-allow-origin', '*');
        response.setHeader('access-control-allow-headers', '*');
        response.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS,QUERY');
        if (request.method === 'OPTIONS') {
            response.statusCode = 204;
            response.end();
            return;
        }
        if (request.method === 'GET' && request.url === '/remote-spec.json') {
            response.statusCode = 200;
            response.setHeader('content-type', 'application/json');
            response.setHeader('etag', '"remote-browser-fixture"');
            response.end(specText());
            return;
        }
        requestCount += 1;
        request.resume();
        request.on('end', () => {
            response.statusCode = 400;
            response.setHeader('content-type', 'application/problem+json');
            response.end(JSON.stringify({error: 'the real fixture server rejected this request', count: requestCount}));
        });
    });
    await new Promise<void>((resolve, reject) => {
        apiServer.once('error', reject);
        apiServer.listen(0, '127.0.0.1', resolve);
    });
    const address = apiServer.address();
    if (!address || typeof address === 'string') throw new Error('Fixture API did not bind a TCP port.');
    apiOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
    await new Promise<void>((resolve, reject) => apiServer.close(error => (error ? reject(error) : resolve())));
});

async function loadSpecification(page: Page) {
    await page.goto('/');
    await page
        .getByRole('button', {name: /open specification/i})
        .first()
        .click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: /open specification file/i}).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
        name: 'browser-fixture.json',
        mimeType: 'application/json',
        buffer: Buffer.from(specText()),
    });
    await expect(page.getByText('Browser Runner Fixture', {exact: true}).first()).toBeVisible();
}

test('runs deliberately invalid requests and keeps the last ten outcomes', async ({page}) => {
    await loadSpecification(page);
    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    await page.getByRole('button', {name: /API Runner/i}).click();

    const runner = page.locator('form');
    await expect(runner).toBeVisible();
    const pathInput = runner.locator('input[type="text"]').first();
    await pathInput.fill('wrong-pattern');
    await runner.getByRole('button', {name: /Send API Request/i}).click();
    await expect(runner.getByText('400', {exact: true})).toBeVisible();
    await expect(runner.getByText(/real fixture server rejected/i)).toBeVisible();
    await expect(runner.getByText(/RUN_PARAMETER_PATTERN_MISMATCH/)).toBeVisible();

    for (let index = 0; index < 10; index++) {
        await runner.getByRole('button', {name: /Send API Request/i}).click();
        await expect(runner.getByText('400', {exact: true})).toBeVisible();
    }
    const historyButton = runner.getByRole('button', {name: 'Response history'});
    await historyButton.click();
    await expect(page.getByRole('option')).toHaveCount(10);
    await page.keyboard.press('Escape');
    expect(requestCount).toBeGreaterThanOrEqual(11);

    // Histories are persisted per specification and endpoint.
    await page.reload();
    await expect(page.getByText('Browser Runner Fixture', {exact: true}).first()).toBeVisible();
    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    await page.getByRole('button', {name: /API Runner/i}).click();
    const restoredHistory = page.getByRole('button', {name: 'Response history'});
    await restoredHistory.click();
    await expect(page.getByRole('option')).toHaveCount(10);

    // Individual deletion is immediate.
    await page
        .getByRole('button', {name: /Delete .* from history/i})
        .first()
        .click();
    await expect(page.getByRole('option')).toHaveCount(9);
    await page.keyboard.press('Escape');

    // Clear-all uses the shared confirmation modal and persists the empty state.
    await restoredHistory.click();
    await page.getByRole('button', {name: 'Clear all'}).click();
    await expect(page.getByRole('dialog')).toContainText('Clear response history?');
    await page.getByRole('button', {name: 'Clear history'}).click();
    await expect(restoredHistory).toBeHidden();
    await page.reload();
    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    await page.getByRole('button', {name: /API Runner/i}).click();
    await expect(page.getByRole('button', {name: 'Response history'})).toHaveCount(0);
});

test('selects response examples and the current inspect schema by default', async ({page}) => {
    await loadSpecification(page);
    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    const responseCard = page.locator('#response-400');
    await responseCard.locator('> div').first().click();
    const exampleTab = responseCard.getByRole('button', {name: /Example Representation/i});
    const schemaTab = responseCard.getByRole('button', {name: /Unified Schema/i});
    await expect(exampleTab).toHaveAttribute('aria-pressed', 'true');
    await expect(schemaTab).toHaveAttribute('aria-pressed', 'false');
    await expect(responseCard.getByRole('button', {name: /Problem/}).first()).toHaveAttribute('aria-pressed', 'true');
    const example = await responseCard.locator('pre code').last().textContent();
    expect(example).toContain('\n    "error": "bad input"');
    expect(example).toContain('\n        "field": "id"');
});

test('uses a scroll-aware desktop response navigator and behavior-aware tooltips', async ({page}) => {
    await loadSpecification(page);
    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    const navigator = page.getByRole('navigation', {name: 'Response code navigator'});
    await expect(navigator).toBeVisible();
    await expect(navigator).toHaveClass(/w-16/);
    await expect(navigator.locator('..')).toHaveClass(/w-16/);
    await expect(navigator.locator('../..')).toHaveClass(/\bpl-16\b/);
    await expect(navigator.getByRole('button')).toHaveCount(4);
    const collapsedIndicator = navigator.locator('[data-response-indicator="400"]');
    await expect(collapsedIndicator).toHaveAttribute('data-expanded', 'false');
    await expect(collapsedIndicator).toHaveClass(/border-\[var\(--method-delete\)\]/);

    const response422 = navigator.getByRole('button', {name: /Open response 422/});
    await expect(response422).toHaveClass(/gap-2/);
    await expect(response422).not.toHaveClass(/bg-/);
    await response422.hover();
    await page.waitForTimeout(300);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(300);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.mouse.move(0, 0);
    await response422.hover();
    await page.waitForTimeout(550);
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toContainText('Validation failed');
    await expect(tooltip).toHaveClass(/tooltip-fade-in/);
    await page.mouse.wheel(0, 120);
    await expect(tooltip).toHaveCount(0);

    await response422.click();
    await expect(response422).toHaveAttribute('aria-pressed', 'true');
    await expect(response422.locator('i')).toHaveCount(0);
    await expect(response422.locator('[data-response-code-label="422"]')).toHaveClass(
        /text-\[var\(--method-delete\)\]/,
    );
    await expect(page.locator('#response-422').getByText('Does not return structured body payload.')).toBeVisible();
    await expect(page.locator('#response-422')).not.toHaveClass(/ring-/);

    const response500 = navigator.getByRole('button', {name: /Open response 500/});
    await response500.click();
    await expect(response500).toHaveAttribute('aria-pressed', 'true');
    await expect(response422.locator('[data-response-indicator="422"]')).toHaveAttribute('data-expanded', 'true');
    await expect(response422.locator('[data-response-indicator="422"]')).toHaveClass(/bg-\[var\(--method-delete\)\]/);

    const response400 = navigator.getByRole('button', {name: /Open response 400/});
    const response400Card = page.locator('#response-400');
    const response400Header = response400Card.locator('> div').first();
    const response400Body = response400Card.locator('> div').nth(1);
    await response400.click();
    await expect(response400).toHaveAttribute('aria-pressed', 'true');
    await expect(response400Header).toHaveClass(/\bpx-2\.5\b/);
    await expect(response400Header).toHaveClass(/\bpy-2\b/);
    await expect(response400Body).toHaveClass(/\bp-2\.5\b/);
    await expect
        .poll(() =>
            response400Card.evaluate(element => {
                const container = element.closest('[data-endpoint-docs-scroll]');
                if (!container) return Number.POSITIVE_INFINITY;
                return Math.abs(element.getBoundingClientRect().top - container.getBoundingClientRect().top - 16);
            }),
        )
        .toBeLessThanOrEqual(8);
    await page.locator('#response-200').evaluate(element => element.scrollIntoView({block: 'start'}));
    await expect(navigator.getByRole('button', {name: /Open response 200/})).toHaveAttribute('aria-pressed', 'true');
    await page.locator('#response-400').evaluate(element => element.scrollIntoView({block: 'start'}));
    await expect(response400).toHaveAttribute('aria-pressed', 'true');

    await response400Header.click();
    await expect(collapsedIndicator).toHaveAttribute('data-expanded', 'false');
    await expect(response400).toHaveAttribute('aria-pressed', 'false');

    await response400Header.evaluate(element => element.scrollIntoView({block: 'center'}));
    await response400Header.click();
    await expect(response400Body).toBeVisible();
    await expect
        .poll(() =>
            response400Card.evaluate(element => {
                const container = element.closest('[data-endpoint-docs-scroll]');
                if (!container) return Number.POSITIVE_INFINITY;
                return Math.abs(element.getBoundingClientRect().top - container.getBoundingClientRect().top - 16);
            }),
        )
        .toBeLessThanOrEqual(8);
    await expect(response400).toHaveAttribute('aria-pressed', 'true');
    await expect(response400Card).not.toHaveClass(/ring-/);
    await expect(page.locator('#response-422').getByText('Does not return structured body payload.')).toBeVisible();

    await page.setViewportSize({width: 820, height: 900});
    await expect(navigator).toHaveCount(0);
});

test('deep-linked responses collapse siblings, align to the top and receive the border effect', async ({page}) => {
    await loadSpecification(page);
    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    await expect(page).toHaveURL(/\/api\//);
    await page.evaluate(() => {
        const base = window.location.hash.replace(/#response-[^#]+$/, '');
        window.location.hash = `${base}#response-422`;
    });

    const selected = page.locator('#response-422');
    await expect(selected).toHaveClass(/ring-2/);
    await expect(selected).toHaveClass(/ring-\[var\(--primary\)\]/);
    await expect(selected.getByText('Does not return structured body payload.')).toBeVisible();
    await expect(page.locator('#response-200 > div')).toHaveCount(1);
    await expect(page.locator('#response-400 > div')).toHaveCount(1);
    await expect(page.locator('#response-500 > div')).toHaveCount(1);
    await expect
        .poll(() =>
            selected.evaluate(element => {
                const container = element.closest('[data-endpoint-docs-scroll]');
                if (!container) return Number.POSITIVE_INFINITY;
                return Math.abs(element.getBoundingClientRect().top - container.getBoundingClientRect().top - 16);
            }),
        )
        .toBeLessThanOrEqual(8);
    await expect(
        page.getByRole('navigation', {name: 'Response code navigator'}).getByRole('button', {name: /422/}),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(selected).not.toHaveClass(/ring-2/, {timeout: 2500});
});

test('renders the embedded Apple sprite set without changing emoji inside code', async ({page}) => {
    await loadSpecification(page);
    await page.getByRole('button', {name: /Overview & Statistics/i}).click();
    await expect(page.locator('span.emoji[aria-label="🚀"]')).toHaveCount(1);
    await expect(page.locator('span.emoji[aria-label=":fire:"]')).toHaveCount(1);
    await expect(page.locator('span.emoji[aria-label="👩🏽‍💻"]')).toHaveCount(1);
    await expect(page.locator('span.emoji[aria-label="🫩"]')).toHaveCount(1);
    const backgroundImage = await page
        .locator('span.emoji[aria-label="🚀"]')
        .evaluate(element => getComputedStyle(element).backgroundImage);
    expect(backgroundImage).toContain('data:image/png;base64,');
    await expect(page.locator('code').filter({hasText: '🚀'})).toBeVisible();
});

test('layers the local endpoint filter over global results without searching tag folders', async ({page}) => {
    await loadSpecification(page);
    const sidebar = page.locator('[data-opendoc-sidebar]');
    const navigationHeader = sidebar.locator('[data-sidebar-navigation-header]');
    const validationEndpoint = sidebar.getByText('Send permissive validation request', {exact: true});
    const createEndpoint = sidebar.getByText('Create customer charge', {exact: true});
    const refundEndpoint = sidebar.getByText('Refund customer charge', {exact: true});
    const reportEndpoint = sidebar.getByText('Export monthly report', {exact: true});
    const validationRoute = sidebar.getByText('/validate/{id}', {exact: true});
    await expect(validationEndpoint).toBeVisible();
    await expect(validationRoute).toHaveCount(0);
    await sidebar.getByRole('button', {name: 'Navigation settings'}).click();
    const showEndpointRoutes = page.getByRole('menuitemcheckbox', {name: 'Show endpoint routes'});
    await expect(showEndpointRoutes).toHaveAttribute('aria-checked', 'false');
    await showEndpointRoutes.click();
    await expect(showEndpointRoutes).toHaveAttribute('aria-checked', 'true');
    await expect(validationRoute).toBeVisible();
    await page.keyboard.press('Escape');
    const closedHeaderHeight = await navigationHeader.evaluate(element => element.getBoundingClientRect().height);

    await sidebar.getByRole('button', {name: 'Filter sidebar endpoints'}).click();
    const input = sidebar.getByRole('textbox', {name: 'Filter sidebar endpoints'});
    await expect(input).toBeFocused();
    await expect(sidebar.getByText('API Navigation', {exact: true})).toHaveCount(0);
    await expect(sidebar.getByRole('button', {name: 'Navigation settings'})).toHaveCount(0);
    const openHeaderHeight = await navigationHeader.evaluate(element => element.getBoundingClientRect().height);
    expect(openHeaderHeight).toBe(closedHeaderHeight);

    await input.fill('Billing Folder');
    await expect(createEndpoint).toHaveCount(0);
    await expect(refundEndpoint).toHaveCount(0);
    await input.fill('settlement');
    await expect(createEndpoint).toHaveCount(0);
    await input.fill('invoice-route');
    await expect(reportEndpoint).toBeVisible();
    await input.fill('refund customer');
    await expect(refundEndpoint).toBeVisible();
    await expect(createEndpoint).toHaveCount(0);
    await sidebar.getByRole('button', {name: 'Clear endpoint filter'}).click();
    await expect(validationEndpoint).toBeVisible();
    await sidebar.getByRole('button', {name: 'Close endpoint filter'}).click();

    const globalSearch = page.getByPlaceholder('Global Search (Ctrl+K)...');
    await globalSearch.fill('Billing Folder');
    await expect(createEndpoint).toBeVisible();
    await expect(refundEndpoint).toBeVisible();
    await expect(validationEndpoint).toHaveCount(0);

    await sidebar.getByRole('button', {name: 'Filter sidebar endpoints'}).click();
    const layeredInput = sidebar.getByRole('textbox', {name: 'Filter sidebar endpoints'});
    await layeredInput.fill('refund');
    await expect(refundEndpoint).toBeVisible();
    await expect(createEndpoint).toHaveCount(0);
    await layeredInput.fill('Billing Folder');
    await expect(createEndpoint).toHaveCount(0);
    await expect(refundEndpoint).toHaveCount(0);
    await sidebar.getByRole('button', {name: 'Clear endpoint filter'}).click();
    await expect(createEndpoint).toBeVisible();
    await expect(refundEndpoint).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(layeredInput).toHaveCount(0);
    await expect(globalSearch).toHaveValue('Billing Folder');
    await expect(sidebar.getByText('API Navigation', {exact: true})).toBeVisible();
});

test('combines configured and local specifications in hybrid mode', async ({page}) => {
    await page.addInitScript(rawSpec => {
        window.INITIAL_CONFIG = {
            allowLocalSpecifications: true,
            parsables: {
                'Bundled Demo API': {
                    title: 'Bundled Demo API',
                    isCustom: true,
                    rawSpec,
                },
            },
        };
    }, specText());
    await page.goto('/');
    await expect(page.locator('.app-topbar').getByText('Bundled Demo API', {exact: true})).toBeVisible();
    await page.locator('.app-topbar').getByText('Bundled Demo API', {exact: true}).click();
    await expect(page.getByRole('button', {name: 'Open your own specification'})).toBeVisible();

    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: 'Open your own specification'}).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
        name: 'local-hybrid.json',
        mimeType: 'application/json',
        buffer: Buffer.from(
            JSON.stringify({
                openapi: '3.1.1',
                info: {title: 'My Local Hybrid API', version: '1'},
                paths: {'/local': {get: {summary: 'Local endpoint', responses: {'200': {description: 'OK'}}}}},
            }),
        ),
    });
    await expect(page.locator('.app-topbar').getByText('My Local Hybrid API', {exact: true})).toBeVisible();

    await page.reload();
    await expect(page.locator('.app-topbar').getByText('My Local Hybrid API', {exact: true})).toBeVisible();
    await page.locator('.app-topbar').getByText('My Local Hybrid API', {exact: true}).click();
    await expect(page.getByText('Recent local specifications', {exact: true})).toBeVisible();
    await expect(page.getByText('Bundled Demo API', {exact: true})).toBeVisible();
    await page.getByText('Bundled Demo API', {exact: true}).click();
    await expect(page.locator('.app-topbar').getByText('Bundled Demo API', {exact: true})).toBeVisible();
});

test('loads, caches and restores a remote specification URL with direct-mode CORS help', async ({page}) => {
    await page.goto('/');
    await page.locator('.app-topbar').getByText('Open specification', {exact: true}).click();
    await page.getByText('Load from URL', {exact: true}).click();
    const remoteUrl = `${apiOrigin}/remote-spec.json`;
    await page.getByLabel('OpenAPI or Swagger URL').fill(remoteUrl);
    await expect(page.getByText('CORS configuration help', {exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'Load URL'}).click();
    await expect(page.locator('.app-topbar').getByText('Browser Runner Fixture', {exact: true})).toBeVisible();
    await expect(page).toHaveURL(/#\/parsable\/remote%3A/);

    await page.locator('.app-topbar').getByText('Browser Runner Fixture', {exact: true}).click();
    await expect(page.getByText('Recent URLs · 1', {exact: true})).toBeVisible();
    await expect(page.getByText(`${apiOrigin}/remote-spec.json`, {exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'Cancel'}).click();

    await page.reload();
    await expect(page.locator('.app-topbar').getByText('Browser Runner Fixture', {exact: true})).toBeVisible();
    await expect(page).toHaveURL(/#\/parsable\/remote%3A/);
});

test('turns protected indicators green when the effective auth requirement is configured', async ({page}) => {
    await loadSpecification(page);
    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    await expect(page.getByText('Protected', {exact: true})).toBeVisible();
    await page.getByRole('button', {name: /Authorize/i}).click();
    await page.getByLabel('Access token').fill('browser-test-token');
    await page.getByRole('button', {name: 'Apply'}).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page
        .locator('.app-topbar')
        .getByRole('button', {name: /BEARERAUTH/i})
        .click();
    await expect(page.getByLabel('Access token')).toHaveValue('browser-test-token');
    await page.getByRole('button', {name: 'Cancel'}).click();
    await expect(page.getByText('Authorized', {exact: true})).toBeVisible();
    await expect(page.getByText('Authorized', {exact: true})).toHaveClass(/text-\[var\(--method-get\)\]/);

    await page
        .locator('.app-topbar')
        .getByRole('button', {name: /BEARERAUTH/i})
        .click();
    await page.getByRole('button', {name: 'Log out'}).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await expect(page.getByText('Protected', {exact: true})).toBeVisible();
});

test('opens navbar AI without auto-targeting and offers endpoint-specific new conversation action', async ({page}) => {
    await loadSpecification(page);
    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    await page.getByRole('button', {name: 'Open AI Assistant'}).click();
    await expect(page.getByLabel('Targeted in AI assistant')).toHaveCount(0);

    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    await page.getByRole('button', {name: 'Ask AI in a new conversation'}).click();
    await expect(page.getByLabel('Targeted in AI assistant')).toHaveCount(1);
});

test('keeps a small desktop schema modal content-sized without an empty lower body', async ({page}) => {
    await loadSpecification(page);
    await page.getByRole('button', {name: /Schema Explorer/i}).click();
    await page.getByText('Tiny', {exact: true}).first().click();
    const modal = page.locator('.modal-surface').last();
    await expect(modal).toBeVisible();
    const box = await modal.boundingBox();
    expect(box?.height || 9999).toBeLessThan(560);
});

test('traps modal focus and restores it when closed', async ({page}) => {
    await page.goto('/');
    const trigger = page.getByRole('button', {name: /open specification/i}).first();
    await trigger.focus();
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(750);
    await expect(page.getByRole('tooltip')).toHaveCount(0);
    await page.keyboard.press('Shift+Tab');
    expect(
        await dialog.evaluate(
            (element, active) => element.contains(active as Node),
            await page.evaluateHandle(() => document.activeElement),
        ),
    ).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
});

test('loads user-selected local multi-file references', async ({page}) => {
    await page.goto('/');
    await page
        .getByRole('button', {name: /open specification/i})
        .first()
        .click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: /open specification file/i}).click();
    const chooser = await chooserPromise;
    await chooser.setFiles([
        {
            name: 'root.yaml',
            mimeType: 'application/yaml',
            buffer: Buffer.from(
                'openapi: 3.1.1\ninfo: {title: Browser Multi File, version: "1"}\npaths:\n  /resolved:\n    $ref: folder/paths.yaml#/ResolvedPath\n',
            ),
        },
        {
            name: 'paths.yaml',
            mimeType: 'application/yaml',
            buffer: Buffer.from(
                'ResolvedPath:\n  get:\n    summary: Resolved from sibling file\n    responses:\n      "200": {description: ok}\n',
            ),
        },
    ]);
    await expect(page.getByText('Browser Multi File', {exact: true}).first()).toBeVisible();
    await expect(page.getByText('Resolved from sibling file', {exact: true}).first()).toBeVisible();
});

test('accepts and documents a pathless OAS 3.1 webhook document', async ({page}) => {
    await page.goto('/');
    await page
        .getByRole('button', {name: /open specification/i})
        .first()
        .click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: /open specification file/i}).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
        name: 'webhook.yaml',
        mimeType: 'application/yaml',
        buffer: Buffer.from(
            'openapi: 3.1.1\ninfo: {title: Webhook Only, version: "1"}\nwebhooks:\n  paymentReceived:\n    post:\n      summary: Receive payment event\n      responses:\n        "200": {description: ok}\n',
        ),
    });
    await expect(page.getByText('Webhook Only', {exact: true}).first()).toBeVisible();
    await page.getByRole('button', {name: /Overview & Statistics/i}).click();
    await expect(page.getByRole('heading', {name: 'Webhooks'})).toBeVisible();
    await expect(page.getByText('Receive payment event')).toBeVisible();
    await expect(page.getByText('Documentation only')).toBeVisible();
});

test('supports keyboard resizers and has no serious accessibility violations in the runner', async ({page}) => {
    await loadSpecification(page);
    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    await page.getByRole('button', {name: /Split View/i}).click();
    const separator = page.getByRole('separator', {name: /Resize documentation and API Runner panes/i});
    await separator.focus();
    const before = Number(await separator.getAttribute('aria-valuenow'));
    await separator.press('ArrowRight');
    const after = Number(await separator.getAttribute('aria-valuenow'));
    expect(after).toBeGreaterThan(before);

    const results = await new AxeBuilder({page}).disableRules(['color-contrast']).analyze();
    const serious = results.violations.filter(
        violation => violation.impact === 'serious' || violation.impact === 'critical',
    );
    const summary = serious.flatMap(item => item.nodes.map(node => `${item.id}: ${node.html}`)).join('\n');
    expect(serious, summary).toEqual([]);
});
