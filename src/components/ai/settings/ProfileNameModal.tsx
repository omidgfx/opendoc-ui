import type {FormEvent} from 'react';

interface ProfileNameModalProps {
    visible: boolean;
    backdropClassName: string;
    targetId: string | null;
    name: string;
    onNameChange: (name: string) => void;
    onClose: () => void;
    onSubmit: () => void;
}

export default function ProfileNameModal({
                                             visible,
                                             backdropClassName,
                                             targetId,
                                             name,
                                             onNameChange,
                                             onClose,
                                             onSubmit
                                         }: ProfileNameModalProps) {
    if (!visible)
        return null;
    const rename = !!targetId;
    const submit = (event: FormEvent) => {
        event.preventDefault();
        onSubmit();
    };
    return (<div className={`${backdropClassName} fixed inset-0 z-[6200] bg-black/55 backdrop-blur-[2px]`}
                 onMouseDown={event => {
                     if (event.target === event.currentTarget)
                         onClose();
                 }}>
        <form
            className="modal-surface w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl"
            onSubmit={submit}>
            <header
                className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--background)] px-4 py-3">
                <div className="flex items-center gap-2.5">
                    <span
                        className="flex size-9 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]"><i
                        className={rename ? 'ph ph-pencil-simple text-[17px]' : 'ph ph-user-plus text-[17px]'}/></span>
                    <div><h3
                        className="text-sm font-extrabold text-[var(--text-heading)]">{rename ? 'Rename assistant profile' : 'Create assistant profile'}</h3>
                        <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{rename ? 'Update the saved profile name.' : 'Choose a name before creating it.'}</p>
                    </div>
                </div>
                <button type="button" onClick={onClose}
                        className="flex size-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-hover)] cursor-pointer">
                    <i className="ph ph-x"/></button>
            </header>
            <div className="p-4">
                <label className="block space-y-1.5"><span
                    className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">Profile
                    name</span>
                    <input autoFocus value={name} onChange={event => onNameChange(event.target.value)}
                           placeholder="My assistant profile"
                           className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-xs outline-none focus:border-[var(--primary)]"/>
                </label>
            </div>
            <footer className="flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--background)] px-4 py-3">
                <button type="button" onClick={onClose}
                        className="rounded-xl border border-[var(--border)] px-4 py-2 text-xs font-bold hover:bg-[var(--surface-hover)] cursor-pointer">Cancel
                </button>
                <button type="submit" disabled={!name.trim()}
                        className="whitespace-nowrap rounded-xl bg-[var(--primary)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">{rename ? 'Save name' : 'Create profile'}</button>
            </footer>
        </form>
    </div>);
}
