← [Back to README](../README.md) · [Docs index](index.md)

---

# Runner safety and OpenAPI behavior

The API Runner is manual-first and remains fully usable without an AI profile or gateway. The API Runner serializes query, path, header, and cookie parameters using OpenAPI styles
including `form`, `simple`, `label`, `matrix`, `deepObject`, `spaceDelimited`, and
`pipeDelimited`, with `explode` and `allowReserved` handling. Swagger 2 `collectionFormat`
values are mapped during compatibility conversion. Enum and boolean parameters use rich documented-value
controls with an explicit custom-value mode, while numeric, UUID, date, and other scalar inputs remain
permissive text so negative tests can still reach the API. The response reader is bounded at 2 MiB,
detects `application/*+json`, shows the substituted request URL, and supports a Cancel button plus a
30-second timeout. When actual `Content-Type` or `Content-Disposition` headers identify binary or
attachment data, the Runner cancels the body stream immediately after headers, saves no file, creates
no download link, and shows metadata only. Every endpoint keeps its **last 10 transaction outcomes**
per specification in IndexedDB-backed storage (with an emergency localStorage fallback only when IndexedDB is unavailable), including HTTP responses,
browser/network failures, validation outcomes, timeouts, and cancellations.

The Overview page keeps a specification-wide **Runner Compatibility** summary and shortcut. Its full
matrix remains part of Overview navigation, keeps Overview selected in the sidebar, and provides a
visible Back to Overview control. The matrix adds A–D ratings, numeric scores, auth, parameter counts,
request and response media, and scoped findings. It also lists missing reference files, can append
them to a local bundle, exports the immutable original or a derived bundled copy, and generates
`llms.txt`.
Compatibility remains a static preflight—not a promise about CORS, DNS, authentication state, server
behavior, or payloads missing from the specification. File-serving operations should declare a 2xx response media
type and a `string` schema with `format: binary`; when that success response is omitted, OpenDoc can
only recognize binary data from the real response headers after the request has been sent.

Request bodies have two complementary paths: the manual recursive form handles nested objects,
arrays of objects, arrays of arrays, enums, defaults, examples, and add/remove/reorder controls;
Raw mode remains available for payloads that need exact text. Simple parameter fields and recursive
body fields share the same focus frames, description popovers, schema links, and custom dropdowns.
Plain descriptions stay inline up to the compact threshold; Markdown descriptions move completely
into selectable, closable popovers with working links. Enum Markdown tables can supply lighter case
labels inside dropdown options. The raw editor selects JSON, YAML, XML, JavaScript, HTML, or plain-text
behavior from the media type and does not apply JSON diagnostics to non-JSON bodies.

The Runner is intentionally **permissive, not a client-side API validator**. Pattern mismatches,
malformed JSON, missing non-path values, and questionable server values are reported as notices but
remain testable against the real API. Missing required path parameters are the one strict exception:
they block execution because an incomplete route can resolve to the wrong backend endpoint.
Browser-imposed limitations such as GET/HEAD bodies and forbidden headers are disclosed rather than
hidden.

Authentication keeps actual OpenAPI security-scheme IDs and can apply composed requirements
simultaneously, with credentials isolated per specification and operation-level security overrides
honored. Cookie-secured operations show one informational note and send browser-managed cookies with
`credentials: include` without repetitive Runner warnings. Native OAuth 2 authorization-code and
implicit flows can launch interactively; authorization-code uses PKCE and requires token-endpoint
CORS because OpenDoc remains a public browser client. Manual access-token entry remains available.

Documents retain their immutable raw source and dialect alongside a separate semantic graph. OpenDoc
supports Swagger 2.0 and OpenAPI 3.0/3.1/3.2, including OAS 3.2 `QUERY` and `additionalOperations`.
Reference resolution is centralized and cycle-safe; unresolved references remain unchanged and are
shown as scoped diagnostics instead of recursive crashes. Same-origin remote external references are
loaded with count, size, timeout, redirect, and origin limits. For local multi-document APIs, missing
referenced files can be added after opening the root document; resolution remains entirely in memory.
The Compatibility page can download the untouched original or a derived bundled copy when every
required document is available.
---

← [Back to README](../README.md)
