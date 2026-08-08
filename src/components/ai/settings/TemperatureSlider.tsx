interface TemperatureSliderProps {
    value: number;
    onChange: (value: number) => void;
}

export default function TemperatureSlider({value, onChange}: TemperatureSliderProps) {
    const setFromClientX = (clientX: number, element: HTMLDivElement) => {
        const rect = element.getBoundingClientRect();
        const next = Math.max(0, Math.min(2, ((clientX - rect.left) / rect.width) * 2));
        onChange(Math.round(next * 10) / 10);
    };
    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-3">
            <div
                role="slider"
                aria-label="Temperature"
                aria-valuemin={0}
                aria-valuemax={2}
                aria-valuenow={value}
                tabIndex={0}
                className="relative h-7 cursor-pointer touch-none select-none"
                onPointerDown={event => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setFromClientX(event.clientX, event.currentTarget);
                }}
                onPointerMove={event => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        setFromClientX(event.clientX, event.currentTarget);
                    }
                }}
                onKeyDown={event => {
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        onChange(Math.max(0, Math.round((value - 0.1) * 10) / 10));
                    }
                    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        onChange(Math.min(2, Math.round((value + 0.1) * 10) / 10));
                    }
                    if (event.key === 'Home') {
                        event.preventDefault();
                        onChange(0);
                    }
                    if (event.key === 'End') {
                        event.preventDefault();
                        onChange(2);
                    }
                }}
            >
                <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--border)]/70"/>
                <div
                    className="absolute left-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--primary)]"
                    style={{width: `${(value / 2) * 100}%`}}
                />
                <div
                    className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--primary)] bg-[var(--surface)] shadow-md"
                    style={{left: `${(value / 2) * 100}%`}}
                />
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-[var(--text-muted)]">
                <span>Deterministic</span><span>Creative</span>
            </div>
        </div>
    );
}
