import assert from 'node:assert/strict';
import {AIStreamError, fetchProviderModelCatalog, streamAIResponse} from '../src/utils/aiProviders';
import type {AISettings} from '../src/types';

const originalFetch = globalThis.fetch;
const settings: AISettings = {
    transport: 'direct', gatewayUrl: '', gatewayToken: '', provider: 'custom', model: 'fixture', apiKey: '', baseUrl: 'https://fixture.test/v1', temperature: 0.2, skillPacks: ['openapi'], customInstructions: '',
};

try {
    globalThis.fetch = (async () => new Response(
        'data: this is a provider comment\n\n' +
        'data: {"error":{"message":"context window exceeded","code":"context_length_exceeded","status":400,"provider":"fixture","model":"fixture-model"}}\n\n',
        {status: 200, headers: {'content-type': 'text/event-stream'}},
    )) as typeof fetch;
    await assert.rejects(
        streamAIResponse(settings, [{role: 'user', content: 'hello'}]),
        error => {
            assert.ok(error instanceof AIStreamError);
            assert.equal(error.message, 'context window exceeded');
            assert.equal(error.code, 'context_length_exceeded');
            assert.equal(error.status, 400);
            assert.equal(error.provider, 'fixture');
            assert.equal(error.model, 'fixture-model');
            return true;
        },
    );
    console.log('✓ propagates structured provider errors from SSE streams');

    globalThis.fetch = (async () => new Response(JSON.stringify({
        error: {message: 'rate limited', code: 'rate_limit', provider: 'fixture', model: 'fixture-model'},
    }), {status: 429, statusText: 'Too Many Requests', headers: {'content-type': 'application/json'}})) as typeof fetch;
    await assert.rejects(
        streamAIResponse(settings, [{role: 'user', content: 'hello'}]),
        error => {
            assert.ok(error instanceof AIStreamError);
            assert.equal(error.message, 'rate limited');
            assert.equal(error.code, 'rate_limit');
            assert.equal(error.status, 429);
            return true;
        },
    );
    console.log('✓ preserves structured non-streaming provider errors');

    let requestBody: unknown;
    globalThis.fetch = (async (_input, init) => {
        requestBody = JSON.parse(String(init?.body || '{}'));
        return new Response(JSON.stringify({
            models: [{id: 'approved/model', label: 'Approved model · Premium', tier: 'premium'}],
            gateway: {clientModelSelection: false, provider: 'openrouter', model: 'approved/model'},
        }), {status: 200, headers: {'content-type': 'application/json'}});
    }) as typeof fetch;
    const catalog = await fetchProviderModelCatalog({
        ...settings,
        transport: 'gateway', gatewayUrl: 'https://gateway.example.com/api/ai', gatewayToken: 'token', model: 'stale/client-model',
    });
    assert.deepEqual(requestBody, {});
    assert.equal(catalog.gateway?.provider, 'openrouter');
    assert.equal(catalog.gateway?.model, 'approved/model');
    assert.equal(catalog.gateway?.clientModelSelection, false);
    assert.deepEqual(catalog.models.map(model => model.id), ['approved/model']);
    console.log('✓ discovers gateway-owned provider and model policy without submitting a client provider');
} finally {
    globalThis.fetch = originalFetch;
}
