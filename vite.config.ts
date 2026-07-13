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
        css: {

        },
        server: {
            hmr: process.env.DISABLE_HMR !== 'true',
            watch: process.env.DISABLE_HMR === 'true' ? null : {},
        },
        build: {
            rollupOptions: {
                output: {
                    entryFileNames: 'index.js',
                    chunkFileNames: '[name].js',
                    assetFileNames: '[name].[ext]',
                }
            },
            manifest: false,
        }
    };
});
