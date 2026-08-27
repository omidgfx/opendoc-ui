import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {
    applyAuthToRequest,
    createEmptyAuth,
    isOperationAuthenticated,
    isOperationProtected,
    operationUsesCookieAuthentication,
} from '../src/utils/runner/auth';
import {buildAIContext, buildAISystemPrompt, citationsFromText} from '../src/utils/ai/context';
import {formatOpenDocUIRunnerResult, parseOpenDocUIActions} from '../src/utils/ai/bridge';
import {allowedModelCatalog, createGatewayModelPolicy, resolveGatewaySelection} from '../server/ai-gateway-policy';
import {trimAIConversation} from '../src/utils/ai/storage';
import {
    bodyEditorModeForMediaType,
    bodyTypeSupportsForm,
    formatBodyText,
    getBodyEditorLanguage,
    getBodyFormat,
    parseStructuredBody,
    serializeUrlEncodedBody,
    validateBodyText,
} from '../src/utils/runner/bodyFormats';
import {
    containsMarkdown,
    DESCRIPTION_TOOLTIP_THRESHOLD,
    defaultBodyValue,
    usesDescriptionTooltip,
} from '../src/components/endpoint/ExamineTab/RecursiveBodyForm';
import {enumDropdownOptions} from '../src/utils/enumOptions';
import {
    collectReferenceIssues,
    createBundledOpenApiDocument,
    getDocumentOperations,
    getMergedParameters,
    getOperation,
    getRefName,
    isJsonMediaType,
    normalizeOpenApiSpec,
    queryStringFromPairs,
    resolveJsonPointer,
    resolveReference,
    resolveReferenceResult,
    resolveRequestBody,
    serializeOpenApiParameter,
    validateOpenApiDocument,
} from '@/src/utils/openapi';
import {compileBrowserRequest, parameterStateKey} from '@/src/utils/runner/requestPlan';
import {
    createTypeNameMap,
    generateAllTsContent,
    schemaToTsType,
    toSafeGeneratedFileName,
} from '@/src/utils/export/schemaExport';
import {sanitizeZipEntryName} from '@/src/utils/export/zip';
import {generateValidatedMock, getMockSnippet} from '@/src/utils/runner/mockGenerator';
import {OPENAPI_CAPABILITIES, capabilitiesFor} from '@/src/utils/openapi/capabilities';
import {collectSchemaBranchChoices} from '@/src/utils/schema/branchChoices';
import {
    expandAllOfBranches,
    describeAllOfComposition,
    detectSchemaCombinator,
    COMBINATOR_META,
    mergeAnyOfBranchSchemas,
} from '@/src/utils/schema/combinators';
import {
    dimmedLinesForObjectCode,
    dimmedLinesForFieldAllOfFocus,
    exampleEncodingOf,
} from '@/src/utils/schema/exampleEncodings';
import {DEFAULT_APP_PREFERENCES, normalizeAppPreferences} from '@/src/utils/storage/preferences';
import {
    applySchemaBranchSelections,
    propertyNamesOfSchema,
    readSchemaAllOfFocus,
    writeSchemaAllOfFocus,
    writeSchemaBranchSelection,
} from '@/src/utils/schema/branchSelections';
import {inlineMenusForCode} from '@/src/components/schema/inlineMenus';
import {buildCodegenRequest, generateRequestSnippet} from '@/src/utils/export/codeGeneration';
import {parseSpecDraft} from '@/src/utils/specification/appSpec';
import {getRawSpecDocument} from '@/src/utils/specification/specSource';
import {parseEmojis} from '@/src/features/emoji/index';
import {buildTagTree, endpointMatchesSidebarFilter, normalizeSidebarConfig} from '@/src/utils/sidebar/tree';
import {
    createEndpointNote,
    ENDPOINT_NOTE_COLORS,
    MAX_NOTE_CONTENT_CHARS,
    MAX_NOTE_TITLE_CHARS,
    MAX_NOTES_PER_ENDPOINT,
    buildEndpointNotesExport,
    classifyEndpointNotesBySpec,
    endpointHasNoteCapacity,
    endpointNoteKey,
    normalizeStoredEndpointNote,
    noteCharacterCount,
    endpointNoteTitle,
    parseEndpointNotesExport,
    reassignEndpointNote,
} from '@/src/utils/notes/index';
import {
    buildDownloaderUrl,
    normalizeDownloaderTemplate,
    normalizeRemoteSpecUrl,
    remoteSpecKey,
    replaceUrlProtocol,
} from '@/src/utils/specification/remoteSpec';
import {formatEngineErrorPath, summarizeEngineValidationErrors} from '@/src/utils/openapi/engine';
import {registerSpecDiagnostics} from '@/src/utils/specification/specSource';
import {createResponseExampleHelpers} from '@/src/utils/endpoint/responseExamples';
import {positionFor} from '@/src/components/common/tooltip/tooltipPosition';
import {oauthAuthorizationFlow, supportsInteractiveAuthorization} from '@/src/utils/runner/oauthFlow';
import {createLlmsText} from '@/src/utils/export/llmsExport';
import {
    declaredContentIsBinary,
    isBinaryResponseMediaType,
    isTextualResponseMediaType,
    responseHeadersIndicateBinary,
} from '@/src/utils/runner/runnerResponse';
import {analyzeRunnerCompatibility} from '@/src/utils/runner/runnerCompatibility';
import {generateSmartRoute, parseSmartRoute} from '@/src/utils/routing';
import {
    describeNotConstraint,
    flattenSchemaProperties,
    RECURSIVE_SCHEMA_ICON,
    schemaIsRecursive,
    schemaVariantLabel,
} from '@/src/utils/schemaProperties';
import {runnerVariantIndexForValue, runnerVariantMatchesValue} from '@/src/utils/runner/recursiveBody';
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
        spec,
        path: '/users/{id}',
        method: 'get',
        operation,
        selectedServer: 'https://api.example.test',
        activeAuth: {
            activeScheme: 'auth',
            selectedSchemes: ['auth'],
            schemeValues: {auth: {schemeId: 'auth', type: 'bearer', value: 'must-not-leak'}},
            cookieValues: {},
            bearerToken: '',
            apiKeyName: '',
            apiKeyValue: '',
            apiKeyIn: 'header',
            basicUsername: '',
            basicPassword: '',
        },
        parameterValues: {[parameterStateKey('header', 'region')]: 'eu'},
        body: '{broken json',
        bodyType: 'application/json',
    });
    assert.equal(plan.url, 'https://api.example.test/users/{id}');
    assert.equal(plan.headers.Authorization, undefined);
    assert.equal(plan.headers.region, 'eu');
    assert.equal(plan.headers.Accept, 'application/problem+json, */*');
    assert.ok(plan.diagnostics.some(item => item.code === 'RUN_REQUIRED_PARAMETER_MISSING' && item.blocking));
    assert.ok(plan.diagnostics.some(item => item.code === 'RUN_PARAMETER_PATTERN_MISMATCH'));
    assert.ok(plan.diagnostics.some(item => item.code === 'RUN_BODY_JSON_INVALID'));
    // GET bodies are a browser limitation, not a semantic validation failure.
    assert.equal(plan.body, null);
});
test('serializes admin-style integer, enum, UUID, text and boolean query parameters permissively', () => {
    const operation: any = {
        parameters: [
            {$ref: '#/components/parameters/PageParam'},
            {name: 'sort', in: 'query', schema: {type: 'string', enum: ['name', '-name']}},
            {name: 'filter[province]', in: 'query', schema: {type: 'string', format: 'uuid'}},
            {name: 'filter[keyword]', in: 'query', schema: {type: 'string', maxLength: 128}},
            {name: 'filter[is_active]', in: 'query', schema: {type: 'boolean'}},
        ],
        responses: {'200': {description: 'ok', content: {'application/json': {}}}},
    };
    const spec: any = {
        ...baseSpec,
        servers: [{url: 'https://api.example.test'}],
        paths: {'/cities': {get: operation}},
        components: {
            ...baseSpec.components,
            parameters: {PageParam: {name: 'page', in: 'query', schema: {type: 'integer'}}},
        },
    };
    const plan = compileBrowserRequest({
        spec,
        path: '/cities',
        method: 'get',
        operation,
        selectedServer: 'https://api.example.test',
        activeAuth: createEmptyAuth(),
        parameterValues: {
            'query:page': 'not-an-integer',
            'query:sort': 'unsupported-sort',
            'query:filter[province]': 'not-a-uuid',
            'query:filter[keyword]': 'x'.repeat(140),
            'query:filter[is_active]': 'false',
        },
    });
    const url = new URL(plan.url);
    assert.equal(url.searchParams.get('page'), 'not-an-integer');
    assert.equal(url.searchParams.get('sort'), 'unsupported-sort');
    assert.equal(url.searchParams.get('filter[province]'), 'not-a-uuid');
    assert.equal(url.searchParams.get('filter[keyword]'), 'x'.repeat(140));
    assert.equal(url.searchParams.get('filter[is_active]'), 'false');
});
test('resolves operation server variables ahead of path and root servers', () => {
    const operation: any = {
        servers: [
            {
                url: 'https://{region}.example.test/{version}',
                variables: {
                    region: {default: 'eu', enum: ['eu', 'us']},
                    version: {default: 'v2'},
                },
            },
        ],
        responses: {'200': {description: 'ok'}},
    };
    const spec: any = {...baseSpec, servers: [{url: 'https://root.example.test'}], paths: {'/ping': {get: operation}}};
    const plan = compileBrowserRequest({
        spec,
        path: '/ping',
        method: 'get',
        operation,
        selectedServer: 'https://root.example.test',
        serverVariables: {region: 'us'},
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
    });
    assert.equal(plan.url, 'https://us.example.test/v2/ping');
    assert.equal(plan.intent.server.source, 'operation');
});
test('preserves Swagger 2 collection formats and unspecified media types', () => {
    const normalized: any = normalizeOpenApiSpec({
        swagger: '2.0',
        info: {title: 'Swagger', version: '1'},
        host: 'api.example.test',
        basePath: '/v1',
        consumes: ['application/json'],
        produces: ['application/json'],
        paths: {
            '/items': {
                get: {
                    consumes: [],
                    produces: [],
                    schemes: ['http'],
                    parameters: [
                        {name: 'ids', in: 'query', type: 'array', items: {type: 'string'}, collectionFormat: 'tsv'},
                    ],
                    responses: {'200': {description: 'ok', schema: {type: 'array', items: {type: 'string'}}}},
                },
            },
        },
    });
    const operation = normalized.paths['/items'].get;
    const serialized = serializeOpenApiParameter(operation.parameters[0], ['a', 'b']);
    assert.equal(queryStringFromPairs(serialized.query), '?ids=a%09b');
    assert.deepEqual(operation.servers, [{url: 'http://api.example.test/v1'}]);
    assert.ok(operation.responses['200'].content['*/*']);
});
test('serializes OpenAPI query arrays and objects', () => {
    const repeated = serializeOpenApiParameter(
        {
            name: 'id',
            in: 'query',
            schema: {type: 'array'},
            style: 'form',
            explode: true,
        },
        ['a', 'b'],
    );
    assert.equal(queryStringFromPairs(repeated.query), '?id=a&id=b');
    const comma = serializeOpenApiParameter(
        {
            name: 'id',
            in: 'query',
            schema: {type: 'array'},
            style: 'form',
            explode: false,
        },
        ['a', 'b'],
    );
    assert.equal(queryStringFromPairs(comma.query), '?id=a%2Cb');
    const deep = serializeOpenApiParameter(
        {
            name: 'filter',
            in: 'query',
            schema: {type: 'object'},
            style: 'deepObject',
            explode: true,
        },
        {status: 'open', owner: 'ali'},
    );
    assert.equal(queryStringFromPairs(deep.query), '?filter%5Bstatus%5D=open&filter%5Bowner%5D=ali');
    const reserved = serializeOpenApiParameter(
        {
            name: 'next',
            in: 'query',
            allowReserved: true,
            schema: {type: 'string'},
        },
        'https://api.test/a?x=1',
    );
    assert.equal(queryStringFromPairs(reserved.query), '?next=https://api.test/a?x%3D1');
    const labelArray = serializeOpenApiParameter(
        {
            name: 'id',
            in: 'path',
            style: 'label',
            explode: true,
            schema: {type: 'array', items: {type: 'string'}},
        },
        ['a', 'b'],
    );
    assert.equal(labelArray.pathValue, '.a.b');
    const matrixObject = serializeOpenApiParameter(
        {
            name: 'coords',
            in: 'path',
            style: 'matrix',
            explode: true,
            schema: {type: 'object'},
        },
        {x: 1, y: 2},
    );
    assert.equal(matrixObject.pathValue, ';x=1;y=2');
    const labelObject = serializeOpenApiParameter(
        {
            name: 'coords',
            in: 'path',
            style: 'label',
            explode: true,
            schema: {type: 'object'},
        },
        {x: 1, y: 2},
    );
    assert.equal(labelObject.pathValue, '.x=1.y=2');
});
test('resolves JSON pointers, escaped names, and cyclic refs safely', () => {
    const spec: any = {
        ...baseSpec,
        components: {
            schemas: {
                'a/b': {type: 'string'},
                A: {$ref: '#/components/schemas/B'},
                B: {$ref: '#/components/schemas/A'},
            },
        },
    };
    assert.deepEqual(resolveJsonPointer(spec, '#/components/schemas/a~1b'), {type: 'string'});
    assert.equal(getRefName('#/components/schemas/a~1b'), 'a/b');
    const resolved = resolveReference({$ref: '#/components/schemas/A'}, spec);
    assert.equal(typeof resolved, 'object');
    assert.equal(resolved.$ref, '#/components/schemas/A');
    assert.equal(resolveReferenceResult({$ref: '#/components/schemas/A'}, spec).status, 'circular');
    assert.doesNotThrow(() => JSON.stringify(createBundledOpenApiDocument(spec)));
});
test('preserves unresolved external references without recursive crashes', () => {
    const root = JSON.parse(readFileSync(resolve('tests/fixtures/external-label-root.json'), 'utf8'));
    const label = root.components.schemas.Label;
    const result = resolveReferenceResult(label, root);
    assert.equal(result.status, 'unresolved');
    assert.equal(result.ref, 'label-base.json#/components/schemas/Label');
    assert.ok(collectReferenceIssues(root).some(issue => issue.ref.includes('label-base.json')));
    const before = JSON.stringify(root);
    const bundled = createBundledOpenApiDocument(root);
    assert.equal(bundled.components.schemas.Label.$ref, 'label-base.json#/components/schemas/Label');
    assert.equal(JSON.stringify(root), before);
});
test('discovers native OAuth authorization-code and implicit browser flows', () => {
    assert.equal(
        oauthAuthorizationFlow({
            type: 'oauth2',
            flows: {
                authorizationCode: {
                    authorizationUrl: 'https://auth.example.test/authorize',
                    tokenUrl: 'https://auth.example.test/token',
                },
            },
        })?.kind,
        'authorizationCode',
    );
    assert.equal(
        oauthAuthorizationFlow({
            type: 'oauth2',
            flows: {implicit: {authorizationUrl: 'https://auth.example.test/authorize'}},
        })?.kind,
        'implicit',
    );
    assert.equal(
        oauthAuthorizationFlow({type: 'oauth2', flows: {clientCredentials: {tokenUrl: 'https://auth'}}}),
        null,
    );
    assert.equal(
        supportsInteractiveAuthorization({
            type: 'openIdConnect',
            openIdConnectUrl: 'https://auth.example.test/.well-known/openid-configuration',
        }),
        true,
    );
});
test('derives protected indicators from effective security including anonymous alternatives', () => {
    const protectedSpec: any = {...baseSpec, security: [{auth: []}]};
    assert.equal(isOperationProtected(protectedSpec, {responses: {}} as any), true);
    assert.equal(isOperationProtected(protectedSpec, {security: [], responses: {}} as any), false);
    assert.equal(isOperationProtected({...baseSpec, security: [{}, {auth: []}]}, {responses: {}} as any), false);
});
test('treats cookie authorization as browser-managed information without Runner warnings', () => {
    const operation: any = {security: [{cookieAuth: []}], responses: {'200': {description: 'ok'}}};
    const spec: any = {
        ...baseSpec,
        paths: {'/session': {get: operation}},
        components: {securitySchemes: {cookieAuth: {type: 'apiKey', in: 'cookie', name: 'session'}}},
    };
    const auth: any = {
        ...createEmptyAuth(),
        activeScheme: 'cookieAuth',
        selectedSchemes: ['cookieAuth'],
        schemeValues: {cookieAuth: {schemeId: 'cookieAuth', type: 'apiKey', in: 'cookie', name: 'session'}},
    };
    const plan = compileBrowserRequest({
        spec,
        path: '/session',
        method: 'get',
        operation,
        selectedServer: 'https://api.example.test',
        activeAuth: auth,
    });
    assert.equal(operationUsesCookieAuthentication(spec, operation), true);
    assert.equal(plan.fetchCredentials, 'include');
    assert.equal(
        plan.diagnostics.some(item => /COOKIE|AUTH_NOTICE/.test(item.code)),
        false,
    );
});
test('marks protected operations authorized only when every selected requirement is configured', () => {
    const spec: any = {...baseSpec, security: [{clientId: [], tenant: []}]};
    const operation: any = {responses: {'200': {description: 'ok'}}};
    const partial: any = {
        activeScheme: 'clientId',
        selectedSchemes: ['clientId', 'tenant'],
        requirementIndex: 0,
        schemeValues: {
            clientId: {schemeId: 'clientId', type: 'apiKey', value: 'configured'},
            tenant: {schemeId: 'tenant', type: 'apiKey', value: ''},
        },
        cookieValues: {},
        bearerToken: '',
        apiKeyName: '',
        apiKeyValue: '',
        apiKeyIn: 'header',
        basicUsername: '',
        basicPassword: '',
    };
    assert.equal(isOperationAuthenticated(spec, partial, operation), false);
    partial.schemeValues.tenant.value = 'configured';
    assert.equal(isOperationAuthenticated(spec, partial, operation), true);
    assert.equal(isOperationAuthenticated(spec, partial, {...operation, security: []}), false);
});
test('never applies configured auth to an explicitly public operation', () => {
    const operation: any = {security: [], responses: {'200': {description: 'ok'}}};
    const auth = applyAuthToRequest(
        baseSpec,
        {
            activeScheme: 'auth',
            selectedSchemes: ['auth'],
            schemeValues: {auth: {schemeId: 'auth', type: 'bearer', value: 'must-not-leak'}},
            cookieValues: {},
            bearerToken: '',
            apiKeyName: '',
            apiKeyValue: '',
            apiKeyIn: 'header',
            basicUsername: '',
            basicPassword: '',
        },
        {headers: {}, query: [], cookies: []},
        operation,
    );
    assert.equal(auth.headers.Authorization, undefined);
    assert.deepEqual(auth.appliedSchemeIds, []);
});
test('applies exactly one effective OR alternative and all schemes in an AND requirement', () => {
    const spec: any = {
        ...baseSpec,
        security: [{clientId: [], tenant: []}, {auth: []}],
    };
    const auth = applyAuthToRequest(
        spec,
        {
            activeScheme: 'clientId',
            selectedSchemes: ['clientId', 'tenant'],
            requirementIndex: 0,
            schemeValues: {
                clientId: {schemeId: 'clientId', type: 'apiKey', value: 'client-secret'},
                tenant: {schemeId: 'tenant', type: 'apiKey', value: 'acme'},
                auth: {schemeId: 'auth', type: 'bearer', value: 'must-not-be-added'},
            },
            cookieValues: {},
            bearerToken: '',
            apiKeyName: '',
            apiKeyValue: '',
            apiKeyIn: 'header',
            basicUsername: '',
            basicPassword: '',
        },
        {headers: {}, query: [], cookies: []},
        {responses: {'200': {description: 'ok'}}} as any,
    );
    assert.equal(auth.headers['X-Client-Id'], 'client-secret');
    assert.equal(auth.headers.Authorization, undefined);
    assert.equal(queryStringFromPairs(auth.query), '?tenant=acme');
    assert.deepEqual(auth.appliedSchemeIds, ['clientId', 'tenant']);
});
test('preserves distinct auth scheme IDs and composed requirements', () => {
    const auth = applyAuthToRequest(
        baseSpec,
        {
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
        },
        {responses: {'200': {description: 'ok'}}} as any,
    );
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
    assert.deepEqual(
        params.map(param => param.name),
        ['province', 'keyword', 'page'],
    );
    assert.equal(params.find(param => param.name === 'page')?.schema.type, 'integer');
    const overrideSpec: any = {
        ...baseSpec,
        components: {
            ...baseSpec.components,
            parameters: {PageParam: {name: 'page', in: 'query', schema: {type: 'integer'}}},
        },
    };
    const merged = getMergedParameters(
        {
            parameters: [
                {name: 'page', in: 'query', schema: {type: 'string'}},
                {name: 'keep', in: 'query', schema: {type: 'string'}},
            ],
        },
        {parameters: [{$ref: '#/components/parameters/PageParam'}]},
        overrideSpec,
    );
    assert.deepEqual(
        merged.map(param => param.name),
        ['page', 'keep'],
    );
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
test('generates compiling TypeScript for adversarial schema names and boolean schemas', () => {
    const schemas: Record<string, any> = {
        'user-profile': {
            type: 'object',
            required: ['friend'],
            properties: {friend: {$ref: '#/components/schemas/123User'}},
        },
        user_profile: {type: 'string'},
        '123User': {type: 'object', properties: {'display-name': {type: 'string'}}},
        class: false,
        Anything: true,
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
        writeFileSync(
            join(directory, 'tsconfig.json'),
            JSON.stringify({
                compilerOptions: {
                    strict: true,
                    noEmit: true,
                    target: 'ES2022',
                    module: 'ESNext',
                    skipLibCheck: true,
                },
                include: ['models.ts'],
            }),
        );
        // Execute the JavaScript CLI through Node instead of spawning a .cmd
        // shim, which is not directly executable by execFileSync on Windows.
        const tscCli = resolve('node_modules', 'typescript', 'bin', 'tsc');
        execFileSync(process.execPath, [tscCli, '--project', join(directory, 'tsconfig.json')], {stdio: 'pipe'});
    } finally {
        rmSync(directory, {recursive: true, force: true});
    }
});
test('generates deterministic mocks that validate for the supported constraint subset', () => {
    const schema = {
        type: 'object',
        required: ['code', 'count', 'tags'],
        additionalProperties: false,
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
test('keeps explicit response examples visible when a source declares an unknown schema type', () => {
    const spec: any = {
        ...baseSpec,
        components: {
            ...baseSpec.components,
            schemas: {
                Page: {
                    type: 'object',
                    properties: {
                        previous: {
                            type: ['url', 'null'],
                            example: 'https://example.com/items?page=1',
                        },
                    },
                },
            },
        },
    };
    const snippet = getMockSnippet({$ref: '#/components/schemas/Page'}, spec, 'response');
    assert.deepEqual(JSON.parse(snippet), {previous: 'https://example.com/items?page=1'});
});
test('applies readOnly and writeOnly semantics to request and response mocks', () => {
    const schema = {
        type: 'object',
        required: ['id', 'password'],
        properties: {
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
test('formats response examples with stable indentation and OAS 3.2 dataValue support', () => {
    const helpers = createResponseExampleHelpers(baseSpec);
    const snippet = helpers.getResponseExampleSnippet(
        {type: 'object'},
        {examples: {Default: {dataValue: {pet: {id: 7, name: 'Milo'}}}}},
        'application/json',
    );
    assert.equal(snippet, '{\n    "pet": {\n        "id": 7,\n        "name": "Milo"\n    }\n}');
    const serialized = helpers.getResponseExampleSnippet(
        {type: 'object'},
        {examples: {Default: {serializedValue: '{"ok":true}'}}},
        'application/json',
    );
    assert.equal(serialized, '{\n    "ok": true\n}');
});
test('detects vendor JSON media types', () => {
    assert.equal(isJsonMediaType('application/problem+json; charset=utf-8'), true);
    assert.equal(isJsonMediaType('application/vnd.company.resource+json'), true);
    assert.equal(isJsonMediaType('application/octet-stream'), false);
});
test('normalizes parser error paths without assuming an array shape', () => {
    assert.equal(formatEngineErrorPath(['paths', '/pets', 'get']), 'paths//pets/get');
    assert.equal(formatEngineErrorPath('/paths/~1pets/get'), '/paths/~1pets/get');
    assert.equal(formatEngineErrorPath(42), '42');
    assert.equal(formatEngineErrorPath(undefined), undefined);
});
test('collapses noisy OpenAPI meta-schema branch errors', () => {
    const noisy = Array.from({length: 2000}, (_, index) => ({
        code: 'SCHEMA',
        message: index % 2 ? 'if must match "else" schema' : `Property type is not expected to be here`,
        path: '/components/schemas/Pet',
    }));
    noisy.push({code: 'ACTIONABLE', message: 'A real actionable validation issue', path: '/paths'});
    noisy.push({code: 'ACTIONABLE', message: 'A real actionable validation issue', path: '/paths'});
    const summarized = summarizeEngineValidationErrors(noisy);
    assert.equal(summarized.filter(item => item.code === 'OAS_ENGINE_ACTIONABLE').length, 1);
    assert.equal(
        summarized.some(item => item.code === 'OAS_ENGINE_VALIDATION_SUMMARY'),
        true,
    );
    assert.ok(summarized.length <= 13);
});
test('keeps document-wide parser noise out of endpoint Runner notices', () => {
    const spec: any = structuredClone(baseSpec);
    registerSpecDiagnostics(spec, [
        {code: 'OAS_ENGINE_VALIDATION', severity: 'warning', message: 'Property type is not expected to be here'},
    ]);
    const operation = spec.paths['/users/{id}'].get;
    const plan = compileBrowserRequest({
        spec,
        path: '/users/{id}',
        method: 'get',
        operation,
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
        parameterValues: {[parameterStateKey('path', 'id')]: '42'},
    });
    assert.equal(
        plan.diagnostics.some(item => item.code.startsWith('OAS_ENGINE_')),
        false,
    );
});
test('validates documents by explicit dialect and accepts pathless OAS 3.1 webhooks', () => {
    assert.equal(validateOpenApiDocument(baseSpec).valid, true);
    const invalid = validateOpenApiDocument({paths: []});
    assert.equal(invalid.valid, false);
    assert.ok(invalid.errors.some(error => error.includes('declare a supported')));
    const webhookOnly = validateOpenApiDocument({
        openapi: '3.1.1',
        info: {title: 'Webhooks', version: '1'},
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
        openapi: '3.2.0',
        info: {title: 'OAS 3.2', version: '1'},
        paths: {
            '/items': {
                query: {operationId: 'queryItems', responses: {'200': {description: 'ok'}}},
                additionalOperations: {
                    PURGE: {operationId: 'purgeItems', responses: {'204': {description: 'purged'}}},
                },
            },
        },
    });
    const operations = getDocumentOperations(spec);
    assert.deepEqual(
        operations.map(item => item.method),
        ['query', 'purge'],
    );
    assert.equal(getOperation(spec, '/items', 'PURGE')?.operationId, 'purgeItems');
    assert.equal(getOperation(spec, '/items', 'query')?.operationId, 'queryItems');
    assert.equal(
        buildAIContext({spec, specKey: 'oas32'}).sources.some(source => source.id === 'path:PURGE:/items'),
        true,
    );
});
test('loads the OAS 3.2 QUERY fixture and keeps a request body on QUERY in the browser plan', () => {
    const raw = readFileSync(resolve('tests/fixtures/oas32-query-method.yaml'), 'utf8');
    const draft = parseSpecDraft(raw);
    const spec: any = normalizeOpenApiSpec(draft as any);
    const operations = getDocumentOperations(spec);
    assert.equal(operations.length, 1);
    assert.equal(operations[0].method, 'query');
    assert.equal(operations[0].operation.operationId, 'searchProducts');
    const operation = getOperation(spec, '/products', 'query');
    assert.ok(operation?.requestBody);
    const plan = compileBrowserRequest({
        spec,
        path: '/products',
        method: 'query',
        operation: operation!,
        selectedServer: 'https://api.example.com',
        activeAuth: createEmptyAuth(),
        parameterValues: {},
        headers: {},
        body: JSON.stringify({filter: {category: 'shoes'}, limit: 5}),
        bodyType: 'application/json',
    });
    assert.equal(plan.method, 'QUERY');
    assert.equal(typeof plan.body, 'string');
    assert.match(String(plan.body), /shoes/);
    assert.ok(!plan.diagnostics.some(item => item.code === 'RUN_BROWSER_METHOD_BODY_UNSUPPORTED'));
    const getWithBody = compileBrowserRequest({
        spec: {...spec, paths: {'/products': {get: operation}}},
        path: '/products',
        method: 'get',
        operation: operation!,
        selectedServer: 'https://api.example.com',
        activeAuth: createEmptyAuth(),
        parameterValues: {},
        headers: {},
        body: JSON.stringify({filter: {category: 'shoes'}}),
        bodyType: 'application/json',
    });
    assert.equal(getWithBody.body, null);
    assert.ok(getWithBody.diagnostics.some(item => item.code === 'RUN_BROWSER_METHOD_BODY_UNSUPPORTED'));
    const codegen = buildCodegenRequest({
        spec,
        path: '/products',
        method: 'query',
        operation: operation!,
        selectedServer: 'https://api.example.com',
        activeAuth: createEmptyAuth(),
    });
    assert.equal(codegen.method, 'QUERY');
    assert.ok(codegen.body && /category|filter|shoes|limit/i.test(String(codegen.body)));
    const curl = generateRequestSnippet('curl', codegen);
    assert.match(curl, /QUERY/);
    const fetchJs = generateRequestSnippet('js-fetch', codegen);
    assert.match(fetchJs, /["']QUERY["']/);
    const report = analyzeRunnerCompatibility(spec);
    assert.ok(report.findings.some(item => item.id === 'query-cors-preflight'));
    assert.ok(!report.findings.some(item => item.id === 'get-head-request-bodies'));
    assert.ok(OPENAPI_CAPABILITIES.some(item => item.id === 'operations.query' && item.status === 'supported'));
});
test('generates and parses clean routes for endpoints, notes, and compatibility views', () => {
    const operation: any = {operationId: 'listItems', responses: {'200': {description: 'ok'}}};
    const spec: any = {...baseSpec, paths: {'/items': {get: operation}}};
    assert.equal(
        generateSmartRoute({
            parsableKey: 'Route API',
            showHome: false,
            showAbout: false,
            showAssistant: false,
            showSchemaExplorer: false,
            endpoint: {path: '/items', method: 'get'},
            tab: 'docs',
            schemaModals: [],
            activeSpec: spec,
        }),
        '#/parsable/Route%20API/api/listItems',
    );
    assert.equal(
        generateSmartRoute({
            parsableKey: 'Route API',
            showHome: false,
            showAbout: false,
            showAssistant: false,
            showSchemaExplorer: false,
            showNotes: true,
            endpoint: null,
            tab: 'docs',
            schemaModals: [],
        }),
        '#/parsable/Route%20API/notes',
    );
    const notes = parseSmartRoute('#/parsable/Route%20API/notes');
    assert.equal(notes.showNotes, true);
    const compatibility = parseSmartRoute('#/parsable/Route%20API/compatibility');
    assert.equal(compatibility.parsableKey, 'Route API');
    assert.equal(compatibility.showCompatibility, true);
    // Legacy path-based deep links are still parsed for backward compatibility.
    const legacy = parseSmartRoute('/parsable/Route%20API/compatibility');
    assert.equal(legacy.parsableKey, 'Route API');
    assert.equal(legacy.showCompatibility, true);
});
test('exports specification-native operations and schemas as llms.txt without mutating the source', () => {
    const spec: any = {
        ...baseSpec,
        info: {title: 'LLM API', version: '2', description: 'Reference documentation'},
        paths: {
            '/items': {
                get: {
                    summary: 'List items',
                    parameters: [{name: 'limit', in: 'query', schema: {type: 'integer'}}],
                    responses: {'200': {description: 'ok', content: {'application/json': {}}}},
                },
            },
        },
        components: {schemas: {Item: {type: 'object', properties: {id: {type: 'string'}}}}},
    };
    const before = JSON.stringify(spec);
    const output = createLlmsText(spec);
    assert.match(output, /# LLM API/);
    assert.match(output, /### GET \/items/);
    assert.match(output, /### Item/);
    assert.equal(JSON.stringify(spec), before);
});
test('keeps the immutable raw document available beside the normalized semantic document', () => {
    const raw =
        'openapi: 3.0.4\ninfo:\n  title: Raw\n  version: "1"\npaths: {}\ncomponents:\n  schemas:\n    Value:\n      type: string\n      nullable: true\n';
    const spec = parseSpecDraft(raw);
    const metadata = getRawSpecDocument(spec);
    assert.equal(metadata?.text, raw);
    assert.equal(metadata?.dialect, 'openapi3.0');
    assert.equal((metadata?.document as any).components.schemas.Value.type, 'string');
});
test('collects field-level oneOf and allOf choices and applies oneOf picks without collapsing allOf', () => {
    const resolve = (item: any) => item;
    const getRefName = (ref: string) => ref.split('/').pop() || ref;
    const schema = {
        type: 'object',
        properties: {
            payment: {
                allOf: [
                    {type: 'object', properties: {amount: {type: 'number'}, currency: {type: 'string'}}},
                    {
                        type: 'object',
                        properties: {
                            method: {
                                oneOf: [
                                    {type: 'object', title: 'Card', properties: {last4: {type: 'string'}}},
                                    {type: 'object', title: 'Cash', properties: {tendered: {type: 'number'}}},
                                ],
                            },
                        },
                    },
                ],
            },
            note: {type: 'string'},
        },
    };
    const choices = collectSchemaBranchChoices(schema, resolve, getRefName);
    const kinds = choices.map(c => `${c.kind}:${c.path}`);
    assert.ok(kinds.includes('allOf:payment'));
    assert.ok(kinds.includes('oneOf:payment.method'));
    const allOfPayment = choices.find(c => c.kind === 'allOf' && c.path === 'payment')!;
    assert.equal(allOfPayment.options[0].index, -1);
    assert.equal(allOfPayment.options[0].label, 'Combined');
    assert.ok(allOfPayment.options.length >= 3);

    const key = 'test:allof-field';
    writeSchemaBranchSelection(key, 'payment.method', 1);
    const applied = applySchemaBranchSelections(schema, key, resolve);
    assert.equal(applied.properties.payment.allOf[1].properties.method.title, 'Cash');
    // allOf composition remains — both parts still present after oneOf pick
    assert.equal(applied.properties.payment.allOf.length, 2);

    writeSchemaAllOfFocus(key, 'payment', 0);
    assert.equal(readSchemaAllOfFocus(key).payment, 0);
    const owned = propertyNamesOfSchema(schema.properties.payment.allOf[0], resolve);
    assert.ok(owned.has('amount'));
    assert.ok(owned.has('currency'));
    assert.ok(!owned.has('method'));

    writeSchemaAllOfFocus(key, 'payment', null);
    assert.equal(readSchemaAllOfFocus(key).payment, null);

    const code = JSON.stringify({payment: {amount: 10, currency: 'USD', method: {tendered: 20}}, note: 'hi'}, null, 2);
    const menus = inlineMenusForCode(code, key, choices, 'json');
    assert.ok(menus.menus.some(m => m.id.includes('allOf:payment')));
    assert.ok(menus.menus.some(m => m.id.includes('oneOf:payment.method')));

    // Op-8 style: field allOf is a single $ref to a multi-part allOf component.
    const components: Record<string, any> = {
        PartA: {type: 'object', properties: {a1: {type: 'string'}, a2: {type: 'integer'}}},
        PartB: {type: 'object', properties: {b1: {type: 'boolean'}}},
        PartC: {type: 'object', properties: {c1: {type: 'number'}}},
        CombinedBag: {
            allOf: [
                {$ref: '#/components/schemas/PartA'},
                {$ref: '#/components/schemas/PartB'},
                {$ref: '#/components/schemas/PartC'},
            ],
        },
    };
    const resolveRef = (item: any) => {
        if (item?.$ref && typeof item.$ref === 'string') {
            const name = item.$ref.split('/').pop();
            return name ? components[name] : item;
        }
        return item;
    };
    const op8Field = {allOf: [{$ref: '#/components/schemas/CombinedBag'}]};
    const expanded = expandAllOfBranches(op8Field, resolveRef);
    assert.equal(expanded.length, 3);
    const op8Choices = collectSchemaBranchChoices(
        {type: 'object', properties: {combinedPayload: op8Field}},
        resolveRef,
        getRefName,
    );
    const op8AllOf = op8Choices.find(c => c.kind === 'allOf' && c.path === 'combinedPayload');
    assert.ok(op8AllOf);
    // Combined + 3 parts
    assert.equal(op8AllOf!.options.length, 4);
    assert.deepEqual(
        op8AllOf!.options.slice(1).map(o => o.label),
        ['PartA', 'PartB', 'PartC'],
    );
    const composition = describeAllOfComposition(op8Field, resolveRef, getRefName);
    assert.equal(composition?.parts.length, 3);
    assert.equal(composition?.fieldCount, 4);
    const detected = detectSchemaCombinator(op8Field, resolveRef);
    assert.equal(detected?.meta.kind, 'allOf');
    assert.equal(detected?.branches.length, 3);
});

test('collects field-level anyOf choices and merges selected branches', () => {
    const components: Record<string, any> = {
        A: {type: 'object', properties: {a: {type: 'string'}}},
        B: {type: 'object', properties: {b: {type: 'integer'}}},
    };
    const resolveRef = (item: any) => {
        if (item?.$ref && typeof item.$ref === 'string') {
            const name = item.$ref.split('/').pop();
            return name ? components[name] : item;
        }
        return item;
    };
    const field = {
        anyOf: [{$ref: '#/components/schemas/A'}, {$ref: '#/components/schemas/B'}],
    };
    const choices = collectSchemaBranchChoices({type: 'object', properties: {payload: field}}, resolveRef, getRefName);
    const anyOf = choices.find(c => c.kind === 'anyOf' && c.path === 'payload');
    assert.ok(anyOf);
    // All + 2 branches
    assert.equal(anyOf!.options.length, 3);
    assert.equal(anyOf!.options[0].label, 'All');
});

test('collects field-level not choices and does not double-register expanded allOf', () => {
    const components = {
        Combined: {
            allOf: [
                {type: 'object', properties: {a: {type: 'string'}}},
                {type: 'object', properties: {b: {type: 'integer'}}},
            ],
        },
        Forbidden: {type: 'object', properties: {secret: {type: 'string'}}},
    };
    const resolve = (item: any) => {
        if (item?.$ref?.startsWith('#/components/schemas/')) {
            return components[item.$ref.split('/').pop() as keyof typeof components] || item;
        }
        return item;
    };
    const getRefName = (ref: string) => ref.split('/').pop() || ref;

    const notField = {not: {$ref: '#/components/schemas/Forbidden'}};
    const notChoices = collectSchemaBranchChoices(
        {type: 'object', properties: {notPayload: notField}},
        resolve,
        getRefName,
    );
    const notChoice = notChoices.find(c => c.kind === 'not' && c.path === 'notPayload');
    assert.ok(notChoice);
    assert.equal(notChoice!.options.length, 1);
    assert.equal(notChoice!.options[0].label, 'Forbidden');

    // Wrapper allOf: [ $ref → multi-part allOf ] must register once with expanded parts.
    const wrapped = {allOf: [{$ref: '#/components/schemas/Combined'}]};
    const allOfChoices = collectSchemaBranchChoices(
        {type: 'object', properties: {combinedPayload: wrapped}},
        resolve,
        getRefName,
    ).filter(c => c.kind === 'allOf' && c.path === 'combinedPayload');
    assert.equal(allOfChoices.length, 1);
    // Combined + 2 parts
    assert.equal(allOfChoices[0].options.length, 3);

    const menus = inlineMenusForCode('{\n  "notPayload": {}\n}\n', 'test:not-field', notChoices, 'json');
    assert.ok(menus.menus.some(m => m.id.includes('not:notPayload') && m.kind === 'not'));
});

test('detects bare $ref bodies for oneOf/anyOf/allOf/not', () => {
    const components: Record<string, any> = {
        StandaloneOneOf: {
            oneOf: [
                {type: 'object', properties: {a: {type: 'string'}}},
                {type: 'object', properties: {b: {type: 'integer'}}},
            ],
        },
        StandaloneAnyOf: {
            anyOf: [
                {type: 'object', properties: {x: {type: 'string'}}},
                {type: 'object', properties: {y: {type: 'boolean'}}},
            ],
        },
        StandaloneNot: {not: {type: 'string'}},
    };
    const resolve = (item: any) => {
        if (item?.$ref?.startsWith('#/components/schemas/')) {
            return components[item.$ref.split('/').pop()!] || item;
        }
        return item;
    };
    assert.equal(detectSchemaCombinator({$ref: '#/components/schemas/StandaloneOneOf'}, resolve)?.meta.kind, 'oneOf');
    assert.equal(detectSchemaCombinator({$ref: '#/components/schemas/StandaloneAnyOf'}, resolve)?.meta.kind, 'anyOf');
    assert.equal(detectSchemaCombinator({$ref: '#/components/schemas/StandaloneNot'}, resolve)?.meta.kind, 'not');
    assert.equal(describeNotConstraint({$ref: '#/components/schemas/Forbidden'}), 'Forbidden');
    // Body-level pure `not` (Operation 14 style) is a root combinator, not a field choice.
    const topNot = {not: {$ref: '#/components/schemas/StandaloneNot'}};
    assert.equal(detectSchemaCombinator(topNot, resolve)?.meta.kind, 'not');
    assert.equal(detectSchemaCombinator(topNot, resolve)?.branches.length, 1);
    const fieldOnly = collectSchemaBranchChoices(topNot, resolve, r => r.split('/').pop() || r);
    assert.equal(fieldOnly.filter(c => c.kind === 'not').length, 0);
});

test('dims code-viewer lines for body and field-level allOf focus the same way', () => {
    const rootCode = `{
  "fromA": 1,
  "fromB": 2,
  "fromC": {
    "x": 1
  }
}`;
    const rootDimmed = dimmedLinesForObjectCode(rootCode, new Set(['fromA']));
    assert.deepEqual(rootDimmed, [3, 4, 5, 6]);

    const fieldCode = `{
  "identifier": "uuid",
  "combinedPayload": {
    "a1": "x",
    "a2": 1,
    "b1": true,
    "c1": 2.5,
    "nested": {
      "x": 1
    }
  },
  "other": 1
}`;
    // Focus PartA (a1, a2): only nested keys under combinedPayload fade — siblings stay vivid.
    const fieldDimmed = dimmedLinesForObjectCode(fieldCode, new Set(['a1', 'a2']), {
        containerPath: 'combinedPayload',
    });
    assert.deepEqual(fieldDimmed, [6, 7, 8, 9, 10]);
    const viaMap = dimmedLinesForFieldAllOfFocus(fieldCode, new Map([['combinedPayload', new Set(['a1', 'a2'])]]));
    assert.deepEqual(viaMap, fieldDimmed);

    const yaml = `identifier: uuid
combinedPayload:
  a1: x
  a2: 1
  b1: true
  nested:
    x: 1
other: 1
`;
    const yamlDimmed = dimmedLinesForObjectCode(yaml, new Set(['a1', 'a2']), {
        containerPath: 'combinedPayload',
    });
    assert.deepEqual(yamlDimmed, [5, 6, 7]);
});

test('defaults documentation switches to per-schema and schema modal to per-schema', () => {
    assert.equal(DEFAULT_APP_PREFERENCES.endpointRepresentationScope, 'schema');
    assert.equal(DEFAULT_APP_PREFERENCES.modalRepresentationScope, 'schema');
    const normalized = normalizeAppPreferences({});
    assert.equal(normalized.endpointRepresentationScope, 'schema');
    assert.equal(normalized.modalRepresentationScope, 'schema');
});

test('body-level anyOf All off yields empty merge while All on merges every branch', () => {
    const branches = [
        {type: 'object', properties: {a: {type: 'string'}}},
        {type: 'object', properties: {b: {type: 'integer'}}},
    ];
    const resolve = (x: any) => x;
    const all = mergeAnyOfBranchSchemas(branches, [0, 1], resolve);
    assert.ok(all.properties.a);
    assert.ok(all.properties.b);
    const none = mergeAnyOfBranchSchemas(branches, [], resolve);
    assert.deepEqual(none.properties || {}, {});
});

test('form URL-encoded examples omit null as an empty value, not the word null', () => {
    const form = exampleEncodingOf('form');
    const out = form.format({name: 'Ada', note: null, age: 1}, 'root');
    assert.match(out, /name=Ada/);
    assert.match(out, /note=/);
    assert.doesNotMatch(out, /note=null/);
    assert.match(out, /age=1/);
});

test('locks oneOf/anyOf/allOf/not to distinct method colors and selection controls', () => {
    assert.equal(COMBINATOR_META.oneOf.color, 'var(--method-put)');
    assert.equal(COMBINATOR_META.anyOf.color, 'var(--method-get)');
    assert.equal(COMBINATOR_META.allOf.color, 'var(--method-post)');
    assert.equal(COMBINATOR_META.not.color, 'var(--method-delete)');
    assert.equal(COMBINATOR_META.oneOf.selectionControl, 'radio');
    assert.equal(COMBINATOR_META.anyOf.selectionControl, 'checkbox');
    assert.equal(COMBINATOR_META.allOf.selectionControl, 'radio');
    assert.equal(COMBINATOR_META.not.selectionControl, 'none');
    assert.match(COMBINATOR_META.oneOf.selectionIconActive, /radio-button/);
    assert.match(COMBINATOR_META.anyOf.selectionIconActive, /check-square/);
    assert.match(COMBINATOR_META.allOf.selectionIconActive, /radio-button/);
});

test('publishes an explicit capability contract for partial and transport-dependent behavior', () => {
    assert.ok(OPENAPI_CAPABILITIES.some(item => item.id === 'references.local' && item.status === 'supported'));
    assert.ok(OPENAPI_CAPABILITIES.some(item => item.id === 'responses.binary' && item.status === 'supported'));
    assert.ok(capabilitiesFor('oas3.2', 'execute').some(item => item.id === 'operations.additional'));
    assert.ok(capabilitiesFor('oas3.1', 'execute').some(item => item.status === 'transport-dependent'));
});
test('classifies textual, binary and attachment response media without triggering downloads', () => {
    assert.equal(isTextualResponseMediaType('application/problem+json; charset=utf-8'), true);
    assert.equal(isTextualResponseMediaType('application/x-ndjson'), true);
    assert.equal(isTextualResponseMediaType('image/svg+xml'), true);
    assert.equal(isBinaryResponseMediaType('image/jpeg'), true);
    assert.equal(isBinaryResponseMediaType('application/pdf'), true);
    assert.equal(responseHeadersIndicateBinary('text/plain', 'attachment; filename="report.txt"'), true);
    assert.equal(declaredContentIsBinary('application/octet-stream', {type: 'string'}), true);
    assert.equal(declaredContentIsBinary('text/plain', {type: 'string', format: 'binary'}), true);
});
test('summarizes unfamiliar specification Runner limits without guessing from endpoint names', () => {
    const report = analyzeRunnerCompatibility({
        openapi: '3.2.0',
        info: {title: 'Compatibility fixture', version: '1'},
        paths: {
            '/cities': {
                get: {
                    parameters: [
                        {name: 'sort', in: 'query', schema: {type: 'string', enum: ['name', '-name']}},
                        {name: 'active', in: 'query', schema: {type: 'boolean'}},
                    ],
                    security: [{cookieAuth: []}],
                    responses: {'200': {description: 'ok', content: {'application/json': {}}}},
                },
            },
            '/media/{id}': {
                get: {
                    parameters: [{name: 'id', in: 'path', required: true, schema: {type: 'string'}}],
                    responses: {'401': {description: 'unauthorized', content: {'application/json': {}}}},
                },
            },
            '/download': {
                get: {
                    responses: {
                        '200': {
                            description: 'image',
                            content: {'image/jpeg': {schema: {type: 'string', format: 'binary'}}},
                        },
                    },
                },
            },
            '/upload': {
                post: {
                    requestBody: {
                        content: {
                            'multipart/form-data': {
                                schema: {type: 'object'},
                                encoding: {metadata: {headers: {'X-Part': {schema: {type: 'string'}}}}},
                            },
                        },
                    },
                    responses: {'204': {description: 'uploaded'}},
                },
            },
            '/broken': {
                get: {
                    parameters: [{$ref: './parameters.yaml#/Missing'}],
                    responses: {'200': {description: 'ok'}},
                },
            },
        },
        components: {
            securitySchemes: {cookieAuth: {type: 'apiKey', in: 'cookie', name: 'session'}},
        },
    } as any);
    assert.equal(report.totalOperations, 5);
    assert.equal(report.standardOperations, 1);
    assert.equal(report.reviewOperations, 3);
    assert.equal(report.browserLimitedOperations, 1);
    assert.equal(report.binaryOperations, 1);
    assert.equal(report.unresolvedOperations, 1);
    assert.ok(report.findings.some(item => item.id === 'missing-success-responses'));
    assert.ok(report.findings.some(item => item.id === 'binary-success-responses'));
    assert.ok(report.findings.some(item => item.id === 'browser-managed-auth'));
    assert.ok(report.findings.some(item => item.id === 'multipart-part-headers'));
    assert.ok(report.findings.some(item => item.id === 'unresolved-references'));
});
test('generates canonical request snippets with placeholders and no live credentials', () => {
    const operation: any = {
        parameters: [{name: 'id', in: 'path', required: true, schema: {type: 'string'}}],
        requestBody: {content: {'application/json': {schema: {type: 'object', properties: {name: {type: 'string'}}}}}},
        responses: {'200': {description: 'ok', content: {'application/json': {}}}},
        security: [{auth: []}],
    };
    const spec: any = {
        ...baseSpec,
        servers: [{url: 'https://api.example.test/v1'}],
        paths: {'/users/{id}': {post: operation}},
        security: [{auth: []}],
    };
    const request = buildCodegenRequest({
        spec,
        path: '/users/{id}',
        method: 'post',
        operation,
        selectedServer: 'https://api.example.test/v1',
        activeAuth: {
            activeScheme: 'auth',
            selectedSchemes: ['auth'],
            requirementIndex: 0,
            schemeValues: {auth: {schemeId: 'auth', type: 'bearer', value: 'live-secret-token'}},
            cookieValues: {},
            bearerToken: '',
            apiKeyName: '',
            apiKeyValue: '',
            apiKeyIn: 'header',
            basicUsername: '',
            basicPassword: '',
        },
    });
    for (const language of [
        'curl',
        'js-fetch',
        'js-axios',
        'python',
        'go',
        'php',
        'csharp',
        'angular',
        'laravel',
    ] as const) {
        const snippet = generateRequestSnippet(language, request);
        assert.doesNotMatch(snippet, /live-secret-token/, language);
        assert.match(snippet, /YOUR_ACCESS_TOKEN/, language);
        assert.match(snippet, /https:\/\/api\.example\.test\/v1\/users\/YOUR_ID/, language);
    }
});
test('generates transport-correct multipart snippets instead of raw multipart headers', () => {
    const operation: any = {
        requestBody: {
            content: {
                'multipart/form-data': {
                    schema: {
                        type: 'object',
                        properties: {metadata: {type: 'object'}, file: {type: 'string', format: 'binary'}},
                    },
                    encoding: {metadata: {contentType: 'application/json'}},
                },
            },
        },
        responses: {'200': {description: 'ok'}},
    };
    const spec: any = {
        ...baseSpec,
        servers: [{url: 'https://upload.example.test'}],
        paths: {'/upload': {post: operation}},
    };
    const request = buildCodegenRequest({
        spec,
        path: '/upload',
        method: 'post',
        operation,
        selectedServer: 'https://upload.example.test',
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
    });
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
        openapi: '3.0.4',
        info: {title: 'Nullable', version: '1'},
        paths: {},
        components: {schemas: {Value: {type: 'string', nullable: true}}},
    });
    assert.equal(normalized.components.schemas.Value.type, 'string');
    assert.equal(normalized.components.schemas.Value.nullable, true);
});
test('trims oversized conversations instead of deleting them', () => {
    const conversation: any = {
        id: 'conversation',
        specKey: 'fixture',
        title: 'Fixture',
        createdAt: 1,
        updatedAt: 2,
        includeAuthValues: false,
        trustedRunner: false,
        messages: Array.from({length: 130}, (_, index) => ({
            id: `m${index}`,
            role: index % 2 ? 'assistant' : 'user',
            content: `message ${index}`,
            createdAt: index,
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
        selectedEndpoints: [{path: '/users/{id}', method: 'get'}],
    });
    assert.match(context.context, /UNTRUSTED|retrieved|selectedEndpointDocuments/);
    const citations = citationsFromText(
        'GET /users/{id} is documented here [source:path:GET:/users/{id}] [source:does-not-exist]',
        context.sources,
    );
    assert.deepEqual(
        citations.map(source => source.id),
        ['path:GET:/users/{id}'],
    );
    assert.deepEqual(citationsFromText('This unrelated claim [source:path:GET:/users/{id}]', context.sources), []);
});
test('exposes operational skills and validates the OpenDoc UI action bridge', () => {
    const context = buildAIContext({spec: baseSpec, specKey: 'fixture'});
    const prompt = buildAISystemPrompt(
        {
            transport: 'direct',
            gatewayUrl: '',
            gatewayToken: '',
            provider: 'custom',
            model: 'fixture',
            apiKey: '',
            baseUrl: 'https://fixture.test/v1',
            temperature: 0.2,
            skillPacks: ['openapi', 'api-testing'],
            customInstructions: '',
        },
        context,
    );
    assert.match(prompt, /OpenDoc UI action bridge/);
    assert.match(prompt, /API testing/);
    const actions = parseOpenDocUIActions(
        '<opendoc-ui-action>{"action":"set_runner_fields","path":"/users/{id}","method":"get","params":{"id":"42"}}</opendoc-ui-action>',
    );
    assert.equal(actions[0]?.action, 'set_runner_fields');
    assert.equal(actions[0]?.clearExisting, true);
    assert.equal(
        parseOpenDocUIActions(
            '<opendoc-ui-action>{"action":"run_api","path":"https://evil","method":"get"}</opendoc-ui-action>',
        ).length,
        0,
    );
});
test('keeps gateway providers server-controlled and models exactly allowlisted', () => {
    const policy = createGatewayModelPolicy({
        provider: 'openrouter',
        configuredModel: 'openai/gpt-4o-mini',
        allowClientModel: true,
        allowedModels: 'openai/gpt-4o-mini,anthropic/claude-3.5-sonnet',
    });
    assert.deepEqual(resolveGatewaySelection(policy, {model: 'anthropic/claude-3.5-sonnet'}), {
        provider: 'openrouter',
        model: 'anthropic/claude-3.5-sonnet',
    });
    assert.match(
        (
            resolveGatewaySelection(policy, {provider: 'anthropic', model: 'anthropic/claude-3.5-sonnet'}) as {
                error: string;
            }
        ).error,
        /controlled by the gateway/,
    );
    assert.match(
        (
            resolveGatewaySelection(policy, {model: 'unapproved/model'}) as {
                error: string;
            }
        ).error,
        /not allowed/,
    );
});
test('returns only gateway-allowlisted models from discovery', () => {
    const policy = createGatewayModelPolicy({
        provider: 'ollama',
        configuredModel: 'llama3.2',
        allowClientModel: true,
        allowedModels: 'llama3.2,qwen2.5:7b',
    });
    const models = allowedModelCatalog(policy, [
        {id: 'qwen2.5:7b', label: 'Qwen 2.5 7B · Local', tier: 'local'},
        {id: 'not-allowed', label: 'Not allowed', tier: 'local'},
    ]);
    assert.deepEqual(
        models.map(model => model.id),
        ['llama3.2', 'qwen2.5:7b'],
    );
    assert.match(models[0].label, /Gateway allowed/);
    assert.equal(models[1].label, 'Qwen 2.5 7B · Local');
});
test('rejects unsafe gateway policy configuration', () => {
    assert.throws(
        () => createGatewayModelPolicy({provider: 'unknown', configuredModel: 'model', allowClientModel: false}),
        /Unsupported AI_PROVIDER/,
    );
    assert.throws(
        () =>
            createGatewayModelPolicy({
                provider: 'openrouter',
                configuredModel: '',
                allowClientModel: true,
                allowedModels: 'model',
            }),
        /AI_MODEL is required/,
    );
    assert.throws(
        () =>
            createGatewayModelPolicy({
                provider: 'openrouter',
                configuredModel: 'model',
                allowClientModel: true,
                allowedModels: '*',
            }),
        /wildcard/,
    );
    assert.throws(
        () =>
            createGatewayModelPolicy({
                provider: 'openrouter',
                configuredModel: 'default',
                allowClientModel: true,
                allowedModels: 'other',
            }),
        /must include AI_MODEL/,
    );
});
test('formats bounded Runner results for the conversation without exposing auth headers', () => {
    const result = formatOpenDocUIRunnerResult({
        actionId: 'a1',
        specKey: 'fixture',
        path: '/users',
        method: 'get',
        result: {
            status: 200,
            headers: {authorization: 'Bearer secret'},
            body: 'Authorization: Bearer secret\\n{"ok":true}',
            isJson: true,
            durationMs: 12,
        },
    });
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
    assert.equal(formatBodyText('{"name":"OpenDoc"}', 'application/x-www-form-urlencoded').text, 'name=OpenDoc');
    assert.equal(bodyTypeSupportsForm('application/json; charset=utf-8'), true);
    assert.equal(bodyTypeSupportsForm('image/png', {type: 'string', format: 'binary'}), true);
    assert.equal(bodyEditorModeForMediaType('form', 'image/png', {type: 'string', format: 'binary'}), 'form');
    assert.equal(bodyEditorModeForMediaType('raw', 'application/json'), 'raw');
    assert.equal(bodyEditorModeForMediaType('raw', 'application/x-www-form-urlencoded'), 'raw');
    assert.equal(bodyEditorModeForMediaType('form', 'application/xml'), 'form');
    assert.equal(validateBodyText('name: OpenDoc\nitems:\n  - id: 1', 'application/yaml'), null);
    assert.equal(validateBodyText('<root><item /></root>', 'application/xml'), null);
    assert.equal(validateBodyText('{"broken":', 'application/json') !== null, true);
    assert.match(formatBodyText('name: OpenDoc\nitems:\n  - id: 1', 'application/yaml').text, /name:/);
    const encoded = serializeUrlEncodedBody({name: 'OpenDoc', tags: ['one', 'two'], nested: {enabled: true}});
    assert.match(encoded, /name=OpenDoc/);
    assert.match(encoded, /tags\[\]=one/);
    assert.match(encoded, /tags\[\]=two/);
    assert.match(encoded, /nested\[enabled\]=true/);
    assert.deepEqual(parseStructuredBody('tags=one&tags=two', 'application/x-www-form-urlencoded'), {
        tags: ['one', 'two'],
    });
    assert.deepEqual(parseStructuredBody('a=1&b=4&j[]=1&a[]=5&k[key]=foo', 'application/x-www-form-urlencoded'), {
        a: ['1', '5'],
        b: '4',
        j: ['1'],
        k: {key: 'foo'},
    });
});
test('materializes top-level binary uploads for their declared media type', () => {
    const file = new Blob(['binary fixture'], {type: 'image/png'});
    const operation: any = {
        requestBody: {content: {'image/png': {schema: {type: 'string', format: 'binary'}}}},
        responses: {'204': {description: 'uploaded'}},
    };
    const spec: any = {
        ...baseSpec,
        servers: [{url: 'https://upload.example.test'}],
        paths: {'/avatar': {post: operation}},
    };
    const plan = compileBrowserRequest({
        spec,
        path: '/avatar',
        method: 'post',
        operation,
        selectedServer: 'https://upload.example.test',
        activeAuth: createEmptyAuth(),
        bodyType: 'image/png',
        selectedFile: file,
    });
    assert.equal(plan.body, file);
    assert.equal(plan.headers['Content-Type'], 'image/png');
    assert.equal(plan.headers.Accept, '*/*');
});
test('normalizes remote specification and downloader URLs without mixed-content proxy calls', () => {
    const target = normalizeRemoteSpecUrl(' https://api.example.test/openapi.yaml#section ');
    assert.equal(target, 'https://api.example.test/openapi.yaml');
    assert.equal(
        normalizeDownloaderTemplate('http://proxy.example.test/load?url={URL}'),
        'proxy.example.test/load?url={URL}',
    );
    assert.equal(
        buildDownloaderUrl('http://proxy.example.test/load?url={URL}', target, 'https:'),
        `https://proxy.example.test/load?url=${encodeURIComponent(target)}`,
    );
    assert.equal(
        buildDownloaderUrl('proxy.example.test/{URL}/dl', 'http://api.example.test/openapi.json', 'http:'),
        `http://proxy.example.test/${encodeURIComponent('http://api.example.test/openapi.json')}/dl`,
    );
    assert.equal(
        replaceUrlProtocol('http://api.example.test/openapi.json', 'https:'),
        'https://api.example.test/openapi.json',
    );
    assert.match(remoteSpecKey(target), /^remote:[a-z0-9]+$/);
    assert.throws(() => normalizeRemoteSpecUrl('file:///tmp/openapi.yaml'), /Only HTTP and HTTPS/);
    assert.throws(
        () => normalizeRemoteSpecUrl('https://user:secret@example.test/openapi.yaml'),
        /usernames or passwords/,
    );
    assert.throws(() => normalizeDownloaderTemplate('proxy.example.test/load'), /\{URL\}/);
});
test('places tooltips using their measured size and safe fallback direction', () => {
    const nearTop = {
        top: 2,
        bottom: 26,
        left: 480,
        right: 520,
        width: 40,
        height: 24,
    } as DOMRect;
    const below = positionFor(nearTop, 'top', {width: 180, height: 44});
    assert.equal(below.placement, 'bottom');
    assert.equal(below.top >= 8, true);
    const nearRight = {
        top: 300,
        bottom: 330,
        left: 990,
        right: 1020,
        width: 30,
        height: 30,
    } as DOMRect;
    const left = positionFor(nearRight, 'right', {width: 220, height: 60});
    assert.equal(left.placement, 'left');
    assert.equal(left.left <= 1016, true);
});
test('renders comprehensive native, shortcode, skin-tone and Emoji 16 Apple sprites', () => {
    const parsed = parseEmojis('Launch 🚀 :fire: 👩🏽‍💻 🫩 and keep unknown :not_an_emoji:');
    assert.match(parsed, /class="emoji"[^>]+aria-label="🚀"[^>]+data-apple-emoji="true"/);
    assert.match(parsed, /class="emoji"[^>]+aria-label=":fire:"[^>]+data-apple-emoji="true"/);
    assert.match(parsed, /class="emoji"[^>]+aria-label="👩🏽‍💻"[^>]+data-apple-emoji="true"/);
    assert.match(parsed, /class="emoji"[^>]+aria-label="🫩"[^>]+data-apple-emoji="true"/);
    assert.match(parsed, /--emoji-sheet-left:-[\d.]+em;--emoji-sheet-top:-[\d.]+em/);
    assert.match(parsed, /:not_an_emoji:/);
});

test('sorts sidebar endpoints by name with natural numeric order', () => {
    const spec: any = {
        openapi: '3.0.3',
        info: {title: 'Sort', version: '1.0.0'},
        paths: {
            '/a': {post: {summary: 'Operation 10 - Ten', tags: ['Ops']}},
            '/b': {post: {summary: 'Operation 2 - Two', tags: ['Ops']}},
            '/c': {post: {summary: 'Operation 1 - One', tags: ['Ops']}},
            '/d': {post: {summary: 'Operation 14 - Fourteen', tags: ['Ops']}},
        },
    };
    const tree = buildTagTree(
        spec,
        normalizeSidebarConfig({sortBy: 'name', sortDirection: 'asc'}),
        undefined,
        new Set(),
    );
    const ops = tree.children['Ops']?.endpoints || [];
    assert.deepEqual(
        ops.map(ep => ep.operation.summary),
        ['Operation 1 - One', 'Operation 2 - Two', 'Operation 10 - Ten', 'Operation 14 - Fourteen'],
    );
});

test('defaults endpoint routes on and always matches endpoint paths in the local sidebar filter', () => {
    assert.equal(normalizeSidebarConfig(undefined).displayRoutes, true);
    assert.equal(normalizeSidebarConfig({displayRoutes: false}).displayRoutes, false);
    assert.equal(normalizeSidebarConfig({displayRoutes: true}).displayRoutes, true);
    const endpoint: any = {
        path: '/internal/invoice-route',
        method: 'post',
        operation: {
            summary: 'Create customer invoice',
            description: 'Secret settlement wording',
            tags: ['Billing Folder'],
        },
    };
    assert.equal(endpointMatchesSidebarFilter(endpoint, 'customer invoice', true), true);
    assert.equal(endpointMatchesSidebarFilter(endpoint, 'invoice-route', true), true);
    // Path is always searchable, even when the sidebar hides routes.
    assert.equal(endpointMatchesSidebarFilter(endpoint, 'invoice-route', false), true);
    assert.equal(endpointMatchesSidebarFilter(endpoint, 'Billing Folder', true), false);
    assert.equal(endpointMatchesSidebarFilter(endpoint, 'settlement', true), false);
    assert.equal(endpointMatchesSidebarFilter(endpoint, 'post', true), true);
    assert.equal(
        endpointMatchesSidebarFilter(
            {...endpoint, operation: {...endpoint.operation, summary: ''}},
            'invoice-route',
            false,
        ),
        true,
    );
});
test('uses inline descriptions until the threshold and always moves Markdown into tooltips', () => {
    assert.equal(usesDescriptionTooltip('Short field description'), false);
    assert.equal(usesDescriptionTooltip('x'.repeat(DESCRIPTION_TOOLTIP_THRESHOLD)), false);
    assert.equal(usesDescriptionTooltip('x'.repeat(DESCRIPTION_TOOLTIP_THRESHOLD + 1)), true);
    assert.equal(containsMarkdown('A short **Markdown** description'), true);
    assert.equal(usesDescriptionTooltip('A short **Markdown** description'), true);
});
test('extracts native enum case descriptions from Markdown tables for custom dropdown items', () => {
    const options = enumDropdownOptions(
        [1, 2],
        {
            description: '#### Available values\n\n| Value | Case |\n|---|---|\n| 1 | NOVICE |\n| 2 | EXPERT |',
        },
        (_value, index) => `choice:${index}`,
    );
    assert.deepEqual(options, [
        {value: 'choice:0', label: '1', description: 'NOVICE'},
        {value: 'choice:1', label: '2', description: 'EXPERT'},
    ]);
});
test('bounds cyclic schema property matrices and recursive Runner defaults', () => {
    const cyclicSpec: any = {
        openapi: '3.1.1',
        info: {title: 'Cyclic schemas', version: '1'},
        paths: {},
        components: {
            schemas: {
                Customer: {
                    type: 'object',
                    properties: {role: {$ref: '#/components/schemas/GuestRole'}},
                },
                GuestRole: {
                    type: 'object',
                    properties: {customer: {$ref: '#/components/schemas/Customer'}},
                },
            },
        },
    };
    const root = {$ref: '#/components/schemas/Customer'};
    const before = JSON.stringify(cyclicSpec);
    const properties = flattenSchemaProperties(root, schema => resolveReference(schema, cyclicSpec));
    assert.deepEqual(Object.keys(properties), ['role', 'role.customer']);
    assert.deepEqual(defaultBodyValue(root, cyclicSpec), {role: {customer: {}}});
    assert.equal(JSON.stringify(cyclicSpec), before);
});
test('creates local endpoint notes with fourteen predefined colors and stable endpoint keys', () => {
    assert.equal(ENDPOINT_NOTE_COLORS.length, 14);
    assert.equal(new Set(ENDPOINT_NOTE_COLORS.map(color => color.id)).size, 14);
    assert.equal(
        ENDPOINT_NOTE_COLORS.some(color => color.id === 'white' && color.tone === '#ffffff'),
        true,
    );
    assert.equal(
        ENDPOINT_NOTE_COLORS.some(color => color.id === 'black' && color.tone === '#000000'),
        true,
    );
    assert.ok(
        ENDPOINT_NOTE_COLORS.every(
            color => color.background.includes('color-mix') && color.background.includes('transparent'),
        ),
    );
    assert.equal(MAX_NOTE_TITLE_CHARS, 128);
    assert.equal(MAX_NOTE_CONTENT_CHARS, 4096);
    assert.equal(MAX_NOTES_PER_ENDPOINT, 100);
    assert.equal(noteCharacterCount('A🚀B'), 3);
    const note = createEndpointNote({
        path: '/items',
        method: 'POST',
        type: 'todo',
        title: 'Ship the endpoint',
        content: '',
        color: 'mint',
        autoHideWhenTodosDone: true,
    });
    assert.equal(note.method, 'post');
    assert.equal(note.done, false);
    assert.equal(note.content, '');
    assert.equal(endpointNoteTitle(note), 'Ship the endpoint');
    assert.equal(endpointNoteKey(note.path, note.method), 'post:/items');
    const atLimit = Array.from({length: MAX_NOTES_PER_ENDPOINT}, () => note);
    assert.equal(endpointHasNoteCapacity(atLimit.slice(0, -1), '/items', 'post'), true);
    assert.equal(endpointHasNoteCapacity(atLimit, '/items', 'post'), false);
    const migrated = normalizeStoredEndpointNote({
        ...note,
        type: 'task',
        autoHideWhenTasksDone: true,
        autoHideWhenTodosDone: undefined,
    });
    assert.equal(migrated.type, 'todo');
    assert.equal(migrated.autoHideWhenTodosDone, true);
    assert.equal('autoHideWhenTasksDone' in migrated, false);
});
test('moves hidden endpoints into one final gray-folder tree group', () => {
    const spec: any = {
        ...baseSpec,
        paths: {
            '/visible': {get: {tags: ['General'], summary: 'Visible', responses: {'200': {description: 'ok'}}}},
            '/hidden': {post: {tags: ['General'], summary: 'Hidden', responses: {'200': {description: 'ok'}}}},
        },
    };
    const tree = buildTagTree(spec, normalizeSidebarConfig({}), undefined, new Set(['post:/hidden']));
    assert.deepEqual(Object.keys(tree.children), ['General', 'Hidden endpoints']);
    assert.equal(tree.children['Hidden endpoints'].isHiddenGroup, true);
    assert.equal(tree.children['Hidden endpoints'].endpoints.length, 1);
    assert.equal(tree.children['Hidden endpoints'].endpoints[0].isHidden, true);
    assert.equal(
        tree.children.General.endpoints.some(endpoint => endpoint.path === '/hidden'),
        false,
    );
});

test('groups tags through x-tagGroups before normal tag folders', () => {
    const spec: any = {
        ...baseSpec,
        'x-tagGroups': [
            {name: 'Commerce', tags: ['Catalog', 'Orders']},
            {name: 'Platform', tags: ['Admin']},
        ],
        paths: {
            '/products': {get: {tags: ['Catalog'], summary: 'Products', responses: {'200': {description: 'ok'}}}},
            '/orders': {get: {tags: ['Orders'], summary: 'Orders', responses: {'200': {description: 'ok'}}}},
            '/health': {get: {tags: ['Admin'], summary: 'Health', responses: {'200': {description: 'ok'}}}},
            '/users': {get: {tags: ['Users'], summary: 'Users', responses: {'200': {description: 'ok'}}}},
        },
    };
    const tree = buildTagTree(spec, normalizeSidebarConfig({}), undefined, new Set());
    assert.deepEqual(Object.keys(tree.children), ['Commerce', 'Platform', 'Users']);
    assert.deepEqual(Object.keys(tree.children.Commerce.children), ['Catalog', 'Orders']);
    assert.equal(tree.children.Commerce.children.Catalog.endpoints[0].path, '/products');
    assert.equal(tree.children.Platform.children.Admin.endpoints[0].path, '/health');
});
test('creates typed defaults for recursive object and array schemas', () => {
    const schema = {
        type: 'object',
        properties: {
            name: {type: 'string', default: 'OpenDoc'},
            items: {type: 'array', items: {type: 'object', properties: {id: {type: 'integer'}}}},
        },
    };
    const value: any = defaultBodyValue(schema, baseSpec);
    assert.equal(value.name, 'OpenDoc');
    assert.deepEqual(value.items, []);
});

test('creates tuple defaults and mocks for prefixItems arrays', () => {
    const tuple = {
        type: 'array',
        prefixItems: [
            {type: 'number', minimum: 1},
            {type: 'string', pattern: '^[A-Z]{3}$'},
        ],
        minItems: 2,
        maxItems: 2,
    };
    assert.deepEqual(defaultBodyValue(tuple, baseSpec), ['', '']);
    const mock = generateValidatedMock(tuple, baseSpec);
    assert.equal(mock.ok, true, mock.diagnostics.map(item => item.message).join('; '));
    assert.deepEqual(mock.value, [1, 'AAA']);
});
test('renders oneOf request-matrix branches with referenced names and keeps the edited branch', () => {
    const spec: any = {
        openapi: '3.1.0',
        info: {title: 'OneOf matrix', version: '1'},
        paths: {},
        components: {
            schemas: {
                NewCustomer: {
                    type: 'object',
                    required: ['name', 'surname'],
                    properties: {name: {type: 'string'}, surname: {type: 'string'}},
                },
                ExistingCustomer: {
                    type: 'object',
                    required: ['id'],
                    properties: {id: {type: 'string'}},
                },
            },
        },
    };
    const customer = {
        oneOf: [{$ref: '#/components/schemas/NewCustomer'}, {$ref: '#/components/schemas/ExistingCustomer'}],
    };
    const resolve = (item: any) => resolveReference(item, spec);
    assert.equal(schemaVariantLabel(customer.oneOf[0], resolve, getRefName, 0), 'NewCustomer');
    assert.equal(schemaVariantLabel(customer.oneOf[1], resolve, getRefName, 1), 'ExistingCustomer');
    assert.equal(schemaVariantLabel({type: 'object', properties: {a: {}}}, resolve, getRefName, 2), 'object (1 props)');
    assert.equal(schemaVariantLabel({type: 'string'}, resolve, getRefName, 3), 'string');
    assert.equal(schemaVariantLabel({type: 'null'}, resolve, getRefName, 4), 'null');
    assert.equal(schemaVariantLabel({const: 'active'}, resolve, getRefName, 5), '"active"');
    // Creating a customer keeps the first branch, linking an existing one moves to the second.
    assert.equal(runnerVariantIndexForValue(customer.oneOf, {name: '', surname: ''}, spec), 0);
    assert.equal(runnerVariantIndexForValue(customer.oneOf, {id: '123'}, spec), 1);
    assert.equal(runnerVariantMatchesValue(customer.oneOf[1], {id: '123'}, spec), true);
    assert.equal(runnerVariantMatchesValue(customer.oneOf[0], {id: '123'}, spec), false);
    // anyOf string/null unions: empty string stays on string, null selects the null branch.
    const nullable = {anyOf: [{type: 'string'}, {type: 'null'}]};
    assert.equal(runnerVariantIndexForValue(nullable.anyOf, '', spec), 0);
    assert.equal(runnerVariantIndexForValue(nullable.anyOf, null, spec), -1);
    assert.equal(defaultBodyValue({type: 'null'}, spec), null);
});

test('exports and imports all notes with orphan detection', () => {
    const spec: any = {
        openapi: '3.0.3',
        info: {title: 'Notes spec', version: '1'},
        paths: {
            '/items': {get: {responses: {'200': {description: 'ok'}}}},
        },
    };
    const kept = createEndpointNote({
        path: '/items',
        method: 'GET',
        type: 'note',
        title: 'List items',
        content: '',
        color: 'blue',
        autoHideWhenTodosDone: false,
    });
    const orphan = createEndpointNote({
        path: '/removed',
        method: 'DELETE',
        type: 'todo',
        title: 'Cleanup',
        content: '',
        color: 'rose',
        autoHideWhenTodosDone: false,
    });
    const classified = classifyEndpointNotesBySpec(spec, [kept, orphan]);
    assert.deepEqual(
        classified.matching.map(note => note.id),
        [kept.id],
    );
    assert.deepEqual(
        classified.orphaned.map(note => note.id),
        [orphan.id],
    );

    const serialized = buildEndpointNotesExport({
        specKey: 'local:notes.json:abc',
        specTitle: 'Notes spec',
        notes: [kept, orphan],
        orphanedNoteIds: [orphan.id],
    });
    const parsed = parseEndpointNotesExport(serialized);
    assert.ok(parsed);
    assert.equal(parsed!.source.specKey, 'local:notes.json:abc');
    assert.equal(parsed!.notes.length, 2);
    assert.deepEqual(parsed!.orphanedNoteIds, [orphan.id]);
    assert.equal(parsed!.notes[0].id, kept.id);
    assert.equal(parsed!.notes[1].id, orphan.id);
    assert.equal(parseEndpointNotesExport('{broken json'), null);
    assert.equal(parseEndpointNotesExport(JSON.stringify({format: 'other-format', notes: []})), null);
    assert.equal(parseEndpointNotesExport(JSON.stringify({format: 'opendoc-endpoint-notes', notes: 'nope'})), null);
});

test('marks recursive and reused schemas with the recursive guard icon', () => {
    const spec: any = {
        openapi: '3.1.1',
        info: {title: 'Recursion', version: '1'},
        paths: {},
        components: {
            schemas: {
                Tree: {
                    type: 'object',
                    properties: {value: {type: 'string'}, children: {$ref: '#/components/schemas/Tree'}},
                },
                Customer: {
                    type: 'object',
                    properties: {name: {type: 'string'}, role: {$ref: '#/components/schemas/GuestRole'}},
                },
                GuestRole: {
                    type: 'object',
                    properties: {customer: {$ref: '#/components/schemas/Customer'}},
                },
                Flat: {
                    type: 'object',
                    properties: {name: {type: 'string'}},
                },
                NodeList: {
                    type: 'array',
                    items: {$ref: '#/components/schemas/Tree'},
                },
                Category: {
                    type: 'object',
                    properties: {
                        name: {type: 'string'},
                        parent: {
                            anyOf: [{$ref: '#/components/schemas/Category'}, {type: 'null'}],
                        },
                    },
                },
            },
        },
    };
    const resolve = (item: any) => resolveReference(item, spec);
    assert.equal(schemaIsRecursive({$ref: '#/components/schemas/Category'}, resolve), true);
    assert.equal(schemaIsRecursive({$ref: '#/components/schemas/Tree'}, resolve), true);
    assert.equal(schemaIsRecursive({$ref: '#/components/schemas/Customer'}, resolve), true);
    assert.equal(schemaIsRecursive({$ref: '#/components/schemas/GuestRole'}, resolve), true);
    assert.equal(schemaIsRecursive({$ref: '#/components/schemas/Flat'}, resolve), false);
    assert.equal(schemaIsRecursive(spec.components.schemas.Tree, resolve), true);
    assert.equal(schemaIsRecursive(spec.components.schemas.NodeList, resolve), true);
    assert.equal(schemaIsRecursive(spec.components.schemas.Flat, resolve), false);
    assert.equal(schemaIsRecursive({type: 'string'}, resolve), false);
    assert.equal(schemaIsRecursive({}, resolve), false);
    assert.ok(RECURSIVE_SCHEMA_ICON.length > 0);
});

test('re-assigns a note to another endpoint and keeps its identity', () => {
    const note = createEndpointNote({
        path: '/gone',
        method: 'GET',
        type: 'note',
        title: 'Move me',
        content: '',
        color: 'blue',
        autoHideWhenTodosDone: false,
    });
    const reassigned = reassignEndpointNote(note, '/customers', 'post');
    assert.equal(reassigned.id, note.id);
    assert.equal(reassigned.path, '/customers');
    assert.equal(reassigned.method, 'post');
    assert.equal(reassigned.title, 'Move me');
    assert.ok(reassigned.updatedAt >= note.updatedAt);
    assert.equal(reassignEndpointNote(note, '/x', 'GET').method, 'get');
});
console.log('All OpenDoc UI unit tests passed.');
