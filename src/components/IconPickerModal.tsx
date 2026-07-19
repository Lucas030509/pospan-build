import { useEffect, useRef, useState } from "react";
import { ImageUp, Search, X } from "lucide-react";
import { searchIcons } from "../lib/iconLibrary";

interface IconPickerModalProps {
    show: boolean;
    currentIcon: string;
    onSelect: (emoji: string) => void;
    onClose: () => void;
}

function readFileAsDataUrl(file: File, onDone: (dataUrl: string) => void) {
    const reader = new FileReader();
    reader.onload = () => onDone(reader.result as string);
    reader.readAsDataURL(file);
}

export default function IconPickerModal({ show, currentIcon, onSelect, onClose }: IconPickerModalProps) {
    const [search, setSearch] = useState("");
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Permite pegar una imagen desde el portapapeles (Ctrl+V) mientras el modal está abierto
    useEffect(() => {
        if (!show) return;
        const handlePaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (const item of items) {
                if (item.type.startsWith('image/')) {
                    const file = item.getAsFile();
                    if (!file) continue;
                    e.preventDefault();
                    readFileAsDataUrl(file, dataUrl => {
                        onSelect(dataUrl);
                        onClose();
                    });
                    break;
                }
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [show, onSelect, onClose]);

    if (!show) return null;

    const results = searchIcons(search);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        readFileAsDataUrl(file, dataUrl => {
            onSelect(dataUrl);
            onClose();
        });
        e.target.value = '';
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000
        }}>
            <div style={{
                backgroundColor: 'white', borderRadius: '12px', width: '100%', maxWidth: '420px', maxHeight: '80vh',
                display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)' }}>
                    <h3 style={{ margin: 0, fontSize: '1.15rem' }}>Seleccionar Ícono</h3>
                    <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <X size={22} />
                    </button>
                </div>

                <div style={{ padding: '1rem 1.5rem 0.5rem' }}>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={handleImageUpload}
                    />
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%',
                            padding: '0.7rem 1rem', marginBottom: '0.75rem', border: '1px dashed var(--accent-primary)',
                            borderRadius: '8px', backgroundColor: 'var(--bg-tertiary)', color: 'var(--accent-primary)',
                            cursor: 'pointer', fontWeight: 600
                        }}
                    >
                        <ImageUp size={18} /> Subir imagen desde mi equipo
                    </button>
                    <p style={{ margin: '0 0 0.75rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        o pega una imagen copiada con Ctrl+V
                    </p>

                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-tertiary)', borderRadius: 'var(--radius-full)', padding: '0.5rem 1rem' }}>
                        <Search size={16} color="var(--text-muted)" />
                        <input
                            autoFocus
                            type="text"
                            placeholder="Buscar ícono por nombre..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', marginLeft: '0.5rem', width: '100%' }}
                        />
                    </div>
                </div>

                <div style={{ padding: '1rem 1.5rem 1.5rem', overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem' }}>
                    {results.map(({ emoji, label }) => (
                        <button
                            key={emoji}
                            type="button"
                            title={label}
                            onClick={() => { onSelect(emoji); onClose(); }}
                            style={{
                                fontSize: '1.6rem', padding: '0.6rem', cursor: 'pointer', borderRadius: '8px',
                                border: emoji === currentIcon ? '2px solid var(--accent-primary)' : '1px solid transparent',
                                backgroundColor: emoji === currentIcon ? 'var(--bg-tertiary)' : 'transparent',
                            }}
                        >
                            {emoji}
                        </button>
                    ))}
                    {results.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>
                            Sin resultados para "{search}"
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
