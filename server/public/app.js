const TOKEN_KEY = 'hdzg_token';
let token = localStorage.getItem(TOKEN_KEY) || '';

const speedMap = new Map(); // id → { bytes, time, speed }
let settingsLoaded = false;

const STATUS_LABELS = {
  queued: 'В очереди',
  downloading: 'Скачивается',
  paused: 'Пауза',
  done: 'Готово',
  error: 'Ошибка',
  canceled: 'Отменена',
};

const tasksEl = document.getElementById('tasks');
const infoEl = document.getElementById('server-info');

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (token) headers['X-Auth-Token'] = token;
  if (options.body) headers['Content-Type'] = 'application/json';

  const response = await fetch(path, { ...options, headers });

  if (response.status === 401) {
    const entered = prompt('Сервер требует токен доступа. Введите его:');
    if (entered) {
      token = entered.trim();
      localStorage.setItem(TOKEN_KEY, token);
      return api(path, options);
    }
    throw new Error('Нет доступа (неверный токен)');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '?';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = Number(bytes);
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(i === 0 ? 0 : value >= 100 ? 0 : 1)} ${units[i]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h} ч ${m} мин`;
  if (m > 0) return `${m} мин ${s} с`;
  return `${s} с`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function updateSpeeds(tasks) {
  const now = Date.now();
  for (const task of tasks) {
    if (task.status !== 'downloading') {
      speedMap.delete(task.id);
      continue;
    }
    const previous = speedMap.get(task.id);
    if (previous && now > previous.time) {
      const instant = ((task.receivedBytes - previous.bytes) * 1000) / (now - previous.time);
      task.speed = Math.max(0, instant * 0.4 + (previous.speed || instant) * 0.6);
    } else {
      task.speed = previous?.speed || 0;
    }
    speedMap.set(task.id, { bytes: task.receivedBytes, time: now, speed: task.speed || 0 });
  }
}

function renderServerInfo(state) {
  const { server, stats } = state;
  const estimate = estimateQueue(state.tasks, server.freeSpace ?? null);
  const summary = queueSummaryText(estimate);
  const free = server.freeSpace ? formatBytes(server.freeSpace) : '?';
  infoEl.innerHTML = [
    `<span>Скачивается: <b>${stats.downloading}</b></span>`,
    `<span>В очереди: <b>${stats.queued}</b></span>`,
    stats.paused ? `<span>На паузе: <b>${stats.paused}</b></span>` : '',
    `<span>Готово: <b>${stats.done}</b></span>`,
    stats.error ? `<span style="color:var(--err)">Ошибок: <b>${stats.error}</b></span>` : '',
    `<span>Папка: <b>${escapeHtml(server.downloadDir)}</b></span>`,
    `<span>Свободно: <b>${free}</b></span>`,
    summary
      ? `<span class="${estimate.notEnoughSpace ? 'error-text' : ''}">${summary}${
          estimate.notEnoughSpace ? ' — может не хватить места!' : ''
        }</span>`
      : '',
    `<span>ffmpeg: <b>${server.ffmpeg ? 'есть' : 'нет'}</b></span>`,
  ]
    .filter(Boolean)
    .join('');
}

const STATUS_PRIORITY = ['error', 'canceled', 'paused', 'downloading', 'queued', 'done'];
const collapsedGroups = new Set();

function tailOf(filename) {
  const parts = String(filename || '').split('/');
  return parts[parts.length - 1] || String(filename || '');
}

/**
 * Группирует задачи: фильм/сериал → серия (или фильм) → файлы (видео + субтитры).
 * Порядок групп — по первой встреченной задаче, то есть как их отдаёт сервер
 * (активные сверху).
 */
let lastSettings = {};

function categoryFolders() {
  const folders = new Set();
  for (const line of String(lastSettings.library_categories ?? '').split('\n')) {
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const name = line.slice(separator + 1).trim();
    if (name) folders.add(name);
  }
  return folders;
}

/** Название фильма — первая папка в имени файла, без папки категории. */
function movieFolderFromFilename(task, categories) {
  const parts = String(task.filename || '')
    .split('/')
    .filter(Boolean);
  if (parts.length < 2) return null;
  if (categories.has(parts[0])) parts.shift();
  return parts.length >= 2 ? parts[0] : null;
}

function groupTasks(tasks) {
  const groups = new Map();
  const categories = categoryFolders();

  for (const task of tasks) {
    const movieKey = task.movieId ? `m:${task.movieId}` : `t:${task.title || task.origTitle || task.id}`;
    const itemKey = `${movieKey}|s:${task.season ?? ''}|e:${task.episode ?? ''}`;

    if (!groups.has(movieKey)) {
      const folder = movieFolderFromFilename(task, categories);
      const title =
        folder ||
        `${task.origTitle || task.title || String(task.filename || '') || task.url}${
          task.year ? ` (${task.year})` : ''
        }`;
      groups.set(movieKey, { key: movieKey, title, items: new Map() });
    }

    const group = groups.get(movieKey);
    if (!group.items.has(itemKey)) {
      group.items.set(itemKey, {
        key: itemKey,
        season: task.season ?? null,
        episode: task.episode ?? null,
        episodeTitle: task.episodeTitle ?? null,
        files: [],
      });
    }
    group.items.get(itemKey).files.push(task);
  }

  return [...groups.values()].map((group) => ({ ...group, items: [...group.items.values()] }));
}

function itemStatus(item) {
  for (const status of STATUS_PRIORITY) {
    if (item.files.some((file) => file.status === status)) return status;
  }
  return 'done';
}

function itemTotals(item) {
  let received = 0;
  let total = 0;
  let unknown = false;
  for (const file of item.files) {
    received += file.receivedBytes || 0;
    if (file.totalBytes > 0) total += file.totalBytes;
    else if (file.status !== 'done') unknown = true;
  }
  return { received, total, unknown };
}

function renderFileRow(task) {
  const bytes =
    task.totalBytes > 0
      ? `${formatBytes(task.receivedBytes)} / ${formatBytes(task.totalBytes)}`
      : task.receivedBytes > 0
        ? formatBytes(task.receivedBytes)
        : '';
  const speed =
    task.speed > 0 && task.status === 'downloading' ? `${formatBytes(task.speed)}/с` : '';
  const label =
    task.fileType === 'subtitle'
      ? `субтитры${task.subtitleLang ? ` (${task.subtitleLang})` : ''}`
      : 'видео';

  return `
    <div class="file-row">
      <span class="file-kind ${task.fileType}">${label}</span>
      <span class="file-name" title="${escapeHtml(task.filename || task.url)}">${escapeHtml(tailOf(task.filename || task.url))}</span>
      <span class="file-info">${[STATUS_LABELS[task.status], bytes, speed].filter(Boolean).join(' · ')}</span>
    </div>
    ${task.error ? `<div class="task-error">${escapeHtml(task.error)}</div>` : ''}`;
}

function itemActions(item, status) {
  const ids = item.files.map((file) => file.id).join(',');
  const buttons = [];

  if (status === 'downloading' || status === 'queued') {
    buttons.push(['pause', 'Пауза']);
    buttons.push(['cancel', 'Отменить', 'danger']);
  }
  if (status === 'paused') {
    buttons.push(['resume', 'Продолжить']);
    buttons.push(['cancel', 'Отменить', 'danger']);
  }
  if (status === 'error' || status === 'canceled') {
    buttons.push(['retry', 'Повторить']);
  }

  const armed = isArmed(`delete-${ids}`);
  buttons.push(['delete', armed ? 'Точно удалить?' : 'Удалить', armed ? 'danger armed' : 'danger']);

  return buttons
    .map(
      ([action, label, cls]) =>
        `<button type="button" class="${cls || ''}" data-ids="${ids}" data-action="${action}">${label}</button>`,
    )
    .join('');
}

function renderItem(item) {
  const status = itemStatus(item);
  const { received, total, unknown } = itemTotals(item);
  const percent = total > 0 ? Math.min(100, (received / total) * 100) : 0;
  const indeterminate = unknown && (status === 'downloading' || status === 'queued');
  const heading =
    item.season || item.episode
      ? `S${item.season ?? '?'}E${item.episode ?? '?'}${item.episodeTitle ? ` — ${escapeHtml(item.episodeTitle)}` : ''}`
      : 'Файл';
  const bytes =
    total > 0
      ? `${formatBytes(received)} / ${formatBytes(total)}`
      : received > 0
        ? formatBytes(received)
        : '';

  return `
    <div class="item">
      <div class="item-head">
        <span class="item-title">${heading}</span>
        <span class="badge ${status}">${STATUS_LABELS[status] || status}</span>
        <span class="item-bytes">${bytes}</span>
      </div>
      <div class="progress ${indeterminate ? 'indeterminate' : ''}"><div style="width:${percent.toFixed(1)}%"></div></div>
      <div class="item-files">${item.files.map(renderFileRow).join('')}</div>
      <div class="item-actions">${itemActions(item, status)}</div>
    </div>`;
}

function renderGroup(group) {
  const statuses = group.items.map(itemStatus);
  const doneCount = statuses.filter((status) => status === 'done').length;
  const active = statuses.some((status) => ['downloading', 'queued'].includes(status));
  const collapsed = collapsedGroups.has(group.key);

  return `
    <details class="group" data-key="${escapeHtml(group.key)}" ${collapsed ? '' : 'open'}>
      <summary>
        <span class="group-title">${escapeHtml(group.title)}</span>
        <span class="group-info">${doneCount} из ${group.items.length} готово${active ? ' · качается' : ''}</span>
      </summary>
      <div class="group-items">${group.items.map(renderItem).join('')}</div>
    </details>`;
}

function renderTasks(tasks) {
  if (tasks.length === 0) {
    tasksEl.innerHTML =
      '<div class="empty">Пока пусто. Отправьте задачу из расширения или добавьте ссылку.</div>';
    return;
  }
  tasksEl.innerHTML = groupTasks(tasks).map(renderGroup).join('');
}

/**
 * Оценка размера очереди без единого дополнительного запроса:
 * берём известные размеры (уже начатые/скачанные файлы), а для остальных —
 * средний размер видео из того же фильма, иначе средний по всем скачанным.
 */
function estimateQueue(tasks, freeSpace) {
  const averages = new Map();
  let globalSum = 0;
  let globalCount = 0;

  for (const task of tasks) {
    if (task.status === 'done' && task.totalBytes > 0 && task.fileType === 'video') {
      const key = task.movieId || task.title || 'other';
      const entry = averages.get(key) ?? { sum: 0, count: 0 };
      entry.sum += task.totalBytes;
      entry.count += 1;
      averages.set(key, entry);
      globalSum += task.totalBytes;
      globalCount += 1;
    }
  }

  const globalAverage = globalCount > 0 ? globalSum / globalCount : 0;
  let remaining = 0;
  let known = 0;
  let estimated = 0;
  let estimatedCount = 0;
  let unknown = 0;

  for (const task of tasks) {
    if (!['queued', 'downloading', 'paused', 'error'].includes(task.status)) continue;

    if (task.totalBytes > 0) {
      const left = Math.max(0, task.totalBytes - (task.receivedBytes || 0));
      remaining += left;
      known += left;
      continue;
    }

    const key = task.movieId || task.title || 'other';
    const entry = averages.get(key);
    const average = entry && entry.count > 0 ? entry.sum / entry.count : globalAverage;
    if (average > 0) {
      remaining += average;
      estimated += average;
      estimatedCount += 1;
    } else {
      unknown += 1;
    }
  }

  return {
    remaining,
    known,
    estimated,
    estimatedCount,
    unknown,
    freeSpace,
    notEnoughSpace: freeSpace !== null && remaining > 0 && remaining > freeSpace,
  };
}

function queueSummaryText(estimate) {
  if (estimate.remaining <= 0 && estimate.unknown === 0) return '';

  const parts = [];
  if (estimate.known > 0) parts.push(`точно ${formatBytes(estimate.known)}`);
  if (estimate.estimated > 0) {
    parts.push(`≈ ${formatBytes(estimate.estimated)} (${estimate.estimatedCount} шт.)`);
  }
  if (estimate.unknown > 0 && parts.length === 0) parts.push(`${estimate.unknown} шт. без оценки`);

  return `Осталось: ≈ ${formatBytes(estimate.remaining)}${parts.length ? ` (${parts.join(' + ')})` : ''}`;
}

function fillSettingsForm(settings) {
  const form = document.getElementById('settings-form');
  if (settingsLoaded) return;
  for (const [key, value] of Object.entries(settings)) {
    const input = form.elements[key];
    if (!input) continue;
    if (input.type === 'checkbox') input.checked = value === '1';
    else input.value = value;
  }
  form.elements.retry_delay_s.value = Math.round(Number(settings.retry_delay_ms) / 1000);
  settingsLoaded = true;
}

let lastTasks = [];

async function refresh() {
  try {
    const state = await api('/api/state');
    lastSettings = state.settings || {};
    lastTasks = state.tasks;
    updateSpeeds(state.tasks);
    renderServerInfo(state);
    renderTasks(state.tasks);
    fillSettingsForm(state.settings);
  } catch (error) {
    infoEl.innerHTML = `<span style="color:var(--err)">Ошибка связи: ${escapeHtml(error.message)}</span>`;
  }
}

/**
 * Подтверждение «вторым кликом» — без браузерного окна confirm().
 * Первый клик «взводит» действие на 4 секунды, второй выполняет.
 */
const armedActions = new Map();
let queueStatusTimer = null;

function armOrRun(key, action) {
  if (armedActions.has(key)) {
    clearTimeout(armedActions.get(key));
    armedActions.delete(key);
    syncStaticButtons();
    return action();
  }

  armedActions.set(
    key,
    setTimeout(() => {
      armedActions.delete(key);
      syncStaticButtons();
      refresh();
    }, 4000),
  );
  syncStaticButtons();
  refresh();
  return undefined;
}

function isArmed(key) {
  return armedActions.has(key);
}

function syncStaticButtons() {
  const stopAll = document.getElementById('stop-all');
  const clearFinished = document.getElementById('clear-finished');
  stopAll.textContent = isArmed('stop-all') ? 'Точно остановить?' : 'Остановить все';
  stopAll.classList.toggle('armed', isArmed('stop-all'));
  clearFinished.textContent = isArmed('clear-finished') ? 'Точно очистить?' : 'Очистить завершённые';
  clearFinished.classList.toggle('armed', isArmed('clear-finished'));
}

function setQueueStatus(text, isError = false) {
  const el = document.getElementById('queue-status');
  el.textContent = text || '';
  el.classList.toggle('error-text', Boolean(isError));
  clearTimeout(queueStatusTimer);
  if (text) {
    queueStatusTimer = setTimeout(() => {
      el.textContent = '';
      el.classList.remove('error-text');
    }, 6000);
  }
}

async function runArmedButton(key, action) {
  const result = armOrRun(key, action);
  if (!result) return;
  try {
    await result;
  } catch (error) {
    setQueueStatus(`Не удалось: ${error.message}`, true);
  }
}

/**
 * Сворачивание групп. Управляем состоянием сами (и отменяем стандартное
 * поведение <details>): список перерисовывается раз в секунду, и если читать
 * `open` после клика, браузер сбрасывал бы состояние — группы «сами»
 * раскрывались бы обратно.
 */
tasksEl.addEventListener('click', (event) => {
  const summary = event.target.closest('summary');
  if (!summary) return;
  event.preventDefault();

  const key = summary.parentElement.dataset.key;
  if (collapsedGroups.has(key)) collapsedGroups.delete(key);
  else collapsedGroups.add(key);

  renderTasks(lastTasks);
});

tasksEl.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const ids = String(button.dataset.ids || '')
    .split(',')
    .map(Number)
    .filter(Boolean);
  if (ids.length === 0) return;
  const action = button.dataset.action;
  const key = `delete-${button.dataset.ids}`;

  if (action === 'delete') {
    const result = armOrRun(key, async () => {
      for (const id of ids) await api(`/api/tasks/${id}`, { method: 'DELETE' });
      setQueueStatus('Запись убрана из истории (файлы на диске остались)');
      await refresh();
    });
    if (!result) return;
    button.disabled = true;
    try {
      await result;
    } catch (error) {
      setQueueStatus(`Не удалось: ${error.message}`, true);
    } finally {
      button.disabled = false;
    }
    return;
  }

  button.disabled = true;
  try {
    for (const id of ids) await api(`/api/tasks/${id}/${action}`, { method: 'POST' });
    await refresh();
  } catch (error) {
    setQueueStatus(`Не удалось: ${error.message}`, true);
  } finally {
    button.disabled = false;
  }
});

document.getElementById('add-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const statusEl = document.getElementById('add-status');
  statusEl.textContent = 'Отправка…';

  try {
    const body = {
      url: form.elements.url.value.trim(),
      filename: form.elements.filename.value.trim() || undefined,
      referer: form.elements.referer.value.trim() || undefined,
    };
    const result = await api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
    statusEl.textContent = `Добавлено: ${result.created}`;
    form.reset();
    await refresh();
  } catch (error) {
    statusEl.textContent = `Ошибка: ${error.message}`;
  }
});

document.getElementById('settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const statusEl = document.getElementById('settings-status');
  statusEl.textContent = 'Сохранение…';

  try {
    const body = {
      download_dir: form.elements.download_dir.value.trim(),
      max_concurrent: Number(form.elements.max_concurrent.value),
      max_attempts: Number(form.elements.max_attempts.value),
      retry_delay_ms: Math.round(Number(form.elements.retry_delay_s.value) * 1000),
      overwrite_existing: form.elements.overwrite_existing.checked,
      library_dir: form.elements.library_dir.value.trim(),
      library_categories: form.elements.library_categories.value,
      filename_template_film: form.elements.filename_template_film.value.trim(),
      filename_template_series: form.elements.filename_template_series.value.trim(),
      filename_template_subtitle: form.elements.filename_template_subtitle.value.trim(),
    };
    await api('/api/settings', { method: 'PATCH', body: JSON.stringify(body) });
    statusEl.textContent = 'Сохранено';
    setTimeout(() => (statusEl.textContent = ''), 2500);
  } catch (error) {
    statusEl.textContent = `Ошибка: ${error.message}`;
  }
});

document.getElementById('resume-all').addEventListener('click', async () => {
  try {
    const data = await api('/api/tasks/resume-all', { method: 'POST', body: JSON.stringify({}) });
    setQueueStatus(data.resumed ? `Продолжаем задач: ${data.resumed}` : 'На паузе ничего нет');
    await refresh();
  } catch (error) {
    setQueueStatus(`Не удалось: ${error.message}`, true);
  }
});

document.getElementById('stop-all').addEventListener('click', () => {
  runArmedButton('stop-all', async () => {
    const data = await api('/api/tasks/cancel-all', { method: 'POST', body: JSON.stringify({}) });
    setQueueStatus(data.canceled ? `Отменено задач: ${data.canceled}` : 'Нечего отменять');
    await refresh();
  });
});

document.getElementById('clear-finished').addEventListener('click', () => {
  runArmedButton('clear-finished', async () => {
    const data = await api('/api/tasks/clear-finished', {
      method: 'POST',
      body: JSON.stringify({}),
    });
    setQueueStatus(`Убрано записей: ${data.deleted} (файлы на диске остались)`);
    await refresh();
  });
});

document.getElementById('retry-failed').addEventListener('click', async () => {
  try {
    const data = await api('/api/tasks/retry-failed', { method: 'POST', body: JSON.stringify({}) });
    setQueueStatus(data.retried ? `Повторяем задач: ${data.retried}` : 'Сбойных задач нет');
    await refresh();
  } catch (error) {
    setQueueStatus(`Не удалось: ${error.message}`, true);
  }
});

syncStaticButtons();
refresh();
setInterval(refresh, 1000);