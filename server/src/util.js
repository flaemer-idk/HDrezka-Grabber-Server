import fsp from 'node:fs/promises';
import path from 'node:path';

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatBytes(bytes) {
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

/** Убирает из одного сегмента пути символы, недопустимые в Windows/Linux. */
export function cleanSegment(segment) {
  return String(segment ?? '')
    .replace(/[<>:"|?*\u0000-\u001f]/g, '')
    .replace(/[\\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 150);
}

export function sanitizeRelPath(relPath) {
  return String(relPath)
    .split(/[\\/]+/)
    .map(cleanSegment)
    .filter(Boolean)
    .join('/');
}

// Расширения, которые в имени файла действительно расширение: их можно
// заменить на нужное, а всё остальное — часть имени.
const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.m3u8', '.avi', '.mov', '.webm', '.flv', '.ts', '.m4v', '.mpg', '.mpeg',
]);

function ensureExtension(relPath, fileType) {
  const wanted = fileType === 'subtitle' ? '.vtt' : '.mp4';
  const ext = path.extname(relPath).toLowerCase();
  if (ext === wanted) return relPath;
  if (fileType === 'subtitle') {
    // .srt — тоже субтитр, оставляем как есть.
    if (ext === '.srt') return relPath;
    // Хвост вида «.rus» — это код языка в имени (American Psycho.rus), а не
    // расширение, поэтому субтитру просто дописываем .vtt.
    if (ext && !MEDIA_EXTENSIONS.has(ext)) return relPath + wanted;
    return (ext ? relPath.slice(0, -ext.length) : relPath) + wanted;
  }
  if (ext) return relPath.slice(0, -ext.length) + wanted;
  return relPath + wanted;
}

/* ────────────────────────── медиатека: категории ────────────────────────── */

/**
 * Разбирает настройку «Категории → папки медиатеки» из строк вида:
 *   films = Фильмы
 *   animation = Аниме
 * Ключ `default` задаёт папку для всего, что не перечислено.
 */
export function parseCategoryMap(settings) {
  const map = new Map();
  for (const rawLine of String(settings?.library_categories ?? '').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key && value) map.set(key, value);
  }
  return map;
}

/** Папка медиатеки для категории страницы (films/series/animation/…). */
export function categoryFolder(settings, category) {
  if (!String(settings?.library_dir ?? '').trim()) return '';
  const map = parseCategoryMap(settings);
  const key = String(category ?? '').trim().toLowerCase();
  if (key && map.has(key)) return map.get(key);
  if (map.has('default')) return map.get('default');
  return key;
}

/* ─────────────────── языки субтитров: код для имени файла ─────────────────── */

// hdrezka отдаёт язык словами («Русский»), а в имени файла нужен код: по нему
// Jellyfin понимает, что это за субтитры (American Psycho.rus.vtt). Словарь
// переводит названия в коды (ISO 639-2/B, английский — «en»). Если сайт отдал
// код сам (subtitle_lns в ответе плеера) — он используется как есть.
const SUBTITLE_LANG_CODES = {
  русский: 'rus', рус: 'rus', ru: 'rus', rus: 'rus', russian: 'rus',
  английский: 'en', англ: 'en', en: 'en', eng: 'en', english: 'en',
  украинский: 'ukr', укр: 'ukr', uk: 'ukr', ukr: 'ukr', ukrainian: 'ukr',
  белорусский: 'bel', be: 'bel', bel: 'bel', belarusian: 'bel',
  казахский: 'kaz', kk: 'kaz', kaz: 'kaz', kazakh: 'kaz',
  узбекский: 'uzb', uz: 'uzb', uzb: 'uzb', uzbek: 'uzb',
  армянский: 'arm', hy: 'arm', arm: 'arm', armenian: 'arm',
  грузинский: 'geo', ka: 'geo', geo: 'geo', georgian: 'geo',
  азербайджанский: 'aze', az: 'aze', aze: 'aze', azerbaijani: 'aze',
  немецкий: 'ger', de: 'ger', deu: 'ger', ger: 'ger', german: 'ger',
  французский: 'fre', fr: 'fre', fra: 'fre', fre: 'fre', french: 'fre',
  испанский: 'spa', es: 'spa', spa: 'spa', spanish: 'spa',
  итальянский: 'ita', it: 'ita', ita: 'ita', italian: 'ita',
  португальский: 'por', pt: 'por', por: 'por', portuguese: 'por',
  польский: 'pol', pl: 'pol', pol: 'pol', polish: 'pol',
  чешский: 'cze', cs: 'cze', ces: 'cze', cze: 'cze', czech: 'cze',
  словацкий: 'slo', sk: 'slo', slk: 'slo', slo: 'slo', slovak: 'slo',
  болгарский: 'bul', bg: 'bul', bul: 'bul', bulgarian: 'bul',
  сербский: 'srp', sr: 'srp', srp: 'srp', serbian: 'srp',
  хорватский: 'hrv', hr: 'hrv', hrv: 'hrv', croatian: 'hrv',
  словенский: 'slv', sl: 'slv', slv: 'slv', slovenian: 'slv',
  румынский: 'rum', ro: 'rum', ron: 'rum', rum: 'rum', romanian: 'rum',
  молдавский: 'mol', mo: 'mol', mol: 'mol', moldavian: 'mol',
  венгерский: 'hun', hu: 'hun', hun: 'hun', hungarian: 'hun',
  греческий: 'gre', el: 'gre', ell: 'gre', gre: 'gre', greek: 'gre',
  турецкий: 'tur', tr: 'tur', tur: 'tur', turkish: 'tur',
  финский: 'fin', fi: 'fin', fin: 'fin', finnish: 'fin',
  шведский: 'swe', sv: 'swe', swe: 'swe', swedish: 'swe',
  норвежский: 'nor', no: 'nor', nor: 'nor', norwegian: 'nor',
  датский: 'dan', da: 'dan', dan: 'dan', danish: 'dan',
  нидерландский: 'dut', nl: 'dut', nld: 'dut', dut: 'dut', dutch: 'dut',
  литовский: 'lit', lt: 'lit', lit: 'lit', lithuanian: 'lit',
  латышский: 'lav', lv: 'lav', lav: 'lav', latvian: 'lav',
  эстонский: 'est', et: 'est', est: 'est', estonian: 'est',
  японский: 'jpn', ja: 'jpn', jpn: 'jpn', japanese: 'jpn',
  корейский: 'kor', ko: 'kor', kor: 'kor', korean: 'kor',
  китайский: 'chi', zh: 'chi', zho: 'chi', chi: 'chi', chinese: 'chi',
  тайский: 'tha', th: 'tha', tha: 'tha', thai: 'tha',
  вьетнамский: 'vie', vi: 'vie', vie: 'vie', vietnamese: 'vie',
  хинди: 'hin', hi: 'hin', hin: 'hin', hindi: 'hin',
  арабский: 'ara', ar: 'ara', ara: 'ara', arabic: 'ara',
  иврит: 'heb', he: 'heb', heb: 'heb', hebrew: 'heb',
  персидский: 'per', fa: 'per', fas: 'per', per: 'per', persian: 'per',
  индонезийский: 'ind', id: 'ind', ind: 'ind', indonesian: 'ind',
};

const CYRILLIC_TO_LATIN = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

/**
 * Код языка субтитров: «Русский» → «rus», «Английский» → «en».
 * Готовый код (из subtitle_lns или 2–3 латинские буквы) возвращается как есть,
 * незнакомое название — латиницей (в имени файла не должно быть кириллицы).
 */
export function subtitleLangCode(value) {
  const text = String(value ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ') // «Русский (rus)» → «русский»
    .replace(/[[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';

  const direct = SUBTITLE_LANG_CODES[text];
  if (direct) return direct;

  // «русский синхронный» — берём первое слово.
  const first = text.split(' ')[0];
  if (SUBTITLE_LANG_CODES[first]) return SUBTITLE_LANG_CODES[first];

  return first
    .replace(/[а-яё]/g, (letter) => CYRILLIC_TO_LATIN[letter] ?? '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
}

/* ────────────────── названия (варианты «Romaji / English») ────────────────── */

// На сайте оригинальное название может содержать несколько вариантов,
// разделённых « / »: «Gekijouban ... / Beyond the Boundary ...».
const TITLE_SPLIT_RE = /\s\/\s|\s\/\S|\S\/\s/g;

const ENGLISH_WORDS = new Set([
  'the', 'of', 'and', 'in', 'to', 'a', 'an', 'is', 'are', 'be', 'for', 'with', 'on', 'at',
  'by', 'from', 'my', 'your', 'his', 'her', 'our', 'their', 'this', 'that', 'movie', 'film',
  'part', 'story', 'chapter', 'here', 'future', 'beyond', 'last', 'first', 'new', 'love',
  'world', 'day', 'night', 'time', 'life', 'war', 'king', 'star', 'dark', 'light', 'blood',
  'soul', 'heart', 'home', 'city', 'girl', 'boy', 'man', 'woman', 'return', 'legend', 'hero',
  'dream', 'memory', 'ghost', 'blade', 'sword', 'fire', 'water', 'sky', 'moon', 'sea', 'road',
  'key', 'door', 'book', 'name', 'shadow', 'power', 'magic', 'god', 'demon', 'angel',
  'monster', 'dragon', 'school', 'friend', 'family', 'secret', 'song', 'voice', 'silence',
  'end', 'great', 'little', 'big', 'old', 'young', 'black', 'white', 'red', 'blue', 'final',
]);

export function splitTitleVariants(value) {
  return String(value ?? '')
    .split(TITLE_SPLIT_RE)
    .map((part) => part.trim())
    .filter(Boolean);
}

function scoreVariant(variant) {
  const asciiOnly = /^[\x20-\x7E]+$/.test(variant);
  const words = variant.toLowerCase().match(/[a-z']+/g) ?? [];
  const englishHits = words.filter((word) => ENGLISH_WORDS.has(word)).length;
  return (asciiOnly ? 1 : 0) + englishHits * 2;
}

/**
 * Лучшее название по приоритету: английский вариант из «Romaji / English»,
 * иначе оригинальное, иначе локализованное (русское).
 */
export function pickBestTitle(origTitle, title) {
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const variants = splitTitleVariants(origTitle);

  if (variants.length > 0) {
    let best = variants[0];
    let bestScore = -1;
    for (const variant of variants) {
      const score = scoreVariant(variant);
      // при равенстве берём последний вариант: на сайте порядок «Romaji / English»
      if (score >= bestScore) {
        best = variant;
        bestScore = score;
      }
    }
    return clean(best);
  }

  return clean(title);
}

/** Значение из названия не должно создавать подпапки и ломать имя файла. */
function sanitizeTokenValue(value) {
  return String(value ?? '')
    .replace(/[<>:"|?*\u0000-\u001f]/g, '')
    .replace(/[\\/]+/g, ' ')
    .replace(/[ \t]+/g, ' ');
}

function tokenValues(task) {
  // Номера сезона/серии без ведущих нулей: S1E2 (не S01E02).
  const seasonId = task.season === null || task.season === undefined ? '' : String(task.season);
  const episodeId = task.episode === null || task.episode === undefined ? '' : String(task.episode);
  const year = task.year ? String(task.year) : '';
  // Код языка важнее названия: сайт знает его точнее словаря.
  const subtitleLang =
    subtitleLangCode(task.subtitle_lang_code) || subtitleLangCode(task.subtitle_lang);
  return {
    '%title%': task.title || '',
    '%orig_title%': pickBestTitle(task.orig_title, task.title),
    '%quality%': task.quality || '',
    '%voiceover%': task.voiceover || '',
    '%year%': year,
    '%year_part%': year ? ` (${year})` : '',
    '%season%': task.season_title || '',
    '%season_id%': seasonId,
    '%episode%': task.episode_title || '',
    '%episode_id%': episodeId,
    '%sxxexx%': seasonId && episodeId ? ` S${seasonId}E${episodeId}` : '',
    '%season_folder%': seasonId ? `Season ${seasonId}` : '',
    '%movie_id%': task.movie_id || '',
    '%subtitle_lang%': subtitleLang,
    '%subtitle_lang_raw%': task.subtitle_lang || '',
  };
}

/**
 * Собирает относительный путь файла для задачи.
 * Если клиент передал filename — используется он (с санитайзингом),
 * иначе — шаблон из настроек сервера.
 *
 * Доступные плейсхолдеры: %title%, %orig_title%, %quality%, %voiceover%, %year%,
 * %year_part% (« (2022)» или пусто), %season%, %season_id%, %episode%, %episode_id%,
 * %sxxexx%, %season_folder% («Season 1» или пусто), %movie_id%, %subtitle_lang%
 * (код языка: «rus», «en»), %subtitle_lang_raw% (название как его отдал сайт:
 * «Русский»). Номера сезона/серии — без ведущих нулей
 * (S1E2). %orig_title% выбирает лучший вариант названия: английский, иначе
 * оригинальный, иначе локализованный. Разделитель "/" создаёт подпапку; пустые
 * сегменты отбрасываются.
 */
export function buildFilename(task, settings) {
  if (task.filename && String(task.filename).trim()) {
    return ensureExtension(sanitizeRelPath(String(task.filename).trim()), task.file_type);
  }

  const isSubtitle = task.file_type === 'subtitle';
  const template = isSubtitle
    ? settings.filename_template_subtitle
    : task.season
      ? settings.filename_template_series
      : settings.filename_template_film;

  const tokens = tokenValues(task);
  let result = String(template ?? '');
  for (const [token, value] of Object.entries(tokens)) {
    // Значения санитайзим: слеши в названии не должны создавать подпапки.
    result = result.split(token).join(sanitizeTokenValue(value));
  }
  result = result.replace(/%[a-zA-Z_]+%/g, '');

  const segments = result
    .split(/[\\/]+/)
    .map(cleanSegment)
    .filter(Boolean);

  if (segments.length === 0) {
    segments.push(`file-${task.id ?? Date.now()}`);
  }

  // Медиатека: сверху добавляется папка категории (Фильмы/Сериалы/Аниме/…)
  const folder = cleanSegment(categoryFolder(settings, task.category));
  if (folder) segments.unshift(folder);

  return ensureExtension(segments.join('/'), task.file_type);
}

/** Подбирает свободное имя: file.mp4 → file (1).mp4 */
export async function uniquifyPath(filePath) {
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);

  for (let i = 0; i < 1000; i++) {
    const candidate = i === 0 ? `${base}${ext}` : `${base} (${i})${ext}`;
    const full = path.join(dir, candidate);
    try {
      await fsp.access(full);
    } catch {
      return full;
    }
  }
  return path.join(dir, `${base} (${Date.now()})${ext}`);
}

/** Имя файла из ссылки — для ручного добавления без метаданных. */
export function filenameFromUrl(url, fileType) {
  const fallbackExt = fileType === 'subtitle' ? '.vtt' : '.mp4';
  try {
    const pathname = new URL(url).pathname;
    const base = decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) || '');
    const cleaned = sanitizeRelPath(base);
    if (!cleaned) return `file-${Date.now()}${fallbackExt}`;
    return path.extname(cleaned) ? cleaned : cleaned + fallbackExt;
  } catch {
    return `file-${Date.now()}${fallbackExt}`;
  }
}