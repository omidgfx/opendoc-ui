import type {Diagnostic, OpenApiSpec} from '../types';

const sourceUris = new WeakMap<object, string>();
const specDiagnostics = new WeakMap<object, Diagnostic[]>();

export const registerSpecSourceUri = (spec: OpenApiSpec, sourceUri?: string | null): void => {
    if (!sourceUri)
        return;
    try {
        const base = typeof window !== 'undefined' ? window.location.href : undefined;
        sourceUris.set(spec as object, base ? new URL(sourceUri, base).href : new URL(sourceUri).href);
    } catch {
        sourceUris.set(spec as object, sourceUri);
    }
};

export const getSpecSourceUri = (spec: OpenApiSpec | null | undefined): string | undefined => spec
    ? sourceUris.get(spec as object)
    : undefined;

export const registerSpecDiagnostics = (spec: OpenApiSpec, diagnostics: Diagnostic[]): void => {
    specDiagnostics.set(spec as object, [...diagnostics]);
};

export const getSpecDiagnostics = (spec: OpenApiSpec | null | undefined): Diagnostic[] => spec
    ? [...(specDiagnostics.get(spec as object) || [])]
    : [];
