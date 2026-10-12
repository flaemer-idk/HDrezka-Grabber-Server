/**
 * Прототип №2 «Мастер» — другой сценарий: два экрана (Загрузка | Очередь)
 * и мастер из трёх шагов. Данные ненастоящие (мок + симуляция). Без сети.
 */

const $ = (sel) => document.querySelector(sel);
const MB = 1024 * 1024;
const GB = 1024 * MB;

const ICONS = {
  play: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4"/></svg>',
  pause: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/></svg>',
  x: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  retry: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polyline points="21 4 21 10 15 10"/><path d="M20.5 14a8.5 8.5 0 1 1-1.9-8.4L21 8"/></svg>',
  trash: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>',
  chevron: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>',
  alert: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  check: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
  info: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  film: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><rect x="2" y="4" width="20" height="16"/><line x1="7" y1="4" x2="7" y2="20"/><line x1="17" y1="4" x2="17" y2="20"/><line x1="2" y1="12" x2="7" y2="12"/><line x1="17" y1="12" x2="22" y2="12"/></svg>',
  subs: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><rect x="2" y="5" width="20" height="14"/><line x1="6" y1="10" x2="13" y2="10"/><line x1="6" y1="14" x2="18" y2="14"/></svg>',
};

const STATUS = {
  queued: 'в очереди',
  downloading: 'скачивается',
  paused: 'пауза',
  done: 'готово',
  error: 'ошибка',
  canceled: 'отменена',
};

/* ──────────────────────────── мок страницы ──────────────────────────── */

const PAGE = {
  kind: 'сериал',
  title: 'Во все тяжкие',
  origTitle: 'Breaking Bad',
  year: 2008,
  quality: '1080p',
  season: 1,
  episode: 2,
  voiceovers: [
    { id: '56', title: 'Кубик в Кубе', sub: 'основная' },
    { id: '12', title: 'LostFilm', sub: 'дубляж' },
    { id: '34', title: 'Jaskier', sub: 'многоголосый' },
    { id: '77', title: 'HDrezka Studio', sub: 'премиум', prem: true },
    { id: '110', title: 'Оригинал (Eng)', sub: 'без перевода' },
  ],
  qualities: [
    { label: '2160p Ultra', prem: true, size: 4.1 * GB },
    { label: '1080p', prem: false, size: 1.4 * GB },
    { label: '720p', prem: false, size: 780 * MB },
    { label: '480p', prem: false, size: 420 * MB },
  ],
  subs: [
    { lang: 'Русский', code: 'rus' },
    { lang: 'English', code: 'eng' },
    { lang: 'Українська', code: 'ukr' },
  ],
  seasons: {
    1: {
      title: 'Сезон 1',
      episodes: [
        { id: 1, title: 'Пилот' },
        { id: 2, title: 'Кот в мешке' },
        { id: 3, title: '…и в мешке — тело' },
        { id: 4, title: 'Раковые суки' },
        { id: 5, title: 'Серое вещество' },
        { id: 6, title: 'Сумасшедшая горка из ничего' },
        { id: 7, title: 'Бесплатный обед' },
      ],
    },
    2: {
      title: 'Сезон 2',
      episodes: Array.from({ length: 13 }, (_, i) => ({ id: i + 1, title: `Серия ${i + 1}` })),
    },
  },
};

const SORTED_SEASONS = Object.keys(PAGE.seasons).map(Number).sort((a, b) => a - b);
const epKey = (season, episode) => `${season}:${episode}`;
const epCodes = (season, episode) =>
  `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;

function allEpisodesOf(season) {
  return PAGE.seasons[season].episodes.map((episode) => epKey(season, episode.id));
}

/* ──────────────────────────── мок очереди ──────────────────────────── */

let nextId = 100;

function makeTasks() {
  return [
    {
      id: 1,
      group: 'Дюна: Часть вторая',
      year: 2024,
      name: 'Дюна: Часть вторая (2024).1080p.mkv',
      type: 'video',
      status: 'downloading',
      total: 4.7 * GB,
      received: 4.7 * GB * 0.63,
      speed: 8.4 * MB,
    },
    { id: 2, group: 'Во все тяжкие', year: 2008, name: 'Во все тяжкие S01E01.1080p.mkv', type: 'video', status: 'done', total: 1.4 * GB, received: 1.4 * GB, speed: 0 },
    {
      id: 3,
      group: 'Во все тяжкие',
      year: 2008,
      name: 'Во все тяжкие S01E02.1080p.mkv',
      type: 'video',
      status: 'downloading',
      total: 1.4 * GB,
      received: 1.4 * GB * 0.41,
      speed: 5.2 * MB,
      ep: 'S01E02',
    },
    { id: 4, group: 'Во все тяжкие', year: 2008, name: 'Во все тяжкие S01E02.rus.vtt', type: 'subtitle', status: 'done', total: 96 * 1024, received: 96 * 1024, speed: 0, ep: 'S01E02' },
    { id: 5, group: 'Во все тяжкие', year: 2008, name: 'Во все тяжкие S01E03.1080p.mkv', type: 'video', status: 'queued', total: 1.4 * GB, received: 0, speed: 0, ep: 'S01E03' },
    {
      id: 6,
      group: 'Оппенгеймер',
      year: 2023,
      name: 'Оппенгеймер (2023).1080p.mkv',
      type: 'video',
      status: 'error',
      total: 6.9 * GB,
      received: 0.2 * GB,
      speed: 0,
      error: 'HTTP 403: доступ запрещён',
    },
    {
      id: 7,
      group: 'Бегущий по лезвию 2049',
      year: 2017,
      name: 'Бегущий по лезвию 2049 (2017).1080p.mkv',
      type: 'video',
      status: 'paused',
      total: 5.2 * GB,
      received: 5.2 * GB * 0.77,
      speed: 0,
    },
  ];
}

const state = {
  tasks: makeTasks(),
  online: true,
  mode: 'normal',
  screen: 'send',
  step: 1,
  preset: 'current',
  activeSeason: PAGE.season,
  selection: new Set([epKey(PAGE.season, PAGE.episode)]),
  voiceover: '56',
  quality: '1080p',
  subs: true,
  subsLang: 'Русский',
  filter: 'all',
  collapsed: new Set(),
  armed: null,
  busy: false,
  maxConcurrent: 3,
  historyDone: 128,
};

/* ──────────────────────────── утилиты ──────────────────────────── */

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

function formatSpeed(bytes) {
  return `${(bytes / MB).toFixed(1)} МБ/с`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function toast(message, kind = 'info') {
  const icons = { info: ICONS.info, success: ICONS.check, error: ICONS.alert };
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = `${icons[kind] || icons.info}<span>${escapeHtml(message)}</span>`;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  }, 3400);
}

function renderStatus(text, kind = '') {
  const el = $('#action-status');
  el.textContent = text || '';
  el.className = `status-line ${kind}`;
}

function stats() {
  const result = { downloading: 0, queued: 0, done: 0, error: 0, paused: 0, canceled: 0 };
  for (const task of state.tasks) result[task.status] = (result[task.status] || 0) + 1;
  return result;
}

function qualityInfo() {
  return PAGE.qualities.find((item) => item.label === state.quality) ?? PAGE.qualities[1];
}

function voiceoverInfo() {
  return PAGE.voiceovers.find((item) => item.id === state.voiceover) ?? PAGE.voiceovers[0];
}

function selectedList() {
  return Array.from(state.selection)
    .map((key) => {
      const [season, episode] = key.split(':').map(Number);
      return { season, episode };
    })
    .sort((a, b) => a.season - b.season || a.episode - b.episode);
}

function selectionEstimate() {
  const list = selectedList();
  const video = list.length * qualityInfo().size;
  const subs = state.subs ? list.length * 96 * 1024 : 0;
  return { count: list.length, bytes: video + subs };
}

function episodeTitle(season, episode) {
  return PAGE.seasons[season]?.episodes.find((item) => item.id === episode)?.title ?? `Серия ${episode}`;
}

/* ──────────────────────────── экран «Загрузка» ──────────────────────────── */

function renderPageInfo() {
  const box = $('#page-info');
  const sub = $('#conn-sub');

  if (state.mode === 'nopage') {
    box.innerHTML = `
      <div class="page-error">
        <div class="pe-title">${ICONS.alert}<span>Это не страница фильма или сериала</span></div>
        <div class="pe-text">Загрузка недоступна. Экран очереди работает всегда — смотрите, что уже качается на сервере.</div>
      </div>`;
  } else {
    box.innerHTML = `
      <div class="page-title-row">
        <span class="page-kind">${PAGE.kind}</span>
        <span class="page-name">${escapeHtml(PAGE.title)}</span>
        <span class="page-year">${PAGE.year}</span>
      </div>
      <div class="page-meta">
        <span>${escapeHtml(PAGE.origTitle)}</span>
        <span class="dot-sep">·</span>
        <span class="page-ep">${epCodes(PAGE.season, PAGE.episode)} · ${escapeHtml(episodeTitle(PAGE.season, PAGE.episode))}</span>
        <span class="dot-sep">·</span>
        <span>плеер: ${PAGE.quality}</span>
      </div>`;
  }

  sub.textContent = state.online ? 'сервер на связи' : 'нет связи с сервером';
  sub.classList.toggle('bad', !state.online);
}

function renderStepper() {
  const interactive = state.mode !== 'nopage';
  $('#stepper').classList.toggle('hidden', !interactive);
  for (const button of document.querySelectorAll('#stepper .step')) {
    const step = Number(button.dataset.step);
    button.classList.toggle('active', step === state.step);
    button.classList.toggle('done', step < state.step);
  }
}

function renderStep() {
  const body = $('#step-body');
  const panel = body.closest('.card');
  panel.classList.toggle('hidden', state.mode === 'nopage');

  if (state.mode === 'nopage') {
    body.innerHTML = '';
    return;
  }

  if (state.step === 1) {
    const seasonOptions = SORTED_SEASONS.map(
      (key) => `<button type="button" class="season-tab ${key === state.activeSeason ? 'on' : ''}" data-season="${key}">${PAGE.seasons[key].title}</button>`,
    ).join('');

    const chips = PAGE.seasons[state.activeSeason].episodes
      .map((episode) => {
        const key = epKey(state.activeSeason, episode.id);
        return `<button type="button" class="ep-chip ${state.selection.has(key) ? 'on' : ''}" data-ep="${key}" title="${escapeHtml(episode.title)}">
          <span class="ep-num">${episode.id}</span>
        </button>`;
      })
      .join('');

    const { count, bytes } = selectionEstimate();

    body.innerHTML = `
      <div class="step-title">Шаг 1 · что качать</div>
      <div class="preset-row" id="presets">
        <button type="button" class="preset ${state.preset === 'current' ? 'on' : ''}" data-preset="current">Текущая серия</button>
        <button type="button" class="preset ${state.preset === 'season' ? 'on' : ''}" data-preset="season">Сезон ${state.activeSeason}</button>
        <button type="button" class="preset ${state.preset === 'all' ? 'on' : ''}" data-preset="all">Весь сериал</button>
        <button type="button" class="preset ${state.preset === 'manual' ? 'on' : ''}" data-preset="manual">Вручную</button>
      </div>
      <div class="season-tabs" id="season-tabs">${seasonOptions}</div>
      <div class="ep-grid" id="ep-grid">${chips}</div>
      <div class="grid-tools">
        <button type="button" class="btn btn-sm" data-tool="all">Выбрать все</button>
        <button type="button" class="btn btn-sm" data-tool="none">Снять</button>
        <span class="spacer"></span>
        <span class="summary-line">Выбрано: <b>${count}</b> ${count === 1 ? 'серия' : count < 5 ? 'серии' : 'серий'} · ≈ <b>${formatBytes(bytes)}</b></span>
      </div>`;
    return;
  }

  if (state.step === 2) {
    const voiceCards = PAGE.voiceovers
      .map(
        (voice) => `
        <button type="button" class="opt-card ${voice.id === state.voiceover ? 'on' : ''}" data-voice="${voice.id}">
          <span class="opt-radio"></span>
          <span class="opt-main">
            <span class="opt-title">${escapeHtml(voice.title)}${voice.prem ? ' <span class="opt-star">★</span>' : ''}</span>
            <span class="opt-sub">${escapeHtml(voice.sub)}</span>
          </span>
        </button>`,
      )
      .join('');

    const qualityCards = PAGE.qualities
      .map(
        (item) => `
        <button type="button" class="opt-card ${item.label === state.quality ? 'on' : ''}" data-quality="${item.label}">
          <span class="opt-radio"></span>
          <span class="opt-main">
            <span class="opt-title">${item.label}${item.prem ? ' <span class="opt-star">★</span>' : ''}</span>
            <span class="opt-sub">≈ ${formatBytes(item.size)} · серия</span>
          </span>
        </button>`,
      )
      .join('');

    const chips = PAGE.subs
      .map(
        (item) =>
          `<button type="button" class="chip ${state.subsLang === item.lang ? 'on' : ''}" data-lang="${item.lang}">${escapeHtml(item.lang)} (${item.code})</button>`,
      )
      .join('');

    body.innerHTML = `
      <div class="step-title">Шаг 2 · параметры</div>
      <div>
        <div class="field-label">Озвучка</div>
        <div class="opt-grid" id="voice-grid">${voiceCards}</div>
      </div>
      <div>
        <div class="field-label">Качество</div>
        <div class="opt-grid" id="quality-grid">${qualityCards}</div>
      </div>
      <div>
        <label class="toggle-row"><input type="checkbox" id="subs-enabled" ${state.subs ? 'checked' : ''}> Скачивать субтитры</label>
        <div class="chip-row" id="lang-chips" style="margin-top:7px">${chips}</div>
      </div>`;
    return;
  }

  const list = selectedList();
  const rows = list
    .slice(0, 5)
    .map(
      (item) => `
      <div class="sum-row">
        <span class="sum-name">${epCodes(item.season, item.episode)} · ${escapeHtml(episodeTitle(item.season, item.episode))}</span>
        <span class="sum-q">${state.quality}</span>
        <span class="sum-size">${formatBytes(qualityInfo().size)}</span>
      </div>`,
    )
    .join('');

  const more =
    list.length > 5 ? `<div class="sum-more">и ещё ${list.length - 5} ${list.length - 5 === 1 ? 'серия' : 'серий'}</div>` : '';
  const { bytes } = selectionEstimate();

  body.innerHTML = `
    <div class="step-title">Шаг 3 · проверить и отправить</div>
    <div class="sum-rows">
      <div class="sum-row head"><span>Серия</span><span>Качество</span><span>Размер</span></div>
      ${rows}${more}
    </div>
    <div class="summary-line">
      Озвучка: <b>${escapeHtml(voiceoverInfo().title)}</b> · субтитры:
      ${state.subs ? `<b>${escapeHtml(state.subsLang)}</b>` : 'выключены'} · всего <b>${formatBytes(bytes)}</b>
    </div>
    <div class="server-widget">
      <span class="sw-dot ${state.online ? '' : 'bad'}"></span>
      <span class="sw-free">свободно 128.4 GB</span>
      <span class="sw-path">/srv/media/downloads</span>
      <span class="sw-spacer"></span>
      <span class="sw-meta">${list.length * (state.subs ? 2 : 1)} задач(и)</span>
    </div>`;
}

function renderFooter() {
  const foot = $('.wizard-foot').closest('.card');
  foot.classList.toggle('hidden', state.mode === 'nopage');

  const back = $('#wiz-back');
  const next = $('#wiz-next');
  const hint = $('#wiz-hint');

  back.disabled = state.step === 1;
  const { count, bytes } = selectionEstimate();

  if (state.step === 1) {
    next.textContent = 'Далее';
    next.disabled = count === 0;
    hint.textContent = count === 0 ? 'Выберите хотя бы одну серию' : `${count} ${count === 1 ? 'серия' : count < 5 ? 'серии' : 'серий'} · ≈ ${formatBytes(bytes)}`;
  } else if (state.step === 2) {
    next.textContent = 'Далее';
    next.disabled = false;
    hint.textContent = `${state.voiceover && voiceoverInfo().title} · ${state.quality}`;
  } else {
    next.textContent = `Отправить ${count * (state.subs ? 2 : 1)} задач(и)`;
    next.disabled = count === 0;
    hint.textContent = `≈ ${formatBytes(bytes)}`;
  }
}

function renderAlready() {
  const box = $('#already');
  if (state.mode === 'nopage' || state.step !== 3) {
    box.classList.add('hidden');
    return;
  }
  box.innerHTML = `${ICONS.alert}<span>Уже скачивалось: 1 готово, 1 качается, 1 в очереди. Повторная загрузка скачает заново и перезапишет готовые файлы, если они на месте.</span>`;
  box.classList.remove('hidden');
}

/* ──────────────────────────── экран «Очередь» ──────────────────────────── */

function groupStatus(list) {
  if (list.some((task) => task.status === 'downloading')) return 'downloading';
  if (list.some((task) => task.status === 'error')) return 'error';
  if (list.some((task) => task.status === 'paused')) return 'paused';
  if (list.every((task) => task.status === 'done')) return 'done';
  if (list.every((task) => task.status === 'canceled')) return 'canceled';
  return 'queued';
}

function groupPercent(list) {
  const total = list.reduce((sum, task) => sum + (task.total || 0), 0);
  const received = list.reduce((sum, task) => sum + (task.received || 0), 0);
  if (!total) return 0;
  return Math.min(100, (received / total) * 100);
}

function groupVisible(list) {
  const status = groupStatus(list);
  if (state.filter === 'all') return true;
  if (state.filter === 'active') return ['downloading', 'queued', 'paused'].includes(status);
  if (state.filter === 'error') return status === 'error' || status === 'canceled';
  if (state.filter === 'done') return status === 'done';
  return true;
}

function renderKpi() {
  const sum = stats();
  const active = state.tasks.filter((task) => task.status !== 'done' && task.status !== 'canceled').length;
  $('#queue-badge').textContent = String(active);

  $('#kpi-strip').innerHTML = `
    <div class="kpi"><div class="kpi-label"><i class="kpi-dot kd-blue"></i>Качается</div><div class="kpi-value kv-blue">${sum.downloading}</div></div>
    <div class="kpi"><div class="kpi-label"><i class="kpi-dot kd-gray"></i>В очереди</div><div class="kpi-value">${sum.queued}</div></div>
    <div class="kpi"><div class="kpi-label"><i class="kpi-dot kd-green"></i>Готово</div><div class="kpi-value kv-green">${sum.done + state.historyDone}</div></div>
    <div class="kpi"><div class="kpi-label"><i class="kpi-dot kd-red"></i>Ошибки</div><div class="kpi-value ${sum.error ? 'kv-red' : ''}">${sum.error}</div></div>`;
}

function renderQueue() {
  const list = $('#queue-list');

  if (!state.online) {
    list.innerHTML = `<div class="group-error" style="margin:10px 12px">${ICONS.alert}<span>Нет связи с сервером. Проверьте адрес в настройках (⚙).</span></div>`;
    return;
  }

  const groups = new Map();
  for (const task of state.tasks) {
    if (!groups.has(task.group)) groups.set(task.group, { year: task.year, tasks: [] });
    groups.get(task.group).tasks.push(task);
  }

  const html = [];
  for (const [name, group] of groups) {
    if (!groupVisible(group.tasks)) continue;

    const status = groupStatus(group.tasks);
    const pct = groupPercent(group.tasks);
    const collapsed = state.collapsed.has(name);
    const has = (list) => group.tasks.some((task) => list.includes(task.status));
    const armedCancel = state.armed?.key === `g:${name}:cancel`;
    const armedDelete = state.armed?.key === `g:${name}:delete`;

    const actions = [];
    if (has(['downloading', 'queued'])) actions.push(['pause', ICONS.pause, 'Пауза группе', '']);
    if (has(['paused'])) actions.push(['resume', ICONS.play, 'Продолжить группу', 'act-accent']);
    if (has(['error', 'canceled'])) actions.push(['retry', ICONS.retry, 'Повторить сбойные', 'act-accent']);
    if (has(['downloading', 'queued', 'paused'])) {
      actions.push([
        'cancel',
        ICONS.x,
        'Отменить группу',
        armedCancel ? 'act-armed' : 'act-danger',
      ]);
    }
    actions.push(['delete', ICONS.trash, 'Удалить из списка', armedDelete ? 'act-armed' : 'act-danger']);

    const errorTask = group.tasks.find((task) => task.status === 'error');

    const files = group.tasks
      .map((task) => {
        const typeIcon = task.type === 'subtitle' ? ICONS.subs : ICONS.film;
        return `
        <div class="file-row f-${task.status}">
          <span class="file-ico">${typeIcon}</span>
          <span class="file-name" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</span>
          <span class="file-status"><span class="pill pill-${task.status}">${STATUS[task.status]}</span></span>
          <span class="file-size">${task.total ? formatBytes(task.total) : ''}</span>
        </div>`;
      })
      .join('');

    html.push(`
      <div class="group ${collapsed ? 'collapsed' : ''}">
        <div class="group-head">
          <div class="group-id">
            <div class="group-title">
              <span class="group-name">${escapeHtml(name)}</span>
              <span class="group-year">${group.year}</span>
            </div>
            <div class="group-meta">
              <span class="pill pill-${status}">${STATUS[status]}</span>
              <div class="group-prog">
                <div class="prog-bar p-${status}"><span class="prog-fill" style="width:${pct.toFixed(1)}%"></span></div>
                <span class="group-pct">${pct.toFixed(0)}%</span>
              </div>
            </div>
          </div>
          <div class="group-actions">
            ${actions
              .map(
                ([action, icon, title, cls]) =>
                  `<button type="button" class="act-btn ${cls}" data-group="${escapeHtml(name)}" data-action="${action}" title="${title}">${
                    cls === 'act-armed' ? 'Точно?' : icon
                  }</button>`,
              )
              .join('')}
          </div>
        </div>
        ${errorTask ? `<div class="group-error">${ICONS.alert}<span>${escapeHtml(errorTask.error || 'Ошибка загрузки')}</span></div>` : ''}
        <button type="button" class="files-toggle" data-toggle="${escapeHtml(name)}">
          ${ICONS.chevron}<span>Файлы · ${group.tasks.length}</span>
        </button>
        <div class="group-files">${files}</div>
      </div>`);
  }

  list.innerHTML = html.join('');
}

function renderServer() {
  $('#sw-dot').classList.toggle('bad', !state.online);
  const sum = stats();
  if (!state.online) {
    $('#sw-free').textContent = 'нет связи';
    $('#sw-folder').textContent = '—';
    $('#sw-meta').textContent = 'проверьте адрес';
    return;
  }
  $('#sw-free').textContent = 'свободно 128.4 GB';
  $('#sw-folder').textContent = '/srv/media/downloads';
  $('#sw-meta').textContent = `ffmpeg · слотов ${sum.downloading}/${state.maxConcurrent}`;
}

function renderScreens() {
  $('#screen-send').classList.toggle('hidden', state.screen !== 'send');
  $('#screen-queue').classList.toggle('hidden', state.screen !== 'queue');
  for (const button of document.querySelectorAll('#screen-switch .seg-btn')) {
    button.classList.toggle('active', button.dataset.screen === state.screen);
  }
  for (const button of document.querySelectorAll('#queue-filter .seg-btn')) {
    button.classList.toggle('active', button.dataset.filter === state.filter);
  }
}

function renderAll() {
  renderScreens();
  renderPageInfo();
  renderStepper();
  renderStep();
  renderFooter();
  renderAlready();
  renderKpi();
  renderQueue();
  renderServer();
}

/* ──────────────────────────── симуляция ──────────────────────────── */

function tick() {
  for (const task of state.tasks) {
    if (task.status !== 'downloading') continue;
    task.speed = Math.min(12 * MB, Math.max(3 * MB, task.speed * (0.85 + Math.random() * 0.3)));
    task.received = Math.min(task.total, task.received + task.speed);
    if (task.received >= task.total) {
      task.status = 'done';
      task.speed = 0;
      state.historyDone += 1;
      toast(`Готово: ${task.name}`, 'success');
    }
  }

  const active = state.tasks.filter((task) => task.status === 'downloading').length;
  if (active < state.maxConcurrent) {
    const next = state.tasks.find((task) => task.status === 'queued');
    if (next) {
      next.status = 'downloading';
      next.speed = (5 + Math.random() * 4) * MB;
    }
  }

  if (state.armed && state.armed.until <= Date.now()) state.armed = null;

  renderKpi();
  renderQueue();
  renderServer();
}

/* ──────────────────────────── действия очереди ──────────────────────────── */

function applyGroupAction(name, action) {
  const group = state.tasks.filter((task) => task.group === name);

  if (action === 'pause') {
    for (const task of group) {
      if (task.status === 'downloading' || task.status === 'queued') {
        task.status = 'paused';
        task.speed = 0;
      }
    }
    toast(`«${name}» — пауза`, 'info');
  } else if (action === 'resume') {
    for (const task of group) {
      if (task.status === 'paused') task.status = 'queued';
    }
    toast(`«${name}» — продолжаем`, 'success');
  } else if (action === 'retry') {
    for (const task of group) {
      if (task.status === 'error' || task.status === 'canceled') {
        task.status = 'queued';
        task.received = 0;
        task.error = null;
      }
    }
    toast(`«${name}» — сбойные снова в очереди`, 'success');
  } else if (action === 'cancel') {
    let count = 0;
    for (const task of group) {
      if (['downloading', 'queued', 'paused'].includes(task.status)) {
        task.status = 'canceled';
        task.speed = 0;
        count++;
      }
    }
    toast(`«${name}» — отменено файлов: ${count}`, 'info');
  } else if (action === 'delete') {
    state.tasks = state.tasks.filter((task) => task.group !== name);
    toast(`«${name}» — убрано из списка (файлы на диске остаются)`, 'info');
  }

  renderKpi();
  renderQueue();
  renderServer();
}

/* ──────────────────────────── отправка ──────────────────────────── */

async function send() {
  if (state.busy) return;

  if (!state.online) {
    renderStatus('Ошибка: нет связи с сервером', 'bad');
    toast('Сервер недоступен — проверьте адрес (⚙)', 'error');
    return;
  }

  const list = selectedList();
  if (!list.length) {
    renderStatus('Не выбрано ни одной серии', 'bad');
    return;
  }

  state.busy = true;
  const button = $('#wiz-next');
  button.disabled = true;

  const quality = qualityInfo();
  const created = [];

  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    renderStatus(`Получаем ссылки: ${i + 1} из ${list.length}…`);
    await new Promise((resolve) => setTimeout(resolve, 260));

    created.push({
      id: nextId++,
      group: PAGE.title,
      year: PAGE.year,
      name: `Во все тяжкие ${epCodes(item.season, item.episode)}.${quality.label}.mkv`,
      type: 'video',
      status: 'queued',
      total: quality.size,
      received: 0,
      speed: 0,
      ep: epCodes(item.season, item.episode),
    });

    if (state.subs) {
      const lang = PAGE.subs.find((sub) => sub.lang === state.subsLang) ?? PAGE.subs[0];
      created.push({
        id: nextId++,
        group: PAGE.title,
        year: PAGE.year,
        name: `Во все тяжкие ${epCodes(item.season, item.episode)}.${lang.code}.vtt`,
        type: 'subtitle',
        status: 'queued',
        total: 96 * 1024,
        received: 0,
        speed: 0,
        ep: epCodes(item.season, item.episode),
      });
    }
  }

  state.tasks.unshift(...created);
  state.busy = false;
  button.disabled = false;

  toast(`Отправлено на сервер: ${created.length} задач(и)`, 'success');
  renderStatus(`Отправлено: ${created.length}`, 'good');

  // После отправки мастер уступает место очереди — видно, что поставленное живёт.
  state.screen = 'queue';
  state.step = 1;
  renderAll();
  setTimeout(() => renderStatus(''), 4000);
}

/* ──────────────────────────── события ──────────────────────────── */

$('#toggle-settings').addEventListener('click', () => $('#settings').classList.toggle('hidden'));

$('#save-settings').addEventListener('click', () => {
  $('#settings-status').textContent = 'Сохранено';
  setTimeout(() => ($('#settings-status').textContent = ''), 2000);
  toast('Настройки сохранены', 'success');
});

$('#copy-debug').addEventListener('click', () => toast('Диагностика скопирована (мок)', 'info'));

$('#screen-switch').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-screen]');
  if (!button) return;
  state.screen = button.dataset.screen;
  renderScreens();
});

$('#queue-filter').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-filter]');
  if (!button) return;
  state.filter = button.dataset.filter;
  renderScreens();
  renderQueue();
});

$('#stepper').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-step]');
  if (!button) return;
  const step = Number(button.dataset.step);
  if (step > 1 && state.selection.size === 0) {
    toast('Сначала выберите хотя бы одну серию', 'info');
    return;
  }
  state.step = step;
  renderStepper();
  renderStep();
  renderFooter();
  renderAlready();
});

$('#step-body').addEventListener('click', (event) => {
  const preset = event.target.closest('button[data-preset]');
  if (preset) {
    const value = preset.dataset.preset;
    state.preset = value;
    if (value === 'current') state.selection = new Set([epKey(PAGE.season, PAGE.episode)]);
    if (value === 'season') state.selection = new Set(allEpisodesOf(state.activeSeason));
    if (value === 'all') {
      state.selection = new Set();
      for (const key of SORTED_SEASONS) for (const ep of allEpisodesOf(key)) state.selection.add(ep);
    }
    renderStep();
    renderFooter();
    return;
  }

  const season = event.target.closest('button[data-season]');
  if (season) {
    state.activeSeason = Number(season.dataset.season);
    if (state.preset === 'season') state.selection = new Set(allEpisodesOf(state.activeSeason));
    renderStep();
    renderFooter();
    return;
  }

  const chip = event.target.closest('button[data-ep]');
  if (chip) {
    const key = chip.dataset.ep;
    if (state.selection.has(key)) state.selection.delete(key);
    else state.selection.add(key);
    state.preset = 'manual';
    renderStep();
    renderFooter();
    return;
  }

  const tool = event.target.closest('button[data-tool]');
  if (tool) {
    if (tool.dataset.tool === 'all') state.selection = new Set(allEpisodesOf(state.activeSeason));
    else state.selection.clear();
    state.preset = 'manual';
    renderStep();
    renderFooter();
    return;
  }

  const voice = event.target.closest('button[data-voice]');
  if (voice) {
    state.voiceover = voice.dataset.voice;
    renderStep();
    renderFooter();
    return;
  }

  const quality = event.target.closest('button[data-quality]');
  if (quality) {
    state.quality = quality.dataset.quality;
    renderStep();
    renderFooter();
    return;
  }

  const lang = event.target.closest('button[data-lang]');
  if (lang) {
    state.subsLang = lang.dataset.lang;
    renderStep();
    return;
  }
});

$('#step-body').addEventListener('change', (event) => {
  if (event.target.id === 'subs-enabled') {
    state.subs = event.target.checked;
    renderFooter();
  }
});

$('#wiz-back').addEventListener('click', () => {
  if (state.step > 1) {
    state.step -= 1;
    renderStepper();
    renderStep();
    renderFooter();
    renderAlready();
  }
});

$('#wiz-next').addEventListener('click', () => {
  if (state.step < 3) {
    state.step += 1;
    renderStepper();
    renderStep();
    renderFooter();
    renderAlready();
  } else {
    send();
  }
});

$('#queue-list').addEventListener('click', (event) => {
  const toggle = event.target.closest('button[data-toggle]');
  if (toggle) {
    const name = toggle.dataset.toggle;
    if (state.collapsed.has(name)) state.collapsed.delete(name);
    else state.collapsed.add(name);
    renderQueue();
    return;
  }

  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const name = button.dataset.group;
  const action = button.dataset.action;

  if (action === 'cancel' || action === 'delete') {
    const key = `g:${name}:${action}`;
    if (state.armed?.key !== key) {
      state.armed = { key, until: Date.now() + 4000 };
      renderQueue();
      return;
    }
    state.armed = null;
  }

  applyGroupAction(name, action);
});

$('#resume-all').addEventListener('click', () => {
  let resumed = 0;
  for (const task of state.tasks) {
    if (task.status === 'paused') {
      task.status = 'queued';
      resumed++;
    }
  }
  toast(resumed ? `Продолжаем задач: ${resumed}` : 'На паузе ничего нет', resumed ? 'success' : 'info');
  renderKpi();
  renderQueue();
  renderServer();
});

$('#stop-all').addEventListener('click', (event) => {
  const button = event.currentTarget;
  if (state.armed?.key !== 'stop-all') {
    state.armed = { key: 'stop-all', until: Date.now() + 4000 };
    button.classList.add('btn-armed');
    button.textContent = 'Точно остановить?';
    return;
  }

  state.armed = null;
  button.classList.remove('btn-armed');
  button.textContent = 'Остановить всё';

  let canceled = 0;
  for (const task of state.tasks) {
    if (task.status === 'downloading' || task.status === 'queued') {
      task.status = 'canceled';
      task.speed = 0;
      canceled++;
    }
  }
  toast(canceled ? `Отменено задач: ${canceled}` : 'Нечего отменять', 'info');
  renderKpi();
  renderQueue();
  renderServer();
});

$('#demo-bar').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-demo]');
  if (!button) return;

  for (const item of document.querySelectorAll('#demo-bar .seg-btn')) {
    item.classList.toggle('active', item === button);
  }

  const mode = button.dataset.demo;
  state.mode = mode;
  state.online = mode !== 'offline';

  if (mode === 'nopage') {
    state.screen = 'queue';
    toast('Открыта не та страница — показываю очередь', 'info');
  }
  if (mode === 'offline') renderStatus('Нет связи с сервером', 'bad');
  else renderStatus('');

  renderAll();
});

/* ──────────────────────────── запуск ──────────────────────────── */

renderAll();
setInterval(tick, 1000);