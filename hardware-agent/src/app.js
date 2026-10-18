import express from 'express';

const auth = (token) => (req, res, next) => {
  if (req.path === '/health') return next();
  const receivedToken = req.get('x-agent-token');
  if (!token || receivedToken !== token) {
    console.warn(`[AGENT AUTH] Token invalido o ausente en ${req.method} ${req.originalUrl}. Recibido: ${receivedToken ? 'si' : 'no'}`);
    return res.status(401).json({ success: false, error: 'UNAUTHORIZED_AGENT' });
  }
  console.log(`[AGENT AUTH] Token valido en ${req.method} ${req.originalUrl}`);
  return next();
};

const originGuard = (allowedOrigins) => (req, res, next) => {
  const origin = req.get('origin');
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ success: false, error: 'ORIGIN_NOT_ALLOWED' });
  }
  if (origin) res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Agent-Token');
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
};

const scaleError = (res, error) => res.status(error.code === 'SCALE_NOT_CONNECTED' ? 503 : 422).json({
  success: false,
  error: error.code || 'SCALE_ERROR',
  message: error.code === 'SCALE_UNSTABLE' ? 'La lectura de la bascula no es estable' : 'No fue posible leer la bascula'
});

export const createAgentApp = ({ config, printerManager, scaleManager }) => {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use((req, res, next) => {
    const startedAt = Date.now();
    const origin = req.get('origin') || 'sin-origin';
    console.log(`[AGENT REQUEST] ${req.method} ${req.originalUrl} desde ${origin}`);
    res.on('finish', () => {
      console.log(`[AGENT RESPONSE] ${req.method} ${req.originalUrl} -> ${res.statusCode} en ${Date.now() - startedAt}ms`);
    });
    next();
  });
  app.use(originGuard(config.allowedOrigins));
  app.use(auth(config.token));

  app.get('/health', async (_req, res) => {
    const printers = await printerManager.list();
    const scale = await scaleManager.status();
    const health = {
      success: true,
      status: printers.every((printer) => ['ready', 'mock'].includes(printer.status)) ? 'ok' : 'degraded',
      agent: '1.0.0',
      computer: process.env.COMPUTERNAME || process.env.HOSTNAME || 'local',
      printers,
      data: { printer: printers.some((printer) => ['ready', 'mock'].includes(printer.status)), drawer: printers.length > 0, scale: scale.connected },
      scale
    };
    console.log(`[AGENT HEALTH] Conexion recibida correctamente. Estado: ${health.status}. Impresoras: ${health.printers.length}`);
    return res.json(health);
  });

  app.get('/printers', async (_req, res) => res.json({ success: true, printers: await printerManager.list() }));

  app.get('/scale/status', async (_req, res) => res.json({ success: true, data: await scaleManager.status() }));

  app.get('/scale/weight', async (_req, res) => {
    try {
      return res.json({ success: true, data: await scaleManager.readWeight() });
    } catch (error) {
      return scaleError(res, error);
    }
  });

  app.post('/scale/tare', async (_req, res) => {
    try {
      return res.json({ success: true, data: await scaleManager.tare() });
    } catch (error) {
      return scaleError(res, error);
    }
  });

  app.post('/print', async (req, res) => {
    if (!req.body?.ticket) return res.status(400).json({ success: false, error: 'TICKET_REQUIRED' });
    const paymentMethod = String(req.body.ticket.paymentMethod || req.body.ticket.metodoPago || '').toLowerCase();
    const shouldOpenDrawer = req.body.openDrawer ?? (config.openDrawerOnCash && ['cash', 'efectivo'].includes(paymentMethod));

    try {
      const printPromise = printerManager.printTicket(req.body.ticket, {
        saleId: req.body.saleId || req.body.ticket.saleId,
        type: req.body.type || 'SALE'
      });
      const drawerPromise = shouldOpenDrawer ? printerManager.openDrawer() : Promise.resolve(null);
      const [printResult, drawerResult] = await Promise.allSettled([printPromise, drawerPromise]);

      if (printResult.status === 'rejected') {
        throw printResult.reason;
      }

      const print = printResult.value;
      const drawer = shouldOpenDrawer
        ? drawerResult.status === 'fulfilled'
          ? { success: true, ...drawerResult.value }
          : { success: false, error: 'DRAWER_UNAVAILABLE', detail: drawerResult.reason.message }
        : { success: true, skipped: true };
      return res.json({ success: true, print, drawer });
    } catch (error) {
      console.error(`[AGENT PRINT ERROR] No se pudo imprimir en ${config.printerHost}:${config.printerPort}: ${error.code || error.message}`);
      return res.status(503).json({ success: false, error: 'PRINTER_UNAVAILABLE', detail: error.message });
    }
  });

  app.post('/drawer/open', async (_req, res) => {
    try {
      const result = await printerManager.openDrawer();
      return res.json({ success: true, drawer: result });
    } catch (error) {
      return res.status(503).json({ success: false, error: 'DRAWER_UNAVAILABLE', detail: error.message });
    }
  });

  app.post('/test/print', async (_req, res) => {
    try {
      const result = await printerManager.printTicket({
        storeName: 'SSAXXON POS',
        folio: 'TEST',
        items: [{ name: 'Prueba de impresion', quantity: 1, price: 0, total: 0 }],
        total: 0,
        footer: 'Agente conectado'
      }, { type: 'TEST' });
      return res.json({ success: true, print: result });
    } catch (error) {
      return res.status(503).json({ success: false, error: 'PRINTER_UNAVAILABLE', detail: error.message });
    }
  });

  app.use((_req, res) => res.status(404).json({ success: false, error: 'NOT_FOUND' }));
  return app;
};
