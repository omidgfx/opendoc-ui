/** Docker capability probing, port checks, and health polling. */
import {createServer} from 'node:net';
import {spawnProbe} from './env.mjs';

export const probeDocker = () => {
    const result = {available: false, version: null, compose: false, reason: ''};
    const engine = spawnProbe('docker', ['info', '--format', '{{.ServerVersion}}']);
    if (engine.status !== 0) {
        result.reason = (engine.stderr || '').trim().split('\n')[0] || 'docker command failed';
        return result;
    }
    result.available = true;
    result.version = (engine.stdout || '').trim();
    const compose = spawnProbe('docker', ['compose', 'version']);
    result.compose = compose.status === 0;
    if (!result.compose) result.reason = 'docker compose plugin not found';
    return result;
};

/** Best-effort check whether a TCP port is already in use. */
export const portInUse = port =>
    new Promise(resolve => {
        const socket = createServer();
        socket.once('error', () => resolve(true));
        socket.once('listening', () => socket.close(() => resolve(false)));
        socket.listen(port, '127.0.0.1');
    });

export const pollHealthz = async (port, timeoutMs = 60000) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(`http://127.0.0.1:${port}/healthz`, {signal: AbortSignal.timeout(2000)});
            if (response.ok) return true;
        } catch {
            // not up yet
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return false;
};
