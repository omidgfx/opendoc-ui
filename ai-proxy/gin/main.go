package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type Config struct {
	Token, Provider, Model, BaseURL, APIKey, SiteURL, AppName string
	DevMode, AllowClientModel                                  bool
	Origins, AllowedModels                                     []string
	RateLimit, MaxConcurrent, MaxMessages, MaxMessageChars     int
	MaxContextChars, MaxOutputTokens, TimeoutMS, MaxBodyBytes  int
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ChatRequest struct {
	Provider    string    `json:"provider"`
	Model       string    `json:"model"`
	Messages    []Message `json:"messages"`
	Temperature *float64  `json:"temperature"`
}

func csv(value string) []string {
	output := []string{}
	for _, item := range strings.Split(value, ",") {
		if value := strings.TrimSpace(item); value != "" { output = append(output, value) }
	}
	return output
}

func integer(name string, fallback int) int {
	value, err := strconv.Atoi(os.Getenv(name))
	if err != nil || value <= 0 { return fallback }
	return value
}

func configFromEnv() Config {
	model := strings.TrimSpace(os.Getenv("AI_MODEL"))
	if model == "" { log.Fatal("AI_MODEL is required.") }
	provider := first(os.Getenv("AI_PROVIDER"), "openai")
	if !contains([]string{"openai", "openrouter", "ollama", "custom"}, provider) { log.Fatal("Framework gateway examples require an OpenAI-compatible AI_PROVIDER.") }
	allow := os.Getenv("AI_GATEWAY_ALLOW_CLIENT_MODEL") == "true"
	models := []string{model}
	if allow { models = csv(os.Getenv("AI_GATEWAY_ALLOWED_MODELS")) }
	for _, value := range models { if strings.Contains(value, "*") { log.Fatal("AI_GATEWAY_ALLOWED_MODELS accepts exact model IDs only.") } }
	if len(models) == 0 || !contains(models, model) { log.Fatal("AI_GATEWAY_ALLOWED_MODELS must be non-empty and include AI_MODEL.") }
	config := Config{
		Token: os.Getenv("AI_GATEWAY_TOKEN"), DevMode: os.Getenv("AI_GATEWAY_DEV_MODE") == "true",
		Origins: csv(first(os.Getenv("AI_GATEWAY_ORIGINS"), os.Getenv("AI_GATEWAY_ORIGIN"), "http://localhost:3000")),
		Provider: provider, Model: model,
		BaseURL: strings.TrimRight(first(os.Getenv("AI_BASE_URL"), "https://api.openai.com/v1"), "/"),
		APIKey: os.Getenv("AI_API_KEY"), AllowClientModel: allow, AllowedModels: models,
		RateLimit: integer("AI_GATEWAY_RATE_LIMIT", 30), MaxConcurrent: integer("AI_GATEWAY_MAX_CONCURRENT", 4),
		MaxMessages: integer("AI_GATEWAY_MAX_MESSAGES", 24), MaxMessageChars: integer("AI_GATEWAY_MAX_MESSAGE_CHARS", 40000),
		MaxContextChars: integer("AI_GATEWAY_MAX_CONTEXT_CHARS", 250000), MaxOutputTokens: integer("AI_GATEWAY_MAX_OUTPUT_TOKENS", 2048),
		TimeoutMS: integer("AI_GATEWAY_UPSTREAM_TIMEOUT_MS", 60000), MaxBodyBytes: integer("AI_GATEWAY_MAX_BODY_BYTES", 1048576),
		SiteURL: os.Getenv("AI_SITE_URL"), AppName: first(os.Getenv("AI_APP_NAME"), "OpenDoc UI"),
	}
	if config.Token == "" && !config.DevMode { log.Fatal("AI_GATEWAY_TOKEN is required unless AI_GATEWAY_DEV_MODE=true.") }
	return config
}

func first(values ...string) string { for _, value := range values { if value != "" { return value } }; return "" }
func contains(items []string, target string) bool { for _, item := range items { if item == target { return true } }; return false }

type limiter struct { sync.Mutex; buckets map[string][]time.Time; active int }

func main() {
	config := configFromEnv()
	state := &limiter{buckets: map[string][]time.Time{}}
	router := gin.New()
	router.Use(gin.Recovery(), cors(config))
	router.GET("/health", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true, "authenticated": config.Token != "", "provider": config.Provider, "model": config.Model, "clientModelSelection": config.AllowClientModel}) })
	router.POST("/api/ai/models", guard(config, state), func(c *gin.Context) {
		defer state.release()
		models := []gin.H{}
		for _, model := range config.AllowedModels { models = append(models, gin.H{"id": model, "label": model + " · Gateway allowed", "tier": tier(config.Provider, model)}) }
		gateway := gin.H{"clientModelSelection": config.AllowClientModel, "provider": config.Provider, "model": config.Model}
		if config.AllowClientModel { gateway["models"] = config.AllowedModels }
		c.JSON(200, gin.H{"models": models, "gateway": gateway})
	})
	router.POST("/api/ai/chat", guard(config, state), func(c *gin.Context) { proxyChat(c, config, state) })
	bind := first(os.Getenv("AI_GATEWAY_BIND"), "0.0.0.0")
	port := first(os.Getenv("PORT"), "8787")
	log.Fatal(router.Run(bind + ":" + port))
}

func cors(config Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && !contains(config.Origins, origin) { c.AbortWithStatusJSON(403, gin.H{"error": gin.H{"message": "Origin is not allowed by this AI gateway."}}); return }
		if origin != "" { c.Header("Access-Control-Allow-Origin", origin) }
		c.Header("Vary", "Origin")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Header("Access-Control-Expose-Headers", "X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After")
		if c.Request.Method == http.MethodOptions { c.AbortWithStatus(204); return }
		c.Next()
	}
}

func guard(config Config, state *limiter) gin.HandlerFunc {
	return func(c *gin.Context) {
		if config.Token != "" && c.GetHeader("Authorization") != "Bearer "+config.Token { c.AbortWithStatusJSON(401, gin.H{"error": gin.H{"message": "Invalid AI gateway token."}}); return }
		now := time.Now(); key := c.ClientIP()
		state.Lock(); recent := []time.Time{}
		for _, stamp := range state.buckets[key] { if now.Sub(stamp) < time.Minute { recent = append(recent, stamp) } }
		if len(recent) >= config.RateLimit { state.Unlock(); c.Header("Retry-After", "60"); c.AbortWithStatusJSON(429, gin.H{"error": gin.H{"message": "AI gateway rate limit exceeded."}}); return }
		recent = append(recent, now); state.buckets[key] = recent
		if state.active >= config.MaxConcurrent { state.Unlock(); c.Header("Retry-After", "2"); c.AbortWithStatusJSON(429, gin.H{"error": gin.H{"message": "AI gateway is busy."}}); return }
		state.active++; remaining := config.RateLimit - len(recent); state.Unlock()
		c.Header("X-RateLimit-Limit", strconv.Itoa(config.RateLimit)); c.Header("X-RateLimit-Remaining", strconv.Itoa(remaining)); c.Next()
	}
}

func (state *limiter) release() { state.Lock(); if state.active > 0 { state.active-- }; state.Unlock() }
func tier(provider, model string) string { if provider == "ollama" { return "local" }; if strings.HasSuffix(model, ":free") { return "free" }; return "premium" }

func proxyChat(c *gin.Context, config Config, state *limiter) {
	released := false; release := func() { if !released { released = true; state.release() } }
	defer func() { if !c.Writer.Written() { release() } }()
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, int64(config.MaxBodyBytes))
	var input ChatRequest
	if err := c.ShouldBindJSON(&input); err != nil { release(); c.JSON(400, gin.H{"error": gin.H{"message": "A valid JSON request body is required."}}); return }
	if !validMessages(input.Messages, config) { release(); c.JSON(400, gin.H{"error": gin.H{"message": "The messages array exceeds gateway limits or is invalid."}}); return }
	if input.Provider != "" && input.Provider != config.Provider { release(); c.JSON(400, gin.H{"error": gin.H{"message": fmt.Sprintf("Provider is fixed to '%s' by the gateway.", config.Provider)}}); return }
	model := input.Model; if model == "" { model = config.Model }
	if !contains(config.AllowedModels, model) { release(); c.JSON(400, gin.H{"error": gin.H{"message": fmt.Sprintf("Model '%s' is not allowed by this gateway.", model)}}); return }
	if config.APIKey == "" && config.Provider != "ollama" { release(); c.JSON(503, gin.H{"error": gin.H{"message": "AI_API_KEY is not configured on the gateway."}}); return }
	temperature := 0.2; if input.Temperature != nil { temperature = max(0, min(2, *input.Temperature)) }
	payload, _ := json.Marshal(gin.H{"model": model, "messages": input.Messages, "temperature": temperature, "max_tokens": config.MaxOutputTokens, "stream": true})
	ctx, cancel := context.WithTimeout(c.Request.Context(), time.Duration(config.TimeoutMS)*time.Millisecond); defer cancel()
	url := config.BaseURL; if !strings.HasSuffix(url, "/chat/completions") { url += "/chat/completions" }
	request, _ := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload)); request.Header.Set("Content-Type", "application/json")
	if config.APIKey != "" { request.Header.Set("Authorization", "Bearer "+config.APIKey) }; if config.SiteURL != "" { request.Header.Set("HTTP-Referer", config.SiteURL) }; if config.AppName != "" { request.Header.Set("X-Title", config.AppName) }
	upstream, err := (&http.Client{Timeout: time.Duration(config.TimeoutMS) * time.Millisecond}).Do(request)
	if err != nil { release(); c.JSON(502, gin.H{"error": gin.H{"message": "AI upstream could not be reached."}}); return }
	defer upstream.Body.Close()
	if upstream.StatusCode < 200 || upstream.StatusCode >= 300 { data, _ := io.ReadAll(io.LimitReader(upstream.Body, 16384)); release(); c.JSON(502, gin.H{"error": gin.H{"message": upstreamMessage(data, upstream.StatusCode), "code": "upstream_error", "status": upstream.StatusCode, "provider": config.Provider, "model": model}}); return }
	contentType := upstream.Header.Get("Content-Type"); if contentType == "" { contentType = "text/event-stream; charset=utf-8" }
	c.Header("Content-Type", contentType); c.Header("Cache-Control", "no-cache, no-transform"); c.Header("X-Accel-Buffering", "no"); c.Status(200)
	_, _ = io.Copy(c.Writer, upstream.Body); release()
}

func validMessages(messages []Message, config Config) bool {
	if len(messages) < 1 || len(messages) > config.MaxMessages { return false }; total := 0
	for _, message := range messages { if !contains([]string{"system", "user", "assistant"}, message.Role) || len(message.Content) > config.MaxMessageChars { return false }; total += len(message.Content); if total > config.MaxContextChars { return false } }
	return true
}
func upstreamMessage(data []byte, status int) string { var body map[string]any; if json.Unmarshal(data, &body) == nil { if value, ok := body["error"].(map[string]any); ok { if message, ok := value["message"].(string); ok { return message } }; if message, ok := body["message"].(string); ok { return message } }; if len(data) > 0 { return string(data) }; return fmt.Sprintf("Upstream returned HTTP %d.", status) }
