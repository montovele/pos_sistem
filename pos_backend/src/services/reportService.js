import { getPool } from '../config/database.js';
import { products as demoProducts, transactions as demoTransactions } from '../data/demoData.js';

const normalizeTransaction = (row) => ({
  id: row.id,
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
const isAdmin = (user = {}) => String(user.role || '').toLowerCase() === 'admin';
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
    let transactions = [];
    const admin = isAdmin(user);
    const numeroEmpleado = getEmployeeNumber(user);

    if (!global.mysqlAvailable) {
      transactions = [...demoTransactions];
    } else {
      try {
        let query = `SELECT id, codigo_transaccion, codigo_ticket, fecha_trans, items, subtotal, discount, total, nombre_cajero, numero_empleado, status, payment_method
                     FROM transacciones
                     WHERE status <> 'cancelled'`;
        const params = [];

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

        if (!admin && numeroEmpleado !== null) {
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

    const topProducts = [...productSalesMap.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 5);
    const lowStockProducts = demoProducts.filter((product) => Number(product.stock) <= (Number(product.lowStockThreshold) || 0) || Number(product.stock) <= 5).slice(0, 5);

    return {
      totalSales: Number(totalSales.toFixed(2)),
      totalDiscounts: Number(totalDiscounts.toFixed(2)),
      totalItems,
      averageTicket: Number(averageTicket.toFixed(2)),
      transactions: filteredTransactions,
      topProducts,
      productCount: demoProducts.length,
      lowStockProducts,
      cashFlow: {
        totalSales,
        totalDiscounts,
        netSales: totalSales - totalDiscounts
      }
    };
  }
};
