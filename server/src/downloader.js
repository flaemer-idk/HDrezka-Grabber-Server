import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn, spawnSync } from 'node:child_process';
import { config } from './config.js';
import * as db from './db.js';
import { log } from './logger.js';
import { buildFilename, formatBytes, sleep, uniquifyPath } from './util.js';

/** id задачи → { controller, mode: 'run' | 'pause' | 'cancel' } */
const active = new Map();
let runningWorkers = 0;

let ffmpegChecked = false;
let ffmpegOk = false;

export function ffmpegAvailable() {
  if (!ffmpegChecked) {
    try {
      const result = spawnSync(config.ffmpegPath, ['-version'], { stdio: 'ignore' });
      ffmpegOk = result.status === 0;
    } catch {
      ffmpegOk = false;
    }
    ffmpegChecked = true;
  }
  return ffmpegOk;
}

export function start() {
  setInterval(fillWorkers, 500).unref();
  fillWorkers();
}

function maxConcurrent() {
  const value = Number(db.getSettings().max_concurrent);
  return Number.isFinite(value) && value > 0 ? Math.min(value, 16) : 2;
}

function fillWorkers() {
  while (runningWorkers < maxConcurrent()) {
    runningWorkers++;
    worker()
      .catch((error) => log.error(`Воркер упал: ${error?.stack || error}`))
      .finally(() => {
        runningWorkers--;
      });
  }
}

async function worker() {
  while (true) {
    if (runningWorkers > maxConcurrent()) return; // лимит уменьшили — лишние воркеры выходят
    const task = db.claimNextTask(Date.now());
    if (!task) {
      await sleep(500);
      continue;
    }
    await processTask(task);
  }
}

/** Куда класть файл: медиатека (если настроена) или папка загрузок. */
function taskBaseDir(settings) {
  const library = String(settings.library_dir ?? '').trim();
  return library || settings.download_dir;
}

async function processTask(task) {
  const settings = db.getSettings();
  const relativePath = task.filename || buildFilename(task, settings);
  const finalPath = path.join(taskBaseDir(settings), relativePath);
  // Уникальный временный файл на задачу: две загрузки с одинаковым именем
  // не мешают друг другу, а после рестарта сервера докачка продолжается.
  let partPath = `${finalPath}.${task.id}.part`;

  // Совместимость со старой схемой имён: если есть «<файл>.part» от прежней
  // версии — подхватываем его, чтобы не качать заново.
  try {
    await fsp.access(partPath);
  } catch {
    try {
      await fsp.access(`${finalPath}.part`);
      await fsp.rename(`${finalPath}.part`, partPath);
      log.info(`#${task.id} найден старый .part — докачиваем его`);
    } catch {}
  }
  const entry = { controller: new AbortController(), mode: 'run' };

  active.set(task.id, entry);

  try {
    await fsp.mkdir(path.dirname(finalPath), { recursive: true });
    db.updateTask(task.id, { started_at: Date.now(), filename: relativePath, error: null });
    log.info(`#${task.id} старт: ${relativePath}`);

    const isHls = /\.m3u8(\?|$)/i.test(task.url);
    if (isHls) {
      await downloadHls(task, finalPath, partPath, entry);
    } else {
      await downloadHttp(task, partPath, entry);
    }

    if (entry.mode === 'cancel') {
      await cleanup(partPath);
      db.updateTask(task.id, { status: 'canceled', received_bytes: 0, finished_at: Date.now() });
      log.warn(`#${task.id} отменена до завершения`);
      return;
    }

    // Перезапись включена: готовый файл заменяется, « (1)» не плодится.
    // Замена происходит только после полной загрузки (rename), так что
    // старый файл не пострадает, если новая загрузка оборвётся.
    const uniquePath = settings.overwrite_existing === '1' ? finalPath : await uniquifyPath(finalPath);
    await fsp.rename(partPath, uniquePath);
    const stat = await fsp.stat(uniquePath);
    db.updateTask(task.id, {
      status: 'done',
      received_bytes: stat.size,
      total_bytes: stat.size,
      file_path: uniquePath,
      finished_at: Date.now(),
      error: null,
    });
    const seconds = ((Date.now() - (task.started_at ?? Date.now())) / 1000).toFixed(1);
    log.done(`#${task.id} готово за ${seconds} c: ${uniquePath} (${formatBytes(stat.size)})`);
  } catch (error) {
    await handleFailure(task, error, partPath, finalPath, entry);
  } finally {
    active.delete(task.id);
  }
}

async function cleanup(partPath) {
  // Убираем только собственные временные файлы (.part и .part.mp4 для HLS),
  // не трогая возможные готовые файлы с тем же именем.
  for (const target of [partPath, partPath + '.mp4']) {
    await fsp.rm(target, { force: true }).catch(() => {});
  }
}

async function handleFailure(task, error, partPath, finalPath, entry) {
  if (entry.mode === 'pause') {
    db.updateTask(task.id, { status: 'paused' });
    log.warn(`#${task.id} на паузе (докачается при продолжении)`);
    return;
  }
  if (entry.mode === 'cancel') {
    await cleanup(partPath);
    db.updateTask(task.id, { status: 'canceled', received_bytes: 0, finished_at: Date.now() });
    log.warn(`#${task.id} отменена`);
    return;
  }

  const message = String(error?.message || error);
  const settings = db.getSettings();
  const attempts = Number(task.attempts || 0) + 1;
  const maxAttempts = Math.max(1, Number(settings.max_attempts) || 5);
  const baseDelay = Math.max(1000, Number(settings.retry_delay_ms) || 15000);

  if (attempts >= maxAttempts) {
    db.updateTask(task.id, { status: 'error', attempts, error: message, finished_at: Date.now() });
    log.error(`#${task.id} ошибка (попытка ${attempts}/${maxAttempts}): ${message}`);
    return;
  }

  const delay = Math.min(baseDelay * attempts, 5 * 60 * 1000);
  db.updateTask(task.id, {
    status: 'queued',
    attempts,
    error: message,
    next_attempt_at: Date.now() + delay,
  });
  log.warn(
    `#${task.id} сбой (попытка ${attempts}/${maxAttempts}), повтор через ${Math.round(delay / 1000)} c: ${message}`,
  );
}

/** Скачивание обычного файла (mp4/vtt) с Range-докачкой. */
async function downloadHttp(task, partPath, entry) {
  let startByte = 0;
  try {
    const stat = await fsp.stat(partPath);
    if (stat.size > 0) startByte = stat.size;
  } catch {}

  const urls = [task.url, ...safeJsonArray(task.alt_urls)];
  let lastError = null;

  for (const url of urls) {
    try {
      await fetchToFile({ task, url, partPath, startByte, entry });
      return;
    } catch (error) {
      if (entry.controller.signal.aborted) throw error;
      lastError = error;
      startByte = 0;
      try {
        const stat = await fsp.stat(partPath);
        startByte = stat.size;
      } catch {}
      log.warn(`#${task.id} URL не подошёл (${url}): ${error?.message || error}`);
    }
  }
  throw lastError ?? new Error('Нет доступных URL');
}

/**
 * HTTP(S) GET на core-модулях с редиректами.
 * Намеренно не fetch(): парсер undici в этой ситуации роняет ВЕСЬ процесс
 * (AssertionError: assert(!this.paused) в Parser.finish), если соединение
 * закрывают, пока тело стоит на паузе из-за backpressure (быстрый источник +
 * медленный диск). Core-парсер (llhttp) такое переживает: поток просто
 * завершается с ошибкой, и задача уходит на повтор.
 */
function httpGet(url, headers, signal, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const transport = url.startsWith('https:') ? https : http;
    const req = transport.get(url, { headers }, (res) => {
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if ([301, 302, 303, 307, 308].includes(status) && location && redirectsLeft > 0) {
        res.resume();
        let next;
        try {
          next = new URL(location, url).toString();
        } catch {
          settled = true;
          reject(new Error(`Некорректный редирект: ${location}`));
          return;
        }
        settled = true;
        resolve(httpGet(next, headers, signal, redirectsLeft - 1));
        return;
      }
      settled = true;
      resolve(res);
    });
    req.on('error', (error) => {
      if (!settled) reject(error);
    });
    if (signal) {
      if (signal.aborted) {
        settled = true;
        req.destroy();
        reject(new Error('Загрузка прервана'));
        return;
      }
      signal.addEventListener(
        'abort',
        () => {
          req.destroy(new Error('Загрузка прервана'));
        },
        { once: true },
      );
    }
  });
}

async function fetchToFile({ task, url, partPath, startByte, entry }) {
  const headers = {
    'User-Agent': config.userAgent,
    Accept: '*/*',
    'Accept-Encoding': 'identity',
  };
  if (task.referer) headers.Referer = task.referer;
  if (startByte > 0) headers.Range = `bytes=${startByte}-`;

  const res = await httpGet(url, headers, entry.controller.signal);

  if (res.statusCode !== 200 && res.statusCode !== 206) {
    const statusLine = `HTTP ${res.statusCode} ${res.statusMessage || ''}`.trim();
    res.resume(); // освободить соединение
    throw new Error(statusLine);
  }

  const isPartial = res.statusCode === 206;
  const append = isPartial && startByte > 0;
  let received = append ? startByte : 0;
  let total = 0;

  if (isPartial) {
    const match = /bytes\s+\d+-\d+\/(\d+)/i.exec(res.headers['content-range'] || '');
    total = match ? Number(match[1]) : 0;
  } else {
    total = Number(res.headers['content-length'] || 0);
  }
  if (!total && task.total_bytes) total = Number(task.total_bytes);

  db.updateTask(task.id, { total_bytes: total, received_bytes: received });

  let lastUpdate = 0;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      const now = Date.now();
      if (now - lastUpdate > 500) {
        lastUpdate = now;
        db.updateTask(task.id, { received_bytes: received, total_bytes: total });
      }
      callback(null, chunk);
    },
  });

  await pipeline(
    res,
    counter,
    fs.createWriteStream(partPath, { flags: append ? 'a' : 'w' }),
    { signal: entry.controller.signal },
  );

  db.updateTask(task.id, { received_bytes: received, total_bytes: total });

  if (total > 0 && received !== total) {
    throw new Error(`Размер не совпал: получено ${received} из ${total} байт`);
  }
}

/** Скачивание HLS-плейлиста через ffmpeg (требуется ffmpeg в PATH). */
async function downloadHls(task, finalPath, partPath, entry) {
  if (!ffmpegAvailable()) {
    throw new Error('Для ссылок .m3u8 нужен ffmpeg (установите его или добавьте в PATH)');
  }

  const tempPath = finalPath + '.part.mp4';
  const referer = task.referer || safeOrigin(task.url);
  const headerLines = `Referer: ${referer}\r\nUser-Agent: ${config.userAgent}\r\n`;

  const args = [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-headers',
    headerLines,
    '-i',
    task.url,
    '-c',
    'copy',
    '-bsf:a',
    'aac_adtstoasc',
    tempPath,
  ];

  await new Promise((resolve, reject) => {
    const proc = spawn(config.ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';

    const timer = setInterval(async () => {
      try {
        const stat = await fsp.stat(tempPath);
        db.updateTask(task.id, { received_bytes: stat.size });
      } catch {}
    }, 1000);

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      if (stderr.length > 4000) stderr = stderr.slice(-4000);
    });

    const onAbort = () => proc.kill('SIGKILL');
    entry.controller.signal.addEventListener('abort', onAbort, { once: true });

    proc.on('error', (error) => {
      clearInterval(timer);
      reject(error);
    });

    proc.on('close', (code) => {
      clearInterval(timer);
      entry.controller.signal.removeEventListener('abort', onAbort);
      if (entry.controller.signal.aborted) {
        reject(new Error('Загрузка прервана'));
        return;
      }
      if (code !== 0) {
        reject(new Error(`ffmpeg завершился с кодом ${code}: ${stderr.trim()}`));
        return;
      }
      resolve();
    });
  });

  await fsp.rename(tempPath, partPath);
}

function safeOrigin(url) {
  try {
    return new URL(url).origin + '/';
  } catch {
    return '';
  }
}

function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

/** Отменяет всё, что стоит в очереди, качается или на паузе. */
export async function cancelAll() {
  const rows = db.listTaskRowsByStatuses(['queued', 'downloading', 'paused']);
  const baseDir = taskBaseDir(db.getSettings());

  for (const row of rows) {
    const entry = active.get(row.id);
    if (entry) {
      entry.mode = 'cancel';
      entry.controller.abort();
      continue;
    }
    db.updateTask(row.id, { status: 'canceled', received_bytes: 0, finished_at: Date.now() });
    if (row.filename) {
      await fsp.rm(`${path.join(baseDir, row.filename)}.${row.id}.part`, { force: true }).catch(() => {});
      await fsp.rm(`${path.join(baseDir, row.filename)}.${row.id}.part.mp4`, { force: true }).catch(() => {});
    }
  }

  if (rows.length > 0) log.warn(`Отменены все задачи: ${rows.length}`);
  return rows.length;
}

/** Возобновляет все задачи, стоящие на паузе. */
export function resumeAll() {
  const rows = db.listTaskRowsByStatuses(['paused']);
  for (const row of rows) {
    db.updateTask(row.id, { status: 'queued', next_attempt_at: 0, error: null });
  }
  if (rows.length > 0) log.info(`Возобновлены задачи: ${rows.length}`);
  return rows.length;
}

/** Ставит на паузу всё, что качается или стоит в очереди. */
export function pauseAll() {
  const rows = db.listTaskRowsByStatuses(['queued', 'downloading']);
  for (const row of rows) {
    const entry = active.get(row.id);
    if (entry) {
      // активная загрузка: прерываем, статус «paused» выставит воркер
      entry.mode = 'pause';
      entry.controller.abort();
      continue;
    }
    db.updateTask(row.id, { status: 'paused' });
  }
  if (rows.length > 0) log.warn(`Поставлены на паузу задачи: ${rows.length}`);
  return rows.length;
}

export function cancelTask(id) {
  const entry = active.get(id);
  if (entry) {
    entry.mode = 'cancel';
    entry.controller.abort();
    return true;
  }
  const task = db.getTask(id);
  if (task && !['done', 'error', 'canceled'].includes(task.status)) {
    db.updateTask(id, { status: 'canceled', finished_at: Date.now() });
    return true;
  }
  return false;
}

export function pauseTask(id) {
  const entry = active.get(id);
  if (entry) {
    entry.mode = 'pause';
    entry.controller.abort();
    return true;
  }
  const task = db.getTask(id);
  if (task?.status === 'queued') {
    db.updateTask(id, { status: 'paused' });
    return true;
  }
  return false;
}

export function resumeTask(id) {
  const task = db.getTask(id);
  if (!task) return false;
  if (task.status !== 'paused' && task.status !== 'error') return false;
  db.updateTask(id, { status: 'queued', next_attempt_at: 0, error: null });
  return true;
}

export function retryTask(id) {
  const task = db.getTask(id);
  if (!task) return false;
  db.updateTask(id, {
    status: 'queued',
    attempts: 0,
    next_attempt_at: 0,
    error: null,
    queue_hidden: 0,
  });
  return true;
}

export function activeCount() {
  return active.size;
}