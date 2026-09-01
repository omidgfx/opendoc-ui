← [Back to README](../README.md) · [Docs index](index.md)

---

# Downloader services

The `downloaders/` directory contains six standalone services. Every implementation exposes the same API:

```http
GET /download?spec_url=<percent-encoded-http-or-https-url>
OPTIONS /download
GET /health
```

A successful download returns the raw JSON/YAML bytes. Errors use a consistent JSON envelope:

```json
{
  "error": {
    "code": "TARGET_ADDRESS_BLOCKED",
    "message": "The target resolves to a private, reserved, or otherwise prohibited address."
  }
}
```

Copy `downloaders/config.env.example` into your deployment configuration. The common settings are:

```env
OPENDOC_ALLOWED_ORIGINS=https://docs.example.com,http://localhost:3000
OPENDOC_MAX_BYTES=10485760
OPENDOC_TIMEOUT_SECONDS=15
OPENDOC_MAX_REDIRECTS=3
OPENDOC_ALLOWED_PORTS=80,443
OPENDOC_RATE_LIMIT_PER_MINUTE=60
OPENDOC_ALLOWED_REMOTE_HOSTS=
PORT=8080
OPENDOC_BIND=0.0.0.0
```

`OPENDOC_ALLOWED_ORIGINS` is a comma-separated list of exact browser origins. Do not include URL
paths. An empty `OPENDOC_ALLOWED_REMOTE_HOSTS` permits arbitrary **public** targets; private,
loopback, link-local, multicast, metadata-service, and reserved destinations remain blocked. Set an
exact/wildcard allowlist for constrained deployments:

```env
OPENDOC_ALLOWED_REMOTE_HOSTS=api.example.com,*.trusted.example
```

All services revalidate redirects, resolve every destination before connecting, limit ports,
stream with a hard size cutoff, omit user credentials/cookies, forward only conditional cache
headers, apply a per-client minute rate limit, and expose only the response headers OpenDoc needs.
Run them behind a production TLS reverse proxy and make both HTTP and HTTPS available if the same
OpenDoc bundle is served over both schemes.

## Node.js 22

```bash
cd downloaders/node
OPENDOC_ALLOWED_ORIGINS=http://localhost:3000 npm start
```

`server.mjs` exports `configFromEnv`, `downloadSpecification`, and `createDownloaderHandler`, so an
existing Node/Express application can mount the returned handler instead of starting the included
HTTP server.

## Python 3.11+

```bash
cd downloaders/python
OPENDOC_ALLOWED_ORIGINS=http://localhost:3000 python app.py
```

`app.py` uses only the standard library. `download_spec()` and `create_handler()` can be called from
Flask, Django, FastAPI, or another Python server; the included `ThreadingHTTPServer` is the standalone
entry point.

## PHP 8.1+

```bash
cd downloaders/php
OPENDOC_ALLOWED_ORIGINS=http://localhost:3000 php -S 0.0.0.0:8080 -t public public/index.php
```

The cURL extension is required. `src/Downloader.php` contains framework-independent functions; a
Laravel/Symfony controller can call `downloadSpecification()` and translate `DownloaderException`
into its normal response type. `public/index.php` is the ready-to-run standalone adapter.

## Go 1.23+

```bash
cd downloaders/go
go run ./cmd/server
```

Import `downloaders/go/downloader` and mount `downloader.NewHandler(config)` in an existing `net/http`
router, or use the included command directly.

## Java 21 / Spring Boot

```bash
cd downloaders/java
mvn spring-boot:run
```

`DownloaderService` contains the reusable fetch policy and `DownloaderController` exposes the
Spring MVC routes. Existing Spring applications can copy/register those beans without using the
included `DownloaderApplication` launcher.

## C# / ASP.NET Core 8

```bash
cd downloaders/dotnet
dotnet run
```

Call `app.MapOpenDocSpecDownloader(DownloaderConfig.FromEnvironment())` in an existing ASP.NET Core
application. `Program.cs` is the standalone host and `SpecDownloader.cs` contains the reusable
service, target policy, rate limiter, and endpoint extension.

Every implementation also includes a Dockerfile. Example:

```bash
docker build -t opendoc-downloader downloaders/go
docker run --rm -p 8080:8080 \
  -e OPENDOC_ALLOWED_ORIGINS=https://docs.example.com \
  opendoc-downloader
```

These services are intentionally specification downloaders—not general-purpose open proxies. Keep
their limits enabled, deploy only the implementation matching your backend stack, and use a host
allowlist where practical.
---

← [Back to README](../README.md)
