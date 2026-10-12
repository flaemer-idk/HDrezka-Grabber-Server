/**
 * Прототип №3 «Автопилот» — другая парадигма: попапа нет, панель живёт поверх
 * страницы, знает её контекст и умеет качать в один клик, ставить сезон целиком
 * и следить за новыми сериями. Данные ненастоящие (мок + симуляция). Без сети.
 */

const $ = (sel) => document.querySelector(sel);
const MB = 1024 * 1024;
const GB = 1024 * MB;

const ICONS = {
  alert: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  check: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>',
  info: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
  bolt: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
};

/* ──────────────────────────── мок страниц ──────────────────────────── */

const PAGES = {
  series: {
    kind: 'сериал',
    title: 'Во все тяжкие',
    orig: 'Breaking Bad',
    year: 2008,
    season: 1,
    episode: 2,
    episodeTitle: 'Кот в мешке',
    playerQuality: '1080p',
    playerVoice: 'Кубик в Кубе',
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
  film: {
    kind: 'фильм',
    title: 'Оппенгеймер',
    orig: 'Oppenheimer',
    year: 2023,
    playerQuality: '2160p Ultra',
    playerVoice: 'Оригинал (Eng)',
    episodes: null,
  },
};

const QUALITIES = [
  { label: '1080p', size: 1.4 * GB, film: 6.9 * GB },
  { label: '2160p Ultra', size: 4.1 * GB, film: 19.4 * GB },
  { label: '720p', size: 780 * MB, film: 3.8 * GB },
  { label: '480p', size: 420 * MB, film: 2.1 * GB },
];

const SUB_TEXTS = ['Субтитры: rus', 'Субтитры: eng', 'Субтитры: выкл'];
const VOICE_VALUES = ['с плеера', 'Кубик в Кубе', 'LostFilm', 'Jaskier', 'Оригинал (Eng)'];

/* ──────────────────────────── мок задач сервера ──────────────────────────── */

let nextId = 100;

function makeTasks() {
  return [
    {
      id: 1,
      name: 'Дюна: Часть вторая (2024).1080p.mkv',
      status: 'downloading',
      total: 4.7 * GB,
      received: 4.7 * GB * 0.63,
      speed: 8.4 * MB,
      short: 'Дюна: Часть вторая',
    },
    { id: 2, name: 'Во все тяжкие S01E02.1080p.mkv', status: 'downloading', total: 1.4 * GB, received: 1.4 * GB * 0.41, speed: 5.2 * MB, short: 'S01E02.1080p.mkv' },
    { id: 3, name: 'Во все тяжкие S01E03.1080p.mkv', status: 'queued', total: 1.4 * GB, received: 0, speed: 0, short: 'S01E03.1080p.mkv' },
    { id: 4, name: 'Оппенгеймер (2023).1080p.mkv', status: 'error', total: 6.9 * GB, received: 0.2 * GB, speed: 0, short: 'Оппенгеймер (2023).1080p', error: 'HTTP 403' },
    { id: 5, name: 'Бегущий по лезвию 2049 (2017).1080p.mkv', status: 'paused', total: 5.2 * GB, received: 5.2 * GB * 0.77, speed: 0, short: 'Бегущий по лезвию 2049' },
  ];
}

const state = {
  page: 'series',
  qualityIndex: 0,
  subIndex: 0,
  voiceIndex: 0,
  autopilot: false,
  autopilotTimer: null,
  collapsed: false,
  online: true,
  busy: false,
  tasks: makeTasks(),
  journal: [],
  sentEpisodes: new Set(),
  season: { active: false, sent: 0, total: 0, timer: null },
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function nowText() {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function toast(message, kind = 'info') {
  const icons = { info: ICONS.info, success: ICONS.check, error: ICONS.alert, auto: ICONS.bolt };
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.innerHTML = `${icons[kind] || icons.info}<span>${escapeHtml(message)}</span>`;
  $('#toasts').appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 220);
  }, 3600);
}

function log(text, kind = '') {
  state.journal.unshift({ time: nowText(), text, kind });
  if (state.journal.length > 14) state.journal.pop();
  renderJournal();
}

function epCodes(season, episode) {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

function subsEnabled() {
  return SUB_TEXTS[state.subIndex] !== 'Субтитры: выкл';
}

function subsCode() {
  return state.subIndex === 0 ? 'rus' : 'eng';
}

function currentQuality() {
  return QUALITIES[state.qualityIndex];
}

function currentVoice() {
  const value = VOICE_VALUES[state.voiceIndex];
  return value === 'с плеера' ? PAGES[state.page]?.playerVoice ?? 'с плеера' : value;
}

function activePage() {
  return state.page === 'none' ? null : PAGES[state.page];
}

function stats() {
  const result = { downloading: 0, queued: 0, done: 0, error: 0, paused: 0, canceled: 0 };
  for (const task of state.tasks) result[task.status] = (result[task.status] || 0) + 1;
  return result;
}

/* ──────────────────────────── рендер страницы-фона ──────────────────────────── */

function renderFakePage() {
  const page = activePage();
  const recognized = Boolean(page);

  $('#crumb-title').textContent = page ? page.title : 'Страница не распознана';
  $('#pg-title').textContent = page ? page.title : 'Не найдено';
  $('#pg-orig').textContent = recognized ? page.orig : '';
  $('#pg-meta').innerHTML = page
    ? `<span class="pg-chip">${page.year}</span><span class="pg-chip">${page.kind === 'сериал' ? 'США' : 'США, Великобритания'}</span>
       <span class="pg-chip">${page.kind === 'сериал' ? 'драма, криминал, триллер' : 'биография, драма, история'}</span>
       <span class="pg-chip pg-chip-accent">★ ${page.kind === 'сериал' ? '9.1' : '8.4'} IMDb</span>
       <span class="pg-chip">16+</span>`
    : '<span class="pg-chip">—</span>';

  $('#pg-badge-quality').textContent = page?.playerQuality ?? '—';
  $('#pg-badge-voice').textContent = page?.playerVoice ?? '—';
  $('#pg-badge-ep').textContent = page?.episodes
    ? `${epCodes(page.season, page.episode)} · ${page.episodeTitle}`
    : page
      ? `${page.year} · фильм`
      : '—';

  const section = $('#pg-episodes-section');
  section.classList.toggle('hidden', !page?.episodes);

  if (page?.episodes) {
    $('#pg-episodes').innerHTML = page.episodes
      .map((episode) => {
        const isCurrent = episode.id === page.episode;
        const isQueued = state.sentEpisodes.has(episode.id);
        return `<button type="button" class="pg-ep ${isCurrent ? 'on' : ''} ${isQueued && !isCurrent ? 'done' : ''}" data-episode="${episode.id}">
          <span class="e-num">${epCodes(page.season, episode.id)}${isQueued ? ' · в очереди' : ''}</span>
          <span class="e-title">${escapeHtml(episode.title)}</span>
        </button>`;
      })
      .join('');
  }
}

/* ──────────────────────────── рендер панели ──────────────────────────── */

function renderContext() {
  const page = activePage();
  const box = $('#pn-ctx');

  if (!page) {
    box.innerHTML = `
      <div class="ctx-label">Сейчас на странице</div>
      <div class="ctx-unrecognized">${ICONS.alert}<span>Это не страница фильма или сериала — качать нечего</span></div>
      <div class="ctx-meta">Откройте страницу фильма или сериала, панель подхватит её сама. Очередь и автопилот работают всегда.</div>`;
  } else if (page.episodes) {
    box.innerHTML = `
      <div class="ctx-label">Сейчас на странице</div>
      <div class="ctx-title">${escapeHtml(page.title)} · ${epCodes(page.season, page.episode)}</div>
      <div class="ctx-meta">
        <span class="page-ep">${epCodes(page.season, page.episode)} · ${escapeHtml(page.episodeTitle)}</span>
        <span class="ctx-sep">·</span>
        <span>плеер: ${page.playerQuality}</span>
        <span class="ctx-sep">·</span>
        <span>озвучка с плеера: ${escapeHtml(page.playerVoice)}</span>
      </div>`;
  } else {
    box.innerHTML = `
      <div class="ctx-label">Сейчас на странице</div>
      <div class="ctx-title">${escapeHtml(page.title)} (${page.year})</div>
      <div class="ctx-meta">
        <span class="page-ep">фильм</span>
        <span class="ctx-sep">·</span>
        <span>плеер: ${page.playerQuality}</span>
        <span class="ctx-sep">·</span>
        <span>озвучка: ${escapeHtml(page.playerVoice)}</span>
      </div>`;
  }

  const recognized = Boolean(page);
  $('#one-click').disabled = !recognized || !state.online;
  $('#one-click-label').textContent = page?.episodes
    ? `Скачать ${epCodes(page.season, page.episode)}`
    : page
      ? 'Скачать фильм'
      : 'Скачать';
  $('#season-all').disabled = !page?.episodes || !state.online;
  $('#subs-toggle').textContent = SUB_TEXTS[state.subIndex];
  $('#quality-chip').textContent = currentQuality().label;
  $('#voice-chip').textContent = `озвучка: ${currentVoice()}`;
  $('#voice-chip').classList.toggle('on', VOICE_VALUES[state.voiceIndex] !== 'с плеера');
}

function renderJournal() {
  const box = $('#journal');
  $('#journal-sub').textContent = state.journal.length
    ? `${state.journal.length} ${state.journal.length === 1 ? 'событие' : 'событий'}`
    : 'пусто';

  if (!state.journal.length) {
    box.innerHTML = '<div class="journal-empty">Пока ничего не происходило. Нажмите «Скачать серию» или включите автопилот.</div>';
    return;
  }

  box.innerHTML = state.journal
    .map(
      (item) => `<div class="journal-row ${item.kind ? `j-${item.kind}` : ''}">
        <span class="j-time">${item.time}</span>
        <span class="j-text">${escapeHtml(item.text)}</span>
      </div>`,
    )
    .join('');
}

function renderMiniTasks() {
  const sum = stats();
  $('#tasks-sub').textContent = `качается ${sum.downloading}/${state.maxConcurrent} · очередь ${sum.queued}`;

  const list = state.tasks.slice(0, 4);
  $('#mini-tasks').innerHTML = list
    .map((task) => {
      const pct = task.total ? Math.min(100, (task.received / task.total) * 100) : task.status === 'done' ? 100 : 0;
      const label =
        task.status === 'error' ? 'ошибка' : task.status === 'done' ? 'готово' : task.status === 'paused' ? 'пауза' : task.status === 'queued' ? 'ждёт' : `${pct.toFixed(0)}%`;
      return `
      <div class="mini-row">
        <div class="mini-name-wrap">
          <span class="mini-name" title="${escapeHtml(task.name)}">${escapeHtml(task.short || task.name)}</span>
          <div class="prog-bar"><span class="prog-fill" style="width:${pct.toFixed(1)}%"></span></div>
        </div>
        <span class="mini-pct st-${task.status}">${label}</span>
      </div>`;
    })
    .join('');

  $('#pill-text').textContent = `${sum.downloading} · ${Math.round(
    state.tasks.filter((task) => task.status === 'downloading').reduce((max, task) => Math.max(max, task.total ? (task.received / task.total) * 100 : 0), 0),
  )}%`;
}

function renderSeasonBlock() {
  const block = $('#season-block');
  const page = activePage();
  const show = state.season.active || (state.season.total > 0 && state.season.sent < state.season.total);
  block.classList.toggle('hidden', !show);
  if (!show) return;

  const total = state.season.total || page?.episodes?.length || 0;
  const pct = total ? (state.season.sent / total) * 100 : 0;
  $('#season-title').textContent = `Сезон ${page?.season ?? 1} целиком`;
  $('#season-fill').style.width = `${pct.toFixed(1)}%`;
  $('#season-note').textContent = state.season.active
    ? `отправлено ${state.season.sent} из ${total} — ставлю серии по порядку…`
    : `отправлено ${state.season.sent} из ${total}${state.season.sent === total && total ? ' · сезон поставлен целиком' : ' · остановлено'}`;
}

function renderAutopilot() {
  const row = $('.toggle-row');
  row.classList.toggle('auto', state.autopilot);
  $('#autopilot-toggle').checked = state.autopilot;
  $('#autopilot-sub').textContent = state.autopilot
    ? 'Включён. Как только на странице появится новая серия — панель сама поставит её в очередь (в демо это произойдёт через ~15 секунд).'
    : 'Выключен. Включите — панель сама поставит в очередь новые серии, как только они появятся на странице.';
}

function renderDot() {
  $('#pn-dot').classList.toggle('bad', !state.online);
  $('#pn-context').textContent = state.online
    ? `панель на странице · сервер на связи · ${state.tasks.filter((task) => task.status === 'downloading').length} качается`
    : 'нет связи с сервером';
  $('#pn-context').classList.toggle('bad', !state.online);
}

function renderAll() {
  renderFakePage();
  renderContext();
  renderJournal();
  renderMiniTasks();
  renderSeasonBlock();
  renderAutopilot();
  renderDot();
}

/* ──────────────────────────── постановка задач ──────────────────────────── */

function queueEpisode(season, episode, source) {
  const quality = currentQuality();
  const page = activePage() ?? PAGES.series;
  const created = [
    {
      id: nextId++,
      name: `${page.title} ${epCodes(season, episode)}.${quality.label}.mkv`,
      short: `${epCodes(season, episode)}.${quality.label}.mkv`,
      status: 'queued',
      total: quality.size,
      received: 0,
      speed: 0,
    },
  ];
  if (subsEnabled()) {
    created.push({
      id: nextId++,
      name: `${page.title} ${epCodes(season, episode)}.${subsCode()}.vtt`,
      short: `${epCodes(season, episode)}.${subsCode()}.vtt`,
      status: 'queued',
      total: 96 * 1024,
      received: 0,
      speed: 0,
    });
  }

  state.tasks.unshift(...created);
  state.sentEpisodes.add(episode);

  if (source === 'auto') {
    log(`Автопилот: ${epCodes(season, episode)} найдена и поставлена в очередь`, 'auto');
    toast(`Автопилот: новая серия ${epCodes(season, episode)} поставлена в очередь`, 'auto');
  } else {
    log(`${epCodes(season, episode)} поставлена в очередь (${created.length} задач)`, 'ok');
  }

  renderMiniTasks();
  renderFakePage();
  return created.length;
}

function queueFilm() {
  const quality = currentQuality();
  const page = PAGES.film;
  const created = [
    {
      id: nextId++,
      name: `${page.title} (${page.year}).${quality.label}.mkv`,
      short: `${page.title} (${page.year}).${quality.label}.mkv`,
      status: 'queued',
      total: quality.film,
      received: 0,
      speed: 0,
    },
  ];
  if (subsEnabled()) {
    created.push({
      id: nextId++,
      name: `${page.title} (${page.year}).${subsCode()}.vtt`,
      short: `${page.title} (${page.year}).${subsCode()}.vtt`,
      status: 'queued',
      total: 96 * 1024,
      received: 0,
      speed: 0,
    });
  }
  state.tasks.unshift(...created);
  log(`${page.title} (${page.year}) поставлен в очередь (${created.length} задач)`, 'ok');
  renderMiniTasks();
  return created.length;
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
      log(`Готово: ${task.short || task.name}`, 'ok');
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

  renderMiniTasks();
  renderDot();
}

/* ──────────────────────────── режим сезона ──────────────────────────── */

function startSeasonQueue() {
  const page = activePage();
  if (!page?.episodes || state.season.active) return;

  state.season = { active: true, sent: 0, total: page.episodes.length, timer: null };
  log(`Сезон ${page.season}: ставлю серии по порядку`, 'ok');
  toast(`Ставлю сезон ${page.season} целиком (${page.episodes.length} серий)`, 'info');
  renderSeasonBlock();

  state.season.timer = setInterval(() => {
    const next = page.episodes.find((episode) => !state.sentEpisodes.has(episode.id));
    if (!next) {
      finishSeasonQueue(true);
      return;
    }
    queueEpisode(page.season, next.id, 'season');
    state.season.sent += 1;
    renderSeasonBlock();
    if (state.season.sent >= state.season.total) finishSeasonQueue(true);
  }, 1100);
}

function finishSeasonQueue(complete) {
  if (state.season.timer) clearInterval(state.season.timer);
  state.season = { ...state.season, active: false, timer: null };
  if (complete) {
    log(`Сезон поставлен целиком: ${state.season.sent} серий`, 'ok');
    toast(`Сезон отправлен на сервер: ${state.season.sent} серий`, 'success');
  } else {
    log(`Режим сезона остановлен на ${state.season.sent} из ${state.season.total}`, 'err');
    toast('Режим сезона остановлен', 'info');
  }
  renderSeasonBlock();
}

/* ──────────────────────────── автопилот ──────────────────────────── */

function scheduleAutopilotCheck(delay = 15000) {
  if (state.autopilotTimer) clearTimeout(state.autopilotTimer);
  state.autopilotTimer = setTimeout(() => {
    if (!state.autopilot) return;

    const page = activePage();
    if (page?.episodes) {
      const next = page.episodes.find((episode) => !state.sentEpisodes.has(episode.id));
      if (next) {
        queueEpisode(page.season, next.id, 'auto');
      } else {
        log('Автопилот: новых серий не появилось', '');
      }
    } else {
      log('Автопилот: страница не распознана, проверка пропущена', '');
    }

    scheduleAutopilotCheck(22000);
  }, delay);
}

function setAutopilot(on) {
  state.autopilot = on;
  if (on) {
    log('Автопилот включён — слежу за новыми сериями', 'auto');
    toast('Автопилот включён: слежу за новыми сериями', 'auto');
    scheduleAutopilotCheck(15000);
  } else {
    if (state.autopilotTimer) clearTimeout(state.autopilotTimer);
    state.autopilotTimer = null;
    log('Автопилот выключен', '');
  }
  renderAutopilot();
}

/* ──────────────────────────── события ──────────────────────────── */

$('#one-click').addEventListener('click', () => {
  const page = activePage();
  if (!page) return;
  if (!state.online) {
    toast('Сервер недоступен — проверьте адрес (⚙)', 'error');
    log('Отправка не удалась: нет связи с сервером', 'err');
    return;
  }

  if (page.episodes) {
    if (state.sentEpisodes.has(page.episode)) {
      toast(`${epCodes(page.season, page.episode)} уже в очереди`, 'info');
      return;
    }
    queueEpisode(page.season, page.episode, 'click');
    toast(`${epCodes(page.season, page.episode)} отправлена на сервер (${currentQuality().label} + ${subsEnabled() ? subsCode() : 'без субтитров'})`, 'success');
  } else {
    queueFilm();
    toast(`«${page.title}» отправлен на сервер (${currentQuality().label})`, 'success');
  }
});

$('#season-all').addEventListener('click', () => {
  if (!state.online) {
    toast('Сервер недоступен — проверьте адрес (⚙)', 'error');
    return;
  }
  if (state.season.active) {
    toast('Уже ставлю сезон — идёт по порядку', 'info');
    return;
  }
  startSeasonQueue();
});

$('#season-stop').addEventListener('click', () => finishSeasonQueue(false));

$('#subs-toggle').addEventListener('click', () => {
  state.subIndex = (state.subIndex + 1) % SUB_TEXTS.length;
  $('#subs-toggle').textContent = SUB_TEXTS[state.subIndex];
  log(`Субтитры: ${SUB_TEXTS[state.subIndex].replace('Субтитры: ', '')}`, '');
});

$('#quality-chip').addEventListener('click', () => {
  state.qualityIndex = (state.qualityIndex + 1) % QUALITIES.length;
  $('#quality-chip').textContent = currentQuality().label;
  log(`Качество по умолчанию: ${currentQuality().label}`, '');
});

$('#voice-chip').addEventListener('click', () => {
  state.voiceIndex = (state.voiceIndex + 1) % VOICE_VALUES.length;
  renderContext();
  log(`Озвучка: ${currentVoice()}`, '');
});

$('#open-server').addEventListener('click', () => {
  toast('Открыл бы http://192.168.1.50:8080 в новой вкладке (мок)', 'info');
});

$('#autopilot-toggle').addEventListener('change', (event) => setAutopilot(event.target.checked));

$('#collapse-panel').addEventListener('click', () => {
  state.collapsed = true;
  $('#panel').classList.add('collapsed');
  $('#pill-panel').classList.remove('hidden');
});

$('#pill-panel').addEventListener('click', () => {
  state.collapsed = false;
  $('#panel').classList.remove('collapsed');
  $('#pill-panel').classList.add('hidden');
});

$('#toggle-settings').addEventListener('click', () => $('#settings').classList.toggle('hidden'));

$('#save-settings').addEventListener('click', () => {
  const quality = $('#set-quality').value;
  const index = QUALITIES.findIndex((item) => item.label === quality);
  if (index >= 0) state.qualityIndex = index;

  state.subIndex = $('#set-subs').checked ? state.subIndex % 2 : 2;
  setAutopilot($('#set-autopilot').checked);

  $('#settings-status').textContent = 'Сохранено';
  setTimeout(() => ($('#settings-status').textContent = ''), 2000);
  log('Настройки сохранены (адрес сервера, качество, автопилот)', 'ok');
  toast('Настройки сохранены', 'success');
  renderAll();
});

$('#pg-episodes').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-episode]');
  if (!button) return;
  const page = activePage();
  if (!page) return;
  page.episode = Number(button.dataset.episode);
  page.episodeTitle = page.episodes.find((episode) => episode.id === page.episode)?.title ?? '';
  log(`На странице выбрана серия ${epCodes(page.season, page.episode)}`, '');
  renderFakePage();
  renderContext();
});

$('#demo-bar').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-demo]');
  if (!button) return;

  for (const item of document.querySelectorAll('#demo-bar .seg-btn')) {
    item.classList.toggle('active', item === button);
  }

  state.page = button.dataset.demo;
  if (state.page !== 'series') finishSeasonQueue(false);

  log(
    state.page === 'none'
      ? 'Страница не распознана'
      : `Открыт ${state.page === 'film' ? 'фильм' : 'сериал'}: ${activePage().title}`,
    '',
  );
  renderAll();
});

/* ──────────────────────────── запуск ──────────────────────────── */

log('Панель подключилась к этой вкладке', 'ok');
renderAll();
setInterval(tick, 1000);