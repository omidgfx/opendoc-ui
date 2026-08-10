import assert from 'node:assert/strict';
import {AIStreamError, fetchProviderModelCatalog, streamAIResponse} from '../src/utils/aiProviders';
import {executeRunnerRequest} from '../src/utils/runnerExecution';
import type {AISettings} from '../src/types';
import {dereference, validate} from '@scalar/openapi-parser';
import {processLocalOpenApiBundle} from '../src/utils/openapi/engine';
import {clearCachedSpec, fetchSpec, writeCachedSpec} from '../src/utils/specCache';
import {parseSpecDraft} from '../src/utils/appSpec';
const originalFetch = globalThis.fetch;
const settings: AISettings = {
    transport: 'direct',
    gatewayUrl: '',
    gatewayToken: '',
    provider: 'custom',
    model: 'fixture',
    apiKey: '',
    baseUrl: 'https://fixture.test/v1',
    temperature: 0.2,
    skillPacks: ['openapi'],
    customInstructions: '',
};
try {
    globalThis.fetch = (async () =>
        new Response(
            'data: this is a provider comment\n\n' +
                'data: {"error":{"message":"context window exceeded","code":"context_length_exceeded","status":400,"provider":"fixture","model":"fixture-model"}}\n\n',
            {status: 200, headers: {'content-type': 'text/event-stream'}},
        )) as typeof fetch;
    await assert.rejects(streamAIResponse(settings, [{role: 'user', content: 'hello'}]), error => {
        assert.ok(error instanceof AIStreamError);
        assert.equal(error.message, 'context window exceeded');
        assert.equal(error.code, 'context_length_exceeded');
        assert.equal(error.status, 400);
        assert.equal(error.provider, 'fixture');
        assert.equal(error.model, 'fixture-model');
        return true;
    });
    console.log('✓ propagates structured provider errors from SSE streams');
    globalThis.fetch = (async () =>
        new Response(
            JSON.stringify({
                error: {message: 'rate limited', code: 'rate_limit', provider: 'fixture', model: 'fixture-model'},
            }),
            {status: 429, statusText: 'Too Many Requests', headers: {'content-type': 'application/json'}},
        )) as typeof fetch;
    await assert.rejects(streamAIResponse(settings, [{role: 'user', content: 'hello'}]), error => {
        assert.ok(error instanceof AIStreamError);
        assert.equal(error.message, 'rate limited');
        assert.equal(error.code, 'rate_limit');
        assert.equal(error.status, 429);
        return true;
    });
    console.log('✓ preserves structured non-streaming provider errors');
    let requestBody: unknown;
    globalThis.fetch = (async (_input, init) => {
        requestBody = JSON.parse(String(init?.body || '{}'));
        return new Response(
            JSON.stringify({
                models: [{id: 'approved/model', label: 'Approved model · Premium', tier: 'premium'}],
                gateway: {clientModelSelection: false, provider: 'openrouter', model: 'approved/model'},
            }),
            {status: 200, headers: {'content-type': 'application/json'}},
        );
    }) as typeof fetch;
    const catalog = await fetchProviderModelCatalog({
        ...settings,
        transport: 'gateway',
        gatewayUrl: 'https://gateway.example.com/api/ai',
        gatewayToken: 'token',
        model: 'stale/client-model',
    });
    assert.deepEqual(requestBody, {});
    assert.equal(catalog.gateway?.provider, 'openrouter');
    assert.equal(catalog.gateway?.model, 'approved/model');
    assert.equal(catalog.gateway?.clientModelSelection, false);
    assert.deepEqual(
        catalog.models.map(model => model.id),
        ['approved/model'],
    );
    console.log('✓ discovers gateway-owned provider and model policy without submitting a client provider');
    const filesystem: any = [
        {
            dir: '',
            filename: 'root.yaml',
            isEntrypoint: true,
            references: ['paths.yaml'],
            specification: {
                openapi: '3.1.1',
                info: {title: 'External', version: '1'},
                paths: {'/users': {$ref: 'paths.yaml#/UserPath'}},
            },
        },
        {
            dir: '',
            filename: 'paths.yaml',
            isEntrypoint: false,
            references: [],
            specification: {UserPath: {get: {responses: {'200': {description: 'ok'}}}}},
        },
    ];
    const engineValidation = await validate(filesystem);
    assert.equal(engineValidation.valid, true);
    const resolvedGraph = dereference(filesystem);
    assert.equal((resolvedGraph.schema as any)?.paths?.['/users']?.get?.responses?.['200']?.description, 'ok');
    const oas32 = await validate({
        openapi: '3.2.0',
        info: {title: 'Query', version: '1'},
        paths: {'/search': {query: {responses: {'200': {description: 'ok'}}}}},
    });
    assert.equal(oas32.valid, true);
    console.log('✓ validates OAS 3.2 and resolves a multi-document Path Item graph with the parser engine');
    const localBundle = await processLocalOpenApiBundle([
        {
            name: 'api/root.yaml',
            raw: 'openapi: 3.1.1\ninfo: {title: Local Bundle, version: "1"}\npaths:\n  /users:\n    $ref: ./paths/users.yaml#/UserPath\n',
        },
        {
            name: 'api/paths/users.yaml',
            raw: 'UserPath:\n  get:\n    responses:\n      "200":\n        description: resolved locally\n',
        },
    ]);
    assert.equal(
        (localBundle.document.paths as any)['/users']?.get?.responses?.['200']?.description,
        'resolved locally',
    );
    assert.equal(localBundle.externalDocumentsLoaded, true);
    assert.ok(localBundle.diagnostics.some(item => item.code === 'OAS_LOCAL_BUNDLE_RESOLVED'));
    console.log('✓ resolves user-approved local multi-file references without network access');
    const cacheUrl = 'https://cache.example.test/openapi.yaml';
    const validCached = 'openapi: 3.1.1\ninfo: {title: Cached, version: "1"}\npaths: {}\n';
    const preCacheWindow = (globalThis as any).window;
    const memoryStorage = new Map<string, string>();
    (globalThis as any).window = {
        localStorage: {
            getItem: (key: string) => memoryStorage.get(key) ?? null,
            setItem: (key: string, value: string) => memoryStorage.set(key, value),
            removeItem: (key: string) => memoryStorage.delete(key),
        },
    };
    writeCachedSpec(cacheUrl, validCached);
    globalThis.fetch = (async () => new Response('this is not an OpenAPI document', {status: 200})) as typeof fetch;
    const originalWarn = console.warn;
    console.warn = () => undefined;
    const stale = await fetchSpec(cacheUrl, {force: true, validate: raw => parseSpecDraft(raw)});
    console.warn = originalWarn;
    assert.equal(stale.freshness, 'stale');
    assert.equal(stale.raw, validCached);
    assert.ok(stale.refreshError);
    await clearCachedSpec(cacheUrl);
    (globalThis as any).window = preCacheWindow;
    console.log('✓ preserves and identifies last-known-good cache when a fresh 200 response is malformed');
    const originalWindow = (globalThis as any).window;
    let runnerUrl = '';
    let runnerBody = '';
    (globalThis as any).window = {setTimeout, clearTimeout};
    globalThis.fetch = (async (input, init) => {
        runnerUrl = String(input);
        runnerBody = String(init?.body || '');
        return new Response('{"success":true,"data":{"ok":true}}', {
            status: 200,
            headers: {'content-type': 'application/json'},
        });
    }) as typeof fetch;
    const runnerResult = await executeRunnerRequest({
        spec: {
            openapi: '3.0.3',
            info: {title: 'Fixture', version: '1'},
            paths: {
                '/login': {
                    post: {
                        requestBody: {content: {'application/x-www-form-urlencoded': {schema: {type: 'object'}}}},
                        responses: {'200': {description: 'ok'}},
                    },
                },
            },
        } as any,
        path: '/login',
        method: 'post',
        operation: {
            requestBody: {content: {'application/x-www-form-urlencoded': {schema: {type: 'object'}}}},
            responses: {'200': {description: 'ok'}},
        },
        selectedServer: 'https://api.example.test',
        activeAuth: {
            activeScheme: 'none',
            selectedSchemes: [],
            schemeValues: {},
            cookieValues: {},
            bearerToken: '',
            apiKeyName: '',
            apiKeyValue: '',
            apiKeyIn: 'header',
            basicUsername: '',
            basicPassword: '',
        },
        body: JSON.stringify({mobile: '09356413497', password: 'password'}),
        bodyType: 'application/x-www-form-urlencoded',
    });
    assert.equal(runnerResult.status, 200);
    assert.equal(runnerUrl, 'https://api.example.test/login');
    assert.match(runnerBody, /mobile=09356413497/);
    assert.match(runnerBody, /password=password/);
    console.log('✓ executes a Runner action directly without navigating to the endpoint tab');
    (globalThis as any).window = originalWindow;
} finally {
    globalThis.fetch = originalFetch;
}
