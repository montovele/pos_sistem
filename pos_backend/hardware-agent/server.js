import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const app = express();
const host = process.env.HARDWARE_AGENT_HOST || '127.0.0.1';
const port = Number(process.env.HARDWARE_AGENT_PORT || 18181);
const token = process.env.HARDWARE_AGENT_TOKEN || '';
const transport = String(process.env.HARDWARE_PRINTER_TRANSPORT || (process.platform === 'win32' ? 'windows' : 'mock')).toLowerCase();
const printerName = process.env.HARDWARE_PRINTER_NAME || '';
const printerHost = process.env.HARDWARE_PRINTER_HOST || '';
const printerPort = Number(process.env.HARDWARE_PRINTER_PORT || 9100);
const paperColumns = Number(process.env.HARDWARE_PAPER_COLUMNS || 42);
const scaleWeightGrams = Number(process.env.HARDWARE_SCALE_WEIGHT_GRAMS || 0);

const allowedOrigins = String(process.env.HARDWARE_AGENT_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Agent-Token']
}));
app.use(express.json({ limit: '256kb' }));

const isAuthorized = (req) => !token || req.get('X-Agent-Token') === token;
const requireAgentToken = (req, res, next) => {
  if (!isAuthorized(req)) {
    return res.status(401).json({ success: false, error: 'INVALID_AGENT_TOKEN' });
  }
  return next();
};

const line = (value = '') => String(value).slice(0, paperColumns);
const renderTestTicket = () => [
  '\x1b@',
  '\x1ba\x01',
  line('PRUEBA DE IMPRESION'),
  line('POS Hardware Agent'),
  '\x1ba\x00',
  '-'.repeat(Math.max(10, paperColumns)),
  line(`Fecha: ${new Date().toLocaleString()}`),
  line('La impresora responde correctamente.'),
  '\n\n\n',
  '\x1dV\x00'
].join('\n');

const renderTicket = (ticket = {}) => {
  if (typeof ticket === 'string') return ticket;
  const items = Array.isArray(ticket.items) ? ticket.items : [];
  const rows = [
    '\x1b@',
    '\x1ba\x01',
    line(ticket.businessName || ticket.storeName || 'PUNTO DE VENTA'),
    line(ticket.codigoTicket || ticket.folio || ticket.saleId || 'TICKET'),
    '\x1ba\x00',
    '-'.repeat(Math.max(10, paperColumns)),
    ...items.map((item) => line(`${item.quantity || 1} x ${item.nombreProd || item.name || 'Producto'}  ${item.total || item.price || ''}`)),
    '-'.repeat(Math.max(10, paperColumns)),
    line(`TOTAL: ${ticket.total ?? ''}`),
    '\n\n\n',
    '\x1dV\x00'
  ];
  return rows.join('\n');
};

const printTcp = (data) => new Promise((resolve, reject) => {
  if (!printerHost) return reject(new Error('HARDWARE_PRINTER_HOST no configurado'));
  const socket = net.createConnection({ host: printerHost, port: printerPort });
  const timeout = setTimeout(() => socket.destroy(new Error('Tiempo de espera agotado')), 5000);
  socket.once('connect', () => socket.end(Buffer.from(data, 'binary')));
  socket.once('close', () => {
    clearTimeout(timeout);
    resolve();
  });
  socket.once('error', (error) => {
    clearTimeout(timeout);
    reject(error);
  });
});

const openDrawer = async () => {
  if (transport === 'mock') return { ok: true, mocked: true };
  if (transport === 'tcp') {
    await printTcp('\x1b\x70\x00\x19\xff');
    return { ok: true, mocked: false };
  }
  return { ok: false, error: 'DRAWER_NOT_CONFIGURED' };
};

const printWindows = async (data) => {
  if (process.platform !== 'win32') {
    throw new Error('El transporte windows solo funciona en Windows');
  }
  if (!printerName) throw new Error('HARDWARE_PRINTER_NAME no configurado');
  const filePath = path.join(os.tmpdir(), `pos-ticket-${Date.now()}-${process.pid}.txt`);
  try {
    await fs.writeFile(filePath, data, 'binary');
    await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      'Get-Content -Raw -LiteralPath $env:HARDWARE_TICKET_FILE | Out-Printer -Name $env:HARDWARE_PRINTER_NAME'
    ], { env: { ...process.env, HARDWARE_PRINTER_NAME: printerName, HARDWARE_TICKET_FILE: filePath } });
  } finally {
    await fs.rm(filePath, { force: true });
  }
};

const print = async (data) => {
  if (transport === 'mock') return { printer: 'mock', mocked: true };
  if (transport === 'tcp') {
    await printTcp(data);
    return { printer: `${printerHost}:${printerPort}`, mocked: false };
  }
  if (transport === 'windows') {
    await printWindows(data);
    return { printer: printerName, mocked: false };
  }
  throw new Error(`Transporte de impresora no soportado: ${transport}`);
};

const listWindowsPrinters = async () => {
  if (process.platform !== 'win32') return [];
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command',
    'Get-Printer | Select-Object Name,PrinterStatus,WorkOffline | ConvertTo-Json -Compress'
  ]);
  if (!stdout.trim()) return [];
  const parsed = JSON.parse(stdout);
  return (Array.isArray(parsed) ? parsed : [parsed]).map((item) => ({
    name: item.Name,
    status: item.PrinterStatus,
    offline: Boolean(item.WorkOffline)
  }));
};

app.get('/health', async (_req, res) => {
  let printers = [];
  try {
    printers = transport === 'windows' ? await listWindowsPrinters() : [{ name: printerName || transport, status: 'configured', offline: false }];
  } catch (error) {
    return res.status(503).json({ success: false, error: 'PRINTER_DISCOVERY_FAILED', detail: error.message });
  }
  return res.json({ success: true, agent: true, transport, printer: printerName || printerHost || transport, printers });
});

app.get('/printers', requireAgentToken, async (_req, res) => {
  try {
    const printers = transport === 'windows'
      ? await listWindowsPrinters()
      : [{ name: printerName || printerHost || transport, status: 'configured', offline: false }];
    return res.json({ success: true, printers });
  } catch (error) {
    return res.status(503).json({ success: false, error: 'PRINTER_DISCOVERY_FAILED', detail: error.message });
  }
});

app.get('/scale/weight', requireAgentToken, async (_req, res) => {
  if (!scaleWeightGrams || scaleWeightGrams < 0) {
    return res.status(503).json({ success: false, error: 'SCALE_UNAVAILABLE' });
  }
  return res.json({
    success: true,
    weightGrams: Math.round(scaleWeightGrams),
    weightKg: Number((scaleWeightGrams / 1000).toFixed(3)),
    unit: 'g',
    stable: true
  });
});

app.post('/test/print', requireAgentToken, async (_req, res) => {
  try {
    const result = await print(renderTestTicket());
    return res.json({ success: true, print: { ok: true, test: true, ...result } });
  } catch (error) {
    return res.status(503).json({ success: false, error: 'PRINTER_UNAVAILABLE', detail: error.message });
  }
});

app.post('/print', requireAgentToken, async (req, res) => {
  try {
    const payload = req.body || {};
    const result = await print(renderTicket(payload.ticket || payload));
    const drawer = payload.openDrawer ? await openDrawer() : { ok: false, skipped: true };
    return res.json({ success: true, print: { ok: true, ...result }, drawer });
  } catch (error) {
    return res.status(503).json({ success: false, error: 'PRINTER_UNAVAILABLE', detail: error.message });
  }
});

app.post('/drawer/open', requireAgentToken, async (_req, res) => {
  const drawer = await openDrawer();
  return drawer.ok
    ? res.json({ success: true, drawer })
    : res.status(501).json({ success: false, error: drawer.error });
});

if (process.argv[1] && process.argv[1].endsWith('hardware-agent/server.js')) {
  app.listen(port, host, () => {
    console.log(`Hardware Agent escuchando en http://${host}:${port}`);
    console.log(`Transporte de impresora: ${transport}`);
  });
}

export { app, renderTestTicket };
