import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import svgr from 'vite-plugin-svgr';

export default defineConfig(() => {
    return {
        // GitHub Pages serves project sites from /<repository>/; regular and
        // custom-domain builds keep the root default.
        base: process.env.VITE_BASE_PATH || '/',
        plugins: [react(), svgr(), tailwindcss()],
        resolve: {
            alias: {
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
            sourcemap: true,
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
            devSourcemap: true,
        },
    };
});
