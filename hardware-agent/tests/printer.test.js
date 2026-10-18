import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { CupsPrinterAdapter, PrinterManager } from '../src/printer.js';

const createCommandExecutor = ({ printers = 'printer Receipt is idle. enabled since today\n', defaultPrinter = 'system default destination: Receipt\n' } = {}) =>
  async (_command, args) => ({
    stdout: args[0] === '-p' ? printers : defaultPrinter,
    stderr: ''
  });

const createSpawn = ({ exitCode = 0, stderr = '' } = {}) => {
  let submitted = null;
  let spawnedArgs = null;
  const spawn = (_command, args, options) => {
    spawnedArgs = args;
    const child = new EventEmitter();
    child.stderr = new PassThrough();
    child.stdin = new Writable({
      write(chunk, _encoding, callback) {
        submitted = Buffer.from(chunk);
        callback();
      }
    });
    child.stdin.on('finish', () => {
      if (stderr) child.stderr.end(stderr);
      else child.stderr.end();
      setImmediate(() => child.emit('close', exitCode));
    });
    assert.equal(options.stdio[0], 'pipe');
    return child;
  };
  return { spawn, getArgs: () => spawnedArgs, getSubmitted: () => submitted };
};

test('CUPS selects the default queue and writes the ESC/POS job to lp stdin', async () => {
  const spawned = createSpawn();
  const adapter = new CupsPrinterAdapter(
    { name: 'AUTO' },
    { execFileImpl: createCommandExecutor(), spawnImpl: spawned.spawn }
  );
  const job = Buffer.from([0x1b, 0x40, 0x54, 0x0a]);

  const result = await adapter.print(job);

  assert.deepEqual(result, {
    ok: true,
    printerId: 'Receipt',
    transport: 'cups',
    queue: 'Receipt',
    bytes: job.length
  });
  assert.deepEqual(spawned.getSubmitted(), job);
  assert.deepEqual(spawned.getArgs(), ['-d', 'Receipt', '-o', 'raw']);
});

test('CUPS respects a configured queue and reports missing queues', async () => {
  const executor = createCommandExecutor({ printers: 'printer Thermal is idle. enabled since today\n' });
  const adapter = new CupsPrinterAdapter({ name: 'Thermal' }, { execFileImpl: executor });
  assert.equal((await adapter.status()).name, 'Thermal');

  const missing = new CupsPrinterAdapter({ name: 'Wrong Queue' }, { execFileImpl: executor });
  const status = await missing.status();
  assert.equal(status.status, 'unavailable');
  assert.match(status.detail, /CUPS_PRINTER_NOT_FOUND/);
});

test('CUPS reports unavailable queues and print command failures', async () => {
  const disabled = new CupsPrinterAdapter(
    { name: 'Receipt' },
    {
      execFileImpl: createCommandExecutor({ printers: 'printer Receipt disabled since today\n' })
    }
  );
  assert.equal((await disabled.status()).status, 'unavailable');

  const failedSpawn = createSpawn({ exitCode: 1, stderr: 'backend unavailable' });
  const failingPrinter = new CupsPrinterAdapter(
    { name: 'Receipt' },
    { execFileImpl: createCommandExecutor(), spawnImpl: failedSpawn.spawn }
  );
  await assert.rejects(failingPrinter.print(Buffer.from('ticket')), /CUPS_PRINT_FAILED: backend unavailable/);
});

test('printer transport selection never falls back to simulated printing', () => {
  assert.throws(() => new PrinterManager({ printerTransport: 'unknown' }), /PRINTER_TRANSPORT_UNSUPPORTED/);
});
