import React from 'react';

interface ViewErrorBoundaryProps {
    children: React.ReactNode;
    resetKey: string;
    title?: string;
}

interface ViewErrorBoundaryState {
    error: Error | null;
}

export default class ViewErrorBoundary extends React.Component<ViewErrorBoundaryProps, ViewErrorBoundaryState> {
    state: ViewErrorBoundaryState = {error: null};

    static getDerivedStateFromError(error: Error): ViewErrorBoundaryState {
        return {error};
    }

    componentDidUpdate(previous: ViewErrorBoundaryProps) {
        if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({error: null});
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error('OpenDoc view error', error, info);
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <section className="m-4 rounded-2xl border border-[var(--method-delete)]/30 bg-[var(--method-delete)]/5 p-5 text-sm">
                <div className="flex items-start gap-3">
                    <i className="ph ph-warning-octagon mt-0.5 text-xl text-[var(--method-delete)]" />
                    <div className="min-w-0 flex-1">
                        <h2 className="font-extrabold text-[var(--text-heading)]">
                            {this.props.title || 'This view could not be rendered'}
                        </h2>
                        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                            The rest of OpenDoc is still available. This usually indicates an unresolved or malformed
                            schema in this part of the specification.
                        </p>
                        <code className="mt-3 block overflow-auto rounded-lg bg-[var(--background)] p-2 text-[10px] text-[var(--method-delete)]">
                            {this.state.error.message}
                        </code>
                        <button
                            type="button"
                            onClick={() => this.setState({error: null})}
                            className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-bold hover:bg-[var(--surface-hover)] cursor-pointer"
                        >
                            Retry view
                        </button>
                    </div>
                </div>
            </section>
        );
    }
}
