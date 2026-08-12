interface ImportMetaEnv {
    readonly VITE_DISABLE_APPLE_EMOJIS?: string;
    readonly VITE_LOAD_FROM_URL?: string;
    readonly VITE_SPEC_DOWNLOADER?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}

declare module '*.svg?react' {
    import * as React from 'react';
    const ReactComponent: React.FunctionComponent<React.SVGProps<SVGSVGElement>>;
    export default ReactComponent;
}
