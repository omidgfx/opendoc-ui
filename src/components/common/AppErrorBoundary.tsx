import React from 'react';
import pkg from '../../../package.json';
import { clearAISessionSecrets, clearAllAIConversations } from '../../utils/aiStorage';
import { clearAllCachedSpecs } from '../../utils/specCache';
import { specStorage, uiStorage } from '../../utils/storage';
interface AppErrorBoundaryProps {
    children: React.ReactNode;
}
interface AppErrorBoundaryState {
    error: Error | null;
    componentStack: string;
}
const issueUrl = 'https://github.com/omidgfx/opendoc-ui/issues/new';
export default class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
    state: AppErrorBoundaryState = { error: null, componentStack: '' };
    static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
        return { error, componentStack: '' };
    }
    componentDidMount() {
        window.addEventListener('error', this.handleGlobalError);
        window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
    }
    componentWillUnmount() {
        window.removeEventListener('error', this.handleGlobalError);
        window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
    }
    componentDidCatch(error: Error, info: React.ErrorInfo) {
        this.setState({ error, componentStack: info.componentStack || '' });
        console.error('OpenDoc UI application error', error, info);
    }
    private handleGlobalError = (event: ErrorEvent) => {
        if (this.state.error)
            return;
        const error = event.error instanceof Error ? event.error : new Error(event.message || 'Unknown browser error');
        this.setState({
            error,
            componentStack: `Source: ${event.filename || 'unknown'}:${event.lineno || 0}:${event.colno || 0}`
        });
    };
    private handleUnhandledRejection = (event: PromiseRejectionEvent) => {
        if (this.state.error)
            return;
        const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'Unhandled promise rejection'));
        this.setState({ error: reason, componentStack: 'Source: unhandled promise rejection' });
    };
    private refresh = () => window.location.reload();
    private resetAndRefresh = async () => {
        await Promise.all([
            uiStorage.clear(),
            specStorage.clearAll(),
            clearAllCachedSpecs(),
            clearAllAIConversations(),
        ]);
        clearAISessionSecrets();
        window.location.reload();
    };
    private reportUrl = () => {
        const error = this.state.error;
        const details = [
            `OpenDoc UI version: ${pkg.version}`,
            `URL: ${window.location.href}`,
            `User agent: ${navigator.userAgent}`,
            '',
            'Error:',
            error?.stack || error?.message || 'Unknown application error',
            '',
            'Component stack:',
            this.state.componentStack || 'Unavailable',
        ].join('\n').slice(0, 12000);
        return `${issueUrl}?title=${encodeURIComponent(`[Crash] ${error?.message || 'Unknown application error'}`)}&body=${encodeURIComponent(details)}`;
    };
    render() {
        if (!this.state.error)
            return this.props.children;
        const errorDetails = [this.state.error.stack || this.state.error.message, this.state.componentStack].filter(Boolean).join('\n\n');
        return (<main className="flex min-h-screen items-center justify-center bg-[var(--background,#f8fafc)] p-6 text-[var(--text,#334155)]">
                <section className="w-full max-w-2xl rounded-2xl border border-[var(--border,#d5dbe5)] bg-[var(--surface,#fff)] p-6 shadow-xl">
                    <div className="flex items-start gap-4">
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#ef4444]/10 text-[#dc2626]"><i className="ph ph-warning-octagon text-[22px]"/></span>
                        <div className="min-w-0 flex-1"><h1 className="text-lg font-extrabold text-[var(--text-heading,#172033)]">OpenDoc UI needs to
                            recover</h1><p className="mt-1 text-xs leading-relaxed text-[var(--text-muted,#64748b)]">An
                            unexpected application error stopped this view. Refreshing normally preserves your saved
                            specifications, tabs, settings, and conversations.</p></div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                        <button type="button" onClick={this.refresh} className="rounded-xl bg-[var(--primary,#2563eb)] px-4 py-2.5 text-xs font-bold text-white hover:brightness-110 cursor-pointer">
                            <i className="ph ph-arrow-clockwise me-1.5"/>Refresh page
                        </button>
                        <button type="button" onClick={() => {
                void this.resetAndRefresh();
            }} className="rounded-xl border border-[#dc2626]/30 bg-[#dc2626]/5 px-4 py-2.5 text-xs font-bold text-[#b91c1c] hover:bg-[#dc2626]/10 cursor-pointer">
                            <i className="ph ph-trash me-1.5"/>Full reset and refresh
                        </button>
                        <a href={this.reportUrl()} target="_blank" rel="noreferrer" className="rounded-xl border border-[var(--border,#d5dbe5)] px-4 py-2.5 text-xs font-bold text-[var(--text-heading,#172033)] hover:bg-[var(--surface-hover,#f1f5f9)] cursor-pointer"><i className="ph ph-github-logo me-1.5"/>Report on GitHub</a></div>
                    <details className="mt-5 rounded-xl border border-[var(--border,#d5dbe5)] bg-[var(--background,#f8fafc)] p-3">
                        <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted,#64748b)]">Error
                            details
                        </summary>
                        <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-[#b91c1c]">{errorDetails || 'No stack details were provided by the browser.'}</pre>
                    </details>
                </section>
            </main>);
    }
}
