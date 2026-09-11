<?php

declare(strict_types=1);

require dirname(__DIR__) . '/src/ProxyAgent.php';

use OpenDoc\ProxyAgent\ProxyAgentException;
use function OpenDoc\ProxyAgent\configFromEnv;
use function OpenDoc\ProxyAgent\downloadSpecification;
use function OpenDoc\ProxyAgent\executeProxiedRequest;

$config = configFromEnv();
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

function sendCors(string $origin, array $config): bool
{
    if ($origin === '') {
        return true;
    }
    if (!in_array($origin, $config['allowedOrigins'], true)) {
        return false;
    }
    header("Access-Control-Allow-Origin: {$origin}");
    header('Vary: Origin');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, If-None-Match, If-Modified-Since, X-OpenDoc-Target-Url, X-OpenDoc-Target-Method, X-OpenDoc-Target-Headers');
    header('Access-Control-Expose-Headers: ETag, Last-Modified, Content-Length, Content-Type, X-OpenDoc-Final-URL');
    return true;
}

function sendError(ProxyAgentException $error, string $origin, array $config): never
{
    http_response_code($error->httpStatus);
    sendCors($origin, $config);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['error' => ['code' => $error->errorCode, 'message' => $error->getMessage()]], JSON_UNESCAPED_SLASHES);
    exit;
}

function withinRateLimit(string $client, int $limit): bool
{
    $path = sys_get_temp_dir() . '/opendoc-proxy-agent-' . hash('sha256', $client) . '.json';
    $handle = @fopen($path, 'c+');
    if ($handle === false) {
        return true;
    }
    try {
        if (!flock($handle, LOCK_EX)) {
            return true;
        }
        $contents = stream_get_contents($handle);
        $record = is_string($contents) ? json_decode($contents, true) : null;
        $minute = (int) floor(time() / 60);
        $count = is_array($record) && ($record['minute'] ?? -1) === $minute ? (int) ($record['count'] ?? 0) : 0;
        $count++;
        rewind($handle);
        ftruncate($handle, 0);
        fwrite($handle, json_encode(['minute' => $minute, 'count' => $count]));
        fflush($handle);
        flock($handle, LOCK_UN);
        return $count <= $limit;
    } finally {
        fclose($handle);
    }
}

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($path === '/health') {
    header('Content-Type: application/json; charset=utf-8');
    echo '{"status":"ok"}';
    exit;
}
if ($path === '/proxy') {
    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        sendCors($origin, $config);
        exit;
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendError(new ProxyAgentException('METHOD_NOT_ALLOWED', 'Only POST and OPTIONS are allowed.', 405), $origin, $config);
    }
    $client = trim(explode(',', (string) ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? ''))[0]);
    if (!withinRateLimit($client, $config['rateLimit'])) {
        sendError(new ProxyAgentException('RATE_LIMITED', 'Proxy rate limit exceeded.', 429), $origin, $config);
    }
    $rawBody = file_get_contents('php://input') ?: '';
    if (strlen($rawBody) > $config['maxBytes']) {
        sendError(new ProxyAgentException('REQUEST_BODY_TOO_LARGE', 'Proxied request body exceeds OPENDOC_MAX_BYTES.', 413), $origin, $config);
    }
    $incoming = array_change_key_case(getallheaders() ?: [], CASE_LOWER);
    try {
        $result = executeProxiedRequest($rawBody, $incoming, $config);
    } catch (ProxyAgentException $error) {
        sendError($error, $origin, $config);
    }
    sendCors($origin, $config);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    header('X-OpenDoc-Final-URL: ' . $result['finalUrl']);
    echo json_encode($result, JSON_UNESCAPED_SLASHES);
    exit;
}
if ($path !== '/download') {
    sendError(new ProxyAgentException('NOT_FOUND', 'Route not found.', 404), $origin, $config);
}
if ($origin !== '' && !in_array($origin, $config['allowedOrigins'], true)) {
    sendError(new ProxyAgentException('ORIGIN_NOT_ALLOWED', 'Browser origin is not allowed.', 403), $origin, $config);
}
if ($method === 'OPTIONS') {
    http_response_code(204);
    sendCors($origin, $config);
    exit;
}
if ($method !== 'GET') {
    sendError(new ProxyAgentException('METHOD_NOT_ALLOWED', 'Only GET and OPTIONS are allowed.', 405), $origin, $config);
}
$client = trim(explode(',', $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? 'unknown')[0]);
if (!withinRateLimit($client, $config['rateLimit'])) {
    sendError(new ProxyAgentException('RATE_LIMITED', 'Proxy agent rate limit exceeded.', 429), $origin, $config);
}
$target = isset($_GET['spec_url']) ? (string) $_GET['spec_url'] : '';
if ($target === '') {
    sendError(new ProxyAgentException('MISSING_TARGET_URL', 'Missing spec_url query parameter.', 400), $origin, $config);
}

try {
    $result = downloadSpecification(
        $target,
        [
            'if-none-match' => $_SERVER['HTTP_IF_NONE_MATCH'] ?? '',
            'if-modified-since' => $_SERVER['HTTP_IF_MODIFIED_SINCE'] ?? '',
        ],
        $config
    );
    http_response_code($result['status']);
    sendCors($origin, $config);
    foreach (['content-type' => 'Content-Type', 'etag' => 'ETag', 'last-modified' => 'Last-Modified'] as $source => $output) {
        if (($result['headers'][$source] ?? '') !== '') {
            header($output . ': ' . $result['headers'][$source]);
        }
    }
    header('Content-Length: ' . strlen($result['body']));
    header('X-OpenDoc-Final-URL: ' . $result['sourceUrl']);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo $result['body'];
} catch (ProxyAgentException $error) {
    sendError($error, $origin, $config);
} catch (Throwable) {
    sendError(new ProxyAgentException('PROXY_AGENT_ERROR', 'Specification download failed.', 502), $origin, $config);
}
