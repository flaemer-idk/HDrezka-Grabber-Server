import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import * as db from './db.js';
import * as downloader from './downloader.js';
import { log } from './logger.js';
import { prepareTask } from './tasks.js';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function send(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 5 * 1024 * 1024) throw new Error('Слишком большой запрос');
    chunks.push(chunk);
  }
  if (size === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function checkAuth(req, url) {
  if (!config.authToken) return true;
  const header = req.headers['x-auth-token'];
  const query = url.searchParams.get('token');
  return header === config.authToken || query === config.authToken;
}

function freeSpace(dir) {
  try {
    const stat = fs.statfsSync(dir);
    return Number(stat.bavail) * Number(stat.bsize);
  } catch {
    return null;
  }
}

async function handleApi(req, res, url) {
  const method = req.method;
  const pathname = url.pathname;

  if (pathname === '/api/state' && method === 'GET') {
    const limit = Math.min(Number(url.searchParams.get('limit')) || 300, 1000);
    const settings = db.getSettings();
    return send(res, 200, {
      server: {
        version: config.version,
        node: process.version,
        ffmpeg: downloader.ffmpegAvailable(),
        downloadDir: settings.download_dir,
        freeSpace: freeSpace(settings.download_dir),
        active: downloader.activeCount(),
      },
      stats: db.getStats(),
      settings,
      tasks: db.listTasks(limit).map(db.serializeTask),
    });
  }

  if (pathname === '/api/tasks' && method === 'POST') {
    const body = await readJson(req);
    const incoming = Array.isArray(body) ? body : Array.isArray(body.tasks) ? body.tasks : [body];
    if (incoming.length === 0) return send(res, 400, { error: 'Пустой список задач' });
    if (incoming.length > 2000) return send(res, 400, { error: 'Слишком много задач за раз (максимум 2000)' });

    let normalized;
    try {
      normalized = incoming.map(prepareTask);
    } catch (error) {
      return send(res, 400, { error: String(error?.message || error) });
    }

    const created = normalized.map((task) => db.serializeTask(db.createTask(task)));
    log.info(
      `В очередь добавлено задач: ${created.length}` +
        (created[0] ? ` (${created[0].filename}${created.length > 1 ? ' и др.' : ''})` : ''),
    );
    return send(res, 201, { created: created.length, tasks: created });
  }

  if (pathname === '/api/tasks/cancel-all' && method === 'POST') {
    return send(res, 200, { canceled: await downloader.cancelAll() });
  }

  if (pathname === '/api/tasks/resume-all' && method === 'POST') {
    return send(res, 200, { resumed: downloader.resumeAll() });
  }

  if (pathname === '/api/tasks/clear-finished' && method === 'POST') {
    const body = await readJson(req).catch(() => ({}));
    const statuses = Array.isArray(body.statuses) ? body.statuses : ['done', 'error', 'canceled'];
    const allowed = statuses.filter((status) => ['done', 'error', 'canceled', 'paused'].includes(status));
    const deleted = db.deleteTasksByStatuses(allowed);
    return send(res, 200, { deleted });
  }

  if (pathname === '/api/tasks/retry-failed' && method === 'POST') {
    return send(res, 200, { retried: db.retryFailedTasks() });
  }

  const taskAction = /^\/api\/tasks\/(\d+)\/(cancel|pause|resume|retry)$/.exec(pathname);
  if (taskAction && method === 'POST') {
    const id = Number(taskAction[1]);
    const action = taskAction[2];
    const task = db.getTask(id);
    if (!task) return send(res, 404, { error: 'Задача не найдена' });

    let ok = false;
    if (action === 'cancel') ok = downloader.cancelTask(id);
    if (action === 'pause') ok = downloader.pauseTask(id);
    if (action === 'resume') ok = downloader.resumeTask(id);
    if (action === 'retry') ok = downloader.retryTask(id);

    return send(res, ok ? 200 : 409, { ok, task: db.serializeTask(db.getTask(id)) });
  }

  const taskIdMatch = /^\/api\/tasks\/(\d+)$/.exec(pathname);
  if (taskIdMatch && method === 'DELETE') {
    const id = Number(taskIdMatch[1]);
    const task = db.getTask(id);
    if (!task) return send(res, 404, { error: 'Задача не найдена' });
    if (['queued', 'downloading', 'paused'].includes(task.status)) {
      downloader.cancelTask(id);
    }
    if (url.searchParams.get('file') === '1' && task.file_path) {
      await fsp.rm(task.file_path, { force: true }).catch(() => {});
    }
    db.deleteTask(id);
    return send(res, 200, { ok: true });
  }

  const movieMatch = /^\/api\/movies\/([^/]+)$/.exec(pathname);
  if (movieMatch && method === 'GET') {
    return send(res, 200, db.movieSummary(decodeURIComponent(movieMatch[1])));
  }

  if (pathname === '/api/settings' && method === 'GET') {
    return send(res, 200, db.getSettings());
  }

  if (pathname === '/api/settings' && method === 'PATCH') {
    const body = await readJson(req);
    const patch = {};

    if (body.download_dir !== undefined) {
      const dir = String(body.download_dir).trim();
      if (!dir) return send(res, 400, { error: 'Пустой путь загрузок' });
      const resolved = path.resolve(dir);
      await fsp.mkdir(resolved, { recursive: true });
      patch.download_dir = resolved;
    }

    const numeric = [
      ['max_concurrent', 1, 16],
      ['max_attempts', 1, 50],
      ['retry_delay_ms', 1000, 3600000],
    ];
    for (const [key, min, max] of numeric) {
      if (body[key] === undefined) continue;
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < min || value > max) {
        return send(res, 400, { error: `Некорректное значение ${key} (${min}…${max})` });
      }
      patch[key] = Math.round(value);
    }

    if (body.library_dir !== undefined) {
      const dir = String(body.library_dir).trim();
      if (dir) {
        const resolvedLibrary = path.resolve(dir);
        await fsp.mkdir(resolvedLibrary, { recursive: true });
        patch.library_dir = resolvedLibrary;
      } else {
        patch.library_dir = '';
      }
    }

    if (body.library_categories !== undefined) {
      patch.library_categories = String(body.library_categories).replace(/\r/g, '').slice(0, 4000);
    }

    if (body.overwrite_existing !== undefined) {
      patch.overwrite_existing = body.overwrite_existing ? '1' : '0';
    }

    for (const key of ['filename_template_film', 'filename_template_series', 'filename_template_subtitle']) {
      if (body[key] === undefined) continue;
      const value = String(body[key]).trim();
      if (!value) return send(res, 400, { error: `Пустой шаблон ${key}` });
      patch[key] = value;
    }

    db.setSettings(patch);
    return send(res, 200, db.getSettings());
  }

  return send(res, 404, { error: 'Не найдено' });
}

async function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  const target = path.join(config.publicDir, path.normalize(pathname));
  if (!target.startsWith(config.publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const stat = await fsp.stat(target);
    if (stat.isDirectory()) throw new Error('directory');
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Не найдено');
  }
}

export function createRequestHandler() {
  return async function handle(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Auth-Token');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (url.pathname.startsWith('/api/')) {
        if (!checkAuth(req, url)) {
          return send(res, 401, { error: 'Неверный или отсутствующий токен' });
        }
        return await handleApi(req, res, url);
      }
      return await serveStatic(req, res, url);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) send(res, 500, { error: String(error?.message || error) });
      else res.end();
    }
  };
}