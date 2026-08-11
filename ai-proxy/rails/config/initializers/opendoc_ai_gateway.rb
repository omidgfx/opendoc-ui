require "set"

module OpenDocAiGateway
  def self.csv(value)
    value.to_s.split(",").map(&:strip).reject(&:empty?)
  end

  def self.positive(name, fallback)
    value = ENV.fetch(name, "").to_i
    value.positive? ? value : fallback
  end

  MODEL = ENV.fetch("AI_MODEL", "").strip
  raise "AI_MODEL is required." if MODEL.empty?

  TOKEN = ENV.fetch("AI_GATEWAY_TOKEN", "")
  DEV_MODE = ENV["AI_GATEWAY_DEV_MODE"] == "true"
  raise "AI_GATEWAY_TOKEN is required unless AI_GATEWAY_DEV_MODE=true." if TOKEN.empty? && !DEV_MODE

  PROVIDER = ENV.fetch("AI_PROVIDER", "openai")
  raise "Framework gateway examples require an OpenAI-compatible AI_PROVIDER." unless %w[openai openrouter ollama custom].include?(PROVIDER)
  BASE_URL = ENV.fetch("AI_BASE_URL", "https://api.openai.com/v1").sub(%r{/+$}, "")
  API_KEY = ENV.fetch("AI_API_KEY", "")
  ORIGINS = csv(ENV["AI_GATEWAY_ORIGINS"] || ENV["AI_GATEWAY_ORIGIN"] || "http://localhost:3000").to_set.freeze
  ALLOW_CLIENT_MODEL = ENV["AI_GATEWAY_ALLOW_CLIENT_MODEL"] == "true"
  ALLOWED_MODELS = (ALLOW_CLIENT_MODEL ? csv(ENV["AI_GATEWAY_ALLOWED_MODELS"]) : [MODEL]).to_set.freeze
  raise "AI_GATEWAY_ALLOWED_MODELS accepts exact model IDs only." if ALLOWED_MODELS.any? { |model| model.include?("*") }
  raise "AI_GATEWAY_ALLOWED_MODELS must be non-empty and include AI_MODEL." if ALLOWED_MODELS.empty? || !ALLOWED_MODELS.include?(MODEL)

  RATE_LIMIT = positive("AI_GATEWAY_RATE_LIMIT", 30)
  MAX_CONCURRENT = positive("AI_GATEWAY_MAX_CONCURRENT", 4)
  MAX_MESSAGES = positive("AI_GATEWAY_MAX_MESSAGES", 24)
  MAX_MESSAGE_CHARS = positive("AI_GATEWAY_MAX_MESSAGE_CHARS", 40_000)
  MAX_CONTEXT_CHARS = positive("AI_GATEWAY_MAX_CONTEXT_CHARS", 250_000)
  MAX_OUTPUT_TOKENS = positive("AI_GATEWAY_MAX_OUTPUT_TOKENS", 2_048)
  UPSTREAM_TIMEOUT = [positive("AI_GATEWAY_UPSTREAM_TIMEOUT_MS", 60_000) / 1000.0, 5].max
  MAX_BODY_BYTES = positive("AI_GATEWAY_MAX_BODY_BYTES", 1_048_576)
  SITE_URL = ENV.fetch("AI_SITE_URL", "")
  APP_NAME = ENV.fetch("AI_APP_NAME", "OpenDoc UI")
end
