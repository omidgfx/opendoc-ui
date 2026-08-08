import type { OpenApiSpec } from '../types';
import { getEndpointId, HTTP_METHODS } from './routing';
export interface OperationLinkTarget {
    path: string;
    method: string;
    endpointId: string;
}
export function buildOperationLinkIndex(spec: OpenApiSpec | null): Record<string, OperationLinkTarget> {
    const index: Record<string, OperationLinkTarget> = {};
    if (!spec?.paths)
        return index;
    Object.entries(spec.paths).forEach(([path, pathItem]) => {
        if (!pathItem)
            return;
        Object.entries(pathItem).forEach(([method, operation]) => {
            if (!HTTP_METHODS.includes(method))
                return;
            const op = operation as any;
            if (!op)
                return;
            const endpointId = getEndpointId(op, path, method);
            const target: OperationLinkTarget = { path, method, endpointId };
            index[endpointId.toLowerCase()] = target;
            if (op.operationId)
                index[String(op.operationId).toLowerCase()] = target;
            if (op.summary) {
                const slug = String(op.summary)
                    .toLowerCase()
                    .trim()
                    .replace(/[^a-z0-9]+/g, '-')
                    .replace(/^-+|-+$/g, '');
                if (slug)
                    index[slug] = target;
            }
        });
    });
    return index;
}
const RESPONSE_FRAGMENT_RE = /#response-([a-zA-Z0-9_-]+)/;
export function rewriteInternalEndpointLinks(doc: Document, index: Record<string, OperationLinkTarget>, parsableKey: string): void {
    if (!parsableKey || Object.keys(index).length === 0)
        return;
    const anchors = doc.querySelectorAll('a[href]');
    anchors.forEach((a) => {
        const href = a.getAttribute('href');
        if (!href)
            return;
        if (href.startsWith('#/parsable/'))
            return;
        if (href.startsWith('mailto:') || href.startsWith('tel:'))
            return;
        try {
            const withoutHash = href.split('#')[0];
            const hashPart = href.includes('#') ? href.slice(href.indexOf('#') + 1) : '';
            const cleanPath = withoutHash.split('?')[0];
            const segments = cleanPath.split('/').filter(Boolean);
            const candidates: string[] = [];
            if (segments.length)
                candidates.push(segments[segments.length - 1]);
            if (hashPart) {
                const hashSegments = hashPart.split('/').filter(Boolean);
                if (hashSegments.length)
                    candidates.push(hashSegments[hashSegments.length - 1]);
            }
            let match: OperationLinkTarget | null = null;
            for (const raw of candidates) {
                if (!raw)
                    continue;
                let decoded = raw;
                try {
                    decoded = decodeURIComponent(raw);
                }
                catch {
                }
                const key = decoded.toLowerCase();
                if (index[key]) {
                    match = index[key];
                    break;
                }
            }
            if (match) {
                let newHref = `#/parsable/${encodeURIComponent(parsableKey)}/api/${encodeURIComponent(match.endpointId)}`;
                const responseMatch = href.match(RESPONSE_FRAGMENT_RE);
                if (responseMatch)
                    newHref += `#response-${responseMatch[1]}`;
                a.setAttribute('href', newHref);
                a.removeAttribute('target');
                a.setAttribute('data-internal-endpoint-link', 'true');
            }
        }
        catch {
        }
    });
}
