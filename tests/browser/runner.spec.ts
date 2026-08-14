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
                        {name: 'sort', in: 'query', schema: {type: 'string', enum: ['name', '-name']}},
                        {name: 'active', in: 'query', schema: {type: 'boolean'}},
                        {name: 'page', in: 'query', schema: {type: 'integer'}},
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
            '/media/{file_name}': {
                get: {
                    tags: ['Media'],
                    summary: 'Serve private media',
                    parameters: [{name: 'file_name', in: 'path', required: true, schema: {type: 'string'}}],
                    responses: {'401': {description: 'Unauthorized', content: {'application/json': {}}}},
                },
            },
            '/exports/report': {
                get: {
                    tags: ['Reports'],
                    summary: 'Download report',
                    responses: {
                        '200': {
                            description: 'PDF report',
                            content: {'application/pdf': {schema: {type: 'string', format: 'binary'}}},
                        },
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

const richRunnerSpecText = () =>
    JSON.stringify({
        openapi: '3.1.1',
        info: {title: 'Rich Runner Fields', version: '1'},
        paths: {
            '/forms': {
                post: {
                    summary: 'Edit rich runner form',
                    parameters: [
                        {
                            name: 'state',
                            in: 'query',
                            description:
                                '#### Available values\n\n| Value | Case |\n|---|---|\n| active | ACTIVE |\n| paused | PAUSED |',
                            schema: {type: 'string', enum: ['active', 'paused']},
                        },
                    ],
                    requestBody: {$ref: '#/components/requestBodies/RichBody'},
                    responses: {'200': {description: 'OK'}},
                },
            },
        },
        components: {
            requestBodies: {
                RichBody: {
                    content: {
                        'application/json': {
                            schema: {$ref: '#/components/schemas/RichBody'},
                        },
                    },
                },
            },
            schemas: {
                UUID: {
                    type: 'string',
                    format: 'uuid',
                    description:
                        'A reusable **UUID schema**. Read the [RFC reference](https://example.com/rfc4122) before sending it.',
                    externalDocs: {description: 'RFC 4122 documentation', url: 'https://example.com/rfc4122'},
                    example: '123e4567-e89b-12d3-a456-426614174000',
                },
                RichBody: {
                    type: 'object',
                    required: ['avatar_volume'],
                    properties: {
                        avatar_volume: {
                            $ref: '#/components/schemas/UUID',
                            description: 'UUID of the temporary volume containing the avatar image.',
                        },
                        gender: {
                            description:
                                '#### Available values\n\n| Value | Case |\n|---|---|\n| male | MALE |\n| female | FEMALE |',
                            type: 'string',
                            enum: ['male', 'female'],
                        },
                        many_choices: {
                            description: 'A long enum used to exercise scrollable custom menus.',
                            type: 'string',
                            enum: Array.from({length: 24}, (_, index) => `choice-${index + 1}`),
                        },
                        players: {
                            type: 'array',
                            description: 'Players included in this request.',
                            items: {
                                type: 'object',
                                properties: {name: {type: 'string', description: 'Player display name.'}},
                            },
                        },
                    },
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
        if (request.method === 'GET' && request.url === '/remote-spec.json') {
            response.statusCode = 200;
            response.setHeader('content-type', 'application/json');
            response.setHeader('etag', '"remote-browser-fixture"');
            response.end(specText());
            return;
        }
        if (request.method === 'GET' && request.url === '/exports/report') {
            const payload = Buffer.from('%PDF-1.7\nOpenDoc binary fixture\n%%EOF');
            requestCount += 1;
            response.statusCode = 200;
            response.setHeader('content-type', 'application/pdf');
            response.setHeader('content-disposition', 'attachment; filename="report.pdf"');
            response.setHeader('content-length', String(payload.byteLength));
            response.setHeader('access-control-expose-headers', 'Content-Disposition, Content-Length');
            response.end(payload);
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

async function readIndexedDbRecord(page: Page, key: string): Promise<unknown> {
    return page.evaluate(
        recordKey =>
            new Promise(resolve => {
                const open = indexedDB.open('opendoc-ui');
                open.onerror = () => resolve(null);
                open.onsuccess = () => {
                    const request = open.result
                        .transaction('records', 'readonly')
                        .objectStore('records')
                        .get(recordKey);
                    request.onerror = () => resolve(null);
                    request.onsuccess = () => resolve(request.result?.value ?? null);
                };
            }),
        key,
    );
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
    const clearHistoryDialog = page.getByRole('dialog');
    const confirmModalRoot = page.locator('[data-confirm-modal-root]');
    await expect(clearHistoryDialog).toContainText('Clear response history?');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    expect(
        await confirmModalRoot.evaluate(element => {
            const rect = element.getBoundingClientRect();
            return {
                parentIsBody: element.parentElement === document.body,
                fillsViewport:
                    Math.abs(rect.top) <= 1 &&
                    Math.abs(rect.left) <= 1 &&
                    Math.abs(rect.right - window.innerWidth) <= 1 &&
                    Math.abs(rect.bottom - window.innerHeight) <= 1,
            };
        }),
    ).toEqual({parentIsBody: true, fillsViewport: true});
    await page.getByRole('button', {name: 'Clear history'}).click();
    await expect(restoredHistory).toBeHidden();
    await page.reload();
    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    await page.getByRole('button', {name: /API Runner/i}).click();
    await expect(page.getByRole('button', {name: 'Response history'})).toHaveCount(0);
});

test('uses shared rich field descriptions, enum cases, focus frames, and array action leaders', async ({page}) => {
    await page.goto('/');
    await page
        .getByRole('button', {name: /open specification/i})
        .first()
        .click();
    const chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: /open specification file/i}).click();
    const chooser = await chooserPromise;
    await chooser.setFiles({
        name: 'rich-runner-fields.json',
        mimeType: 'application/json',
        buffer: Buffer.from(richRunnerSpecText()),
    });
    await page.getByText('Edit rich runner form', {exact: true}).first().click();
    await page.getByRole('button', {name: /API Runner/i}).click();

    const stateFrame = page.getByRole('group', {name: 'state parameter field'});
    await expect(stateFrame).toBeVisible();
    await expect(page.getByText('Available values', {exact: true})).toHaveCount(0);
    await stateFrame.click({position: {x: 10, y: 10}});
    await expect(stateFrame).toHaveAttribute('data-runner-field-active', 'true');
    await page.getByRole('button', {name: 'state documented values'}).click();
    await expect(page.getByRole('option', {name: /active ACTIVE/i})).toBeVisible();
    await expect(page.getByRole('option', {name: /paused PAUSED/i})).toBeVisible();
    await page.keyboard.press('Escape');

    const avatarInfo = page.getByRole('button', {name: 'Show avatar_volume description'});
    await avatarInfo.click();
    const descriptionTooltip = page.getByRole('tooltip');
    await expect(descriptionTooltip).toContainText('UUID of the temporary volume');
    await expect(descriptionTooltip).toContainText('UUID schema');
    await expect(descriptionTooltip.getByRole('link', {name: 'RFC reference'})).toHaveAttribute(
        'href',
        'https://example.com/rfc4122',
    );
    await expect(descriptionTooltip.getByRole('button', {name: 'Close tooltip'})).toBeVisible();
    expect(await descriptionTooltip.evaluate(element => getComputedStyle(element).userSelect)).not.toBe('none');
    await descriptionTooltip.getByRole('button', {name: 'Inspect UUID'}).click();
    await expect(page.getByText('UUID', {exact: true}).first()).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', {name: 'gender documented values'}).click();
    await expect(page.getByRole('option', {name: /male MALE/i})).toBeVisible();
    await page.keyboard.press('Escape');

    const longEnum = page.getByRole('button', {name: 'many_choices documented values'});
    await longEnum.click();
    const scrollableMenu = page.getByRole('listbox');
    await scrollableMenu.evaluate(menu => {
        menu.scrollTop = menu.scrollHeight;
        menu.dispatchEvent(new Event('scroll'));
    });
    await expect(scrollableMenu).toBeVisible();
    await expect(longEnum).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('option', {name: 'choice-24', exact: true}).click();

    await page.getByRole('button', {name: 'Add item'}).click();
    const itemFrame = page.getByRole('group', {name: 'Item 1 field'});
    await expect(itemFrame).toBeVisible();
    await expect(itemFrame.getByRole('button', {name: 'Move item up'})).toBeVisible();
    await expect(itemFrame.getByRole('button', {name: 'Move item down'})).toBeVisible();
    await expect(itemFrame.getByRole('button', {name: 'Remove item'})).toBeVisible();
    await expect(itemFrame.locator('.border-dashed')).toHaveCount(1);
    await itemFrame.click({position: {x: 80, y: 12}});
    await expect(itemFrame).toHaveAttribute('data-runner-field-active', 'true');
    const activeGuideLines = page.locator('[data-runner-guide-active="true"]');
    await expect(activeGuideLines).not.toHaveCount(0);
    expect(
        await activeGuideLines.evaluateAll(lines => lines.every(line => line.className.includes('var(--primary)'))),
    ).toBe(true);

    await page.getByRole('button', {name: 'Raw JSON'}).click();
    await expect(page.getByText('json request body', {exact: false})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Prettify'})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Wrap'})).toHaveAttribute('aria-pressed', 'true');
    const toolbarGap = await page
        .getByRole('button', {name: 'Find'})
        .evaluate(button => parseFloat(getComputedStyle(button.parentElement!.parentElement!).columnGap));
    expect(toolbarGap).toBeGreaterThanOrEqual(6);
});

test('creates local Markdown notes and todos, auto-hides endpoints, and manages hidden endpoints', async ({page}) => {
    await loadSpecification(page);
    const sidebar = page.locator('[data-opendoc-sidebar]');
    const endpoint = sidebar.getByText('Send permissive validation request', {exact: true});
    await endpoint.click({button: 'right'});
    await page.getByRole('button', {name: 'Create local note'}).click();

    await page.getByRole('button', {name: 'Note type'}).click();
    await page.getByRole('option', {name: /^Todo/}).click();
    await page.getByPlaceholder('What needs to be done?').fill('Fix validation flow');
    await page.getByPlaceholder('Write Markdown…').fill('**Important:** verify the `400` response.');
    await page.getByRole('button', {name: /Butter.*12 tones/}).click();
    const colorDialog = page.getByRole('dialog', {name: 'Choose note color'});
    await expect(colorDialog.getByRole('button', {name: /note color$/})).toHaveCount(12);
    await colorDialog.getByRole('button', {name: 'Blue note color'}).click();
    await page.getByLabel('Offer to hide endpoint when all todos are done').check();
    await page.getByRole('button', {name: 'Create note', exact: true}).click();

    await endpoint.click();
    await expect(page.getByRole('button', {name: 'Open endpoint notes (1)'})).toBeVisible();
    await expect(sidebar.getByLabel('1 local notes')).toBeVisible();
    await page.getByRole('button', {name: 'Open endpoint notes (1)'}).click();
    const listDialog = page.getByRole('dialog', {name: 'Endpoint Notes'});
    await expect(listDialog).toContainText('Important:');
    await listDialog.locator('button').filter({hasText: 'Fix validation flow'}).first().click();
    const detailDialog = page.getByRole('dialog', {name: 'Fix validation flow'});
    await expect(detailDialog.locator('strong')).toContainText('Important:');
    await detailDialog.getByRole('button', {name: 'Mark as done', exact: true}).click();
    const completionDialog = page.getByRole('dialog', {name: 'Complete todo and hide endpoint?'});
    const hideAfterCompletion = completionDialog.getByLabel('Hide endpoint after completion');
    await expect(hideAfterCompletion).toBeChecked();
    await hideAfterCompletion.uncheck();
    await completionDialog.getByRole('button', {name: 'Mark as done'}).click();
    await expect(sidebar.getByText('Hidden endpoints', {exact: true})).toHaveCount(0);
    await detailDialog.getByRole('button', {name: 'Mark as not done'}).click();
    await detailDialog.getByRole('button', {name: 'Mark as done', exact: true}).click();
    await expect(
        page
            .getByRole('dialog', {name: 'Complete todo and hide endpoint?'})
            .getByLabel('Hide endpoint after completion'),
    ).toBeChecked();
    await page
        .getByRole('dialog', {name: 'Complete todo and hide endpoint?'})
        .getByRole('button', {name: 'Mark as done'})
        .click();
    await detailDialog.getByRole('button', {name: 'Close Fix validation flow'}).click();
    await page.getByRole('dialog', {name: 'Endpoint Notes'}).getByRole('button', {name: 'Close', exact: true}).click();

    await expect(sidebar.getByText('Hidden endpoints', {exact: true})).toBeVisible();
    await sidebar.getByRole('button', {name: 'Navigation settings'}).click();
    await page.getByRole('menuitem', {name: /Unhide all endpoints/}).click();
    await expect(sidebar.getByText('Hidden endpoints', {exact: true})).toHaveCount(0);

    await endpoint.dispatchEvent('contextmenu', {button: 2, clientX: 120, clientY: 220});
    await page.getByRole('button', {name: 'Hide endpoint'}).click();
    await expect(sidebar.getByText('Hidden endpoints', {exact: true})).toBeVisible();
    await sidebar
        .getByText('Send permissive validation request', {exact: true})
        .dispatchEvent('contextmenu', {button: 2, clientX: 120, clientY: 520});
    await page.getByRole('button', {name: 'Unhide endpoint'}).click();
    await expect(sidebar.getByText('Hidden endpoints', {exact: true})).toHaveCount(0);

    await sidebar.getByRole('button', {name: /Local Notes/}).click();
    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByRole('heading', {name: 'Local Notes', exact: true})).toBeVisible();
    await expect(page.getByText('Fix validation flow', {exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Mark todo as not done'})).toHaveAttribute('aria-pressed', 'true');
    await page.getByText(/verify the 400 response/i).click();
    await expect(page.getByRole('dialog', {name: 'Fix validation flow'})).toBeVisible();
    await page.getByRole('button', {name: 'Close Fix validation flow'}).click();

    await page.getByRole('button', {name: 'New note', exact: true}).click();
    const endpointSearch = page.getByPlaceholder('Search endpoints…');
    await endpointSearch.fill('Serve private media');
    await page.getByRole('button', {name: /Serve private media/}).click();
    await page.getByPlaceholder('Short note title').fill('Reference note');
    await page.getByPlaceholder('Write Markdown…').fill('[Read the docs](https://example.com/docs).');
    await page.getByRole('button', {name: 'Create note', exact: true}).click();
    await expect(page.getByText('Reference note', {exact: true})).toBeVisible();
    await page.getByText('Reference note', {exact: true}).click();
    await expect(
        page.getByRole('dialog', {name: 'Reference note'}).getByRole('link', {name: 'Read the docs'}),
    ).toHaveAttribute('href', 'https://example.com/docs');
    await page.getByRole('dialog', {name: 'Reference note'}).getByRole('button', {name: 'Delete'}).click();
    await page.getByRole('dialog', {name: 'Delete this note?'}).getByRole('button', {name: 'Delete note'}).click();
    await expect(page.getByText('Reference note', {exact: true})).toHaveCount(0);

    await page.getByRole('button', {name: 'Delete all'}).click();
    await page
        .getByRole('dialog', {name: 'Delete every local note?'})
        .getByRole('button', {name: 'Delete all notes'})
        .click();
    await expect(page.getByText('No local notes yet', {exact: true})).toBeVisible();
});

test('keeps endpoint context menus inside the available viewport', async ({page}) => {
    await page.setViewportSize({width: 1280, height: 430});
    await loadSpecification(page);
    const endpoint = page.locator('[data-opendoc-sidebar]').getByText('Export monthly report', {exact: true});
    await endpoint.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await endpoint.dispatchEvent('contextmenu', {button: 2, clientX: 190, clientY: 420});
    const menu = page.getByRole('menu', {name: 'Endpoint actions'});
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds?.y || 0).toBeGreaterThanOrEqual(8);
    expect((bounds?.y || 0) + (bounds?.height || 0)).toBeLessThanOrEqual(422);
});

test('preserves local notes during specification reset unless the notes checkbox is selected', async ({page}) => {
    await loadSpecification(page);
    const endpoint = page
        .locator('[data-opendoc-sidebar]')
        .getByText('Send permissive validation request', {exact: true});
    await endpoint.click({button: 'right'});
    await page.getByRole('button', {name: 'Create local note'}).click();
    await page.getByPlaceholder('Short note title').fill('Persistent reset note');
    await page.getByPlaceholder('Write Markdown…').fill('Keep this note after reset.');
    await page.getByRole('button', {name: 'Create note', exact: true}).click();

    await page.locator('.app-topbar').getByText('Browser Runner Fixture', {exact: true}).click();
    await page.getByRole('button', {name: 'Reset saved configuration for Browser Runner Fixture'}).click();
    const clearNotes = page.getByLabel('Clear local notes too');
    await expect(clearNotes).not.toBeChecked();
    await page.getByRole('button', {name: 'Reset configuration'}).click();
    await expect(page.locator('.app-topbar').getByText('Browser Runner Fixture', {exact: true})).toBeVisible();
    await page
        .locator('[data-opendoc-sidebar]')
        .getByRole('button', {name: /Local Notes/})
        .click();
    await expect(page.getByText('Persistent reset note', {exact: true})).toBeVisible();

    await page.locator('.app-topbar').getByText('Browser Runner Fixture', {exact: true}).click();
    await page.getByRole('button', {name: 'Reset saved configuration for Browser Runner Fixture'}).click();
    await page.getByLabel('Clear local notes too').check();
    await page.getByRole('button', {name: 'Reset configuration'}).click();
    await expect(page.locator('.app-topbar').getByText('Browser Runner Fixture', {exact: true})).toBeVisible();
    await page
        .locator('[data-opendoc-sidebar]')
        .getByRole('button', {name: /Local Notes/})
        .click();
    await expect(page.getByText('No local notes yet', {exact: true})).toBeVisible();
});

test('validates note title and Markdown limits without blocking typing or pasting', async ({page}) => {
    await loadSpecification(page);
    const endpoint = page
        .locator('[data-opendoc-sidebar]')
        .getByText('Send permissive validation request', {exact: true});
    await endpoint.click({button: 'right'});
    await page.getByRole('button', {name: 'Create local note'}).click();
    await expect(page.getByPlaceholder('Search endpoints…')).toBeVisible();
    await expect(page.getByText('General', {exact: true}).first()).toBeVisible();

    const title = page.getByPlaceholder('Short note title');
    const content = page.getByPlaceholder('Write Markdown…');
    await title.fill('T'.repeat(129));
    await content.fill('C'.repeat(4097));
    await expect(title).toHaveValue('T'.repeat(129));
    await expect(content).toHaveValue('C'.repeat(4097));
    await expect(title).toHaveAttribute('aria-invalid', 'true');
    await expect(content).toHaveAttribute('aria-invalid', 'true');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('title is 1 character over');
    await expect(alert).toContainText('Markdown content is 1 character over');
    await expect(page.getByText('1 over', {exact: true})).toHaveCount(2);
    await expect(page.locator('.h-1.w-16')).toHaveCount(2);
    await expect(page.locator('.max-h-72.overflow-y-auto')).toBeVisible();
    await page.getByRole('button', {name: 'Create note', exact: true}).click();
    await expect(page.getByRole('dialog', {name: 'Create Note'})).toBeVisible();

    await title.fill('Valid title without details');
    await content.fill('');
    await page.getByRole('button', {name: 'Create note', exact: true}).click();
    await endpoint.click();
    await expect(page.getByRole('button', {name: 'Open endpoint notes (1)'})).toBeVisible();
});

test('offers typed parameter suggestions without blocking custom negative-test values', async ({page}) => {
    await loadSpecification(page);
    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    await page.getByRole('button', {name: /API Runner/i}).click();
    const runner = page.locator('form');

    const sort = runner.getByRole('button', {name: 'sort documented values'});
    await sort.click();
    await page.getByRole('option', {name: 'name', exact: true}).click();
    await expect(sort).toContainText('name');
    await sort.click();
    await page.getByRole('option', {name: 'Custom value…', exact: true}).click();
    const customSort = runner.getByRole('textbox', {name: 'sort custom value'});
    await expect(customSort).toBeFocused();
    await customSort.fill('unsupported-sort');
    await expect(customSort).toHaveValue('unsupported-sort');

    const active = runner.getByRole('button', {name: 'active documented values'});
    await active.click();
    await page.getByRole('option', {name: 'false', exact: true}).click();
    await expect(active).toContainText('false');

    const pageNumber = runner.getByRole('textbox', {name: 'page value'});
    await expect(pageNumber).toHaveAttribute('inputmode', 'numeric');
    await pageNumber.fill('not-a-number');
    await expect(pageNumber).toHaveValue('not-a-number');
});

test('cancels binary response streams without triggering a browser download', async ({page}) => {
    await loadSpecification(page);
    await page.getByText('Download report', {exact: true}).first().click();
    await page.getByRole('button', {name: /API Runner/i}).click();
    let downloadCount = 0;
    page.on('download', download => {
        downloadCount += 1;
        void download.cancel();
    });
    const runner = page.locator('form');
    await runner.getByRole('button', {name: /Send API Request/i}).click();
    await expect(runner.getByText('200', {exact: true})).toBeVisible();
    await expect(runner.getByText(/Binary response omitted from preview/)).toBeVisible();
    await expect(runner).toContainText('no file was saved');
    await expect(runner.getByText('RUN_BINARY_RESPONSE_BODY_CANCELLED')).toBeVisible();
    await page.waitForTimeout(200);
    expect(downloadCount).toBe(0);
});

test('copies both the endpoint path and the selected-server full URL', async ({page}) => {
    await loadSpecification(page);
    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    await page.evaluate(() => {
        (window as any).__copiedEndpoint = '';
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {writeText: async (value: string) => ((window as any).__copiedEndpoint = value)},
        });
    });
    await page.getByRole('button', {name: 'Copy endpoint path'}).click();
    await expect.poll(() => page.evaluate(() => (window as any).__copiedEndpoint)).toBe('/validate/{id}');
    await page.getByRole('button', {name: 'Copy full endpoint URL'}).click();
    await expect.poll(() => page.evaluate(() => (window as any).__copiedEndpoint)).toBe(`${apiOrigin}/validate/{id}`);
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

test('migrates legacy localStorage state once and keeps IndexedDB as the primary store', async ({page}) => {
    await page.addInitScript(() => localStorage.setItem('sidebar_width', '312'));
    await page.goto('/');
    await expect.poll(async () => await readIndexedDbRecord(page, 'storage:opendoc:ui:sidebar_width')).toBe('312');
    expect(
        await page.evaluate(() => ({
            legacy: localStorage.getItem('sidebar_width'),
            current: localStorage.getItem('opendoc:ui:sidebar_width'),
        })),
    ).toEqual({legacy: null, current: null});
});

test('treats clean endpoint deep links as source of truth and opens a permanent tab', async ({page}) => {
    await loadSpecification(page);
    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    await expect(page).toHaveURL(/\/parsable\/.*\/api\//);
    const endpointUrl = page.url();
    expect(endpointUrl).not.toContain('#/');
    await expect.poll(async () => Boolean(await readIndexedDbRecord(page, 'storage:opendoc_local_history'))).toBe(true);
    expect(
        await page.evaluate(() => Object.keys(localStorage).filter(key => key.toLowerCase().startsWith('opendoc'))),
    ).toEqual([]);
    await page.getByRole('button', {name: /Close Send permissive validation request/i}).click();
    await page.goto(endpointUrl);
    await expect(page.getByText('Send permissive validation request', {exact: true}).first()).toBeVisible();
    await expect(page.locator('[data-tab-id="post:/validate/{id}"]')).toHaveAttribute('data-tab-preview', 'false');
});

test('pushes workspace navigation and restores every view with browser Back and Forward', async ({page}) => {
    await loadSpecification(page);
    await page.getByText('Send permissive validation request', {exact: true}).first().click();
    const validationUrl = page.url();
    await expect(page).toHaveURL(/\/api\//);

    await page.getByText('Serve private media', {exact: true}).first().click();
    const mediaUrl = page.url();
    expect(mediaUrl).not.toBe(validationUrl);

    await page.getByRole('button', {name: /Schema Explorer/i}).click();
    await expect(page).toHaveURL(/\/schema-explorer$/);
    await page.getByText('Tiny', {exact: true}).first().click();
    await expect(page).toHaveURL(/\/schema-explorer\?schemas=Tiny$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/schema-explorer$/);
    await expect(page.locator('.modal-surface')).toHaveCount(0);
    await page.locator('[data-nav-view="view:notes"]').click();
    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByRole('heading', {name: 'Local Notes', exact: true})).toBeVisible();
    await page.locator('[data-nav-view="view:home"]').click();
    await expect(page).toHaveURL(/\/parsable\/[^/?#]+$/);
    await page.getByRole('button', {name: 'Open Runner Compatibility'}).click();
    await expect(page).toHaveURL(/\/compatibility$/);

    await page.getByRole('button', {name: 'Back to Overview'}).click();
    await expect(page).toHaveURL(/\/parsable\/[^/?#]+$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/compatibility$/);
    await expect(page.getByRole('heading', {name: 'Runner Compatibility'})).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/parsable\/[^/?#]+$/);
    await expect(page.locator('[data-specification-statistics]')).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/notes$/);
    await expect(page.getByRole('heading', {name: 'Local Notes', exact: true})).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/schema-explorer$/);
    await expect(page.getByRole('heading', {name: 'Schema Explorer'})).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(mediaUrl);
    await expect(page.locator('[data-tab-id="get:/media/{file_name}"]')).toHaveAttribute('data-tab-preview', 'false');
    await page.goBack();
    await expect(page).toHaveURL(validationUrl);
    await expect(page.locator('[data-tab-id="post:/validate/{id}"]')).toHaveAttribute('data-tab-preview', 'false');
    await page.goForward();
    await expect(page).toHaveURL(mediaUrl);
    await expect(page.getByText('Serve private media', {exact: true}).first()).toBeVisible();
});

test('anchors configured specs to the app root across clean deep links, reloads, and browser history', async ({
    page,
}) => {
    const configRequests: string[] = [];
    const specificationRequests: string[] = [];
    const configuredSpec = JSON.stringify({
        openapi: '3.1.1',
        info: {title: 'Deep Link Config API', version: '1'},
        paths: {
            '/deep': {
                get: {
                    operationId: 'listDeep',
                    summary: 'List deep-link records',
                    responses: {'200': {description: 'OK'}},
                },
            },
        },
    });
    await page.route('**/config.json', async route => {
        configRequests.push(new URL(route.request().url()).pathname);
        await route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
                parsables: {
                    configured: {
                        title: 'Deep Link Config API',
                        url: 'fixtures/deep.json',
                    },
                },
            }),
        });
    });
    await page.route('**/fixtures/deep.json', async route => {
        specificationRequests.push(new URL(route.request().url()).pathname);
        await route.fulfill({contentType: 'application/json', body: configuredSpec});
    });

    const deepLink = '/parsable/configured/api/listDeep';
    await page.goto(deepLink);
    await expect(page.getByText('List deep-link records', {exact: true}).first()).toBeVisible();
    await expect(page.locator('[data-tab-id="get:/deep"]')).toHaveAttribute('data-tab-preview', 'false');
    await page.reload();
    await expect(page.getByText('List deep-link records', {exact: true}).first()).toBeVisible();

    await page.goto('/');
    await expect(page.getByText('Deep Link Config API', {exact: true}).first()).toBeVisible();
    await page.goBack();
    await expect(page.getByText('List deep-link records', {exact: true}).first()).toBeVisible();
    expect(new Set(configRequests)).toEqual(new Set(['/config.json']));
    expect(new Set(specificationRequests)).toEqual(new Set(['/fixtures/deep.json']));
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
    await expect(page.locator('[data-tab-id="post:/validate/{id}"]')).toHaveAttribute('data-tab-preview', 'false');
    await expect(selected).not.toHaveClass(/ring-2/, {timeout: 2500});
});

test('renders the embedded Apple sprite set without changing emoji inside code', async ({page}) => {
    await loadSpecification(page);
    await page.locator('[data-nav-view="view:home"]').click();
    await expect(page.locator('span.emoji[aria-label="🚀"]')).toHaveCount(1);
    await expect(page.locator('span.emoji[aria-label=":fire:"]')).toHaveCount(1);
    await expect(page.locator('span.emoji[aria-label="👩🏽‍💻"]')).toHaveCount(1);
    await expect(page.locator('span.emoji[aria-label="🫩"]')).toHaveCount(1);
    await expect
        .poll(() =>
            page.locator('span.emoji[aria-label="🚀"]').evaluate(element => getComputedStyle(element).backgroundImage),
        )
        .toContain('data:image/png;base64,');
    await expect(page.locator('code').filter({hasText: '🚀'})).toBeVisible();
});

test('reports specification-wide Runner compatibility and undeclared binary uncertainty', async ({page}) => {
    await loadSpecification(page);
    await page.locator('[data-nav-view="view:home"]').click();
    await expect(page.locator('[data-specification-statistics]')).toContainText('Operations by method');
    await expect(page.getByText('Operations', {exact: true})).toHaveCount(1);
    const report = page.locator('[data-runner-compatibility-report]');
    await expect(report).toBeVisible();
    await expect(report).toContainText('Runner Compatibility');
    await expect(report).toContainText('No successful response is declared');
    await expect(report).toContainText('Declared binary or attachment responses');
    await expect(report).toContainText('/media/{file_name}');
    await expect(report).toContainText('/exports/report');

    await page.getByRole('button', {name: 'Open Runner Compatibility'}).click();
    await expect(page).toHaveURL(/\/compatibility$/);
    await expect(page.getByRole('heading', {name: 'Runner Compatibility'})).toBeVisible();
    await expect(page.locator('[data-compatibility-statistics]')).toBeVisible();
    await expect(page.locator('[data-nav-view="view:home"]')).toHaveAttribute('aria-current', 'page');
    const matrix = page.getByRole('table');
    await expect(matrix.getByRole('row')).toHaveCount(7);
    await expect(matrix.getByRole('columnheader').first()).toHaveText('#');
    await expect(matrix.getByRole('row').nth(1).getByRole('cell').first()).toHaveText('1');
    await expect(matrix).toContainText('/media/{file_name}');
    await expect(matrix).toContainText('C · 60');
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

    await page.goBack();
    await expect(page.locator('.app-topbar').getByText('Bundled Demo API', {exact: true})).toBeVisible();
    await page.goForward();
    await expect(page.locator('.app-topbar').getByText('My Local Hybrid API', {exact: true})).toBeVisible();
    await page.goBack();
    await expect(page.locator('.app-topbar').getByText('Bundled Demo API', {exact: true})).toBeVisible();
    await expect(page.locator('[data-specification-statistics]')).toBeVisible();
    await page.goForward();
    await expect(page.locator('.app-topbar').getByText('My Local Hybrid API', {exact: true})).toBeVisible();
    await expect(page.locator('[data-specification-statistics]')).toBeVisible();

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
    await expect(page).toHaveURL(/\/parsable\/remote%3A/);

    await page.locator('.app-topbar').getByText('Browser Runner Fixture', {exact: true}).click();
    await expect(page.getByText('Recent URLs · 1', {exact: true})).toBeVisible();
    await expect(page.getByText(`${apiOrigin}/remote-spec.json`, {exact: true})).toBeVisible();
    await page.getByRole('button', {name: 'Cancel'}).click();

    await page.reload();
    await expect(page.locator('.app-topbar').getByText('Browser Runner Fixture', {exact: true})).toBeVisible();
    await expect(page).toHaveURL(/\/parsable\/remote%3A/);
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

test('shows one informational cookie authorization note without Runner cookie warnings', async ({page}) => {
    await page.addInitScript(() => {
        window.INITIAL_CONFIG = {
            parsables: {
                'cookie-api': {
                    title: 'Cookie API',
                    isCustom: true,
                    rawSpec: JSON.stringify({
                        openapi: '3.1.1',
                        info: {title: 'Cookie API', version: '1'},
                        security: [{session: []}],
                        paths: {'/session': {get: {summary: 'Get session', responses: {'200': {description: 'ok'}}}}},
                        components: {securitySchemes: {session: {type: 'apiKey', in: 'cookie', name: 'session'}}},
                    }),
                },
            },
        };
    });
    await page.goto('/');
    await page.getByText('Get session', {exact: true}).first().click();
    await page.getByRole('button', {name: /API Runner/i}).click();
    await expect(page.getByText(/uses browser-managed cookies for authorization/i)).toBeVisible();
    await expect(page.getByText(/Browser fetch cannot inject/i)).toHaveCount(0);
});

test('offers native OAuth authorization-code PKCE setup from OpenAPI security flows', async ({page}) => {
    await page.addInitScript(() => {
        window.INITIAL_CONFIG = {
            parsables: {
                'oauth-api': {
                    title: 'OAuth API',
                    isCustom: true,
                    rawSpec: JSON.stringify({
                        openapi: '3.1.1',
                        info: {title: 'OAuth API', version: '1'},
                        security: [{oauth: ['read']}],
                        paths: {'/me': {get: {responses: {'200': {description: 'ok'}}}}},
                        components: {
                            securitySchemes: {
                                oauth: {
                                    type: 'oauth2',
                                    flows: {
                                        authorizationCode: {
                                            authorizationUrl: 'https://auth.example.test/authorize',
                                            tokenUrl: 'https://auth.example.test/token',
                                            scopes: {read: 'Read profile'},
                                        },
                                    },
                                },
                            },
                        },
                    }),
                },
            },
        };
    });
    await page.goto('/');
    await expect(page.getByText('OAuth API', {exact: true}).first()).toBeVisible();
    await page.getByRole('button', {name: /Authorize/i}).click();
    const clientId = page.getByPlaceholder(/Client ID registered/);
    await expect(clientId).toBeVisible();
    await clientId.fill('public-docs-client');
    await expect(page.getByRole('button', {name: /Authorize with OAuth \+ PKCE/i})).toBeVisible();
    await expect(page.getByPlaceholder('read')).toHaveValue('');
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

test('highlights schema search matches and the selected first-letter filter', async ({page}) => {
    await loadSpecification(page);
    await page.getByRole('button', {name: /Schema Explorer/i}).click();
    const search = page.getByPlaceholder(/Search schemas/);
    await search.fill('Tiny');
    await expect(page.locator('mark').filter({hasText: 'Tiny'}).first()).toBeVisible();
    await search.fill('');
    await page.getByRole('button', {name: 'T', exact: true}).click();
    await expect(page.locator('mark').filter({hasText: 'T'}).first()).toBeVisible();
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

test('keeps unresolved external references scoped and lets users add the missing file', async ({page}) => {
    await page.goto('/');
    await page
        .getByRole('button', {name: /open specification/i})
        .first()
        .click();
    let chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: /open specification file/i}).click();
    let chooser = await chooserPromise;
    await chooser.setFiles('tests/fixtures/external-label-root.json');
    await expect(page.getByText('Labels & Stamps API', {exact: true}).first()).toBeVisible();

    await page.getByText('Create a shipping label', {exact: true}).first().click();
    await expect(page.getByRole('heading', {name: 'OpenDoc UI needs to recover'})).toHaveCount(0);

    await page.getByRole('button', {name: /Schema Explorer/i}).click();
    await page.getByText('Label', {exact: true}).first().click();
    await expect(page.getByText('Referenced schema is unavailable')).toBeVisible();
    await expect(page.getByRole('heading', {name: 'OpenDoc UI needs to recover'})).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.locator('[data-nav-view="view:home"]').click();
    await page.getByRole('button', {name: 'Open Runner Compatibility'}).click();
    await expect(page.getByText(/label-base\.json/).first()).toBeVisible();
    await expect(page.getByRole('table')).toContainText('D · 35');
    chooserPromise = page.waitForEvent('filechooser');
    await page.getByRole('button', {name: 'Add referenced files'}).first().click();
    chooser = await chooserPromise;
    await chooser.setFiles('tests/fixtures/label-base.json');
    await expect(page.getByText('Labels & Stamps API', {exact: true}).first()).toBeVisible();

    await page.getByText('Create a shipping label', {exact: true}).first().click();
    await expect(page.getByText('shipmentId', {exact: true}).first()).toBeVisible();
    await expect(page.getByRole('heading', {name: 'OpenDoc UI needs to recover'})).toHaveCount(0);
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
    await page.locator('[data-nav-view="view:home"]').click();
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
