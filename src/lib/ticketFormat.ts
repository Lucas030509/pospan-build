export const DEFAULT_TICKET_WIDTH = 32;

export function getTicketWidth(settings: Record<string, string>): number {
    const w = parseInt(settings.ticket_width || "", 10);
    return (!isNaN(w) && w >= 24 && w <= 64) ? w : DEFAULT_TICKET_WIDTH;
}

export function getTicketLeftMargin(settings: Record<string, string>): number {
    const m = parseInt(settings.ticket_left_margin || "", 10);
    return (!isNaN(m) && m >= 0 && m <= 20) ? m : 0;
}

export function getTicketBottomSpace(settings: Record<string, string>): number {
    const s = parseInt(settings.ticket_bottom_space || "", 10);
    return (!isNaN(s) && s >= 0 && s <= 15) ? s : 5; // Default 5 lines for cutter
}

const FONT_STYLE_CODES: Record<string, string> = {
    normal: "\x1B\x21\x00",
    condensed: "\x1B\x21\x01",
    bold: "\x1B\x21\x08",
};

export function getFontStyle(settings: Record<string, string>): string {
    return FONT_STYLE_CODES[settings.printer_font_style || "normal"] ? (settings.printer_font_style || "normal") : "normal";
}

// Opciones para imprimir el logo del negocio como bitmap (GS v 0, "Print raster bit image"),
// mandando la imagen ya subida en Configuración > General como parte de cada ticket. No
// depende de nada grabado en la impresora ni del driver de Windows — se manda fresca cada vez.
export interface LogoPrintOptions {
    logoDataUri: string;
    logoWidthDots: number;
}

export function getLogoPrintOptions(settings: Record<string, string>): LogoPrintOptions {
    const enabled = settings.printer_logo_enabled === "true";
    const widthDots = parseInt(settings.printer_logo_width_dots || "", 10);
    return {
        logoDataUri: (enabled && settings.biz_logo_img) ? settings.biz_logo_img : "",
        logoWidthDots: (!isNaN(widthDots) && widthDots >= 64 && widthDots <= 576) ? widthDots : 300,
    };
}

// Antepone el comando ESC/POS de estilo de fuente al texto del ticket (el backend en Rust
// escribe el string tal cual como bytes, así que el control de estilo viaja embebido aquí).
export function withPrinterStyle(text: string, settings: Record<string, string>): string {
    const code = FONT_STYLE_CODES[settings.printer_font_style || "normal"] || FONT_STYLE_CODES.normal;
    return code + text;
}

export function divider(width: number, char: string = "-"): string {
    return char.repeat(width);
}

export function centerLine(text: string, width: number): string {
    const t = text || "";
    if (t.length >= width) return t;
    const padLeft = Math.floor((width - t.length) / 2);
    return " ".repeat(padLeft) + t;
}

// "Etiqueta:            $ 123.45" — alinea la etiqueta a la izquierda y el valor a la derecha.
export function labelValueLine(label: string, value: string, width: number): string {
    const space = Math.max(1, width - label.length - value.length);
    return label + " ".repeat(space) + value;
}

// "2  Concha de Vainilla     $24.00" — columna de cantidad+nombre a la izquierda, total a la derecha.
export function itemLine(qty: number, name: string, amount: number, width: number): string {
    const amountStr = `$${amount.toFixed(2)}`;
    const amountWidth = Math.max(8, amountStr.length);
    const qtyStr = String(qty);
    const nameWidth = Math.max(4, width - qtyStr.length - 1 - amountWidth);
    return `${qtyStr} ${name.padEnd(nameWidth).substring(0, nameWidth)}${amountStr.padStart(amountWidth)}`;
}

export function buildBusinessHeader(settings: Record<string, string>, width: number): string {
    const lines = [
        (settings.biz_name || "").toUpperCase(),
        (settings.biz_subtitle || "").toUpperCase(),
        settings.biz_address_1 || "",
        settings.biz_address_2 || "",
        settings.biz_rfc || "",
    ].filter(l => l.trim() !== "");
    return lines.map(l => centerLine(l, width)).join("\n");
}

export function buildFooter(settings: Record<string, string>, width: number): string {
    const lines = [
        "",
        settings.ticket_legal || "",
        "",
        centerLine(settings.ticket_footer_msg || "", width),
        centerLine(settings.ticket_website || "", width),
        divider(width, "*"),
    ];
    return lines.join("\n");
}

// Comando ESC/POS para imprimir un código de barras CODE39 (GS k, "Function B": longitud
// explícita en vez de terminador NUL). CODE39 acepta dígitos sin codificación especial, y el
// folio de venta siempre es numérico, así que no hace falta sanitizar más que filtrar dígitos.
// Antes el código de barras solo existía en la vista previa en pantalla (react-barcode, SVG),
// nunca llegaba a la impresora física.
function buildBarcodeCommand(value: string | undefined): string {
    const digits = (value || "").replace(/[^0-9]/g, "");
    if (!digits) return "";
    const height = String.fromCharCode(50);   // GS h — alto en puntos
    const width = String.fromCharCode(2);     // GS w — ancho de módulo
    const hriBelow = String.fromCharCode(2);  // GS H — texto legible debajo del código
    const code39 = String.fromCharCode(69);   // GS k m — 69 = CODE39 (Function B)
    const len = String.fromCharCode(digits.length);
    return (
        "\x1B\x61\x01" + // ESC a 1 — centrar
        "\x1D\x68" + height +
        "\x1D\x77" + width +
        "\x1D\x48" + hriBelow +
        "\x1D\x6B" + code39 + len + digits +
        "\x1B\x61\x00" // ESC a 0 — regresar a alineación izquierda
    );
}

export interface SaleTicketItem {
    quantity: number;
    name: string;
    lineTotal: number;
}

export interface SaleTicketParams {
    settings: Record<string, string>;
    width: number;
    folioLabel: string;
    cashierName: string;
    dateStr?: string;
    items: SaleTicketItem[];
    subtotal: number;
    tax: number;
    total: number;
    paid: number;
    change: number;
    // Cobro mixto: reemplaza el bloque PAGADO/CAMBIO por una línea por método usado.
    paymentLines?: { label: string; amount: number }[];
    // Pago Cortesía: reemplaza el bloque PAGADO/CAMBIO por método + motivo + quién autorizó.
    courtesy?: { reason: string; authorizedBy: string };
    // Folio de venta a codificar como código de barras físico al final del ticket.
    barcodeValue?: string;
}

export function buildSaleTicketText(p: SaleTicketParams): string {
    const { settings } = p;
    const margin = getTicketLeftMargin(settings);
    const effectiveWidth = Math.max(24, p.width - margin);
    const amountWidth = 9;
    const nameWidth = Math.max(4, effectiveWidth - 1 - 1 - amountWidth);

    const lines: string[] = [
        buildBusinessHeader(settings, effectiveWidth),
        `TEL: ${settings.biz_phone || ""}`,
        "",
        p.folioLabel,
        `CAJERO: ${(p.cashierName || "").toUpperCase()}`,
    ];
    if (p.dateStr) lines.push(`FECHA: ${p.dateStr}`);
    lines.push(divider(effectiveWidth));
    lines.push(`#${" ".repeat(Math.max(1, nameWidth - 10))}DESCRIPCION${"TOTAL".padStart(amountWidth)}`);
    lines.push(divider(effectiveWidth));
    lines.push(p.items.map(it => itemLine(it.quantity, it.name, it.lineTotal, effectiveWidth)).join("\n"));
    lines.push("");
    lines.push(labelValueLine("DESCUENTO:", `$${(0).toFixed(2)}`, effectiveWidth));
    lines.push(labelValueLine("SUBTOTAL:", `$${p.subtotal.toFixed(2)}`, effectiveWidth));
    // Con IVA desactivado (Configuración > General) tax llega en 0 — se omite la línea en vez
    // de imprimir "IMPUESTOS: $0.00", que se leería como un error de captura.
    if (p.tax !== 0) {
        lines.push(labelValueLine("IMPUESTOS:", `$${p.tax.toFixed(2)}`, effectiveWidth));
    }
    lines.push(labelValueLine("TOTAL:", `$${p.total.toFixed(2)}`, effectiveWidth));

    if (p.courtesy) {
        lines.push(divider(effectiveWidth));
        lines.push("MÉTODO: PAGO CORTESÍA");
        lines.push(`MOTIVO: ${p.courtesy.reason}`);
        lines.push(`AUTORIZÓ: ${(p.courtesy.authorizedBy || "").toUpperCase()}`);
    } else if (p.paymentLines && p.paymentLines.length > 0) {
        for (const pl of p.paymentLines) {
            lines.push(labelValueLine(`${pl.label}:`, `$${pl.amount.toFixed(2)}`, effectiveWidth));
        }
        lines.push(labelValueLine("CAMBIO:", `$${p.change.toFixed(2)}`, effectiveWidth));
    } else {
        lines.push(labelValueLine("PAGADO:", `$${p.paid.toFixed(2)}`, effectiveWidth));
        lines.push(labelValueLine("CAMBIO:", `$${p.change.toFixed(2)}`, effectiveWidth));
    }

    lines.push(buildFooter(settings, effectiveWidth));

    const marginStr = " ".repeat(margin);
    let result = lines.map(line => marginStr + line).join("\n").trimEnd();

    // El código de barras va sin el margen izquierdo (son bytes de comando, no texto) — se
    // centra por sí mismo con ESC a 1.
    const barcodeCmd = buildBarcodeCommand(p.barcodeValue);
    if (barcodeCmd) {
        result += "\n" + barcodeCmd;
    }

    // Add bottom spacing for the cutter
    const bottomSpace = getTicketBottomSpace(settings);
    if (bottomSpace > 0) {
        result += "\n".repeat(bottomSpace);
    }
    
    return result;
}

export interface CorteTicketParams {
    width: number;
    shiftId: number | string;
    cashierName: string;
    dateStr?: string;
    openedAtStr?: string;
    closedAtStr?: string;
    breakdownText?: string;
    initialAmount: number;
    totalSales?: number;
    // Desglose informativo por método (no afecta "Monto Esperado", que es solo efectivo).
    cardDebito?: number;
    cardCredito?: number;
    cortesiaTotal?: number;
    cortesiaCount?: number;
    // Devoluciones procesadas en el turno — el efectivo ya está restado de expectedAmount,
    // estas líneas son solo informativas.
    returnsCash?: number;
    returnsCardDebito?: number;
    returnsCardCredito?: number;
    returnsCount?: number;
    expectedAmount: number;
    actualAmount: number;
    difference: number;
    settings?: Record<string, string>;
}

export function buildCorteTicketText(p: CorteTicketParams): string {
    const margin = p.settings ? getTicketLeftMargin(p.settings) : 0;
    const effectiveWidth = Math.max(24, p.width - margin);
    const lines: string[] = [
        divider(effectiveWidth, "="),
        centerLine("CORTE DE CAJA (X/Z)", effectiveWidth),
        divider(effectiveWidth, "="),
    ];
    if (p.dateStr) lines.push(`Fecha: ${p.dateStr}`);
    if (p.openedAtStr) lines.push(`Apertura: ${p.openedAtStr}`);
    if (p.closedAtStr) lines.push(`Cierre:   ${p.closedAtStr}`);
    lines.push(`Turno ID: #${p.shiftId}`);
    lines.push(`Cajero: ${p.cashierName || "Desconocido"}`);

    if (p.breakdownText !== undefined) {
        lines.push(divider(effectiveWidth));
        lines.push("DESGLOSE FÍSICO:");
        lines.push(p.breakdownText || "Sin efectivo reportado");
    }

    lines.push(divider(effectiveWidth));
    lines.push(labelValueLine("Fondo Inicial:", `$${p.initialAmount.toFixed(2)}`, effectiveWidth));
    if (p.totalSales !== undefined) {
        lines.push(labelValueLine("Ventas Totales:", `$${p.totalSales.toFixed(2)}`, effectiveWidth));
    }
    const hasBreakdown = p.cardDebito !== undefined || p.cardCredito !== undefined || p.cortesiaTotal !== undefined
        || p.returnsCash !== undefined || p.returnsCardDebito !== undefined || p.returnsCardCredito !== undefined;
    if (hasBreakdown) {
        if (p.cardDebito !== undefined) lines.push(labelValueLine("  Tarjeta Débito:", `$${p.cardDebito.toFixed(2)}`, effectiveWidth));
        if (p.cardCredito !== undefined) lines.push(labelValueLine("  Tarjeta Crédito:", `$${p.cardCredito.toFixed(2)}`, effectiveWidth));
        if (p.cortesiaTotal !== undefined) lines.push(labelValueLine(`  Cortesías (${p.cortesiaCount || 0}):`, `$${p.cortesiaTotal.toFixed(2)}`, effectiveWidth));
        if (p.returnsCash) lines.push(labelValueLine("  Devol. Efectivo:", `-$${p.returnsCash.toFixed(2)}`, effectiveWidth));
        if (p.returnsCardDebito || p.returnsCardCredito) lines.push(labelValueLine(`  Devol. Tarjeta (${p.returnsCount || 0}):`, `$${((p.returnsCardDebito || 0) + (p.returnsCardCredito || 0)).toFixed(2)}`, effectiveWidth));
    }
    if (p.totalSales !== undefined || hasBreakdown) {
        lines.push(divider(effectiveWidth));
    }
    lines.push(labelValueLine("Monto Esperado:", `$${p.expectedAmount.toFixed(2)}`, effectiveWidth));
    lines.push(labelValueLine("Monto Físico:", `$${p.actualAmount.toFixed(2)}`, effectiveWidth));
    lines.push(labelValueLine("Diferencia:", `$${p.difference.toFixed(2)}`, effectiveWidth));
    lines.push(divider(effectiveWidth, "="));

    const marginStr = " ".repeat(margin);
    let result = lines.map(line => marginStr + line).join("\n").trimEnd();

    // Add bottom spacing for the cutter
    const bottomSpace = p.settings ? getTicketBottomSpace(p.settings) : 5;
    if (bottomSpace > 0) {
        result += "\n".repeat(bottomSpace);
    }
    
    return result;
}

export interface ReturnTicketItem {
    quantity: number;
    name: string;
    lineTotal: number;
}

export interface ReturnTicketParams {
    settings: Record<string, string>;
    width: number;
    folioLabel: string;
    originalSaleFolioLabel: string;
    cashierName: string;
    dateStr?: string;
    items: ReturnTicketItem[];
    reason: string;
    refundMethod: 'cash' | 'card' | 'none';
    refundAmount: number;
    cardTypeLabel?: string;
    bankName?: string;
}

export function buildReturnTicketText(p: ReturnTicketParams): string {
    const { settings } = p;
    const margin = getTicketLeftMargin(settings);
    const effectiveWidth = Math.max(24, p.width - margin);

    const lines: string[] = [
        buildBusinessHeader(settings, effectiveWidth),
        "",
        centerLine("DEVOLUCIÓN DE VENTA", effectiveWidth),
        "",
        p.folioLabel,
        p.originalSaleFolioLabel,
        `CAJERO: ${(p.cashierName || "").toUpperCase()}`,
    ];
    if (p.dateStr) lines.push(`FECHA: ${p.dateStr}`);
    lines.push(divider(effectiveWidth));
    lines.push(p.items.map(it => itemLine(it.quantity, it.name, it.lineTotal, effectiveWidth)).join("\n"));
    lines.push(divider(effectiveWidth));
    lines.push(`MOTIVO: ${p.reason}`);

    if (p.refundMethod === 'none') {
        lines.push("SIN REEMBOLSO (VENTA CORTESÍA)");
    } else if (p.refundMethod === 'cash') {
        lines.push(labelValueLine("REEMBOLSO EFECTIVO:", `$${p.refundAmount.toFixed(2)}`, effectiveWidth));
    } else {
        lines.push(`REEMBOLSO TARJETA ${(p.cardTypeLabel || "").toUpperCase()} (${(p.bankName || "").toUpperCase()}):`);
        lines.push(labelValueLine("", `$${p.refundAmount.toFixed(2)}`, effectiveWidth));
    }

    lines.push(buildFooter(settings, effectiveWidth));

    const marginStr = " ".repeat(margin);
    let result = lines.map(line => marginStr + line).join("\n").trimEnd();

    const bottomSpace = getTicketBottomSpace(settings);
    if (bottomSpace > 0) {
        result += "\n".repeat(bottomSpace);
    }

    return result;
}

export function buildSampleTicketText(settings: Record<string, string>, width: number): string {
    return buildSaleTicketText({
        settings,
        width,
        folioLabel: "FOLIO VENTA: 000000 (PRUEBA)",
        cashierName: "Cajero de Prueba",
        dateStr: new Date().toLocaleString(),
        items: [
            { quantity: 2, name: "Concha de Vainilla", lineTotal: 24.00 },
            { quantity: 1, name: "Bolillo", lineTotal: 2.50 },
            { quantity: 1, name: "Café Americano", lineTotal: 25.00 },
        ],
        subtotal: 43.53,
        tax: 7.97,
        total: 51.50,
        paid: 60.00,
        change: 8.50,
        barcodeValue: "000000",
    });
}
