import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getSettings, saveSettings } from "./db";
import { notify } from "./lib/dialogs";
import { Save, Building2, Ticket, Info, CheckCircle, Printer, RefreshCw, Upload, X, Shield, PrinterCheck } from "lucide-react";

export default function Settings() {
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [showSuccess, setShowSuccess] = useState(false);
    const [availablePorts, setAvailablePorts] = useState<string[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const logoInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        async function load() {
            const data = await getSettings();
            setSettings(data);
            setLoading(false);
            
            // Escanear puertos al abrir si ya hay algo guardado
            const ports = await invoke("list_ports") as string[];
            setAvailablePorts(ports);
        }
        load();
    }, []);

    const handleTestPrint = async () => {
        if (!settings.printer_port || settings.printer_port === 'SIMULATOR') {
            await notify("Selecciona primero un puerto de impresora real (no el simulador) para poder probar.", 'warning');
            return;
        }
        try {
            const testText = `PRUEBA DE IMPRESION\n--------------------------------\nSi puedes leer este ticket,\ntu impresora esta bien configurada.\n--------------------------------\nPuerto: ${settings.printer_port}\n${new Date().toLocaleString('es-MX')}\n\n\n`;
            await invoke("print_receipt", { portName: settings.printer_port, receiptData: testText });
            await notify("Ticket de prueba enviado a la impresora.", 'info');
        } catch (e) {
            await notify("No se pudo imprimir la prueba: " + e, 'error');
        }
    };

    const scanPorts = async () => {
        setIsScanning(true);
        try {
            const ports = await invoke("list_ports") as string[];
            setAvailablePorts(ports);
        } catch (e) {
            console.error("Error escaneando puertos:", e);
        } finally {
            setIsScanning(false);
        }
    };

    const handleChange = (key: string, value: string) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => handleChange('biz_logo_img', reader.result as string);
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleSave = async () => {
        await saveSettings(settings);
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
    };

    if (loading) return <div style={{ padding: '2rem' }}>Cargando configuraciones...</div>;

    return (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', paddingBottom: '5rem' }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    Configuración del Sistema
                </h2>
                <button
                    onClick={handleSave}
                    className="pay-btn"
                    style={{ padding: '0.8rem 2rem', width: 'auto' }}
                >
                    <Save size={20} /> Guardar Cambios
                </button>
            </header>

            {showSuccess && (
                <div style={{ 
                    backgroundColor: 'var(--success)', color: 'white', padding: '1rem', 
                    borderRadius: '8px', marginBottom: '1.5rem', display: 'flex', 
                    alignItems: 'center', gap: '0.5rem', fontWeight: 600 
                }}>
                    <CheckCircle size={20} /> ¡Configuraciones guardadas correctamente!
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                
                {/* Sección 1: Datos de la Empresa */}
                <section style={{ backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Building2 size={24} /> Datos de la Empresa
                    </h3>
                    {/* Logotipo imagen */}
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Logotipo de la Empresa</label>
                        <div style={{
                            border: '2px dashed var(--border-light)', borderRadius: '12px', padding: '1.5rem',
                            textAlign: 'center', backgroundColor: 'var(--bg-tertiary)',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem'
                        }}>
                            {settings.biz_logo_img ? (
                                <>
                                    <img
                                        src={settings.biz_logo_img}
                                        alt="Logo"
                                        style={{ maxWidth: '140px', maxHeight: '80px', objectFit: 'contain', borderRadius: '8px' }}
                                    />
                                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                                        <button type="button" onClick={() => logoInputRef.current?.click()}
                                            style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'white', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <Upload size={14} /> Cambiar
                                        </button>
                                        <button type="button" onClick={() => handleChange('biz_logo_img', '')}
                                            style={{ padding: '0.4rem 0.8rem', borderRadius: '6px', border: '1px solid var(--danger)', backgroundColor: 'white', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                            <X size={14} /> Quitar
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <span style={{ fontSize: '2rem' }}>🖼️</span>
                                    <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>PNG, JPG o SVG · máx. recomendado 500 KB</p>
                                    <button type="button" onClick={() => logoInputRef.current?.click()}
                                        style={{ padding: '0.5rem 1rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'white', cursor: 'pointer', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}>
                                        <Upload size={16} /> Subir Imagen
                                    </button>
                                </>
                            )}
                            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
                        </div>
                    </div>

                    {/* Emoji para ticket térmico */}
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Símbolo para Ticket Térmico (Emoji)</label>
                        <input
                            type="text"
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                            value={settings.biz_logo || ''}
                            onChange={(e) => handleChange('biz_logo', e.target.value)}
                            placeholder="🍦 o 🥨"
                        />
                        <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.4rem' }}>
                            * Aparece en el encabezado del ticket impreso (solo texto)
                        </small>
                    </div>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Nombre del Negocio</label>
                        <input 
                            type="text" 
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                            value={settings.biz_name || ''} 
                            onChange={(e) => handleChange('biz_name', e.target.value)}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Subtítulo del Sistema</label>
                        <input 
                            type="text" 
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                            value={settings.biz_subtitle || ''} 
                            onChange={(e) => handleChange('biz_subtitle', e.target.value)}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>RFC</label>
                        <input 
                            type="text" 
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                            value={settings.biz_rfc || ''} 
                            onChange={(e) => handleChange('biz_rfc', e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Teléfono</label>
                        <input 
                            type="text" 
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                            value={settings.biz_phone || ''} 
                            onChange={(e) => handleChange('biz_phone', e.target.value)}
                        />
                    </div>
                </section>

                {/* Sección 2: Configuración del Ticket */}
                <section style={{ backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Ticket size={24} /> Encabezado y Pie de Ticket
                    </h3>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Dirección - Línea 1</label>
                        <input 
                            type="text" 
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                            value={settings.biz_address_1 || ''} 
                            onChange={(e) => handleChange('biz_address_1', e.target.value)}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Dirección - Línea 2</label>
                        <input 
                            type="text" 
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                            value={settings.biz_address_2 || ''} 
                            onChange={(e) => handleChange('biz_address_2', e.target.value)}
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Línea Extra (Footer)</label>
                        <input 
                            type="text" 
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                            value={settings.ticket_extra_address || ''} 
                            onChange={(e) => handleChange('ticket_extra_address', e.target.value)}
                        />
                    </div>
                    <hr style={{ margin: '1.5rem 0', opacity: 0.1 }} />
                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Mensaje de Cortesía</label>
                        <input 
                            type="text" 
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                            value={settings.ticket_footer_msg || ''} 
                            onChange={(e) => handleChange('ticket_footer_msg', e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Sitio Web / Sistema</label>
                        <input 
                            type="text" 
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                            value={settings.ticket_website || ''} 
                            onChange={(e) => handleChange('ticket_website', e.target.value)}
                        />
                    </div>
                </section>

                {/* Sección 3: Impuestos e Información Legal */}
                <section style={{ backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Printer size={24} /> Hardware e Impresora
                    </h3>
                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Puerto de Impresora (ESC/POS)</label>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <select 
                                style={{ flex: 1, padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'white' }}
                                value={settings.printer_port || ''}
                                onChange={(e) => handleChange('printer_port', e.target.value)}
                            >
                                <option value="">-- No Configurada (Simulador) --</option>
                                <option value="SIMULATOR">Simulador Virtual</option>
                                {availablePorts.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                            <button 
                                onClick={scanPorts}
                                disabled={isScanning}
                                style={{ 
                                    padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)', 
                                    backgroundColor: 'white', cursor: 'pointer' 
                                }}
                                title="Escanear Puertos"
                            >
                                <RefreshCw size={20} className={isScanning ? 'spin-animation' : ''} />
                            </button>
                        </div>
                        <small style={{ color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                            * Selecciona el puerto COM (Windows) o USB al que está conectada tu Epson T88V.
                        </small>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Modo de Impresión</label>
                        <select
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'white' }}
                            value={settings.print_mode || 'auto'}
                            onChange={(e) => handleChange('print_mode', e.target.value)}
                        >
                            <option value="auto">Imprimir automáticamente (sin previsualizar)</option>
                            <option value="preview">Previsualizar antes de imprimir</option>
                        </select>
                        <small style={{ color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                            * Con "Previsualizar" podrás revisar el ticket en pantalla e imprimirlo manualmente desde ahí.
                        </small>
                    </div>

                    <button
                        onClick={handleTestPrint}
                        type="button"
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', width: '100%',
                            padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--accent-primary)',
                            backgroundColor: 'transparent', color: 'var(--accent-primary)', cursor: 'pointer', fontWeight: 600
                        }}
                    >
                        <PrinterCheck size={18} /> Imprimir Ticket de Prueba
                    </button>
                </section>

                {/* Sección 5: Operatividad y Seguridad */}
                <section style={{ backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Shield size={24} /> Operatividad y Seguridad
                    </h3>
                    
                    {/* Permitir Ventas Sin Stock */}
                    <div className="form-group" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <input 
                            type="checkbox"
                            id="allow_negative_stock_chk"
                            style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                            checked={settings.allow_negative_stock === 'true'}
                            onChange={(e) => handleChange('allow_negative_stock', e.target.checked ? 'true' : 'false')}
                        />
                        <label htmlFor="allow_negative_stock_chk" style={{ fontWeight: 600, cursor: 'pointer' }}>
                            Permitir ventas sin inventario (stock cero o negativo)
                        </label>
                    </div>

                    {/* Temporizador de Cierre de Sesión */}
                    <div className="form-group">
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Cierre de Sesión Automático por Inactividad</label>
                        <select 
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'white' }}
                            value={settings.lock_timeout_mins || '5'}
                            onChange={(e) => handleChange('lock_timeout_mins', e.target.value)}
                        >
                            <option value="0">Desactivado (Nunca bloquear)</option>
                            <option value="1">1 minuto</option>
                            <option value="2">2 minutos</option>
                            <option value="5">5 minutos</option>
                            <option value="10">10 minutos</option>
                            <option value="15">15 minutos</option>
                        </select>
                        <small style={{ color: 'var(--text-muted)', marginTop: '0.5rem', display: 'block' }}>
                            * La sesión del cajero se cerrará automáticamente si no hay interacción durante este periodo.
                        </small>
                    </div>
                </section>

                <section style={{ backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                        <Info size={24} /> Texto Legal del Comprobante
                    </h3>
                    <div className="form-group">
                        <textarea 
                            style={{ 
                                width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)', 
                                height: '100px', fontFamily: 'inherit', resize: 'none'
                            }}
                            value={settings.ticket_legal || ''} 
                            onChange={(e) => handleChange('ticket_legal', e.target.value)}
                        />
                    </div>
                </section>

            </div>
        </div>
    );
}
