import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import { config, usage } from './config.js';
import * as db from './db.js';
import * as downloader from './downloader.js';
import { createRequestHandler } from './api.js';
import { log, printBanner } from './logger.js';

// Справка и версия обрабатываются до любых действий (даже до открытия базы).
if (config.cli.help) {
  console.log(usage());
  process.exit(0);
}
if (config.cli.version) {
  console.log(config.version);
  process.exit(0);
}
if (config.cli.unknown.length > 0) {
  console.error(`Неизвестный аргумент: ${config.cli.unknown.join(', ')}`);
  console.error('Из командной строки меняется только порт; всё остальное — в веб-морде.');
  console.error('Справка: node src/index.js --help');
  process.exit(1);
}
if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
  console.error(`Некорректный порт: ${config.cli.port ?? config.port}`);
  console.error('Пример: node src/index.js --port 8081');
  process.exit(1);
}

const settings = db.getSettings();
fs.mkdirSync(settings.download_dir, { recursive: true });

const interrupted = db.resetInterruptedTasks();
if (interrupted > 0) {
  log.warn(`Возвращено в очередь после рестарта: ${interrupted} задач(и), докачаются с места обрыва`);
}

downloader.start();

const server = http.createServer(createRequestHandler());

server.listen(config.port, config.host, () => {
  const addresses = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const info of list || []) {
      if (info.family === 'IPv4' && !info.internal) addresses.push(info.address);
    }
  }

  printBanner({
    version: config.version,
    port: config.port,
    downloadDir: settings.download_dir,
    dbFile: config.dbFile,
    ffmpegOk: downloader.ffmpegAvailable(),
    authToken: config.authToken,
    addresses,
  });
});

/** Понятные ошибки вместо стектрейса. */
server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    log.error(`Порт ${config.port} уже занят — возможно, сервер уже запущен.`);
    log.info(`Запустите на другом порту: PORT=${config.port + 1} node src/index.js`);
    process.exit(1);
  }
  log.error(`Ошибка сервера: ${error?.stack || error}`);
  process.exit(1);
});

function shutdown(signal) {
  log.info(`${signal}: остановка сервера…`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('unhandledRejection', (error) => {
  log.error(`Необработанная ошибка: ${error?.stack || error}`);
});