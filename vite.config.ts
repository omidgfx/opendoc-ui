import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import svgr from 'vite-plugin-svgr';

export default defineConfig(({mode}) => {
    const env = {...loadEnv(mode, process.cwd(), ''), ...process.env};
    const remoteLoadingEnabled = String(env.VITE_LOAD_FROM_URL || '').toLowerCase() === 'true';
    const downloaderTemplate = String(env.VITE_SPEC_DOWNLOADER || '').trim();
    // Keep the default drop-in bundle lean; explicitly set this to false to
    // include the Apple Emoji 16 metadata and embedded sprite.
    const appleEmojisDisabled = String(env.VITE_DISABLE_APPLE_EMOJIS || 'true').toLowerCase() !== 'false';
    if (remoteLoadingEnabled && downloaderTemplate) {
        const normalized = downloaderTemplate.replace(/^https?:\/\//i, '').replace(/^\/+/, '');
        if (!normalized.includes('{URL}'))
            throw new Error('VITE_SPEC_DOWNLOADER must contain the exact {URL} placeholder.');
        try {
            const parsed = new URL(
                `https://${normalized.split('{URL}').join(encodeURIComponent('https://example.com/openapi.yaml'))}`,
            );
            if (parsed.username || parsed.password)
                throw new Error('VITE_SPEC_DOWNLOADER cannot contain embedded credentials.');
        } catch (error) {
            throw new Error(
                error instanceof Error && error.message.includes('credentials')
                    ? error.message
                    : 'VITE_SPEC_DOWNLOADER does not produce a valid downloader URL.',
            );
        }
    }
    return {
        // GitHub Pages serves project sites from /<repository>/; regular and
        // custom-domain builds keep the root default.
        base: process.env.VITE_BASE_PATH || '/',
        plugins: [react(), svgr(), tailwindcss()],
        resolve: {
            alias: {
                '@opendoc-emoji': path.resolve(
                    __dirname,
                    appleEmojisDisabled ? 'src/features/emoji/disabled.ts' : 'src/features/emoji/enabled.ts',
                ),
                '@': path.resolve(__dirname, '.'),
            },
        },
        server: {
            hmr: process.env.DISABLE_HMR !== 'true',
            allowedHosts: ['.e2b.app'],
            proxy: {
                '/api/ai': {
                    target: process.env.AI_GATEWAY_URL || 'http://127.0.0.1:8787',
                    changeOrigin: true,
                },
            },
        },
        build: {
            sourcemap: false,
            // A single bundle is intentional for the drop-in distribution.
            chunkSizeWarningLimit: 2000,
            rollupOptions: {
                output: {
                    // OpenDoc is distributed as one drop-in JavaScript asset.
                    // Dynamic imports are inlined intentionally so Windows/static
                    // deployments never need to copy or rewrite chunk filenames.
                    inlineDynamicImports: true,
                    entryFileNames: 'index.js',
                    assetFileNames: '[name].[ext]',
                },
            },
        },
        css: {
            devSourcemap: false,
        },
    };
});
