import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getSettings, saveSettings } from "./db";
import { notify } from "./lib/dialogs";
import { Save, Building2, Ticket, Info, CheckCircle, Printer, RefreshCw, Upload, X, Shield, PrinterCheck, DatabaseBackup, Store } from "lucide-react";
import { buildSampleTicketText, getTicketWidth, withPrinterStyle } from "./lib/ticketFormat";
import { backupNow } from "./lib/backup";
import { save } from "@tauri-apps/plugin-dialog";
import VentasSettings from "./components/VentasSettings";
import TicketModal from "./components/TicketModal";

type SettingsTab = 'general' | 'ventas';

export default function Settings({ currentUser }: { currentUser?: any }) {
    const [tab, setTab] = useState<SettingsTab>('general');
    const [settings, setSettings] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [showSuccess, setShowSuccess] = useState(false);
    const [availablePorts, setAvailablePorts] = useState<string[]>([]);
    const [isScanning, setIsScanning] = useState(false);
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [testTicketPreview, setTestTicketPreview] = useState("");
    const logoInputRef = useRef<HTMLInputElement>(null);

    const isPrinterConfigured = !!(settings.printer_port && settings.printer_port !== "" && settings.printer_port !== "SIMULATOR");

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
        const testText = buildSampleTicketText(settings, getTicketWidth(settings));

        // Con simulador, o con "Previsualizar antes de imprimir", mostramos el ticket en
        // pantalla en vez de exigir una impresora real (igual criterio que en una venta real).
        if (!isPrinterConfigured || settings.print_mode === 'preview') {
            setTestTicketPreview(testText);
            return;
        }

        try {
            await invoke("print_receipt", { portName: settings.printer_port, receiptData: withPrinterStyle(testText, settings) });
            await notify("Ticket de prueba enviado a la impresora (con el formato real de venta).", 'info');
        } catch (e) {
            await notify("No se pudo imprimir la prueba: " + e, 'error');
        }
    };

    const handlePrintFromTestPreview = async () => {
        try {
            await invoke("print_receipt", { portName: settings.printer_port, receiptData: withPrinterStyle(testTicketPreview, settings) });
            await notify("Ticket de prueba enviado a la impresora.", 'info');
            setTestTicketPreview("");
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
        try {
            await saveSettings(settings);
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch (err) {
            console.error("Error guardando settings:", err);
            await notify("Error al guardar: " + err, "error");
        }
    };

    const handleBackupNow = async () => {
        try {
            const destPath = await save({
                defaultPath: `pospan_respaldo_${new Date().toISOString().slice(0, 10)}.db`,
                filters: [{ name: "Base de datos", extensions: ["db"] }],
            });
            if (!destPath) return;
            setIsBackingUp(true);
            await backupNow(destPath);
            await notify("Respaldo creado correctamente en la ubicación seleccionada.", 'info');
        } catch (e) {
            await notify("No se pudo crear el respaldo: " + e, 'error');
        } finally {
            setIsBackingUp(false);
        }
    };

    if (loading) return <div style={{ padding: '2rem' }}>Cargando configuraciones...</div>;

    return (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', paddingBottom: '5rem' }}>
            <TicketModal
                show={testTicketPreview !== ""}
                ticketData={testTicketPreview}
                logo={settings.biz_logo_img}
                onClose={() => setTestTicketPreview("")}
                isPrinterConfigured={isPrinterConfigured}
                onPrint={handlePrintFromTestPreview}
            />
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    Configuración del Sistema
                </h2>
                {tab === 'general' && (
                    <button
                        onClick={handleSave}
                        className="pay-btn"
                        style={{ padding: '0.8rem 2rem', width: 'auto' }}
                    >
                        <Save size={20} /> Guardar Cambios
                    </button>
                )}
            </header>

            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-light)', marginBottom: '1.5rem' }}>
                <button
                    onClick={() => setTab('general')}
                    style={{
                        padding: '0.7rem 1.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem',
                        borderBottom: tab === 'general' ? '3px solid var(--accent-primary)' : '3px solid transparent',
                        color: tab === 'general' ? 'var(--accent-primary)' : 'var(--text-muted)',
                        background: 'transparent', border: 'none', borderBottomStyle: 'solid',
                    }}
                >
                    General
                </button>
                <button
                    onClick={() => setTab('ventas')}
                    style={{
                        padding: '0.7rem 1.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem',
                        borderBottom: tab === 'ventas' ? '3px solid var(--accent-primary)' : '3px solid transparent',
                        color: tab === 'ventas' ? 'var(--accent-primary)' : 'var(--text-muted)',
                        background: 'transparent', border: 'none', borderBottomStyle: 'solid',
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                    }}
                >
                    <Store size={16} /> Ventas
                </button>
            </div>

            {showSuccess && (
                <div style={{
                    backgroundColor: 'var(--success)', color: 'white', padding: '1rem',
                    borderRadius: '8px', marginBottom: '1.5rem', display: 'flex',
                    alignItems: 'center', gap: '0.5rem', fontWeight: 600
                }}>
                    <CheckCircle size={20} /> ¡Configuraciones guardadas correctamente!
                </div>
            )}

            {tab === 'ventas' && <VentasSettings currentUser={currentUser} />}

            {tab === 'general' && (

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
                                {Array.from(new Set([
                                    ...Array.from({ length: 10 }, (_, i) => `COM${i + 1}`),
                                    ...availablePorts,
                                ])).map(p => (
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

                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Ancho (caracteres)</label>
                            <input
                                type="number"
                                min="24" max="64"
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                                value={settings.ticket_width || '32'}
                                onChange={(e) => handleChange('ticket_width', e.target.value)}
                            />
                            <small style={{ color: 'var(--text-muted)', marginTop: '0.4rem', display: 'block' }}>
                                * 32 en papel 58mm, 42-48 en 80mm.
                            </small>
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Margen Izquierdo</label>
                            <input
                                type="number"
                                min="0" max="20"
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                                value={settings.ticket_left_margin || '0'}
                                onChange={(e) => handleChange('ticket_left_margin', e.target.value)}
                            />
                            <small style={{ color: 'var(--text-muted)', marginTop: '0.4rem', display: 'block' }}>
                                * Espacios para evitar cortes.
                            </small>
                        </div>
                        <div className="form-group" style={{ flex: 1 }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Tipo de Letra</label>
                            <select
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'white' }}
                                value={settings.printer_font_style || 'normal'}
                                onChange={(e) => handleChange('printer_font_style', e.target.value)}
                            >
                                <option value="normal">Normal</option>
                                <option value="condensed">Condensada</option>
                                <option value="bold">Negrita</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Espacio inferior para corte (Líneas)</label>
                        <input
                            type="number"
                            min="0" max="15"
                            style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                            value={settings.ticket_bottom_space || '5'}
                            onChange={(e) => handleChange('ticket_bottom_space', e.target.value)}
                        />
                        <small style={{ color: 'var(--text-muted)', marginTop: '0.4rem', display: 'block' }}>
                            * Saltos de línea antes de cortar para evitar que corte el texto (5 por defecto).
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
                        <DatabaseBackup size={24} /> Respaldo de Base de Datos
                    </h3>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                        La app ya guarda respaldos automáticos internos (al abrir el sistema y al cerrar caja),
                        pero es buena práctica sacar además una copia periódica a un USB o carpeta compartida —
                        sobre todo antes de desinstalar o actualizar la app.
                    </p>
                    <button
                        type="button"
                        onClick={handleBackupNow}
                        disabled={isBackingUp}
                        style={{
                            padding: '0.8rem 1.5rem', backgroundColor: 'var(--accent-primary)', color: 'white',
                            border: 'none', borderRadius: '8px', fontWeight: 600, cursor: isBackingUp ? 'not-allowed' : 'pointer',
                            opacity: isBackingUp ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}
                    >
                        <DatabaseBackup size={18} /> {isBackingUp ? "Respaldando..." : "Respaldar Base de Datos Ahora"}
                    </button>
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
            )}
        </div>
    );
}
