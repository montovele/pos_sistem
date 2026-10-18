import { getPool } from '../config/database.js';

const sessions = new Map();
const history = [];

const serviceError = (message, status) => Object.assign(new Error(message), { status });
const getEmployeeNumber = (user = {}) => Number(user.numeroEmpleado || user.id || 0);
const getEmployeeName = (user = {}) => user.nombreEmpleado || user.username || 'Sistema';
const isValidAmount = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const getBase = (payload = {}) => payload.baseCaja ?? payload.montoApertura;
const isCashPayment = (method) => ['cash', 'efectivo', 'money'].includes(String(method || '').toLowerCase());

const emptyStatus = (numeroEmpleado) => ({
  id: null, abierta: false, cajero: null, numeroEmpleado, base: 0,
  fechaApertura: null, horaApertura: null, horaCierre: '', totalVentas: 0,
  totalEfectivo: 0, totalEsperado: 0, totalTransacciones: 0,
  efectivoContado: null, diferencia: null
});

const toStatus = (session, totals = {}) => ({
  id: session.id,
  abierta: Boolean(session.abierta),
  cajero: session.cajero,
  numeroEmpleado: session.numeroEmpleado,
  base: Number(session.base),
  fechaApertura: session.fechaApertura,
  horaApertura: session.fechaApertura,
  horaCierre: session.fechaCierre || '',
  totalVentas: Number(totals.totalVentas || 0),
  totalEfectivo: Number(totals.totalEfectivo || 0),
  totalEsperado: Number(session.base) + Number(totals.totalEfectivo || 0),
  totalTransacciones: Number(totals.totalTransacciones || 0),
  efectivoContado: session.efectivoContado ?? null,
  diferencia: session.efectivoContado == null ? null : Number(session.efectivoContado) - Number(session.base) - Number(totals.totalEfectivo || 0)
});

const calculateTotals = (items = [], sessionId) => {
  const current = items.filter((item) => item.status !== 'cancelled' && item.cashSessionId === sessionId);
  return {
    totalVentas: current.reduce((sum, item) => sum + Number(item.total || 0), 0),
    totalEfectivo: current.filter((item) => isCashPayment(item.paymentMethod)).reduce((sum, item) => sum + Number(item.total || 0), 0),
    totalTransacciones: current.length
  };
};

export const cajaService = {
  async getStatus(user = {}) {
    const numeroEmpleado = getEmployeeNumber(user);
    const session = await this.getOpenSession(user);
    if (!session) return emptyStatus(numeroEmpleado);
    return toStatus(session, await this.getTotals(session.id));
  },

  async getOpenSession(user = {}) {
    const numeroEmpleado = getEmployeeNumber(user);
    if (!numeroEmpleado) return null;
    if (global.mysqlAvailable) {
      const [rows] = await getPool().execute('SELECT * FROM cash_sessions WHERE numero_empleado = ? AND abierta = 1 ORDER BY fecha_apertura DESC LIMIT 1', [numeroEmpleado]);
      return rows[0] ? this.mapSession(rows[0]) : null;
    }
    return sessions.get(numeroEmpleado) || null;
  },

  async abrir(payload = {}, user = {}) {
    const base = getBase(payload);
    if (base === undefined || !isValidAmount(base)) throw serviceError('La base de caja debe ser un número no negativo', 400);
    const numeroEmpleado = getEmployeeNumber(user);
    if (!numeroEmpleado) throw serviceError('El usuario no tiene número de empleado', 401);
    if (await this.getOpenSession(user)) throw serviceError('El usuario ya tiene una caja abierta', 409);
    const now = new Date().toISOString();
    const session = { id: `CAJA-${Date.now()}-${numeroEmpleado}`, abierta: true, numeroEmpleado, cajero: getEmployeeName(user), base: Number(base), fechaApertura: now, fechaCierre: null, efectivoContado: null, transactions: [] };
    if (global.mysqlAvailable) {
      await getPool().execute('INSERT INTO cash_sessions (id, numero_empleado, cajero, base, abierta, fecha_apertura) VALUES (?, ?, ?, ?, 1, ?)', [session.id, session.numeroEmpleado, session.cajero, session.base, new Date(now)]);
    } else {
      sessions.set(numeroEmpleado, session);
    }
    return toStatus(session);
  },

  async getTotals(sessionId) {
    if (global.mysqlAvailable) {
      const [rows] = await getPool().execute(`SELECT COUNT(*) AS totalTransacciones, COALESCE(SUM(total), 0) AS totalVentas, COALESCE(SUM(CASE WHEN LOWER(payment_method) IN ('cash', 'efectivo', 'money') THEN total ELSE 0 END), 0) AS totalEfectivo FROM transacciones WHERE cash_session_id = ? AND status <> 'cancelled'`, [sessionId]);
      return rows[0] || {};
    }
    return calculateTotals(Array.from(sessions.values()).flatMap((session) => session.transactions || []), sessionId);
  },

  async guardarArqueo(payload = {}, user = {}) {
    const efectivo = payload.efectivoContado;
    if (!isValidAmount(efectivo)) throw serviceError('El efectivo contado debe ser un número no negativo', 400);
    const session = await this.getOpenSession(user);
    if (!session) throw serviceError('No existe una caja abierta', 409);
    session.efectivoContado = Number(efectivo);
    if (global.mysqlAvailable) await getPool().execute('UPDATE cash_sessions SET efectivo_contado = ? WHERE id = ?', [session.efectivoContado, session.id]);
    else sessions.set(session.numeroEmpleado, session);
    return toStatus(session, await this.getTotals(session.id));
  },

  async cerrar(payload = {}, user = {}) {
    const status = await this.guardarArqueo(payload, user);
    const session = await this.getOpenSession(user);
    const closedAt = new Date().toISOString();
    if (global.mysqlAvailable) {
      await getPool().execute('UPDATE cash_sessions SET abierta = 0, fecha_cierre = ?, diferencia = ? WHERE id = ?', [new Date(closedAt), status.diferencia, session.id]);
    } else {
      sessions.delete(session.numeroEmpleado);
      history.push({ ...session, abierta: false, fechaCierre: closedAt, diferencia: status.diferencia });
    }
    return { ...status, abierta: false, horaCierre: closedAt };
  },

  async obtenerArqueo(user = {}) { return this.getStatus(user); },

  async obtenerVentas(user = {}) {
    const session = await this.getOpenSession(user);
    if (!session) return [];
    if (global.mysqlAvailable) {
      const [rows] = await getPool().execute(`SELECT id, codigo_transaccion, codigo_ticket, fecha_trans, items, total, nombre_cajero, numero_empleado, status, payment_method, cash_session_id FROM transacciones WHERE cash_session_id = ? AND status <> 'cancelled' ORDER BY fecha_trans DESC`, [session.id]);
      return rows.map((row) => ({ id: row.id, codigoTransaccion: row.codigo_transaccion, codigoTicket: row.codigo_ticket, fechaDeTrans: row.fecha_trans ? new Date(row.fecha_trans).toISOString() : null, items: typeof row.items === 'string' ? JSON.parse(row.items || '[]') : row.items || [], total: Number(row.total || 0), nombreCajero: row.nombre_cajero, numeroEmpleado: Number(row.numero_empleado || 0), status: row.status, paymentMethod: row.payment_method, cashSessionId: row.cash_session_id }));
    }
    return (session.transactions || []).filter((item) => item.status !== 'cancelled');
  },

  async obtenerHistorial(user = {}) {
    const numeroEmpleado = getEmployeeNumber(user);
    if (global.mysqlAvailable) {
      const [rows] = await getPool().execute('SELECT * FROM cash_sessions WHERE numero_empleado = ? ORDER BY fecha_apertura DESC', [numeroEmpleado]);
      return rows.map((row) => this.mapSession(row));
    }
    return history.filter((item) => item.numeroEmpleado === numeroEmpleado);
  },

  mapSession(row) {
    return { id: row.id, numeroEmpleado: Number(row.numero_empleado ?? row.numeroEmpleado), cajero: row.cajero, base: Number(row.base), abierta: Boolean(row.abierta), fechaApertura: row.fecha_apertura ? new Date(row.fecha_apertura).toISOString() : row.fechaApertura, fechaCierre: row.fecha_cierre ? new Date(row.fecha_cierre).toISOString() : row.fechaCierre || null, efectivoContado: row.efectivo_contado == null ? null : Number(row.efectivo_contado), diferencia: row.diferencia == null ? null : Number(row.diferencia), transactions: [] };
  }
};
