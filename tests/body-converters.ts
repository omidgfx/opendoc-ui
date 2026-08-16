import {strict as assert} from 'node:assert';
import {
    jsonToQueryString,
    jsonToXml,
    queryStringToJson,
    xmlToJson,
    convertBodyText,
    parseBodyToJson,
} from '../src/utils/runner/bodyConverters';
import {compileBrowserRequest} from '../src/utils/runner/requestPlan';

const test = (name: string, callback: () => void) => {
    callback();
    console.log(`✓ ${name}`);
};

test('converts JSON to XML with schema xml hints (name, wrapped, namespace, prefix)', () => {
    const schema = {
        type: 'object',
        xml: {name: 'message', namespace: 'https://example.com/opendoc', prefix: 'od'},
        properties: {
            title: {type: 'string', xml: {name: 'title'}},
            enabled: {type: 'boolean', xml: {name: 'enabled'}},
            labels: {
                type: 'array',
                xml: {name: 'labels', wrapped: true},
                items: {type: 'string', xml: {name: 'label'}},
            },
            ref: {type: 'string', xml: {attribute: true}},
        },
    };
    const xml = jsonToXml({title: 'OpenDoc UI', enabled: true, labels: ['docs', 'runner'], ref: 'x-1'}, schema);
    assert.match(xml, /<od:message xmlns:od="https:\/\/example.com\/opendoc"[^>]*>/);
    assert.match(xml, /<od:title>OpenDoc UI<\/od:title>/);
    assert.match(xml, /<od:enabled>true<\/od:enabled>/);
    assert.match(xml, /<od:labels>/);
    assert.match(xml, /<od:label>docs<\/od:label>/);
    assert.match(xml, /<od:label>runner<\/od:label>/);
    assert.match(xml, /ref="x-1"/);
});

test('parses XML back into JSON with arrays and attributes', () => {
    const xml = `<?xml version="1.0"?><message><title>OpenDoc UI</title><labels><label>docs</label><label>runner</label></labels><meta id="7">text</meta></message>`;
    const value = xmlToJson(xml);
    assert.deepEqual(value, {
        title: 'OpenDoc UI',
        labels: {label: ['docs', 'runner']},
        meta: {'@id': '7', '#text': 'text'},
    });
});

test('round-trips XML through JSON (text values are strings by nature)', () => {
    const source = {order: {id: '42', items: [{sku: 'a'}, {sku: 'b'}], note: ''}};
    const xml = jsonToXml(source);
    const parsed = xmlToJson(xml);
    assert.deepEqual(parsed, source);
});

test('serializes JSON to a bracket-notation query string', () => {
    const encoded = jsonToQueryString({a: 1, b: 4, j: [1], a2: [5], k: {key: 'foo'}, nested: {list: [1, 2]}});
    const parts = encoded.split('&');
    assert.ok(parts.includes('a=1'));
    assert.ok(parts.includes('b=4'));
    assert.ok(parts.includes('j[]=1'));
    assert.ok(parts.includes('a2[]=5'));
    assert.ok(parts.includes('k[key]=foo'));
    assert.ok(parts.includes('nested[list][]=1'));
    assert.ok(parts.includes('nested[list][]=2'));
});

test('parses the documented bracket-notation example back to JSON', () => {
    const value = queryStringToJson('a=1&b=4&j[]=1&a[]=5&k[key]=foo');
    assert.deepEqual(value, {a: ['1', '5'], b: '4', j: ['1'], k: {key: 'foo'}});
});

test('parses numeric indices, repeated keys and nested objects', () => {
    assert.deepEqual(queryStringToJson('a[0]=x&a[1]=y'), {a: ['x', 'y']});
    assert.deepEqual(queryStringToJson('tag=one&tag=two'), {tag: ['one', 'two']});
    assert.deepEqual(queryStringToJson('k[a][b]=c'), {k: {a: {b: 'c'}}});
    assert.deepEqual(queryStringToJson('k[a][]=c&k[a][]=d'), {k: {a: ['c', 'd']}});
});

test('converts between JSON, YAML, XML and query formats', () => {
    const value = {name: 'OpenDoc', tags: ['docs', 'runner']};
    const yaml = convertBodyText(JSON.stringify(value), 'application/json', 'application/yaml');
    assert.match(yaml, /name: OpenDoc/);
    assert.match(yaml, /- docs/);
    assert.deepEqual(parseBodyToJson(yaml, 'application/yaml'), value);

    const xml = convertBodyText(JSON.stringify(value), 'application/json', 'application/xml');
    assert.match(xml, /<name>OpenDoc<\/name>/);
    assert.deepEqual(parseBodyToJson(xml, 'application/xml'), value);

    const query = convertBodyText(JSON.stringify(value), 'application/json', 'application/x-www-form-urlencoded');
    assert.ok(query.includes('name=OpenDoc'));
    assert.ok(query.includes('tags[]=docs'));
    assert.deepEqual(parseBodyToJson(query, 'application/x-www-form-urlencoded'), value);

    // non-convertible text passes through unchanged
    const unchanged = convertBodyText('not structured', 'application/json', 'application/xml');
    assert.equal(unchanged, 'not structured');
});

test('keeps text already in the target format untouched', () => {
    const xml = '<message><title>OpenDoc UI</title></message>';
    assert.equal(convertBodyText(xml, 'application/xml', 'application/xml'), xml);
    const yaml = 'name: OpenDoc\n';
    assert.equal(convertBodyText(yaml, 'application/yaml', 'application/yaml'), yaml);
});

test('converts from unknown textual formats instead of passing through unchanged', () => {
    // plain text -> XML wraps the payload in a root element
    const xml = convertBodyText('plain payload', 'text/plain', 'application/xml');
    assert.match(xml, /<root>plain payload<\/root>/);
    // plain text -> JSON becomes a quoted JSON string
    assert.equal(convertBodyText('plain payload', 'text/plain', 'application/json'), '"plain payload"');
    // plain text -> YAML stays a valid scalar
    assert.match(convertBodyText('plain payload', 'text/plain', 'application/yaml'), /plain payload/);
    // plain text -> query string uses a value key
    assert.equal(
        convertBodyText('plain payload', 'text/plain', 'application/x-www-form-urlencoded'),
        'value=plain%20payload',
    );
    // JSON-shaped unknown text converts for real
    const yaml = convertBodyText('{"name":"OpenDoc"}', 'text/plain', 'application/yaml');
    assert.match(yaml, /name: OpenDoc/);
    // unknown -> unknown (both textual) stays untouched
    assert.equal(convertBodyText('hello', 'text/plain', 'text/html'), 'hello');
    // known -> unknown keeps the structured representation
    const text = convertBodyText('<message><title>OpenDoc UI</title></message>', 'application/xml', 'text/plain');
    assert.ok(text.includes('OpenDoc UI'));
});

test('urlencoded execution sends bracket notation and the right Content-Type', () => {
    const emptyAuth = {
        activeScheme: 'none',
        selectedSchemes: [],
        schemeValues: {},
        cookieValues: {},
        bearerToken: '',
        apiKeyName: '',
        apiKeyValue: '',
        apiKeyIn: 'header' as const,
        basicUsername: '',
        basicPassword: '',
    };
    const operation: any = {
        requestBody: {content: {'application/x-www-form-urlencoded': {schema: {type: 'object'}}}},
        responses: {'200': {description: 'ok'}},
    };
    const spec: any = {
        openapi: '3.0.3',
        info: {title: 'Fixture', version: '1'},
        paths: {'/login': {post: operation}},
    };
    const plan = compileBrowserRequest({
        spec,
        path: '/login',
        method: 'post',
        operation,
        selectedServer: 'https://api.example.test',
        activeAuth: emptyAuth,
        body: 'name=OpenDoc&tags[]=docs&tags[]=runner&k[key]=foo',
        bodyType: 'application/x-www-form-urlencoded',
    });
    assert.equal(plan.headers['Content-Type'], 'application/x-www-form-urlencoded');
    const body = String(plan.body);
    assert.match(body, /name=OpenDoc/);
    // brackets are URL-encoded on the wire: tags%5B%5D=docs&tags%5B%5D=runner&k%5Bkey%5D=foo
    assert.match(body, /tags%5B%5D=docs/);
    assert.match(body, /tags%5B%5D=runner/);
    assert.match(body, /k%5Bkey%5D=foo/);
    assert.deepEqual(queryStringToJson(body), {
        name: 'OpenDoc',
        tags: ['docs', 'runner'],
        k: {key: 'foo'},
    });
});

console.log('✓ body converter matrix passed');
