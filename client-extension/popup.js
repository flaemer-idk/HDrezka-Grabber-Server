/**
 * Тонкий клиент: читает страницу hdrezka, получает прямые ссылки на видео
 * и субтитры и отправляет задачи на локальный сервер загрузок.
 * Файлы скачиваются сервером (не браузером).
 */

const ext = globalThis.browser ?? globalThis.chrome;
const $ = (selector) => document.querySelector(selector);

const STORAGE_KEY = 'hdzg-server-settings';
const STATUS_LABELS = {
  queued: 'в очереди',
  downloading: 'скачивается',
  paused: 'пауза',
  done: 'готово',
  error: 'ошибка',
  canceled: 'отменена',
};

const state = {
  settings: { serverUrl: '', token: '' },
  tab: null,
  page: null,
  voiceovers: [],
  resolveCache: new Map(), // ключ параметров → ответ сайта
  seasons: {},
  busy: false,
  pollTimer: null,
  lastResolve: null,
  lastError: null,
};

/* ─────────────────────────── настройки и сервер ─────────────────────────── */

async function loadSettings() {
  const stored = await ext.storage.local.get(STORAGE_KEY);
  state.settings = { ...state.settings, ...(stored[STORAGE_KEY] || {}) };
  $('#server-url').value = state.settings.serverUrl || '';
  $('#server-token').value = state.settings.token || '';
  if (!state.settings.serverUrl) $('#settings').classList.remove('hidden');
}

async function saveSettings() {
  state.settings = {
    serverUrl: $('#server-url').value.trim().replace(/\/+$/, ''),
    token: $('#server-token').value.trim(),
  };
  await ext.storage.local.set({ [STORAGE_KEY]: state.settings });
  $('#settings-status').textContent = 'Сохранено';
  setTimeout(() => ($('#settings-status').textContent = ''), 2000);
  updateQueueVisibility();
  refreshQueue();
}

async function serverApi(path, options = {}) {
  if (!state.settings.serverUrl) throw new Error('Укажите адрес сервера в настройках (⚙)');
  const headers = { ...(options.headers || {}) };
  if (state.settings.token) headers['X-Auth-Token'] = state.settings.token;
  if (options.body) headers['Content-Type'] = 'application/json';

  const response = await fetch(state.settings.serverUrl + path, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

/* ──────────────────── функции, выполняемые на странице ──────────────────── */

/** Определяет тип страницы и параметры плеера (выполняется в MAIN-мире). */
async function pageDetect() {
  const pageHtml = document.documentElement.outerHTML;

  // Разбираем вызов sof.tv.initCDN*Events как настоящий JS-вызов: на разных
  // зеркалах порядок и количество аргументов отличаются, жёсткая регулярка
  // ненадёжна (из-за неё, например, не работали сериалы).
  function findCall(text) {
    const re = /sof\.tv\.(initCDNMoviesEvents|initCDNSeriesEvents)\s*\(/g;
    let match;
    while ((match = re.exec(text))) {
      let depth = 0;
      let quote = null;
      for (let i = re.lastIndex; i < text.length; i++) {
        const char = text[i];
        if (quote) {
          if (char === '\\') {
            i++;
            continue;
          }
          if (char === quote) quote = null;
          continue;
        }
        if (char === '"' || char === "'") {
          quote = char;
          continue;
        }
        if (char === '(') depth++;
        else if (char === ')') {
          if (depth === 0) return { initiator: match[1], args: text.slice(re.lastIndex, i) };
          depth--;
        }
      }
    }
    return null;
  }

  function splitArgs(raw) {
    const args = [];
    let current = '';
    let quote = null;
    let depth = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw[i];
      if (quote) {
        if (char === '\\') {
          current += char + (raw[++i] ?? '');
          continue;
        }
        if (char === quote) quote = null;
        current += char;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        current += char;
        continue;
      }
      if (char === '{' || char === '[' || char === '(') depth++;
      if (char === '}' || char === ']' || char === ')') depth--;
      if (char === ',' && depth === 0) {
        args.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    if (current.trim()) args.push(current.trim());
    return args;
  }

  function unquote(value) {
    const text = String(value ?? '').trim();
    if (
      (text.startsWith("'") && text.endsWith("'")) ||
      (text.startsWith('"') && text.endsWith('"'))
    ) {
      return text.slice(1, -1);
    }
    return text;
  }

  const call = findCall(pageHtml);
  const args = call ? splitArgs(call.args).map(unquote) : [];
  const favs = document.getElementById('ctrl_favs')?.value || '';
  const titleEl = document.querySelector('.b-post__title h1');
  const origEl = document.querySelector('.b-post__origtitle');
  const activeTranslator = document.querySelector('.b-translator__item.active');

  let pageType = 'DEFAULT';
  let movie = null;

  if (call && args[0] && args[1]) {
    if (call.initiator === 'initCDNMoviesEvents') {
      pageType = 'FILM';
      movie = {
        action: 'get_movie',
        id: args[0],
        translator_id: args[1],
        is_camrip: args[2] ?? null,
        is_ads: args[3] ?? null,
        is_director: args[4] ?? null,
        favs,
      };
    } else {
      pageType = 'SERIAL';
      movie = {
        action: 'get_stream',
        id: args[0],
        translator_id: args[1],
        season: args[2] ?? null,
        episode: args[3] ?? null,
        favs,
      };
    }
  }

  if (movie && activeTranslator?.dataset?.translator_id) {
    movie.translator_id = activeTranslator.dataset.translator_id;
    if (movie.action === 'get_movie') {
      movie.is_camrip = activeTranslator.dataset.camrip || null;
      movie.is_ads = activeTranslator.dataset.ads || null;
      movie.is_director = activeTranslator.dataset.director || null;
    }
  }

  if (movie && movie.action === 'get_stream') {
    const seasonEl = document.querySelector(
      '.b-simple_seasons__list .b-simple_season__item.active',
    );
    const episodeEl = document.querySelector(
      '.b-simple_episodes__list .b-simple_episode__item.active',
    );
    if (seasonEl?.dataset?.tab_id) movie.season = seasonEl.dataset.tab_id;
    if (episodeEl?.dataset?.episode_id) movie.episode = episodeEl.dataset.episode_id;
  }

  let quality = null;
  try {
    quality = window.CDNPlayer?.api ? window.CDNPlayer.api('quality') : null;
  } catch {
    quality = null;
  }

  // Год: строка «Дата выхода»/«Год» в таблице, иначе год из адреса страницы.
  let year = null;
  for (const row of document.querySelectorAll('.b-post__info tr')) {
    const label = row.cells?.[0]?.textContent?.trim() ?? '';
    if (/^(Дата выхода|Год|Год выхода)/i.test(label)) {
      const years = (row.cells?.[1]?.textContent ?? '').match(/(?:19|20)\d{2}/g);
      if (years && years.length) {
        year = years[0];
        break;
      }
    }
  }
  if (!year) year = /(?:19|20)\d{2}/.exec(location.pathname)?.[0] ?? null;

  return {
    pageType,
    movie,
    quality,
    year,
    hasCall: Boolean(call),
    callArgs: args.slice(0, 6),
    url: location.href.split('#')[0],
    category: location.pathname.split('/').filter(Boolean)[0] ?? null,
    title: titleEl ? titleEl.textContent.trim() : document.title,
    origTitle: origEl ? origEl.textContent.trim() : null,
  };
}

/** Сезоны и серии прямо со страницы (фолбэк, если ответ сайта их не содержит). */
async function pageSeasons() {
  const seasons = {};
  const container = document.getElementById('simple-episodes-tabs');
  if (!container) return seasons;

  for (const item of container.querySelectorAll('li')) {
    const tabId = item.dataset.tab_id;
    const seasonId = item.dataset.season_id;
    const episodeId = item.dataset.episode_id;
    const title = (item.textContent || '').trim();

    if (tabId && item.classList.contains('b-simple_season__item')) {
      seasons[tabId] = seasons[tabId] ?? { title: title || `Сезон ${tabId}`, episodes: [] };
      if (title) seasons[tabId].title = title;
    }

    if (seasonId && episodeId) {
      if (!seasons[seasonId]) seasons[seasonId] = { title: `Сезон ${seasonId}`, episodes: [] };
      if (!seasons[seasonId].episodes.some((episode) => episode.id === episodeId)) {
        seasons[seasonId].episodes.push({
          id: episodeId,
          title: title || `Серия ${episodeId}`,
        });
      }
    }
  }

  return seasons;
}

/** Список озвучек со страницы (MAIN-мир, только DOM). */
async function pageVoiceOvers() {
  const translators = [];
  const items = document.querySelectorAll('.b-translator__item');

  if (items.length > 0) {
    for (const item of items) {
      const id = item.getAttribute('data-translator_id');
      const title = (item.getAttribute('title') || '').trim();
      translators.push({
        id,
        title: title || (id === '110' ? 'Оригинал' : id === '0' ? 'Озвучка №1' : `Озвучка ${id}`),
        flag: item.querySelector('img')?.src.split('/').at(-1)?.split('.')[0] || null,
        prem: item.classList.contains('b-prem_translator'),
        is_camrip: item.getAttribute('data-camrip'),
        is_ads: item.getAttribute('data-ads'),
        is_director: item.getAttribute('data-director'),
      });
    }
    return translators;
  }

  const config = document.documentElement.outerHTML.match(
    /sof\.tv\.initCDN(Movies|Series)Events\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*([^,)]*)\s*,\s*([^,)]*)\s*,\s*([^,)]*)/,
  );
  if (!config) return [];

  const initiator = config[1] === 'Movies' ? 'initCDNMoviesEvents' : 'initCDNSeriesEvents';
  const id = config[3];
  let title = id === '110' ? 'Оригинал' : id === '0' ? 'Озвучка №1' : `Озвучка ${id}`;

  for (const row of document.querySelectorAll('.b-post__info tr')) {
    if (row.cells?.[0]?.textContent?.trim() === 'В переводе:') {
      title = row.cells[1]?.textContent?.trim() || title;
      break;
    }
  }

  return [
    {
      id,
      title,
      flag: null,
      prem: false,
      is_camrip: initiator === 'initCDNMoviesEvents' ? config[4].trim() : null,
      is_ads: initiator === 'initCDNMoviesEvents' ? config[5].trim() : null,
      is_director: initiator === 'initCDNMoviesEvents' ? config[6].trim() : null,
    },
  ];
}

/**
 * Запрос к /ajax/get_cdn_series/ из контекста самой страницы.
 * Так используются куки и сессия браузера, Cloudflare не мешает.
 */
async function pageResolve(request) {
  const body = new URLSearchParams();
  body.set('id', request.id);
  body.set('translator_id', request.translator_id);
  body.set('favs', request.favs || '');

  if (request.action === 'get_stream') {
    body.set('season', request.season);
    body.set('episode', request.episode);
    body.set('action', 'get_stream');
  } else if (request.action === 'get_episodes') {
    body.set('action', 'get_episodes');
  } else {
    body.set('is_camrip', request.is_camrip ?? '');
    body.set('is_ads', request.is_ads ?? '');
    body.set('is_director', request.is_director ?? '');
    body.set('action', 'get_movie');
  }

  const url = new URL('/ajax/get_cdn_series/', location.origin);
  url.searchParams.set('t', String(Date.now()));

  const response = await fetch(url.toString(), {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body.toString(),
  });

  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!data) {
    return { success: false, message: `Ответ не JSON (HTTP ${response.status}): ${text.slice(0, 150)}` };
  }
  return data;
}

async function runInPage(func, args = []) {
  const results = await ext.scripting.executeScript({
    target: { tabId: state.tab.id },
    world: 'MAIN',
    func,
    args,
  });
  const first = results?.[0];
  if (!first) throw new Error('Пустой ответ от страницы');
  if (first.error) throw new Error(String(first.error.message || first.error));
  return first.result;
}

/* ──────────────────────────── парсеры ответа сайта ──────────────────────── */

function clearTrash(data) {
  const trash = [
    '//_//QEBAQEAhIyMhXl5e',
    '//_//Xl5eIUAjIyEhIyM=',
    '//_//JCQhIUAkJEBeIUAjJCRA',
    '//_//IyMjI14hISMjIUBA',
    '//_//JCQjISFAIyFAIyM=',
  ];
  let result = data;
  while (trash.some((part) => result.includes(part))) {
    result = result.replace(new RegExp(trash.join('|'), 'g'), '');
  }
  return atob(result.replace('#h', ''));
}

function parseQualityLabel(raw) {
  const prem = raw.match(/>\s?(\d+[pk](?:\s+Ultra)?)\s?</i);
  return prem ? prem[1] : raw;
}

function qualityWeight(quality) {
  const match = String(quality).match(/^(\d+)([pK])/i);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  let rank = unit === 'k' ? value * 630 : value;
  if (String(quality).toLowerCase().includes('ultra')) rank++;
  return rank;
}

function decodeVideoURL(stream) {
  if (!stream) return {};
  let cleaned;
  try {
    cleaned = clearTrash(stream);
  } catch {
    cleaned = stream;
  }

  const result = {};
  for (const item of String(cleaned).split(',')) {
    const match = item.match(/\[(.*?)]/);
    if (!match) continue;
    const label = parseQualityLabel(match[1]);
    const urls = item
      .slice(match[0].length)
      .split(/\sor\s/)
      .map((url) => url.trim())
      .filter(Boolean);
    if (!urls.length) continue;
    result[label] = { urls, isPrem: label !== match[1] };
  }
  return result;
}

function isMp4Url(url) {
  return /^https?:\/\/.*\.mp4$/i.test(url);
}

function isM3u8Url(url) {
  return /^https?:\/\/.*\.m3u8$/i.test(url);
}

function decodeSubtitles(data) {
  if (!data?.subtitle) return [];
  return String(data.subtitle)
    .split(',')
    .map((chunk) => {
      const match = chunk.match(/\[(.*?)]\s*(https?:\/\/\S+?\.(?:vtt|srt))/i);
      if (!match) return null;
      const lang = match[1];
      return { lang, url: match[2], code: data.subtitle_lns?.[lang] ?? null };
    })
    .filter(Boolean);
}

function parseSeasons(html) {
  const seasons = {};
  if (!html) return seasons;
  for (const line of String(html).split('</li>')) {
    if (!line.trim()) continue;
    const match = line.match(/data-tab_id="(\d+)">(.*)$/);
    if (!match) continue;
    seasons[match[1]] = { title: match[2].trim(), episodes: [] };
  }
  return seasons;
}

function parseEpisodes(data, seasons) {
  if (!data?.episodes) return seasons;
  for (const block of String(data.episodes).split('</ul>')) {
    if (!block.trim()) continue;
    for (const line of block.split('</li>')) {
      if (!line.trim()) continue;
      const match = line.match(/data-season_id="(\d+)" data-episode_id="(\d+)">(.*)$/);
      if (!match) continue;
      const seasonId = match[1];
      if (!seasons[seasonId]) seasons[seasonId] = { title: `Сезон ${seasonId}`, episodes: [] };
      seasons[seasonId].episodes.push({ id: match[2], title: match[3].trim() });
    }
  }
  return seasons;
}

function sliceSeasons(seasons, seasonFrom, episodeFrom, seasonTo, episodeTo) {
  const sortedKeys = Object.keys(seasons).sort((a, b) => parseInt(a) - parseInt(b));
  if (parseInt(seasonTo) < 0) {
    seasonTo = seasonTo === '-2' ? sortedKeys[sortedKeys.length - 1] : seasonFrom;
    episodeTo = '';
  }

  const result = {};
  for (const seasonKey of sortedKeys) {
    if (parseInt(seasonKey) < parseInt(seasonFrom) || parseInt(seasonKey) > parseInt(seasonTo)) continue;

    const { title, episodes } = seasons[seasonKey];
    let list = [...episodes].sort((a, b) => parseInt(a.id) - parseInt(b.id));
    if (seasonKey === seasonFrom) {
      list = list.filter((episode) => parseInt(episode.id) >= parseInt(episodeFrom));
    }
    if (seasonKey === seasonTo && episodeTo !== '') {
      list = list.filter((episode) => parseInt(episode.id) <= parseInt(episodeTo));
    }
    result[seasonKey] = { title, episodes: list };
  }
  return result;
}

function pickQuality(qualities, wanted) {
  const keys = Object.keys(qualities);
  if (keys.length === 0) return null;
  if (qualities[wanted]) return wanted;

  const target = qualityWeight(wanted);
  const sorted = keys.slice().sort((a, b) => qualityWeight(b) - qualityWeight(a));
  for (const key of sorted) {
    if (qualityWeight(key) <= target) return key;
  }
  return null;
}

/* ─────────────────────────────── интерфейс ─────────────────────────────── */

function setPageInfo(html, isError = false) {
  const el = $('#page-info');
  el.innerHTML = html;
  el.classList.toggle('error', isError);
}

function setStatus(text) {
  $('#action-status').textContent = text || '';
}

function showControls(visible) {
  $('#controls').classList.toggle('hidden', !visible);
}

function renderVoiceovers() {
  const select = $('#voiceover');
  select.innerHTML = '';
  for (const voice of state.voiceovers) {
    const option = document.createElement('option');
    option.value = String(voice.id);
    option.textContent = voice.title + (voice.prem ? ' ★' : '');
    select.appendChild(option);
  }
  const page = state.page;
  if (page?.movie) select.value = String(page.movie.translator_id);
  select.disabled = state.voiceovers.length <= 1;
}

function renderQualities() {
  const select = $('#quality');
  select.innerHTML = '';
  const qualities = state.resolved?.qualities ?? {};
  const keys = Object.keys(qualities).sort((a, b) => qualityWeight(b) - qualityWeight(a));
  for (const key of keys) {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key + (qualities[key].isPrem ? ' ★ (премиум)' : '');
    select.appendChild(option);
  }
  const pageQuality = state.page?.quality;
  if (pageQuality && keys.includes(pageQuality)) select.value = pageQuality;
  if (!keys.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '— нет доступных качеств —';
    select.appendChild(option);
  }
}

function renderSubtitles() {
  const langs = state.resolved?.subtitles ?? [];
  const wrap = $('#subs-lang-wrap');
  const select = $('#subs-lang');

  select.innerHTML = '';
  for (const item of langs) {
    const option = document.createElement('option');
    option.value = item.lang;
    option.textContent = item.lang;
    select.appendChild(option);
  }

  const hasSubs = langs.length > 0;
  // Чекбокс не блокируем: субтитры могут появиться при смене озвучки,
  // а при их отсутствии пользователь должен видеть, что галочка просто не сработает.
  $('#subs-enabled').disabled = false;
  if (!hasSubs && state.subsWasChecked) $('#subs-enabled').checked = false;
  wrap.classList.toggle('hidden', !hasSubs || !$('#subs-enabled').checked);

  const note = $('#subs-note');
  if (note) {
    note.textContent = hasSubs
      ? ''
      : 'Для этой озвучки субтитры не найдены — попробуйте другую озвучку.';
    note.classList.toggle('hidden', hasSubs);
  }
}

function renderSeasons() {
  const page = state.page;
  const seasons = state.seasons;
  const keys = Object.keys(seasons).sort((a, b) => parseInt(a) - parseInt(b));
  const isSerial = page.pageType === 'SERIAL';

  $('#range-block').classList.toggle('hidden', !isSerial);
  if (!isSerial || keys.length === 0) return;

  const currentSeason = page.movie.season;
  const currentEpisode = page.movie.episode;

  const fillSeasons = (select, options, selected) => {
    select.innerHTML = '';
    for (const [value, label] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
    select.value = selected;
  };

  const seasonOptions = keys.map((key) => [key, seasons[key].title || `Сезон ${key}`]);
  fillSeasons($('#season-from'), seasonOptions, currentSeason);

  const toOptions = [...seasonOptions, ['-1', 'конец сезона'], ['-2', 'конец сериала']];
  fillSeasons($('#season-to'), toOptions, '-2');

  fillEpisodesFrom();
  $('#episode-to').innerHTML = '<option value="">до последней</option>';
}

function fillEpisodesFrom() {
  const seasonFrom = $('#season-from').value;
  const episodes = state.seasons[seasonFrom]?.episodes ?? [];
  const select = $('#episode-from');
  select.innerHTML = '';
  for (const episode of episodes) {
    const option = document.createElement('option');
    option.value = episode.id;
    option.textContent = episode.title || `Серия ${episode.id}`;
    select.appendChild(option);
  }
  const currentEpisode = state.page?.movie?.episode;
  if (state.page?.movie?.season === seasonFrom && currentEpisode) select.value = currentEpisode;
}

function updateQueueVisibility() {
  $('#queue').classList.toggle('hidden', !state.settings.serverUrl);
}

function queueButtons(task) {
  const buttons = [];
  if (task.status === 'downloading' || task.status === 'queued') {
    buttons.push(['pause', '⏸', 'Пауза']);
    buttons.push(['cancel', '✕', 'Отменить']);
  } else if (task.status === 'paused') {
    buttons.push(['resume', '▶', 'Продолжить']);
    buttons.push(['cancel', '✕', 'Отменить']);
  } else if (task.status === 'error' || task.status === 'canceled') {
    buttons.push(['retry', '↻', 'Повторить']);
  }

  if (buttons.length === 0) return '';

  return `<span class="q-actions">${buttons
    .map(
      ([action, icon, title]) =>
        `<button type="button" class="q-btn" data-id="${task.id}" data-action="${action}" title="${title}">${icon}</button>`,
    )
    .join('')}</span>`;
}

function renderQueue(stateData) {
  const stats = stateData?.stats;
  $('#queue-stats').textContent = stats
    ? `↓${stats.downloading} · ⏳${stats.queued} · ✓${stats.done}${stats.error ? ` · ✕${stats.error}` : ''}`
    : '';

  const list = $('#queue-list');
  const tasks = (stateData?.tasks ?? []).slice(0, 8);
  if (!tasks.length) {
    list.innerHTML = '<div class="hint">Задач пока нет.</div>';
    return;
  }

  list.innerHTML = tasks
    .map((task) => {
      const percent =
        task.totalBytes > 0 ? Math.min(100, (task.receivedBytes / task.totalBytes) * 100) : 0;
      const cls = `status-${task.status}`;
      const bytes =
        task.totalBytes > 0
          ? `${formatBytes(task.receivedBytes)} / ${formatBytes(task.totalBytes)}`
          : task.receivedBytes > 0
            ? formatBytes(task.receivedBytes)
            : '';
      return `
        <div class="queue-item">
          <div class="q-name">${escapeHtml(task.filename || task.url)}</div>
          <div class="q-bar"><div style="width:${percent.toFixed(1)}%"></div></div>
          <div class="q-row">
            <span class="${cls}">${STATUS_LABELS[task.status] || task.status}</span>
            <span>${bytes}</span>
            ${queueButtons(task)}
          </div>
        </div>`;
    })
    .join('');
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : value >= 100 ? 0 : 1)} ${units[i]}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/* ─────────────────────────────── основная логика ────────────────────────── */

async function getActiveTab() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('Не удалось определить активную вкладку');
  if (!/^https?:\/\//i.test(tab.url || '')) {
    throw new Error('Откройте страницу фильма на hdrezka (и её зеркалах) и повторите');
  }
  state.tab = tab;
}

function movieKey(movie, episode) {
  return [
    movie.id,
    movie.translator_id,
    episode ? `s${episode.season}e${episode.episode}` : 'film',
  ].join('|');
}

async function resolveFor(episode) {
  const movie = state.page.movie;
  if (episode && (!episode.season || !episode.episode)) {
    throw new Error(
      'Не удалось определить сезон и серию на странице. Обновите страницу (F5) и попробуйте снова.',
    );
  }

  const key = movieKey(movie, episode);
  if (state.resolveCache.has(key)) return state.resolveCache.get(key);

  const request = episode
    ? {
        action: 'get_stream',
        id: movie.id,
        translator_id: movie.translator_id,
        favs: movie.favs,
        season: episode.season,
        episode: episode.episode,
      }
    : {
        action: 'get_movie',
        id: movie.id,
        translator_id: movie.translator_id,
        favs: movie.favs,
        is_camrip: movie.is_camrip,
        is_ads: movie.is_ads,
        is_director: movie.is_director,
      };

  let data;
  try {
    data = await runInPage(pageResolve, [request]);
  } catch (error) {
    state.lastError = String(error?.message || error);
    throw error;
  }

  state.lastResolve = {
    request,
    success: data?.success ?? null,
    message: data?.message ?? null,
    url: typeof data?.url === 'string' ? data.url.slice(0, 300) : (data?.url ?? null),
    subtitle: typeof data?.subtitle === 'string' ? data.subtitle.slice(0, 200) : (data?.subtitle ?? null),
    seasonsLength: typeof data?.seasons === 'string' ? data.seasons.length : null,
    episodesLength: typeof data?.episodes === 'string' ? data.episodes.length : null,
  };

  if (!data || data.success === false) {
    const message = data?.message || data?.error || 'Сайт вернул ошибку';
    state.lastError = message;
    throw new Error(message);
  }
  state.resolveCache.set(key, data);
  return data;
}

async function applyResolvedData(data) {
  const qualities = decodeVideoURL(data.url);
  const subtitles = decodeSubtitles(data);
  let seasons = parseEpisodes(data, parseSeasons(data.seasons));
  if (Object.keys(seasons).length === 0) {
    // Ответ без серий — пробуем прочитать список прямо со страницы.
    try {
      seasons = (await runInPage(pageSeasons)) || {};
    } catch {
      seasons = {};
    }
  }
  return { qualities, subtitles, seasons };
}

async function init() {
  await loadSettings();
  updateQueueVisibility();

  try {
    await getActiveTab();
    const page = await runInPage(pageDetect);

    if (!page?.movie) {
      state.page = page;
      const snippet = page?.title ? `<span class="meta">${escapeHtml(page.title)}</span>` : '';
      setPageInfo(
        `<span class="name">Это не страница фильма или сериала</span>${snippet}` +
          `<span class="meta">Откройте страницу фильма/сериала и нажмите иконку расширения снова.` +
          ` Если страница правильная — нажмите 🐞 и пришлите диагностику.</span>`,
        true,
      );
      showControls(false);
      return;
    }

    state.page = page;

    try {
      state.voiceovers = (await runInPage(pageVoiceOvers)) || [];
    } catch {
      state.voiceovers = [];
    }
    renderVoiceovers();

    const kind = page.pageType === 'SERIAL' ? 'Сериал' : 'Фильм';
    setPageInfo(
      `<span class="name">${escapeHtml(page.title)}</span>` +
        `<span class="meta">${kind}${page.origTitle ? ` · ${escapeHtml(page.origTitle)}` : ''}` +
        `${page.quality ? ` · плеер: ${escapeHtml(page.quality)}` : ''}</span>`,
    );

    setStatus('Получаем ссылки…');
    const episode =
      page.pageType === 'SERIAL'
        ? { season: page.movie.season, episode: page.movie.episode }
        : null;
    const data = await resolveFor(episode);
    const { qualities, subtitles, seasons } = await applyResolvedData(data);

    state.resolved = { qualities, subtitles };
    state.seasons = seasons;

    renderQualities();
    renderSubtitles();
    renderSeasons();
    showControls(true);
    setStatus('');
    checkAlreadyDownloaded();
  } catch (error) {
    state.lastError = String(error?.message || error);
    setPageInfo(
      `<span class="name">Ошибка</span><span class="meta">${escapeHtml(error.message)}</span>` +
        `<span class="meta">Если это страница фильма или сериала — нажмите 🐞 и пришлите диагностику.</span>`,
      true,
    );
    showControls(false);
  }
}

function buildEpisodeList() {
  const page = state.page;
  if (page.pageType !== 'SERIAL') return [null];

  const mode = $('#range-mode').value;
  const seasons = state.seasons;
  const keys = Object.keys(seasons).sort((a, b) => parseInt(a) - parseInt(b));

  if (mode === 'current') {
    return [{ season: page.movie.season, episode: page.movie.episode }];
  }
  if (mode === 'season') {
    const list = seasons[page.movie.season]?.episodes ?? [];
    return list.map((episode) => ({ season: page.movie.season, episode: episode.id }));
  }
  if (mode === 'all') {
    const result = [];
    for (const seasonKey of keys) {
      for (const episode of seasons[seasonKey].episodes) {
        result.push({ season: seasonKey, episode: episode.id });
      }
    }
    return result;
  }

  const sliced = sliceSeasons(
    seasons,
    $('#season-from').value,
    $('#episode-from').value,
    $('#season-to').value,
    $('#episode-to').value || '',
  );
  const result = [];
  for (const seasonKey of Object.keys(sliced)) {
    for (const episode of sliced[seasonKey].episodes) {
      result.push({ season: seasonKey, episode: episode.id });
    }
  }
  return result;
}

function buildTasksForEpisode(data, episode) {
  const page = state.page;
  const qualities = decodeVideoURL(data.url);
  const wanted = $('#quality').value;
  const qualityLabel = pickQuality(qualities, wanted);
  const tasks = [];
  const warnings = [];

  if (!qualityLabel) {
    warnings.push(episode ? `серия ${episode.episode}: нет доступного качества` : 'нет доступного качества');
    return { tasks, warnings };
  }

  const quality = qualities[qualityLabel];
  const mp4 = quality.urls.filter(isMp4Url);
  const hls = quality.urls.filter(isM3u8Url);
  const chosen = mp4.length ? mp4 : hls;
  if (!chosen.length) {
    warnings.push(episode ? `серия ${episode.episode}: нет ссылок` : 'нет ссылок');
    return { tasks, warnings };
  }

  // Названия сезона/серии берём из свежего ответа сайта (они зависят от озвучки),
  // с откатом на ранее разобранный список.
  const freshSeasons = episode ? parseEpisodes(data, parseSeasons(data.seasons)) : {};
  const seasonData = episode
    ? (freshSeasons[episode.season] ?? state.seasons[episode.season] ?? null)
    : null;
  const episodeData = seasonData?.episodes.find((item) => item.id === episode?.episode) ?? null;
  const voiceover = state.voiceovers.find((v) => String(v.id) === String(page.movie.translator_id));

  const base = {
    referer: page.url,
    movie_id: page.movie.id,
    title: page.title,
    orig_title: page.origTitle,
    quality: qualityLabel,
    voiceover: voiceover?.title ?? page.movie.translator_id,
    year: page.year ?? null,
    category: page.category ?? null,
    group_key: `movie-${page.movie.id}`,
  };

  tasks.push({
    ...base,
    url: chosen[0],
    alt_urls: chosen.slice(1),
    season: episode?.season ?? null,
    season_title: seasonData?.title ?? null,
    episode: episode?.episode ?? null,
    episode_title: episodeData?.title ?? null,
    file_type: 'video',
  });

  if ($('#subs-enabled').checked) {
    const lang = $('#subs-lang').value;
    const subtitles = decodeSubtitles(data);
    const subtitle = subtitles.find((item) => item.lang === lang);
    if (subtitle) {
      tasks.push({
        ...base,
        quality: null,
        url: subtitle.url,
        alt_urls: [],
        season: episode?.season ?? null,
        season_title: seasonData?.title ?? null,
        episode: episode?.episode ?? null,
        episode_title: episodeData?.title ?? null,
        file_type: 'subtitle',
        subtitle_lang: subtitle.lang,
        // Код языка от сайта (subtitle_lns) — сервер подставит его в имя файла,
        // если он есть; иначе сам переведёт название («Русский» → rus).
        subtitle_lang_code: subtitle.code,
      });
    } else {
      const where = episode ? `серия ${episode.episode}: ` : '';
      warnings.push(
        subtitles.length
          ? `${where}субтитры «${lang}» не найдены`
          : `${where}субтитры не найдены для этой озвучки`,
      );
    }
  }

  return { tasks, warnings };
}

async function handleDownload() {
  if (state.busy) return;
  state.busy = true;
  $('#download').disabled = true;

  try {
    const episodes = buildEpisodeList();
    if (!episodes.length) {
      setStatus('Не выбрано ни одной серии');
      return;
    }

    const allTasks = [];
    const allWarnings = [];

    for (let i = 0; i < episodes.length; i++) {
      const episode = episodes[i];
      setStatus(`Получаем ссылки: ${i + 1} из ${episodes.length}…`);
      const data = await resolveFor(episode);
      const { tasks, warnings } = buildTasksForEpisode(data, episode);
      allTasks.push(...tasks);
      allWarnings.push(...warnings);
      if (i < episodes.length - 1) await new Promise((resolve) => setTimeout(resolve, 400));
    }

    if (!allTasks.length) {
      setStatus(`Нечего отправлять. ${allWarnings.join('; ')}`);
      return;
    }

    setStatus(`Отправляем ${allTasks.length} задач(и) на сервер…`);
    const result = await serverApi('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ tasks: allTasks }),
    });

    const warn = allWarnings.length ? ` Пропуски: ${allWarnings.join('; ')}` : '';
    setStatus(`Отправлено: ${result.created}.${warn}`);
    refreshQueue();
  } catch (error) {
    state.lastError = String(error?.message || error);
    setStatus(`Ошибка: ${error.message}`);
  } finally {
    state.busy = false;
    $('#download').disabled = false;
  }
}

async function checkAlreadyDownloaded() {
  const box = $('#already');
  const movie = state.page?.movie;
  if (!movie || !state.settings.serverUrl) {
    box.classList.add('hidden');
    return;
  }

  try {
    const summary = await serverApi(`/api/movies/${encodeURIComponent(movie.id)}`);
    state.movieSummary = summary;

    if (!summary.total) {
      box.classList.add('hidden');
      box.textContent = '';
      return;
    }

    const parts = [];
    if (summary.done) parts.push(`${summary.done} готово`);
    if (summary.downloading) parts.push(`${summary.downloading} качается`);
    if (summary.queued) parts.push(`${summary.queued} в очереди`);
    if (summary.paused) parts.push(`${summary.paused} на паузе`);
    if (summary.error) parts.push(`${summary.error} с ошибкой`);

    box.textContent =
      `⚠ Уже скачивалось: ${parts.join(', ')}. ` +
      (summary.filesOnDisk ? `Файлов на диске: ${summary.filesOnDisk}. ` : '') +
      'Повторная загрузка скачает заново и перезапишет готовые файлы, если они на месте.';
    box.classList.remove('hidden');
  } catch {
    box.classList.add('hidden');
  }
}

async function refreshQueue() {
  if (!state.settings.serverUrl) return;
  try {
    const data = await serverApi('/api/state?limit=20');
    renderQueue(data);
  } catch (error) {
    $('#queue-stats').textContent = 'нет связи';
    $('#queue-list').innerHTML = `<div class="hint">${escapeHtml(error.message)}</div>`;
  }
}

/* ──────────────────────────────── события ──────────────────────────────── */

$('#toggle-settings').addEventListener('click', () => {
  $('#settings').classList.toggle('hidden');
});

$('#copy-debug').addEventListener('click', async () => {
  const payload = {
    version: ext.runtime.getManifest().version,
    time: new Date().toISOString(),
    tabUrl: state.tab?.url ?? null,
    serverUrl: state.settings.serverUrl || null,
    page: state.page,
    voiceovers: state.voiceovers,
    lastResolve: state.lastResolve,
    lastError: state.lastError,
  };
  try {
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    setStatus('Диагностика скопирована в буфер обмена');
  } catch (error) {
    setStatus(`Не удалось скопировать: ${error.message}`);
  }
});

$('#save-settings').addEventListener('click', saveSettings);

$('#voiceover').addEventListener('change', async () => {
  const movie = state.page?.movie;
  if (!movie) return;

  const selected = state.voiceovers.find((v) => String(v.id) === $('#voiceover').value);
  movie.translator_id = $('#voiceover').value;
  if (movie.action === 'get_movie' && selected) {
    movie.is_camrip = selected.is_camrip || null;
    movie.is_ads = selected.is_ads || null;
    movie.is_director = selected.is_director || null;
  }

  state.resolveCache.clear();
  setStatus('Обновляем данные для выбранной озвучки…');
  try {
    const episode =
      state.page.pageType === 'SERIAL'
        ? { season: movie.season, episode: movie.episode }
        : null;
    const data = await resolveFor(episode);
    const { qualities, subtitles, seasons } = await applyResolvedData(data);
    state.resolved = { qualities, subtitles };
    state.seasons = seasons;
    renderQualities();
    renderSubtitles();
    renderSeasons();
    setStatus('');
  } catch (error) {
    setStatus(`Ошибка: ${error.message}`);
  }
});

$('#subs-enabled').addEventListener('change', () => {
  state.subsWasChecked = $('#subs-enabled').checked;
  const hasSubs = (state.resolved?.subtitles ?? []).length > 0;
  $('#subs-lang-wrap').classList.toggle('hidden', !$('#subs-enabled').checked || !hasSubs);
});

$('#range-mode').addEventListener('change', () => {
  $('#range-custom').classList.toggle('hidden', $('#range-mode').value !== 'custom');
});

$('#season-from').addEventListener('change', fillEpisodesFrom);

$('#download').addEventListener('click', handleDownload);

$('#queue-list').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  button.disabled = true;
  try {
    await serverApi(`/api/tasks/${button.dataset.id}/${button.dataset.action}`, { method: 'POST' });
    await refreshQueue();
  } catch (error) {
    setStatus(`Не удалось: ${error.message}`);
  }
});

$('#resume-all').addEventListener('click', async () => {
  try {
    const data = await serverApi('/api/tasks/resume-all', { method: 'POST' });
    setStatus(data.resumed ? `Продолжаем задач: ${data.resumed}` : 'На паузе ничего нет');
    await refreshQueue();
  } catch (error) {
    setStatus(`Не удалось: ${error.message}`);
  }
});

$('#stop-all').addEventListener('click', async (event) => {
  const button = event.target;
  // Подтверждение вторым кликом, без браузерных окон.
  if (button.dataset.armed !== '1') {
    button.dataset.armed = '1';
    button.textContent = 'Точно?';
    setTimeout(() => {
      button.dataset.armed = '0';
      button.textContent = 'Остановить все';
    }, 4000);
    return;
  }

  button.dataset.armed = '0';
  button.textContent = 'Остановить все';
  try {
    const data = await serverApi('/api/tasks/cancel-all', { method: 'POST' });
    setStatus(data.canceled ? `Отменено задач: ${data.canceled}` : 'Нечего отменять');
    await refreshQueue();
  } catch (error) {
    setStatus(`Не удалось: ${error.message}`);
  }
});

/* ───────────────────────────────── запуск ──────────────────────────────── */

init().finally(() => {
  refreshQueue();
  state.pollTimer = setInterval(refreshQueue, 2000);
});

window.addEventListener('unload', () => {
  if (state.pollTimer) clearInterval(state.pollTimer);
});