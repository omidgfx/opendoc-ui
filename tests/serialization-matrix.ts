import assert from 'node:assert/strict';
import {queryStringFromPairs, serializeOpenApiParameter} from '../src/utils/openapi/serialization';

const queryCases: Array<{name: string; parameter: any; value: any; expected: string}> = [
    {name: 'query primitive', parameter: {name: 'id', in: 'query'}, value: 'a b', expected: '?id=a%20b'},
    {
        name: 'query form array explode',
        parameter: {name: 'id', in: 'query', style: 'form', explode: true, schema: {type: 'array'}},
        value: ['a', 'b'],
        expected: '?id=a&id=b',
    },
    {
        name: 'query form array compact',
        parameter: {name: 'id', in: 'query', style: 'form', explode: false, schema: {type: 'array'}},
        value: ['a', 'b'],
        expected: '?id=a%2Cb',
    },
    {
        name: 'query form object explode',
        parameter: {name: 'filter', in: 'query', style: 'form', explode: true, schema: {type: 'object'}},
        value: {role: 'admin', first: 'Alex'},
        expected: '?role=admin&first=Alex',
    },
    {
        name: 'query form object compact',
        parameter: {name: 'filter', in: 'query', style: 'form', explode: false, schema: {type: 'object'}},
        value: {role: 'admin', first: 'Alex'},
        expected: '?filter=role%2Cadmin%2Cfirst%2CAlex',
    },
    {
        name: 'query spaceDelimited',
        parameter: {name: 'id', in: 'query', style: 'spaceDelimited', explode: false, schema: {type: 'array'}},
        value: ['a', 'b'],
        expected: '?id=a%20b',
    },
    {
        name: 'query pipeDelimited',
        parameter: {name: 'id', in: 'query', style: 'pipeDelimited', explode: false, schema: {type: 'array'}},
        value: ['a', 'b'],
        expected: '?id=a%7Cb',
    },
    {
        name: 'query deepObject',
        parameter: {name: 'filter', in: 'query', style: 'deepObject', explode: true, schema: {type: 'object'}},
        value: {role: 'admin'},
        expected: '?filter%5Brole%5D=admin',
    },
    {
        name: 'allowReserved keeps safe reserved but protects delimiters',
        parameter: {name: 'next', in: 'query', allowReserved: true},
        value: 'https://x.test/a?x=1&y=2#part',
        expected: '?next=https://x.test/a?x%3D1%26y%3D2%23part',
    },
    {
        name: 'allowReserved preserves percent triples',
        parameter: {name: 'encoded', in: 'query', allowReserved: true},
        value: 'a%2Fb',
        expected: '?encoded=a%2Fb',
    },
];
for (const item of queryCases) {
    const result = serializeOpenApiParameter(item.parameter, item.value);
    assert.equal(queryStringFromPairs(result.query), item.expected, item.name);
}

const pathCases: Array<{name: string; parameter: any; value: any; expected: string}> = [
    {name: 'simple primitive', parameter: {name: 'id', in: 'path', style: 'simple'}, value: 'blue', expected: 'blue'},
    {
        name: 'simple array',
        parameter: {name: 'id', in: 'path', style: 'simple', schema: {type: 'array'}},
        value: ['a', 'b'],
        expected: 'a,b',
    },
    {
        name: 'simple object compact',
        parameter: {name: 'id', in: 'path', style: 'simple', explode: false, schema: {type: 'object'}},
        value: {x: 1, y: 2},
        expected: 'x,1,y,2',
    },
    {
        name: 'simple object explode',
        parameter: {name: 'id', in: 'path', style: 'simple', explode: true, schema: {type: 'object'}},
        value: {x: 1, y: 2},
        expected: 'x=1,y=2',
    },
    {name: 'label primitive', parameter: {name: 'id', in: 'path', style: 'label'}, value: 'blue', expected: '.blue'},
    {
        name: 'label array explode',
        parameter: {name: 'id', in: 'path', style: 'label', explode: true, schema: {type: 'array'}},
        value: ['a', 'b'],
        expected: '.a.b',
    },
    {
        name: 'label object explode',
        parameter: {name: 'id', in: 'path', style: 'label', explode: true, schema: {type: 'object'}},
        value: {x: 1, y: 2},
        expected: '.x=1.y=2',
    },
    {
        name: 'matrix primitive',
        parameter: {name: 'id', in: 'path', style: 'matrix'},
        value: 'blue',
        expected: ';id=blue',
    },
    {
        name: 'matrix array compact',
        parameter: {name: 'id', in: 'path', style: 'matrix', explode: false, schema: {type: 'array'}},
        value: ['a', 'b'],
        expected: ';id=a,b',
    },
    {
        name: 'matrix array explode',
        parameter: {name: 'id', in: 'path', style: 'matrix', explode: true, schema: {type: 'array'}},
        value: ['a', 'b'],
        expected: ';id=a;id=b',
    },
    {
        name: 'matrix object explode',
        parameter: {name: 'id', in: 'path', style: 'matrix', explode: true, schema: {type: 'object'}},
        value: {x: 1, y: 2},
        expected: ';x=1;y=2',
    },
];
for (const item of pathCases) {
    const result = serializeOpenApiParameter(item.parameter, item.value);
    assert.equal(result.pathValue, item.expected, item.name);
}

const headerArray = serializeOpenApiParameter({name: 'X-Id', in: 'header', schema: {type: 'array'}}, ['a', 'b']);
assert.equal(headerArray.headers['X-Id'], 'a,b');
const headerObject = serializeOpenApiParameter(
    {name: 'X-Filter', in: 'header', explode: true, schema: {type: 'object'}},
    {x: 1, y: 2},
);
assert.equal(headerObject.headers['X-Filter'], 'x=1,y=2');
const cookieObject = serializeOpenApiParameter(
    {name: 'prefs', in: 'cookie', style: 'cookie', explode: true, schema: {type: 'object'}},
    {theme: 'dark', code: 42},
);
assert.deepEqual(cookieObject.cookies, [
    {name: 'theme', value: 'dark'},
    {name: 'code', value: '42'},
]);

const swaggerFormats: Array<[string, string]> = [
    ['csv', 'a,b'],
    ['ssv', 'a b'],
    ['tsv', 'a\tb'],
    ['pipes', 'a|b'],
];
for (const [collectionFormat, expected] of swaggerFormats) {
    const result = serializeOpenApiParameter(
        {name: 'id', in: 'query', collectionFormat, schema: {type: 'array'}, style: 'form', explode: false},
        ['a', 'b'],
    );
    assert.equal(result.query[0].value, expected, `Swagger ${collectionFormat}`);
}
const multi = serializeOpenApiParameter(
    {name: 'id', in: 'query', collectionFormat: 'multi', schema: {type: 'array'}, style: 'form', explode: true},
    ['a', 'b'],
);
assert.deepEqual(multi.query, [
    {name: 'id', value: 'a', allowReserved: false},
    {name: 'id', value: 'b', allowReserved: false},
]);

console.log(`✓ parameter serialization conformance matrix (${queryCases.length + pathCases.length + 8} cases)`);
