/* ============================================================
   idk downloader — веб-интерфейс (дизайн «Панель»)
   Vanilla JS, обычный скрипт, без сборки.
   Данные — реальные: опрос /api/state раз в секунду.

   I18N: переводы лежат в словарях I18N.dict.<код> (веб-аналог
   gettext .po — те же пары «ключ → строка», только в JS/JSON).
   Как добавить язык:
     1. скопировать dict.en и перевести значения;
     2. добавить язык в I18N.langs (кнопка-переключатель);
     3. если в языке свои формы множественного числа — добавить
        правило в I18N.plural и массив месяцев в I18N.months.
   ============================================================ */
'use strict';

/* ---------------- i18n ---------------- */

var I18N = {
  langs: [
    { code: 'en', label: 'EN', name: 'English' },
    { code: 'ru', label: 'RU', name: 'Русский' }
  ],
  plural: {
    en: function (n) { return n === 1 ? 0 : 1; },
    ru: function (n) {
      var n10 = n % 10, n100 = n % 100;
      if (n10 === 1 && n100 !== 11) return 0;
      if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return 1;
      return 2;
    }
  },
  months: {
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  },
  dict: {
    en: {
      'app.title': 'idk downloader',
      'nav.queue': 'Queue',
      'nav.history': 'History',
      'nav.settings': 'Settings',
      'nav.aria': 'Main navigation',
      'lang.aria': 'Interface language',
      'auth.prompt': 'The server requires an access token. Enter it:',
      'auth.denied': 'Access denied (wrong token)',
      'server.title': 'Server',
      'server.free': '{v} free',
      'server.total': 'of {total} · used {used}',
      'server.meta': 'v{version} · ffmpeg: {ffmpeg}',
      'server.ffmpegYes': 'available',
      'server.ffmpegNo': 'missing',
      'sub.queue': '{n} {groups} · downloading {dl}',
      'sub.history': '{n} {records}',
      'sub.settings': 'Downloads, media library and name templates',
      'kpi.downloading': 'Downloading',
      'kpi.queued': 'Queued',
      'kpi.done': 'Done',
      'kpi.left': 'Remaining',
      'kpi.slots': 'slots used {dl} of {max}',
      'kpi.pausedPart': 'paused {p}',
      'kpi.errPart': 'errors {e}',
      'kpi.waitSlot': 'waiting for a free slot',
      'kpi.inHistory': 'in history: {n}',
      'kpi.freeOnServer': '{v} free on server',
      'kpi.spaceWarn': 'may not be enough space!',
      'status.queued': 'Queued',
      'status.downloading': 'Downloading',
      'status.paused': 'Paused',
      'status.done': 'Done',
      'status.error': 'Error',
      'status.canceled': 'Cancelled',
      'kind.movie': 'movie',
      'kind.series': 'series',
      'pl.groups': ['group', 'groups'],
      'pl.files': ['file', 'files'],
      'pl.records': ['record', 'records'],
      'pl.tasks': ['task', 'tasks'],
      'group.files': 'Files · {n}',
      'file.video': 'video',
      'file.subs': 'subtitles',
      'act.pause': 'Pause',
      'act.resume': 'Resume',
      'act.cancel': 'Cancel',
      'act.retry': 'Retry',
      'act.delete': 'Delete',
      'act.sureCancel': 'Really cancel?',
      'act.sureDelete': 'Really delete?',
      'top.pauseAll': 'Pause all',
      'top.resumeAll': 'Resume all',
      'top.retryFailed': 'Retry failed',
      'top.cancelAll': 'Cancel all',
      'top.clearDone': 'Clear completed',
      'act.sureClear': 'Really clear?',
      'top.add': 'Add by link',
      'queue.emptyTitle': 'The queue is empty',
      'queue.emptyText': 'Send a task from the browser extension or add a direct link.',
      'history.searchPh': 'Search by file name…',
      'history.filterAria': 'Filter by status',
      'history.fAll': 'All',
      'history.fDone': 'Done',
      'history.fCanceled': 'Cancelled',
      'history.colFile': 'File',
      'history.colStatus': 'Status',
      'history.colSize': 'Size',
      'history.colDate': 'Completed',
      'history.colAct': 'Actions',
      'history.count': '{shown} of {total}',
      'history.notFound': 'Nothing found for “{q}”',
      'history.empty': 'No records',
      'history.deleteRec': 'Delete record',
      'history.shownFirst': 'Showing first {n} records — refine the search',
      'modal.title': 'Add by link',
      'modal.close': 'Close',
      'modal.url': 'Direct link (mp4 / m3u8 / vtt)',
      'modal.urlErr': 'Enter a direct link to a file.',
      'modal.urlHint': 'Normally the browser extension sends tasks here by itself — use this form only when you already have a direct file link.',
      'modal.name': 'File name',
      'modal.namePh': 'movie (2024).mp4',
      'modal.nameHint': 'Optional. Empty — taken from the link.',
      'modal.referer': 'Referer',
      'modal.refererHint': 'Optional. Sent with requests to the CDN.',
      'modal.cancel': 'Cancel',
      'modal.add': 'Add to queue',
      'toast.addedN': 'Added to the queue: {n}',
      'toast.pausedAll': 'Paused: {n} {tasks}',
      'toast.noActive': 'No active downloads',
      'toast.resumedAll': 'Resumed: {n} {tasks}',
      'toast.noPaused': 'Nothing is paused',
      'toast.retriedFailed': 'Failed tasks requeued: {n}',
      'toast.noFailed': 'No failed tasks',
      'toast.canceledAll': 'Cancelled: {n} {tasks}',
      'toast.clearedQueue': 'Removed from the queue: {n} {tasks} (records kept in history)',
      'toast.noDoneGroups': 'No completed tasks in the queue',
      'toast.groupPaused': '“{title}” — paused',
      'toast.groupResumed': '“{title}” — resumed',
      'toast.groupCanceled': '“{title}” — cancelled: {n} {files}',
      'toast.groupRetried': '“{title}” — back in the queue',
      'toast.groupDeleted': '“{title}” — removed from the list (files on disk remain)',
      'toast.noMatching': 'No matching tasks in the group',
      'toast.recDeleted': 'Record deleted (files on disk remain)',
      'toast.recRetried': 'Back in the queue',
      'toast.saved': 'Saved',
      'toast.reverted': 'Reverted to saved values',
      'toast.netErr': 'Connection error: {msg}',
      'toast.netOk': 'Connection restored',
      'toast.actionErr': 'Failed: {msg}',
      'settings.title': 'Settings',
      'set.interface': 'Interface',
      'set.lang': 'Interface language',
      'set.langHint': 'Applies immediately, the choice is remembered.',
      'set.downloads': 'Downloads',
      'set.dir': 'Download folder on the server',
      'set.dirHint': 'Absolute path where files land before being sorted into the library.',
      'set.simul': 'Simultaneous downloads',
      'set.range116': 'From 1 to 16',
      'set.retries': 'Attempts per task',
      'set.range150': 'From 1 to 50',
      'set.delay': 'Delay between attempts, sec',
      'set.overwrite': 'Overwrite finished files on re-download (no “ (1)” suffix)',
      'set.library': 'Media library',
      'set.libDir': 'Library folder',
      'set.libHint': 'Empty — download into the downloads folder; otherwise files are sorted into the library by categories.',
      'set.cats': 'Categories → library folders',
      'set.catsHint': 'One line per category: <code>section = folder</code>, e.g. <code>films = Movies</code>. The key <code>default</code> catches everything not listed.',
      'set.tpl': 'Name templates',
      'set.tplFilm': 'Name template: movies',
      'set.tplSeries': 'Name template: series',
      'set.tplSubs': 'Name template: subtitles',
      'set.tplExamples': 'Preview examples: movie — “Minions” (2015); series — “The Shining” (1997), 3 episodes.',
      'set.phTitle': 'Template placeholders',
      'set.phHint': 'Click a placeholder to insert it into the last edited template.',
      'set.slashHint': '“/” in a template creates a subfolder. The extension (.mp4 / .vtt) is appended automatically.',
      'ph.title': 'Title on the site (localized)',
      'ph.orig_title': 'Original title (best variant)',
      'ph.quality': 'Quality, e.g. 1080p',
      'ph.voiceover': 'Voiceover / dubbing',
      'ph.year': 'Year',
      'ph.year_part': '“ (2015)” or empty',
      'ph.season': 'Season title (as on the site)',
      'ph.season_id': 'Season number, no padding (1, 2, …)',
      'ph.episode': 'Episode title (as on the site)',
      'ph.episode_id': 'Episode number, no padding',
      'ph.sxxexx': '“ S1E2” or empty',
      'ph.season_folder': '“Season 1” or empty',
      'ph.movie_id': 'Movie ID on the site',
      'ph.subtitle_lang': 'Subtitle language code (rus, en)',
      'set.footNote': 'Settings are stored on the server; “Simultaneous downloads” applies immediately.',
      'set.revert': 'Revert',
      'set.save': 'Save',
      'units.speed': '{v}/s',
      'untitled': 'Untitled'
    },
    ru: {
      'app.title': 'idk downloader',
      'nav.queue': 'Очередь',
      'nav.history': 'История',
      'nav.settings': 'Настройки',
      'nav.aria': 'Основная навигация',
      'lang.aria': 'Язык интерфейса',
      'auth.prompt': 'Сервер требует токен доступа. Введите его:',
      'auth.denied': 'Нет доступа (неверный токен)',
      'server.title': 'Сервер',
      'server.free': 'свободно {v}',
      'server.total': 'из {total} · занято {used}',
      'server.meta': 'v{version} · ffmpeg: {ffmpeg}',
      'server.ffmpegYes': 'есть',
      'server.ffmpegNo': 'нет',
      'sub.queue': '{n} {groups} · скачивается {dl}',
      'sub.history': '{n} {records}',
      'sub.settings': 'Загрузки, медиатека и шаблоны имён',
      'kpi.downloading': 'Скачивается',
      'kpi.queued': 'В очереди',
      'kpi.done': 'Готово',
      'kpi.left': 'Осталось',
      'kpi.slots': 'слотов занято {dl} из {max}',
      'kpi.pausedPart': 'пауза {p}',
      'kpi.errPart': 'ошибок {e}',
      'kpi.waitSlot': 'ожидают свободного слота',
      'kpi.inHistory': 'в истории: {n}',
      'kpi.freeOnServer': 'свободно {v} на сервере',
      'kpi.spaceWarn': 'может не хватить места!',
      'status.queued': 'В очереди',
      'status.downloading': 'Скачивается',
      'status.paused': 'Пауза',
      'status.done': 'Готово',
      'status.error': 'Ошибка',
      'status.canceled': 'Отменена',
      'kind.movie': 'фильм',
      'kind.series': 'сериал',
      'pl.groups': ['группа', 'группы', 'групп'],
      'pl.files': ['файл', 'файла', 'файлов'],
      'pl.records': ['запись', 'записи', 'записей'],
      'pl.tasks': ['задача', 'задачи', 'задач'],
      'group.files': 'Файлы · {n}',
      'file.video': 'видео',
      'file.subs': 'субтитры',
      'act.pause': 'Пауза',
      'act.resume': 'Продолжить',
      'act.cancel': 'Отменить',
      'act.retry': 'Повторить',
      'act.delete': 'Удалить',
      'act.sureCancel': 'Точно отменить?',
      'act.sureDelete': 'Точно удалить?',
      'top.pauseAll': 'Остановить все',
      'top.resumeAll': 'Возобновить все',
      'top.retryFailed': 'Повторить сбойные',
      'top.cancelAll': 'Отменить все',
      'top.clearDone': 'Очистить завершённые',
      'act.sureClear': 'Точно очистить?',
      'top.add': 'Добавить по ссылке',
      'queue.emptyTitle': 'Очередь пуста',
      'queue.emptyText': 'Отправьте задачу из расширения браузера или добавьте прямую ссылку.',
      'history.searchPh': 'Поиск по имени файла…',
      'history.filterAria': 'Фильтр по статусу',
      'history.fAll': 'Все',
      'history.fDone': 'Готово',
      'history.fCanceled': 'Отменена',
      'history.colFile': 'Файл',
      'history.colStatus': 'Статус',
      'history.colSize': 'Размер',
      'history.colDate': 'Завершено',
      'history.colAct': 'Действия',
      'history.count': '{shown} из {total}',
      'history.notFound': 'Ничего не найдено по запросу «{q}»',
      'history.empty': 'Записей нет',
      'history.deleteRec': 'Удалить запись',
      'history.shownFirst': 'Показаны первые {n} записей — уточните поиск',
      'modal.title': 'Добавить по ссылке',
      'modal.close': 'Закрыть',
      'modal.url': 'Прямая ссылка (mp4 / m3u8 / vtt)',
      'modal.urlErr': 'Укажите прямую ссылку на файл.',
      'modal.urlHint': 'Обычно расширение браузера отправляет задачи само — эта форма нужна, только если у вас уже есть прямая ссылка на файл.',
      'modal.name': 'Имя файла',
      'modal.namePh': 'фильм (2024).mp4',
      'modal.nameHint': 'Необязательно. Пусто — имя из ссылки.',
      'modal.referer': 'Referer',
      'modal.refererHint': 'Необязательно. Подставляется в запросы к CDN.',
      'modal.cancel': 'Отмена',
      'modal.add': 'Добавить в очередь',
      'toast.addedN': 'Добавлено в очередь: {n}',
      'toast.pausedAll': 'Остановлено: {n} {tasks}',
      'toast.noActive': 'Активных загрузок нет',
      'toast.resumedAll': 'Возобновлено: {n} {tasks}',
      'toast.noPaused': 'На паузе ничего нет',
      'toast.retriedFailed': 'Сбойные задачи возвращены в очередь: {n}',
      'toast.noFailed': 'Сбойных задач нет',
      'toast.canceledAll': 'Отменено: {n} {tasks}',
      'toast.clearedQueue': 'Убрано из очереди: {n} {tasks} (записи в истории остались)',
      'toast.noDoneGroups': 'Завершённых задач в очереди нет',
      'toast.groupPaused': '«{title}» — остановлено',
      'toast.groupResumed': '«{title}» — возобновлено',
      'toast.groupCanceled': '«{title}» — отменено: {n} {files}',
      'toast.groupRetried': '«{title}» — возвращено в очередь',
      'toast.groupDeleted': '«{title}» — убрано из списка (файлы на диске остались)',
      'toast.noMatching': 'В группе нет подходящих задач',
      'toast.recDeleted': 'Запись удалена (файлы на диске остались)',
      'toast.recRetried': 'Возвращено в очередь',
      'toast.saved': 'Сохранено',
      'toast.reverted': 'Возвращены сохранённые значения',
      'toast.netErr': 'Ошибка связи: {msg}',
      'toast.netOk': 'Связь восстановлена',
      'toast.actionErr': 'Не удалось: {msg}',
      'settings.title': 'Настройки',
      'set.interface': 'Интерфейс',
      'set.lang': 'Язык интерфейса',
      'set.langHint': 'Применяется сразу, выбор запоминается.',
      'set.downloads': 'Загрузки',
      'set.dir': 'Папка загрузок на сервере',
      'set.dirHint': 'Абсолютный путь, куда сохраняются файлы до разборки в медиатеку.',
      'set.simul': 'Одновременных загрузок',
      'set.range116': 'От 1 до 16',
      'set.retries': 'Попыток на задачу',
      'set.range150': 'От 1 до 50',
      'set.delay': 'Пауза между попытками, сек',
      'set.overwrite': 'Перезаписывать готовые файлы при повторной загрузке (без « (1)»)',
      'set.library': 'Медиатека',
      'set.libDir': 'Папка медиатеки',
      'set.libHint': 'Пусто — качать в папку загрузок; иначе файлы раскладываются в медиатеку по категориям.',
      'set.cats': 'Категории → папки медиатеки',
      'set.catsHint': 'Одна строка на категорию: <code>раздел = папка</code>, например <code>films = Фильмы</code>. Ключ <code>default</code> — папка для всего неперечисленного.',
      'set.tpl': 'Шаблоны имён',
      'set.tplFilm': 'Шаблон имени: фильмы',
      'set.tplSeries': 'Шаблон имени: сериалы',
      'set.tplSubs': 'Шаблон имени: субтитры',
      'set.tplExamples': 'Примеры для предпросмотра: фильм — «Minions» (2015); сериал — «The Shining» (1997), 3 серии.',
      'set.phTitle': 'Плейсхолдеры шаблонов',
      'set.phHint': 'Нажмите на плейсхолдер, чтобы вставить его в последний редактируемый шаблон.',
      'set.slashHint': '«/» в шаблоне создаёт подпапку. Расширение (.mp4 / .vtt) добавляется автоматически.',
      'ph.title': 'Название на сайте (локализованное)',
      'ph.orig_title': 'Оригинальное название (лучший вариант)',
      'ph.quality': 'Качество, напр. 1080p',
      'ph.voiceover': 'Озвучка / дубляж',
      'ph.year': 'Год',
      'ph.year_part': '« (2015)» или пусто',
      'ph.season': 'Название сезона (как на сайте)',
      'ph.season_id': 'Номер сезона без нуля (1, 2, …)',
      'ph.episode': 'Название серии (как на сайте)',
      'ph.episode_id': 'Номер серии без нуля',
      'ph.sxxexx': '« S1E2» или пусто',
      'ph.season_folder': '«Season 1» или пусто',
      'ph.movie_id': 'ID фильма на сайте',
      'ph.subtitle_lang': 'Код языка субтитров (rus, en)',
      'set.footNote': 'Настройки хранятся на сервере; «Одновременных загрузок» применяется сразу.',
      'set.revert': 'Вернуть сохранённые',
      'set.save': 'Сохранить',
      'units.speed': '{v}/с',
      'untitled': 'Без названия'
    }
  }
};

var PLACEHOLDERS = [
  '%title%', '%orig_title%', '%quality%', '%voiceover%', '%year%', '%year_part%',
  '%season%', '%season_id%', '%episode%', '%episode_id%', '%sxxexx%',
  '%season_folder%', '%movie_id%', '%subtitle_lang%'
];

/* ---------------- helpers ---------------- */

function $(id) { return document.getElementById(id); }

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function t(key, params) {
  var d = I18N.dict[state.lang] || I18N.dict.en;
  var v = d[key];
  if (v == null) v = I18N.dict.en[key];
  if (v == null) return key;
  if (typeof v === 'string' && params) {
    v = v.replace(/\{(\w+)\}/g, function (m, k) {
      return params[k] != null ? String(params[k]) : m;
    });
  }
  return v;
}

function tp(key, n) {
  var forms = t(key);
  if (!forms || !forms.length) return '';
  var rule = I18N.plural[state.lang] || I18N.plural.en;
  var idx = rule(n);
  if (idx > forms.length - 1) idx = forms.length - 1;
  return forms[idx];
}

/* двуязычные значения вида { ru: '…', en: '…' } */
function L(x) {
  if (x == null) return '';
  if (typeof x === 'string') return x;
  return x[state.lang] || x.en || '';
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '?';
  var units = ['B', 'KB', 'MB', 'GB', 'TB'];
  var value = Number(bytes);
  var i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return value.toFixed(i === 0 ? 0 : value >= 100 ? 0 : 1) + ' ' + units[i];
}

function formatSpeed(bps) {
  if (!bps || bps <= 0) return '—';
  return t('units.speed', { v: formatBytes(bps) });
}

function formatDate(ts) {
  if (!ts) return '—';
  var d = new Date(ts);
  function p(n) { return String(n).padStart(2, '0'); }
  var hm = p(d.getHours()) + ':' + p(d.getMinutes());
  if (state.lang === 'ru') {
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear() + ', ' + hm;
  }
  var months = I18N.months[state.lang] || I18N.months.en;
  return months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ', ' + hm;
}

function clampInt(v, min, max, def) {
  var n = parseInt(v, 10);
  if (!isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function tailOf(filename) {
  var parts = String(filename || '').split('/');
  return parts[parts.length - 1] || String(filename || '');
}

/* ---------------- api ---------------- */

var TOKEN_KEY = 'hdzg_token';
var token = '';
try { token = localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { /* приватный режим */ }

async function api(path, options) {
  var opts = options || {};
  var headers = Object.assign({}, opts.headers || {});
  if (token) headers['X-Auth-Token'] = token;
  if (opts.body) headers['Content-Type'] = 'application/json';

  var response = await fetch(path, Object.assign({}, opts, { headers: headers }));

  if (response.status === 401) {
    var entered = prompt(t('auth.prompt'));
    if (entered) {
      token = entered.trim();
      try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* не критично */ }
      return api(path, options);
    }
    throw new Error(t('auth.denied'));
  }

  var data = await response.json().catch(function () { return {}; });
  if (!response.ok) throw new Error(data.error || 'HTTP ' + response.status);
  return data;
}

/* ---------------- icons ---------------- */

var ICONS = {
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  pause: '<line x1="9" y1="5" x2="9" y2="19"/><line x1="15" y1="5" x2="15" y2="19"/>',
  play: '<polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none"/>',
  cancel: '<circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>',
  retry: '<polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/>',
  chevron: '<polyline points="6 9 12 15 18 9"/>',
  film: '<rect x="3" y="4" width="18" height="16"/><line x1="7" y1="4" x2="7" y2="20"/><line x1="17" y1="4" x2="17" y2="20"/><line x1="3" y1="12" x2="21" y2="12"/>',
  captions: '<rect x="3" y="5" width="18" height="14"/><line x1="7" y1="15" x2="11" y2="15"/><line x1="14" y1="15" x2="17" y2="15"/><line x1="7" y1="10" x2="9" y2="10"/>',
  alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
};

function icon(name) {
  return '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">' +
    (ICONS[name] || '') + '</svg>';
}

/* ---------------- state ---------------- */

var ACTIVE_STATUSES = ['queued', 'downloading', 'paused', 'error'];
var FINISHED_STATUSES = ['done', 'canceled'];
/* приоритет статуса группы: живой процесс важнее, ошибка — сразу за ним */
var GROUP_STATUS_PRIORITY = ['downloading', 'error', 'paused', 'queued', 'canceled', 'done'];

var state = {
  lang: 'en',
  tasks: [],
  groups: [],
  stats: { queued: 0, downloading: 0, paused: 0, done: 0, error: 0, canceled: 0 },
  server: null,
  settings: null,
  collapsed: {},
  armed: {},
  historyFilter: 'all',
  historySearch: '',
  settingsDirty: false,
  netError: '',
  adding: false
};

var speedCache = new Map();

/* мгновенная скорость — сервер её не отдаёт, считаем по дельте receivedBytes */
function updateSpeeds(tasks) {
  var now = Date.now();
  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    if (task.status !== 'downloading') {
      speedCache.delete(task.id);
      continue;
    }
    var previous = speedCache.get(task.id);
    if (previous && now > previous.time) {
      var instant = ((task.receivedBytes - previous.bytes) * 1000) / (now - previous.time);
      task.speed = Math.max(0, instant * 0.4 + (previous.speed || instant) * 0.6);
    } else {
      task.speed = previous ? previous.speed || 0 : 0;
    }
    speedCache.set(task.id, { bytes: task.receivedBytes, time: now, speed: task.speed || 0 });
  }
}

function loadLang() {
  state.lang = 'en';
  try {
    var v = localStorage.getItem('idk-lang');
    if (v && I18N.dict[v]) state.lang = v;
  } catch (e) { /* file:// / приватный режим — остаёмся на английском */ }
}

function setLang(code) {
  if (!I18N.dict[code]) return;
  state.lang = code;
  try { localStorage.setItem('idk-lang', code); } catch (e) { /* не критично */ }
  applyI18n();
  renderAll();
}

/* ---------------- i18n: применение к DOM ---------------- */

function renderLangSwitch() {
  var box = $('lang-switch');
  if (!box) return;
  box.innerHTML = I18N.langs.map(function (l) {
    return '<button type="button" class="lang-btn' + (l.code === state.lang ? ' active' : '') +
      '" data-lang="' + l.code + '" title="' + escapeHtml(l.name) + '">' + escapeHtml(l.label) + '</button>';
  }).join('');
}

function renderChips() {
  var box = $('ph-list');
  if (!box) return;
  box.innerHTML = PLACEHOLDERS.map(function (ph) {
    return '<button type="button" class="ph-chip" data-ph="' + escapeHtml(ph) +
      '" title="' + escapeHtml(t('ph.' + ph.replace(/%/g, ''))) + '">' + escapeHtml(ph) + '</button>';
  }).join('');
}

function applyI18n() {
  document.documentElement.lang = state.lang;
  document.title = t('app.title');
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
  });
  document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
    el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
  });
  renderLangSwitch();
  renderChips();
  var sel = $('set-lang');
  if (sel) sel.value = state.lang;
  updateTplPreviews();
}

/* ---------------- name templates: preview ---------------- */

var TPL_FIELDS = [
  { input: 'set-tpl-film', out: 'prev-film', kind: 'movie', fileType: 'video', def: 'filename_template_film', ext: '.mp4' },
  { input: 'set-tpl-series', out: 'prev-series', kind: 'series', fileType: 'video', def: 'filename_template_series', ext: '.mp4' },
  { input: 'set-tpl-subs', out: 'prev-subs', kind: 'subs', fileType: 'subtitle', def: 'filename_template_subtitle', ext: '.vtt' }
];

var MEDIA_EXT = ['.mp4', '.mkv', '.m3u8', '.avi', '.mov', '.webm', '.flv', '.ts', '.m4v', '.mpg', '.mpeg'];

/* повторяет ensureExtension() сервера, чтобы предпросмотр не врал */
function ensureExtPreview(rel, fileType) {
  var wanted = fileType === 'subtitle' ? '.vtt' : '.mp4';
  var dot = rel.lastIndexOf('.');
  var slash = rel.lastIndexOf('/');
  var ext = dot > slash ? rel.slice(dot).toLowerCase() : '';
  if (ext === wanted) return rel;
  if (fileType === 'subtitle') {
    if (ext === '.srt') return rel;
    /* хвост «.rus» — код языка, а не расширение: просто дописываем .vtt */
    if (ext && MEDIA_EXT.indexOf(ext) === -1) return rel + wanted;
    return (ext ? rel.slice(0, -ext.length) : rel) + wanted;
  }
  if (ext) return rel.slice(0, -ext.length) + wanted;
  return rel + wanted;
}

/* примеры: фильм — Minions (2015), сериал — The Shining (1997), 3 серии.
   Значения токенов — как в tokenValues() сервера (util.js). */
function previewTokens(kind, ep) {
  var series = kind === 'series';
  var seasonId = series ? '1' : '';
  var episodeId = series ? String(ep || 1) : '';
  var year = series ? '1997' : '2015';
  var tokens = {};
  tokens['%title%'] = series ? L({ ru: 'Сияние', en: 'The Shining' }) : L({ ru: 'Миньоны', en: 'Minions' });
  tokens['%orig_title%'] = series ? 'The Shining' : 'Minions';
  tokens['%quality%'] = '1080p';
  tokens['%voiceover%'] = L({ ru: 'Дубляж', en: 'Dub' });
  tokens['%year%'] = year;
  tokens['%year_part%'] = ' (' + year + ')';
  tokens['%season%'] = series ? L({ ru: '1 сезон', en: 'Season 1' }) : '';
  tokens['%season_id%'] = seasonId;
  tokens['%episode%'] = series ? L({ ru: (ep || 1) + ' серия', en: 'Episode ' + (ep || 1) }) : '';
  tokens['%episode_id%'] = episodeId;
  tokens['%sxxexx%'] = seasonId && episodeId ? ' S' + seasonId + 'E' + episodeId : '';
  tokens['%season_folder%'] = seasonId ? 'Season ' + seasonId : '';
  tokens['%movie_id%'] = series ? '171717' : '28165';
  tokens['%subtitle_lang%'] = 'rus';
  tokens['%subtitle_lang_raw%'] = L({ ru: 'Русский', en: 'Russian' });
  return tokens;
}

function applyTplPreview(tpl, tokens, fileType) {
  var result = String(tpl || '');
  Object.keys(tokens).forEach(function (k) { result = result.split(k).join(tokens[k]); });
  result = result.replace(/%[a-zA-Z_]+%/g, '');
  var segments = result
    .split(/[\\/]+/)
    .map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
    .filter(Boolean);
  if (!segments.length) segments.push('file');
  return ensureExtPreview(segments.join('/'), fileType);
}

function updateTplPreviews() {
  TPL_FIELDS.forEach(function (fd) {
    var inp = $(fd.input), out = $(fd.out);
    if (!inp || !out) return;
    var tpl = inp.value.trim() || (state.settings ? state.settings[fd.def] : '') || '';
    var rows = [];
    if (fd.kind === 'series') {
      [1, 2, 3].forEach(function (ep) {
        rows.push({ tag: 'series', path: applyTplPreview(tpl, previewTokens('series', ep), fd.fileType) });
      });
    } else if (fd.kind === 'subs') {
      rows.push({ tag: 'movie', path: applyTplPreview(tpl, previewTokens('movie'), fd.fileType) });
      rows.push({ tag: 'series', path: applyTplPreview(tpl, previewTokens('series', 1), fd.fileType) });
    } else {
      rows.push({ tag: 'movie', path: applyTplPreview(tpl, previewTokens('movie'), fd.fileType) });
    }
    out.innerHTML = rows.map(function (r) {
      return '<div class="tp-row"><span class="tp-tag">' + escapeHtml(t('kind.' + r.tag)) + '</span>' +
        '<code class="tp-path" title="' + escapeHtml(r.path) + '">' + escapeHtml(r.path) + '</code></div>';
    }).join('');
  });
}

var lastTplId = null;

function insertPlaceholder(tok) {
  var el = $(lastTplId) || $('set-tpl-film');
  if (!el) return;
  var start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
  var end = typeof el.selectionEnd === 'number' ? el.selectionEnd : start;
  el.value = el.value.slice(0, start) + tok + el.value.slice(end);
  var pos = start + tok.length;
  el.focus();
  try { el.setSelectionRange(pos, pos); } catch (e) { /* не критично */ }
  updateTplPreviews();
}

/* ---------------- settings form ---------------- */

function fillSettingsForm() {
  var s = state.settings;
  if (!s) return;
  $('set-dir').value = s.download_dir || '';
  $('set-max-concurrent').value = s.max_concurrent;
  $('set-max-attempts').value = s.max_attempts;
  $('set-delay-s').value = Math.max(1, Math.round(Number(s.retry_delay_ms) / 1000));
  $('set-overwrite').checked = s.overwrite_existing === '1';
  $('set-library').value = s.library_dir || '';
  $('set-categories').value = s.library_categories || '';
  $('set-tpl-film').value = s.filename_template_film || '';
  $('set-tpl-series').value = s.filename_template_series || '';
  $('set-tpl-subs').value = s.filename_template_subtitle || '';
  $('set-lang').value = state.lang;
  updateTplPreviews();
}

async function saveSettings() {
  var body = {
    download_dir: $('set-dir').value.trim(),
    max_concurrent: Number($('set-max-concurrent').value),
    max_attempts: Number($('set-max-attempts').value),
    retry_delay_ms: Math.round(clampInt($('set-delay-s').value, 1, 3600, 15) * 1000),
    overwrite_existing: $('set-overwrite').checked,
    library_dir: $('set-library').value.trim(),
    library_categories: $('set-categories').value,
    filename_template_film: $('set-tpl-film').value.trim(),
    filename_template_series: $('set-tpl-series').value.trim(),
    filename_template_subtitle: $('set-tpl-subs').value.trim()
  };
  try {
    await api('/api/settings', { method: 'PATCH', body: JSON.stringify(body) });
    state.settingsDirty = false;
    toast(t('toast.saved'), 'success');
    await refresh();
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
}

/* ---------------- grouping (как в прежней морде) ---------------- */

function categoryFolders() {
  var folders = new Set();
  var raw = state.settings ? state.settings.library_categories : '';
  String(raw || '').split('\n').forEach(function (line) {
    var separator = line.indexOf('=');
    if (separator === -1) return;
    var name = line.slice(separator + 1).trim();
    if (name) folders.add(name);
  });
  return folders;
}

/** Название фильма — первая папка в имени файла, без папки категории. */
function movieFolderFromFilename(task, categories) {
  var parts = String(task.filename || '').split('/').filter(Boolean);
  if (parts.length < 2) return null;
  if (categories.has(parts[0])) parts.shift();
  return parts.length >= 2 ? parts[0] : null;
}

/**
 * Группирует задачи: фильм/сериал → серия (или фильм) → файлы (видео + субтитры).
 * Порядок групп — как их отдаёт сервер (активные сверху).
 */
function groupTasks(tasks) {
  var groups = new Map();
  var categories = categoryFolders();

  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    var movieKey = task.movieId ? 'm:' + task.movieId : 't:' + (task.title || task.origTitle || task.id);
    var itemKey = movieKey + '|s:' + (task.season == null ? '' : task.season) + '|e:' + (task.episode == null ? '' : task.episode);

    if (!groups.has(movieKey)) {
      var folder = movieFolderFromFilename(task, categories);
      var title = folder ||
        (task.origTitle || task.title || String(task.filename || '') || task.url) +
        (task.year ? ' (' + task.year + ')' : '');
      groups.set(movieKey, { key: movieKey, title: title, items: new Map() });
    }

    var group = groups.get(movieKey);
    if (!group.items.has(itemKey)) {
      group.items.set(itemKey, {
        key: itemKey,
        season: task.season == null ? null : task.season,
        episode: task.episode == null ? null : task.episode,
        episodeTitle: task.episodeTitle == null ? null : task.episodeTitle,
        files: []
      });
    }
    group.items.get(itemKey).files.push(task);
  }

  return Array.from(groups.values()).map(function (group) {
    return { key: group.key, title: group.title, items: Array.from(group.items.values()) };
  });
}

function groupFiles(g) {
  var out = [];
  g.items.forEach(function (it) { it.files.forEach(function (f) { out.push(f); }); });
  return out;
}

/* в списке очереди показываем всё, кроме убранных кнопкой «Очистить завершённые»
   (queueHidden): завершённые остаются видимыми, пока их не уберут вручную */
function visibleFiles(g) {
  return groupFiles(g).filter(function (f) { return !f.queueHidden; });
}

function visibleGroups() {
  return state.groups.filter(function (g) { return visibleFiles(g).length > 0; });
}

function groupStatusOf(files) {
  for (var i = 0; i < GROUP_STATUS_PRIORITY.length; i++) {
    var s = GROUP_STATUS_PRIORITY[i];
    if (files.some(function (f) { return f.status === s; })) return s;
  }
  return 'done';
}

function groupTotals(files) {
  var size = 0, received = 0, speed = 0;
  files.forEach(function (f) {
    received += f.receivedBytes || 0;
    if (f.totalBytes > 0) size += f.totalBytes;
    if (f.status === 'downloading') speed += f.speed || 0;
  });
  var pct = size > 0 ? Math.min(100, Math.round(received / size * 100)) : 0;
  return { size: size, received: received, speed: speed, pct: pct };
}

function taskDisplayName(task) {
  var parts = [];
  if (task.season || task.episode) {
    parts.push('S' + (task.season || '?') + 'E' + (task.episode || '?'));
  }
  if (task.fileType === 'subtitle') {
    var lang = task.subtitleLangCode || task.subtitleLang;
    parts.push(t('file.subs') + (lang ? ' (' + lang + ')' : ''));
  } else {
    parts.push(t('file.video') + (task.quality ? ' · ' + task.quality : ''));
  }
  if (task.episodeTitle) parts.push(task.episodeTitle);
  return parts.join(' · ');
}

/**
 * Оценка оставшегося объёма очереди без дополнительных запросов:
 * известные размеры + среднее по уже скачанным файлам того же фильма.
 */
function estimateQueue(tasks, freeSpace) {
  var averages = new Map();
  var globalSum = 0, globalCount = 0;

  for (var i = 0; i < tasks.length; i++) {
    var task = tasks[i];
    if (task.status === 'done' && task.totalBytes > 0 && task.fileType === 'video') {
      var key = task.movieId || task.title || 'other';
      var entry = averages.get(key) || { sum: 0, count: 0 };
      entry.sum += task.totalBytes;
      entry.count += 1;
      averages.set(key, entry);
      globalSum += task.totalBytes;
      globalCount += 1;
    }
  }

  var globalAverage = globalCount > 0 ? globalSum / globalCount : 0;
  var remaining = 0, unknown = 0;

  for (var j = 0; j < tasks.length; j++) {
    var t2 = tasks[j];
    if (ACTIVE_STATUSES.indexOf(t2.status) === -1) continue;
    if (t2.totalBytes > 0) {
      remaining += Math.max(0, t2.totalBytes - (t2.receivedBytes || 0));
      continue;
    }
    var k = t2.movieId || t2.title || 'other';
    var e = averages.get(k);
    var average = e && e.count > 0 ? e.sum / e.count : globalAverage;
    if (average > 0) remaining += average;
    else unknown += 1;
  }

  return {
    remaining: remaining,
    unknown: unknown,
    notEnoughSpace: freeSpace != null && remaining > 0 && remaining > freeSpace
  };
}

/* ---------------- two-click arming ---------------- */

function arm(key) {
  disarm(key);
  state.armed[key] = window.setTimeout(function () {
    delete state.armed[key];
    renderAll();
  }, 4000);
}

function disarm(key) {
  if (state.armed[key]) {
    clearTimeout(state.armed[key]);
    delete state.armed[key];
  }
}

function isArmed(key) {
  return !!state.armed[key];
}

/* ---------------- toast ---------------- */

function toast(msg, type) {
  var ty = type || 'info';
  var ic = ty === 'success' ? 'check' : (ty === 'error' ? 'alert' : 'info');
  var el = document.createElement('div');
  el.className = 'toast toast-' + ty;
  el.innerHTML = icon(ic) + '<span>' + escapeHtml(msg) + '</span>';
  var box = $('toasts');
  box.appendChild(el);
  while (box.children.length > 4) box.removeChild(box.firstChild);
  requestAnimationFrame(function () {
    requestAnimationFrame(function () { el.classList.add('show'); });
  });
  window.setTimeout(function () {
    el.classList.remove('show');
    window.setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 220);
  }, 3200);
}

/* ---------------- render: routing shell ---------------- */

function currentRoute() {
  var h = (window.location.hash || '').replace(/^#\/?/, '');
  if (h.indexOf('history') === 0) return 'history';
  if (h.indexOf('settings') === 0) return 'settings';
  return 'queue';
}

function applyRoute() {
  var r = currentRoute();
  ['queue', 'history', 'settings'].forEach(function (v) {
    $('view-' + v).classList.toggle('active', v === r);
  });
  document.querySelectorAll('.nav-item').forEach(function (a) {
    a.classList.toggle('active', a.dataset.nav === r);
  });
  window.scrollTo(0, 0);
  renderAll();
}

function renderAll() {
  renderTopbar();
  renderQueue();
  renderHistory();
  renderKpi();
  renderSidebar();
}

/* ---------------- render: topbar ---------------- */

function tbBtn(global, icoName, label, cls) {
  return '<button class="btn ' + (cls || '') + '" type="button" data-global="' + global + '">' +
    icon(icoName) + '<span>' + escapeHtml(label) + '</span></button>';
}

function renderTopbar() {
  var route = currentRoute();
  $('page-title').textContent = t('nav.' + route);

  var act = $('topbar-actions');
  var topbar = act.parentNode;
  if (route === 'queue') {
    var armedCancelAll = isArmed('cancel-all');
    var armedClearDone = isArmed('clear-done');
    topbar.classList.add('has-actions');
    act.innerHTML =
      tbBtn('pause-all', 'pause', t('top.pauseAll')) +
      tbBtn('resume-all', 'play', t('top.resumeAll')) +
      tbBtn('retry-failed', 'retry', t('top.retryFailed')) +
      tbBtn('cancel-all', 'cancel', armedCancelAll ? t('act.sureCancel') : t('top.cancelAll'), armedCancelAll ? 'btn-armed' : '') +
      tbBtn('clear-done', 'check', armedClearDone ? t('act.sureClear') : t('top.clearDone'), armedClearDone ? 'btn-armed' : '') +
      '<div class="topbar-sep"></div>' +
      tbBtn('add', 'plus', t('top.add'), 'btn-primary');
  } else {
    topbar.classList.remove('has-actions');
    act.innerHTML = '';
  }

  var sub = $('page-sub');
  if (state.netError) {
    sub.classList.add('net-err');
    sub.textContent = t('toast.netErr', { msg: state.netError });
    return;
  }
  sub.classList.remove('net-err');
  if (route === 'queue') {
    var n = visibleGroups().length;
    sub.textContent = t('sub.queue', { n: n, groups: tp('pl.groups', n), dl: state.stats.downloading });
  } else if (route === 'history') {
    var recs = state.stats.done + state.stats.canceled;
    sub.textContent = t('sub.history', { n: recs, records: tp('pl.records', recs) });
  } else {
    sub.textContent = t('sub.settings');
  }
}

/* ---------------- render: sidebar widget ---------------- */

function renderSidebar() {
  var srv = state.server;
  if (!srv) return;
  var free = srv.freeSpace, total = srv.totalSpace;
  $('sw-free').textContent = free != null ? t('server.free', { v: formatBytes(free) }) : '—';
  if (free != null && total) {
    var usedPct = Math.min(100, Math.max(0, (total - free) / total * 100));
    $('sw-bar-fill').style.width = usedPct.toFixed(2) + '%';
    $('sw-total').textContent = t('server.total', { total: formatBytes(total), used: formatBytes(total - free) });
  } else {
    $('sw-bar-fill').style.width = '0%';
    $('sw-total').textContent = '—';
  }
  $('sw-folder').textContent = srv.downloadDir || '—';
  $('sw-meta').textContent = t('server.meta', {
    version: srv.version,
    ffmpeg: srv.ffmpeg ? t('server.ffmpegYes') : t('server.ffmpegNo')
  });
  $('sw-dot').classList.toggle('bad', !srv.ffmpeg);
}

/* ---------------- render: KPI ---------------- */

function renderKpi() {
  var st = state.stats;
  var maxSlots = state.settings ? clampInt(state.settings.max_concurrent, 1, 16, 2) : 2;

  $('kpi-downloading').textContent = String(st.downloading);
  $('kpi-downloading-sub').textContent = t('kpi.slots', { dl: st.downloading, max: maxSlots });

  $('kpi-queued').textContent = String(st.queued);
  var qsub;
  if (st.error > 0 && st.paused > 0) qsub = t('kpi.pausedPart', { p: st.paused }) + ' · <span class="err-text">' + t('kpi.errPart', { e: st.error }) + '</span>';
  else if (st.error > 0) qsub = '<span class="err-text">' + t('kpi.errPart', { e: st.error }) + '</span>';
  else if (st.paused > 0) qsub = t('kpi.pausedPart', { p: st.paused });
  else qsub = t('kpi.waitSlot');
  $('kpi-queued-sub').innerHTML = qsub;

  $('kpi-done').textContent = String(st.done);
  $('kpi-done-sub').textContent = t('kpi.inHistory', { n: st.done + st.canceled });

  var freeSpace = state.server ? state.server.freeSpace : null;
  var est = estimateQueue(state.tasks, freeSpace == null ? null : freeSpace);
  $('kpi-left').textContent = (est.remaining > 0 || est.unknown > 0) ? '≈ ' + formatBytes(est.remaining) : '—';
  var leftSub = freeSpace != null ? t('kpi.freeOnServer', { v: formatBytes(freeSpace) }) : '—';
  $('kpi-left-sub').innerHTML = est.notEnoughSpace
    ? '<span class="err-text">' + escapeHtml(leftSub + ' · ' + t('kpi.spaceWarn')) + '</span>'
    : escapeHtml(leftSub);
}

/* ---------------- render: queue ---------------- */

function actBtn(icoName, action, label, cls) {
  return '<button class="act-btn ' + (cls || '') + '" type="button" data-action="' + action + '">' +
    icon(icoName) + '<span>' + escapeHtml(label) + '</span></button>';
}

function groupActions(g) {
  var files = visibleFiles(g);
  var hasActive = files.some(function (f) { return f.status === 'downloading' || f.status === 'queued'; });
  var hasPaused = files.some(function (f) { return f.status === 'paused'; });
  var hasFailed = files.some(function (f) { return f.status === 'error' || f.status === 'canceled'; });
  var aC = isArmed('g:' + g.key + ':cancel');
  var aD = isArmed('g:' + g.key + ':delete');
  var btns = [];
  if (hasActive) btns.push(actBtn('pause', 'pause', t('act.pause'), ''));
  if (hasPaused) btns.push(actBtn('play', 'resume', t('act.resume'), 'act-accent'));
  if (hasActive || hasPaused) {
    btns.push(actBtn('cancel', 'cancel', aC ? t('act.sureCancel') : t('act.cancel'), aC ? 'act-armed' : 'act-danger'));
  }
  if (hasFailed) btns.push(actBtn('retry', 'retry', t('act.retry'), 'act-accent'));
  btns.push(actBtn('trash', 'delete', aD ? t('act.sureDelete') : t('act.delete'), aD ? 'act-armed' : 'act-danger'));
  return btns.join('');
}

function renderTaskRow(task) {
  var pct = task.totalBytes > 0 ? Math.min(100, Math.round((task.receivedBytes || 0) / task.totalBytes * 100)) : 0;
  var name = taskDisplayName(task);
  var sizeText = task.totalBytes > 0
    ? formatBytes(task.receivedBytes) + ' / ' + formatBytes(task.totalBytes)
    : (task.receivedBytes > 0 ? formatBytes(task.receivedBytes) : '—');
  var speedText = (task.status === 'downloading' && task.speed > 0) ? formatSpeed(task.speed) : '—';
  var tooltip = String(task.filename || task.url || '') + (task.error ? '\n' + task.error : '');
  return '<div class="file-row f-' + task.status + '">' +
    '<span class="file-ico">' + icon(task.fileType === 'subtitle' ? 'captions' : 'film') + '</span>' +
    '<span class="file-name" title="' + escapeHtml(tooltip) + '">' + escapeHtml(name) + '</span>' +
    '<span class="file-status"><span class="pill pill-' + task.status + '">' + escapeHtml(t('status.' + task.status)) + '</span></span>' +
    '<div class="file-prog prog-state-' + task.status + '">' +
      '<div class="prog-bar"><div class="prog-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="fp-pct">' + pct + '%</span>' +
    '</div>' +
    '<span class="file-size">' + escapeHtml(sizeText) + '</span>' +
    '<span class="file-speed' + (speedText === '—' ? ' idle' : '') + '">' + escapeHtml(speedText) + '</span>' +
  '</div>';
}

function renderGroup(g) {
  var files = visibleFiles(g);
  var st = groupStatusOf(files);
  var tot = groupTotals(files);
  var collapsed = !!state.collapsed[g.key];
  var isSeries = g.items.some(function (it) { return it.season || it.episode; });
  var kindLabel = t(isSeries ? 'kind.series' : 'kind.movie');

  var errTask = null;
  for (var i = 0; i < files.length; i++) {
    if (files[i].status === 'error' && files[i].error) { errTask = files[i]; break; }
  }
  var errStrip = errTask
    ? '<div class="group-error">' + icon('alert') + '<span>' + escapeHtml(errTask.error) + '</span></div>'
    : '';

  var speedHtml = st === 'downloading' && tot.speed > 0
    ? '<span class="prog-speed">' + formatSpeed(tot.speed) + '</span> · '
    : '';
  var sizeRight = tot.size > 0
    ? formatBytes(tot.received) + ' / ' + formatBytes(tot.size)
    : (tot.received > 0 ? formatBytes(tot.received) : '—');

  var rows = [];
  g.items.forEach(function (it) { it.files.forEach(function (f) { rows.push(renderTaskRow(f)); }); });

  var head =
    '<div class="group-head">' +
      '<div class="group-id">' +
        '<div class="group-title">' +
          '<span class="group-name" title="' + escapeHtml(g.title) + '">' + escapeHtml(g.title) + '</span>' +
        '</div>' +
        '<div class="group-meta">' +
          '<span>' + escapeHtml(kindLabel) + '</span><span class="dot-sep">•</span>' +
          '<span>' + files.length + ' ' + tp('pl.files', files.length) + '</span><span class="dot-sep">•</span>' +
          '<span>' + (tot.size > 0 ? formatBytes(tot.size) : '—') + '</span>' +
        '</div>' +
      '</div>' +
      '<span class="pill pill-' + st + '">' + escapeHtml(t('status.' + st)) + '</span>' +
      '<div class="group-prog prog-state-' + st + '">' +
        '<div class="prog-top">' +
          '<span class="prog-pct">' + (tot.size > 0 ? tot.pct + '%' : '—') + '</span>' +
          '<span class="prog-right">' + speedHtml + escapeHtml(sizeRight) + '</span>' +
        '</div>' +
        '<div class="prog-bar"><div class="prog-fill" style="width:' + tot.pct + '%"></div></div>' +
      '</div>' +
      '<div class="group-actions">' + groupActions(g) + '</div>' +
    '</div>';

  var filesHtml =
    '<div class="group-files-wrap">' +
      '<button class="files-toggle" type="button" data-action="toggle">' +
        icon('chevron') + '<span>' + escapeHtml(t('group.files', { n: files.length })) + '</span>' +
      '</button>' +
      '<div class="group-files">' + rows.join('') + '</div>' +
    '</div>';

  return '<div class="card group' + (collapsed ? ' collapsed' : '') + '" data-group="' + escapeHtml(g.key) + '">' +
    head + errStrip + filesHtml + '</div>';
}

function renderQueue() {
  var list = $('queue-list');
  var empty = $('queue-empty');
  var groups = visibleGroups();
  if (!groups.length) {
    list.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  list.innerHTML = groups.map(renderGroup).join('');
}

/* ---------------- render: history ---------------- */

var HISTORY_RENDER_LIMIT = 500;

function historyRows() {
  var q = state.historySearch.trim().toLowerCase();
  var filter = state.historyFilter;
  var rows = state.tasks.filter(function (task) {
    if (FINISHED_STATUSES.indexOf(task.status) === -1) return false;
    if (filter !== 'all' && task.status !== filter) return false;
    if (!q) return true;
    var haystack = [task.filename, task.title, task.origTitle].filter(Boolean).join(' ').toLowerCase();
    return haystack.indexOf(q) !== -1;
  });
  rows.sort(function (a, b) {
    return (b.finishedAt || b.createdAt || b.id) - (a.finishedAt || a.createdAt || a.id);
  });
  return rows;
}

function renderHistory() {
  var rows = historyRows();
  var shown = rows.slice(0, HISTORY_RENDER_LIMIT);
  var tb = $('history-tbody');
  if (!rows.length) {
    var msg = state.historySearch.trim()
      ? t('history.notFound', { q: state.historySearch.trim() })
      : t('history.empty');
    tb.innerHTML = '<tr><td colspan="5" class="td-empty">' + escapeHtml(msg) + '</td></tr>';
  } else {
    var html = shown.map(function (task) {
      var name = tailOf(task.filename || task.url);
      var full = String(task.filename || task.url || '');
      var isSub = task.fileType === 'subtitle';
      var armedDel = isArmed('h:' + task.id + ':delete');
      var size = task.totalBytes > 0 ? task.totalBytes : (task.receivedBytes > 0 ? task.receivedBytes : null);
      return '<tr data-rec="' + task.id + '">' +
        '<td><div class="cell-file">' +
          '<span class="file-ico">' + icon(isSub ? 'captions' : 'film') + '</span>' +
          '<div class="cf-text">' +
            '<div class="cf-name" title="' + escapeHtml(full) + '">' + escapeHtml(name) + '</div>' +
            (task.error ? '<div class="cf-err">' + icon('alert') + '<span>' + escapeHtml(task.error) + '</span></div>' : '') +
          '</div>' +
        '</div></td>' +
        '<td><span class="pill pill-' + task.status + '">' + escapeHtml(t('status.' + task.status)) + '</span></td>' +
        '<td class="td-num">' + (size ? formatBytes(size) : '—') + '</td>' +
        '<td class="td-date">' + formatDate(task.finishedAt) + '</td>' +
        '<td class="td-act">' +
          '<button class="act-btn act-accent" type="button" data-haction="retry">' + icon('retry') + '<span>' + escapeHtml(t('act.retry')) + '</span></button>' +
          '<button class="act-btn ' + (armedDel ? 'act-armed' : 'act-danger') + '" type="button" data-haction="delete">' +
            icon('trash') + '<span>' + escapeHtml(armedDel ? t('act.sureDelete') : t('history.deleteRec')) + '</span></button>' +
        '</td>' +
      '</tr>';
    }).join('');
    if (rows.length > shown.length) {
      html += '<tr><td colspan="5" class="td-empty">' + escapeHtml(t('history.shownFirst', { n: shown.length })) + '</td></tr>';
    }
    tb.innerHTML = html;
  }
  $('history-count').textContent = t('history.count', { shown: rows.length, total: state.stats.done + state.stats.canceled });
}

/* ---------------- actions ---------------- */

async function runTaskAction(ids, action) {
  for (var i = 0; i < ids.length; i++) {
    await api('/api/tasks/' + ids[i] + '/' + action, { method: 'POST' });
  }
}

async function groupAction(g, action) {
  var files = visibleFiles(g);
  var ids;
  if (action === 'pause') ids = files.filter(function (f) { return f.status === 'downloading' || f.status === 'queued'; }).map(function (f) { return f.id; });
  else if (action === 'resume') ids = files.filter(function (f) { return f.status === 'paused' || f.status === 'error'; }).map(function (f) { return f.id; });
  else if (action === 'cancel') ids = files.filter(function (f) { return ['downloading', 'queued', 'paused'].indexOf(f.status) !== -1; }).map(function (f) { return f.id; });
  else if (action === 'retry') ids = files.filter(function (f) { return f.status === 'error' || f.status === 'canceled'; }).map(function (f) { return f.id; });
  else if (action === 'delete') ids = files.map(function (f) { return f.id; });
  else return;

  if (!ids.length && action !== 'delete') {
    toast(t('toast.noMatching'), 'info');
    return;
  }

  try {
    if (action === 'delete') {
      /* только убираем записи из списка; файлы на диске остаются (без ?file=1) */
      for (var i = 0; i < ids.length; i++) {
        await api('/api/tasks/' + ids[i], { method: 'DELETE' });
      }
      toast(t('toast.groupDeleted', { title: g.title }), 'success');
    } else {
      await runTaskAction(ids, action);
      var n = ids.length;
      if (action === 'pause') toast(t('toast.groupPaused', { title: g.title }), 'success');
      else if (action === 'resume') toast(t('toast.groupResumed', { title: g.title }), 'success');
      else if (action === 'cancel') toast(t('toast.groupCanceled', { title: g.title, n: n, files: tp('pl.files', n) }), 'success');
      else if (action === 'retry') toast(t('toast.groupRetried', { title: g.title }), 'success');
    }
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

async function pauseAll() {
  try {
    var data = await api('/api/tasks/pause-all', { method: 'POST' });
    if (data.paused) toast(t('toast.pausedAll', { n: data.paused, tasks: tp('pl.tasks', data.paused) }), 'success');
    else toast(t('toast.noActive'), 'info');
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

async function cancelAll() {
  try {
    var data = await api('/api/tasks/cancel-all', { method: 'POST' });
    if (data.canceled) toast(t('toast.canceledAll', { n: data.canceled, tasks: tp('pl.tasks', data.canceled) }), 'success');
    else toast(t('toast.noActive'), 'info');
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

/* «Очистить завершённые»: убирает готовые/отменённые из списка очереди;
   записи остаются в Истории, файлы на диске не трогаются */
async function hideFinished() {
  try {
    var data = await api('/api/tasks/hide-finished', {
      method: 'POST',
      body: JSON.stringify({ statuses: ['done', 'canceled'] })
    });
    if (data.hidden) toast(t('toast.clearedQueue', { n: data.hidden, tasks: tp('pl.tasks', data.hidden) }), 'success');
    else toast(t('toast.noDoneGroups'), 'info');
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

async function resumeAll() {
  try {
    var data = await api('/api/tasks/resume-all', { method: 'POST' });
    if (data.resumed) toast(t('toast.resumedAll', { n: data.resumed, tasks: tp('pl.tasks', data.resumed) }), 'success');
    else toast(t('toast.noPaused'), 'info');
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

async function retryFailed() {
  try {
    var data = await api('/api/tasks/retry-failed', { method: 'POST' });
    if (data.retried) toast(t('toast.retriedFailed', { n: data.retried }), 'success');
    else toast(t('toast.noFailed'), 'info');
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

/* «Повторить» в истории: та же задача возвращается в очередь,
   дублей не создаётся; повторный клик по уже обработанной строке
   блокируется классом is-disabled до следующего рендера. */
async function retryHistoryRecord(task, btn) {
  if (btn) btn.classList.add('is-disabled');
  try {
    await api('/api/tasks/' + task.id + '/retry', { method: 'POST' });
    toast(t('toast.recRetried'), 'success');
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

async function deleteHistoryRecord(task) {
  try {
    await api('/api/tasks/' + task.id, { method: 'DELETE' });
    toast(t('toast.recDeleted'), 'info');
  } catch (err) {
    toast(t('toast.actionErr', { msg: err.message }), 'error');
  }
  await refresh();
}

/* ---------------- modal: добавить по ссылке ---------------- */

function openModal() {
  var o = $('modal-overlay');
  o.hidden = false;
  requestAnimationFrame(function () { o.classList.add('open'); });
  window.setTimeout(function () { $('f-url').focus(); }, 60);
}

function closeModal() {
  var o = $('modal-overlay');
  o.classList.remove('open');
  window.setTimeout(function () { o.hidden = true; }, 170);
  $('add-form').reset();
  var f = $('f-url').closest('.field');
  if (f) f.classList.remove('is-invalid');
}

async function onAddSubmit(e) {
  e.preventDefault();
  if (state.adding) return;
  var urlInput = $('f-url');
  var url = urlInput.value.trim();
  var field = urlInput.closest('.field');
  var errEl = $('f-url-error');
  if (!url) {
    errEl.textContent = t('modal.urlErr');
    field.classList.add('is-invalid');
    urlInput.focus();
    return;
  }
  field.classList.remove('is-invalid');

  var body = { url: url };
  var name = $('f-name').value.trim();
  var referer = $('f-referer').value.trim();
  if (name) body.filename = name;
  if (referer) body.referer = referer;

  state.adding = true;
  try {
    var res = await api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
    closeModal();
    toast(t('toast.addedN', { n: res.created }), 'success');
    await refresh();
  } catch (err) {
    /* текст ошибки сервера показываем как есть (он приходит с сервера) */
    errEl.textContent = err.message;
    field.classList.add('is-invalid');
  } finally {
    state.adding = false;
  }
}

/* ---------------- polling ---------------- */

async function refresh() {
  try {
    var data = await api('/api/state?limit=1000');
    var wasError = state.netError;
    state.server = data.server;
    state.stats = data.stats;
    state.settings = data.settings;
    state.tasks = data.tasks;
    state.groups = groupTasks(data.tasks);
    updateSpeeds(data.tasks);
    state.netError = '';
    if (wasError) toast(t('toast.netOk'), 'success');
    if (!state.settingsDirty) fillSettingsForm();
    renderAll();
  } catch (err) {
    if (!state.netError) toast(t('toast.netErr', { msg: err.message }), 'error');
    state.netError = err.message;
    renderTopbar();
  }
}

/* ---------------- events ---------------- */

function bindEvents() {
  window.addEventListener('hashchange', applyRoute);

  $('lang-switch').addEventListener('click', function (e) {
    var b = e.target.closest('[data-lang]');
    if (!b) return;
    setLang(b.getAttribute('data-lang'));
  });

  $('topbar-actions').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-global]');
    if (!btn) return;
    var a = btn.dataset.global;
    if (a === 'add') openModal();
    else if (a === 'pause-all') pauseAll();
    else if (a === 'resume-all') resumeAll();
    else if (a === 'retry-failed') retryFailed();
    else if (a === 'cancel-all' || a === 'clear-done') {
      if (isArmed(a)) {
        disarm(a);
        if (a === 'cancel-all') cancelAll();
        else hideFinished();
      } else {
        arm(a);
        renderTopbar();
      }
    }
  });

  $('queue-list').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var card = btn.closest('[data-group]');
    if (!card) return;
    var key = card.dataset.group;
    var g = null;
    for (var i = 0; i < state.groups.length; i++) {
      if (state.groups[i].key === key) { g = state.groups[i]; break; }
    }
    if (!g) return;
    var a = btn.dataset.action;

    if (a === 'toggle') {
      state.collapsed[g.key] = !state.collapsed[g.key];
      renderQueue();
      return;
    }
    if (a === 'cancel' || a === 'delete') {
      var armKey = 'g:' + g.key + ':' + a;
      if (isArmed(armKey)) {
        disarm(armKey);
        groupAction(g, a);
      } else {
        arm(armKey);
        renderQueue();
      }
      return;
    }
    if (a === 'pause' || a === 'resume' || a === 'retry') groupAction(g, a);
  });

  $('queue-empty-add').addEventListener('click', openModal);

  $('history-filter').addEventListener('click', function (e) {
    var b = e.target.closest('[data-filter]');
    if (!b) return;
    state.historyFilter = b.dataset.filter;
    $('history-filter').querySelectorAll('.seg-btn').forEach(function (x) {
      x.classList.toggle('active', x === b);
    });
    renderHistory();
  });

  $('history-search').addEventListener('input', function () {
    state.historySearch = $('history-search').value;
    renderHistory();
  });

  $('history-tbody').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-haction]');
    if (!btn || btn.classList.contains('is-disabled')) return;
    var tr = btn.closest('tr[data-rec]');
    if (!tr) return;
    var id = Number(tr.dataset.rec);
    var task = null;
    for (var i = 0; i < state.tasks.length; i++) {
      if (state.tasks[i].id === id) { task = state.tasks[i]; break; }
    }
    if (!task) return;
    if (btn.dataset.haction === 'retry') {
      retryHistoryRecord(task, btn);
    } else {
      var key = 'h:' + id + ':delete';
      if (isArmed(key)) {
        disarm(key);
        btn.classList.add('is-disabled');
        deleteHistoryRecord(task);
      } else {
        arm(key);
        renderHistory();
      }
    }
  });

  $('settings-form').addEventListener('submit', function (e) {
    e.preventDefault();
    saveSettings();
  });

  $('settings-form').addEventListener('input', function (e) {
    if (e.target.id === 'set-lang') return;
    state.settingsDirty = true;
  });

  $('settings-revert').addEventListener('click', function () {
    state.settingsDirty = false;
    fillSettingsForm();
    toast(t('toast.reverted'), 'info');
  });

  $('set-lang').addEventListener('change', function () {
    setLang($('set-lang').value);
  });

  TPL_FIELDS.forEach(function (fd) {
    var el = $(fd.input);
    if (!el) return;
    el.addEventListener('focus', function () { lastTplId = fd.input; });
    el.addEventListener('input', updateTplPreviews);
  });

  $('ph-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-ph]');
    if (!b) return;
    insertPlaceholder(b.getAttribute('data-ph'));
  });

  $('modal-close').addEventListener('click', closeModal);
  $('modal-cancel').addEventListener('click', closeModal);
  $('modal-overlay').addEventListener('click', function (e) {
    if (e.target === $('modal-overlay')) closeModal();
  });
  $('add-form').addEventListener('submit', onAddSubmit);
  $('f-url').addEventListener('input', function () {
    var f = $('f-url').closest('.field');
    if (f) f.classList.remove('is-invalid');
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('modal-overlay').hidden) closeModal();
  });
}

/* ---------------- init ---------------- */

function init() {
  loadLang();
  bindEvents();
  applyI18n();
  applyRoute();
  refresh();
  window.setInterval(refresh, 1000);
}

init();
