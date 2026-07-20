export const DEFAULT_TICKET_WIDTH = 32;

export function getTicketWidth(settings: Record<string, string>): number {
    const w = parseInt(settings.ticket_width || "", 10);
    return (!isNaN(w) && w >= 24 && w <= 64) ? w : DEFAULT_TICKET_WIDTH;
}

const FONT_STYLE_CODES: Record<string, string> = {
    normal: "\x1B\x21\x00",
    condensed: "\x1B\x21\x01",
    bold: "\x1B\x21\x08",
};

export function getFontStyle(settings: Record<string, string>): string {
    return FONT_STYLE_CODES[settings.printer_font_style || "normal"] ? (settings.printer_font_style || "normal") : "normal";
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
        settings.biz_logo || "🍦",
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
        centerLine(`SISTEMA: ${settings.ticket_website || ""}`, width),
        divider(width, "*"),
    ];
    return lines.join("\n");
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
}

export function buildSaleTicketText(p: SaleTicketParams): string {
    const { settings, width } = p;
    const amountWidth = 9;
    const nameWidth = Math.max(4, width - 1 - 1 - amountWidth);

    const lines: string[] = [
        buildBusinessHeader(settings, width),
        `TEL: ${settings.biz_phone || ""}`,
        "",
        p.folioLabel,
        `CAJERO: ${(p.cashierName || "").toUpperCase()}`,
    ];
    if (p.dateStr) lines.push(`FECHA: ${p.dateStr}`);
    lines.push(divider(width));
    lines.push(`#${" ".repeat(Math.max(1, nameWidth - 10))}DESCRIPCION${"TOTAL".padStart(amountWidth)}`);
    lines.push(divider(width));
    lines.push(p.items.map(it => itemLine(it.quantity, it.name, it.lineTotal, width)).join("\n"));
    lines.push("");
    lines.push(labelValueLine("DESCUENTO:", `$${(0).toFixed(2)}`, width));
    lines.push(labelValueLine("SUBTOTAL:", `$${p.subtotal.toFixed(2)}`, width));
    lines.push(labelValueLine("IMPUESTOS:", `$${p.tax.toFixed(2)}`, width));
    lines.push(labelValueLine("TOTAL:", `$${p.total.toFixed(2)}`, width));
    lines.push(labelValueLine("PAGADO:", `$${p.paid.toFixed(2)}`, width));
    lines.push(labelValueLine("CAMBIO:", `$${p.change.toFixed(2)}`, width));
    lines.push(buildFooter(settings, width));

    return lines.join("\n").trim();
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
    expectedAmount: number;
    actualAmount: number;
    difference: number;
}

export function buildCorteTicketText(p: CorteTicketParams): string {
    const { width } = p;
    const lines: string[] = [
        divider(width, "="),
        centerLine("CORTE DE CAJA (X/Z)", width),
        divider(width, "="),
    ];
    if (p.dateStr) lines.push(`Fecha: ${p.dateStr}`);
    if (p.openedAtStr) lines.push(`Apertura: ${p.openedAtStr}`);
    if (p.closedAtStr) lines.push(`Cierre:   ${p.closedAtStr}`);
    lines.push(`Turno ID: #${p.shiftId}`);
    lines.push(`Cajero: ${p.cashierName || "Desconocido"}`);

    if (p.breakdownText !== undefined) {
        lines.push(divider(width));
        lines.push("DESGLOSE FÍSICO:");
        lines.push(p.breakdownText || "Sin efectivo reportado");
    }

    lines.push(divider(width));
    lines.push(labelValueLine("Fondo Inicial:", `$${p.initialAmount.toFixed(2)}`, width));
    if (p.totalSales !== undefined) {
        lines.push(labelValueLine("Ventas Totales:", `$${p.totalSales.toFixed(2)}`, width));
        lines.push(divider(width));
    }
    lines.push(labelValueLine("Monto Esperado:", `$${p.expectedAmount.toFixed(2)}`, width));
    lines.push(labelValueLine("Monto Físico:", `$${p.actualAmount.toFixed(2)}`, width));
    lines.push(labelValueLine("Diferencia:", `$${p.difference.toFixed(2)}`, width));
    lines.push(divider(width, "="));

    return lines.join("\n").trim();
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
    });
}
