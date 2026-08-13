import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AppErrorBoundary from './components/common/AppErrorBoundary';
import './index.css';
import {hydrateStorageFromIndexedDb} from './utils/storage';
import {handleOAuthCallback, recoverFromOAuthCallbackError} from './utils/oauthFlow';

const mount = () =>
    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <AppErrorBoundary>
                <App />
            </AppErrorBoundary>
        </StrictMode>,
    );
void Promise.all([
    hydrateStorageFromIndexedDb().catch(error => {
        console.warn('IndexedDB hydration failed; using the localStorage fallback.', error);
    }),
    handleOAuthCallback().catch(error => {
        console.error('OAuth callback failed.', error);
        recoverFromOAuthCallbackError();
    }),
]).finally(mount);
