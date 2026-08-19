import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import AppErrorBoundary from './components/common/AppErrorBoundary';
import {PreferencesProvider} from './contexts/PreferencesContext';
import './index.css';
import {hydrateStorageFromIndexedDb} from './utils/storage/index';
import {handleOAuthCallback, recoverFromOAuthCallbackError} from './utils/runner/oauthFlow';

const mount = () =>
    createRoot(document.getElementById('root')!).render(
        <StrictMode>
            <AppErrorBoundary>
                <PreferencesProvider>
                    <App />
                </PreferencesProvider>
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
