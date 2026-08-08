export default function SpecLoadingState() {
    return (<div className="m-auto flex flex-col items-center gap-1 text-[10px] font-bold">
            <div className="size-8 relative">
                <i className="block animate-spin size-full border-4 border-[var(--text-muted)]/30 rounded-full absolute"/>
                <i className="block animate-spin size-full border-4 border-r-[var(--primary)] border-transparent rounded-full absolute"/>
            </div>
            Please wait&hellip;
        </div>);
}
