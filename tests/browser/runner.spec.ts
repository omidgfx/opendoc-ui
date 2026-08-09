import {test, expect, type Page} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {createServer, type Server} from 'node:http';

let apiServer: Server;
let apiOrigin = '';
let requestCount = 0;

const specText = () => JSON.stringify({
    openapi: '3.1.1',
    info: {title: 'Browser Runner Fixture', version: '1'},
    servers: [{url: apiOrigin}],
    paths: {
        '/validate/{id}': {
            post: {
                summary: 'Send permissive validation request',
                parameters: [{name: 'id', in: 'path', required: true, schema: {type: 'string', pattern: '^[0-9]+$'}}],
                requestBody: {required: true, content: {'application/json': {schema: {type: 'object'}}}},
                responses: {'400': {description: 'Invalid input', content: {'application/problem+json': {}}}},
            },
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
    if (!address || typeof address === 'string')
        throw new Error('Fixture API did not bind a TCP port.');
    apiOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
    await new Promise<void>((resolve, reject) => apiServer.close(error => error ? reject(error) : resolve()));
});

async function loadSpecification(page: Page) {
    await page.goto('/');
    await page.getByRole('button', {name: /open specification/i}).first().click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: /open specification file/i}).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({name: 'browser-fixture.json', mimeType: 'application/json', buffer: Buffer.from(specText())});
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
    await expect(runner.locator('select[aria-label="Response history"] option')).toHaveCount(10);
    expect(requestCount).toBeGreaterThanOrEqual(11);
});

test('traps modal focus and restores it when closed', async ({page}) => {
    await page.goto('/');
    const trigger = page.getByRole('button', {name: /open specification/i}).first();
    await trigger.focus();
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Shift+Tab');
    expect(await dialog.evaluate((element, active) => element.contains(active as Node), await page.evaluateHandle(() => document.activeElement))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
});

test('loads user-selected local multi-file references', async ({page}) => {
    await page.goto('/');
    await page.getByRole('button', {name: /open specification/i}).first().click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: /open specification file/i}).click();
    const chooser = await chooserPromise;
    await chooser.setFiles([
        {
            name: 'root.yaml', mimeType: 'application/yaml',
            buffer: Buffer.from('openapi: 3.1.1\ninfo: {title: Browser Multi File, version: "1"}\npaths:\n  /resolved:\n    $ref: folder/paths.yaml#/ResolvedPath\n'),
        },
        {
            name: 'paths.yaml', mimeType: 'application/yaml',
            buffer: Buffer.from('ResolvedPath:\n  get:\n    summary: Resolved from sibling file\n    responses:\n      "200": {description: ok}\n'),
        },
    ]);
    await expect(page.getByText('Browser Multi File', {exact: true}).first()).toBeVisible();
    await expect(page.getByText('Resolved from sibling file', {exact: true}).first()).toBeVisible();
});

test('accepts and documents a pathless OAS 3.1 webhook document', async ({page}) => {
    await page.goto('/');
    await page.getByRole('button', {name: /open specification/i}).first().click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: /open specification file/i}).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
        name: 'webhook.yaml', mimeType: 'application/yaml',
        buffer: Buffer.from('openapi: 3.1.1\ninfo: {title: Webhook Only, version: "1"}\nwebhooks:\n  paymentReceived:\n    post:\n      summary: Receive payment event\n      responses:\n        "200": {description: ok}\n'),
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
    const serious = results.violations.filter(violation => violation.impact === 'serious' || violation.impact === 'critical');
    const summary = serious.flatMap(item => item.nodes.map(node => `${item.id}: ${node.html}`)).join('\n');
    expect(serious, summary).toEqual([]);
});
