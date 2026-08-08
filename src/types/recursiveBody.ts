import type { ReactNode } from 'react';
import type { OpenApiSpec } from '@/src/types';
export type BodyValue = unknown;
export type PathPart = string | number;
export interface RecursiveBodyFormProps {
    schema: any;
    spec: OpenApiSpec;
    value: BodyValue;
    onChange: (value: BodyValue) => void;
    setPatternToTest: (pattern: string | null) => void;
    selectedFiles: Record<string, File | null>;
    setSelectedFiles: (value: Record<string, File | null>) => void;
}
export interface FieldProps {
    schema: any;
    spec: OpenApiSpec;
    value: unknown;
    label: string;
    required?: boolean;
    path: PathPart[];
    depth: number;
    onChange: (path: PathPart[], value: unknown) => void;
    setPatternToTest: (pattern: string | null) => void;
    selectedFiles: Record<string, File | null>;
    setSelectedFiles: (value: Record<string, File | null>) => void;
    focusedPath: PathPart[] | null;
    setFocusedPath: (path: PathPart[]) => void;
    actions?: ReactNode;
}
