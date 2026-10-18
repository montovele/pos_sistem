const ESC = 0x1b;
const GS = 0x1d;

const text = (value = '') => Buffer.from(String(value), 'ascii');
const command = (...bytes) => Buffer.from(bytes);

export const escpos = {
  initialize: () => command(ESC, 0x40),
  alignCenter: () => command(ESC, 0x61, 0x01),
  alignLeft: () => command(ESC, 0x61, 0x00),
  bold: (enabled) => command(ESC, 0x45, enabled ? 0x01 : 0x00),
  cut: () => command(GS, 0x56, 0x00),
  drawerPulse: () => command(ESC, 0x70, 0x00, 0x19, 0xfa),
  feed: (lines = 1) => command(ESC, 0x64, Math.max(0, Math.min(255, Number(lines) || 0))),
  line: (value = '') => Buffer.concat([text(value), Buffer.from('\n')]),
  text
};

const fit = (value, width) => String(value ?? '').slice(0, width);

const row = (left, right, width) => {
  const leftText = fit(left, Math.max(1, width - String(right).length - 1));
  const spaces = Math.max(1, width - leftText.length - String(right).length);
  return `${leftText}${' '.repeat(spaces)}${right}`;
};

export const buildTicket = (ticket = {}, columns = 42, margins = {}) => {
  const lines = [];
  const add = (value = '') => lines.push(escpos.line(value));
  const divider = '-'.repeat(columns);
  const topMargin = Math.max(0, Number(margins.top ?? 3));
  const bottomMargin = Math.max(1, Number(margins.bottom ?? 6));

  lines.push(escpos.initialize(), escpos.feed(topMargin), escpos.alignCenter(), escpos.bold(true));
  add(ticket.storeName || 'SSAXXON POS');
  lines.push(escpos.bold(false));
  add(ticket.storeAddress || '');
  add(ticket.phone || '');
  lines.push(escpos.alignLeft());
  add(divider);
  add(row(`Venta: ${ticket.folio || ticket.saleId || '-'}`, ticket.date || new Date().toISOString().slice(0, 10), columns));
  add(`Cliente: ${ticket.customerName || 'Publico general'}`);
  add(divider);
  add(row('Producto', 'Importe', columns));
  add(divider);

  for (const item of ticket.items || []) {
    const quantity = Number(item.quantity || 1);
    const unit = String(item.unit || '').toUpperCase();
    const quantityText = unit === 'KG' ? quantity.toFixed(3) : String(quantity);
    const amount = Number(item.subtotal ?? item.total ?? (item.unitPrice ?? item.price ?? 0) * quantity).toFixed(2);
    add(fit(`${quantityText} ${unit || 'x'} ${item.name || item.nombre || 'Producto'}`, columns));
    add(row('', amount, columns));
  }

  add(divider);
  add(row('Subtotal', Number(ticket.subtotal || 0).toFixed(2), columns));
  add(row('Impuestos', Number(ticket.tax || ticket.impuestos || 0).toFixed(2), columns));
  lines.push(escpos.bold(true));
  add(row('TOTAL', Number(ticket.total || 0).toFixed(2), columns));
  lines.push(escpos.bold(false));
  add(`Pago: ${ticket.paymentMethod || ticket.metodoPago || '-'}`);
  if (ticket.cashReceived !== undefined) add(row('Recibido', Number(ticket.cashReceived).toFixed(2), columns));
  if (ticket.change !== undefined) add(row('Cambio', Number(ticket.change).toFixed(2), columns));
  add('');
  lines.push(escpos.alignCenter());
  add(ticket.footer || 'Gracias por su compra');
  lines.push(escpos.alignLeft(), escpos.feed(bottomMargin), escpos.cut());

  return Buffer.concat(lines);
};
