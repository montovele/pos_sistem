export default class Transaction {
  constructor({
    codigoTransaccion,
    codigoTicket,
    fechaDeTrans,
    items = [],
    total = 0,
    nombreCajero = 'Sistema',
    numeroEmpleado = 1,
    status = 'completed',
    timestamp = Date.now(),
    paymentMethod = 'cash'
  } = {}) {
    this.codigoTransaccion = codigoTransaccion;
    this.codigoTicket = codigoTicket;
    this.fechaDeTrans = fechaDeTrans || new Date().toISOString();
    this.items = items;
    this.total = Number(total) || 0;
    this.nombreCajero = nombreCajero;
    this.numeroEmpleado = numeroEmpleado;
    this.status = status;
    this.timestamp = timestamp;
    this.paymentMethod = paymentMethod;
  }
}
