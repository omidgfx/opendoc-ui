import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import svgr from 'vite-plugin-svgr';

export default defineConfig(() => {
    return {
        plugins: [
            react(),
            svgr(),
            tailwindcss(),
        ],
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
            rollupOptions: {
                output: {
                    entryFileNames: 'index.js',
                    chunkFileNames: '[name].js',
                    assetFileNames: '[name].[ext]',
                }
            },
        },
        css: {
            devSourcemap: true
        }
    };
});
