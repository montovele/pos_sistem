import { createPrintJob } from './print-job.js';

export class HardwareAgentError extends Error {
  constructor(message, { code = 'HARDWARE_AGENT_ERROR', status, cause } = {}) {
    super(message, { cause });
    this.name = 'HardwareAgentError';
    this.code = code;
    this.status = status;
  }
}

export class HardwareAgentClient {
  constructor({ baseUrl = 'http://127.0.0.1:18181', token, fetchImpl = globalThis.fetch } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
    this.fetch = fetchImpl;
  }

  async health() {
    return this.request('/health', { method: 'GET' });
  }

  async printSale(sale, options = {}) {
    const job = createPrintJob(sale, options);
    const result = await this.request('/print', {
      method: 'POST',
      body: JSON.stringify(job)
    });
    return {
      ...result,
      printStatus: result.print?.ok === true ? 'printed' : 'unknown',
      drawerStatus: result.drawer?.skipped === true
        ? 'skipped'
        : result.drawer?.ok === true
          ? 'opened'
          : 'failed'
    };
  }

  reprintSale(sale, options = {}) {
    return this.printSale(sale, { ...options, type: 'REPRINT', openDrawer: false });
  }

  async request(path, { method, body } = {}) {
    if (typeof this.fetch !== 'function') {
      throw new HardwareAgentError('fetch no esta disponible en este navegador', { code: 'FETCH_UNAVAILABLE' });
    }
    if (!this.token) {
      throw new HardwareAgentError('Configura el token local del agente', { code: 'AGENT_TOKEN_REQUIRED' });
    }

    let response;
    try {
      response = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'X-Agent-Token': this.token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body } : {})
      });
    } catch (cause) {
      throw new HardwareAgentError('No se pudo conectar con el agente local', { code: 'AGENT_UNREACHABLE', cause });
    }

    let result;
    try {
      result = await response.json();
    } catch (cause) {
      throw new HardwareAgentError('El agente devolvio una respuesta invalida', { code: 'INVALID_AGENT_RESPONSE', status: response.status, cause });
    }
    if (!response.ok || result.success !== true) {
      throw new HardwareAgentError(result.message || result.error || 'La solicitud al agente fallo', {
        code: result.error || 'AGENT_REQUEST_FAILED',
        status: response.status
      });
    }
    return result;
  }
}