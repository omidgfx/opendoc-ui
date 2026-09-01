← [Back to README](../README.md) · [Docs index](index.md)

---

# OpenDoc UI assistant

The topbar sparkle button opens a dedicated **OpenDoc UI** assistant page. You can also right-click
any endpoint and choose **Ask AI**, or open the assistant while viewing an endpoint to keep that
endpoint as the conversation context. The fixed chat header shows whether it is talking about
specific endpoint(s) or the entire API. It supports:

- multiple removable conversations saved per specification (including zero saved conversations),
- Markdown chat export from the assistant header,
- up to five endpoint contexts per conversation, with per-endpoint removal and endpoint-context Ask AI actions,
- global AI profiles containing provider/model settings, keys, gateway settings, and skill packs,
- a clear profile-creation screen when no AI profile exists,
- OpenRouter, Ollama, OpenAI, Anthropic, Gemini, and custom OpenAI-compatible endpoints,
- direct browser calls for CORS-enabled providers,
- optional same-origin or external gateway transport,
- **managed AI mode** where the organization's backend owns the configuration — the assistant just works, with no profiles, no settings UI, and no secrets in the browser,
- retrieved endpoint/schema context (rather than an unconditional full-spec prompt) with source-ID citations,
- operational Swagger/OpenAPI, REST debugging, security, SDK generation, and API testing skill packs,
- a validated OpenDoc UI action bridge for opening endpoints/schemas, searching, filling Runner fields, and proposing explicit API runs,
- explicit Runner actions that return a bounded, redacted result card to the current conversation,
- request preparation in the existing API Runner with a confirmation gate,
- standard in-app endpoint links in AI answers, target indicators in the sidebar, and an unread dot when a background answer finishes,
- fixed-height chat context header with up to five selected endpoints and Markdown conversation export,
- automatic compact mode: scrolling down hides the AI title bar and compacts the context header; scrolling up restores both.

Provider API keys are held in memory/session storage by default when Direct transport is used;
the settings dialog has an explicit **Remember secrets on this device** opt-in for localStorage
persistence. LocalStorage is not a secure vault. Profiles can be created, selected, renamed,
edited, saved with confirmation, deleted with confirmation, or removed all at once with
confirmation. Gateway mode keeps provider credentials on the gateway and sends only the
conversation/context request. API keys, tokens, passwords, cookies, and secret-looking OpenAPI
values are redacted by default. A conversation can explicitly enable authentication values,
which displays a persistent warning.

The assistant is static-build safe: the documentation browser works without an AI gateway. Open
AI settings to create a profile, then select a provider, model, transport, gateway URL, skills, and
optional instructions. Direct browser transport remains available for providers that permit CORS;
the optional gateway is only needed when server-side credentials or a provider proxy is required.
The default online free choice is OpenRouter’s `openrouter/free` router; it still requires a free
OpenRouter account/API key. The settings dialog presents models in a searchable, scrollable list;
**Refresh models** fetches and globally caches the current provider catalog, so newly released GPT
or other provider models can be entered or selected without an app update.
---

← [Back to README](../README.md)
