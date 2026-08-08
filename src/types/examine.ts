export interface ExamineResponse {
    status: number | null;
    headers: {
        [key: string]: string;
    };
    body: string;
    isJson: boolean;
    timestamp: number;
    requestUrl?: string;
    durationMs?: number;
    bodyBytes?: number;
    truncated?: boolean;
    isBinary?: boolean;
    errorKind?: 'validation' | 'network' | 'cors' | 'timeout' | 'http' | 'cancelled';
    errorMessage?: string;
}

export interface ExamineInputs {
    params: {
        [name: string]: string | string[];
    };
    headers: {
        [name: string]: string;
    };
    bodyText: string;
    bodyType: string;
    bodyFields: {
        [name: string]: string;
    };
    bodyEditorMode: 'form' | 'raw';
    selectedFile: string | null;
    selectedFiles: {
        [name: string]: string | null;
    };
}
