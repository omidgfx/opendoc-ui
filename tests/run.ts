import assert from 'node:assert/strict';
import {applyAuthToRequest} from '../src/utils/auth';
import {buildAIContext, buildAISystemPrompt, citationsFromText} from '../src/utils/aiContext';
import {formatOpenDocUIRunnerResult, parseOpenDocUIActions} from '../src/utils/aiBridge';
import {allowedModelCatalog, createGatewayModelPolicy, resolveGatewaySelection} from '../server/ai-gateway-policy';
import {trimAIConversation} from '../src/utils/aiStorage';
import {bodyEditorModeForMediaType, bodyTypeSupportsForm, formatBodyText, getBodyEditorLanguage, getBodyFormat, parseStructuredBody, serializeUrlEncodedBody, validateBodyText} from '../src/utils/bodyFormats';
import {defaultBodyValue} from '../src/components/endpoint/ExamineTab/RecursiveBodyForm';
import {
    getMergedParameters,
    getRefName,
    isJsonMediaType,
    queryStringFromPairs,
    resolveJsonPointer,
    resolveReference,
    resolveRequestBody,
    serializeOpenApiParameter,
    validateOpenApiDocument
} from '@/src/utils/openapi';

const test = (name: string, callback: () => void) => {
    callback();
    console.log(`✓ ${name}`);
};

const baseSpec: any = {
    openapi: '3.0.3',
    info: {title: 'Fixture', version: '1.0.0'},
    paths: {'/users/{id}': {get: {parameters: [], responses: {'200': {description: 'ok'}}}}},
    components: {
        securitySchemes: {
            clientId: {type: 'apiKey', in: 'header', name: 'X-Client-Id'},
            tenant: {type: 'apiKey', in: 'query', name: 'tenant'},
            auth: {type: 'http', scheme: 'bearer', bearerFormat: 'JWT'},
        },
        schemas: {},
    },
};

test('serializes OpenAPI query arrays and objects', () => {
    const repeated = serializeOpenApiParameter({
        name: 'id',
        in: 'query',
        schema: {type: 'array'},
        style: 'form',
        explode: true
    }, ['a', 'b']);
    assert.equal(queryStringFromPairs(repeated.query), '?id=a&id=b');
    const comma = serializeOpenApiParameter({
        name: 'id',
        in: 'query',
        schema: {type: 'array'},
        style: 'form',
        explode: false
    }, ['a', 'b']);
    assert.equal(queryStringFromPairs(comma.query), '?id=a%2Cb');
    const deep = serializeOpenApiParameter({
        name: 'filter',
        in: 'query',
        schema: {type: 'object'},
        style: 'deepObject',
        explode: true
    }, {status: 'open', owner: 'ali'});
    assert.equal(queryStringFromPairs(deep.query), '?filter%5Bstatus%5D=open&filter%5Bowner%5D=ali');
    const reserved = serializeOpenApiParameter({
        name: 'next',
        in: 'query',
        allowReserved: true,
        schema: {type: 'string'}
    }, 'https://api.test/a?x=1');
    assert.equal(queryStringFromPairs(reserved.query), '?next=https://api.test/a?x=1');
    const labelArray = serializeOpenApiParameter({
        name: 'id', in: 'path', style: 'label', explode: true, schema: {type: 'array', items: {type: 'string'}}
    }, ['a', 'b']);
    assert.equal(labelArray.pathValue, '.a.b');
    const matrixObject = serializeOpenApiParameter({
        name: 'coords', in: 'path', style: 'matrix', explode: true, schema: {type: 'object'}
    }, {x: 1, y: 2});
    assert.equal(matrixObject.pathValue, ';x=1;y=2');
});

test('resolves JSON pointers, escaped names, and cyclic refs safely', () => {
    const spec: any = {
        ...baseSpec, components: {
            schemas: {
                'a/b': {type: 'string'},
                A: {$ref: '#/components/schemas/B'},
                B: {$ref: '#/components/schemas/A'},
            }
        }
    };
    assert.deepEqual(resolveJsonPointer(spec, '#/components/schemas/a~1b'), {type: 'string'});
    assert.equal(getRefName('#/components/schemas/a~1b'), 'a/b');
    const resolved = resolveReference({$ref: '#/components/schemas/A'}, spec);
    assert.equal(typeof resolved, 'object');
    assert.equal(resolved.$ref, '#/components/schemas/A');
});

test('preserves distinct auth scheme IDs and composed requirements', () => {
    const auth = applyAuthToRequest(baseSpec, {
        activeScheme: 'clientId',
        selectedSchemes: ['clientId', 'tenant', 'auth'],
        schemeValues: {
            clientId: {schemeId: 'clientId', type: 'apiKey', value: 'client-secret'},
            tenant: {schemeId: 'tenant', type: 'apiKey', value: 'acme'},
            auth: {schemeId: 'auth', type: 'bearer', value: 'jwt-token'},
        },
        cookieValues: {},
        bearerToken: '',
        apiKeyName: '',
        apiKeyValue: '',
        apiKeyIn: 'header',
        basicUsername: '',
        basicPassword: '',
    }, {responses: {'200': {description: 'ok'}}} as any);
    assert.equal(auth.headers['X-Client-Id'], 'client-secret');
    assert.equal(auth.headers.Authorization, 'Bearer jwt-token');
    assert.equal(queryStringFromPairs(auth.query), '?tenant=acme');
});

test('merges path and operation parameters and resolves component query refs', () => {
    const spec: any = {
        ...baseSpec,
        components: {
            ...baseSpec.components,
            parameters: {
                PageParam: {
                    name: 'page',
                    in: 'query',
                    description: 'Page number of pagination',
                    required: false,
                    schema: {type: 'integer'},
                },
            },
        },
        paths: {
            '/v1/catalog/geography/cities': {
                get: {
                    parameters: [
                        {name: 'province', in: 'query', schema: {type: 'string', format: 'uuid'}},
                        {name: 'keyword', in: 'query', schema: {type: 'string', maxLength: 128}},
                        {$ref: '#/components/parameters/PageParam'},
                    ],
                    responses: {'200': {description: 'ok'}},
                },
            },
        },
    };
    const operation = spec.paths['/v1/catalog/geography/cities'].get;
    const params = getMergedParameters(spec.paths['/v1/catalog/geography/cities'], operation, spec);
    assert.deepEqual(params.map(param => param.name), ['province', 'keyword', 'page']);
    assert.equal(params.find(param => param.name === 'page')?.schema.type, 'integer');

    const overrideSpec: any = {
        ...baseSpec,
        components: {...baseSpec.components, parameters: {PageParam: {name: 'page', in: 'query', schema: {type: 'integer'}}}},
    };
    const merged = getMergedParameters(
        {parameters: [{name: 'page', in: 'query', schema: {type: 'string'}}, {name: 'keep', in: 'query', schema: {type: 'string'}}]},
        {parameters: [{$ref: '#/components/parameters/PageParam'}]},
        overrideSpec,
    );
    assert.deepEqual(merged.map(param => param.name), ['page', 'keep']);
    assert.equal(merged[0].schema.type, 'integer');
});

test('resolves referenced request bodies and their media entries', () => {
    const spec: any = {
        ...baseSpec,
        components: {
            ...baseSpec.components,
            requestBodies: {
                LoginBody: {
                    required: true,
                    content: {'application/json': {schema: {$ref: '#/components/schemas/Login'}}},
                },
            },
            schemas: {Login: {type: 'object', properties: {mobile: {type: 'string'}}}},
        },
    };
    const body = resolveRequestBody({$ref: '#/components/requestBodies/LoginBody'}, spec);
    assert.equal(body.required, true);
    assert.equal(body.content['application/json'].schema.$ref, '#/components/schemas/Login');
});

test('detects vendor JSON media types', () => {
    assert.equal(isJsonMediaType('application/problem+json; charset=utf-8'), true);
    assert.equal(isJsonMediaType('application/vnd.company.resource+json'), true);
    assert.equal(isJsonMediaType('application/octet-stream'), false);
});

test('validates the OpenAPI envelope before normalization', () => {
    assert.equal(validateOpenApiDocument(baseSpec).valid, true);
    const invalid = validateOpenApiDocument({paths: []});
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some(error => error.includes('openapi 3.x')));
});

test('trims oversized conversations instead of deleting them', () => {
    const conversation: any = {
        id: 'conversation', specKey: 'fixture', title: 'Fixture', createdAt: 1, updatedAt: 2,
        includeAuthValues: false, trustedRunner: false,
        messages: Array.from({length: 130}, (_, index) => ({
            id: `m${index}`,
            role: index % 2 ? 'assistant' : 'user',
            content: `message ${index}`,
            createdAt: index
        })),
    };
    const trimmed = trimAIConversation(conversation);
    assert.equal(trimmed.messages.length, 100);
    assert.match(trimmed.messages[0].content, /omitted/);
    assert.equal(trimmed.messages.at(-1)?.id, 'm129');
});

test('keeps citations limited to IDs in the source catalog', () => {
    const context = buildAIContext({
        spec: baseSpec,
        specKey: 'fixture',
        selectedEndpoints: [{path: '/users/{id}', method: 'get'}]
    });
    assert.match(context.context, /UNTRUSTED|retrieved|selectedEndpointDocuments/);
    const citations = citationsFromText('GET /users/{id} is documented here [source:path:GET:/users/{id}] [source:does-not-exist]', context.sources);
    assert.deepEqual(citations.map(source => source.id), ['path:GET:/users/{id}']);
    assert.deepEqual(citationsFromText('This unrelated claim [source:path:GET:/users/{id}]', context.sources), []);
});

test('exposes operational skills and validates the OpenDoc UI action bridge', () => {
    const context = buildAIContext({spec: baseSpec, specKey: 'fixture'});
    const prompt = buildAISystemPrompt({
        transport: 'direct',
        gatewayUrl: '',
        gatewayToken: '',
        provider: 'custom',
        model: 'fixture',
        apiKey: '',
        baseUrl: 'https://fixture.test/v1',
        temperature: 0.2,
        skillPacks: ['openapi', 'api-testing'],
        customInstructions: ''
    }, context);
    assert.match(prompt, /OpenDoc UI action bridge/);
    assert.match(prompt, /API testing/);
    const actions = parseOpenDocUIActions('<opendoc-ui-action>{"action":"set_runner_fields","path":"/users/{id}","method":"get","params":{"id":"42"}}</opendoc-ui-action>');
    assert.equal(actions[0]?.action, 'set_runner_fields');
    assert.equal(actions[0]?.clearExisting, true);
    assert.equal(parseOpenDocUIActions('<opendoc-ui-action>{"action":"run_api","path":"https://evil","method":"get"}</opendoc-ui-action>').length, 0);
});

test('keeps gateway providers server-controlled and models exactly allowlisted', () => {
    const policy = createGatewayModelPolicy({
        provider: 'openrouter', configuredModel: 'openai/gpt-4o-mini', allowClientModel: true,
        allowedModels: 'openai/gpt-4o-mini,anthropic/claude-3.5-sonnet',
    });
    assert.deepEqual(resolveGatewaySelection(policy, {model: 'anthropic/claude-3.5-sonnet'}), {provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet'});
    assert.match((resolveGatewaySelection(policy, {provider: 'anthropic', model: 'anthropic/claude-3.5-sonnet'}) as {error: string}).error, /controlled by the gateway/);
    assert.match((resolveGatewaySelection(policy, {model: 'unapproved/model'}) as {error: string}).error, /not allowed/);
});

test('returns only gateway-allowlisted models from discovery', () => {
    const policy = createGatewayModelPolicy({provider: 'ollama', configuredModel: 'llama3.2', allowClientModel: true, allowedModels: 'llama3.2,qwen2.5:7b'});
    const models = allowedModelCatalog(policy, [
        {id: 'qwen2.5:7b', label: 'Qwen 2.5 7B · Local', tier: 'local'},
        {id: 'not-allowed', label: 'Not allowed', tier: 'local'},
    ]);
    assert.deepEqual(models.map(model => model.id), ['llama3.2', 'qwen2.5:7b']);
    assert.match(models[0].label, /Gateway allowed/);
    assert.equal(models[1].label, 'Qwen 2.5 7B · Local');
});

test('rejects unsafe gateway policy configuration', () => {
    assert.throws(() => createGatewayModelPolicy({provider: 'unknown', configuredModel: 'model', allowClientModel: false}), /Unsupported AI_PROVIDER/);
    assert.throws(() => createGatewayModelPolicy({provider: 'openrouter', configuredModel: '', allowClientModel: true, allowedModels: 'model'}), /AI_MODEL is required/);
    assert.throws(() => createGatewayModelPolicy({provider: 'openrouter', configuredModel: 'model', allowClientModel: true, allowedModels: '*'}), /wildcard/);
    assert.throws(() => createGatewayModelPolicy({provider: 'openrouter', configuredModel: 'default', allowClientModel: true, allowedModels: 'other'}), /must include AI_MODEL/);
});

test('formats bounded Runner results for the conversation without exposing auth headers', () => {
    const result = formatOpenDocUIRunnerResult({actionId: 'a1', specKey: 'fixture', path: '/users', method: 'get', result: {
        status: 200, headers: {'authorization': 'Bearer secret'}, body: 'Authorization: Bearer secret\\n{"ok":true}', isJson: true, durationMs: 12,
    }});
    assert.match(result, /API Runner result/);
    assert.match(result, /200/);
    assert.match(result, /REDACTED/);
    assert.doesNotMatch(result, /Bearer secret/);
});

test('selects raw-body formats without applying JSON validation to YAML or XML', () => {
    assert.equal(getBodyFormat('application/json').language, 'json');
    assert.equal(getBodyFormat('application/yaml').isYaml, true);
    assert.equal(getBodyFormat('application/yaml').language, 'yaml');
    assert.equal(getBodyFormat('application/xml').isXml, true);
    assert.equal(getBodyEditorLanguage('{"name":"OpenDoc"}', 'application/x-www-form-urlencoded'), 'json');
    assert.equal(getBodyEditorLanguage('name=OpenDoc', 'application/x-www-form-urlencoded'), 'plaintext');
    assert.equal(validateBodyText('{"broken":', 'application/x-www-form-urlencoded') !== null, true);
    assert.match(formatBodyText('{"name":"OpenDoc"}', 'application/x-www-form-urlencoded').text, /"name": "OpenDoc"/);
    assert.equal(bodyTypeSupportsForm('application/json; charset=utf-8'), true);
    assert.equal(bodyEditorModeForMediaType('raw', 'application/json'), 'raw');
    assert.equal(bodyEditorModeForMediaType('raw', 'application/x-www-form-urlencoded'), 'raw');
    assert.equal(bodyEditorModeForMediaType('form', 'application/xml'), 'raw');
    assert.equal(validateBodyText('name: OpenDoc\nitems:\n  - id: 1', 'application/yaml'), null);
    assert.equal(validateBodyText('<root><item /></root>', 'application/xml'), null);
    assert.equal(validateBodyText('{"broken":', 'application/json') !== null, true);
    assert.match(formatBodyText('name: OpenDoc\nitems:\n  - id: 1', 'application/yaml').text, /name:/);
    const encoded = serializeUrlEncodedBody({name: 'OpenDoc', tags: ['one', 'two'], nested: {enabled: true}});
    assert.match(encoded, /name=OpenDoc/);
    assert.match(encoded, /tags=one/);
    assert.match(encoded, /tags=two/);
    assert.match(encoded, /nested=%7B%22enabled%22%3Atrue%7D/);
    assert.deepEqual(parseStructuredBody('tags=one&tags=two', 'application/x-www-form-urlencoded'), {tags: ['one', 'two']});
});

test('creates typed defaults for recursive object and array schemas', () => {
    const schema = {type: 'object', properties: {name: {type: 'string', default: 'OpenDoc'}, items: {type: 'array', items: {type: 'object', properties: {id: {type: 'integer'}}}}}};
    const value: any = defaultBodyValue(schema, baseSpec);
    assert.equal(value.name, 'OpenDoc');
    assert.deepEqual(value.items, []);
});

console.log('All OpenDoc UI unit tests passed.');
