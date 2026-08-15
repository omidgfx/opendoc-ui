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
        throw Object.assign(new Error('Only HTTP and HTTPS targets are allowed.'), {
            code: 'TARGET_PROTOCOL_BLOCKED',
            status: 400,
        });
    if (target.username || target.password)
        throw Object.assign(new Error('Target credentials in URLs are not allowed.'), {
            code: 'TARGET_CREDENTIALS_BLOCKED',
            status: 400,
        });
    const hostname = target.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local'))
        throw Object.assign(new Error('Local hostnames are blocked.'), {code: 'TARGET_HOST_BLOCKED', status: 403});
    if (!hostAllowed(hostname, config.allowedHosts))
        throw Object.assign(new Error('The target host is not in OPENDOC_ALLOWED_REMOTE_HOSTS.'), {
            code: 'TARGET_HOST_NOT_ALLOWED',
            status: 403,
        });
    const port = Number(target.port || (target.protocol === 'https:' ? 443 : 80));
    if (!config.allowedPorts.has(port))
        throw Object.assign(new Error(`Remote port ${port} is not allowed.`), {
            code: 'TARGET_PORT_BLOCKED',
            status: 403,
        });
    const literalFamily = net.isIP(hostname);
    const addresses = literalFamily
        ? [{address: hostname, family: literalFamily}]
        : await dns.lookup(hostname, {all: true, verbatim: true});
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address)))
        throw Object.assign(new Error('The target resolves to a private, reserved, or otherwise prohibited address.'), {
            code: 'TARGET_ADDRESS_BLOCKED',
            status: 403,
        });
    return {hostname, port, addresses};
};

const requestOnce = async (target, requestHeaders, config) => {
    const resolved = await resolvePublicTarget(target, config);
    const selected = resolved.addresses[0];
    const transport = target.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
        const request = transport.request(
            {
                protocol: target.protocol,
                hostname: resolved.hostname,
                port: resolved.port,
                method: 'GET',
                path: `${target.pathname}${target.search}`,
                headers: {
                    Accept: 'application/json, application/yaml, text/yaml, text/plain, */*;q=0.5',
                    'Accept-Encoding': 'identity',
                    'User-Agent': 'OpenDoc-Spec-Downloader/0.1',
                    ...(requestHeaders['if-none-match'] ? {'If-None-Match': requestHeaders['if-none-match']} : {}),
                    ...(requestHeaders['if-modified-since']
                        ? {'If-Modified-Since': requestHeaders['if-modified-since']}
                        : {}),
                },
                lookup: (_hostname, options, callback) => {
                    if (options?.all) callback(null, [selected]);
                    else callback(null, selected.address, selected.family);
                },
                servername: resolved.hostname,
            },
            response => resolve(response),
        );
        request.setTimeout(config.timeoutMs, () =>
            request.destroy(
                Object.assign(new Error('Remote request timed out.'), {code: 'REMOTE_TIMEOUT', status: 504}),
            ),
        );
        request.on('error', reject);
        request.end();
    });
};

const drain = response => response.resume();

export const downloadSpecification = async (input, requestHeaders, config) => {
    let target;
    try {
        target = new URL(input);
    } catch {
        throw Object.assign(new Error('spec_url must be a complete HTTP or HTTPS URL.'), {
            code: 'INVALID_TARGET_URL',
            status: 400,
        });
    }
    for (let redirects = 0; redirects <= config.maxRedirects; redirects += 1) {
        const response = await requestOnce(target, requestHeaders, config);
        const status = response.statusCode || 502;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
            drain(response);
            if (redirects === config.maxRedirects)
                throw Object.assign(new Error('Remote redirect limit exceeded.'), {
                    code: 'REMOTE_REDIRECT_LIMIT',
                    status: 502,
                });
            target = new URL(response.headers.location, target);
            continue;
        }
        if (status === 304) {
            drain(response);
            return {status, headers: response.headers, body: Buffer.alloc(0), sourceUrl: target.href};
        }
        if (status < 200 || status >= 300) {
            drain(response);
            throw Object.assign(new Error(`Remote server returned HTTP ${status}.`), {
                code: 'REMOTE_HTTP_STATUS',
                status: 502,
            });
        }
        const declared = Number(response.headers['content-length'] || 0);
        if (declared > config.maxBytes) {
            drain(response);
            throw Object.assign(new Error('Remote specification exceeds OPENDOC_MAX_BYTES.'), {
                code: 'REMOTE_FILE_TOO_LARGE',
                status: 413,
            });
        }
        const chunks = [];
        let total = 0;
        for await (const chunk of response) {
            total += chunk.length;
            if (total > config.maxBytes) {
                response.destroy();
                throw Object.assign(new Error('Remote specification exceeds OPENDOC_MAX_BYTES.'), {
                    code: 'REMOTE_FILE_TOO_LARGE',
                    status: 413,
                });
            }
            chunks.push(chunk);
        }
        return {status, headers: response.headers, body: Buffer.concat(chunks), sourceUrl: target.href};
    }
    throw Object.assign(new Error('Remote redirect limit exceeded.'), {code: 'REMOTE_REDIRECT_LIMIT', status: 502});
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

const applyCors = (request, response, config) => {
    const origin = String(request.headers.origin || '');
    if (origin && config.allowedOrigins.includes(origin)) {
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match, If-Modified-Since');
        response.setHeader(
            'Access-Control-Expose-Headers',
            'ETag, Last-Modified, Content-Length, Content-Type, X-OpenDoc-Final-URL',
        );
        return true;
    }
    return !origin;
};

const jsonError = (response, error) => {
    const status = Number(error?.status || 502);
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('Cache-Control', 'no-store');
    response.end(
        JSON.stringify({
            error: {
                code: error?.code || 'DOWNLOADER_ERROR',
                message: error instanceof Error ? error.message : 'Specification download failed.',
            },
        }),
    );
};

export const createDownloaderHandler =
    (config = configFromEnv()) =>
    async (request, response) => {
        if (!applyCors(request, response, config)) {
            jsonError(
                response,
                Object.assign(new Error('Browser origin is not allowed.'), {code: 'ORIGIN_NOT_ALLOWED', status: 403}),
            );
            return;
        }
        const requestUrl = new URL(request.url || '/', 'http://downloader.local');
        if (requestUrl.pathname === '/health') {
            response.statusCode = 200;
            response.setHeader('Content-Type', 'application/json; charset=utf-8');
            response.end('{"status":"ok"}');
            return;
        }
        if (requestUrl.pathname !== '/download') {
            jsonError(response, Object.assign(new Error('Route not found.'), {code: 'NOT_FOUND', status: 404}));
            return;
        }
        if (request.method === 'OPTIONS') {
            response.statusCode = 204;
            response.end();
            return;
        }
        if (request.method !== 'GET') {
            jsonError(
                response,
                Object.assign(new Error('Only GET and OPTIONS are allowed.'), {
                    code: 'METHOD_NOT_ALLOWED',
                    status: 405,
                }),
            );
            return;
        }
        const client = String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || '')
            .split(',')[0]
            .trim();
        if (!withinRateLimit(client, config.rateLimit)) {
            jsonError(
                response,
                Object.assign(new Error('Downloader rate limit exceeded.'), {code: 'RATE_LIMITED', status: 429}),
            );
            return;
        }
        const target = requestUrl.searchParams.get('spec_url');
        if (!target) {
            jsonError(
                response,
                Object.assign(new Error('Missing spec_url query parameter.'), {
                    code: 'MISSING_TARGET_URL',
                    status: 400,
                }),
            );
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

const isEntrypoint = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
    const config = configFromEnv();
    http.createServer(createDownloaderHandler(config)).listen(config.port, config.bind, () => {
        console.log(`OpenDoc specification downloader listening on http://${config.bind}:${config.port}`);
    });
}
