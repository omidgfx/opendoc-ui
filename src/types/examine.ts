// Persisted state for the examine/runner tab, keyed per endpoint so that
// running one endpoint doesn't wipe out the result you had for another.

export interface ExamineResponse {
    status: number | null;
    headers: { [key: string]: string };
    body: string;
    isJson: boolean;
    timestamp: number;
}

export interface ExamineInputs {
    params: { [name: string]: string | string[] };
    headers: { [name: string]: string };
    bodyText: string;
    bodyType: string;
    bodyFields: { [name: string]: string };
    bodyEditorMode: 'form' | 'raw';
    selectedFile: string | null; // filename only
    selectedFiles: { [name: string]: string | null };
}
