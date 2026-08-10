import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as yaml from 'js-yaml';
import {normalizeOpenApiSpec} from '../src/utils/openapi';
import {compileBrowserRequest, parameterStateKey} from '../src/utils/requestPlan';
import {createEmptyAuth} from '../src/utils/auth';

const raw: any = yaml.load(readFileSync('tests/fixtures/swagger2-conformance.yaml', 'utf8'));
const spec: any = normalizeOpenApiSpec(raw);
assert.deepEqual(spec.servers, [{url: 'https://api.example.test/v2'}]);
assert.equal(spec.components.securitySchemes.api_key.type, 'apiKey');

const operation = spec.paths['/items/{id}'].post;
assert.deepEqual(operation.servers, [{url: 'http://api.example.test/v2'}]);
assert.equal(
    operation.requestBody.content['application/x-www-form-urlencoded'].encoding.tags['x-opendoc-collection-format'],
    'pipes',
);
const auth = {
    ...createEmptyAuth(),
    activeScheme: 'api_key',
    selectedSchemes: ['api_key'],
    requirementIndex: 0,
    schemeValues: {
        api_key: {
            schemeId: 'api_key',
            type: 'apiKey' as const,
            name: 'X-API-Key',
            in: 'header' as const,
            value: 'secret',
        },
    },
};
const plan = compileBrowserRequest({
    spec,
    path: '/items/{id}',
    method: 'post',
    operation,
    selectedServer: spec.servers[0].url,
    activeAuth: auth,
    parameterValues: {
        [parameterStateKey('path', 'id')]: '42',
        [parameterStateKey('query', 'queryIds')]: ['a', 'b'],
    },
    body: JSON.stringify({tags: ['red', 'blue']}),
    bodyType: 'application/x-www-form-urlencoded',
});
assert.equal(plan.url, 'http://api.example.test/v2/items/42?queryIds=a&queryIds=b');
assert.equal(plan.headers['X-API-Key'], 'secret');
assert.equal(plan.body, 'tags=red%7Cblue');

const rawOperation = spec.paths['/raw'].post;
assert.ok(rawOperation.requestBody.content['*/*']);
assert.ok(rawOperation.responses.default.content['*/*']);
const rawPlan = compileBrowserRequest({
    spec,
    path: '/raw',
    method: 'post',
    operation: rawOperation,
    selectedServer: spec.servers[0].url,
    activeAuth: createEmptyAuth(),
    body: 'deliberately untyped',
    bodyType: '*/*',
});
assert.equal(rawPlan.headers['Content-Type'], '*/*');
assert.equal(rawPlan.headers.Accept, '*/*');
assert.equal(rawPlan.body, 'deliberately untyped');

const noHost: any = normalizeOpenApiSpec({
    swagger: '2.0',
    info: {title: 'Relative', version: '1'},
    basePath: '/api',
    paths: {},
});
assert.deepEqual(noHost.servers, [{url: '/api'}]);
const protocolRelative: any = normalizeOpenApiSpec({
    swagger: '2.0',
    info: {title: 'Protocol', version: '1'},
    host: 'api.test',
    paths: {},
});
assert.deepEqual(protocolRelative.servers, [{url: '//api.test'}]);

console.log('✓ Swagger 2 semantic adapter and request conformance matrix');
