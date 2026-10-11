import * as db from './db.js';
import { buildFilename, filenameFromUrl } from './util.js';

/**
 * Приводит входящую задачу (от расширения, веб-морды или резолвера страниц)
 * к виду, пригодному для записи в БД, и собирает имя файла.
 */
export function prepareTask(raw) {
  const url = String(raw?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('Нужна прямая ссылка http(s)://… на .mp4/.m3u8/.vtt');
  }

  const fileType =
    raw.file_type === 'subtitle' || raw.fileType === 'subtitle'
      ? 'subtitle'
      : /\.vtt(\?|$)/i.test(url)
        ? 'subtitle'
        : 'video';

  const altUrls = raw.alt_urls || raw.altUrls;

  const task = {
    url,
    alt_urls: Array.isArray(altUrls) ? altUrls.map(String) : [],
    filename: raw.filename ? String(raw.filename) : null,
    referer: raw.referer ? String(raw.referer) : null,
    group_key: raw.group_key || raw.groupKey ? String(raw.group_key || raw.groupKey) : null,
    movie_id: raw.movie_id || raw.movieId ? String(raw.movie_id || raw.movieId) : null,
    title: raw.title ? String(raw.title) : null,
    orig_title: raw.orig_title || raw.origTitle ? String(raw.orig_title || raw.origTitle) : null,
    quality: raw.quality ? String(raw.quality) : null,
    voiceover: raw.voiceover ? String(raw.voiceover) : null,
    season: raw.season ? String(raw.season) : null,
    season_title:
      raw.season_title || raw.seasonTitle ? String(raw.season_title || raw.seasonTitle) : null,
    episode: raw.episode ? String(raw.episode) : null,
    episode_title:
      raw.episode_title || raw.episodeTitle
        ? String(raw.episode_title || raw.episodeTitle)
        : null,
    year: raw.year ? String(raw.year) : null,
    category: raw.category ? String(raw.category) : null,
    file_type: fileType,
    subtitle_lang:
      raw.subtitle_lang || raw.subtitleLang ? String(raw.subtitle_lang || raw.subtitleLang) : null,
    total_bytes: Number(raw.total_bytes || raw.totalBytes) || 0,
  };

  if (!task.filename) {
    // С метаданными (задача из расширения/резолвера) — шаблон из настроек;
    // без метаданных (ручное добавление по ссылке) — имя из самой ссылки.
    task.filename = task.title
      ? buildFilename(task, db.getSettings())
      : filenameFromUrl(url, fileType);
  }

  return task;
}