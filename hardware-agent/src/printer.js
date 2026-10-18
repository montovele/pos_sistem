import net from 'node:net';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { buildTicket, escpos } from './escpos.js';

const execFileAsync = promisify(execFile);

const WINDOWS_PRINTER_SCRIPT = String.raw`
$printers = @(Get-Printer | ForEach-Object {
  $details = Get-CimInstance Win32_Printer -Filter ("Name='" + $_.Name.Replace("'", "''") + "'") -ErrorAction SilentlyContinue
  [pscustomobject]@{
    name = $_.Name
    driver = $_.DriverName
    port = $_.PortName
    status = [string]$_.PrinterStatus
    workOffline = [bool]$_.WorkOffline
    isDefault = [bool]($details.Default)
  }
})
$printers | ConvertTo-Json -Compress
`;

const WINDOWS_RAW_PRINT_SCRIPT = String.raw`
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public class DOCINFO { public string pDocName; public string pOutputFile; public string pDataType; }
  [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
  public static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
  [DllImport("winspool.drv", SetLastError = true)] public static extern bool ClosePrinter(IntPtr handle);
  [DllImport("winspool.drv", CharSet = CharSet.Unicode)] public static extern int StartDocPrinter(IntPtr handle, int level, [In] DOCINFO info);
  [DllImport("winspool.drv")] public static extern bool EndDocPrinter(IntPtr handle);
  [DllImport("winspool.drv")] public static extern bool StartPagePrinter(IntPtr handle);
  [DllImport("winspool.drv")] public static extern bool EndPagePrinter(IntPtr handle);
  [DllImport("winspool.drv")] public static extern bool WritePrinter(IntPtr handle, byte[] bytes, int count, out int written);
  public static void Print(string printerName, byte[] bytes) {
    IntPtr handle;
    if (!OpenPrinter(printerName, out handle, IntPtr.Zero)) throw new Exception("OPEN_PRINTER_FAILED:" + Marshal.GetLastWin32Error());
    try {
      var info = new DOCINFO { pDocName = "SSAXXON POS", pDataType = "RAW" };
      if (StartDocPrinter(handle, 1, info) <= 0) throw new Exception("START_DOC_FAILED:" + Marshal.GetLastWin32Error());
      try {
        if (!StartPagePrinter(handle)) throw new Exception("START_PAGE_FAILED:" + Marshal.GetLastWin32Error());
        try {
          int written;
          if (!WritePrinter(handle, bytes, bytes.Length, out written) || written != bytes.Length) throw new Exception("WRITE_PRINTER_FAILED:" + Marshal.GetLastWin32Error());
        } finally { EndPagePrinter(handle); }
      } finally { EndDocPrinter(handle); }
    } finally { ClosePrinter(handle); }
  }
}
'@
[RawPrinter]::Print($env:SSAXXON_PRINTER_NAME, [Convert]::FromBase64String($env:SSAXXON_PRINTER_DATA))
`;

const runPowerShell = async (script, env = {}) => {
  if (process.platform !== 'win32') throw new Error('WINDOWS_PRINTER_REQUIRES_WINDOWS');
  const result = await execFileAsync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], {
    env: { ...process.env, ...env },
    maxBuffer: 1024 * 1024
  });
  return result.stdout.trim();
};

class MockPrinterAdapter {
  constructor({ name = 'POS-80' } = {}) {
    this.name = name;
    this.lastJob = null;
    this.lastDrawerPulse = null;
  }

  async print(buffer, metadata = {}) {
    this.lastJob = { bytes: buffer.length, metadata, printedAt: new Date().toISOString() };
    return { ok: true, printerId: this.name, transport: 'mock', bytes: buffer.length };
  }

  async pulseDrawer() {
    const pulse = escpos.drawerPulse();
    this.lastDrawerPulse = { bytes: pulse.length, data: [...pulse] };
    return { ok: true, printerId: this.name, transport: 'mock', simulated: true, bytes: pulse.length };
  }

  status() {
    return { id: this.name, name: this.name, type: 'thermal', connection: 'mock', status: 'ready' };
  }
}

class NetworkPrinterAdapter {
  constructor({ name, host, port }) {
    this.name = name;
    this.host = host;
    this.port = port;
  }

  send(buffer) {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      let settled = false;
      const timeout = setTimeout(() => socket.destroy(new Error('PRINTER_TIMEOUT')), 5000);
      const fail = (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };
      socket.once('connect', () => socket.end(buffer));
      socket.once('error', fail);
      socket.once('close', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve();
      });
    });
  }

  async print(buffer) {
    await this.send(buffer);
    return { ok: true, printerId: this.name, transport: 'network', host: this.host, port: this.port, bytes: buffer.length };
  }

  async pulseDrawer() {
    return this.print(escpos.drawerPulse());
  }

  async status() {
    try {
      await this.send(Buffer.alloc(0));
      return { id: this.name, name: this.name, type: 'thermal', connection: 'tcp', host: this.host, port: this.port, status: 'ready' };
    } catch (error) {
      return { id: this.name, name: this.name, type: 'thermal', connection: 'tcp', host: this.host, port: this.port, status: 'unavailable', detail: error.code || error.message };
    }
  }
}

class WindowsPrinterAdapter {
  constructor({ name = 'AUTO' } = {}) {
    this.requestedName = name;
    this.printer = null;
  }

  async findPrinter() {
    const output = await runPowerShell(WINDOWS_PRINTER_SCRIPT);
    if (!output) throw new Error('WINDOWS_PRINTER_NOT_FOUND');
    const printers = JSON.parse(output);
    const candidates = Array.isArray(printers) ? printers : [printers];
    const requestedName = String(this.requestedName || '').trim().toLowerCase();
    const exact = requestedName && !['auto', 'any', '*'].includes(requestedName)
      ? candidates.find((printer) => printer.name.toLowerCase() === requestedName)
      : null;
    const thermal = candidates.find((candidate) => /thermal|receipt|ticket|pos|esc.?pos|bixolon|epson|star|zebra|citizen|sato|honeywell/i.test(`${candidate.name} ${candidate.driver} ${candidate.port}`));
    const printer = exact || thermal || candidates.find((candidate) => candidate.isDefault) || candidates[0];
    if (!printer) throw new Error('WINDOWS_PRINTER_NOT_FOUND');
    this.printer = printer;
    return printer;
  }

  async print(buffer) {
    const printer = await this.findPrinter();
    await runPowerShell(WINDOWS_RAW_PRINT_SCRIPT, {
      SSAXXON_PRINTER_NAME: printer.name,
      SSAXXON_PRINTER_DATA: buffer.toString('base64')
    });
    return { ok: true, printerId: printer.name, transport: 'usb', port: printer.port, driver: printer.driver, bytes: buffer.length };
  }

  async pulseDrawer() {
    return this.print(escpos.drawerPulse());
  }

  async status() {
    try {
      const printer = await this.findPrinter();
      return { id: printer.name, name: printer.name, type: 'thermal', connection: 'windows-spooler', port: printer.port, driver: printer.driver, status: printer.workOffline ? 'unavailable' : 'ready' };
    } catch (error) {
      return { id: this.requestedName, name: this.requestedName, type: 'thermal', connection: 'windows-spooler', status: 'unavailable', detail: error.code || error.message };
    }
  }
}

export class CupsPrinterAdapter {
  constructor({ name = 'AUTO' } = {}, { execFileImpl = execFileAsync, spawnImpl = spawn } = {}) {
    this.requestedName = name;
    this.execFile = execFileImpl;
    this.spawn = spawnImpl;
  }

  async listPrinters({ includeDefault = true } = {}) {
    const options = { env: { ...process.env, LC_ALL: 'C' }, maxBuffer: 1024 * 1024 };
    const printerOutput = await this.execFile('lpstat', ['-p'], options);
    const defaultOutput = includeDefault
      ? await this.execFile('lpstat', ['-d'], options)
      : { stdout: '' };
    const printers = printerOutput.stdout
      .split(/\r?\n/)
      .map((line) => line.match(/^printer\s+(\S+)\s+(.+)$/))
      .filter(Boolean)
      .map((match) => ({ name: match[1], state: match[2] }));
    const defaultPrinter = defaultOutput.stdout.match(/system default destination:\s*(\S+)/)?.[1] || null;
    return { printers, defaultPrinter };
  }

  async findPrinter() {
    const requestedName = String(this.requestedName || '').trim();
    const isAutomatic = !requestedName || ['auto', 'any', '*'].includes(requestedName.toLowerCase());
    const { printers, defaultPrinter } = await this.listPrinters({ includeDefault: isAutomatic });
    const printer = isAutomatic
      ? printers.find((candidate) => candidate.name === defaultPrinter) || printers[0]
      : printers.find((candidate) => candidate.name === requestedName);
    if (!printer) {
      throw new Error(isAutomatic ? 'CUPS_PRINTER_NOT_FOUND' : `CUPS_PRINTER_NOT_FOUND:${requestedName}`);
    }
    return printer;
  }

  async print(buffer) {
    const printer = await this.findPrinter();
    await new Promise((resolve, reject) => {
      let stderr = '';
      let settled = false;
      const child = this.spawn('lp', ['-d', printer.name, '-o', 'raw'], {
        env: { ...process.env, LC_ALL: 'C' },
        stdio: ['pipe', 'ignore', 'pipe']
      });
      const fail = (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      };
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk) => {
        stderr = `${stderr}${chunk}`.slice(-4096);
      });
      child.once('error', fail);
      child.stdin.once('error', fail);
      child.once('close', (code) => {
        if (settled) return;
        if (code !== 0) {
          fail(new Error(`CUPS_PRINT_FAILED: ${stderr.trim() || `lp exited with code ${code}`}`));
          return;
        }
        settled = true;
        resolve();
      });
      child.stdin.end(buffer);
    });
    return { ok: true, printerId: printer.name, transport: 'cups', queue: printer.name, bytes: buffer.length };
  }

  pulseDrawer() {
    return this.print(escpos.drawerPulse());
  }

  async status() {
    try {
      const printer = await this.findPrinter();
      const disabled = /\bdisabled\b/i.test(printer.state);
      return {
        id: printer.name,
        name: printer.name,
        type: 'thermal',
        connection: 'cups',
        status: disabled ? 'unavailable' : 'ready',
        ...(disabled ? { detail: printer.state } : {})
      };
    } catch (error) {
      return {
        id: this.requestedName,
        name: this.requestedName,
        type: 'thermal',
        connection: 'cups',
        status: 'unavailable',
        detail: error.code || error.message
      };
    }
  }
}

export class PrinterManager {
  constructor(config, adapter) {
    this.config = config;
    if (adapter) {
      this.adapter = adapter;
      return;
    }

    const transport = String(config.printerTransport || '').toLowerCase();
    if (transport === 'mock') {
      this.adapter = new MockPrinterAdapter(config);
    } else if (transport === 'network') {
      this.adapter = new NetworkPrinterAdapter(config);
    } else if (['auto', 'usb'].includes(transport) && process.platform === 'win32') {
      this.adapter = new WindowsPrinterAdapter(config);
    } else if (['auto', 'usb', 'cups'].includes(transport) && process.platform === 'linux') {
      this.adapter = new CupsPrinterAdapter(config);
    } else {
      throw new Error(`PRINTER_TRANSPORT_UNSUPPORTED: ${transport || '(empty)'} on ${process.platform}`);
    }
  }

  async list() {
    return [await this.adapter.status()];
  }

  async printTicket(ticket, metadata = {}) {
    const buffer = buildTicket(ticket, this.config.paperColumns, {
      top: this.config.paperTopMargin,
      bottom: this.config.paperBottomMargin
    });
    console.log('[AGENT PRINT] Ticket y estructura enviada a la impresora:', JSON.stringify({
      metadata,
      ticket,
      bytes: buffer.length,
      printable: buffer.toString('ascii')
        .replace(/[\x1b\x1d]./g, '')
        .replace(/[^\x20-\x7e\n]/g, '')
        .trim()
    }, null, 2));
    return this.adapter.print(buffer, metadata);
  }

  async openDrawer() {
    return this.adapter.pulseDrawer();
  }
}

export { MockPrinterAdapter, NetworkPrinterAdapter, WindowsPrinterAdapter };
