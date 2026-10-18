const firstDefined = (...values) => values.find((value) => value !== undefined && value !== null);

const requiredText = (value, field) => {
  const text = String(value ?? '').trim();
  if (!text) throw new TypeError(`${field} es requerido`);
  return text;
};

const finiteNumber = (value, field, { minimum = 0 } = {}) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum) {
    throw new TypeError(`${field} debe ser un numero valido`);
  }
  return number;
};

export const createPrintJob = (sale, options = {}) => {
  if (!sale || typeof sale !== 'object') throw new TypeError('La venta es requerida');

  const type = options.type || 'SALE';
  if (!['SALE', 'REPRINT'].includes(type)) throw new TypeError('Tipo de impresion no permitido');

  const source = options.source || 'online';
  if (!['online', 'offline'].includes(source)) throw new TypeError('Origen de venta no permitido');

  const saleId = requiredText(firstDefined(sale.saleId, sale.id, sale.folio, sale.codigoTicket), 'saleId');
  if (!Array.isArray(sale.items) || sale.items.length === 0) throw new TypeError('La venta debe incluir productos');

  const items = sale.items.map((item, index) => {
    const name = requiredText(firstDefined(item.name, item.nombreProd, item.productName), `items[${index}].name`);
    const quantity = finiteNumber(firstDefined(item.quantity, item.cantidad), `items[${index}].quantity`, { minimum: Number.MIN_VALUE });
    const price = finiteNumber(firstDefined(item.price, item.precio), `items[${index}].price`);
    const total = finiteNumber(firstDefined(item.total, item.subtotal, quantity * price), `items[${index}].total`);
    return { name, quantity, price, total };
  });

  const total = finiteNumber(firstDefined(sale.total, sale.totalVenta, items.reduce((sum, item) => sum + item.total, 0)), 'total');
  const paymentMethod = firstDefined(sale.paymentMethod, sale.metodoPago, '');
  const cashPayment = ['cash', 'efectivo'].includes(String(paymentMethod).toLowerCase());
  const openDrawer = type === 'REPRINT' ? false : options.openDrawer ?? cashPayment;

  return {
    saleId,
    type,
    source,
    openDrawer: Boolean(openDrawer),
    ticket: {
      storeName: firstDefined(sale.storeName, sale.businessName, options.storeName, 'SSAXXON POS'),
      folio: String(firstDefined(sale.folio, sale.codigoTicket, sale.saleId, sale.id, saleId)),
      paymentMethod,
      items,
      total
    }
  };
};