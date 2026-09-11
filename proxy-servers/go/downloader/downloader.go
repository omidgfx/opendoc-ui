package downloader

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

type Config struct {
	AllowedOrigins []string
	MaxBytes       int64
	Timeout        time.Duration
	MaxRedirects   int
	AllowedPorts   map[int]bool
	AllowedHosts   []string
	RateLimit      int
	ProxyEnabled   bool
}

type DownloadError struct {
	Code    string
	Message string
	Status  int
}

func (e *DownloadError) Error() string { return e.Message }

func csv(value string) []string {
	out := []string{}
	for _, item := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(item); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func positiveInt(value string, fallback int) int {
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func ConfigFromEnv() Config {
	ports := map[int]bool{}
	for _, item := range csv(envOr("OPENDOC_ALLOWED_PORTS", "80,443")) {
		if port, err := strconv.Atoi(item); err == nil {
			ports[port] = true
		}
	}
	return Config{
		AllowedOrigins: csv(os.Getenv("OPENDOC_ALLOWED_ORIGINS")),
		MaxBytes:       int64(positiveInt(os.Getenv("OPENDOC_MAX_BYTES"), 10*1024*1024)),
		Timeout:        time.Duration(positiveInt(os.Getenv("OPENDOC_TIMEOUT_SECONDS"), 15)) * time.Second,
		MaxRedirects:   positiveInt(os.Getenv("OPENDOC_MAX_REDIRECTS"), 3),
		AllowedPorts:   ports,
		AllowedHosts:   csv(strings.ToLower(os.Getenv("OPENDOC_ALLOWED_REMOTE_HOSTS"))),
		RateLimit:      positiveInt(os.Getenv("OPENDOC_RATE_LIMIT_PER_MINUTE"), 60),
		ProxyEnabled:   strings.ToLower(strings.TrimSpace(os.Getenv("OPENDOC_PROXY_ENABLED"))) != "false",
	}
}

func envOr(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}

var blockedPrefixes = []*net.IPNet{}

func init() {
	for _, network := range []string{
		"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15",
		"198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "2001:db8::/32",
	} {
		_, prefix, _ := net.ParseCIDR(network)
		blockedPrefixes = append(blockedPrefixes, prefix)
	}
}

func IsPublicIP(ip net.IP) bool {
	if ip == nil || !ip.IsGlobalUnicast() || ip.IsPrivate() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified() {
		return false
	}
	for _, prefix := range blockedPrefixes {
		if prefix.Contains(ip) {
			return false
		}
	}
	return true
}

func hostAllowed(host string, patterns []string) bool {
	if len(patterns) == 0 {
		return true
	}
	for _, pattern := range patterns {
		if strings.HasPrefix(pattern, "*.") {
			suffix := pattern[1:]
			if strings.HasSuffix(host, suffix) && len(host) > len(suffix) {
				return true
			}
		} else if host == pattern {
			return true
		}
	}
	return false
}

type resolvedTarget struct {
	URL       *url.URL
	Host      string
	Port      int
	Addresses []net.IP
}

func ResolvePublicTarget(ctx context.Context, raw string, config Config) (*resolvedTarget, error) {
	target, err := url.Parse(raw)
	if err != nil || target.Hostname() == "" {
		return nil, &DownloadError{"INVALID_TARGET_URL", "spec_url must be a complete HTTP or HTTPS URL.", http.StatusBadRequest}
	}
	if target.Scheme != "http" && target.Scheme != "https" {
		return nil, &DownloadError{"TARGET_PROTOCOL_BLOCKED", "Only HTTP and HTTPS targets are allowed.", http.StatusBadRequest}
	}
	if target.User != nil {
		return nil, &DownloadError{"TARGET_CREDENTIALS_BLOCKED", "Target credentials in URLs are not allowed.", http.StatusBadRequest}
	}
	host := strings.ToLower(target.Hostname())
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") {
		return nil, &DownloadError{"TARGET_HOST_BLOCKED", "Local hostnames are blocked.", http.StatusForbidden}
	}
	if !hostAllowed(host, config.AllowedHosts) {
		return nil, &DownloadError{"TARGET_HOST_NOT_ALLOWED", "The target host is not in OPENDOC_ALLOWED_REMOTE_HOSTS.", http.StatusForbidden}
	}
	port := 80
	if target.Scheme == "https" {
		port = 443
	}
	if target.Port() != "" {
		port, err = strconv.Atoi(target.Port())
		if err != nil {
			return nil, &DownloadError{"INVALID_TARGET_URL", "The target port is invalid.", http.StatusBadRequest}
		}
	}
	if !config.AllowedPorts[port] {
		return nil, &DownloadError{"TARGET_PORT_BLOCKED", fmt.Sprintf("Remote port %d is not allowed.", port), http.StatusForbidden}
	}
	addresses, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
	if err != nil || len(addresses) == 0 {
		return nil, &DownloadError{"TARGET_DNS_FAILED", "The target hostname could not be resolved.", http.StatusBadGateway}
	}
	for _, address := range addresses {
		if !IsPublicIP(address) {
			return nil, &DownloadError{"TARGET_ADDRESS_BLOCKED", "The target resolves to a private, reserved, or otherwise prohibited address.", http.StatusForbidden}
		}
	}
	return &resolvedTarget{target, host, port, addresses}, nil
}

func requestOnce(ctx context.Context, raw string, incoming http.Header, config Config) (*http.Response, error) {
	resolved, err := ResolvePublicTarget(ctx, raw, config)
	if err != nil {
		return nil, err
	}
	selected := resolved.Addresses[0]
	dialer := &net.Dialer{Timeout: config.Timeout}
	transport := &http.Transport{
		Proxy:                 nil,
		DisableCompression:    true,
		TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12, ServerName: resolved.Host},
		ResponseHeaderTimeout: config.Timeout,
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, network, net.JoinHostPort(selected.String(), strconv.Itoa(resolved.Port)))
		},
	}
	client := &http.Client{
		Transport: transport,
		Timeout:   config.Timeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	request, _ := http.NewRequestWithContext(ctx, http.MethodGet, resolved.URL.String(), nil)
	request.Header.Set("Accept", "application/json, application/yaml, text/yaml, text/plain, */*;q=0.5")
	request.Header.Set("Accept-Encoding", "identity")
	request.Header.Set("User-Agent", "OpenDoc-Spec-Downloader/0.1")
	if value := incoming.Get("If-None-Match"); value != "" {
		request.Header.Set("If-None-Match", value)
	}
	if value := incoming.Get("If-Modified-Since"); value != "" {
		request.Header.Set("If-Modified-Since", value)
	}
	response, err := client.Do(request)
	if err != nil {
		transport.CloseIdleConnections()
		return nil, &DownloadError{"REMOTE_CONNECTION_FAILED", "The remote server could not be reached.", http.StatusBadGateway}
	}
	response.Body = &closingBody{ReadCloser: response.Body, closeTransport: transport.CloseIdleConnections}
	return response, nil
}

type closingBody struct {
	io.ReadCloser
	closeTransport func()
}

func (body *closingBody) Close() error {
	err := body.ReadCloser.Close()
	body.closeTransport()
	return err
}

type Result struct {
	Status    int
	Headers   http.Header
	Body      []byte
	SourceURL string
}

func DownloadSpecification(ctx context.Context, target string, incoming http.Header, config Config) (*Result, error) {
	current := target
	for redirects := 0; redirects <= config.MaxRedirects; redirects++ {
		response, err := requestOnce(ctx, current, incoming, config)
		if err != nil {
			return nil, err
		}
		if response.StatusCode >= 300 && response.StatusCode <= 399 && response.Header.Get("Location") != "" {
			response.Body.Close()
			if redirects == config.MaxRedirects {
				return nil, &DownloadError{"REMOTE_REDIRECT_LIMIT", "Remote redirect limit exceeded.", http.StatusBadGateway}
			}
			base, _ := url.Parse(current)
			location, err := base.Parse(response.Header.Get("Location"))
			if err != nil {
				return nil, &DownloadError{"REMOTE_REDIRECT_INVALID", "Remote redirect URL is invalid.", http.StatusBadGateway}
			}
			current = location.String()
			continue
		}
		if response.StatusCode == http.StatusNotModified {
			response.Body.Close()
			return &Result{Status: response.StatusCode, Headers: response.Header, Body: nil, SourceURL: current}, nil
		}
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			response.Body.Close()
			return nil, &DownloadError{"REMOTE_HTTP_STATUS", fmt.Sprintf("Remote server returned HTTP %d.", response.StatusCode), http.StatusBadGateway}
		}
		if response.ContentLength > config.MaxBytes {
			response.Body.Close()
			return nil, &DownloadError{"REMOTE_FILE_TOO_LARGE", "Remote specification exceeds OPENDOC_MAX_BYTES.", http.StatusRequestEntityTooLarge}
		}
		body, err := io.ReadAll(io.LimitReader(response.Body, config.MaxBytes+1))
		response.Body.Close()
		if err != nil {
			return nil, &DownloadError{"REMOTE_READ_FAILED", "The remote response could not be read.", http.StatusBadGateway}
		}
		if int64(len(body)) > config.MaxBytes {
			return nil, &DownloadError{"REMOTE_FILE_TOO_LARGE", "Remote specification exceeds OPENDOC_MAX_BYTES.", http.StatusRequestEntityTooLarge}
		}
		return &Result{Status: response.StatusCode, Headers: response.Header, Body: body, SourceURL: current}, nil
	}
	return nil, &DownloadError{"REMOTE_REDIRECT_LIMIT", "Remote redirect limit exceeded.", http.StatusBadGateway}
}

type ProxiedResponse struct {
	Status       int               `json:"status"`
	StatusText   string            `json:"statusText"`
	Headers      map[string]string `json:"headers"`
	FinalURL     string            `json:"finalUrl"`
	Body         string            `json:"body"`
	BodyEncoding string            `json:"bodyEncoding"`
	DurationMs   int64             `json:"durationMs"`
}

var hopByHopHeaders = []string{
	"Connection", "Keep-Alive", "Proxy-Authenticate", "Proxy-Authorization",
	"Te", "Trailer", "Transfer-Encoding", "Upgrade", "Host", "Content-Length", "Accept-Encoding",
}

func requestOnceProxied(ctx context.Context, raw string, method string, headers map[string]string, body []byte, config Config) (*http.Response, error) {
	resolved, err := ResolvePublicTarget(ctx, raw, config)
	if err != nil {
		return nil, err
	}
	selected := resolved.Addresses[0]
	dialer := &net.Dialer{Timeout: config.Timeout}
	transport := &http.Transport{
		Proxy:                 nil,
		DisableCompression:    true,
		TLSClientConfig:       &tls.Config{MinVersion: tls.VersionTLS12, ServerName: resolved.Host},
		ResponseHeaderTimeout: config.Timeout,
		DialContext: func(ctx context.Context, network, _ string) (net.Conn, error) {
			return dialer.DialContext(ctx, network, net.JoinHostPort(selected.String(), strconv.Itoa(resolved.Port)))
		},
	}
	client := &http.Client{
		Transport: transport,
		Timeout:   config.Timeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	request, err := http.NewRequestWithContext(ctx, method, resolved.URL.String(), bytes.NewReader(body))
	if err != nil {
		transport.CloseIdleConnections()
		return nil, &DownloadError{"INVALID_TARGET_METHOD", "Target method is not valid.", http.StatusBadRequest}
	}
	request.Header.Set("Accept-Encoding", "identity")
	request.Header.Set("User-Agent", "OpenDoc-Request-Proxy/0.1")
	for name, value := range headers {
		request.Header.Set(name, value)
	}
	response, err := client.Do(request)
	if err != nil {
		transport.CloseIdleConnections()
		return nil, &DownloadError{"REMOTE_CONNECTION_FAILED", "The remote server could not be reached.", http.StatusBadGateway}
	}
	response.Body = &closingBody{ReadCloser: response.Body, closeTransport: transport.CloseIdleConnections}
	return response, nil
}

func ExecuteProxiedRequest(ctx context.Context, rawBody []byte, incoming http.Header, config Config) (*ProxiedResponse, error) {
	started := time.Now()
	if !config.ProxyEnabled {
		return nil, &DownloadError{"PROXY_DISABLED", "The request proxy is disabled on this service.", http.StatusForbidden}
	}
	target := strings.TrimSpace(incoming.Get("X-OpenDoc-Target-Url"))
	if target == "" {
		return nil, &DownloadError{"MISSING_TARGET_URL", "Missing X-OpenDoc-Target-Url header.", http.StatusBadRequest}
	}
	parsed, err := url.Parse(target)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return nil, &DownloadError{"TARGET_PROTOCOL_BLOCKED", "Only HTTP and HTTPS targets are allowed.", http.StatusBadRequest}
	}
	if parsed.User != nil {
		return nil, &DownloadError{"TARGET_CREDENTIALS_BLOCKED", "Target credentials in URLs are not allowed.", http.StatusBadRequest}
	}
	method := strings.ToUpper(strings.TrimSpace(incoming.Get("X-OpenDoc-Target-Method")))
	if method == "" {
		method = http.MethodGet
	}
	if !isAlpha(method) {
		return nil, &DownloadError{"INVALID_TARGET_METHOD", "Target method is not valid.", http.StatusBadRequest}
	}
	targetHeaders := map[string]string{}
	if raw := strings.TrimSpace(incoming.Get("X-OpenDoc-Target-Headers")); raw != "" {
		parsedHeaders := map[string]string{}
		if err := json.Unmarshal([]byte(raw), &parsedHeaders); err != nil {
			return nil, &DownloadError{"INVALID_TARGET_HEADERS", "X-OpenDoc-Target-Headers must be a JSON object.", http.StatusBadRequest}
		}
		for name, value := range parsedHeaders {
			skip := false
			for _, hop := range hopByHopHeaders {
				if strings.EqualFold(name, hop) {
					skip = true
					break
				}
			}
			if !skip {
				targetHeaders[name] = value
			}
		}
	}
	body := rawBody
	current := target
	for redirects := 0; redirects <= config.MaxRedirects; redirects++ {
		response, err := requestOnceProxied(ctx, current, method, targetHeaders, body, config)
		if err != nil {
			return nil, err
		}
		location := response.Header.Get("Location")
		if location != "" && isRedirect(response.StatusCode) && redirects < config.MaxRedirects {
			_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, config.MaxBytes+1))
			_ = response.Body.Close()
			next, err := response.Request.URL.Parse(location)
			if err != nil {
				return nil, &DownloadError{"REMOTE_REDIRECT_TARGET", "Remote redirect location is not valid.", http.StatusBadGateway}
			}
			if response.StatusCode == http.StatusSeeOther || (response.StatusCode != http.StatusTemporaryRedirect && response.StatusCode != http.StatusPermanentRedirect && method != http.MethodGet && method != http.MethodHead) {
				method = http.MethodGet
				body = nil
			}
			current = next.String()
			continue
		}
		limited := io.LimitReader(response.Body, config.MaxBytes+1)
		payload, err := io.ReadAll(limited)
		_ = response.Body.Close()
		if err != nil {
			return nil, &DownloadError{"REMOTE_CONNECTION_FAILED", "The remote server could not be reached.", http.StatusBadGateway}
		}
		if int64(len(payload)) > config.MaxBytes {
			return nil, &DownloadError{"REMOTE_RESPONSE_TOO_LARGE", "Remote response exceeds OPENDOC_MAX_BYTES.", http.StatusBadGateway}
		}
		headers := map[string]string{}
		for name, values := range response.Header {
			headers[strings.ToLower(name)] = strings.Join(values, ", ")
		}
		statusText := strings.TrimSpace(strings.TrimPrefix(response.Status, strconv.Itoa(response.StatusCode)))
		return &ProxiedResponse{
			Status:       response.StatusCode,
			StatusText:   statusText,
			Headers:      headers,
			FinalURL:     current,
			Body:         base64.StdEncoding.EncodeToString(payload),
			BodyEncoding: "base64",
			DurationMs:   time.Since(started).Milliseconds(),
		}, nil
	}
	return nil, &DownloadError{"REMOTE_REDIRECT_LIMIT", "Remote redirect limit exceeded.", http.StatusBadGateway}
}

func isAlpha(value string) bool {
	if value == "" {
		return false
	}
	for _, r := range value {
		if r < 'A' || (r > 'Z' && r < 'a') || r > 'z' {
			return false
		}
	}
	return true
}

func isRedirect(status int) bool {
	return status == http.StatusMovedPermanently || status == http.StatusFound || status == http.StatusSeeOther ||
		status == http.StatusTemporaryRedirect || status == http.StatusPermanentRedirect
}

type rateBucket struct {
	minute int64
	count  int
}

type Handler struct {
	Config  Config
	mu      sync.Mutex
	buckets map[string]rateBucket
}

func NewHandler(config Config) *Handler {
	return &Handler{Config: config, buckets: map[string]rateBucket{}}
}

func (handler *Handler) applyCORS(writer http.ResponseWriter, request *http.Request) bool {
	origin := request.Header.Get("Origin")
	if origin == "" {
		return true
	}
	allowed := false
	for _, candidate := range handler.Config.AllowedOrigins {
		if origin == candidate {
			allowed = true
			break
		}
	}
	if !allowed {
		return false
	}
	writer.Header().Set("Access-Control-Allow-Origin", origin)
	writer.Header().Set("Vary", "Origin")
	writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
	writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, If-None-Match, If-Modified-Since, X-OpenDoc-Target-Url, X-OpenDoc-Target-Method, X-OpenDoc-Target-Headers")
	writer.Header().Set("Access-Control-Expose-Headers", "ETag, Last-Modified, Content-Length, Content-Type, X-OpenDoc-Final-URL")
	return true
}

func (handler *Handler) rateAllowed(client string) bool {
	handler.mu.Lock()
	defer handler.mu.Unlock()
	minute := time.Now().Unix() / 60
	bucket := handler.buckets[client]
	if bucket.minute != minute {
		bucket = rateBucket{minute: minute}
	}
	bucket.count++
	handler.buckets[client] = bucket
	return bucket.count <= handler.Config.RateLimit
}

func writeError(writer http.ResponseWriter, err error) {
	failure := &DownloadError{"DOWNLOADER_ERROR", "Specification download failed.", http.StatusBadGateway}
	if errors.As(err, &failure) {
		// errors.As populated failure.
	}
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-store")
	writer.WriteHeader(failure.Status)
	_ = json.NewEncoder(writer).Encode(map[string]any{"error": map[string]string{"code": failure.Code, "message": failure.Message}})
}

func (handler *Handler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	if request.URL.Path == "/health" {
		writer.Header().Set("Content-Type", "application/json; charset=utf-8")
		_, _ = writer.Write([]byte(`{"status":"ok"}`))
		return
	}
	if request.URL.Path == "/proxy" {
		handler.serveProxy(writer, request)
		return
	}
	if request.URL.Path != "/download" {
		writeError(writer, &DownloadError{"NOT_FOUND", "Route not found.", http.StatusNotFound})
		return
	}
	if !handler.applyCORS(writer, request) {
		writeError(writer, &DownloadError{"ORIGIN_NOT_ALLOWED", "Browser origin is not allowed.", http.StatusForbidden})
		return
	}
	if request.Method == http.MethodOptions {
		writer.WriteHeader(http.StatusNoContent)
		return
	}
	if request.Method != http.MethodGet {
		writeError(writer, &DownloadError{"METHOD_NOT_ALLOWED", "Only GET and OPTIONS are allowed.", http.StatusMethodNotAllowed})
		return
	}
	client := request.Header.Get("X-Forwarded-For")
	if client == "" {
		client = request.RemoteAddr
	}
	client = strings.TrimSpace(strings.Split(client, ",")[0])
	if !handler.rateAllowed(client) {
		writeError(writer, &DownloadError{"RATE_LIMITED", "Downloader rate limit exceeded.", http.StatusTooManyRequests})
		return
	}
	target := request.URL.Query().Get("spec_url")
	if target == "" {
		writeError(writer, &DownloadError{"MISSING_TARGET_URL", "Missing spec_url query parameter.", http.StatusBadRequest})
		return
	}
	result, err := DownloadSpecification(request.Context(), target, request.Header, handler.Config)
	if err != nil {
		writeError(writer, err)
		return
	}
	for _, name := range []string{"Content-Type", "ETag", "Last-Modified"} {
		if value := result.Headers.Get(name); value != "" {
			writer.Header().Set(name, value)
		}
	}
	writer.Header().Set("Content-Length", strconv.Itoa(len(result.Body)))
	writer.Header().Set("X-OpenDoc-Final-URL", result.SourceURL)
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	writer.WriteHeader(result.Status)
	_, _ = writer.Write(result.Body)
}

func (handler *Handler) serveProxy(writer http.ResponseWriter, request *http.Request) {
	if !handler.applyCORS(writer, request) {
		writeError(writer, &DownloadError{"ORIGIN_NOT_ALLOWED", "Browser origin is not allowed.", http.StatusForbidden})
		return
	}
	if request.Method == http.MethodOptions {
		writer.WriteHeader(http.StatusNoContent)
		return
	}
	if request.Method != http.MethodPost {
		writeError(writer, &DownloadError{"METHOD_NOT_ALLOWED", "Only POST and OPTIONS are allowed.", http.StatusMethodNotAllowed})
		return
	}
	client := request.Header.Get("X-Forwarded-For")
	if client == "" {
		client = request.RemoteAddr
	}
	client = strings.TrimSpace(strings.Split(client, ",")[0])
	if !handler.rateAllowed(client) {
		writeError(writer, &DownloadError{"RATE_LIMITED", "Proxy rate limit exceeded.", http.StatusTooManyRequests})
		return
	}
	request.Body = http.MaxBytesReader(writer, request.Body, handler.Config.MaxBytes)
	rawBody, err := io.ReadAll(request.Body)
	if err != nil {
		writeError(writer, &DownloadError{"REQUEST_BODY_TOO_LARGE", "Proxied request body exceeds OPENDOC_MAX_BYTES.", http.StatusRequestEntityTooLarge})
		return
	}
	result, err := ExecuteProxiedRequest(request.Context(), rawBody, request.Header, handler.Config)
	if err != nil {
		writeError(writer, err)
		return
	}
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("X-Content-Type-Options", "nosniff")
	writer.Header().Set("X-OpenDoc-Final-URL", result.FinalURL)
	_ = json.NewEncoder(writer).Encode(result)
}
