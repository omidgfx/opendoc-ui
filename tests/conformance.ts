import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import * as yaml from 'js-yaml';
import {normalizeOpenApiSpec} from '../src/utils/openapi/index';
import {executeRunnerRequest} from '../src/utils/runnerExecution';
import {createEmptyAuth} from '../src/utils/auth';
import {parameterStateKey} from '../src/utils/requestPlan';
import {startRequestRecorder} from './support/requestRecorder';

const recorder = await startRequestRecorder();
try {
    const source = readFileSync(resolve('tests/fixtures/security-operation-public.yaml'), 'utf8').replace(
        'http://127.0.0.1:{port}',
        recorder.origin,
    );
    const spec: any = normalizeOpenApiSpec(yaml.load(source));
    const operation = spec.paths['/users/{id}'].post;
    const auth: any = {
        ...createEmptyAuth(),
        activeScheme: 'auth',
        selectedSchemes: ['auth'],
        schemeValues: {auth: {schemeId: 'auth', type: 'bearer', value: 'must-not-leak'}},
    };
    const missingPath = await executeRunnerRequest({
        spec,
        path: '/users/{id}',
        method: 'post',
        operation,
        selectedServer: recorder.origin,
        activeAuth: auth,
        parameterValues: {[parameterStateKey('query', 'code')]: 'wrong-pattern'},
        body: '{deliberately invalid json',
        bodyType: 'application/json',
    });
    assert.equal(missingPath.status, 0);
    assert.equal(missingPath.errorKind, 'validation');
    assert.equal(recorder.requests.length, 0, 'missing route segments must block network execution');
    assert.ok(missingPath.diagnostics?.some(item => item.code === 'RUN_REQUIRED_PARAMETER_MISSING' && item.blocking));

    const result = await executeRunnerRequest({
        spec,
        path: '/users/{id}',
        method: 'post',
        operation,
        selectedServer: recorder.origin,
        activeAuth: auth,
        parameterValues: {
            [parameterStateKey('path', 'id')]: 'not-a-number',
            [parameterStateKey('query', 'code')]: 'wrong-pattern',
            [parameterStateKey('header', 'X-Region')]: 'eu',
        },
        body: '{deliberately invalid json',
        bodyType: 'application/json',
    });

    assert.equal(result.status, 400);
    assert.match(result.body, /server rejected/);
    assert.equal(recorder.requests.length, 1);
    const recorded = recorder.requests[0];
    const recordedUrl = new URL(recorded.url, recorder.origin);
    assert.equal(decodeURIComponent(recordedUrl.pathname), '/users/not-a-number');
    assert.equal(recordedUrl.searchParams.get('code'), 'wrong-pattern');
    assert.equal(recorded.headers['x-region'], 'eu');
    assert.equal(recorded.headers.authorization, undefined, 'public operation must not receive the configured token');
    assert.equal(recorded.headers.accept, 'application/problem+json');
    assert.equal(recorded.body.toString(), '{deliberately invalid json');
    assert.ok(result.diagnostics?.some(item => item.code === 'RUN_PARAMETER_PATTERN_MISMATCH'));
    assert.ok(result.diagnostics?.some(item => item.code === 'RUN_BODY_JSON_INVALID'));
    console.log('✓ blocks missing route segments but sends other invalid inputs to the real HTTP recorder');

    const multipartOperation: any = {
        requestBody: {
            required: true,
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
        responses: {'400': {description: 'bad', content: {'application/problem+json': {}}}},
    };
    const multipartSpec: any = {
        openapi: '3.1.1',
        info: {title: 'Multipart', version: '1'},
        servers: [{url: recorder.origin}],
        paths: {'/upload': {post: multipartOperation}},
    };
    const multipartResult = await executeRunnerRequest({
        spec: multipartSpec,
        path: '/upload',
        method: 'post',
        operation: multipartOperation,
        selectedServer: recorder.origin,
        activeAuth: createEmptyAuth(),
        body: JSON.stringify({metadata: {kind: 'fixture'}}),
        bodyType: 'multipart/form-data',
        selectedFiles: {file: new Blob(['file bytes'], {type: 'text/plain'})},
    });
    assert.equal(multipartResult.status, 400);
    assert.equal(recorder.requests.length, 2);
    const multipart = recorder.requests[1];
    assert.match(String(multipart.headers['content-type']), /^multipart\/form-data; boundary=/);
    assert.match(multipart.body.toString(), /application\/json/);
    assert.match(multipart.body.toString(), /file bytes/);
    console.log('✓ records multipart parts and browser-generated boundary over real HTTP');
} finally {
    await recorder.close();
}
