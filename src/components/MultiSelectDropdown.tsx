import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

interface Option {
    id: number;
    name: string;
}

interface MultiSelectDropdownProps {
    options: Option[];
    selectedIds: number[];
    onChange: (ids: number[]) => void;
    allLabel?: string;
    icon?: React.ReactNode;
}

export default function MultiSelectDropdown({ options, selectedIds, onChange, allLabel = "Todos", icon }: MultiSelectDropdownProps) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const toggle = (id: number) => {
        if (selectedIds.includes(id)) onChange(selectedIds.filter(i => i !== id));
        else onChange([...selectedIds, id]);
    };

    const label = selectedIds.length === 0
        ? allLabel
        : selectedIds.length === 1
            ? options.find(o => o.id === selectedIds[0])?.name || `1 seleccionado`
            : `${selectedIds.length} almacenes seleccionados`;

    return (
        <div ref={ref} style={{ position: 'relative' }}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.7rem',
                    borderRadius: '8px', border: '1px solid var(--border-light)', background: 'var(--bg-primary)',
                    cursor: 'pointer', fontSize: '0.9rem', whiteSpace: 'nowrap'
                }}
            >
                {icon}
                {label}
                <ChevronDown size={14} />
            </button>
            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 20, minWidth: '220px',
                    background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '8px',
                    boxShadow: 'var(--shadow-md)', maxHeight: '280px', overflowY: 'auto', padding: '0.5rem'
                }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.5rem', cursor: 'pointer', fontWeight: 600, borderBottom: '1px solid var(--border-light)', marginBottom: '0.3rem' }}>
                        <input type="checkbox" checked={selectedIds.length === 0} onChange={() => onChange([])} />
                        {allLabel}
                    </label>
                    {options.map(o => (
                        <label key={o.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.5rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={selectedIds.includes(o.id)} onChange={() => toggle(o.id)} />
                            {o.name}
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}
