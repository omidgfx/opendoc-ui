import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import { applyAuthToRequest, isOperationProtected } from '../src/utils/auth';
import { buildAIContext, buildAISystemPrompt, citationsFromText } from '../src/utils/aiContext';
import { formatOpenDocUIRunnerResult, parseOpenDocUIActions } from '../src/utils/aiBridge';
import { allowedModelCatalog, createGatewayModelPolicy, resolveGatewaySelection } from '../server/ai-gateway-policy';
import { trimAIConversation } from '../src/utils/aiStorage';
import { bodyEditorModeForMediaType, bodyTypeSupportsForm, formatBodyText, getBodyEditorLanguage, getBodyFormat, parseStructuredBody, serializeUrlEncodedBody, validateBodyText } from '../src/utils/bodyFormats';
import { DESCRIPTION_TOOLTIP_THRESHOLD, defaultBodyValue, usesDescriptionTooltip } from '../src/components/endpoint/ExamineTab/RecursiveBodyForm';
import { getDocumentOperations, getMergedParameters, getOperation, getRefName, isJsonMediaType, normalizeOpenApiSpec, queryStringFromPairs, resolveJsonPointer, resolveReference, resolveRequestBody, serializeOpenApiParameter, validateOpenApiDocument } from '@/src/utils/openapi';
import {compileBrowserRequest, parameterStateKey} from '@/src/utils/requestPlan';
import {createTypeNameMap, generateAllTsContent, schemaToTsType, toSafeGeneratedFileName} from '@/src/utils/schemaExport';
import {sanitizeZipEntryName} from '@/src/utils/zip';
import {generateValidatedMock} from '@/src/utils/mockGenerator';
import {OPENAPI_CAPABILITIES, capabilitiesFor} from '@/src/utils/openapi/capabilities';
import {buildCodegenRequest, generateRequestSnippet} from '@/src/utils/codeGeneration';
import {parseSpecDraft} from '@/src/utils/appSpec';
import {getRawSpecDocument} from '@/src/utils/specSource';
const test = (name: string, callback: () => void) => {
    callback();
    console.log(`✓ ${name}`);
};
const baseSpec: any = {
    openapi: '3.0.3',
    info: { title: 'Fixture', version: '1.0.0' },
    paths: { '/users/{id}': { get: { parameters: [], responses: { '200': { description: 'ok' } } } } },
    components: {
        securitySchemes: {
            clientId: { type: 'apiKey', in: 'header', name: 'X-Client-Id' },
            tenant: { type: 'apiKey', in: 'query', name: 'tenant' },
            auth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
        schemas: {},
    },
};
test('compiles a permissive request with canonical inputs and advisory diagnostics', () => {
    const operation: any = {
        parameters: [
            {name: 'id', in: 'path', required: true, schema: {type: 'string'}},
            {name: 'region', in: 'header', required: true, schema: {type: 'string', pattern: '^[A-Z]+$'}},
        ],
        requestBody: {required: true, content: {'application/json': {schema: {type: 'object'}}}},
        responses: {'400': {description: 'bad request', content: {'application/problem+json': {}}}},
        security: [],
    };
    const spec: any = {
        ...baseSpec,
        paths: {'/users/{id}': {get: operation}},
        servers: [{url: 'https://api.example.test'}],
    };
    const plan = compileBrowserRequest({
        spec, path: '/users/{id}', method: 'get', operation,
        selectedServer: 'https://api.example.test',
        activeAuth: {
            activeScheme: 'auth', selectedSchemes: ['auth'],
            schemeValues: {auth: {schemeId: 'auth', type: 'bearer', value: 'must-not-leak'}},
            cookieValues: {}, bearerToken: '', apiKeyName: '', apiKeyValue: '', apiKeyIn: 'header',
            basicUsername: '', basicPassword: '',
        },
        parameterValues: {[parameterStateKey('header', 'region')]: 'eu'},
        body: '{broken json', bodyType: 'application/json',
    });
    assert.equal(plan.url, 'https://api.example.test/users/{id}');
    assert.equal(plan.headers.Authorization, undefined);
    assert.equal(plan.headers.region, 'eu');
    assert.equal(plan.headers.Accept, 'application/problem+json');
    assert.ok(plan.diagnostics.some(item => item.code === 'RUN_REQUIRED_PARAMETER_MISSING'));
    assert.ok(plan.diagnostics.some(item => item.code === 'RUN_PARAMETER_PATTERN_MISMATCH'));
    assert.ok(plan.diagnostics.some(item => item.code === 'RUN_BODY_JSON_INVALID'));
    // GET bodies are a browser limitation, not a semantic validation failure.
    assert.equal(plan.body, null);
});
test('resolves operation server variables ahead of path and root servers', () => {
    const operation: any = {
        servers: [{url: 'https://{region}.example.test/{version}', variables: {
            region: {default: 'eu', enum: ['eu', 'us']}, version: {default: 'v2'},
        }}],
        responses: {'200': {description: 'ok'}},
    };
    const spec: any = {...baseSpec, servers: [{url: 'https://root.example.test'}], paths: {'/ping': {get: operation}}};
    const plan = compileBrowserRequest({
        spec, path: '/ping', method: 'get', operation,
        selectedServer: 'https://root.example.test', serverVariables: {region: 'us'},
        activeAuth: {activeScheme: 'none', selectedSchemes: [], schemeValues: {}, cookieValues: {}, bearerToken: '', apiKeyName: '', apiKeyValue: '', apiKeyIn: 'header', basicUsername: '', basicPassword: ''},
    });
    assert.equal(plan.url, 'https://us.example.test/v2/ping');
    assert.equal(plan.intent.server.source, 'operation');
});
test('preserves Swagger 2 collection formats and unspecified media types', () => {
    const normalized: any = normalizeOpenApiSpec({
        swagger: '2.0', info: {title: 'Swagger', version: '1'}, host: 'api.example.test', basePath: '/v1',
        consumes: ['application/json'], produces: ['application/json'], paths: {
            '/items': {get: {
                consumes: [], produces: [], schemes: ['http'],
                parameters: [{name: 'ids', in: 'query', type: 'array', items: {type: 'string'}, collectionFormat: 'tsv'}],
                responses: {'200': {description: 'ok', schema: {type: 'array', items: {type: 'string'}}}},
            }},
        },
    });
    const operation = normalized.paths['/items'].get;
    const serialized = serializeOpenApiParameter(operation.parameters[0], ['a', 'b']);
    assert.equal(queryStringFromPairs(serialized.query), '?ids=a%09b');
    assert.deepEqual(operation.servers, [{url: 'http://api.example.test/v1'}]);
    assert.ok(operation.responses['200'].content['*/*']);
});
test('serializes OpenAPI query arrays and objects', () => {
    const repeated = serializeOpenApiParameter({
        name: 'id',
        in: 'query',
        schema: { type: 'array' },
        style: 'form',
        explode: true
    }, ['a', 'b']);
    assert.equal(queryStringFromPairs(repeated.query), '?id=a&id=b');
    const comma = serializeOpenApiParameter({
        name: 'id',
        in: 'query',
        schema: { type: 'array' },
        style: 'form',
        explode: false
    }, ['a', 'b']);
    assert.equal(queryStringFromPairs(comma.query), '?id=a%2Cb');
    const deep = serializeOpenApiParameter({
        name: 'filter',
        in: 'query',
        schema: { type: 'object' },
        style: 'deepObject',
        explode: true
    }, { status: 'open', owner: 'ali' });
    assert.equal(queryStringFromPairs(deep.query), '?filter%5Bstatus%5D=open&filter%5Bowner%5D=ali');
    const reserved = serializeOpenApiParameter({
        name: 'next',
        in: 'query',
        allowReserved: true,
        schema: { type: 'string' }
    }, 'https://api.test/a?x=1');
    assert.equal(queryStringFromPairs(reserved.query), '?next=https://api.test/a?x%3D1');
    const labelArray = serializeOpenApiParameter({
        name: 'id', in: 'path', style: 'label', explode: true, schema: { type: 'array', items: { type: 'string' } }
    }, ['a', 'b']);
    assert.equal(labelArray.pathValue, '.a.b');
    const matrixObject = serializeOpenApiParameter({
        name: 'coords', in: 'path', style: 'matrix', explode: true, schema: { type: 'object' }
    }, { x: 1, y: 2 });
    assert.equal(matrixObject.pathValue, ';x=1;y=2');
    const labelObject = serializeOpenApiParameter({
        name: 'coords', in: 'path', style: 'label', explode: true, schema: {type: 'object'}
    }, {x: 1, y: 2});
    assert.equal(labelObject.pathValue, '.x=1.y=2');
});
test('resolves JSON pointers, escaped names, and cyclic refs safely', () => {
    const spec: any = {
        ...baseSpec, components: {
            schemas: {
                'a/b': { type: 'string' },
                A: { $ref: '#/components/schemas/B' },
                B: { $ref: '#/components/schemas/A' },
            }
        }
    };
    assert.deepEqual(resolveJsonPointer(spec, '#/components/schemas/a~1b'), { type: 'string' });
    assert.equal(getRefName('#/components/schemas/a~1b'), 'a/b');
    const resolved = resolveReference({ $ref: '#/components/schemas/A' }, spec);
    assert.equal(typeof resolved, 'object');
    assert.equal(resolved.$ref, '#/components/schemas/A');
});
test('derives protected indicators from effective security including anonymous alternatives', () => {
    const protectedSpec: any = {...baseSpec, security: [{auth: []}]};
    assert.equal(isOperationProtected(protectedSpec, {responses: {}} as any), true);
    assert.equal(isOperationProtected(protectedSpec, {security: [], responses: {}} as any), false);
    assert.equal(isOperationProtected({...baseSpec, security: [{}, {auth: []}]}, {responses: {}} as any), false);
});
test('never applies configured auth to an explicitly public operation', () => {
    const operation: any = { security: [], responses: { '200': { description: 'ok' } } };
    const auth = applyAuthToRequest(baseSpec, {
        activeScheme: 'auth', selectedSchemes: ['auth'],
        schemeValues: { auth: { schemeId: 'auth', type: 'bearer', value: 'must-not-leak' } },
        cookieValues: {}, bearerToken: '', apiKeyName: '', apiKeyValue: '', apiKeyIn: 'header',
        basicUsername: '', basicPassword: '',
    }, { headers: {}, query: [], cookies: [] }, operation);
    assert.equal(auth.headers.Authorization, undefined);
    assert.deepEqual(auth.appliedSchemeIds, []);
});
test('applies exactly one effective OR alternative and all schemes in an AND requirement', () => {
    const spec: any = {
        ...baseSpec,
        security: [{ clientId: [], tenant: [] }, { auth: [] }],
    };
    const auth = applyAuthToRequest(spec, {
        activeScheme: 'clientId', selectedSchemes: ['clientId', 'tenant'], requirementIndex: 0,
        schemeValues: {
            clientId: { schemeId: 'clientId', type: 'apiKey', value: 'client-secret' },
            tenant: { schemeId: 'tenant', type: 'apiKey', value: 'acme' },
            auth: { schemeId: 'auth', type: 'bearer', value: 'must-not-be-added' },
        },
        cookieValues: {}, bearerToken: '', apiKeyName: '', apiKeyValue: '', apiKeyIn: 'header',
        basicUsername: '', basicPassword: '',
    }, { headers: {}, query: [], cookies: [] }, { responses: { '200': { description: 'ok' } } } as any);
    assert.equal(auth.headers['X-Client-Id'], 'client-secret');
    assert.equal(auth.headers.Authorization, undefined);
    assert.equal(queryStringFromPairs(auth.query), '?tenant=acme');
    assert.deepEqual(auth.appliedSchemeIds, ['clientId', 'tenant']);
});
test('preserves distinct auth scheme IDs and composed requirements', () => {
    const auth = applyAuthToRequest(baseSpec, {
        activeScheme: 'clientId',
        selectedSchemes: ['clientId', 'tenant', 'auth'],
        schemeValues: {
            clientId: { schemeId: 'clientId', type: 'apiKey', value: 'client-secret' },
            tenant: { schemeId: 'tenant', type: 'apiKey', value: 'acme' },
            auth: { schemeId: 'auth', type: 'bearer', value: 'jwt-token' },
        },
        cookieValues: {},
        bearerToken: '',
        apiKeyName: '',
        apiKeyValue: '',
        apiKeyIn: 'header',
        basicUsername: '',
        basicPassword: '',
    }, { responses: { '200': { description: 'ok' } } } as any);
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
                    schema: { type: 'integer' },
                },
            },
        },
        paths: {
            '/v1/catalog/geography/cities': {
                get: {
                    parameters: [
                        { name: 'province', in: 'query', schema: { type: 'string', format: 'uuid' } },
                        { name: 'keyword', in: 'query', schema: { type: 'string', maxLength: 128 } },
                        { $ref: '#/components/parameters/PageParam' },
                    ],
                    responses: { '200': { description: 'ok' } },
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
        components: { ...baseSpec.components, parameters: { PageParam: { name: 'page', in: 'query', schema: { type: 'integer' } } } },
    };
    const merged = getMergedParameters({ parameters: [{ name: 'page', in: 'query', schema: { type: 'string' } }, { name: 'keep', in: 'query', schema: { type: 'string' } }] }, { parameters: [{ $ref: '#/components/parameters/PageParam' }] }, overrideSpec);
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
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/Login' } } },
                },
            },
            schemas: { Login: { type: 'object', properties: { mobile: { type: 'string' } } } },
        },
    };
    const body = resolveRequestBody({ $ref: '#/components/requestBodies/LoginBody' }, spec);
    assert.equal(body.required, true);
    assert.equal(body.content['application/json'].schema.$ref, '#/components/schemas/Login');
});
test('generates compiling TypeScript for adversarial schema names and boolean schemas', () => {
    const schemas: Record<string, any> = {
        'user-profile': {type: 'object', required: ['friend'], properties: {friend: {$ref: '#/components/schemas/123User'}}},
        'user_profile': {type: 'string'},
        '123User': {type: 'object', properties: {'display-name': {type: 'string'}}},
        'class': false,
        'Anything': true,
    };
    const names = createTypeNameMap(Object.keys(schemas));
    assert.equal(new Set(Object.values(names).map(name => name.toLowerCase())).size, Object.keys(schemas).length);
    assert.equal(schemaToTsType(false, schemas), 'never');
    assert.equal(schemaToTsType(true, schemas), 'unknown');
    assert.doesNotMatch(toSafeGeneratedFileName('../evil/schema'), /[\\/]/);
    assert.equal(sanitizeZipEntryName('../../evil\\models.ts'), 'evil/models.ts');
    const directory = mkdtempSync(join(tmpdir(), 'opendoc-codegen-'));
    try {
        writeFileSync(join(directory, 'models.ts'), generateAllTsContent(schemas, 'fixture'));
        writeFileSync(join(directory, 'tsconfig.json'), JSON.stringify({compilerOptions: {
            strict: true, noEmit: true, target: 'ES2022', module: 'ESNext', skipLibCheck: true,
        }, include: ['models.ts']}));
        const tsc = resolve('node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
        execFileSync(tsc, ['--project', join(directory, 'tsconfig.json')], {stdio: 'pipe'});
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
});
test('generates deterministic mocks that validate for the supported constraint subset', () => {
    const schema = {
        type: 'object', required: ['code', 'count', 'tags'], additionalProperties: false,
        properties: {
            code: {type: 'string', pattern: '^[0-9]+$', minLength: 3, maxLength: 8},
            count: {type: 'integer', minimum: 5, maximum: 20, multipleOf: 5},
            tags: {type: 'array', minItems: 2, maxItems: 2, items: {type: 'string'}},
        },
    };
    const result = generateValidatedMock(schema, baseSpec);
    assert.equal(result.ok, true, result.diagnostics.map(item => item.message).join('; '));
    assert.deepEqual(result.value, {code: '12345', count: 5, tags: ['string', 'string']});
    const impossible = generateValidatedMock(false, baseSpec);
    assert.equal(impossible.ok, false);
    assert.equal(impossible.diagnostics[0].code, 'MOCK_GENERATION_IMPOSSIBLE');
});
test('applies readOnly and writeOnly semantics to request and response mocks', () => {
    const schema = {
        type: 'object', required: ['id', 'password'], properties: {
            id: {type: 'string', readOnly: true},
            password: {type: 'string', writeOnly: true},
            name: {type: 'string'},
        },
    };
    const request = generateValidatedMock(schema, baseSpec, 'request');
    const response = generateValidatedMock(schema, baseSpec, 'response');
    assert.equal(request.ok, true);
    assert.deepEqual(request.value, {password: 'string', name: 'string'});
    assert.equal(response.ok, true);
    assert.deepEqual(response.value, {id: 'string', name: 'string'});
});
test('detects vendor JSON media types', () => {
    assert.equal(isJsonMediaType('application/problem+json; charset=utf-8'), true);
    assert.equal(isJsonMediaType('application/vnd.company.resource+json'), true);
    assert.equal(isJsonMediaType('application/octet-stream'), false);
});
test('validates documents by explicit dialect and accepts pathless OAS 3.1 webhooks', () => {
    assert.equal(validateOpenApiDocument(baseSpec).valid, true);
    const invalid = validateOpenApiDocument({ paths: [] });
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some(error => error.includes('declare a supported')));
    const webhookOnly = validateOpenApiDocument({
        openapi: '3.1.1', info: {title: 'Webhooks', version: '1'},
        webhooks: {event: {post: {responses: {'200': {description: 'ok'}}}}},
    });
    assert.equal(webhookOnly.valid, true);
    assert.equal(webhookOnly.version, 'openapi3.1');
    const future = validateOpenApiDocument({openapi: '3.9.0', info: {title: 'Future', version: '1'}});
    assert.equal(future.valid, false);
    assert.ok(future.errors.some(error => error.includes('Unsupported')));
});
test('discovers OAS 3.2 QUERY and arbitrary additional operations through one operation model', () => {
    const spec: any = normalizeOpenApiSpec({
        openapi: '3.2.0', info: {title: 'OAS 3.2', version: '1'},
        paths: {'/items': {
            query: {operationId: 'queryItems', responses: {'200': {description: 'ok'}}},
            additionalOperations: {
                PURGE: {operationId: 'purgeItems', responses: {'204': {description: 'purged'}}},
            },
        }},
    });
    const operations = getDocumentOperations(spec);
    assert.deepEqual(operations.map(item => item.method), ['query', 'purge']);
    assert.equal(getOperation(spec, '/items', 'PURGE')?.operationId, 'purgeItems');
    assert.equal(buildAIContext({spec, specKey: 'oas32'}).sources.some(source => source.id === 'path:PURGE:/items'), true);
});
test('keeps the immutable raw document available beside the normalized semantic document', () => {
    const raw = 'openapi: 3.0.4\ninfo:\n  title: Raw\n  version: "1"\npaths: {}\ncomponents:\n  schemas:\n    Value:\n      type: string\n      nullable: true\n';
    const spec = parseSpecDraft(raw);
    const metadata = getRawSpecDocument(spec);
    assert.equal(metadata?.text, raw);
    assert.equal(metadata?.dialect, 'openapi3.0');
    assert.equal((metadata?.document as any).components.schemas.Value.type, 'string');
});
test('publishes an explicit capability contract for partial and transport-dependent behavior', () => {
    assert.ok(OPENAPI_CAPABILITIES.some(item => item.id === 'references.local' && item.status === 'supported'));
    assert.ok(capabilitiesFor('oas3.2', 'execute').some(item => item.id === 'operations.additional'));
    assert.ok(capabilitiesFor('oas3.1', 'execute').some(item => item.status === 'transport-dependent'));
});
test('generates canonical request snippets with placeholders and no live credentials', () => {
    const operation: any = {
        parameters: [{name: 'id', in: 'path', required: true, schema: {type: 'string'}}],
        requestBody: {content: {'application/json': {schema: {type: 'object', properties: {name: {type: 'string'}}}}}},
        responses: {'200': {description: 'ok', content: {'application/json': {}}}},
        security: [{auth: []}],
    };
    const spec: any = {...baseSpec, servers: [{url: 'https://api.example.test/v1'}], paths: {'/users/{id}': {post: operation}}, security: [{auth: []}]};
    const request = buildCodegenRequest({
        spec, path: '/users/{id}', method: 'post', operation, selectedServer: 'https://api.example.test/v1',
        activeAuth: {
            activeScheme: 'auth', selectedSchemes: ['auth'], requirementIndex: 0,
            schemeValues: {auth: {schemeId: 'auth', type: 'bearer', value: 'live-secret-token'}},
            cookieValues: {}, bearerToken: '', apiKeyName: '', apiKeyValue: '', apiKeyIn: 'header', basicUsername: '', basicPassword: '',
        },
    });
    for (const language of ['curl', 'js-fetch', 'js-axios', 'python', 'go', 'php', 'csharp', 'angular', 'laravel'] as const) {
        const snippet = generateRequestSnippet(language, request);
        assert.doesNotMatch(snippet, /live-secret-token/, language);
        assert.match(snippet, /YOUR_ACCESS_TOKEN/, language);
        assert.match(snippet, /https:\/\/api\.example\.test\/v1\/users\/YOUR_ID/, language);
    }
});
test('generates transport-correct multipart snippets instead of raw multipart headers', () => {
    const operation: any = {
        requestBody: {content: {'multipart/form-data': {
            schema: {type: 'object', properties: {metadata: {type: 'object'}, file: {type: 'string', format: 'binary'}}},
            encoding: {metadata: {contentType: 'application/json'}},
        }}},
        responses: {'200': {description: 'ok'}},
    };
    const spec: any = {...baseSpec, servers: [{url: 'https://upload.example.test'}], paths: {'/upload': {post: operation}}};
    const request = buildCodegenRequest({spec, path: '/upload', method: 'post', operation, selectedServer: 'https://upload.example.test', activeAuth: {
        activeScheme: 'none', selectedSchemes: [], schemeValues: {}, cookieValues: {}, bearerToken: '', apiKeyName: '', apiKeyValue: '', apiKeyIn: 'header', basicUsername: '', basicPassword: '',
    }});
    assert.equal(request.bodyKind, 'multipart');
    assert.match(generateRequestSnippet('curl', request), /--form/);
    assert.match(generateRequestSnippet('js-fetch', request), /new FormData/);
    assert.match(generateRequestSnippet('python', request), /files=/);
    assert.match(generateRequestSnippet('go', request), /multipart\.NewWriter/);
    assert.match(generateRequestSnippet('csharp', request), /MultipartFormDataContent/);
    assert.match(generateRequestSnippet('laravel', request), /attach/);
});
test('preserves OAS 3.0 nullable semantics during normalization', () => {
    const normalized: any = normalizeOpenApiSpec({
        openapi: '3.0.4', info: {title: 'Nullable', version: '1'}, paths: {},
        components: {schemas: {Value: {type: 'string', nullable: true}}},
    });
    assert.equal(normalized.components.schemas.Value.type, 'string');
    assert.equal(normalized.components.schemas.Value.nullable, true);
});
test('trims oversized conversations instead of deleting them', () => {
    const conversation: any = {
        id: 'conversation', specKey: 'fixture', title: 'Fixture', createdAt: 1, updatedAt: 2,
        includeAuthValues: false, trustedRunner: false,
        messages: Array.from({ length: 130 }, (_, index) => ({
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
        selectedEndpoints: [{ path: '/users/{id}', method: 'get' }]
    });
    assert.match(context.context, /UNTRUSTED|retrieved|selectedEndpointDocuments/);
    const citations = citationsFromText('GET /users/{id} is documented here [source:path:GET:/users/{id}] [source:does-not-exist]', context.sources);
    assert.deepEqual(citations.map(source => source.id), ['path:GET:/users/{id}']);
    assert.deepEqual(citationsFromText('This unrelated claim [source:path:GET:/users/{id}]', context.sources), []);
});
test('exposes operational skills and validates the OpenDoc UI action bridge', () => {
    const context = buildAIContext({ spec: baseSpec, specKey: 'fixture' });
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
    assert.deepEqual(resolveGatewaySelection(policy, { model: 'anthropic/claude-3.5-sonnet' }), { provider: 'openrouter', model: 'anthropic/claude-3.5-sonnet' });
    assert.match((resolveGatewaySelection(policy, { provider: 'anthropic', model: 'anthropic/claude-3.5-sonnet' }) as {
        error: string;
    }).error, /controlled by the gateway/);
    assert.match((resolveGatewaySelection(policy, { model: 'unapproved/model' }) as {
        error: string;
    }).error, /not allowed/);
});
test('returns only gateway-allowlisted models from discovery', () => {
    const policy = createGatewayModelPolicy({ provider: 'ollama', configuredModel: 'llama3.2', allowClientModel: true, allowedModels: 'llama3.2,qwen2.5:7b' });
    const models = allowedModelCatalog(policy, [
        { id: 'qwen2.5:7b', label: 'Qwen 2.5 7B · Local', tier: 'local' },
        { id: 'not-allowed', label: 'Not allowed', tier: 'local' },
    ]);
    assert.deepEqual(models.map(model => model.id), ['llama3.2', 'qwen2.5:7b']);
    assert.match(models[0].label, /Gateway allowed/);
    assert.equal(models[1].label, 'Qwen 2.5 7B · Local');
});
test('rejects unsafe gateway policy configuration', () => {
    assert.throws(() => createGatewayModelPolicy({ provider: 'unknown', configuredModel: 'model', allowClientModel: false }), /Unsupported AI_PROVIDER/);
    assert.throws(() => createGatewayModelPolicy({ provider: 'openrouter', configuredModel: '', allowClientModel: true, allowedModels: 'model' }), /AI_MODEL is required/);
    assert.throws(() => createGatewayModelPolicy({ provider: 'openrouter', configuredModel: 'model', allowClientModel: true, allowedModels: '*' }), /wildcard/);
    assert.throws(() => createGatewayModelPolicy({ provider: 'openrouter', configuredModel: 'default', allowClientModel: true, allowedModels: 'other' }), /must include AI_MODEL/);
});
test('formats bounded Runner results for the conversation without exposing auth headers', () => {
    const result = formatOpenDocUIRunnerResult({ actionId: 'a1', specKey: 'fixture', path: '/users', method: 'get', result: {
            status: 200, headers: { 'authorization': 'Bearer secret' }, body: 'Authorization: Bearer secret\\n{"ok":true}', isJson: true, durationMs: 12,
        } });
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
    const encoded = serializeUrlEncodedBody({ name: 'OpenDoc', tags: ['one', 'two'], nested: { enabled: true } });
    assert.match(encoded, /name=OpenDoc/);
    assert.match(encoded, /tags=one/);
    assert.match(encoded, /tags=two/);
    assert.match(encoded, /nested=%7B%22enabled%22%3Atrue%7D/);
    assert.deepEqual(parseStructuredBody('tags=one&tags=two', 'application/x-www-form-urlencoded'), { tags: ['one', 'two'] });
});
test('uses inline descriptions until the tooltip threshold', () => {
    assert.equal(usesDescriptionTooltip('Short field description'), false);
    assert.equal(usesDescriptionTooltip('x'.repeat(DESCRIPTION_TOOLTIP_THRESHOLD)), false);
    assert.equal(usesDescriptionTooltip('x'.repeat(DESCRIPTION_TOOLTIP_THRESHOLD + 1)), true);
});
test('creates typed defaults for recursive object and array schemas', () => {
    const schema = { type: 'object', properties: { name: { type: 'string', default: 'OpenDoc' }, items: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' } } } } } };
    const value: any = defaultBodyValue(schema, baseSpec);
    assert.equal(value.name, 'OpenDoc');
    assert.deepEqual(value.items, []);
});
console.log('All OpenDoc UI unit tests passed.');
