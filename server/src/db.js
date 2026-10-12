import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const DEFAULT_SETTINGS = {
  download_dir: config.defaultDownloadDir,
  max_concurrent: '2',
  max_attempts: '5',
  retry_delay_ms: '15000',
  // 1 — заменять готовый файл при повторной загрузке (без « (1)»)
  overwrite_existing: '1',
  // Медиатека: пусто — качать в папку загрузок; иначе абсолютный путь
  // (начальное значение можно задать переменной LIBRARY_DIR)
  library_dir: config.defaultLibraryDir,
  // Разделы сайта → папки медиатеки (редактируется в веб-морде)
  library_categories: [
    'films = Фильмы',
    'series = Сериалы',
    'animation = Аниме',
    'cartoons = Мультики',
    'documentary = Документальные',
  ].join('\n'),
  // Год — только на папке; серии — в подпапке «Season N»; имя субтитра
  // совпадает с именем видео, а язык — кодом в суффиксе (American Psycho.rus.vtt),
  // как это ждёт Jellyfin.
  filename_template_film: '%orig_title%%year_part%/%orig_title%',
  filename_template_series: '%orig_title%%year_part%/%season_folder%/%orig_title%%sxxexx%',
  filename_template_subtitle:
    '%orig_title%%year_part%/%season_folder%/%orig_title%%sxxexx%.%subtitle_lang%',
};

/** Старые значения по умолчанию — заменяются на новые автоматически. */
const LEGACY_DEFAULTS = [
  // самая первая версия сервера
  ['filename_template_film', '%orig_title% [%quality%]'],
  [
    'filename_template_series',
    '%orig_title%/S%season_id%/%orig_title% S%season_id%E%episode_id% [%quality%]',
  ],
  // версия без года
  ['filename_template_film', '%orig_title%/%orig_title%'],
  ['filename_template_series', '%orig_title%/%orig_title% S%season_id%E%episode_id%'],
  ['filename_template_subtitle', '%orig_title%/%orig_title%%sxxexx% [%subtitle_lang%]'],
  // версия с годом в имени файла
  ['filename_template_film', '%orig_title%%year_part%/%orig_title%%year_part%'],
  [
    'filename_template_series',
    '%orig_title%%year_part%/%orig_title%%year_part% S%season_id%E%episode_id%',
  ],
  [
    'filename_template_subtitle',
    '%orig_title%%year_part%/%orig_title%%year_part%%sxxexx% [%subtitle_lang%]',
  ],
  // версия с «Season N» в шаблоне литералом (у фильмов появлялась папка Season)
  [
    'filename_template_series',
    '%orig_title%%year_part%/Season %season_id%/%orig_title%%sxxexx%',
  ],
  [
    'filename_template_subtitle',
    '%orig_title%%year_part%/Season %season_id%/%orig_title%%sxxexx% [%subtitle_lang%]',
  ],
  // версия с языком в квадратных скобках («[Русский]» вместо кода «.rus»)
  [
    'filename_template_subtitle',
    '%orig_title%%year_part%/%season_folder%/%orig_title%%sxxexx% [%subtitle_lang%]',
  ],
];

/**
 * База открывается лениво: импорт модуля не должен ничего создавать на диске
 * (важно для `--help`/`--version` и для запуска из read-only окружения Nix).
 */
let dbInstance = null;

function initDb(db) {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      status          TEXT    NOT NULL DEFAULT 'queued',
      url             TEXT    NOT NULL,
      alt_urls        TEXT    NOT NULL DEFAULT '[]',
      filename        TEXT,
      referer         TEXT,
      group_key       TEXT,
      movie_id        TEXT,
      title           TEXT,
      orig_title      TEXT,
      quality         TEXT,
      voiceover       TEXT,
      season          TEXT,
      season_title    TEXT,
      year            TEXT,
      episode         TEXT,
      episode_title   TEXT,
      file_type       TEXT    NOT NULL DEFAULT 'video',
      subtitle_lang   TEXT,
      subtitle_lang_code TEXT,
      total_bytes     INTEGER NOT NULL DEFAULT 0,
      received_bytes  INTEGER NOT NULL DEFAULT 0,
      attempts        INTEGER NOT NULL DEFAULT 0,
      next_attempt_at INTEGER NOT NULL DEFAULT 0,
      error           TEXT,
      file_path       TEXT,
      created_at      INTEGER NOT NULL,
      started_at      INTEGER,
      finished_at     INTEGER,
      queue_hidden    INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_queue ON tasks(status, next_attempt_at, id);

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Миграция существующих баз: добавляем колонки, которых в них ещё нет.
  const columns = db.prepare('PRAGMA table_info(tasks)').all().map((row) => row.name);
  for (const [name, type] of [
    ['year', 'TEXT'],
    ['subtitle_lang_code', 'TEXT'],
    ['queue_hidden', 'INTEGER NOT NULL DEFAULT 0'],
  ]) {
    if (!columns.includes(name)) db.exec(`ALTER TABLE tasks ADD COLUMN ${name} ${type}`);
  }

  const insert = db.prepare('INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)');
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) insert.run(key, String(value));

  // Миграция: если пользователь не менял шаблоны, обновляем их до новых.
  const update = db.prepare('UPDATE settings SET value = ? WHERE key = ? AND value = ?');
  for (const [key, legacyValue] of LEGACY_DEFAULTS) {
    update.run(String(DEFAULT_SETTINGS[key]), key, legacyValue);
  }
}

export function getDb() {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  dbInstance = new DatabaseSync(config.dbFile);
  initDb(dbInstance);
  return dbInstance;
}

const stmtCache = new Map();
function q(sql) {
  let stmt = stmtCache.get(sql);
  if (!stmt) {
    stmt = getDb().prepare(sql);
    stmtCache.set(sql, stmt);
  }
  return stmt;
}

const TASK_COLUMNS = [
  'status',
  'url',
  'alt_urls',
  'filename',
  'referer',
  'group_key',
  'movie_id',
  'title',
  'orig_title',
  'quality',
  'voiceover',
  'season',
  'season_title',
  'year',
  'episode',
  'episode_title',
  'file_type',
  'subtitle_lang',
  'subtitle_lang_code',
  'total_bytes',
  'received_bytes',
  'attempts',
  'next_attempt_at',
  'error',
  'file_path',
  'created_at',
  'started_at',
  'finished_at',
  'queue_hidden',
];

function normalizeValue(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value;
}

export function getSettings() {
  const rows = q('SELECT key, value FROM settings').all();
  const result = { ...DEFAULT_SETTINGS };
  for (const row of rows) result[row.key] = row.value;
  return result;
}

export function setSettings(patch) {
  const stmt = q(
    'INSERT INTO settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    stmt.run(key, String(value));
  }
}

export function createTask(input) {
  const row = {
    status: 'queued',
    url: input.url,
    alt_urls: JSON.stringify(Array.isArray(input.alt_urls) ? input.alt_urls : []),
    filename: input.filename,
    referer: input.referer,
    group_key: input.group_key,
    movie_id: input.movie_id,
    title: input.title,
    orig_title: input.orig_title,
    quality: input.quality,
    voiceover: input.voiceover,
    season: input.season,
    season_title: input.season_title,
    year: input.year,
    episode: input.episode,
    episode_title: input.episode_title,
    file_type: input.file_type === 'subtitle' ? 'subtitle' : 'video',
    subtitle_lang: input.subtitle_lang,
    subtitle_lang_code: input.subtitle_lang_code,
    total_bytes: Number(input.total_bytes) || 0,
    received_bytes: 0,
    attempts: 0,
    next_attempt_at: 0,
    error: null,
    file_path: null,
    created_at: Date.now(),
    started_at: null,
    finished_at: null,
  };

  const keys = TASK_COLUMNS.filter((key) => key in row);
  const sql = `INSERT INTO tasks (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')}) RETURNING *`;
  return q(sql).get(...keys.map((key) => normalizeValue(row[key])));
}

/** Атомарно забирает следующую задачу из очереди (queued + время попытки пришло). */
export function claimNextTask(now) {
  return q(
    `UPDATE tasks SET status = 'downloading', started_at = ?, error = NULL
     WHERE id = (
       SELECT id FROM tasks
       WHERE status = 'queued' AND next_attempt_at <= ?
       ORDER BY id LIMIT 1
     )
     RETURNING *`,
  ).get(now, now);
}

export function listTaskRowsByStatuses(statuses) {
  if (!statuses.length) return [];
  const placeholders = statuses.map(() => '?').join(', ');
  return q(
    `SELECT id, filename, status FROM tasks WHERE status IN (${placeholders}) ORDER BY id`,
  ).all(...statuses);
}

export function getTask(id) {
  return q('SELECT * FROM tasks WHERE id = ?').get(id);
}

export function listTasks(limit = 300) {
  return q(
    `SELECT * FROM tasks
     ORDER BY CASE status
       WHEN 'downloading' THEN 0
       WHEN 'queued' THEN 1
       WHEN 'paused' THEN 2
       WHEN 'error' THEN 3
       ELSE 4 END,
       id DESC
     LIMIT ?`,
  ).all(limit);
}

export function updateTask(id, patch) {
  const keys = TASK_COLUMNS.filter((key) => key in patch);
  if (keys.length === 0) return;
  const sql = `UPDATE tasks SET ${keys.map((key) => `${key} = ?`).join(', ')} WHERE id = ?`;
  q(sql).run(...keys.map((key) => normalizeValue(patch[key])), id);
}

export function deleteTask(id) {
  q('DELETE FROM tasks WHERE id = ?').run(id);
}

export function deleteTasksByStatuses(statuses) {
  if (!statuses.length) return 0;
  const placeholders = statuses.map(() => '?').join(', ');
  const info = q(`DELETE FROM tasks WHERE status IN (${placeholders})`).run(...statuses);
  return Number(info.changes);
}

/** «Очистить завершённые»: убирает задачи из списка очереди, не удаляя записи (они остаются в истории). */
export function hideTasksByStatuses(statuses) {
  if (!statuses.length) return 0;
  const placeholders = statuses.map(() => '?').join(', ');
  const info = q(
    `UPDATE tasks SET queue_hidden = 1 WHERE status IN (${placeholders}) AND queue_hidden = 0`,
  ).run(...statuses);
  return Number(info.changes);
}

export function retryFailedTasks() {
  const info = q(
    `UPDATE tasks SET status = 'queued', attempts = 0, next_attempt_at = 0, error = NULL,
     queue_hidden = 0
     WHERE status = 'error'`,
  ).run();
  return Number(info.changes);
}

/** После рестарта сервера возвращаем «зависшие» загрузки в очередь (докачаются с .part). */
export function resetInterruptedTasks() {
  const info = q(
    `UPDATE tasks SET status = 'queued', started_at = NULL WHERE status = 'downloading'`,
  ).run();
  return Number(info.changes);
}

/** Сколько задач и файлов уже есть по фильму (для предупреждения о дубликатах). */
export function movieSummary(movieId) {
  const rows = q(
    'SELECT status, file_path FROM tasks WHERE movie_id = ? AND movie_id IS NOT NULL',
  ).all(String(movieId));

  const summary = {
    movieId: String(movieId),
    total: rows.length,
    done: 0,
    downloading: 0,
    queued: 0,
    paused: 0,
    error: 0,
    canceled: 0,
    filesOnDisk: 0,
  };

  for (const row of rows) {
    if (summary[row.status] !== undefined) summary[row.status] += 1;
    if (row.file_path) {
      try {
        if (fs.existsSync(row.file_path)) summary.filesOnDisk += 1;
      } catch {}
    }
  }

  return summary;
}

export function getStats() {
  const rows = q('SELECT status, COUNT(*) AS count FROM tasks GROUP BY status').all();
  const stats = { queued: 0, downloading: 0, paused: 0, done: 0, error: 0, canceled: 0 };
  for (const row of rows) stats[row.status] = Number(row.count);
  return stats;
}

export function serializeTask(row) {
  let altUrls = [];
  try {
    altUrls = JSON.parse(row.alt_urls || '[]');
  } catch {
    altUrls = [];
  }
  return {
    id: row.id,
    status: row.status,
    url: row.url,
    altUrls,
    filename: row.filename,
    referer: row.referer,
    movieId: row.movie_id,
    title: row.title,
    origTitle: row.orig_title,
    quality: row.quality,
    voiceover: row.voiceover,
    season: row.season,
    seasonTitle: row.season_title,
    year: row.year,
    episode: row.episode,
    episodeTitle: row.episode_title,
    fileType: row.file_type,
    subtitleLang: row.subtitle_lang,
    subtitleLangCode: row.subtitle_lang_code,
    totalBytes: row.total_bytes,
    receivedBytes: row.received_bytes,
    attempts: row.attempts,
    error: row.error,
    filePath: row.file_path,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    queueHidden: row.queue_hidden === 1,
  };
}