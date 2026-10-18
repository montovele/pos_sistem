import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { createReadStream, createWriteStream } from 'node:fs';
import { access, chmod, copyFile, cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.resolve(rootDir, '..', 'hardware-agent');
const frontendDir = path.resolve(rootDir, '..', 'pos_frontend');
const distDir = path.join(rootDir, 'dist');
const nodeVersion = `v${process.versions.node}`;
const supportedTargets = ['windows', 'linux'];

const fail = (message) => {
  throw new Error(message);
};

const assertRuntimeVersion = () => {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 20) fail(`Se requiere Node.js 20 o superior; se detecto ${process.versions.node}.`);
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`Fallo el comando: ${command} ${args.join(' ')}`);
};

const fetchResponse = async (url) => {
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) fail(`Descarga fallida (${response.status}): ${url}`);
  return response;
};

const downloadFile = async (url, outputPath) => {
  const response = await fetchResponse(url);
  await pipeline(response.body, createWriteStream(outputPath));
};

const sha256 = async (filePath) => {
  const hash = createHash('sha256');
  await pipeline(createReadStream(filePath), hash);
  return hash.digest('hex');
};

const readFrontendToken = async () => {
  const envPath = path.join(frontendDir, '.env');
  let envContent;
  try {
    envContent = await readFile(envPath, 'utf8');
  } catch {
    fail('No se encontro pos_frontend/.env. Configura VITE_HARDWARE_AGENT_TOKEN y vuelve a compilar el frontend.');
  }

  const tokenLine = envContent.split(/\r?\n/)
    .find((line) => /^\s*VITE_HARDWARE_AGENT_TOKEN\s*=/.test(line));
  if (!tokenLine) fail('Configura VITE_HARDWARE_AGENT_TOKEN en pos_frontend/.env antes de generar el instalador.');

  const token = tokenLine.replace(/^\s*VITE_HARDWARE_AGENT_TOKEN\s*=\s*/, '').trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!/^[A-Za-z0-9._~-]{16,}$/.test(token)) {
    fail('VITE_HARDWARE_AGENT_TOKEN debe tener al menos 16 caracteres URL-safe y no estar vacio.');
  }

  const containsToken = async (directory) => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return false;
    }
    for (const entry of entries) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (await containsToken(entryPath)) return true;
      } else if (/\.(?:js|mjs)$/.test(entry.name)) {
        if ((await readFile(entryPath, 'utf8')).includes(token)) return true;
      }
    }
    return false;
  };

  if (!await containsToken(path.join(frontendDir, 'dist'))) {
    fail('El frontend compilado no contiene el token del agente configurado. Vuelve a compilar pos_frontend antes del instalador.');
  }

  return token;
};

const downloadNodeRuntime = async (target, destination) => {
  const platform = target === 'windows' ? 'win' : 'linux';
  const archiveName = target === 'windows'
    ? `node-${nodeVersion}-win-x64.zip`
    : `node-${nodeVersion}-linux-x64.tar.xz`;
  const baseUrl = `https://nodejs.org/dist/${nodeVersion}`;
  const temporaryDir = await mkdtemp(path.join(os.tmpdir(), 'hardware-agent-node-'));
  const archivePath = path.join(temporaryDir, archiveName);
  const extractedDir = path.join(temporaryDir, 'extracted');
  const shasumsResponse = await fetchResponse(`${baseUrl}/SHASUMS256.txt`);
  const shasums = await shasumsResponse.text();
  const checksumLine = shasums
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .find((parts) => parts.at(-1) === archiveName);

  if (!checksumLine || !/^[a-f0-9]{64}$/i.test(checksumLine[0])) {
    fail(`No se encontro un SHA-256 oficial para ${archiveName}.`);
  }

  try {
    await downloadFile(`${baseUrl}/${archiveName}`, archivePath);
    const actualChecksum = await sha256(archivePath);
    if (actualChecksum.toLowerCase() !== checksumLine[0].toLowerCase()) {
      fail(`El SHA-256 de ${archiveName} no coincide con el publicado por Node.js.`);
    }

    await mkdir(extractedDir);
    const runtimeFolderName = `node-${nodeVersion}-${platform}-x64`;
    const executableName = target === 'windows' ? 'node.exe' : 'node';
    const archiveExecutable = target === 'windows'
      ? `${runtimeFolderName}/node.exe`
      : `${runtimeFolderName}/bin/node`;
    run('tar', ['-xf', archivePath, '-C', extractedDir, archiveExecutable]);
    const executableSource = target === 'windows'
      ? path.join(extractedDir, runtimeFolderName, executableName)
      : path.join(extractedDir, runtimeFolderName, 'bin', executableName);
    await access(executableSource);
    await mkdir(destination, { recursive: true });
    await copyFile(executableSource, path.join(destination, executableName));
    if (target === 'linux') await chmod(path.join(destination, executableName), 0o755);
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
};

const installDependencies = async (appDir) => {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    fail('Ejecuta el generador con npm (por ejemplo: npm run build), no directamente con node.');
  }
  run(process.execPath, [npmCli, 'ci', '--omit=dev'], { cwd: appDir });
};

const assertSerialportPrebuilds = async (nodeModulesDir) => {
  const bindingsDir = path.join(nodeModulesDir, '@serialport', 'bindings-cpp', 'prebuilds');
  const requiredPrebuilds = [
    path.join(bindingsDir, 'win32-x64', '@serialport+bindings-cpp.node'),
    path.join(bindingsDir, 'linux-x64', '@serialport+bindings-cpp.glibc.node')
  ];
  for (const prebuild of requiredPrebuilds) {
    try {
      await access(prebuild);
    } catch {
      fail(`Falta el binario nativo requerido para el destino: ${path.relative(nodeModulesDir, prebuild)}`);
    }
  }
};

const installLaunchers = async (targetDir, target, token) => {
  const environmentTemplate = await readFile(path.join(rootDir, '.env.example'), 'utf8');
  const configuredEnvironment = environmentTemplate
    .replace(/^HARDWARE_AGENT_TOKEN=.*$/m, `HARDWARE_AGENT_TOKEN=${token}`)
    .replace(/^HARDWARE_PRINTER_TRANSPORT=.*$/m, 'HARDWARE_PRINTER_TRANSPORT=auto');
  await writeFile(path.join(targetDir, '.env.example'), configuredEnvironment, 'utf8');
  await copyFile(path.join(rootDir, 'README.md'), path.join(targetDir, 'README-INSTALACION.txt'));

  if (target === 'windows') {
    await copyFile(path.join(rootDir, 'launch.cmd'), path.join(targetDir, 'launch.cmd'));
  } else {
    const launcherPath = path.join(targetDir, 'launch.sh');
    await copyFile(path.join(rootDir, 'launch.sh'), launcherPath);
    await chmod(launcherPath, 0o755);
  }
};

const createArchive = (targetDir, archivePath) => {
  run('tar', ['-czf', archivePath, '-C', distDir, path.basename(targetDir)]);
};

const findWindowsCompiler = () => {
  if (process.platform !== 'win32') {
    fail('Para generar HardwareAgent.exe, ejecuta build:windows en Windows con .NET Framework instalado.');
  }
  const windowsDirectory = process.env.WINDIR || 'C:\\Windows';
  const candidates = [
    path.join(windowsDirectory, 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe'),
    path.join(windowsDirectory, 'Microsoft.NET', 'Framework', 'v4.0.30319', 'csc.exe')
  ];
  const compiler = candidates.find((candidate) => existsSync(candidate));
  if (!compiler) fail('No se encontro csc.exe de .NET Framework para compilar HardwareAgent.exe.');
  return compiler;
};

const compileWindowsLauncher = (compiler, targetDir) => {
  run(compiler, [
    '/nologo',
    '/target:exe',
    `/out:${path.join(targetDir, 'HardwareAgent.exe')}`,
    path.join(rootDir, 'windows-launcher.cs')
  ]);
};

const compileWindowsUninstaller = (compiler, targetDir) => {
  run(compiler, [
    '/nologo',
    '/target:winexe',
    `/out:${path.join(targetDir, 'Uninstall.exe')}`,
    '/reference:System.Windows.Forms.dll',
    path.join(rootDir, 'windows-uninstaller.cs')
  ]);
};

const compileWindowsInstaller = (compiler, targetDir, temporaryDir) => {
  const payloadArchive = path.join(temporaryDir, 'windows-payload.zip');
  const installerPath = path.join(distDir, 'SSAXXON-POS-Hardware-Agent-Setup.exe');
  const powershell = path.join(
    process.env.WINDIR || 'C:\\Windows',
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe'
  );

  run(powershell, [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', path.join(rootDir, 'create-windows-payload.ps1'),
    targetDir,
    payloadArchive
  ]);
  run(compiler, [
    '/nologo',
    '/target:winexe',
    '/reference:System.Windows.Forms.dll',
    '/reference:System.IO.Compression.dll',
    '/reference:System.IO.Compression.FileSystem.dll',
    `/resource:${payloadArchive},WindowsPayload.zip`,
    `/out:${installerPath}`,
    path.join(rootDir, 'windows-installer.cs')
  ]);
  console.log(`Instalador Windows creado en ${installerPath}`);
};

const build = async () => {
  assertRuntimeVersion();
  await access(path.join(sourceDir, 'server.js'));
  await access(path.join(sourceDir, 'package-lock.json'));
  await access(path.join(rootDir, '.env.example'));

  const hostTarget = process.platform === 'win32' ? 'windows' : process.platform === 'linux' ? 'linux' : null;
  if (!hostTarget) fail(`Sistema no soportado para instalar dependencias nativas: ${process.platform}.`);

  const requestedTarget = process.argv[2] || 'all';
  const targets = requestedTarget === 'all' ? supportedTargets : [requestedTarget];
  if (targets.some((target) => !supportedTargets.includes(target))) {
    fail('Uso: npm run build [windows|linux|all]');
  }
  const windowsCompiler = targets.includes('windows') ? findWindowsCompiler() : null;
  const frontendToken = await readFrontendToken();

  await mkdir(distDir, { recursive: true });
  const temporaryDir = await mkdtemp(path.join(os.tmpdir(), 'hardware-agent-build-'));
  const stagedAppDir = path.join(temporaryDir, 'app');

  try {
    await mkdir(stagedAppDir);
    await copyFile(path.join(sourceDir, 'package.json'), path.join(stagedAppDir, 'package.json'));
    await copyFile(path.join(sourceDir, 'package-lock.json'), path.join(stagedAppDir, 'package-lock.json'));
    await copyFile(path.join(sourceDir, 'server.js'), path.join(stagedAppDir, 'server.js'));
    await cp(path.join(sourceDir, 'src'), path.join(stagedAppDir, 'src'), { recursive: true });
    await installDependencies(stagedAppDir);
    await assertSerialportPrebuilds(path.join(stagedAppDir, 'node_modules'));

    for (const target of targets) {
      const targetName = `${target}-x64`;
      const targetDir = path.join(distDir, targetName);
      const archivePath = path.join(distDir, `ssaxxon-pos-hardware-agent-${targetName}.tar.gz`);
      await rm(targetDir, { recursive: true, force: true });
      await rm(archivePath, { force: true });
      if (target === 'windows') {
        await rm(path.join(distDir, `ssaxxon-pos-hardware-agent-${targetName}.zip`), { force: true });
      }
      await mkdir(path.join(targetDir, 'runtime'), { recursive: true });
      await cp(stagedAppDir, path.join(targetDir, 'app'), { recursive: true });
      await installLaunchers(targetDir, target, frontendToken);
      if (target === 'windows') {
        compileWindowsLauncher(windowsCompiler, targetDir);
        compileWindowsUninstaller(windowsCompiler, targetDir);
      }
      await downloadNodeRuntime(target, path.join(targetDir, 'runtime'));
      createArchive(targetDir, archivePath);
      if (target === 'windows') compileWindowsInstaller(windowsCompiler, targetDir, temporaryDir);
      console.log(`Paquete ${targetName} creado en ${targetDir}`);
    }
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
};

build().catch((error) => {
  console.error(`Error al generar paquetes: ${error.message}`);
  process.exitCode = 1;
});
