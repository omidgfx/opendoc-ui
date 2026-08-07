import assert from 'node:assert/strict';
import {streamAIResponse} from '../src/utils/aiProviders';

const originalFetch = globalThis.fetch;
try {
    globalThis.fetch = (async () => new Response(
        'data: this is a provider comment\n\n' +
        'data: {"error":{"message":"context window exceeded"}}\n\n',
        {status: 200, headers: {'content-type': 'text/event-stream'}},
    )) as typeof fetch;
    await assert.rejects(
        streamAIResponse({
            enabled: true, transport: 'direct', gatewayUrl: '', gatewayToken: '', provider: 'custom', model: 'fixture', apiKey: '', baseUrl: 'https://fixture.test/v1', temperature: 0.2, skillPacks: ['openapi'], customInstructions: '',
        }, [{role: 'user', content: 'hello'}]),
        /context window exceeded/,
    );
    console.log('✓ propagates valid provider errors from SSE streams');
} finally {
    globalThis.fetch = originalFetch;
}
