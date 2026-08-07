import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AppErrorBoundary from './components/common/AppErrorBoundary';
import './index.css';
import {hydrateStorageFromIndexedDb} from './utils/storage';

const mount = () => createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <AppErrorBoundary>
            <App/>
        </AppErrorBoundary>
    </StrictMode>,
);

// Hydrate the synchronous facade before React evaluates initial state. This
// makes IndexedDB the primary store for every app key while preserving a
// localStorage fallback when the browser blocks IndexedDB.
void hydrateStorageFromIndexedDb().catch(error => {
    console.warn('IndexedDB hydration failed; using the localStorage fallback.', error);
}).finally(mount);
