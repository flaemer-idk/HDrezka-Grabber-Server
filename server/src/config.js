import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

/**
 * Разбор аргументов командной строки.
 * Из командной строки меняется только порт (и --help/--version); всё остальное —
 * переменные окружения (для systemd/NixOS) и настройки в веб-морде.
 */
function parseCliArgs(argv) {
  const options = { unknown: [], help: false, version: false };

  for (let i = 0; i < argv.length; i++) {
    const argument = argv[i];
    const [name, inlineValue] = argument.split('=');

    if (name === '-h' || name === '--help') {
      options.help = true;
      continue;
    }
    if (name === '-v' || name === '--version') {
      options.version = true;
      continue;
    }
    if (name === '-p' || name === '--port') {
      const value = inlineValue !== undefined ? inlineValue : argv[++i];
      if (value === undefined) {
        options.unknown.push(`${name} (не указан номер порта)`);
      } else {
        options.port = value;
      }
      continue;
    }

    options.unknown.push(argument);
  }

  return options;
}

const cli = parseCliArgs(process.argv.slice(2));

export const config = {
  rootDir,
  version: packageJson.version,
  cli,

  host: process.env.HOST || '0.0.0.0',
  port: Number(cli.port ?? process.env.PORT ?? 8080),

  /** Если задан — все запросы к /api требуют заголовок X-Auth-Token или ?token= */
  authToken: process.env.AUTH_TOKEN || '',

  dbFile: process.env.DB_FILE || path.join(rootDir, 'data', 'grabber.db'),
  defaultDownloadDir: process.env.DOWNLOAD_DIR || path.join(rootDir, 'downloads'),
  /** Начальное значение папки медиатеки (нужно для NixOS-модуля); дальше — веб-морда. */
  defaultLibraryDir: process.env.LIBRARY_DIR || '',
  publicDir: path.join(rootDir, 'public'),

  /** Путь к ffmpeg (нужен только для HLS/m3u8). */
  ffmpegPath: process.env.FFMPEG_PATH || 'ffmpeg',

  userAgent:
    process.env.USER_AGENT ||
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

export function usage() {
  return `HDrezka Grabber Server ${config.version} — сервер загрузок с веб-мордой

Использование:
  hdrezka-grabber-server [--port <номер>]
  node src/index.js [--port <номер>]

Опции:
  -h, --help          показать эту справку и выйти
  -v, --version       показать версию и выйти
  -p, --port <номер>  порт сервера (по умолчанию 8080, переменная PORT)

Всё остальное настраивается в веб-морде: папка загрузок и медиатеки,
шаблоны имён, категории, лимиты загрузок, токен доступа.
Переменные окружения (для systemd/NixOS): PORT, HOST, DB_FILE, DOWNLOAD_DIR,
LIBRARY_DIR (начальное значение папки медиатеки), AUTH_TOKEN, FFMPEG_PATH, USER_AGENT.

Примеры:
  node src/index.js --port 8081
  PORT=8081 node src/index.js`;
}