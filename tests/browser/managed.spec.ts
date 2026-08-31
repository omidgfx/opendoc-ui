import {test, expect, type Page} from '@playwright/test';

const managedPolicy = {
    policyVersion: 1,
    mode: 'managed',
    ready: true,
    displayName: 'Acme Assistant',
    exposeModel: false,
    provider: null,
    model: null,
    clientModelSelection: false,
    allowedSkillPacks: ['openapi', 'rest-debugging', 'api-testing'],
    allowCustomInstructions: false,
    limits: {requestsPerMinute: 30},
    auth: 'ambient',
};

const sseResponse = (text: string) => ({
    status: 200,
    contentType: 'text/event-stream; charset=utf-8',
    body: `data: ${JSON.stringify({choices: [{delta: {content: text}}]})}\n\ndata: [DONE]\n\n`,
});

const fixtureSpec = () =>
    JSON.stringify({
        openapi: '3.1.1',
        info: {title: 'Managed AI Fixture', version: '1'},
        servers: [{url: 'https://api.example.com'}],
        paths: {
            '/widgets': {
                get: {
                    summary: 'List widgets',
                    responses: {'200': {description: 'OK'}},
                },
            },
        },
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
        name: 'managed-fixture.json',
        mimeType: 'application/json',
        buffer: Buffer.from(fixtureSpec()),
    });
    await expect(page.getByText('Managed AI Fixture', {exact: true}).first()).toBeVisible();
}

test('managed AI works with zero profiles and never exposes settings or model identity', async ({page}) => {
    await page.route('**/api/ai/policy', route =>
        route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(managedPolicy)}),
    );
    await page.route('**/api/ai/chat', route => route.fulfill(sseResponse('Managed answer: it just works.')));
    await loadSpecification(page);

    // Assistant opens without any profile creation.
    await page.getByRole('button', {name: 'Open AI Assistant'}).click();
    await expect(page.getByRole('heading', {name: 'Acme Assistant'})).toBeVisible();
    await expect(page.getByText('Provided by your organization').first()).toBeVisible();

    // No AI settings affordances anywhere in the assistant.
    await expect(page.getByRole('button', {name: /AI settings/i})).toHaveCount(0);
    await expect(page.getByRole('button', {name: /Configure a provider/i})).toHaveCount(0);

    // A question streams an answer with no credentials attached by the client.
    let chatAuthorization = 'absent';
    let chatModel: string | undefined;
    await page.route('**/api/ai/chat', async route => {
        const request = route.request();
        chatAuthorization = request.headers()['authorization'] ?? 'absent';
        chatModel = (request.postDataJSON() as {model?: string} | null)?.model;
        await route.fulfill(sseResponse('Managed answer: it just works.'));
    });
    await page
        .getByPlaceholder('Ask about endpoints, schemas, auth, errors, or API workflows…')
        .fill('How do I list widgets?');
    await page.getByPlaceholder('Ask about endpoints, schemas, auth, errors, or API workflows…').press('Enter');
    await expect(page.getByText('Managed answer: it just works.').first()).toBeVisible();
    expect(chatAuthorization).toBe('absent');
    expect(chatModel === undefined || chatModel === '').toBe(true);

    // The assistant never surfaces a settings affordance, even after chatting.
    await expect(page.getByRole('button', {name: /AI settings/i})).toHaveCount(0);
});

test('without a managed backend the classic create-profile state remains', async ({page}) => {
    await page.route('**/api/ai/policy', route => route.fulfill({status: 404, body: 'not found'}));
    await loadSpecification(page);
    await page.getByRole('button', {name: 'Open AI Assistant'}).click();
    await expect(page.getByText('Create an AI profile')).toBeVisible();
    await expect(page.getByRole('button', {name: /Create profile/i})).toBeVisible();
});

test('a not-ready managed backend shows the starting-up state without a config CTA', async ({page}) => {
    await page.route('**/api/ai/policy', route =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({...managedPolicy, ready: false}),
        }),
    );
    await loadSpecification(page);
    await page.getByRole('button', {name: 'Open AI Assistant'}).click();
    await expect(page.getByText('AI is starting up')).toBeVisible();
    await expect(page.getByRole('button', {name: /Create profile/i})).toHaveCount(0);
});
