<?php

declare(strict_types=1);

namespace OpenDoc\Downloader;

use RuntimeException;

final class DownloaderException extends RuntimeException
{
    public function __construct(public readonly string $errorCode, string $message, public readonly int $httpStatus = 502)
    {
        parent::__construct($message);
    }
}

function csv(?string $value): array
{
    return array_values(array_filter(array_map('trim', explode(',', $value ?? '')), fn ($item) => $item !== ''));
}

function positiveInt(?string $value, int $fallback): int
{
    $parsed = filter_var($value, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
    return $parsed === false ? $fallback : (int) $parsed;
}

function configFromEnv(): array
{
    return [
        'allowedOrigins' => csv(getenv('OPENDOC_ALLOWED_ORIGINS') ?: ''),
        'maxBytes' => positiveInt(getenv('OPENDOC_MAX_BYTES') ?: null, 10 * 1024 * 1024),
        'timeoutSeconds' => positiveInt(getenv('OPENDOC_TIMEOUT_SECONDS') ?: null, 15),
        'maxRedirects' => positiveInt(getenv('OPENDOC_MAX_REDIRECTS') ?: null, 3),
        'allowedPorts' => array_map('intval', csv(getenv('OPENDOC_ALLOWED_PORTS') ?: '80,443')),
        'allowedHosts' => array_map('strtolower', csv(getenv('OPENDOC_ALLOWED_REMOTE_HOSTS') ?: '')),
        'rateLimit' => positiveInt(getenv('OPENDOC_RATE_LIMIT_PER_MINUTE') ?: null, 60),
    ];
}

function hostAllowed(string $hostname, array $patterns): bool
{
    if ($patterns === []) {
        return true;
    }
    foreach ($patterns as $pattern) {
        if (str_starts_with($pattern, '*.')) {
            $suffix = substr($pattern, 1);
            if (str_ends_with($hostname, $suffix) && strlen($hostname) > strlen($suffix)) {
                return true;
            }
        } elseif ($hostname === $pattern) {
            return true;
        }
    }
    return false;
}

function isPublicAddress(string $address): bool
{
    $address = explode('%', $address, 2)[0];
    return filter_var(
        $address,
        FILTER_VALIDATE_IP,
        FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE
    ) !== false;
}

function resolvePublicTarget(string $target, array $config): array
{
    $parts = parse_url($target);
    if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
        throw new DownloaderException('INVALID_TARGET_URL', 'spec_url must be a complete HTTP or HTTPS URL.', 400);
    }
    $scheme = strtolower((string) $parts['scheme']);
    if (!in_array($scheme, ['http', 'https'], true)) {
        throw new DownloaderException('TARGET_PROTOCOL_BLOCKED', 'Only HTTP and HTTPS targets are allowed.', 400);
    }
    if (isset($parts['user']) || isset($parts['pass'])) {
        throw new DownloaderException('TARGET_CREDENTIALS_BLOCKED', 'Target credentials in URLs are not allowed.', 400);
    }
    $host = strtolower(trim((string) $parts['host'], '[]'));
    if ($host === '' || $host === 'localhost' || str_ends_with($host, '.localhost') || str_ends_with($host, '.local')) {
        throw new DownloaderException('TARGET_HOST_BLOCKED', 'Local hostnames are blocked.', 403);
    }
    if (!hostAllowed($host, $config['allowedHosts'])) {
        throw new DownloaderException('TARGET_HOST_NOT_ALLOWED', 'The target host is not in OPENDOC_ALLOWED_REMOTE_HOSTS.', 403);
    }
    $port = isset($parts['port']) ? (int) $parts['port'] : ($scheme === 'https' ? 443 : 80);
    if (!in_array($port, $config['allowedPorts'], true)) {
        throw new DownloaderException('TARGET_PORT_BLOCKED', "Remote port {$port} is not allowed.", 403);
    }
    $addresses = [];
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $addresses[] = $host;
    } else {
        $records = @dns_get_record($host, DNS_A | DNS_AAAA) ?: [];
        foreach ($records as $record) {
            $address = $record['ip'] ?? $record['ipv6'] ?? null;
            if (is_string($address) && !in_array($address, $addresses, true)) {
                $addresses[] = $address;
            }
        }
    }
    if ($addresses === []) {
        throw new DownloaderException('TARGET_DNS_FAILED', 'The target hostname could not be resolved.', 502);
    }
    foreach ($addresses as $address) {
        if (!isPublicAddress($address)) {
            throw new DownloaderException(
                'TARGET_ADDRESS_BLOCKED',
                'The target resolves to a private, reserved, or otherwise prohibited address.',
                403
            );
        }
    }
    return compact('scheme', 'host', 'port', 'addresses');
}

function requestOnce(string $target, array $incomingHeaders, array $config): array
{
    if (!extension_loaded('curl')) {
        throw new DownloaderException('CURL_REQUIRED', 'The PHP cURL extension is required.', 500);
    }
    $resolved = resolvePublicTarget($target, $config);
    $address = $resolved['addresses'][0];
    $curl = curl_init($target);
    if ($curl === false) {
        throw new DownloaderException('DOWNLOADER_ERROR', 'Unable to initialize cURL.', 500);
    }
    $headers = [];
    $body = '';
    $tooLarge = false;
    $requestHeaders = [
        'Accept: application/json, application/yaml, text/yaml, text/plain, */*;q=0.5',
        'Accept-Encoding: identity',
    ];
    if (($incomingHeaders['if-none-match'] ?? '') !== '') {
        $requestHeaders[] = 'If-None-Match: ' . $incomingHeaders['if-none-match'];
    }
    if (($incomingHeaders['if-modified-since'] ?? '') !== '') {
        $requestHeaders[] = 'If-Modified-Since: ' . $incomingHeaders['if-modified-since'];
    }
    $resolveAddress = str_contains($address, ':') ? "[{$address}]" : $address;
    curl_setopt_array($curl, [
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_CONNECTTIMEOUT => $config['timeoutSeconds'],
        CURLOPT_TIMEOUT => $config['timeoutSeconds'],
        CURLOPT_USERAGENT => 'OpenDoc-Spec-Downloader/0.1',
        CURLOPT_HTTPHEADER => $requestHeaders,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
        CURLOPT_RESOLVE => ["{$resolved['host']}:{$resolved['port']}:{$resolveAddress}"],
        CURLOPT_HEADERFUNCTION => function ($curl, string $line) use (&$headers): int {
            $length = strlen($line);
            $separator = strpos($line, ':');
            if ($separator !== false) {
                $name = strtolower(trim(substr($line, 0, $separator)));
                $headers[$name] = trim(substr($line, $separator + 1));
            }
            return $length;
        },
        CURLOPT_WRITEFUNCTION => function ($curl, string $chunk) use (&$body, &$tooLarge, $config): int {
            if (strlen($body) + strlen($chunk) > $config['maxBytes']) {
                $tooLarge = true;
                return 0;
            }
            $body .= $chunk;
            return strlen($chunk);
        },
    ]);
    if (defined('CURLOPT_PROTOCOLS_STR')) {
        curl_setopt($curl, CURLOPT_PROTOCOLS_STR, 'http,https');
    } else {
        curl_setopt($curl, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
    }
    $ok = curl_exec($curl);
    $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
    $curlError = curl_error($curl);
    curl_close($curl);
    if ($tooLarge) {
        throw new DownloaderException('REMOTE_FILE_TOO_LARGE', 'Remote specification exceeds OPENDOC_MAX_BYTES.', 413);
    }
    if ($ok === false) {
        throw new DownloaderException('REMOTE_CONNECTION_FAILED', $curlError !== '' ? $curlError : 'The remote server could not be reached.', 502);
    }
    return compact('status', 'headers', 'body');
}

function downloadSpecification(string $target, array $incomingHeaders, array $config): array
{
    $current = $target;
    for ($redirects = 0; $redirects <= $config['maxRedirects']; $redirects++) {
        $result = requestOnce($current, $incomingHeaders, $config);
        $status = $result['status'];
        if (in_array($status, [301, 302, 303, 307, 308], true) && isset($result['headers']['location'])) {
            if ($redirects === $config['maxRedirects']) {
                throw new DownloaderException('REMOTE_REDIRECT_LIMIT', 'Remote redirect limit exceeded.', 502);
            }
            $location = $result['headers']['location'];
            if (!filter_var($location, FILTER_VALIDATE_URL)) {
                $base = parse_url($current);
                $location = $base['scheme'] . '://' . $base['host'] .
                    (isset($base['port']) ? ':' . $base['port'] : '') . '/' . ltrim($location, '/');
            }
            $current = $location;
            continue;
        }
        if ($status === 304) {
            return ['status' => 304, 'headers' => $result['headers'], 'body' => '', 'sourceUrl' => $current];
        }
        if ($status < 200 || $status >= 300) {
            throw new DownloaderException('REMOTE_HTTP_STATUS', "Remote server returned HTTP {$status}.", 502);
        }
        $declared = (int) ($result['headers']['content-length'] ?? 0);
        if ($declared > $config['maxBytes']) {
            throw new DownloaderException('REMOTE_FILE_TOO_LARGE', 'Remote specification exceeds OPENDOC_MAX_BYTES.', 413);
        }
        $result['sourceUrl'] = $current;
        return $result;
    }
    throw new DownloaderException('REMOTE_REDIRECT_LIMIT', 'Remote redirect limit exceeded.', 502);
}
