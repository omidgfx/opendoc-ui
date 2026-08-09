export type DiagnosticSeverity = 'info' | 'warning' | 'error';

/**
 * A stable, user-visible explanation of behavior that OpenDoc inferred,
 * approximated, or could not express through the selected transport.
 *
 * Runner diagnostics are advisory by default. OpenDoc intentionally sends
 * malformed or incomplete requests when the browser can physically do so,
 * allowing the target API to return its own validation response.
 */
export interface Diagnostic {
    severity: DiagnosticSeverity;
    code: string;
    message: string;
    blocking?: boolean;
    operationId?: string;
    transport?: 'browser' | 'agent';
    source?: {
        uri?: string;
        pointer?: string;
        line?: number;
        column?: number;
    };
    details?: Record<string, unknown>;
}

export const diagnostic = (
    code: string,
    message: string,
    options: Partial<Omit<Diagnostic, 'code' | 'message'>> = {},
): Diagnostic => ({
    severity: options.severity || 'warning',
    code,
    message,
    ...options,
});
