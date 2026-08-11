Rails.application.routes.draw do
  get "/health", to: "open_doc_ai_gateway#health"
  match "/api/ai/*path", to: "open_doc_ai_gateway#options", via: :options
  post "/api/ai/models", to: "open_doc_ai_gateway#models"
  post "/api/ai/chat", to: "open_doc_ai_gateway#chat"
end
