import type {AISkillPack} from '../types';

export const AI_SKILL_PACK_CONTENT: Record<AISkillPack, string> = {
    openapi: `OpenAPI grounding:
- Prefer the retrieved operation record and referenced schema records over general knowledge.
- Distinguish path parameters, query/header/cookie parameters, request-body media types, and response media types.
- Explain required versus optional fields, enum/default/example values, nullable fields, and security requirements precisely.
- When a $ref is present, name the resolved component and say when the retrieved context does not include it.
- Never infer an endpoint from a schema name or from a description alone.`,
    'rest-debugging': `REST debugging:
- Diagnose in this order: final URL and method, serialized parameters, request headers/body, CORS or browser policy, status code, response headers, and bounded response body.
- Separate client validation errors, authentication/authorization failures, rate limits, server failures, network failures, and browser CORS failures.
- Suggest safe, reproducible checks and avoid advising users to disable TLS, CORS, or authentication.
- For retries, mention idempotency and backoff; do not recommend retrying non-idempotent requests blindly.`,
    security: `Security:
- Use the exact security-scheme IDs and the exact OpenAPI security requirement. Entries in one requirement are AND; separate requirement objects are alternatives.
- Explain API-key location, HTTP bearer/basic schemes, OAuth/OIDC scopes, and cookie/browser restrictions explicitly.
- Never ask the user to paste a secret into chat. If a token is already redacted, say that it is unavailable.
- Treat OAuth authorization-code, PKCE, refresh, and scope lifecycle as an explicit flow that needs user/provider configuration; do not claim the browser runner performed it.`,
    'sdk-generation': `SDK/request generation:
- Generate examples from the retrieved method, URL, parameters, media type, and security scheme.
- Preserve OpenAPI serialization rules instead of flattening arrays or objects casually.
- Use placeholders for credentials and clearly label browser-only cookie behavior.
- Prefer a minimal working request first, then optional body, error handling, and typing improvements.`,
    'api-testing': `API testing:
- Turn the operation into a test matrix: happy path, missing required input, invalid enum/type, authentication, authorization, boundary values, malformed body, and representative error responses.
- For a request the user asks to inspect or prepare, use open_runner or set_runner_fields and do not send it.
- When the user explicitly asks to execute, run, login, test, or fetch a result and supplies the needed values, use run_api directly after briefly describing the exact request. Do not stop at open_runner.
- A request may be opened, its Runner fields populated, or it may be sent only through the OpenDoc UI action bridge described below; never imply an action happened merely because you proposed it.
- Use the schema's exact body field names and media type. For arrays, send a real array value rather than a comma-joined guess.`,
};
export const renderAISkillPackContent = (skills: AISkillPack[]): string => {
    const selected = skills.length > 0 ? skills : ['openapi' as AISkillPack];
    return selected
        .map(skill => AI_SKILL_PACK_CONTENT[skill])
        .filter(Boolean)
        .join('\n\n');
};
