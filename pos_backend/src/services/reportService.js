import { getPool } from '../config/database.js';
import { products as demoProducts, transactions as demoTransactions } from '../data/demoData.js';

const normalizeTransaction = (row) => ({
  id: row.id,
  organizationId: Number(row.organization_id ?? row.organizationId),
  codigoTransaccion: row.codigo_transaccion || row.codigoTransaccion,
  codigoTicket: row.codigo_ticket || row.codigoTicket,
  fechaDeTrans: row.fecha_trans ? new Date(row.fecha_trans).toISOString() : new Date().toISOString(),
  items: typeof row.items === 'string' ? JSON.parse(row.items || '[]') : (row.items || []),
  subtotal: Number(row.subtotal ?? row.subTotal ?? 0),
  discount: Number(row.discount ?? row.descuento ?? 0),
  total: Number(row.total || 0),
  nombreCajero: row.nombre_cajero || row.nombreCajero,
  numeroEmpleado: Number(row.numero_empleado || row.numeroEmpleado || 1),
  status: row.status,
  paymentMethod: row.payment_method || row.paymentMethod
});

const getItemCount = (items = []) => items.reduce((sum, item) => sum + (Number(item.quantity ?? item.qty ?? item.cantidad ?? 1)), 0);
const isAdmin = (user = {}) => ['admin', 'superadmin'].includes(String(user.role || '').toLowerCase());
const getEmployeeNumber = (user = {}) => {
  const employeeNumber = Number(user.numeroEmpleado);
  return Number.isFinite(employeeNumber) && employeeNumber > 0 ? employeeNumber : null;
};
const getDateFilter = (value, endOfDay = false) => {
  if (!value) return null;
  const dateValue = String(value);
  const date = new Date(endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
    ? `${dateValue}T23:59:59.999`
    : dateValue);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const reportService = {
  async list({ startDate, endDate } = {}, user = {}) {
    const admin = isAdmin(user);
    const numeroEmpleado = getEmployeeNumber(user);
    const organizationId = Number(user.organizationId);

    if (!Number.isInteger(organizationId) || organizationId < 1) {
      throw Object.assign(new Error('El usuario no tiene una organización válida'), { status: 403 });
    }

    let transactions = demoTransactions.filter((transaction) =>
      Number(transaction.organizationId ?? transaction.organization_id ?? 1) === organizationId
    );

    if (global.mysqlAvailable) {
      try {
        let query = `SELECT id, codigo_transaccion, codigo_ticket, fecha_trans, items, subtotal, discount, total, nombre_cajero, numero_empleado, status, payment_method
                     FROM transacciones
                     WHERE organization_id = ? AND status <> 'cancelled'`;
        const params = [organizationId];

        const start = getDateFilter(startDate);
        const end = getDateFilter(endDate, true);

        if (start) {
          query += ' AND fecha_trans >= ?';
          params.push(start);
        }

        if (end) {
          query += ' AND fecha_trans <= ?';
          params.push(end);
        }

        if (!admin) {
          query += ' AND numero_empleado = ?';
          params.push(numeroEmpleado);
        }

        query += ' ORDER BY fecha_trans DESC';

        const [rows] = await getPool().execute(query, params);
        transactions = rows.map(normalizeTransaction);
      } catch (error) {
        console.error('[REPORT SERVICE] Error generando reporte:', error.message);
        transactions = [];
      }
    }

    if (!admin) {
      transactions = transactions.filter((item) => Number(item.numeroEmpleado) === numeroEmpleado);
    }

    const filteredTransactions = (startDate || endDate)
      ? transactions.filter((item) => {
          const itemDate = new Date(item.fechaDeTrans || Date.now());
          const start = getDateFilter(startDate);
          const end = getDateFilter(endDate, true);
          if (start && itemDate < start) return false;
          if (end && itemDate > end) return false;
          return true;
        })
      : transactions;

    const totalSales = filteredTransactions.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const totalDiscounts = filteredTransactions.reduce((sum, item) => sum + Number(item.discount || 0), 0);
    const totalItems = filteredTransactions.reduce((sum, item) => sum + getItemCount(Array.isArray(item.items) ? item.items : []), 0);
    const averageTicket = filteredTransactions.length ? totalSales / filteredTransactions.length : 0;

    const productSalesMap = new Map();
    filteredTransactions.forEach((transaction) => {
      (Array.isArray(transaction.items) ? transaction.items : []).forEach((item) => {
        const key = String(item.productId ?? item.id ?? item.codigoProd ?? 'unknown');
        const current = productSalesMap.get(key) || { name: item.nombreProd || 'Producto', quantity: 0, revenue: 0 };
        current.quantity += Number(item.quantity ?? item.qty ?? item.cantidad ?? 1);
        current.revenue += Number((item.price ?? item.precio ?? 0) * (Number(item.quantity ?? item.qty ?? item.cantidad ?? 1)));
        productSalesMap.set(key, current);
      });
    });

    const topProducts = [...productSalesMap.entries()]
      .sort(([, a], [, b]) => b.quantity - a.quantity)
      .slice(0, 5)
      .map(([code, product]) => ({ code, name: product.name, quantity: product.quantity, total: product.revenue }));
    const organizationProducts = demoProducts.filter((product) =>
      Number(product.org_id ?? product.organizationId ?? 1) === organizationId
    );
    const lowStockProducts = organizationProducts.filter((product) => Number(product.stock) <= (Number(product.lowStockThreshold) || 0) || Number(product.stock) <= 5).slice(0, 5);

    return {
      totalSales: Number(totalSales.toFixed(2)),
      totalTransactions: filteredTransactions.length,
      totalDiscounts: Number(totalDiscounts.toFixed(2)),
      totalItems,
      averageTicket: Number(averageTicket.toFixed(2)),
      transactions: filteredTransactions,
      topProducts,
      productCount: organizationProducts.length,
      lowStockProducts,
      cashFlow: {
        totalSales,
        totalDiscounts,
        netSales: totalSales - totalDiscounts
      }
    };
  }
};
