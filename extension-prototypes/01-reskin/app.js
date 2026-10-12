/**
 * Прототип №1 «Рескин» — логика 1:1 как в текущем попапе расширения,
 * данные ненастоящие (мок + симуляция скачивания). Никаких сетевых запросов.
 */

const $ = (sel) => document.querySelector(sel);
const MB = 1024 * 1024;
const GB = 1024 * MB;

const ICONS = {
  play: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polygon points="7 4 20 12 7 20 7 4"/></svg>',
  pause: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/></svg>',
  x: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  retry: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polyline points="21 4 21 10 15 10"/><path d="M20.5 14a8.5 8.5 0 1 1-1.9-8.4L21 8"/></svg>',
  alert: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  check: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
  info: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
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
    { id: '56', title: 'Кубик в Кубе' },
    { id: '12', title: 'LostFilm' },
    { id: '34', title: 'Jaskier' },
    { id: '77', title: 'HDrezka Studio', prem: true },
    { id: '110', title: 'Оригинал (Eng)' },
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

/* ──────────────────────────── мок очереди ──────────────────────────── */

let nextId = 100;

function makeTasks() {
  return [
    {
      id: 1,
      name: 'Дюна: Часть вторая (2024).1080p.mkv',
      type: 'video',
      status: 'downloading',
      total: 4.7 * GB,
      received: 4.7 * GB * 0.63,
      speed: 8.4 * MB,
    },
    {
      id: 2,
      name: 'Во все тяжкие S01E01.1080p.mkv',
      type: 'video',
      status: 'done',
      total: 1.4 * GB,
      received: 1.4 * GB,
      speed: 0,
    },
    {
      id: 3,
      name: 'Во все тяжкие S01E02.1080p.mkv',
      type: 'video',
      status: 'downloading',
      total: 1.4 * GB,
      received: 1.4 * GB * 0.41,
      speed: 5.2 * MB,
    },
    { id: 4, name: 'Во все тяжкие S01E03.1080p.mkv', type: 'video', status: 'queued', total: 1.4 * GB, received: 0, speed: 0 },
    {
      id: 5,
      name: 'Оппенгеймер (2023).1080p.mkv',
      type: 'video',
      status: 'error',
      total: 6.9 * GB,
      received: 0.2 * GB,
      speed: 0,
      error: 'HTTP 403: доступ запрещён',
    },
    {
      id: 6,
      name: 'Бегущий по лезвию 2049 (2017).1080p.mkv',
      type: 'video',
      status: 'paused',
      total: 5.2 * GB,
      received: 5.2 * GB * 0.77,
      speed: 0,
    },
    { id: 7, name: 'American Psycho.rus.vtt', type: 'subtitle', status: 'done', total: 96 * 1024, received: 96 * 1024, speed: 0 },
  ];
}

const state = {
  tasks: makeTasks(),
  online: true,
  mode: 'normal', // normal | nopage | offline
  busy: false,
  armed: null, // { key, until }
  historyDone: 128,
  maxConcurrent: 3,
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

function percent(task) {
  if (task.total > 0) return Math.min(100, (task.received / task.total) * 100);
  return task.status === 'done' ? 100 : 0;
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

function stats() {
  const result = { downloading: 0, queued: 0, done: 0, error: 0, paused: 0, canceled: 0 };
  for (const task of state.tasks) result[task.status] = (result[task.status] || 0) + 1;
  return result;
}

/* ──────────────────────────── выбор диапазона ──────────────────────────── */

function sliceSeasons(seasonFrom, episodeFrom, seasonTo, episodeTo) {
  const result = {};
  for (const key of SORTED_SEASONS) {
    if (key < seasonFrom || key > seasonTo) continue;
    let list = PAGE.seasons[key].episodes.slice().sort((a, b) => a.id - b.id);
    if (key === seasonFrom) list = list.filter((episode) => episode.id >= episodeFrom);
    if (key === seasonTo && episodeTo) list = list.filter((episode) => episode.id <= episodeTo);
    result[key] = list;
  }
  return result;
}

function selectedEpisodes() {
  const mode = $('#range-mode').value;
  if (mode === 'current') return [{ season: PAGE.season, episode: PAGE.episode }];

  if (mode === 'season') {
    return PAGE.seasons[PAGE.season].episodes.map((episode) => ({
      season: PAGE.season,
      episode: episode.id,
    }));
  }

  if (mode === 'all') {
    const result = [];
    for (const key of SORTED_SEASONS) {
      for (const episode of PAGE.seasons[key].episodes) result.push({ season: key, episode: episode.id });
    }
    return result;
  }

  const sliced = sliceSeasons(
    Number($('#season-from').value),
    Number($('#episode-from').value),
    Number($('#season-to').value),
    Number($('#episode-to').value) || 0,
  );
  const result = [];
  for (const key of Object.keys(sliced).sort((a, b) => Number(a) - Number(b))) {
    for (const episode of sliced[key]) result.push({ season: Number(key), episode: episode.id });
  }
  return result;
}

function currentQuality() {
  const label = $('#quality').value;
  return PAGE.qualities.find((item) => item.label === label) ?? PAGE.qualities[1];
}

function renderSendHint() {
  const hint = $('#send-hint');
  if (state.mode === 'nopage') {
    hint.textContent = '';
    return;
  }
  const episodes = selectedEpisodes();
  const withSubs = $('#subs-enabled').checked && $('#subs-lang-wrap').classList.contains('hidden') === false;
  const video = episodes.length * currentQuality().size;
  const subs = withSubs ? episodes.length * 96 * 1024 : 0;
  const word = episodes.length === 1 ? 'серия' : episodes.length < 5 ? 'серии' : 'серий';
  hint.textContent = `К отправке: ${episodes.length} ${word} · ≈ ${formatBytes(video + subs)}`;
}

/* ──────────────────────────── рендеры ──────────────────────────── */

function renderPage() {
  const box = $('#page-info');
  const sub = $('#conn-sub');

  if (state.mode === 'nopage') {
    box.innerHTML = `
      <div class="page-error">
        <div class="pe-title">${ICONS.alert}<span>Это не страница фильма или сериала</span></div>
        <div class="pe-text">Откройте страницу фильма или сериала на hdrezka (или зеркале) и откройте попап снова.</div>
      </div>`;
    $('#controls').classList.add('hidden');
    $('#already').classList.add('hidden');
    sub.textContent = state.online ? 'сервер на связи' : 'нет связи с сервером';
    sub.classList.toggle('bad', !state.online);
    return;
  }

  box.innerHTML = `
    <div class="page-title-row">
      <span class="page-kind">${PAGE.kind}</span>
      <span class="page-name">${escapeHtml(PAGE.title)}</span>
      <span class="page-year">${PAGE.year}</span>
    </div>
    <div class="page-meta">
      <span>${escapeHtml(PAGE.origTitle)}</span>
      <span class="dot-sep">·</span>
      <span class="page-ep">S${String(PAGE.season).padStart(2, '0')}E${String(PAGE.episode).padStart(2, '0')} · ${escapeHtml(PAGE.seasons[PAGE.season].episodes[PAGE.episode - 1].title)}</span>
      <span class="dot-sep">·</span>
      <span>плеер: ${PAGE.quality}</span>
    </div>`;
  $('#controls').classList.remove('hidden');
  sub.textContent = state.online ? 'сервер на связи' : 'нет связи с сервером';
  sub.classList.toggle('bad', !state.online);
}

function renderVoiceovers() {
  const select = $('#voiceover');
  select.innerHTML = '';
  for (const voice of PAGE.voiceovers) {
    const option = document.createElement('option');
    option.value = voice.id;
    option.textContent = voice.title + (voice.prem ? ' ★' : '');
    select.appendChild(option);
  }
  select.value = '56';
}

function renderQualities() {
  const select = $('#quality');
  select.innerHTML = '';
  for (const item of PAGE.qualities) {
    const option = document.createElement('option');
    option.value = item.label;
    option.textContent = item.label + (item.prem ? ' ★ премиум' : '') + ` · ≈ ${formatBytes(item.size)}`;
    select.appendChild(option);
  }
  select.value = PAGE.quality;
}

function renderSubs() {
  const select = $('#subs-lang');
  select.innerHTML = '';
  for (const item of PAGE.subs) {
    const option = document.createElement('option');
    option.value = item.lang;
    option.textContent = `${item.lang} (${item.code})`;
    select.appendChild(option);
  }
  select.value = 'Русский';
}

function renderSeasons() {
  const fill = (select, options, selected) => {
    select.innerHTML = '';
    for (const [value, label] of options) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      select.appendChild(option);
    }
    select.value = String(selected);
  };

  const seasonOptions = SORTED_SEASONS.map((key) => [String(key), PAGE.seasons[key].title]);
  fill($('#season-from'), seasonOptions, PAGE.season);
  fill($('#season-to'), [...seasonOptions, ['-1', 'конец сезона'], ['-2', 'конец сериала']], '-2');

  fillEpisodesFrom();
  $('#episode-to').innerHTML = '<option value="">до последней</option>';
}

function fillEpisodesFrom() {
  const seasonKey = $('#season-from').value;
  const select = $('#episode-from');
  select.innerHTML = '';
  if (seasonKey === '-1' || seasonKey === '-2') return;
  for (const episode of PAGE.seasons[Number(seasonKey)]?.episodes ?? []) {
    const option = document.createElement('option');
    option.value = episode.id;
    option.textContent = episode.title;
    select.appendChild(option);
  }
}

function renderArmed() {
  const armed = state.armed && state.armed.until > Date.now() ? state.armed : (state.armed = null);

  const stop = $('#stop-all');
  if (armed?.key === 'stop-all') {
    stop.textContent = 'Точно остановить?';
    stop.classList.add('btn-armed');
  } else {
    stop.textContent = 'Остановить';
    stop.classList.remove('btn-armed');
  }
}

function renderQueue() {
  const list = $('#queue-list');
  const sum = stats();

  $('#queue-stats').textContent = state.online
    ? `скачивается ${sum.downloading}/${state.maxConcurrent} · в очереди ${sum.queued} · готово ${sum.done}` +
      (sum.error ? ` · ошибок ${sum.error}` : '') +
      (sum.paused ? ` · пауза ${sum.paused}` : '')
    : 'нет связи';

  if (!state.online) {
    list.innerHTML = `
      <div class="queue-err">${ICONS.alert}<span>Нет связи с сервером. Проверьте адрес в настройках (⚙).</span></div>`;
    return;
  }

  if (!state.tasks.length) {
    list.innerHTML = '';
    return;
  }

  list.innerHTML = state.tasks
    .map((task) => {
      const pct = percent(task);
      const buttons = [];

      if (task.status === 'downloading' || task.status === 'queued') {
        buttons.push(['pause', ICONS.pause, 'Пауза']);
        buttons.push(['cancel', ICONS.x, 'Отменить']);
      } else if (task.status === 'paused') {
        buttons.push(['resume', ICONS.play, 'Продолжить']);
        buttons.push(['cancel', ICONS.x, 'Отменить']);
      } else if (task.status === 'error' || task.status === 'canceled') {
        buttons.push(['retry', ICONS.retry, 'Повторить']);
      }

      const armedCancel = state.armed?.key === `${task.id}:cancel`;

      return `
        <div class="q-item">
          <div class="q-line">
            <span class="q-name" title="${escapeHtml(task.name)}">${escapeHtml(task.name)}</span>
            <span class="q-size">${
              task.total > 0
                ? `${formatBytes(task.received)} / ${formatBytes(task.total)}`
                : formatBytes(task.received)
            }</span>
          </div>
          <div class="prog-bar p-${task.status}"><span class="prog-fill" style="width:${pct.toFixed(1)}%"></span></div>
          <div class="q-foot">
            <span class="pill pill-${task.status}">${STATUS[task.status] || task.status}</span>
            <span class="q-speed ${task.status === 'downloading' ? '' : 'idle'}">${
              task.status === 'downloading' ? formatSpeed(task.speed) : task.error ? escapeHtml(task.error) : formatBytes(task.total)
            }</span>
            <span class="q-actions">${buttons
              .map(([action, icon, title]) =>
                action === 'cancel' && armedCancel
                  ? `<button type="button" class="act-btn act-armed" data-id="${task.id}" data-action="cancel">Точно?</button>`
                  : `<button type="button" class="act-btn ${action === 'cancel' ? 'act-danger' : ''}" data-id="${task.id}" data-action="${action}" title="${title}">${icon}</button>`,
              )
              .join('')}</span>
          </div>
        </div>`;
    })
    .join('');
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

function renderStatus(text, kind = '') {
  const el = $('#action-status');
  el.textContent = text || '';
  el.className = `status-line ${kind}`;
}

function renderAlready() {
  const box = $('#already');
  if (state.mode === 'nopage') {
    box.classList.add('hidden');
    return;
  }
  box.innerHTML = `${ICONS.alert}<span>Уже скачивалось: 1 готово, 1 качается, 1 в очереди. Повторная загрузка скачает заново и перезапишет готовые файлы, если они на месте.</span>`;
  box.classList.remove('hidden');
}

function renderAll() {
  renderPage();
  renderQueue();
  renderServer();
  renderArmed();
  renderSendHint();
  renderAlready();
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
  renderQueue();
  renderServer();
  renderArmed();
}

/* ──────────────────────────── действия ──────────────────────────── */

function findTask(id) {
  return state.tasks.find((task) => String(task.id) === String(id));
}

function applyAction(id, action) {
  const task = findTask(id);
  if (!task) return;

  if (action === 'pause' && (task.status === 'downloading' || task.status === 'queued')) {
    task.status = 'paused';
    task.speed = 0;
  } else if (action === 'resume' && task.status === 'paused') {
    task.status = 'queued';
  } else if (action === 'cancel') {
    task.status = 'canceled';
    task.speed = 0;
  } else if (action === 'retry' && (task.status === 'error' || task.status === 'canceled')) {
    task.status = 'queued';
    task.received = 0;
    task.error = null;
  }
  renderQueue();
  renderServer();
}

async function handleDownload() {
  if (state.busy) return;

  if (!state.online) {
    renderStatus('Ошибка: нет связи с сервером', 'bad');
    toast('Сервер недоступен — проверьте адрес (⚙)', 'error');
    return;
  }

  const episodes = selectedEpisodes();
  if (!episodes.length) {
    renderStatus('Не выбрано ни одной серии', 'bad');
    return;
  }

  state.busy = true;
  const button = $('#download');
  button.disabled = true;
  renderStatus(`Получаем ссылки: 1 из ${episodes.length}…`);

  // Симуляция сбора ссылок (в реальном расширении — поход на сайт за CDN).
  await new Promise((resolve) => setTimeout(resolve, 700));

  const quality = currentQuality();
  const subsOn = $('#subs-enabled').checked;
  const subsLang = $('#subs-lang').value;

  const created = [];
  for (const episode of episodes) {
    created.push({
      id: nextId++,
      name: `Во все тяжкие S${String(episode.season).padStart(2, '0')}E${String(episode.episode).padStart(2, '0')}.${quality.label}.mkv`,
      type: 'video',
      status: 'queued',
      total: quality.size,
      received: 0,
      speed: 0,
    });
    if (subsOn) {
      const lang = PAGE.subs.find((item) => item.lang === subsLang);
      created.push({
        id: nextId++,
        name: `Во все тяжкие S${String(episode.season).padStart(2, '0')}E${String(episode.episode).padStart(2, '0')}.${lang.code}.vtt`,
        type: 'subtitle',
        status: 'queued',
        total: 96 * 1024,
        received: 0,
        speed: 0,
      });
    }
  }

  state.tasks.unshift(...created);
  renderStatus(`Отправлено: ${created.length}`, 'good');
  toast(`Отправлено на сервер: ${created.length} ${created.length === 1 ? 'задача' : 'задачи'}`, 'success');

  state.busy = false;
  button.disabled = false;
  renderQueue();
  renderServer();
}

/* ──────────────────────────── события ──────────────────────────── */

$('#toggle-settings').addEventListener('click', () => $('#settings').classList.toggle('hidden'));

$('#save-settings').addEventListener('click', () => {
  $('#settings-status').textContent = 'Сохранено';
  setTimeout(() => ($('#settings-status').textContent = ''), 2000);
  toast('Настройки сохранены', 'success');
});

$('#copy-debug').addEventListener('click', () => {
  toast('Диагностика скопирована в буфер обмена (мок)', 'info');
});

$('#voiceover').addEventListener('change', async () => {
  renderStatus('Обновляем данные для выбранной озвучки…');
  await new Promise((resolve) => setTimeout(resolve, 500));
  renderStatus('');
  renderSendHint();
  toast(`Озвучка: ${$('#voiceover').selectedOptions[0].textContent}`, 'info');
});

$('#subs-enabled').addEventListener('change', () => {
  const on = $('#subs-enabled').checked;
  $('#subs-lang-wrap').classList.toggle('hidden', !on);
  $('#subs-note').classList.toggle('hidden', on);
  if (!on) $('#subs-note').classList.add('hidden');
  renderSendHint();
});

$('#range-mode').addEventListener('change', () => {
  $('#range-custom').classList.toggle('hidden', $('#range-mode').value !== 'custom');
  renderSendHint();
});

$('#season-from').addEventListener('change', () => {
  fillEpisodesFrom();
  renderSendHint();
});

for (const id of ['#quality', '#season-to', '#episode-from', '#episode-to']) {
  $(id).addEventListener('change', renderSendHint);
}

$('#download').addEventListener('click', handleDownload);

$('#queue-list').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const { id, action } = button.dataset;
  if (action === 'cancel') {
    const key = `${id}:cancel`;
    if (state.armed?.key !== key) {
      state.armed = { key, until: Date.now() + 4000 };
      renderArmed();
      renderQueue();
      return;
    }
    state.armed = null;
  }

  applyAction(id, action);
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
  renderQueue();
});

$('#stop-all').addEventListener('click', () => {
  if (state.armed?.key !== 'stop-all') {
    state.armed = { key: 'stop-all', until: Date.now() + 4000 };
    renderArmed();
    return;
  }

  state.armed = null;
  let canceled = 0;
  for (const task of state.tasks) {
    if (task.status === 'downloading' || task.status === 'queued') {
      task.status = 'canceled';
      task.speed = 0;
      canceled++;
    }
  }
  renderArmed();
  toast(canceled ? `Отменено задач: ${canceled}` : 'Нечего отменять', canceled ? 'info' : 'info');
  renderQueue();
  renderServer();
});

/* демо-переключатели состояния */
$('#demo-bar').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-demo]');
  if (!button) return;

  for (const item of document.querySelectorAll('#demo-bar .seg-btn')) {
    item.classList.toggle('active', item === button);
  }

  const mode = button.dataset.demo;
  state.mode = mode;
  state.online = mode !== 'offline';

  if (mode === 'offline') {
    renderStatus('Нет связи с сервером', 'bad');
  } else {
    renderStatus('');
  }
  renderAll();
});

/* ──────────────────────────── запуск ──────────────────────────── */

renderVoiceovers();
renderQualities();
renderSubs();
renderSeasons();
renderAll();
setInterval(tick, 1000);