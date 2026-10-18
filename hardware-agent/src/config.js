import dotenv from 'dotenv';

dotenv.config();

const toBoolean = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return String(value).toLowerCase() === 'true';
};

export const agentConfig = {
  host: process.env.HARDWARE_AGENT_HOST || '127.0.0.1',
  port: Number(process.env.HARDWARE_AGENT_PORT || process.env.PORT || 18181),
  token: process.env.HARDWARE_AGENT_TOKEN || '',
  allowedOrigins: (process.env.HARDWARE_AGENT_ALLOWED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  printerTransport: process.env.HARDWARE_PRINTER_TRANSPORT || 'mock',
  printerName: process.env.HARDWARE_PRINTER_NAME || 'POS-80',
  printerHost: process.env.HARDWARE_PRINTER_HOST || '127.0.0.1',
  printerPort: Number(process.env.HARDWARE_PRINTER_PORT || 9100),
  paperColumns: Number(process.env.HARDWARE_PAPER_COLUMNS || 42),
  paperTopMargin: Number(process.env.HARDWARE_PAPER_TOP_MARGIN || 3),
  paperBottomMargin: Number(process.env.HARDWARE_PAPER_BOTTOM_MARGIN || 6),
  openDrawerOnCash: toBoolean(process.env.HARDWARE_OPEN_DRAWER_ON_CASH, true),
  scaleEnabled: toBoolean(process.env.SCALE_ENABLED, false),
  scalePort: process.env.SCALE_PORT || '',
  scaleBaudRate: Number(process.env.SCALE_BAUD_RATE || 9600),
  scaleDataBits: Number(process.env.SCALE_DATA_BITS || 8),
  scaleStopBits: Number(process.env.SCALE_STOP_BITS || 1),
  scaleParity: process.env.SCALE_PARITY || 'none',
  scaleUnit: String(process.env.SCALE_UNIT || 'kg').toLowerCase(),
  scaleReadTimeoutMs: Number(process.env.SCALE_READ_TIMEOUT_MS || 2500),
  scaleStableReads: Math.max(1, Number(process.env.SCALE_STABLE_READS || 2)),
  scaleStabilityToleranceGrams: Number(process.env.SCALE_STABILITY_TOLERANCE_GRAMS || 1),
  scaleMaxWeightKg: Number(process.env.SCALE_MAX_WEIGHT_KG || 300),
  scaleTareCommand: process.env.SCALE_TARE_COMMAND || 'T\r\n'
};
