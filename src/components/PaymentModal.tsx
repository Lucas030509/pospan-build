import { useState, useEffect } from "react";
import { X, Banknote, CreditCard, Delete, CheckCircle2, ChevronRight, FileText, Plus, Gift, Lock } from "lucide-react";
import { emit } from "@tauri-apps/api/event";
import { getCustomers, createCustomer, getCardInstitutions, getUserByPin } from "../db";
import { notify } from "../lib/dialogs";
import { REGIMEN_FISCAL_OPTIONS, USO_CFDI_OPTIONS } from "../lib/satCatalogs";
import type { SavePaymentInput } from "../db";

type Method = 'cash' | 'card' | 'mixed' | 'cortesia';

interface PaymentModalProps {
    show: boolean;
    total: number;
    userId?: number;
    onClose: () => void;
    onConfirm: (paymentData: {
        payment: SavePaymentInput,
        requiresInvoice: boolean,
        invoiceCustomerId?: number,
        // Solo para armar el ticket (no se manda a saveSale, que ya guarda esos datos por su lado).
        bankName?: string,
        authorizedByName?: string
    }) => void;
}

export default function PaymentModal({ show, total, userId, onClose, onConfirm }: PaymentModalProps) {
    const [method, setMethod] = useState<Method>('cash');
    const [receivedStr, setReceivedStr] = useState("");
    // Evita disparar onConfirm dos veces (doble Enter por auto-repeat del teclado,
    // doble tap en pantalla táctil) antes de que el modal se cierre y desmonte.
    const [submitting, setSubmitting] = useState(false);
    const received = parseFloat(receivedStr) || 0;
    const change = Math.max(0, received - total);

    // Tarjeta / Mixto: banco + tipo de tarjeta
    const [institutions, setInstitutions] = useState<any[]>([]);
    const [cardType, setCardType] = useState<'debito' | 'credito'>('debito');
    const [bankInstitutionId, setBankInstitutionId] = useState<number | "">("");

    // Mixto: monto en efectivo capturado vía numpad (receivedStr se reutiliza), el resto va a tarjeta
    const mixedCashAmount = Math.min(received, total);
    const mixedCardAmount = Math.round((total - mixedCashAmount) * 100) / 100;

    // Cortesía: PIN de cuenta master + motivo obligatorio
    const [hasMaster, setHasMaster] = useState<boolean | null>(null);
    const [cortesiaAuthorized, setCortesiaAuthorized] = useState<{ id: number; name: string } | null>(null);
    const [cortesiaPin, setCortesiaPin] = useState("");
    const [cortesiaError, setCortesiaError] = useState("");
    const [cortesiaReason, setCortesiaReason] = useState("");
    const [cortesiaChecking, setCortesiaChecking] = useState(false);

    // Factura: opcional, solo si el cliente la pide. Si se marca, hay que dejar un
    // cliente (existente o capturado ahí mismo) para poder generar la factura después.
    const [requiresInvoice, setRequiresInvoice] = useState(false);
    const [customers, setCustomers] = useState<any[]>([]);
    const [invoiceCustomerId, setInvoiceCustomerId] = useState<number | "">("");
    const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState("");
    const [newCustomerRfc, setNewCustomerRfc] = useState("");
    const [newCustomerEmail, setNewCustomerEmail] = useState("");
    const [newCustomerPhone, setNewCustomerPhone] = useState("");
    const [newCustomerPostalCode, setNewCustomerPostalCode] = useState("");
    const [newCustomerTaxRegime, setNewCustomerTaxRegime] = useState("");
    const [newCustomerCfdiUse, setNewCustomerCfdiUse] = useState("");
    const [savingCustomer, setSavingCustomer] = useState(false);

    const isEnough =
        (method === 'cash' ? received >= total
            : method === 'card' ? !!bankInstitutionId
            : method === 'mixed' ? (mixedCashAmount > 0 && mixedCashAmount < total && !!bankInstitutionId)
            : method === 'cortesia' ? (!!cortesiaAuthorized && cortesiaReason.trim().length > 0)
            : false)
        && (!requiresInvoice || !!invoiceCustomerId);

    // Resetear al abrir
    useEffect(() => {
        if (show) {
            setMethod('cash');
            setReceivedStr("");
            setSubmitting(false);
            setRequiresInvoice(false);
            setInvoiceCustomerId("");
            setShowNewCustomerForm(false);
            setNewCustomerName(""); setNewCustomerRfc(""); setNewCustomerEmail(""); setNewCustomerPhone("");
            setNewCustomerPostalCode(""); setNewCustomerTaxRegime(""); setNewCustomerCfdiUse("");
            setCardType('debito');
            setBankInstitutionId("");
            setHasMaster(null);
            setCortesiaAuthorized(null);
            setCortesiaPin("");
            setCortesiaError("");
            setCortesiaReason("");
            getCustomers().then(list => setCustomers(list.filter((c: any) => c.is_default !== 1))).catch(err => console.error(err));
            getCardInstitutions().then(list => {
                setInstitutions(list);
                // "General / Otro" queda primero (ver getCardInstitutions), es el default razonable.
                if (list.length > 0) setBankInstitutionId(list[0].id);
            }).catch(err => console.error(err));
            emit("payment-sync", { isOpen: true, total, method: 'cash', received: 0, change: 0 });
        } else {
            emit("payment-sync", { isOpen: false });
        }
    }, [show, total]);

    // Solo se checa si existe al menos una cuenta master cuando el cajero de verdad
    // intenta usar Cortesía (evita una consulta de más en cada apertura del modal).
    useEffect(() => {
        if (method !== 'cortesia' || hasMaster !== null) return;
        import("../db").then(({ getUsers }) => {
            getUsers().then(list => setHasMaster(list.some((u: any) => Number(u.is_master) === 1)))
                .catch(() => setHasMaster(false));
        });
    }, [method, hasMaster]);

    const handleSaveNewCustomer = async () => {
        if (!newCustomerName.trim()) return notify("El nombre del cliente es requerido.", 'warning');
        setSavingCustomer(true);
        try {
            const id = await createCustomer({
                name: newCustomerName.trim(), rfc: newCustomerRfc.trim(),
                email: newCustomerEmail.trim(), phone: newCustomerPhone.trim(),
                postal_code: newCustomerPostalCode.trim(), tax_regime: newCustomerTaxRegime, cfdi_use: newCustomerCfdiUse
            }, userId);
            const updated = await getCustomers();
            setCustomers(updated.filter((c: any) => c.is_default !== 1));
            setInvoiceCustomerId(id);
            setShowNewCustomerForm(false);
            setNewCustomerName(""); setNewCustomerRfc(""); setNewCustomerEmail(""); setNewCustomerPhone("");
            setNewCustomerPostalCode(""); setNewCustomerTaxRegime(""); setNewCustomerCfdiUse("");
        } catch (e) {
            await notify("No se pudo guardar el cliente: " + e, 'error');
        } finally {
            setSavingCustomer(false);
        }
    };

    // Sincronizar en tiempo real con el Visor de Cliente
    useEffect(() => {
        if (!show) return;
        if (method === 'mixed') {
            emit("payment-sync", { isOpen: true, total, method, cashAmount: mixedCashAmount, cardAmount: mixedCardAmount });
        } else if (method === 'cortesia') {
            emit("payment-sync", { isOpen: true, total, method });
        } else {
            emit("payment-sync", { isOpen: true, total, method, received, change });
        }
    }, [received, change, method, show, total, mixedCashAmount, mixedCardAmount]);

    const confirmPayment = () => {
        if (submitting || !isEnough) return;
        setSubmitting(true);

        let payment: SavePaymentInput;
        if (method === 'cash') {
            payment = { type: 'cash', amount: total, received, change };
        } else if (method === 'card') {
            payment = { type: 'card', amount: total, cardType, bankInstitutionId: Number(bankInstitutionId) };
        } else if (method === 'mixed') {
            payment = {
                type: 'mixed',
                cashAmount: mixedCashAmount, cashReceived: mixedCashAmount, cashChange: 0,
                cardAmount: mixedCardAmount, cardType, bankInstitutionId: Number(bankInstitutionId)
            };
        } else {
            payment = { type: 'cortesia', reason: cortesiaReason.trim(), authorizedByUserId: cortesiaAuthorized!.id };
        }

        const bankName = (method === 'card' || method === 'mixed')
            ? institutions.find(i => i.id === Number(bankInstitutionId))?.name
            : undefined;

        onConfirm({
            payment,
            requiresInvoice,
            invoiceCustomerId: requiresInvoice && invoiceCustomerId ? Number(invoiceCustomerId) : undefined,
            bankName,
            authorizedByName: cortesiaAuthorized?.name
        });
    };

    const handleCortesiaPinDigit = (d: string) => {
        setCortesiaError("");
        if (cortesiaPin.length < 8) setCortesiaPin(prev => prev + d);
    };

    const handleCortesiaPinDelete = () => {
        setCortesiaError("");
        setCortesiaPin(prev => prev.slice(0, -1));
    };

    const authorizeCortesia = async () => {
        if (!cortesiaPin || cortesiaChecking) return;
        setCortesiaChecking(true);
        try {
            const user = await getUserByPin(cortesiaPin);
            if (user && Number(user.is_master) === 1) {
                setCortesiaAuthorized({ id: user.id, name: user.name });
                setCortesiaError("");
            } else {
                setCortesiaError("PIN inválido o sin autorización de cortesía.");
                setCortesiaPin("");
            }
        } catch (e) {
            setCortesiaError("Error verificando el PIN.");
        } finally {
            setCortesiaChecking(false);
        }
    };

    useEffect(() => {
        if (!show) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (method === 'cortesia' && !cortesiaAuthorized) {
                if (/^[0-9]$/.test(e.key)) handleCortesiaPinDigit(e.key);
                else if (e.key === "Backspace") handleCortesiaPinDelete();
                else if (e.key === "Enter") authorizeCortesia();
                return;
            }
            if (e.key === "Enter") {
                confirmPayment();
            } else if (e.key === "Escape") {
                onClose();
            } else if (method === 'cash' || method === 'mixed') {
                if (/^[0-9]$/.test(e.key)) {
                    handleNumberClick(e.key);
                } else if (e.key === ".") {
                    handleNumberClick(".");
                } else if (e.key === "Backspace") {
                    handleDelete();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show, method, receivedStr, isEnough, total, received, change, submitting, cortesiaPin, cortesiaAuthorized, cortesiaReason]);

    if (!show) return null;

    const handleNumberClick = (val: string) => {
        if (receivedStr.includes('.') && val === '.') return;
        setReceivedStr(prev => prev + val);
    };

    const handleDelete = () => {
        setReceivedStr(prev => prev.slice(0, -1));
    };

    const quickAmounts = [20, 50, 100, 200, 500];

    const methodTiles: { key: Method; label: string; icon: React.ReactNode }[] = [
        { key: 'cash', label: 'Efectivo', icon: <Banknote size={28} /> },
        { key: 'card', label: 'Tarjeta', icon: <CreditCard size={28} /> },
        { key: 'mixed', label: 'Mixto', icon: (
            <span style={{ display: 'flex', gap: '2px' }}><Banknote size={22} /><CreditCard size={22} /></span>
        ) },
        { key: 'cortesia', label: 'Cortesía', icon: <Gift size={28} /> },
    ];

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 2000,
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                backgroundColor: 'var(--bg-secondary)', borderRadius: '20px',
                width: '90%', maxWidth: '900px', maxHeight: '96vh', height: '96vh', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                border: '1px solid var(--border-light)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-light)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
                }}>
                    <h2 style={{ fontSize: '1.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        Finalizar Cobro <span style={{ color: 'var(--accent-primary)' }}>${total.toFixed(2)}</span>
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <X size={28} />
                    </button>
                </div>

                <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
                    {/* Left Side: Methods & Summary */}
                    <div style={{ flex: 1, padding: '1.25rem', borderRight: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)', overflowY: 'auto', minHeight: 0 }}>
                        <h3 style={{ marginBottom: '1rem', opacity: 0.7, fontSize: '1rem' }}>Método de Pago</h3>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.6rem', marginBottom: '1.5rem' }}>
                            {methodTiles.map(mt => (
                                <button
                                    key={mt.key}
                                    onClick={() => setMethod(mt.key)}
                                    style={{
                                        padding: '1rem 0.5rem', borderRadius: '14px', border: method === mt.key ? '2px solid var(--accent-primary)' : '1px solid var(--border-light)',
                                        backgroundColor: method === mt.key ? 'rgba(109, 83, 58, 0.05)' : 'white', cursor: 'pointer',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', transition: 'all 0.2s'
                                    }}
                                >
                                    <span style={{ color: method === mt.key ? 'var(--accent-primary)' : '#999' }}>{mt.icon}</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.85rem', color: method === mt.key ? 'var(--text-main)' : '#999' }}>{mt.label}</span>
                                </button>
                            ))}
                        </div>

                        {method === 'cash' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Recibido</div>
                                    <div style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                        ${received.toFixed(2)}
                                    </div>
                                </div>

                                <div style={{
                                    background: change > 0 ? 'rgba(76, 175, 80, 0.1)' : 'var(--bg-secondary)',
                                    padding: '1rem', borderRadius: '16px', border: change > 0 ? '1px solid #4CAF50' : '1px solid var(--border-light)'
                                }}>
                                    <div style={{ fontSize: '0.85rem', color: change > 0 ? '#2E7D32' : 'var(--text-muted)', marginBottom: '0.25rem' }}>Cambio</div>
                                    <div style={{ fontSize: '2rem', fontWeight: 800, color: change > 0 ? '#2E7D32' : 'var(--text-main)' }}>
                                        ${change.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        )}

                        {(method === 'card' || method === 'mixed') && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                                {method === 'mixed' && (
                                    <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '16px', border: '1px solid var(--border-light)', display: 'flex', gap: '1rem' }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Efectivo</div>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>${mixedCashAmount.toFixed(2)}</div>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>Resto en Tarjeta</div>
                                            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-primary)' }}>${mixedCardAmount.toFixed(2)}</div>
                                        </div>
                                    </div>
                                )}

                                {institutions.length === 0 ? (
                                    <p style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>
                                        No hay catálogo de bancos configurado. Ve a Configuración &gt; Ventas &gt; Instituciones Bancarias.
                                    </p>
                                ) : (
                                    <>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Tipo de tarjeta</label>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                {(['debito', 'credito'] as const).map(ct => (
                                                    <button key={ct} onClick={() => setCardType(ct)} style={{
                                                        flex: 1, padding: '0.6rem', borderRadius: '10px', cursor: 'pointer',
                                                        border: cardType === ct ? '2px solid var(--accent-primary)' : '1px solid var(--border-light)',
                                                        backgroundColor: cardType === ct ? 'rgba(109, 83, 58, 0.05)' : 'white', fontWeight: 600
                                                    }}>
                                                        {ct === 'debito' ? 'Débito' : 'Crédito'}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Institución bancaria</label>
                                            <select value={bankInstitutionId} onChange={e => setBankInstitutionId(Number(e.target.value))}
                                                style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'white' }}>
                                                {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                            </select>
                                        </div>
                                    </>
                                )}

                                {method === 'card' && (
                                    <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-muted)' }}>
                                        <p style={{ fontSize: '0.9rem' }}>Desliza o inserta la tarjeta en la terminal bancaria externa.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {method === 'cortesia' && (
                            <div>
                                {hasMaster === false && (
                                    <p style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>
                                        No hay ninguna cuenta Master configurada. Ve a Configuración &gt; Cajeros y marca a un empleado como "Cuenta Master" para poder autorizar cortesías.
                                    </p>
                                )}
                                {hasMaster && !cortesiaAuthorized && (
                                    <div>
                                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                            <Lock size={16} /> Requiere PIN de una cuenta Master
                                        </p>
                                        <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '1rem', justifyContent: 'center' }}>
                                            {Array.from({ length: Math.max(4, cortesiaPin.length) }).map((_, i) => (
                                                <div key={i} style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: i < cortesiaPin.length ? 'var(--text-main)' : 'var(--border-light)' }} />
                                            ))}
                                        </div>
                                        {cortesiaError && <p style={{ color: 'var(--danger)', textAlign: 'center', marginBottom: '0.5rem', fontWeight: 600 }}>{cortesiaError}</p>}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                                                <button key={n} onClick={() => handleCortesiaPinDigit(n.toString())}
                                                    style={{ padding: '0.7rem', fontSize: '1.2rem', fontWeight: 600, borderRadius: '10px', border: '1px solid var(--border-light)', backgroundColor: 'white', cursor: 'pointer' }}>
                                                    {n}
                                                </button>
                                            ))}
                                            <button onClick={handleCortesiaPinDelete} style={{ padding: '0.7rem', borderRadius: '10px', border: '1px solid var(--border-light)', backgroundColor: 'var(--bg-tertiary)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                                <Delete size={20} />
                                            </button>
                                            <button onClick={() => handleCortesiaPinDigit("0")}
                                                style={{ padding: '0.7rem', fontSize: '1.2rem', fontWeight: 600, borderRadius: '10px', border: '1px solid var(--border-light)', backgroundColor: 'white', cursor: 'pointer' }}>
                                                0
                                            </button>
                                            <button onClick={authorizeCortesia} disabled={!cortesiaPin || cortesiaChecking}
                                                style={{ padding: '0.7rem', borderRadius: '10px', border: 'none', backgroundColor: 'var(--accent-primary)', color: 'white', cursor: cortesiaPin ? 'pointer' : 'not-allowed', fontWeight: 700, opacity: cortesiaPin ? 1 : 0.5 }}>
                                                OK
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {cortesiaAuthorized && (
                                    <div>
                                        <div style={{ background: 'rgba(76, 175, 80, 0.1)', border: '1px solid var(--success)', borderRadius: '12px', padding: '0.85rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <CheckCircle2 size={20} color="var(--success)" />
                                            <span style={{ fontWeight: 600 }}>Autorizado por {cortesiaAuthorized.name}</span>
                                        </div>
                                        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Motivo de la cortesía *</label>
                                        <textarea
                                            value={cortesiaReason}
                                            onChange={e => setCortesiaReason(e.target.value)}
                                            placeholder="Ej: Producto dañado, regalo cliente frecuente..."
                                            rows={3}
                                            style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical', fontFamily: 'inherit' }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Factura: opcional, solo si el cliente la pide */}
                        <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontWeight: 600 }}>
                                <input
                                    type="checkbox"
                                    checked={requiresInvoice}
                                    onChange={(e) => { setRequiresInvoice(e.target.checked); if (!e.target.checked) setShowNewCustomerForm(false); }}
                                    style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                                />
                                <FileText size={18} /> Requiere factura
                            </label>

                            {requiresInvoice && (
                                <div style={{ marginTop: '0.85rem' }}>
                                    {!showNewCustomerForm ? (
                                        <>
                                            <select
                                                value={invoiceCustomerId}
                                                onChange={(e) => setInvoiceCustomerId(e.target.value ? Number(e.target.value) : "")}
                                                style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'white', marginBottom: '0.5rem' }}
                                            >
                                                <option value="">-- Selecciona cliente --</option>
                                                {customers.map(c => (
                                                    <option key={c.id} value={c.id}>{c.name}{c.rfc ? ` (${c.rfc})` : ''}</option>
                                                ))}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => setShowNewCustomerForm(true)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.5rem 0.9rem',
                                                    borderRadius: '8px', border: '1px solid var(--accent-primary)', color: 'var(--accent-primary)',
                                                    backgroundColor: 'transparent', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem'
                                                }}
                                            >
                                                <Plus size={14} /> Nuevo cliente
                                            </button>
                                        </>
                                    ) : (
                                        <div style={{ background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                            <input type="text" placeholder="Nombre / Razón social *" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)}
                                                style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                                            <input type="text" placeholder="RFC" value={newCustomerRfc} onChange={e => setNewCustomerRfc(e.target.value)}
                                                style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                                            <input type="email" placeholder="Email (opcional)" value={newCustomerEmail} onChange={e => setNewCustomerEmail(e.target.value)}
                                                style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                                            <input type="text" placeholder="Teléfono (opcional)" value={newCustomerPhone} onChange={e => setNewCustomerPhone(e.target.value)}
                                                style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                                            <input type="text" placeholder="Código Postal Fiscal" value={newCustomerPostalCode} onChange={e => setNewCustomerPostalCode(e.target.value)} maxLength={5}
                                                style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                                            <select value={newCustomerTaxRegime} onChange={e => setNewCustomerTaxRegime(e.target.value)}
                                                style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'white' }}>
                                                <option value="">-- Régimen fiscal --</option>
                                                {REGIMEN_FISCAL_OPTIONS.map(r => <option key={r.code} value={r.code}>{r.code} {r.label}</option>)}
                                            </select>
                                            <select value={newCustomerCfdiUse} onChange={e => setNewCustomerCfdiUse(e.target.value)}
                                                style={{ padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'white' }}>
                                                <option value="">-- Uso del CFDI --</option>
                                                {USO_CFDI_OPTIONS.map(u => <option key={u.code} value={u.code}>{u.code} {u.label}</option>)}
                                            </select>
                                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                                                <button type="button" onClick={() => setShowNewCustomerForm(false)}
                                                    style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)', backgroundColor: 'transparent', cursor: 'pointer', fontWeight: 600 }}>
                                                    Cancelar
                                                </button>
                                                <button type="button" onClick={handleSaveNewCustomer} disabled={savingCustomer}
                                                    style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', border: 'none', backgroundColor: 'var(--accent-primary)', color: 'white', cursor: savingCustomer ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: savingCustomer ? 0.6 : 1 }}>
                                                    {savingCustomer ? "Guardando..." : "Guardar Cliente"}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Side: Numpad */}
                    <div style={{ width: '380px', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-secondary)', minHeight: 0 }}>
                        <div style={{ flex: 1, padding: '1.25rem 1.25rem 0', overflowY: 'auto', minHeight: 0 }}>
                            {(method === 'cash' || method === 'mixed') ? (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.6rem', marginBottom: '1rem' }}>
                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0].map(n => (
                                            <button
                                                key={n}
                                                onClick={() => handleNumberClick(n.toString())}
                                                style={{
                                                    padding: '0.8rem', fontSize: '1.4rem', fontWeight: 700, borderRadius: '12px',
                                                    border: '1px solid var(--border-light)', backgroundColor: 'white', cursor: 'pointer',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                                }}
                                            >
                                                {n}
                                            </button>
                                        ))}
                                        <button
                                            onClick={handleDelete}
                                            style={{
                                                padding: '0.8rem', borderRadius: '12px', border: '1px solid var(--border-light)',
                                                backgroundColor: 'var(--bg-tertiary)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center'
                                            }}
                                        >
                                            <Delete size={24} />
                                        </button>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                                        {method === 'cash' && quickAmounts.map(amt => (
                                            <button
                                                key={amt}
                                                onClick={() => setReceivedStr(prev => (((parseFloat(prev) || 0) + amt)).toString())}
                                                style={{
                                                    aspectRatio: '1', padding: '0.3rem', borderRadius: '12px', border: '1px solid var(--accent-primary)',
                                                    color: 'var(--accent-primary)', fontWeight: 700, backgroundColor: 'transparent', cursor: 'pointer',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.95rem',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                                }}
                                            >
                                                +${amt}
                                            </button>
                                        ))}
                                        {method === 'cash' && (
                                            <button
                                                onClick={() => setReceivedStr(total.toString())}
                                                style={{
                                                    gridColumn: '1 / -1', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--success)',
                                                    color: 'var(--success)', fontWeight: 700, backgroundColor: 'transparent', cursor: 'pointer'
                                                }}
                                            >
                                                Pago Exacto
                                            </button>
                                        )}
                                        {method === 'mixed' && (
                                            <p style={{ gridColumn: '1 / -1', fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
                                                Captura solo lo que se paga en efectivo (menor al total) — el resto se calcula solo para la tarjeta.
                                            </p>
                                        )}
                                    </div>
                                </>
                            ) : method === 'card' ? (
                                <div style={{ height: '70%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <CreditCard size={100} color="var(--success)" style={{ opacity: 0.2 }} />
                                </div>
                            ) : (
                                <div style={{ height: '70%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <Gift size={100} color="var(--accent-primary)" style={{ opacity: 0.2 }} />
                                </div>
                            )}
                        </div>

                        {/* Botón fijo: siempre visible sin necesidad de scroll */}
                        <div style={{ padding: '1rem 1.25rem', flexShrink: 0 }}>
                            <button
                                disabled={!isEnough || submitting}
                                onClick={confirmPayment}
                                style={{
                                    width: '100%', padding: '1.1rem', borderRadius: '16px', fontSize: '1.3rem', fontWeight: 800,
                                    border: 'none', backgroundColor: (isEnough && !submitting) ? 'var(--accent-primary)' : '#ccc',
                                    color: 'white', cursor: (isEnough && !submitting) ? 'pointer' : 'not-allowed',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
                                    boxShadow: (isEnough && !submitting) ? '0 10px 20px rgba(109, 83, 58, 0.3)' : 'none',
                                    transition: 'all 0.2s'
                                }}
                            >
                                {submitting ? "PROCESANDO..." : "CONFIRMAR COBRO"}
                                <ChevronRight size={24} />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
