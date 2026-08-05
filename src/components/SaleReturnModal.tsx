import { useState, useEffect } from "react";
import { X, Minus, Plus, Banknote, CreditCard, ChevronRight, Undo2 } from "lucide-react";
import { getCardInstitutions, getSaleReturnedQuantities, createSaleReturn } from "../db";
import { notify } from "../lib/dialogs";
import { buildReturnTicketText, getTicketWidth, withPrinterStyle, getLogoPrintOptions } from "../lib/ticketFormat";

type RefundMethod = 'cash' | 'card' | 'none';

interface ReturnLine {
    saleItemId: number;
    productId: number;
    name: string;
    price: number;
    maxReturnable: number;
    quantity: number;
}

interface SaleReturnModalProps {
    show: boolean;
    sale: any;
    saleItems: any[];
    currentUser: any;
    currentShift: any;
    isPrinterConfigured: boolean;
    printerPort?: string;
    appSettings: Record<string, string>;
    onClose: () => void;
    onSuccess: () => void;
    onPreviewTicket: (ticket: string) => void;
}

export default function SaleReturnModal({
    show, sale, saleItems, currentUser, currentShift, isPrinterConfigured, printerPort, appSettings,
    onClose, onSuccess, onPreviewTicket
}: SaleReturnModalProps) {
    const [lines, setLines] = useState<ReturnLine[]>([]);
    const [loadingLines, setLoadingLines] = useState(true);
    const [reason, setReason] = useState("");
    const isCourtesy = sale?.payment_method === 'cortesia';
    const [refundMethod, setRefundMethod] = useState<RefundMethod>(isCourtesy ? 'none' : 'cash');
    const [cardType, setCardType] = useState<'debito' | 'credito'>('debito');
    const [institutions, setInstitutions] = useState<any[]>([]);
    const [bankInstitutionId, setBankInstitutionId] = useState<number | "">("");
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!show || !sale) return;
        setReason("");
        setRefundMethod(isCourtesy ? 'none' : 'cash');
        setCardType('debito');
        setBankInstitutionId("");
        setSubmitting(false);
        setLoadingLines(true);
        (async () => {
            try {
                const returnedMap = await getSaleReturnedQuantities(sale.id);
                const built: ReturnLine[] = (saleItems || []).map((it: any) => {
                    const alreadyReturned = returnedMap[Number(it.sale_item_id)] || 0;
                    return {
                        saleItemId: Number(it.sale_item_id),
                        productId: Number(it.product_id),
                        name: it.product_name,
                        price: Number(it.price),
                        maxReturnable: Math.max(0, Number(it.quantity) - alreadyReturned),
                        quantity: 0,
                    };
                });
                setLines(built);
            } catch (err) {
                console.error(err);
                await notify("No se pudo cargar el detalle de la venta para la devolución.", 'error');
            } finally {
                setLoadingLines(false);
            }
        })();
        if (!isCourtesy) {
            getCardInstitutions().then(list => {
                setInstitutions(list);
                if (list.length > 0) setBankInstitutionId(list[0].id);
            }).catch(err => console.error(err));
        }
    }, [show, sale?.id]);

    if (!show || !sale) return null;

    const updateQty = (saleItemId: number, delta: number) => {
        setLines(prev => prev.map(l => l.saleItemId === saleItemId
            ? { ...l, quantity: Math.max(0, Math.min(l.maxReturnable, l.quantity + delta)) }
            : l));
    };

    const totalToReturn = lines.reduce((sum, l) => sum + l.quantity * l.price, 0);
    const hasLines = lines.some(l => l.quantity > 0);
    const canConfirm = hasLines && reason.trim().length > 0
        && (isCourtesy || refundMethod === 'cash' || (refundMethod === 'card' && !!bankInstitutionId))
        && !submitting;

    const handleConfirm = async () => {
        if (!canConfirm) return;
        setSubmitting(true);
        try {
            const folio = await createSaleReturn({
                saleId: sale.id,
                lines: lines.filter(l => l.quantity > 0).map(l => ({ saleItemId: l.saleItemId, productId: l.productId, quantity: l.quantity })),
                reason: reason.trim(),
                refundMethod,
                cardType: refundMethod === 'card' ? cardType : undefined,
                bankInstitutionId: refundMethod === 'card' ? Number(bankInstitutionId) : undefined,
                shiftId: currentShift?.id,
            }, currentUser?.id);

            const bankName = refundMethod === 'card' ? institutions.find(i => i.id === Number(bankInstitutionId))?.name : undefined;
            const buildTicket = (suffix: string) => buildReturnTicketText({
                settings: appSettings,
                width: getTicketWidth(appSettings),
                folioLabel: `FOLIO DEVOLUCIÓN: ${folio}${suffix}`,
                originalSaleFolioLabel: `VENTA ORIGINAL: #${String(sale.id).padStart(6, '0')}`,
                cashierName: currentUser?.name || '',
                dateStr: new Date().toLocaleString(),
                items: lines.filter(l => l.quantity > 0).map(l => ({ quantity: l.quantity, name: l.name, lineTotal: l.quantity * l.price })),
                reason: reason.trim(),
                refundMethod,
                refundAmount: refundMethod === 'none' ? 0 : totalToReturn,
                cardTypeLabel: cardType === 'credito' ? 'CRÉDITO' : 'DÉBITO',
                bankName,
            });

            if (isPrinterConfigured) {
                const { invoke } = await import("@tauri-apps/api/core");
                const logoOpts = getLogoPrintOptions(appSettings);
                // Se imprimen dos tantos: el original (para el cliente) y su duplicado (para el
                // archivo de la tienda) — igual que un ticket de venta con su copia, pero ambos
                // salen en el momento en vez de tener que reimprimir después desde Kardex.
                await invoke("print_receipt", {
                    portName: printerPort, receiptData: withPrinterStyle(buildTicket(""), appSettings),
                    openDrawer: refundMethod === 'cash', logoDataUri: logoOpts.logoDataUri, logoWidthDots: logoOpts.logoWidthDots
                });
                await invoke("print_receipt", {
                    portName: printerPort, receiptData: withPrinterStyle(buildTicket(" (DUPLICADO)"), appSettings),
                    logoDataUri: logoOpts.logoDataUri, logoWidthDots: logoOpts.logoWidthDots
                });
            } else {
                onPreviewTicket(buildTicket(""));
            }

            await notify(`Devolución registrada. Folio ${folio}.`, 'info');
            onSuccess();
            onClose();
        } catch (err: any) {
            await notify("No se pudo registrar la devolución: " + (err.message || err), 'error');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 2100,
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                backgroundColor: 'var(--bg-secondary)', borderRadius: '20px',
                width: '90%', maxWidth: '640px', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                border: '1px solid var(--border-light)'
            }}>
                <div style={{
                    padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-light)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
                }}>
                    <h2 style={{ fontSize: '1.3rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                        <Undo2 size={22} /> Devolución — Venta #{String(sale.id).padStart(6, '0')}
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <X size={26} />
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
                    {loadingLines ? (
                        <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>Cargando productos de la venta...</p>
                    ) : (
                        <>
                            <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', opacity: 0.7 }}>Productos a devolver</h3>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '1.5rem' }}>
                                {lines.map(line => (
                                    <div key={line.saleItemId} style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
                                        padding: '0.75rem 1rem', borderRadius: '12px', border: '1px solid var(--border-light)',
                                        backgroundColor: line.maxReturnable === 0 ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                                        opacity: line.maxReturnable === 0 ? 0.55 : 1
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>{line.name}</div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {line.maxReturnable === 0
                                                    ? "Completamente devuelto"
                                                    : `$${line.price.toFixed(2)} c/u · disponible para devolver: ${line.maxReturnable}`}
                                            </div>
                                        </div>
                                        {line.maxReturnable > 0 && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                                <button
                                                    onClick={() => updateQty(line.saleItemId, -1)}
                                                    disabled={line.quantity === 0}
                                                    style={{
                                                        width: '38px', height: '38px', borderRadius: '10px', border: '1px solid var(--border-light)',
                                                        backgroundColor: 'white', cursor: line.quantity === 0 ? 'not-allowed' : 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: line.quantity === 0 ? 0.4 : 1
                                                    }}
                                                >
                                                    <Minus size={16} />
                                                </button>
                                                <span style={{ width: '28px', textAlign: 'center', fontWeight: 700, fontSize: '1.1rem' }}>{line.quantity}</span>
                                                <button
                                                    onClick={() => updateQty(line.saleItemId, 1)}
                                                    disabled={line.quantity >= line.maxReturnable}
                                                    style={{
                                                        width: '38px', height: '38px', borderRadius: '10px', border: '1px solid var(--border-light)',
                                                        backgroundColor: 'white', cursor: line.quantity >= line.maxReturnable ? 'not-allowed' : 'pointer',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: line.quantity >= line.maxReturnable ? 0.4 : 1
                                                    }}
                                                >
                                                    <Plus size={16} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.3rem' }}>Motivo de la devolución *</label>
                            <textarea
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                placeholder="Ej: Producto en mal estado, cliente se equivocó de pieza..."
                                rows={2}
                                style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--border-light)', resize: 'vertical', fontFamily: 'inherit', marginBottom: '1.5rem' }}
                            />

                            {isCourtesy ? (
                                <div style={{ background: 'rgba(109, 83, 58, 0.08)', border: '1px solid var(--border-light)', borderRadius: '12px', padding: '0.9rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                    Esta venta fue de Cortesía: no se cobró nada, así que la devolución solo regresa el stock — no genera reembolso.
                                </div>
                            ) : (
                                <>
                                    <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', opacity: 0.7 }}>Método de reembolso</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginBottom: '1rem' }}>
                                        <button
                                            onClick={() => setRefundMethod('cash')}
                                            style={{
                                                padding: '0.9rem', borderRadius: '12px', border: refundMethod === 'cash' ? '2px solid var(--accent-primary)' : '1px solid var(--border-light)',
                                                backgroundColor: refundMethod === 'cash' ? 'rgba(109, 83, 58, 0.05)' : 'white', cursor: 'pointer',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem'
                                            }}
                                        >
                                            <Banknote size={24} color={refundMethod === 'cash' ? 'var(--accent-primary)' : '#999'} />
                                            <span style={{ fontWeight: 600, color: refundMethod === 'cash' ? 'var(--text-main)' : '#999' }}>Efectivo</span>
                                        </button>
                                        <button
                                            onClick={() => setRefundMethod('card')}
                                            style={{
                                                padding: '0.9rem', borderRadius: '12px', border: refundMethod === 'card' ? '2px solid var(--accent-primary)' : '1px solid var(--border-light)',
                                                backgroundColor: refundMethod === 'card' ? 'rgba(109, 83, 58, 0.05)' : 'white', cursor: 'pointer',
                                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem'
                                            }}
                                        >
                                            <CreditCard size={24} color={refundMethod === 'card' ? 'var(--accent-primary)' : '#999'} />
                                            <span style={{ fontWeight: 600, color: refundMethod === 'card' ? 'var(--text-main)' : '#999' }}>Tarjeta</span>
                                        </button>
                                    </div>

                                    {refundMethod === 'card' && (
                                        institutions.length === 0 ? (
                                            <p style={{ color: 'var(--danger)', fontSize: '0.9rem' }}>
                                                No hay catálogo de bancos configurado. Ve a Configuración &gt; Ventas &gt; Instituciones Bancarias.
                                            </p>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
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
                                                <select value={bankInstitutionId} onChange={e => setBankInstitutionId(Number(e.target.value))}
                                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--border-light)', backgroundColor: 'white' }}>
                                                    {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                                                </select>
                                            </div>
                                        )
                                    )}
                                </>
                            )}
                        </>
                    )}
                </div>

                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', flexShrink: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                        <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>
                            {isCourtesy ? 'Solo regresa stock' : 'Total a reembolsar'}
                        </span>
                        <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                            {isCourtesy ? '—' : `$${totalToReturn.toFixed(2)}`}
                        </span>
                    </div>
                    <button
                        disabled={!canConfirm}
                        onClick={handleConfirm}
                        style={{
                            width: '100%', padding: '1rem', borderRadius: '14px', fontSize: '1.1rem', fontWeight: 800,
                            border: 'none', backgroundColor: canConfirm ? 'var(--accent-primary)' : '#ccc',
                            color: 'white', cursor: canConfirm ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem'
                        }}
                    >
                        {submitting ? "PROCESANDO..." : "CONFIRMAR DEVOLUCIÓN"}
                        <ChevronRight size={22} />
                    </button>
                </div>
            </div>
        </div>
    );
}
