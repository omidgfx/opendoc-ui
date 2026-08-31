import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
    MANAGED_POLICY_ENDPOINT,
    fetchManagedPolicy,
    managedChatUrlFromPolicyUrl,
    managedErrorMessage,
    managedModelLabel,
    managedSettingsFromPolicy,
    normalizeManagedPolicy,
    recordRuntimeManagedConfig,
    readRuntimeManagedConfig,
    resolveManagedActivation,
} from '../src/utils/ai/managed';
import {createGatewayModelPolicy, createManagedGatewayOptions, managedPolicyPayload} from '../server/ai-gateway-policy';

test('managed policy: accepts a valid descriptor and applies defaults', () => {
    const policy = normalizeManagedPolicy({mode: 'managed'});
    assert.ok(policy);
    assert.equal(policy.mode, 'managed');
    assert.equal(policy.ready, true);
    assert.equal(policy.displayName, 'Assistant');
    assert.equal(policy.exposeModel, false);
    assert.equal(policy.provider, null);
    assert.equal(policy.model, null);
    assert.equal(policy.allowCustomInstructions, false);
    assert.equal(policy.auth, 'ambient');
    assert.ok(policy.allowedSkillPacks.length > 0);
    assert.equal(policy.requestsPerMinute, null);
});

test('managed policy: rejects non-managed and malformed payloads', () => {
    assert.equal(normalizeManagedPolicy(null), null);
    assert.equal(normalizePolicyIfManaged(undefined), null);
    assert.equal(normalizeManagedPolicy({mode: 'gateway'}), null);
    assert.equal(normalizeManagedPolicy('managed'), null);
    assert.equal(normalizeManagedPolicy([]), null);
});

const normalizePolicyIfManaged = (value: unknown) => normalizeManagedPolicy(value as never);

test('managed policy: never exposes credential-shaped or unknown fields', () => {
    const raw = {
        mode: 'managed',
        displayName: 'Acme Assistant',
        apiKey: 'sk-super-secret',
        baseUrl: 'https://internal-ai.acme.example/v1',
        token: 'bearer-secret',
        authorization: 'Bearer bearer-secret',
        upstream: {url: 'https://internal-ai.acme.example/v1'},
    };
    const policy = normalizeManagedPolicy(raw) as unknown as Record<string, unknown>;
    const serialized = JSON.stringify(policy);
    assert.ok(!serialized.includes('sk-super-secret'));
    assert.ok(!serialized.includes('internal-ai.acme.example'));
    assert.ok(!serialized.includes('bearer-secret'));
    assert.equal('apiKey' in policy, false);
    assert.equal('baseUrl' in policy, false);
    assert.equal('token' in policy, false);
});

test('managed policy: masks provider and model unless exposeModel is explicit', () => {
    const hidden = normalizeManagedPolicy({mode: 'managed', provider: 'openai', model: 'gpt-fake'});
    assert.ok(hidden);
    assert.equal(hidden.provider, null);
    assert.equal(hidden.model, null);
    const exposed = normalizeManagedPolicy({
        mode: 'managed',
        exposeModel: true,
        provider: 'openai',
        model: 'gpt-fake',
    });
    assert.ok(exposed);
    assert.equal(exposed.provider, 'openai');
    assert.equal(exposed.model, 'gpt-fake');
    const invalidProvider = normalizeManagedPolicy({mode: 'managed', exposeModel: true, provider: 'nope'});
    assert.ok(invalidProvider);
    assert.equal(invalidProvider.provider, null);
});

test('managed policy: sanitizes display name, skills, limits and auth', () => {
    const policy = normalizeManagedPolicy({
        mode: 'managed',
        displayName: '  '.repeat(3),
        ready: false,
        allowedSkillPacks: ['openapi', 'not-a-skill', 'api-testing'],
        limits: {requestsPerMinute: 12.7},
        auth: 'token',
    });
    assert.ok(policy);
    assert.equal(policy.displayName, 'Assistant');
    assert.equal(policy.ready, false);
    assert.deepEqual(policy.allowedSkillPacks, ['openapi', 'api-testing']);
    assert.equal(policy.requestsPerMinute, 12);
    assert.equal(policy.auth, 'token');
    const longName = normalizeManagedPolicy({mode: 'managed', displayName: 'x'.repeat(80)});
    assert.ok(longName);
    assert.equal(longName.displayName.length, 48);
});

test('managed activation: runtime config wins over env and default probe', () => {
    const base = {envManaged: '', envPolicyUrl: '', configLoaded: true};
    assert.deepEqual(resolveManagedActivation({...base, runtimeConfig: {enabled: true, policyUrl: '/gw/policy'}}), {
        active: true,
        policyUrl: '/gw/policy',
    });
    assert.deepEqual(resolveManagedActivation({...base, runtimeConfig: {enabled: false}, envManaged: 'true'}), {
        active: false,
        policyUrl: MANAGED_POLICY_ENDPOINT,
    });
    assert.deepEqual(
        resolveManagedActivation({
            ...base,
            runtimeConfig: {enabled: true},
            envManaged: 'false',
            envPolicyUrl: '/env/policy',
        }),
        {active: true, policyUrl: '/env/policy'},
    );
});

test('managed activation: waits for config before the default probe; env true may start early', () => {
    const base = {envManaged: '', envPolicyUrl: ''};
    assert.deepEqual(resolveManagedActivation({...base, runtimeConfig: undefined, configLoaded: false}), {
        active: false,
        policyUrl: MANAGED_POLICY_ENDPOINT,
    });
    assert.deepEqual(resolveManagedActivation({...base, runtimeConfig: undefined, configLoaded: true}), {
        active: true,
        policyUrl: MANAGED_POLICY_ENDPOINT,
    });
    assert.deepEqual(
        resolveManagedActivation({...base, runtimeConfig: undefined, configLoaded: false, envManaged: 'true'}),
        {active: true, policyUrl: MANAGED_POLICY_ENDPOINT},
    );
    assert.deepEqual(
        resolveManagedActivation({...base, runtimeConfig: null, configLoaded: true, envManaged: 'false'}),
        {active: false, policyUrl: MANAGED_POLICY_ENDPOINT},
    );
});

test('managed activation: true shorthand enables with the default endpoint', () => {
    assert.deepEqual(
        resolveManagedActivation({runtimeConfig: true, envManaged: '', envPolicyUrl: '', configLoaded: true}),
        {active: true, policyUrl: MANAGED_POLICY_ENDPOINT},
    );
});

test('managed activation: records and reads the runtime config block', () => {
    assert.equal(readRuntimeManagedConfig(), undefined);
    recordRuntimeManagedConfig({enabled: true, policyUrl: '/x/policy'});
    assert.deepEqual(readRuntimeManagedConfig(), {enabled: true, policyUrl: '/x/policy'});
    recordRuntimeManagedConfig({unrelated: true});
    assert.deepEqual(readRuntimeManagedConfig(), {});
    recordRuntimeManagedConfig(null);
    assert.equal(readRuntimeManagedConfig(), null);
});

test('managed chat URL derivation keeps gateway transport pointing at /chat', () => {
    assert.equal(managedChatUrlFromPolicyUrl('/api/ai/policy'), '/api/ai/chat');
    assert.equal(
        managedChatUrlFromPolicyUrl('https://ai.acme.example/opendoc/policy/'),
        'https://ai.acme.example/opendoc/chat',
    );
    assert.equal(managedChatUrlFromPolicyUrl('/gw'), '/gw/chat');
});

test('managed settings are gateway-transported with empty secrets by construction', () => {
    const policy = normalizeManagedPolicy({mode: 'managed', displayName: 'Acme'})!;
    const settings = managedSettingsFromPolicy(policy, '/api/ai/policy');
    assert.equal(settings.transport, 'gateway');
    assert.equal(settings.gatewayUrl, '/api/ai/chat');
    assert.equal(settings.gatewayToken, '');
    assert.equal(settings.apiKey, '');
    assert.equal(settings.baseUrl, '');
    assert.equal(settings.model, '');
    assert.equal(settings.rememberCredentials, false);
    assert.deepEqual(settings.skillPacks, policy.allowedSkillPacks);
    const serialized = JSON.stringify(settings);
    assert.ok(!serialized.includes('token":"'));
});

test('managed model label masks the model identity by default', () => {
    const masked = normalizeManagedPolicy({mode: 'managed', displayName: 'Acme Assistant'})!;
    assert.equal(managedModelLabel(masked), 'Acme Assistant');
    const exposed = normalizeManagedPolicy({
        mode: 'managed',
        displayName: 'Acme',
        exposeModel: true,
        provider: 'openai',
        model: 'gpt-fake',
    })!;
    assert.equal(managedModelLabel(exposed), 'gpt-fake');
});

test('managed error copy never echoes upstream provider text', () => {
    assert.match(managedErrorMessage({status: 401}), /organization portal/);
    assert.match(managedErrorMessage({status: 403}), /organization portal/);
    assert.match(managedErrorMessage({status: 429}), /rate limited/);
    assert.match(managedErrorMessage(new Error('model gpt-fake not found for provider openai')), /unavailable/);
    assert.match(managedErrorMessage({status: 503}), /trouble/);
    assert.match(managedErrorMessage(undefined), /unavailable/);
});

test('managed policy fetch: 404 turns managed mode off; valid payload normalizes', async () => {
    const originalFetch = globalThis.fetch;
    try {
        globalThis.fetch = (async () => new Response(JSON.stringify({mode: 'gateway'}), {status: 200})) as typeof fetch;
        assert.equal(await fetchManagedPolicy('/p'), null);
        globalThis.fetch = (async () => new Response('nope', {status: 404})) as typeof fetch;
        assert.equal(await fetchManagedPolicy('/p'), null);
        const policy = {mode: 'managed', displayName: 'Acme'};
        globalThis.fetch = (async () =>
            new Response(JSON.stringify(policy), {status: 200, headers: {ETag: '"v1"'}})) as typeof fetch;
        const first = await fetchManagedPolicy('/p');
        assert.ok(first);
        assert.equal(first.displayName, 'Acme');
        let sawIfNoneMatch = '';
        globalThis.fetch = (async (_url, init) => {
            sawIfNoneMatch = String(new Headers(init?.headers).get('If-None-Match'));
            return new Response(null, {status: 304}) as Response;
        }) as typeof fetch;
        const cached = await fetchManagedPolicy('/p');
        assert.equal(sawIfNoneMatch, '"v1"');
        assert.equal(cached?.displayName, 'Acme');
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('gateway managed options: defaults are disabled, ambient and locked', () => {
    const off = createManagedGatewayOptions({});
    assert.equal(off.enabled, false);
    const managed = createManagedGatewayOptions({managed: 'true'});
    assert.equal(managed.enabled, true);
    assert.equal(managed.authMode, 'ambient');
    assert.equal(managed.displayName, 'Assistant');
    assert.equal(managed.exposeModel, false);
    assert.equal(managed.lockTemperature, true);
    assert.equal(managed.temperature, 0.2);
    assert.equal(managed.subjectHeader, '');
    assert.deepEqual(managed.allowedSkillPacks, ['openapi', 'rest-debugging', 'security', 'api-testing']);
});

test('gateway managed options: parses env block and rejects bad subject headers', () => {
    const managed = createManagedGatewayOptions({
        managed: 'TRUE',
        authMode: 'token',
        displayName: '  Acme Copilot  ',
        exposeModel: 'true',
        lockTemperature: 'false',
        temperature: '1.5',
        subjectHeader: 'X-Forwarded-User',
        allowedSkillPacks: 'openapi, bogus, sdk-generation',
    });
    assert.equal(managed.enabled, true);
    assert.equal(managed.authMode, 'token');
    assert.equal(managed.displayName, 'Acme Copilot');
    assert.equal(managed.exposeModel, true);
    assert.equal(managed.lockTemperature, false);
    assert.equal(managed.temperature, 1.5);
    assert.equal(managed.subjectHeader, 'X-Forwarded-User');
    assert.deepEqual(managed.allowedSkillPacks, ['openapi', 'sdk-generation']);
    assert.throws(() => createManagedGatewayOptions({managed: 'true', subjectHeader: 'Bad Header!'}), /header name/);
});

test('gateway managed policy payload is secret-free and masks identity by default', () => {
    const modelPolicy = createGatewayModelPolicy({
        provider: 'openai',
        configuredModel: 'gpt-fake',
        allowClientModel: false,
        allowedModels: '',
    });
    const managed = createManagedGatewayOptions({managed: 'true', displayName: 'Acme Copilot'});
    const payload = managedPolicyPayload(managed, modelPolicy, 30) as Record<string, unknown>;
    const serialized = JSON.stringify(payload);
    assert.equal(payload.mode, 'managed');
    assert.equal(payload.displayName, 'Acme Copilot');
    assert.equal(payload.provider, null);
    assert.equal(payload.model, null);
    assert.equal(payload.clientModelSelection, false);
    assert.ok((payload.limits as Record<string, unknown>).requestsPerMinute === 30);
    assert.ok(!serialized.includes('sk-'));
    assert.ok(!serialized.includes('https://'));
    const exposed = createManagedGatewayOptions({managed: 'true', exposeModel: 'true'});
    const exposedPayload = managedPolicyPayload(exposed, modelPolicy, null) as Record<string, unknown>;
    assert.equal(exposedPayload.provider, 'openai');
    assert.equal(exposedPayload.model, 'gpt-fake');
    assert.deepEqual(exposedPayload.limits, {});
});

console.log('Managed AI mode contract tests passed.');
