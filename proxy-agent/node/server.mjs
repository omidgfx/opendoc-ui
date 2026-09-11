import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import net from 'node:net';
import {pathToFileURL} from 'node:url';

const splitCsv = value =>
    String(value || '')
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
const positiveInt = (value, fallback) => {
    const parsed = Number.parseInt(String(value || ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const fail = (code, message, status) => Object.assign(new Error(message), {code, status});

export const configFromEnv = (env = process.env) => ({
    bind: env.OPENDOC_BIND || '0.0.0.0',
    port: positiveInt(env.PORT, 8080),
    allowedOrigins: splitCsv(env.OPENDOC_ALLOWED_ORIGINS),
    maxBytes: positiveInt(env.OPENDOC_MAX_BYTES, 10 * 1024 * 1024),
    timeoutMs: positiveInt(env.OPENDOC_TIMEOUT_SECONDS, 15) * 1000,
    maxRedirects: positiveInt(env.OPENDOC_MAX_REDIRECTS, 3),
    allowedPorts: new Set(splitCsv(env.OPENDOC_ALLOWED_PORTS || '80,443').map(Number)),
    allowedHosts: splitCsv(env.OPENDOC_ALLOWED_REMOTE_HOSTS).map(host => host.toLowerCase()),
    rateLimit: positiveInt(env.OPENDOC_RATE_LIMIT_PER_MINUTE, 60),
    proxyEnabled:
        String(env.OPENDOC_PROXY_ENABLED || 'true')
            .trim()
            .toLowerCase() !== 'false',
});

const ipv4Number = address => address.split('.').reduce((value, part) => (value << 8) + Number(part), 0) >>> 0;
const inV4Range = (value, base, bits) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (ipv4Number(base) & mask);
};

export const isPublicAddress = address => {
    const family = net.isIP(address);
    if (family === 4) {
        const value = ipv4Number(address);
        const blocked = [
            ['0.0.0.0', 8],
            ['10.0.0.0', 8],
            ['100.64.0.0', 10],
            ['127.0.0.0', 8],
            ['169.254.0.0', 16],
            ['172.16.0.0', 12],
            ['192.0.0.0', 24],
            ['192.0.2.0', 24],
            ['192.168.0.0', 16],
            ['198.18.0.0', 15],
            ['198.51.100.0', 24],
            ['203.0.113.0', 24],
            ['224.0.0.0', 4],
        ];
        return !blocked.some(([base, bits]) => inV4Range(value, base, bits));
    }
    if (family === 6) {
        const value = address.toLowerCase().split('%')[0];
        if (value.startsWith('::ffff:')) return isPublicAddress(value.slice(7));
        if (value === '::' || value === '::1') return false;
        if (/^f[cd]/.test(value) || /^fe[89ab]/.test(value) || value.startsWith('ff')) return false;
        if (value.startsWith('2001:db8:')) return false;
        return true;
    }
    return false;
};

const hostAllowed = (hostname, patterns) =>
    patterns.length === 0 ||
    patterns.some(pattern =>
        pattern.startsWith('*.')
            ? hostname.endsWith(pattern.slice(1)) && hostname.length > pattern.length - 1
            : hostname === pattern,
    );

export const resolvePublicTarget = async (target, config) => {
    if (!['http:', 'https:'].includes(target.protocol))
        throw fail('TARGET_PROTOCOL_BLOCKED', 'Only HTTP and HTTPS targets are allowed.', 400);
    if (target.username || target.password)
        throw fail('TARGET_CREDENTIALS_BLOCKED', 'Target credentials in URLs are not allowed.', 400);
    const hostname = target.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local'))
        throw fail('TARGET_HOST_BLOCKED', 'Local hostnames are blocked.', 403);
    if (!hostAllowed(hostname, config.allowedHosts))
        throw fail('TARGET_HOST_NOT_ALLOWED', 'The target host is not in OPENDOC_ALLOWED_REMOTE_HOSTS.', 403);
    const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
    if (!config.allowedPorts.has(port)) throw fail('TARGET_PORT_BLOCKED', `Remote port ${port} is not allowed.`, 403);
    const literalFamily = net.isIP(hostname);
    const addresses = literalFamily
        ? [{address: hostname, family: literalFamily}]
        : await dns.lookup(hostname, {all: true, verbatim: true});
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address)))
        throw fail(
            'TARGET_ADDRESS_BLOCKED',
            'The target resolves to a private, reserved, or otherwise prohibited address.',
            403,
        );
    return {hostname, port, addresses};
};

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const sendRequest = async (target, method, headers, body, config) => {
    const resolved = await resolvePublicTarget(target, config);
    const selected = resolved.addresses[0];
    const transport = target.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
        const request = transport.request(
            {
                protocol: target.protocol,
                hostname: resolved.hostname,
                port: resolved.port,
                method,
                path: `${target.pathname}${target.search}`,
                headers: {'Accept-Encoding': 'identity', 'User-Agent': 'OpenDoc-Proxy-Agent/0.1', ...headers},
                lookup: (_hostname, options, callback) => {
                    if (options?.all) callback(null, [selected]);
                    else callback(null, selected.address, selected.family);
                },
                servername: resolved.hostname,
            },
            response => resolve(response),
        );
        request.setTimeout(config.timeoutMs, () =>
            request.destroy(fail('REMOTE_TIMEOUT', 'Remote request timed out.', 504)),
        );
        request.on('error', reject);
        request.end(body && body.length > 0 ? body : undefined);
    });
};

const readBodyCapped = async (stream, maxBytes, code, message, status) => {
    const chunks = [];
    let total = 0;
    for await (const chunk of stream) {
        total += chunk.length;
        if (total > maxBytes) {
            stream.destroy();
            throw fail(code, message, status);
        }
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
};

export const downloadSpecification = async (input, requestHeaders, config) => {
    let target;
    try {
        target = new URL(input);
    } catch {
        throw fail('INVALID_TARGET_URL', 'spec_url must be a complete HTTP or HTTPS URL.', 400);
    }
    const headers = {
        Accept: 'application/json, application/yaml, text/yaml, text/plain, */*;q=0.5',
        ...(requestHeaders['if-none-match'] ? {'If-None-Match': requestHeaders['if-none-match']} : {}),
        ...(requestHeaders['if-modified-since'] ? {'If-Modified-Since': requestHeaders['if-modified-since']} : {}),
    };
    for (let redirects = 0; redirects <= config.maxRedirects; redirects += 1) {
        const response = await sendRequest(target, 'GET', headers, null, config);
        const status = response.statusCode || 502;
        if (REDIRECT_STATUSES.has(status) && response.headers.location) {
            response.resume();
            if (redirects === config.maxRedirects)
                throw fail('REMOTE_REDIRECT_LIMIT', 'Remote redirect limit exceeded.', 502);
            target = new URL(response.headers.location, target);
            continue;
        }
        if (status === 304) {
            response.resume();
            return {status, headers: response.headers, body: Buffer.alloc(0), sourceUrl: target.href};
        }
        if (status < 200 || status >= 300) {
            response.resume();
            throw fail('REMOTE_HTTP_STATUS', `Remote server returned HTTP ${status}.`, 502);
        }
        const declared = Number(response.headers['content-length'] || 0);
        if (declared > config.maxBytes) {
            response.resume();
            throw fail('REMOTE_FILE_TOO_LARGE', 'Remote specification exceeds OPENDOC_MAX_BYTES.', 413);
        }
        const body = await readBodyCapped(
            response,
            config.maxBytes,
            'REMOTE_FILE_TOO_LARGE',
            'Remote specification exceeds OPENDOC_MAX_BYTES.',
            413,
        );
        return {status, headers: response.headers, body, sourceUrl: target.href};
    }
    throw fail('REMOTE_REDIRECT_LIMIT', 'Remote redirect limit exceeded.', 502);
};

const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
    'host',
    'content-length',
    'accept-encoding',
]);

const parseProxyDescriptor = requestHeaders => {
    const targetUrl = String(requestHeaders['x-opendoc-target-url'] || '').trim();
    if (!targetUrl) throw fail('MISSING_TARGET_URL', 'Missing X-OpenDoc-Target-Url header.', 400);
    let target;
    try {
        target = new URL(targetUrl);
    } catch {
        throw fail('INVALID_TARGET_URL', 'Target URL must be a complete URL.', 400);
    }
    if (!['http:', 'https:'].includes(target.protocol))
        throw fail('TARGET_PROTOCOL_BLOCKED', 'Only HTTP and HTTPS targets are allowed.', 400);
    if (target.username || target.password)
        throw fail('TARGET_CREDENTIALS_BLOCKED', 'Target credentials in URLs are not allowed.', 400);
    const method =
        String(requestHeaders['x-opendoc-target-method'] || 'GET')
            .trim()
            .toUpperCase() || 'GET';
    if (!/^[A-Z]+$/.test(method)) throw fail('INVALID_TARGET_METHOD', 'Target method is not valid.', 400);
    const headers = {};
    const rawHeaders = String(requestHeaders['x-opendoc-target-headers'] || '').trim();
    if (rawHeaders) {
        let parsed;
        try {
            parsed = JSON.parse(rawHeaders);
        } catch {
            throw fail('INVALID_TARGET_HEADERS', 'X-OpenDoc-Target-Headers must be a JSON object.', 400);
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
            throw fail('INVALID_TARGET_HEADERS', 'X-OpenDoc-Target-Headers must be a JSON object.', 400);
        for (const [key, value] of Object.entries(parsed))
            if (typeof value === 'string' && !HOP_BY_HOP_HEADERS.has(key.toLowerCase())) headers[key] = value;
    }
    return {target, method, headers};
};

export const executeProxiedRequest = async (rawBody, requestHeaders, config) => {
    const startedAt = Date.now();
    if (!config.proxyEnabled)
        throw fail('PROXY_DISABLED', 'The request proxy is disabled on this proxy agent.', 403);
    const descriptor = parseProxyDescriptor(requestHeaders);
    let method = descriptor.method;
    let body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody || []);
    let current = descriptor.target;
    for (let hop = 0; hop <= config.maxRedirects; hop += 1) {
        const response = await sendRequest(current, method, descriptor.headers, body, config);
        const status = response.statusCode || 502;
        const location = String(response.headers.location || '');
        if (REDIRECT_STATUSES.has(status) && location && hop < config.maxRedirects) {
            response.resume();
            if (status === 303 || (status !== 307 && status !== 308 && method !== 'GET' && method !== 'HEAD')) {
                method = 'GET';
                body = Buffer.alloc(0);
            }
            current = new URL(location, current);
            continue;
        }
        const payload = await readBodyCapped(
            response,
            config.maxBytes,
            'REMOTE_RESPONSE_TOO_LARGE',
            'Remote response exceeds OPENDOC_MAX_BYTES.',
            502,
        );
        const headers = {};
        for (const [key, value] of Object.entries(response.headers))
            if (typeof value === 'string') headers[key] = value;
            else if (Array.isArray(value)) headers[key] = value.join(', ');
        return {
            status,
            statusText: String(response.statusMessage || ''),
            headers,
            finalUrl: current.href,
            body: payload,
            durationMs: Date.now() - startedAt,
        };
    }
    throw fail('REMOTE_REDIRECT_LIMIT', 'Remote redirect limit exceeded.', 502);
};

const rateBuckets = new Map();
const withinRateLimit = (key, limit) => {
    const minute = Math.floor(Date.now() / 60000);
    const bucket = rateBuckets.get(key);
    if (!bucket || bucket.minute !== minute) {
        rateBuckets.set(key, {minute, count: 1});
        return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
};

const clientKey = request =>
    String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || '')
        .split(',')[0]
        .trim();

const applyCors = (request, response, config) => {
    const origin = String(request.headers.origin || '');
    if (origin && config.allowedOrigins.includes(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        response.setHeader(
            'Access-Control-Allow-Headers',
            'Content-Type, If-None-Match, If-Modified-Since, X-OpenDoc-Target-Url, X-OpenDoc-Target-Method, X-OpenDoc-Target-Headers',
        );
        response.setHeader(
            'Access-Control-Expose-Headers',
            'ETag, Last-Modified, Content-Length, Content-Type, X-OpenDoc-Final-URL',
        );
        return true;
    }
    return !origin;
};

const jsonError = (response, error) => {
    response.statusCode = Number(error?.status || 502);
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(
        JSON.stringify({
            error: {
                code: error?.code || 'PROXY_AGENT_ERROR',
                message: error instanceof Error ? error.message : 'Proxy agent request failed.',
            },
        }),
    );
};

const serveProxy = async (request, response, config) => {
    if (request.method !== 'POST') {
        jsonError(response, fail('METHOD_NOT_ALLOWED', 'Only POST and OPTIONS are allowed.', 405));
        return;
    }
    if (!withinRateLimit(clientKey(request), config.rateLimit)) {
        jsonError(response, fail('RATE_LIMITED', 'Proxy agent rate limit exceeded.', 429));
        return;
    }
    let rawBody;
    try {
        rawBody = await readBodyCapped(
            request,
            config.maxBytes,
            'REQUEST_BODY_TOO_LARGE',
            'Proxied request body exceeds OPENDOC_MAX_BYTES.',
            413,
        );
    } catch (error) {
        jsonError(response, error);
        return;
    }
    try {
        const result = await executeProxiedRequest(rawBody, request.headers, config);
        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('X-OpenDoc-Final-URL', result.finalUrl);
        response.end(
            JSON.stringify({
                status: result.status,
                statusText: result.statusText,
                headers: result.headers,
                finalUrl: result.finalUrl,
                body: result.body.toString('base64'),
                bodyEncoding: 'base64',
                durationMs: result.durationMs,
            }),
        );
    } catch (error) {
        jsonError(response, error);
    }
};

const serveDownload = async (request, response, requestUrl, config) => {
    if (request.method !== 'GET') {
        jsonError(response, fail('METHOD_NOT_ALLOWED', 'Only GET and OPTIONS are allowed.', 405));
        return;
    }
    if (!withinRateLimit(clientKey(request), config.rateLimit)) {
        jsonError(response, fail('RATE_LIMITED', 'Proxy agent rate limit exceeded.', 429));
        return;
    }
    const target = requestUrl.searchParams.get('spec_url');
    if (!target) {
        jsonError(response, fail('MISSING_TARGET_URL', 'Missing spec_url query parameter.', 400));
        return;
    }
    try {
        const result = await downloadSpecification(target, request.headers, config);
        response.statusCode = result.status;
        for (const header of ['content-type', 'etag', 'last-modified']) {
            const value = result.headers[header];
            if (value) response.setHeader(header, value);
        }
        response.setHeader('Content-Length', result.body.length);
        response.setHeader('X-OpenDoc-Final-URL', result.sourceUrl);
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.end(result.body);
    } catch (error) {
        jsonError(response, error);
    }
};

export const createProxyAgentHandler =
    (config = configFromEnv()) =>
    async (request, response) => {
        if (!applyCors(request, response, config)) {
            jsonError(response, fail('ORIGIN_NOT_ALLOWED', 'Browser origin is not allowed.', 403));
            return;
        }
        const requestUrl = new URL(request.url || '/', 'http://proxy-agent.local');
        if (requestUrl.pathname === '/health') {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end('{"status":"ok"}');
            return;
        }
        if (request.method === 'OPTIONS') {
            response.statusCode = 204;
            response.end();
            return;
        }
        if (requestUrl.pathname === '/proxy') return serveProxy(request, response, config);
        if (requestUrl.pathname === '/download') return serveDownload(request, response, requestUrl, config);
        jsonError(response, fail('NOT_FOUND', 'Route not found.', 404));
    };

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
    const config = configFromEnv();
    http.createServer(createProxyAgentHandler(config)).listen(config.port, config.bind, () => {
        console.log(`OpenDoc UI proxy agent listening on http://${config.bind}:${config.port}`);
    });
}
