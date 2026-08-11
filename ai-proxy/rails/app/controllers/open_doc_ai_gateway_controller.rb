require "net/http"
require "json"

class OpenDocAiGatewayController < ActionController::API
  include ActionController::Live

  before_action :apply_cors
  before_action :authorize_gateway, only: %i[models chat]
  before_action :take_limits, only: %i[models chat]
  after_action :release_non_streaming, only: :models

  def health
    render json: {
      ok: true,
      authenticated: OpenDocAiGateway::TOKEN.present?,
      provider: OpenDocAiGateway::PROVIDER,
      model: OpenDocAiGateway::MODEL,
      clientModelSelection: OpenDocAiGateway::ALLOW_CLIENT_MODEL
    }
  end

  def options
    head :no_content
  end

  def models
    render json: {
      models: OpenDocAiGateway::ALLOWED_MODELS.map { |model|
        { id: model, label: "#{model} · Gateway allowed", tier: model_tier(model) }
      },
      gateway: {
        clientModelSelection: OpenDocAiGateway::ALLOW_CLIENT_MODEL,
        provider: OpenDocAiGateway::PROVIDER,
        model: OpenDocAiGateway::MODEL,
        models: OpenDocAiGateway::ALLOW_CLIENT_MODEL ? OpenDocAiGateway::ALLOWED_MODELS.to_a : nil
      }.compact
    }
  end

  def chat
    unless request.content_length.to_i <= OpenDocAiGateway::MAX_BODY_BYTES
      return stream_error("AI gateway request body is too large.", 413)
    end
    messages = params[:messages]
    return stream_error("The messages array exceeds gateway limits or is invalid.", 400) unless valid_messages?(messages)
    if params[:provider].present? && params[:provider] != OpenDocAiGateway::PROVIDER
      return stream_error("Provider is fixed to '#{OpenDocAiGateway::PROVIDER}' by the gateway.", 400)
    end
    model = params[:model].presence || OpenDocAiGateway::MODEL
    return stream_error("Model '#{model}' is not allowed by this gateway.", 400) unless OpenDocAiGateway::ALLOWED_MODELS.include?(model)
    if OpenDocAiGateway::API_KEY.empty? && OpenDocAiGateway::PROVIDER != "ollama"
      return stream_error("AI_API_KEY is not configured on the gateway.", 503)
    end

    uri = URI(OpenDocAiGateway::BASE_URL.end_with?("/chat/completions") ? OpenDocAiGateway::BASE_URL : "#{OpenDocAiGateway::BASE_URL}/chat/completions")
    upstream_request = Net::HTTP::Post.new(uri)
    upstream_request["Content-Type"] = "application/json"
    upstream_request["Authorization"] = "Bearer #{OpenDocAiGateway::API_KEY}" if OpenDocAiGateway::API_KEY.present?
    upstream_request["HTTP-Referer"] = OpenDocAiGateway::SITE_URL if OpenDocAiGateway::SITE_URL.present?
    upstream_request["X-Title"] = OpenDocAiGateway::APP_NAME if OpenDocAiGateway::APP_NAME.present?
    temperature = params[:temperature].is_a?(Numeric) ? params[:temperature].clamp(0, 2) : 0.2
    upstream_request.body = JSON.generate(
      model: model,
      messages: messages.map { |message| { role: message[:role], content: message[:content] } },
      temperature: temperature,
      max_tokens: OpenDocAiGateway::MAX_OUTPUT_TOKENS,
      stream: true
    )

    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.open_timeout = [OpenDocAiGateway::UPSTREAM_TIMEOUT, 10].min
    http.read_timeout = OpenDocAiGateway::UPSTREAM_TIMEOUT
    http.write_timeout = OpenDocAiGateway::UPSTREAM_TIMEOUT

    http.request(upstream_request) do |upstream|
      if upstream.code.to_i.between?(200, 299)
        response.status = 200
        response.headers["Content-Type"] = upstream["Content-Type"].presence || "text/event-stream; charset=utf-8"
        response.headers["Cache-Control"] = "no-cache, no-transform"
        response.headers["X-Accel-Buffering"] = "no"
        upstream.read_body { |chunk| response.stream.write(chunk) }
      else
        raw = +""
        upstream.read_body { |chunk| raw << chunk if raw.bytesize < 16_384 }
        response.status = 502
        response.headers["Content-Type"] = "application/json; charset=utf-8"
        response.stream.write(JSON.generate(error: {
          message: upstream_message(raw, upstream.code.to_i),
          code: "upstream_error",
          status: upstream.code.to_i,
          provider: OpenDocAiGateway::PROVIDER,
          model: model
        }))
      end
    end
  rescue StandardError => error
    Rails.logger.error("OpenDoc AI gateway upstream error: #{error.class}")
    stream_error("AI gateway request failed.", 502) unless response.committed?
  ensure
    release_concurrency
    response.stream.close
  end

  private

  def apply_cors
    origin = request.headers["Origin"].to_s
    if origin.present? && !OpenDocAiGateway::ORIGINS.include?(origin)
      return render json: { error: { message: "Origin is not allowed by this AI gateway." } }, status: :forbidden
    end
    response.headers["Access-Control-Allow-Origin"] = origin if origin.present?
    response.headers["Vary"] = "Origin"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Expose-Headers"] = "X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After"
  end

  def authorize_gateway
    return if OpenDocAiGateway::TOKEN.empty? && OpenDocAiGateway::DEV_MODE
    return if ActiveSupport::SecurityUtils.secure_compare(request.headers["Authorization"].to_s, "Bearer #{OpenDocAiGateway::TOKEN}")
    render json: { error: { message: "Invalid AI gateway token." } }, status: :unauthorized
  end

  def take_limits
    key = "opendoc-ai:rate:#{request.remote_ip}:#{Time.now.to_i / 60}"
    count = Rails.cache.increment(key, 1, expires_in: 70.seconds, initial: 0)
    if count > OpenDocAiGateway::RATE_LIMIT
      response.headers["Retry-After"] = "60"
      return render json: { error: { message: "AI gateway rate limit exceeded." } }, status: :too_many_requests
    end
    @concurrency_acquired = true
    active = Rails.cache.increment("opendoc-ai:active", 1, expires_in: 2.minutes, initial: 0)
    if active > OpenDocAiGateway::MAX_CONCURRENT
      release_concurrency
      response.headers["Retry-After"] = "2"
      return render json: { error: { message: "AI gateway is busy." } }, status: :too_many_requests
    end
    response.headers["X-RateLimit-Limit"] = OpenDocAiGateway::RATE_LIMIT.to_s
    response.headers["X-RateLimit-Remaining"] = [OpenDocAiGateway::RATE_LIMIT - count, 0].max.to_s
  end

  def release_non_streaming
    release_concurrency
  end

  def release_concurrency
    return unless @concurrency_acquired
    @concurrency_acquired = false
    Rails.cache.decrement("opendoc-ai:active", 1)
  end

  def valid_messages?(messages)
    return false unless messages.is_a?(Array) && messages.length.between?(1, OpenDocAiGateway::MAX_MESSAGES)
    total = 0
    messages.all? do |message|
      role = message[:role] || message["role"]
      content = message[:content] || message["content"]
      valid = %w[system user assistant].include?(role) && content.is_a?(String) && content.length <= OpenDocAiGateway::MAX_MESSAGE_CHARS
      total += content.length if valid
      valid && total <= OpenDocAiGateway::MAX_CONTEXT_CHARS
    end
  end

  def model_tier(model)
    return "local" if OpenDocAiGateway::PROVIDER == "ollama"
    model.end_with?(":free") ? "free" : "premium"
  end

  def upstream_message(raw, status)
    parsed = JSON.parse(raw)
    parsed.dig("error", "message") || parsed["message"] || "Upstream returned HTTP #{status}."
  rescue JSON::ParserError
    raw.presence || "Upstream returned HTTP #{status}."
  end

  def stream_error(message, status)
    response.status = status
    response.headers["Content-Type"] = "application/json; charset=utf-8"
    response.stream.write(JSON.generate(error: { message: message }))
  end
end
