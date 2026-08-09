import {createServer, type IncomingHttpHeaders, type Server} from 'node:http';

export interface RecordedRequest {
    method: string;
    url: string;
    headers: IncomingHttpHeaders;
    body: Buffer;
}

export interface RequestRecorder {
    origin: string;
    requests: RecordedRequest[];
    close: () => Promise<void>;
}

export const startRequestRecorder = async (): Promise<RequestRecorder> => {
    const requests: RecordedRequest[] = [];
    const server: Server = createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        request.on('end', () => {
            requests.push({
                method: request.method || '',
                url: request.url || '',
                headers: request.headers,
                body: Buffer.concat(chunks),
            });
            response.statusCode = 400;
            response.setHeader('content-type', 'application/problem+json');
            response.end(JSON.stringify({error: 'server rejected the deliberately invalid request'}));
        });
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => resolve());
    });
    const address = server.address();
    if (!address || typeof address === 'string')
        throw new Error('Recorder did not receive a TCP port.');
    return {
        origin: `http://127.0.0.1:${address.port}`,
        requests,
        close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
    };
};
