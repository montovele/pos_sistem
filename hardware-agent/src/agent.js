import { createServer } from 'node:http';
import { agentConfig } from './config.js';
import { createAgentApp } from './app.js';
import { PrinterManager } from './printer.js';
import { ScaleManager } from './scale.js';

export const createAgent = ({ config = agentConfig, adapter, scaleAdapter } = {}) => {
  const printerManager = new PrinterManager(config, adapter);
  const scaleManager = new ScaleManager(config, scaleAdapter);
  const app = createAgentApp({ config, printerManager, scaleManager });
  return { app, printerManager, scaleManager };
};

export const startAgent = ({ config = agentConfig, adapter, scaleAdapter } = {}) => {
  if (!String(config.token || '').trim()) {
    throw new Error('HARDWARE_AGENT_TOKEN_REQUIRED: configura un token local antes de iniciar el agente');
  }
  const { app } = createAgent({ config, adapter, scaleAdapter });
  const server = createServer(app);
  server.listen(config.port, config.host, () => {
    console.log(`SSAXXON POS Agent escuchando en http://${config.host}:${config.port}`);
    console.log(`Transporte de impresora: ${config.printerTransport}`);
    console.log(`Health check disponible en http://${config.host}:${config.port}/health`);
    console.log('Esperando conexiones del frontend...');
  });
  return server;
};
