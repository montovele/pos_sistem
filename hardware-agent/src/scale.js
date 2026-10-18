import { SerialPort, ReadlineParser } from 'serialport';

const parseNumber = (value) => Number.parseFloat(String(value).replace(',', '.'));

export const normalizeReading = (raw, defaultUnit = 'kg', maxWeightKg = 300) => {
  const text = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  const match = text.match(/(-?\d+(?:[.,]\d+)?)\s*(kg|kgs|kilo(?:gramos)?|g|gr|gramos?)?/i);
  if (!match) throw Object.assign(new Error('SCALE_INVALID_READING'), { code: 'SCALE_INVALID_READING' });

  const value = parseNumber(match[1]);
  if (!Number.isFinite(value) || value < 0) {
    throw Object.assign(new Error('SCALE_INVALID_READING'), { code: 'SCALE_INVALID_READING' });
  }

  const unit = (match[2] || defaultUnit).toLowerCase();
  const weightKg = /^(g|gr|gramos?)$/.test(unit) ? value / 1000 : value;
  if (weightKg > maxWeightKg) {
    throw Object.assign(new Error('SCALE_INVALID_READING'), { code: 'SCALE_INVALID_READING' });
  }

  return {
    weightGrams: Math.round(weightKg * 1000),
    weightKg,
    unit: 'KG',
    stable: false,
    raw: text
  };
};

export class SerialScaleAdapter {
  constructor(config) {
    this.config = config;
    this.port = null;
    this.parser = null;
    this.readingPromise = null;
  }

  async open() {
    if (this.port?.isOpen) return;
    if (!this.config.scalePort) throw Object.assign(new Error('SCALE_NOT_CONNECTED'), { code: 'SCALE_NOT_CONNECTED' });
    this.port = new SerialPort({
      path: this.config.scalePort,
      baudRate: this.config.scaleBaudRate,
      dataBits: this.config.scaleDataBits,
      stopBits: this.config.scaleStopBits,
      parity: this.config.scaleParity,
      autoOpen: false
    });
    this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\n' }));
    await new Promise((resolve, reject) => {
      this.port.open((error) => error ? reject(Object.assign(new Error('SCALE_NOT_CONNECTED'), { code: 'SCALE_NOT_CONNECTED', cause: error })) : resolve());
    });
  }

  async readSample() {
    await this.open();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(Object.assign(new Error('SCALE_NOT_CONNECTED'), { code: 'SCALE_NOT_CONNECTED' }));
      }, this.config.scaleReadTimeoutMs);
      const onData = (line) => {
        try {
          const reading = normalizeReading(line, this.config.scaleUnit, this.config.scaleMaxWeightKg);
          cleanup();
          resolve(reading);
        } catch (error) {
          if (error.code !== 'SCALE_INVALID_READING') {
            cleanup();
            reject(error);
          }
        }
      };
      const onError = (error) => {
        cleanup();
        reject(Object.assign(new Error('SCALE_NOT_CONNECTED'), { code: 'SCALE_NOT_CONNECTED', cause: error }));
      };
      const cleanup = () => {
        clearTimeout(timeout);
        this.parser?.off('data', onData);
        this.port?.off('error', onError);
      };
      this.parser.on('data', onData);
      this.port.once('error', onError);
    });
  }

  async readWeight() {
    if (this.readingPromise) return this.readingPromise;
    this.readingPromise = (async () => {
      const readings = [];
      try {
        for (let index = 0; index < this.config.scaleStableReads; index += 1) {
          readings.push(await this.readSample());
        }
        const first = readings[0];
        const stable = readings.every((reading) => Math.abs(reading.weightGrams - first.weightGrams) <= this.config.scaleStabilityToleranceGrams);
        if (!stable) throw Object.assign(new Error('SCALE_UNSTABLE'), { code: 'SCALE_UNSTABLE' });
        return { ...readings.at(-1), stable: true };
      } finally {
        this.readingPromise = null;
      }
    })();
    return this.readingPromise;
  }

  async tare() {
    await this.open();
    await new Promise((resolve, reject) => this.port.write(this.config.scaleTareCommand, (error) => error ? reject(Object.assign(new Error('SCALE_TARE_FAILED'), { code: 'SCALE_TARE_FAILED', cause: error })) : resolve()));
    return { tareApplied: true };
  }

  async status() {
    try {
      await this.open();
      return { connected: true, port: this.config.scalePort, unit: 'KG', stable: false };
    } catch (error) {
      return { connected: false, port: this.config.scalePort, unit: 'KG', stable: false, detail: error.code || error.message };
    }
  }

  async close() {
    if (this.port?.isOpen) await new Promise((resolve) => this.port.close(() => resolve()));
  }
}

export class MockScaleAdapter {
  constructor(readings = [{ weightGrams: 250, weightKg: 0.25, unit: 'KG', stable: true, raw: 'ST,GS,0.250kg' }]) {
    this.readings = readings;
    this.index = 0;
    this.tareApplied = false;
  }

  async readWeight() {
    const readings = this.readings.slice(this.index, this.index + 2);
    this.index = Math.min(this.index + 2, this.readings.length - 1);
    const first = readings[0];
    const last = readings.at(-1);
    if (readings.length > 1 && Math.abs(last.weightGrams - first.weightGrams) > 1) {
      throw Object.assign(new Error('SCALE_UNSTABLE'), { code: 'SCALE_UNSTABLE' });
    }
    return { ...last, stable: true };
  }

  async tare() {
    this.tareApplied = true;
    return { tareApplied: true };
  }

  status() {
    return { connected: true, port: 'mock', unit: 'KG', stable: true };
  }
}

export class ScaleManager {
  constructor(config, adapter) {
    this.config = config;
    this.enabled = config.scaleEnabled;
    this.adapter = adapter || new SerialScaleAdapter(config);
  }

  async status() {
    if (!this.enabled) return { connected: false, enabled: false, port: this.config.scalePort, unit: 'KG', stable: false };
    return { enabled: true, ...(await this.adapter.status()) };
  }

  async readWeight() {
    if (!this.enabled) throw Object.assign(new Error('SCALE_NOT_CONNECTED'), { code: 'SCALE_NOT_CONNECTED' });
    return this.adapter.readWeight();
  }

  async tare() {
    if (!this.enabled) throw Object.assign(new Error('SCALE_NOT_CONNECTED'), { code: 'SCALE_NOT_CONNECTED' });
    return this.adapter.tare();
  }
}
