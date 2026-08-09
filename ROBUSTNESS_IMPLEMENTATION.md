# Robustness implementation

This branch implements the selected audit backlog with one governing Runner rule:

> OpenDoc reports malformed inputs but sends them whenever browser `fetch` can physically do so. The target API, browser, DNS, gateway, or network layer remains the authority for runtime errors.

## Implemented foundations

- credentials isolated by specification identity
- effective root/operation security, including public and anonymous alternatives
- one `RequestIntent` compiler, browser materializer, and transport for UI and assistant runs
- canonical location-qualified input state
- advisory diagnostics for missing values, patterns, malformed bodies, unsupported refs, browser restrictions, and auth conflicts
- exact server precedence, variables, relative source handling, and OAS 3.2 `$self`
- response history capped at ten outcomes per endpoint
- operation-aware `Accept` and body-aware `Content-Type`
- OAS and Swagger parameter/body serialization matrices
- Swagger 2 host/basePath/schemes, collection formats, consumes/produces, formData, uploads, and security adaptation
- immutable raw documents beside dialect-aware semantic documents
- Swagger 2.0 and OAS 3.0/3.1/3.2 version handling
- OAS 3.2 QUERY and `additionalOperations`
- webhook-only OAS 3.1 documents and documentation-only webhook UI
- boolean schemas, composition semantics, readOnly/writeOnly request/response mocks
- constrained same-origin remote references and user-approved local multi-file references
- safe TypeScript identifiers, ZIP paths, cross-schema declarations, and compile checks
- deterministic validated mock generation with explicit failure diagnostics
- validated last-known-good cache, freshness metadata, and persistent stale disclosure
- real drag/drop, keyboard resizers, modal focus trap/restoration, accessible dropdowns, and icon labels
- canonical multi-language request snippets with credential placeholders
- explicit capability registry in `src/utils/openapi/capabilities.ts`

## Deliberately advisory, never blocking

- missing required parameters or request bodies
- unresolved path placeholders
- pattern/type/enum mistakes entered by the consumer
- malformed JSON entered in Raw mode
- questionable server URLs
- unsupported OpenAPI details where a best-effort HTTP request remains physically possible

## Physical browser limitations

The browser itself prevents or controls several behaviors. OpenDoc reports these rather than claiming they were sent:

- manually setting `Cookie` and other forbidden headers
- selecting an mTLS client certificate
- bodies on GET/HEAD through Fetch
- CORS and private-network access
- arbitrary multipart part headers through `FormData`

The optional AI gateway is not represented as an API Runner proxy.

## Executable checks

```bash
npm ci
npm run lint
npm test
npx playwright install --with-deps chromium
npm run test:browser
npm run build
```

`npm run test:all` runs the complete local verification sequence after the Playwright browser is installed.
