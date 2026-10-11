# HDrezka-Grabber — архитектура проекта и план распила на «сервер + клиент»

> Документ-хендовер для AI-агентов и разработчиков. Цель: дать полную карту кода,
> контрактов и зависимостей от браузерных API, чтобы можно было спроектировать и
> реализовать серверную часть (скачивание на сервер) и клиентскую (расширение
> и/или веб-морда) без повторного чтения всего проекта.
>
> Состояние кода: ветка `main`, коммит `fa56cc7`, `package.json` версии `1.0.2`.
> Лицензия GPL-3.0. Автор: kristal374 (mail.aleks.for.work@gmail.com).

---

## 0. Краткое резюме (TL;DR)

Сейчас это **браузерное расширение** (MV3 для Chromium, MV2 для Firefox), которое:

1. читает данные плеера прямо со страницы hdrezka/rezka через инжектируемые скрипты
   (`browser.scripting.executeScript` + `<script>` в DOM страницы);
2. запрашивает прямые ссылки на видео у ajax-эндпоинта сайта `/ajax/get_cdn_series/`
   из service worker (с куками браузера, подменой заголовков Referer/Origin через
   `declarativeNetRequest`, либо «через страницу» для обхода Cloudflare);
3. ставит файлы в собственную очередь (service worker + IndexedDB) и запускает
   скачивание **встроенным загрузчиком браузера** (`browser.downloads.download`),
   отслеживая прогресс через `browser.downloads.onChanged`;
4. показывает попап с выбором озвучки/качества/субтитров/диапазона серий, страницы
   настроек и логов; настройки и состояние — в `browser.storage` и IndexedDB.

Ключевая идея распила: **всю «рабочую» часть (очередь, резолв ссылок, скачивание
файлов, прогресс, история, логи) можно перенести на сервер**, а клиент оставить
тонким: он либо извлекает данные со страницы и отправляет задание на сервер
(расширение), либо вообще работает как веб-UI. Файлы в этом случае скачиваются
**сразу на сервер**, а не на ноутбук.

Что физически нельзя унести на сервер «как есть» (см. §9.1):

- DOM-экстракцию и обход Cloudflare через живую страницу (`src/extraction-scripts/**`,
  `src/service-worker/network-layer/page-bridge.ts`);
- `browser.downloads`, `browser.alarms`, `browser.storage.*`, `browser.scripting`,
  `declarativeNetRequest`, `browser.tabs` — всё это заменяется своими аналогами
  (HTTP-клиент с заголовками, планировщик, БД, WebSocket и т.д.).

Всё остальное — state machine загрузок (`load-manager/core.ts`), очередь
(`queue.ts`), site-loader (`site-loader/hdrezka.ts`), декодирование ссылок
(`lib/link-processing.ts`), шаблоны имён (`lib/filename-maker.ts`), логика
статусов (`lib/types.ts`) — уже почти не зависит от браузера и переносится
в серверное ядро с минимальными правками.

---

## 1. Что делает расширение (функционал)

- Скачивание фильмов/сериалов с hdrezka и зеркал rezka.ag напрямую на диск
  средствами браузера (без файлопомойки внутри расширения).
- Выбор озвучки (перевода), качества (360p…4K), языка субтитров; режим
  «только субтитры»; загрузка всего сериала или диапазона серий.
- Очередь и параллельные загрузки (лимиты для фильмов и для эпизодов отдельно),
  пауза/возобновление, авто-повторы при сбоях, реакции на «нет качества» /
  «нет субтитров» (skip / reduce_quality / stop и т.п.).
- Определение **реального** качества файла (по метаданным потока через
  `mediabunny`) и размера файла (Range-запросы), предупреждение о занижении
  качества на сайте.
- Шаблоны имён файлов с плейсхолдерами (`%title%`, `%season_id%` и т.д.),
  создание папок `HDrezkaGrabber/` и папок сериалов.
- Восстановление состояния после сбоя браузера/расширения (аудит «сломанных»
  загрузок при старте), очистка данных, миграции при обновлении версии.
- Собственная система логирования с журналом в IndexedDB, realtime-таблицей,
  экспортом/импортом логов, source-map-резолвингом стектрейсов.
- 3 языка: en, ru, uk (по 266 ключей).

История версий: в `CHANGELOG.md` верхняя запись — 1.0.0 (полный рерайт),
при этом `package.json` уже `1.0.2` — changelog отстаёт.

---

## 2. Технологический стек и сборка

| Слой | Технологии |
|---|---|
| Язык | TypeScript 5.9 (`strict`), целевой стандарт ES2024 |
| UI | React 19.2, Redux Toolkit (только popup), `@base-ui/react` 1.1, Tailwind CSS 4, `sonner` (тосты), `@tanstack/react-table` + `react-virtual` (таблица логов), `react-mentions` (редактор шаблонов имён), `@number-flow/react`, `lucide-react`, `react-inspector`, `pako` (gzip логов) |
| Ядро (SW) | собственные классы (state machine), `idb` 8 (IndexedDB), `mediabunny` 1.29 (чтение метаданных видео), `@datastructures-js/priority-queue` (приоритетные мьютексы), `webextension-polyfill` |
| Сборка | Vite 7 (страницы: popup/settings/logger), Rollup 4 (background.js), Tailwind 4 Vite-плагин, babel-plugin-react-compiler, prettier |
| Упаковка | `run-build.js` (yargs) → `platform/{chromium,firefox}/make.js` → zip/xpi; `dist/make-meta.js` подставляет версию и build number |
| CI | `.github/workflows/build.yml`: `npm ci` → `npm run build:prod -- --build-number ${{ github.run_number }}` → артефакты |

Команды:

```bash
npm ci
npm run build:dev        # dev-сборки всех браузеров, sourcemap, без минификации
npm run build:chromium   # dist/build/HDrezka-Grabber.chromium
npm run build:firefox    # dist/build/HDrezka-Grabber.firefox
npm run build:prod       # prod + zip, build number = 1
```

Пути вывода: промежуточная сборка `dist/build/HDrezka-Grabber.build/`, затем
платформенные каталоги `dist/build/HDrezka-Grabber.{chromium,firefox}/`.

---

## 3. Топология исполнения (важно для распила)

Расширение живёт в **трёх контекстах**, у каждого — свои доступные API:

```
┌────────────────────────────────────────────────────────────────────────────┐
│ 1. SERVICE WORKER (background.ts) — «мозг»                                  │
│    • DownloadManager + QueueController (состояние, очередь, ретраи)         │
│    • IndexedDB HDrezkaGrabberDB (urlDetail/loadConfig/loadStorage/          │
│      fileStorage/logStorage/cacheStorage)                                   │
│    • browser.downloads (запуск/пауза/отмена/события), browser.alarms        │
│    • сетевой слой: fetch к /ajax/get_cdn_series/, Range-пробы размеров,     │
│      declarativeNetRequest для подмены Referer/Origin/Sec-Fetch-*           │
│    • injection в вкладку (scripting.executeScript) — для обхода Cloudflare  │
│    • browser.storage.local (settings, queue, activeDownloads), session      │
├────────────────────────────────────────────────────────────────────────────┤
│ 2. СТРАНИЦЫ РАСШИРЕНИЯ (popup / settings / logger)                          │
│    • popup: определение типа страницы, выбор параметров, Initiator → SW     │
│    • settings: настройки в storage.local, сервисные команды в SW            │
│    • logger: realtime-таблица логов из IndexedDB                            │
│    • Redux-состояние popup сериализуется в browser.storage.session (t-<tab>)│
│    • eventBus поверх browser.runtime.onMessage / storage.onChanged          │
├────────────────────────────────────────────────────────────────────────────┤
│ 3. СТРАНИЦА САЙТА (hdrezka) — только инжектируемые скрипты                  │
│    • ExtractionScripts/*.ts (func в executeScript) — читают DOM/CDNPlayer   │
│    • InjectionScripts/extractMovieInfo.js, netRequests.js (в <script>)      │
│      — нужны из-за CSP и доступа к глобалу CDNPlayer и jQuery страницы      │
└────────────────────────────────────────────────────────────────────────────┘
```

Обмен между контекстами:

- `browser.runtime.sendMessage` (одноразовые команды и запросы, `Message<T>`);
- `browser.runtime.connect` (порт для потока логов из SW → страницы);
- `browser.storage.onChanged` (наблюдение за `settings`, `queue`, `activeDownloads`);
- IndexedDB читают все контексты (это общая БД расширения);
- `CustomEvent` в `globalThis` — для доставки события самому себе (логгер,
  уведомления, `DBDeletedEvent`).

---

## 4. Карта исходников — каждый файл

### 4.1 Корень репозитория

| Файл | Назначение |
|---|---|
| `package.json` | Зависимости, скрипты сборки (см. §2). Версия `1.0.2` — источник для `make-meta.js`. |
| `tsconfig.json` | `strict`, ES2024, alias `@/* → ./src/*`, `noEmit` (сборка через Vite/Rollup). |
| `vite.config.ts` | Сборка трёх HTML-страниц расширения; root `src/html/`, входы `popup.html`, `settings.html`, `logger.html`; вывод в `dist/build/HDrezka-Grabber.build`; имёна чанков `src/js/[name].js`. |
| `rollup.config.js` | Сборка `src/service-worker/background.ts` → `dist/build/.../src/js/background.js`; копирует `webextension-polyfill` и каталог `InjectionScripts/` в `src/js/`. |
| `run-build.js` | CLI-оркестратор: чистит `dist/build`, запускает Vite+Rollup, затем `platform/<browser>/make.js` с версией и build-number; удаляет промежуточный каталог. |
| `dist/make-meta.js` | Проставляет в манифест `version = X.Y.Z.build` и (для MV3) `version_name = X.Y.Z`. Валидирует диапазоны 0–65535. |
| `global.d.ts` | Типы глобалов, которые создаёт `src/lib/global-scope-init.ts`: `browser` (с типизированным `i18n.getMessage` по ключам ru-локали), `logger`, `eventBus`, `messageBroker`, `settings`, `indexedDBObject`, `root`. **Все модули используют эти глобалы без импорта.** |
| `platform/chromium/manifest.json` | MV3: `action.default_popup`, `background.service_worker: src/js/background.js`, permissions `alarms, scripting, storage, declarativeNetRequestWithHostAccess, downloads`, `host_permissions: http(s)://*/*`, `web_accessible_resources: src/js/*`, `options_ui` → settings.html. |
| `platform/firefox/manifest.json` | MV2: `browser_action`, `background.scripts`, gecko id, `strict_min_version: 128.0`, `data_collection_permissions: none`. |
| `platform/{chromium,firefox}/make.js` | Собирают платформенный каталог: копируют промежуточную сборку, `src/img` → `img`, `src/_locales` → `_locales`, `CHANGELOG.md`, манифест платформы; вызывают `make-meta.js`; пакуют zip (chromium) / xpi (firefox) при `--zip`. |
| `.github/workflows/build.yml` | CI: npm ci, `build:prod --build-number <run_number>`, выгрузка артефактов (архивы + пофайлово). |
| `README.md` / `README-EN.md` / `README-UA.md` | Описание, установка, сборка, предупреждения (загрузки живут, пока жив браузер). |
| `CHANGELOG.md` | Keep a Changelog; верхняя запись 1.0.0. |
| `.gitignore` | `dist/build/*`, `*.pem`, `node_modules/`. |
| `.prettierrc` | single quotes, CRLF, organize-imports + tailwindcss плагины. |

### 4.2 `src/service-worker/` — ядро

| Файл | Разбор |
|---|---|
| `background.ts` (120) | Точка входа SW. Импортирует `global-scope-init`, монтирует обработчики через `eventBus.mountHandler`: `runtime.onConnect` (порт логов), `runtime.onInstalled`, `runtime.onMessage`, `alarms.onAlarm`, `storage.onChanged`, `DBDeletedEvent` (CustomEvent), `LogCreate` (CustomEvent). Регистрирует источники `downloads.onChanged` / `downloads.onCreated`. Открывает БД (`doDatabaseStuff`), читает настройки, строит `DownloadManager`, вызывает `stabilizeInsideState()` (аудит состояния), при настройке — вешает `downloads.onDeterminingFilename` (защита имени файла от других расширений). Определяет dev-сборку (версия кончается на `.1`) и заменяет иконку. `main().catch(errorHandler).finally(() => eventBus.setReady())`. |
| `handlers.ts` (159) | Роутер входящих сообщений `messageHandler`: `getFileSize` → `getOriginalUrlItem`; `updateVideoInfo` → `updateVideoInfo`; `trigger` → `downloadManager.initNewDownload`; `requestToRestoreState` → `stabilizeInsideState({permissionToRestore})`; `clearCache`; `stopAllDownloads`; `DBDeleted` → `restoreDBHandler`; `deleteExtensionData` → `clearExtensionData`. Плюс: `alarmHandler` (повторы `repeat-download-<loadItemId>-<fileId>`), `storageChangeHandler` (обновляет `globalThis.settings`), `onConnectHandler` (порт → `logCreate`), `newLogHandler`, `restoreDBHandler`, `clearExtensionData` (полный вайп: off messageHandler → cancel all → abort fetches/readers → пауза 3 c → clear all storage → dropDatabase → broadcast `DBDeleted` → пересоздать БД), `errorHandler`. |
| `updates.ts` (?) | `onInstalledHandler`: install → открыть страницу настроек; update → цепочка миграций: `1.0.0.57` (clear storage.local), `1.0.0.59` (cancelAllDownload + clear session + фикс шаблонов имён для uk), `migrateToNextVersion` (clear session + clearCache). Сравнение версий — `compareVersions` из `lib/utils`. |
| `load-manager/constructor.ts` | Синглтон `DownloadManager`: `[buildDownloadManager, getDownloadManager]` через замыкание. `getDownloadManager()` может вернуть `undefined` до первого `build`. |
| `load-manager/core.ts` (1061) | **Сердце системы.** `class DownloadManager`. Содержит `ResourceLockManager` и `QueueController`. Методы: `stabilizeInsideState` (аудит при старте; при первом запуске чистит кэш, ищет «сломанные» FileItem/LoadItem, запрашивает у пользователя разрешение на восстановление через `storage.session.needToRestoreInsideState`), `initNewDownload` (точка входа: защита от двойного клика по `urlDetail:<movieId>`, `initializeNewDownload` → `startNextDownload`), `startNextDownload` (цикл выдачи задач из очереди, локи с priority 10), `prepareDownload` (перевод LoadItem в `InitiatingDownload`, `siteLoader.build`, `createAndGetFile`, выбор «главного» файла по `settings.fileTypePriority`, получение URL), `launchFileDownload` (soft-lock на время старта загрузки, `browser.downloads.download` с таймаутом `settings.downloadStartTimeLimit`, обработка «прервано отменой», запись downloadId), `callDownloadWithTimeout`, `getActiveDownloadItemFromDownloadId`, `findLastFileItemByDownloadId` (сопоставление downloadId ↔ FileItem, в т.ч. по URL и по дате при коллизиях после очистки истории), `handleCreateEvent` (downloads.onCreated), `handleDownloadEvent` (downloads.onChanged: paused/resumed/complete/error; спецобработка `USER_CANCELED`, `FILE_NO_SPACE` → отмена всего), `handleDeterminingFilenameEvent` (синхронный suggest имени, только Chrome), `createDownload`, `successDownload` (цепочка файлов video→subtitle через `dependentFileItemId`), `cancelAllDownload`, `cancelOneDownload` (в т.ч. удаление файла, если имя не успело примениться), `pauseDownload`/`unpauseDownload`, `attemptNewDownload` (ретраи до `maxFallbackAttempts`), `breakDownloadWithError`, `repeatDownload` (создаёт alarm `repeat-download-...`), `executeRetry` (по alarm'у, с `useCache:false`). |
| `load-manager/queue.ts` (597) | `class QueueController`: очередь и активные загрузки как observable-сторы (`createObservableStore`) поверх `storage.local` ключей `queue` и `activeDownloads`. Методы: `initializeNewDownload` (повторный `trigger` на тот же фильм = отмена его активных загрузок + уведомление `popup_messageBroker_userBreak`), `findActiveDownloads` (по индексу `movie_id`), `stopDownload`, `skipDownload`, `deleteDownloadGroup` (massLock → отмена файлов → массовая запись статусов), `cancelDownload`, `createNewDownloads` (транзакция по `urlDetail`/`loadConfig`/`loadStorage`; `urlDetail.loadRegistry.push(createdAt)`), `makeLoadItemArray` (разворачивает `range` сезонов в отдельные LoadItem), `getNextObjectIdForDownload` (мьютекс + лимиты `maxParallelDownloads` / `maxParallelDownloadsEpisodes`; FIFO внутри массива-группы), `successLoad`, `failLoad` (обновляет статусы LoadItem и файлов; применяет `settings.actionOnNoQuality/actionOnNoSubtitles/actionOnLoadVideoError/actionOnLoadSubtitleError`). |
| `load-manager/inside-state-controller.ts` (189) | Аудит состояния: `isFirstRunExtension` (флаг в `storage.session`), `groupDownloadsByLoadItemId`, `sortChain` (цепочка video→subtitle), `findSomeFilesFromLoadItemIdsInDB` (скан курсором), `getActiveFileItem` (выбирает «целевой» файл цепочки), `findBrokenFileItemInActiveDownloads` (сверка со `browser.downloads.search`, strictMode для старта браузера), `findBrokenLoadItemInActiveDownloads` (set difference). |
| `network-layer/index.ts` | Реэкспорт публичного API слоя: `abortAllFetches, clearCache, fetchVideoData, getOriginalUrlItem, getQualityFileSizes, stopAllVideoReader, updateVideoInfo`. |
| `network-layer/cache.ts` | Кэш в сторе `cacheStorage` (TTL 15 мин, индекс `time_of_death`): `getFromCache(url + '&' + body)`, `setInCache`, `deleteOldCacheItems`, `clearCache`. |
| `network-layer/modify-fetch.ts` | `makeModifyFetch({sourceUrl})` — обёртка над `fetch`, которая на время запроса добавляет session-правило `declarativeNetRequest` (заголовки `Referer`, `Origin`, `Sec-Fetch-Site`, `Sec-Fetch-Dest` — для медиа cross-site/video, иначе same-origin/empty), таймаут 10 c, AbortController-реестр; `abortFetch`/`abortAllFetches`, `combineSignals`, `addHeaderModificationRule`/`removeHeaderModificationRule`. **Это ключевой «костыль браузера», на сервере заменяется обычной установкой заголовков в HTTP-клиенте.** |
| `network-layer/page-bridge.ts` | `requestDirectlyFromPage`: выполняет запрос **со страницы** — `browser.scripting.executeScript({func: netRequest, args: [path, url, body, method]})`; `netRequest` создаёт `<script src=.../netRequests.js>` с `dataset.args`, ждёт `dataset.result` (poll 10 мс, таймаут 5 c). Перед этим проверяет живость вкладки (`browser.tabs.get`) и при необходимости ищет вкладку по URL (`browser.tabs.query({})`), иначе уведомление `popup_messageBroker_PageHasBeenClosed` и throw. Используется только для обхода Cloudflare. |
| `network-layer/video-file-helpers.ts` | `fetchVideoData` — **резолв ссылок**: POST `{origin}/ajax/get_cdn_series/?t=<ts>` с телом `URLSearchParams(QueryData)`, заголовки `X-Requested-With`, `Accept`, `Content-Type: x-www-form-urlencoded`, `credentials:'include'`; при `403` — уведомление `popup_messageBroker_CloudflareProtect` и фолбэк `fetchFromPage` (плюс флаг `cloudflare_protected: true`); кэш в `cacheStorage`; `probeVideoFile` — через `mediabunny` (`Input` + `UrlSource` с кастомным fetchFn) читает размер (`getSize`) и, при `settings.getRealQuality`, разрешение (`getPrimaryVideoTrack().codedWidth/Height`); уведомления `newFileSize` / `newVideoResolution` в runtime; `stopAllVideoReader` / `stopVideoReader` (dispose активных ридеров). |
| `network-layer/url-info-retrieval.ts` | `getOriginalUrlItem({urlsList, siteUrl, onlySize, cacheDisabled})`: кэш → параллельные Range-пробы (через `probeVideoFile`) → `Promise.any` (первый успешный), остановка остальных; при полном провале `{url: first, fileSize: 0}`. `fetchVideoInfoOrWaitFor` — дедупликация одновременных проб одного URL и кэширование успешного размера. `getQualityFileSizes` — размеры по всем качествам (только mp4). |
| `network-layer/response-parser.ts` | `updateVideoInfo({data: DataForUpdate})`: вызывает `fetchVideoData`, парсит HTML-строки `seasons`/`episodes` регулярками (`data-tab_id`, `data-season_id`, `data-episode_id`) в `SeasonsWithEpisodesList`; возвращает `ActualVideoData {seasons, subtitle, streams, cloudflareProtectedIsUsed}`. |
| `site-loader/site-loader-interface.ts` | Интерфейсы `SiteLoaderInstance` (`getQueryData/getVideoData/getVideoUrl/getSubtitlesUrl/createAndGetFile/makeFilename`) и `SiteLoader` (`build`, `createLoadItem`, `createLoadConfig`, `createUrlDetails`). **Это готовый шов для серверной абстракции «источник» (site type).** |
| `site-loader/hdrezka.ts` (396) | `HDrezkaLoaderImplementation`: конструируется из LoadItem + `urlDetail` + `loadConfig` (читает IDB). `getQueryData` собирает QueryData (`get_movie` для фильмов, `get_stream` для серий). `getVideoData` (кэшируемый `serverResponse`): `fetchVideoData` → `decodeVideoURL` → `availableQualities`, `decodeSubtitleURL` → `availableSubtitles`, сохраняет в `loadStorage`. `getVideoUrl`: фильтрует URL по протоколу (`mp4` для `streaming`, `m3u8` для `hls`), проверяет размер через `getOriginalUrlItem`; если нет — при `actionOnNoQuality === 'reduce_quality'` подбирает ближайшее качество ниже; `actionOnNoSubtitles === 'skip'` и нет субтитров → null. `getSubtitlesUrl`: ищет по языку. `createAndGetFile`: создаёт FileItem('video') и/или FileItem('subtitle') в зависимости от `downloadItem.content`. `createFileItem`: имя через `makeFilename`, статус `DownloadCandidate`, `retryAttempts: 1`. `makeFilename`: подстановки `%n%, %movie_id%, %title%, %orig_title%, %translate%, %translate_id%, %episode%, %episode_id%, %season%, %season_id%, %quality%, %subtitle_code%, %subtitle_lang%, %data%, %time%` → `makePathAndFilename`. Статические `createLoadItem/createLoadConfig/createUrlDetails` — фабрики записей БД из `Initiator`. |
| `site-loader/factory.ts` | `Record<SiteType, SiteLoader>` — сейчас только `{hdrezka: HDrezkaLoader}`. Расширяемая точка для новых сайтов/серверных загрузчиков. |

### 4.3 `src/lib/` — библиотеки и домен

| Файл | Разбор |
|---|---|
| `types.ts` (397) | **Единый домен-контракт.** `MessageType` и `Message<T>`, `PageType`, `MovieInfo`, `SubtitleInfo`, `VoiceOverInfo`, `Season/Episode/SeasonsWithEpisodesList`, `QualityItem/QualityDetail/QualitiesList`, `URLItem/URLsContainer/RequestUrlSize`, `QueryData` (`FilmQueryData | SerialQueryData | UpdateTranslateData`), `ResponseVideoData` (ответ ajax сайта; `url`, `quality`, `subtitle*`, `seasons`, `episodes`, `premium_content`, `cloudflare_protected`), `Initiator` (все параметры задания!), `DataForUpdate`, `ActualVideoData`, `FileProgress`, `LoadStatus` (enum: DownloadCandidate, InitiatingDownload, InitiationError, Downloading, DownloadPaused, DownloadFailed, DownloadSuccess, StoppedByUser), `ContentType` (video/subtitle/both), `LoadProtocol` (streaming/hls), `FileItem`, `LoadItem`, `LoadConfig`, `UrlDetails`, `Settings` (все настройки + значения по умолчанию заданы в `storage.ts`), `EventType`, `EventBusTypes` (типизация событий), `CacheItem`. |
| `idb-storage.ts` (206) | Схема `HDrezkaGrabberDB` v2 (см. §5) + `doDatabaseStuff()` (openDB, upgrade: createDBv0 + migrateToV1), `dropDatabase`, `migrateToV1` (loadProtocol/useCloudflareBypass/tabId; `retryAttempts===0 → downloadId=1`; сортировка availableQualities по весу), утилита `updateStoreValues` (курсор). |
| `storage.ts` (126) | `getFromStorage`/`setToStorage` (storage.local), `createDefaultSettings()` (полный дефолтный `Settings`), `getSettings()` (создаёт дефолты при первом запуске), `loadSessionStorageSave(tabId)`/`saveSessionStorage` (session, ключ `t-<tabId>`), `saveInStorage` (debounce 150 мс, батч-запись), `createObservableStore` (прокси-состояние + автосохранение). |
| `link-processing.ts` (117) | Парсинг ссылок hdrezka: `clearTrash` (вырезает мусорные вставки, `atob`), `decodeVideoURL` (строка `[quality]url or url2,...` → `QualitiesList`), `decodeSubtitleURL` (`[lang]url.vtt` + `subtitle_lns` → `Subtitle[]`), `getQualityWeight`/`sortQualityItem` (K→pixels ≈ ×630), `parseQuality` (премиум `>1080p Ultra<`), `isMp4Url`/`isM3u8Url`. **Чистая логика — кандидат в shared-ядро.** |
| `filename-maker.ts` (95) | `Replacements` (все плейсхолдеры), `makePathAndFilename` (шаблон из настроек → папка `HDrezkaGrabber/` + опционально папка сериала, расширение `.mp4`/`.vtt`, `replaceAllSpaces`), `cleanTitle` (отрезает альтернативные названия, чистит символы), `removeBadSymbols` (запрещённые в Windows символы), `extractFilename`. **Чистая логика.** |
| `utils.ts` (126) | `cn` (clsx+twMerge), `IS_FIREFOX/IS_EDGE/IS_OPERA`, `sliceSeasons` (диапазон серий, спец-значения `-1`/`-2`), `hashCode`, `loadIsCompleted` (терминальные статусы), `formatBytes`, `compareVersions`. |
| `global-scope-init.ts` | «Говнокод on/off»: кладёт в `globalThis` `browser`, `eventBus`, `logger`, `messageBroker`. Импортируется первым во всех точках входа. |
| `event-bus/event-bus.ts` (260) | `BufferedEventBus`: `on/off`, `addMessageSource` (подписка на `browser.*.onX` либо `EventTarget`), `mountHandler`, буферизация событий до `setReady()` (важно: при старте SW события копятся, чтобы не потерять `onMessage` до инициализации), `callHandlersAndCollect`, спец-обработка `runtime.onMessage` (sendResponse-семантика, возврат `true` для async-ответа). |
| `event-bus/{types,event-bus-interface,index}.ts` | Типы шины (`EnsureParamsMatch` — компайл-тайм проверка совпадения сигнатур источника и подписчика) и интерфейс. |
| `logger/logger.ts` (189) | `Logger`: уровни CRITICAL..DEBUG, `attachMetadata` (sessionId/traceId/targetKey), `emit` (ждёт `settings`, резолвит source map, шлёт `LogMessage`), `sendLogMessage` (порт `runtime.connect` из страниц; `CustomEvent('LogCreate')` в SW), `getCallerInfo` (стековый парс `chrome-extension://...`), `getStackTrace` через `SourceMapParser`. |
| `logger/background-logger.ts` | `logCreate` → `saveLogToDB` с debounce 200 мс: `printLog` в консоль + запись в `logStorage` + TTL-очистка (`settings.logMessageLifetime`). `clearDebounceTimer`. |
| `logger/source-map.ts` (182) | Самописный VLQ-парсер source map: `getOriginalPosition`, `getOriginalURL`, `normalizeStackTrace`. Нужен для читаемых стектрейсов в dev-сборках. |
| `logger/{types,decorator,index}.ts` | `LogLevel`, `LogMessage`, `LoggerEventType`; декоратор `@attachTraceId()` (проставляет traceId в `logger` первого аргумента-объекта); реэкспорты. |
| `notification/message-broker.ts` (150) | `MessageBroker`: `sendMessage(movieId, notification)` — через `runtime.sendMessage({type:'setNotification'})`, при неудаче CustomEvent `NotificationEvent`, при неудаче — «потерянные уведомления» в `storage.session['lost-notifications']`; `trackNotifications` (popup подписывается и ответчает `'ok'`); `getNotificationsFromStorage`/`clearNotificationsFromStorage`. `PopupNotification {stackable, message, type: error|critical|warning|info|success, unique?, closable?}`. |
| `resource-lock-manager/resource-lock-manager.ts` | `ResourceLockManager` — статический реестр `Map<'<type>:<id>', MutexWithSoftLock>`; `lock/unlock/massLock/massUnlock/isLocked/run/markAsSoftLock`. Целевые ресурсы: `urlDetail:<movieId>`, `loadStorage:<loadItemId>`, `cancelAll:undefined`. |
| `resource-lock-manager/async-mutex.ts` | `Mutex` на приоритетной очереди (priority desc, createdAt asc), `acquire/runExclusive/release/cancel/isLocked`. |
| `resource-lock-manager/mutex-with-soft-lock.ts` | `MutexWithSoftLock` — «мягкий лок»: задача может быть помечена soft-lock (например, на время старта загрузки браузером) и либо дождаться, либо быть вытесненной задачей с большим приоритетом (тогда `Releaser` вернёт `wasInterrupted=true` — используется для отмены стартующей загрузки). |
| `resource-lock-manager/{mutex-interface,index}.ts` | Интерфейсы и реэкспорты. |

### 4.4 `src/app/` — UI-слой

| Файл | Разбор |
|---|---|
| `App.tsx` | Generic-обёртка `<App<T>>`: `ErrorBoundary` → `AsyncContextProvider` → `TooltipProvider` → children. |
| `providers/AsyncContextProvider.tsx` | Единственный провайдер: вызывает `asyncInitFunction(setInitData)`, пока данных нет — рендерит `null`, затем даёт их через `Context`. Поддерживает промежуточные `setInitData` (используется popup для обновления session-состояния). |
| `hooks/popup/useInitData.ts` | Первичная загрузка DownloadScreen: `getMovieInfo(tabId)` (extraction) → `getVoiceOverList` → `getSeasons`; выбирает активную озвучку; шлёт `updateVideoInfo` (SW) и раскладывает `ActualVideoData` по Redux-слайсам. |
| `hooks/popup/useChangeVoiceOver.ts` | При смене озвучки — `updateVideoInfo` с `action: get_episodes`/`get_movie`, обновляет сезоны/качества/субтитры, при ошибке откатывает выбор и шлёт `popup_error_update_voiceover`. |
| `hooks/popup/useChangeRangeEpisodes.ts` | При смене диапазона — `updateVideoInfo` с `action: get_stream` для первого эпизода диапазона, чтобы получить актуальные качества/субтитры; откат границ при ошибке. |
| `hooks/popup/useTrackingCurrentProgress.ts` | Прогресс одного файла: интервал 150 мс, `FileItem` из IDB → `browser.downloads.search({id})` → `bytesReceived/totalBytes`. Синглтон-фетчер с кэшем. |
| `hooks/popup/useTrackingTotalProgressForMovie.ts` | Агрегат прогресса фильма: читает `activeDownloads`/`queue` из storage.local + LoadItem/LoadConfig из IDB; подписка на `storage.onChanged`; отдаёт `{fileProgressInPercents, completedLoads, totalLoads}`. |
| `hooks/logger/useUpdateLogArray.ts` | Данные таблицы логов: интервал (250 мс Chrome / 1000 мс Firefox) читает `logStorage` инкрементально по `timestamp`; лимит отображения 100/500. |
| `hooks/settings/useInputCopyAndPasteHandlers.ts` | Copy/cut/paste в редакторе шаблонов имён с пересчётом позиций «markup»-плейсхолдеров. |
| `hooks/settings/useInputDragHandlers.ts` | Drag&drop в том же редакторе. |
| `hooks/settings/useUndoRedoHandlers.ts` | Свой `HistoryManager` (стек до 50 изменений, склейка в пределах 1 c) + Ctrl/Cmd+Z/Y. |
| `screens/Popup/initialization.ts` | **Ядро popup.** Читает settings, `needToRestoreInsideState`, текущую вкладку (`browser.tabs.query`), определяет `pageType` через `getPageType(tabId)` (scripting), открывает IDB, грузит session-состояние `t-<tabId>`, подписывается на изменения settings. Тип `PopupInitData = {pageType, needToRestoreInsideState} & RequireAllOrNone<{tabId, siteUrl, sessionStorage}>`. |
| `screens/Popup/Router.tsx` | Выбор экрана: restore-запрос / DownloadScreen (FILM|SERIAL) / DefaultScreen со заглушками (`popup_stub_*`). |
| `screens/Popup/DefaultScreen.tsx` | Заглушка + VPN-плашка + `Menu`. |
| `screens/Popup/RequestToRestoreExtensionState.tsx` | Диалог восстановления: `runtime.sendMessage({type:'requestToRestoreState', message})` + `window.close()`. |
| `screens/Popup/RestorePopupState.tsx` | Восстанавливает Redux-стор из `storage.session` и подписывает `store.subscribe` на автосохранение стора в `t-<tabId>`; ставит класс темы на `<html>`. |
| `screens/Popup/DownloadScreen/DownloadScreen.tsx` | Контейнер: `useInitData`, `useChangeVoiceOver`, `useChangeRangeEpisodes`; композиция LoadButton + NotificationField + EpisodeRangeSelector + SubtitleSelector + VoiceOverSelector + QualitySelector. |
| `.../LoadButton.tsx` | **Кнопка «Скачать» и сборка `Initiator`**: `movieId`, `tabId`, `useCloudflareBypass`, `site_url`, `load_protocol: streaming` (HLS в UI пока не выбирается), `site_type: 'hdrezka'`, `content_type` (video/subtitle/both), `film_name{localized, original}`, `range`, `voice_over`, `quality`, `subtitle{lang, code}|null`, `favs`, `timestamp`. Отправка: `runtime.sendMessage({type:'trigger', message: initiator})`. Прогресс через `useTrackingTotalProgressForMovie`. |
| `.../LoadButtonSkeleton.tsx` | Плейсхолдер кнопки с задержкой анимации 700 мс. |
| `.../QualitySelector.tsx` | Выбор качества; запрашивает `getFileSize` по каждому качеству (`Message<RequestUrlSize>`), слушает `newFileSize`/`newVideoResolution`; показывает реальное разрешение, размер (`formatBytes`), премиум-иконку; эвристика «залоченного» премиум-качества по `fileSize === 8554559`. |
| `.../VoiceOverSelector.tsx` | Список озвучек (Combobox с поиском при >12), флаги UA/KZ, премиум-метка. |
| `.../SubtitleSelector.tsx` | Чекбокс «скачивать субтитры» + выбор языка + «только субтитры». |
| `.../EpisodeRangeSelector.tsx` | Диапазон серий: сезон/эпизод «от» и «до»; спец-значения «до конца сезона» (`-1`) и «до конца сериала» (`-2`); `sliceSeasons` → `range`. |
| `.../NotificationField.tsx` | Лента уведомлений: поднимает «потерянные» из session storage, подписывается через `messageBroker.trackNotifications`, стеки одинаковых уведомлений, счётчик, анимация сворачивания. |
| `.../store/store.ts` | Redux store: `mainComponentReducer, serialReducer, voiceOverReducer, qualityReducer, subtitleReducer, notificationReducer`; `resetAction` для восстановления из session. |
| `.../store/*.slice.tsx` | Слайсы: `DownloadScreen` (movieInfo, currentEpisode, useCloudflareBypass), `EpisodeRangeSelector` (seasons/range/границы с каскадными инвариантами), `NotificationField`, `QualitySelector` (qualitiesList, qualityInfo, качество), `SubtitleSelector` (декодирование `SubtitleInfo`), `VoiceOverSelector`. |
| `screens/Settings/initialization.ts` | settingsInit: settings + IDB + обработка `DBDeleted`/`DBDeletedEvent` + `StorageChanged` → перерисовка через контекст. |
| `screens/Settings/Settings.tsx` | Каркас страницы: вкладки settings/faq/changelog/about (синхронизация с `location.hash`), тема, `Toaster`. |
| `screens/Settings/SettingsTab/SettingsTab.tsx` (854) | Все настройки: `updateSetting(key)` → `saveInStorage('settings', ...)`. Секции: интерфейс, поведение загрузок (лимиты, ретраи, тайминги), действия при сбоях, шаблоны имён, debug (логгер/уровень/TTL/трекинг имени файла). Кнопки: восстановить состояние, сбросить настройки, очистить кэш, остановить загрузки, очистить историю, удалить все данные — каждая через `ConfirmationModal` и `runtime.sendMessage`. **Известный баг:** `actionOnLoadVideoError` записывается через несуществующий ключ `actionOnLoadError` (значение не сохраняется). |
| `screens/Settings/SettingsTab/{ConfirmationModal,SettingsComponets,FilenameComponentData,FilenameTemplateInput,FilenameTemplateComponent}.tsx` | Модалка подтверждения (portal + `inert`), презентационные обёртки секций, данные редактора шаблонов (плейсхолдеры/готовые шаблоны/превью), сам редактор на `react-mentions` (markup ↔ массив частей), обвязка с превью и `makePathAndFilename`. |
| `screens/Settings/{FAQTab,AboutTab,ChangeLogTab}.tsx` | FAQ-аккордеон (9 вопросов), About (версия из `runtime.getManifest`, ссылки на сторы), Changelog (fetch `CHANGELOG.md` из пакета, regex-парсер). |
| `screens/Logger/initialization.ts` | Аналог settingsInit для страницы логов. |
| `screens/Logger/Logger.tsx` | Каркас: realtime/stable режимы, загрузка логов из файла, `DataTableFeatures` + `DynamicTable`, экспорт/импорт логов. |
| `screens/Logger/columns.tsx` | Колонки TanStack: timestamp (формат + копирование), level (фасетный фильтр), context, message (ObjectInspector), location, sessionId, traceId, targetKey (из metadata). |
| `screens/Logger/{DownloadLogsButton,UploadLogsButton}.tsx` | Экспорт логов в `.json.gz` (pako) и импорт файла. |

### 4.5 `src/components/`

| Файл | Разбор |
|---|---|
| `data-table/Table.tsx` | Примитивы таблицы (Table/Header/Body/Row/Head/Cell) с Tailwind и sticky-ячейками. |
| `data-table/DataTable.tsx` (364) | `RealtimeTable` (автоскролл вниз, resize-колонки, пустой результат → `ui_noResults`) и `StableTable` (сортировка, фильтры, виртуализация `@tanstack/react-virtual`, восстановление позиции скролла). |
| `data-table/DynamicTable.tsx` | Переключатель Realtime/Stable (Realtime скрывается через React `Activity`, не размонтируясь). |
| `data-table/FeaturesContext.tsx` | `DataTableFeatures` (searchBy, allowRegex) + `useDataTableFeatures`. |
| `data-table/Filters.tsx` | Фасетные фильтры, фильтр по значению ячейки, `DefaultFilterValueInput`/`FacetedFilterValueInput`. |
| `data-table/GlobalFilterComposer.tsx` | Конструктор составного фильтра (AND/OR, группы, условия, skip) порталом в `#global-filter`. |
| `data-table/globalFilter.ts` | Модель `FilterGroup`/`FilterCondition` + предикат `buildGlobalFilter`. |
| `data-table/{HeaderCell,Toolbar}.tsx` | Ручка ресайза колонки; тулбар (счётчик строк, поиск с regex-режимом, видимость колонок). |
| `ui/*.tsx` | Дизайн-система на `@base-ui/react`: `Button`, `Checkbox`, `Combobox`, `Dropdown`, `Input`, `OutsideLink`, `Popover`, `RevealAnimation`, `SplitElement`, `Toggle`, `Tooltip`. |
| `CircularProgressBar.tsx`, `CopyButton.tsx`, `ErrorFallback.tsx`, `Layout.tsx`, `Menu.tsx`, `Panel.tsx`, `SimpleTabs.tsx` | Круговой прогресс загрузки (с кнопкой отмены), копирование в буфер, fallback ошибок, каркас попапа, меню (настройки/логгер через `browser.windows.create`), панель, вкладки. |
| `icons/*.tsx` (13 файлов) | SVG-иконки: брендовые (Download, Cog, Premium, GitHub), браузеры (Chrome/Edge/Firefox/Opera), флаги (UA/KZ), анимации (AnimatedCheck, AnimatedLoader, LoadAnimation). |

### 4.6 `src/extraction-scripts/` — чтение страницы сайта

| Файл | Разбор |
|---|---|
| `extractPageType.ts` | `getPageType(tabId)`: `scripting.executeScript` (func без args) — regex по `sof.tv.*(initCDNMoviesEvents|initCDNSeriesEvents)` и DOM-признаки; результат `PageType` (FILM/SERIAL/TRAILER/LOCATION_*/UNAVAILABLE/DEFAULT/ERROR). |
| `extractMovieInfo.ts` | `getMovieInfo(tabId)`: executeScript + инжект `extractMovieInfo.js` (из-за CSP), таймаут 1000 мс; результат `MovieInfo` (data/quality/filename/url). |
| `InjectionScripts/extractMovieInfo.js` | Работает в контексте страницы. Парсит конфиг плеера `sof.tv.*(...)`: `action` (get_movie/get_stream), `id`, `translator_id`, `is_camrip/is_ads/is_director`, `season/episode`, `favs`; активную озвучку `.b-translator__item.active`; название `.b-post__title h1` / `.b-post__origtitle`; качество через `CDNPlayer.api('quality')`. |
| `extractVoiceOverList.ts` | `getVoiceOverList(tabId)`: список `.b-translator__item` (id, title, флаг, премиум, camrip/ads/director) + фолбэк «В переводе:» из `.b-post__info`; локализация служебных title (`popup_translate_*`) на стороне расширения. |
| `extractSeasons.ts` | `getSeasons(tabId, pageType)`: только для SERIAL — парсит `#simple-episodes-tabs` → `SeasonsWithEpisodesList`. |
| `InjectionScripts/netRequests.js` | Выполняет `$.ajax` страницы (jQuery самой страницы) с `dataset.args = {url, body, method}`, пишет `dataset.result`. Используется для обхода Cloudflare (`fetchFromPage`). |

### 4.7 `src/html/`, `src/_locales/`, `src/img/`

| Файл | Разбор |
|---|---|
| `popup.html` + `popup.tsx` | Точка входа попапа: `global-scope-init` → рендер `Provider(store) → Layout → App(popupInit) → RestorePopupState → Router`; регистрация источников событий (`StorageChanged`, `DBDeletedMessage/Event`, `NotificationMessage/Event`). |
| `settings.html` + `settings.tsx` | Точка входа настроек: `App(settingsInit) → Settings`. |
| `logger.html` + `logger.tsx` | Точка входа логов: `App(loggerInit) → Logger`. |
| `global.css` (210) | Tailwind v4 + CSS-переменные тёмной/светлой тем, кастомные анимации, утилиты. |
| `_locales/{en,ru,uk}/messages.json` | По 266 ключей: `settings_*` (171), `popup_*` (41), `logger_*` (25), `time_*` (21), `ui_*` (7), `manifest_description`. TS-типизация ключей — по ru-файлу (`global.d.ts`). |
| `img/icons/{prod,dev}/*.png` | 16–512 px иконки; `dev`-иконка ставится при dev-сборке. |

---

## 5. Модель данных

### 5.1 IndexedDB `HDrezkaGrabberDB` (версия 2)

| Стор | Ключ | Индексы | Что хранит |
|---|---|---|---|
| `urlDetail` | `movieId` | `movie_id` | `UrlDetails`: `{movieId, siteUrl, filmTitle{localized,original}, loadRegistry: number[]}` — «страница фильма» и история запусков (createdAt конфигов). |
| `loadConfig` | `createdAt` | `config_id`, `load_item_ids` (multiEntry) | `LoadConfig`: `{tabId, useCloudflareBypass, voiceOver, quality, subtitle, favs, loadItemIds[], loadProtocol, createdAt}` — параметры одного «клика Скачать». |
| `loadStorage` | autoincrement `id` | `load_id`, `movie_id` | `LoadItem`: `{id, siteType, movieId, season, episode, content, availableQualities, availableSubtitles, status}` — одна единица работы (фильм или один эпизод). |
| `fileStorage` | autoincrement `id` | `file_id`, `download_id`, `load_item_id` | `FileItem`: `{id, fileType: video\|subtitle, relatedLoadItemId, dependentFileItemId, downloadId, fileName, url, saveAs, retryAttempts, status, createdAt}` — файл и его цепочка (video → subtitle). |
| `logStorage` | autoincrement `id` | `log_id`, `timestamp` | `LogMessage & {id}` — журнал, TTL по `settings.logMessageLifetime`. |
| `cacheStorage` | `timeOfDeath` | `key`, `time_of_death` | `CacheItem {key, timeOfDeath, data}` — кэш ответов ajax (TTL 15 мин) и размеров файлов. |

Связи: `UrlDetails 1—N LoadConfig` (через `loadRegistry`) → `LoadConfig 1—N LoadItem` (через `loadItemIds`) →
`LoadItem 1—N FileItem` (через `relatedLoadItemId`); `FileItem.dependentFileItemId` — следующий файл цепочки.

### 5.2 `browser.storage` (ключи)

| Область | Ключ | Тип | Кто пишет/читает |
|---|---|---|---|
| local | `settings` | `Settings` | SettingsTab, `getSettings`, storageChangeHandler |
| local | `queue` | `(number | number[])[]` | QueueController (observable store) |
| local | `activeDownloads` | `number[]` | QueueController |
| local | `queue`/`activeDownloads` | — | `useTrackingTotalProgressForMovie` (чтение) |
| session | `needToRestoreInsideState` | boolean | DownloadManager / popup |
| session | `isFirstRun` | boolean | inside-state-controller |
| session | `t-<tabId>` | сериализованный Redux-стор | RestorePopupState / popup initialization |
| session | `lost-notifications` | `Record<movieId|'*', PopupNotification[]>` | MessageBroker |

### 5.3 Redux (только popup)

`store.ts` + 6 слайсов (см. §4.4). Стор целиком сериализуется в `storage.session` по ключу
`t-<tabId>` — это механизм «попап можно закрыть и открыть, состояние сохранится».

---

## 6. Ключевые сценарии (как всё работает по шагам)

### 6.1 Старт расширения (service worker)

```
browser запущен
 → background.ts: mountHandler'ы (onMessage/onInstalled/onAlarm/onConnect/storage.onChanged/downloads.*)
 → doDatabaseStuff() (IDB v2 + миграции)
 → getSettings() (или дефолты)
 → buildDownloadManager() → QueueController.build() (queue/activeDownloads из storage.local)
 → stabilizeInsideState(): isFirstRun? clearCache : —; поиск broken FileItem/LoadItem;
    если сломано: первый запуск → needToRestoreInsideState=true (спросим пользователя),
    иначе permissionToRestore → перезапуск загрузок / отмена всех
 → eventBus.setReady()  // разблокирует буферизованные события
```

### 6.2 Открытие попапа на странице фильма

```
popup/initialization.ts:
 settings ← storage.local
 tabs.query(active,currentWindow) → tabId, siteUrl
 getPageType(tabId) → PageType                (scripting, DOM)
 pageType==='ERROR' && splitViewId → SPLIT_VIEW
 indexedDBObject ← doDatabaseStuff()
 sessionStorage ← storage.session['t-<tabId>']
 → Router: DownloadScreen
DownloadScreen:
 useInitData: getMovieInfo → getVoiceOverList → getSeasons   (scripting)
   → runtime.sendMessage('updateVideoInfo', {tabId, siteURL, movieData})
       SW: fetchVideoData → POST /ajax/get_cdn_series/  (куки + DNR-заголовки; 403 → через страницу)
       → парсинг seasons/episodes → ActualVideoData
   → Redux: qualities/subtitles/seasons/vo/quality
```

### 6.3 Старт загрузки (клик «Скачать»)

```
LoadButton: собрать Initiator → runtime.sendMessage({type:'trigger', message})
SW messageHandler → DownloadManager.initNewDownload:
  lock urlDetail:<movieId> (если уже залочен — выход: защита двойного клика)
  → QueueController.initializeNewDownload:
      если есть незавершённые загрузки этого фильма → удалить их + уведомление userBreak
      иначе createNewDownloads: urlDetail (создать/дополнить loadRegistry) +
        LoadConfig + LoadItem[] (по range) → queue.push(ids)
  → startNextDownload (цикл, пока очередь и лимиты позволяют):
      QueueController.getNextObjectIdForDownload (мьютекс; лимиты maxParallelDownloads /
        maxParallelDownloadsEpisodes; берёт первый id из группы)
      → lock loadStorage:<id> (priority 10)
      → prepareDownload:
          статус InitiatingDownload; siteLoader.build(loadItem)
          createAndGetFile → FileItem(video) и/или FileItem(subtitle) (dependentFileItemId)
          targetFile.url ← getVideoUrl/getSubtitlesUrl
              getVideoData: POST /ajax/get_cdn_series/ (кэш 15 мин)
              decodeVideoURL → выбрать quality (или reduce_quality)
              getOriginalUrlItem: Range-проба размера (или из кэша)
          → launchFileDownload
```

### 6.4 Скачивание файла и завершение

```
launchFileDownload:
 markAsSoftLock(loadStorage:<id>)      // отменяемая «мягкая» блокировка
 browser.downloads.download({url, filename, saveAs:false}) с таймаутом downloadStartTimeLimit
   timeout/ошибка → attemptNewDownload (InitiationError → ретрай или failLoad)
   успех → downloadId в FileItem → unlock
handleCreateEvent (downloads.onCreated, state=in_progress):
  найти FileItem по downloadId/URL → Downloading (и LoadItem → Downloading)
handleDownloadEvent (downloads.onChanged):
  paused=true → DownloadPaused (+pause), false → Downloading (+resume)
  state=complete → successDownload:
      если dependentFileItemId (второй файл цепочки) → получить его URL → launchFileDownload
      иначе → queue.successLoad + unlock + startNextDownload
  error=USER_CANCELED → cancelOneDownload (и удалить файл, если имя не совпало)
  error=FILE_NO_SPACE → cancelAllDownload + уведомление DiskFull
  прочие error → attemptNewDownload → repeatDownload (alarm repeat-download-<loadId>-<fileId>,
      задержка timeBetweenDownloadAttempts, до maxFallbackAttempts)
```

### 6.5 Прогресс и уведомления

- Одиночный файл: popup-хук → `browser.downloads.search` (байты/проценты).
- Итог по фильму: «сколько LoadItem завершено/в работе» из IDB + `storage.onChanged`
  (`queue`/`activeDownloads`).
- Уведомления: SW → `runtime.sendMessage({type:'setNotification'})` → popup;
  если popup закрыт — «потерянные» уведомления в `storage.session`, popup их поднимет
  при следующем открытии.

### 6.6 Логи

```
любой контекст: logger.info(...)
  страницы → runtime.connect() port → SW onConnectHandler → logCreate
  SW      → CustomEvent('LogCreate') → newLogHandler → logCreate
logCreate → debounce 200 мс: printLog(консоль) + put в logStorage + TTL-очистка
logger.html: useUpdateLogArray инкрементально читает logStorage
```

---

## 7. Внешние контракты

### 7.1 Внутренние сообщения (`Message<T>` / `MessageType`)

| type | Направление | Payload | Обработчик |
|---|---|---|---|
| `trigger` | popup → SW | `Initiator` | `DownloadManager.initNewDownload` |
| `updateVideoInfo` | popup → SW | `DataForUpdate` | `network-layer/response-parser.updateVideoInfo` |
| `getFileSize` | popup → SW | `RequestUrlSize` | `getOriginalUrlItem` |
| `requestToRestoreState` | popup/settings → SW | `boolean` | `stabilizeInsideState` |
| `setNotification` | SW → popup | `{movieId, notification}` | `MessageBroker.trackNotifications`, ответ `'ok'` |
| `clearCache` | settings → SW | — | `clearCache` |
| `stopAllDownloads` | settings → SW | — | `cancelAllDownload` |
| `deleteExtensionData` | settings → SW | — | `clearExtensionData` |
| `DBDeleted` | SW → все | — | переоткрытие IDB |
| `newFileSize` | SW → popup | `{url, fileSize}` | QualitySelector (асинхронные апдейты) |
| `newVideoResolution` | SW → popup | `{url, videoResolution}` | QualitySelector |

### 7.2 Внутренние события (`EventType`)

`MessageReceived`, `NotificationMessage`, `NotificationEvent`, `DownloadCreated`
(`downloads.onCreated`), `DownloadEvent` (`downloads.onChanged`), `ScheduleEvent`
(`alarms.onAlarm`), `StorageChanged`, `DBDeletedMessage`, `DBDeletedEvent`,
`ExtensionInstalled`, а также `LogCreate` / `LogConnect` (`LoggerEventType`).

### 7.3 Внешний HTTP сайта (то, что делает `fetchVideoData`)

```
POST {origin}/ajax/get_cdn_series/?t=<unix_ms>
Headers:
  Accept: application/json, text/javascript, */*; q=0.01
  X-Requested-With: XMLHttpRequest
  Content-Type: application/x-www-form-urlencoded; charset=UTF-8
  Referer/Origin/Sec-Fetch-* — подставляются DNR-правилом (Referer = страница фильма)
Body (urlencoded):
  film:  {action: 'get_movie',   id, translator_id, is_camrip, is_ads, is_director, favs}
  serial:{action: 'get_stream',  id, translator_id, season, episode, favs}
  episodes:{action: 'get_episodes', id, translator_id, favs}
Cookies: браузерные (credentials: 'include')
Ответ ResponseVideoData: {success, url (строка качеств), quality, thumbnails,
  subtitle, subtitle_def, subtitle_lns, seasons, episodes, premium_content,
  cloudflare_protected?}
403 → признак Cloudflare → фолбэк «через страницу» (InjectionScripts/netRequests.js)
```

Формат строки качеств и субтитров — см. `lib/link-processing.ts`
(`[360p]https://...mp4 or https://...mp4,[720p]...`, `[Русский]https://...vtt`).

### 7.4 DOM-контракт со страницей hdrezka (для extraction)

- `sof.tv.initCDNMoviesEvents(...)` / `sof.tv.initCDNSeriesEvents(...)` в HTML —
  главный признак типа страницы и источник `id`, `translator_id`, `season`, `episode`,
  `favs`, флагов camrip/ads/director.
- `.b-translator__item[data-translator_id]` (+ `.active`) — список/активная озвучка.
- `#simple-episodes-tabs`, `.b-simple_episodes__list`, `.b-simple_episode__item`
  (`data-season_id`, `data-episode_id`) — сезоны/серии.
- `.b-post__title h1`, `.b-post__origtitle` — названия.
- `CDNPlayer.api('quality')` — текущее качество плеера.
- Глобалы страницы `CDNPlayer`, `jQuery/$`, `sof` — недоступны из изолированного мира.

---

## 8. Карта зависимостей от `browser.*` (что заменять при распиле)

| API | Где | Зачем | Серверная замена |
|---|---|---|---|
| `downloads.download/search/pause/resume/cancel/erase` | `load-manager/core.ts`, `queue.ts`, `inside-state-controller.ts`, `useTrackingCurrentProgress.ts` | Само скачивание файлов + прогресс/пауза/отмена | Свой downloader (HTTP Range, докачка, HLS через ffmpeg; прогресс в БД; управление через API) |
| `downloads.onCreated/onChanged/onDeterminingFilename` | `background.ts`, `core.ts` | События жизненного цикла загрузки, подмена имени файла | Внутренние события downloader'а; имя задаётся сразу |
| `runtime.sendMessage/onMessage/connect` | всё ядро и UI | Внутренний RPC | REST + WebSocket (или JSON-RPC) |
| `storage.local/session/sync` | `lib/storage.ts`, `queue.ts`, `message-broker.ts`, `initialization.ts` | Настройки, очередь, активные загрузки, сессии, «потерянные» уведомления | PostgreSQL/SQLite + Redis; настройки — таблица; сессии popup — состояние на клиенте/сервере |
| IndexedDB (`idb`) | везде | urlDetail/loadConfig/loadStorage/fileStorage/logStorage/cacheStorage | Таблицы БД (+ Redis для кэша) |
| `scripting.executeScript` | `extraction-scripts/*`, `page-bridge.ts` | Чтение DOM сайта и обход Cloudflare через страницу | Остаётся **на клиенте**; на сервер уходит только результат |
| `declarativeNetRequest.updateSessionRules` | `modify-fetch.ts` | Подмена Referer/Origin/Sec-Fetch-* для запросов/проб | Обычные заголовки HTTP-клиента |
| `tabs.query/get` | `initialization.ts`, `page-bridge.ts` | Определение вкладки/поиск вкладки сайта | Не нужно: клиент сам знает контекст; для сервера — идентификатор задачи |
| `alarms.create/onAlarm` | `core.ts`, `handlers.ts` | Отложенные ретраи | `setTimeout`/очередь задач (BullMQ/cron) |
| `browser.i18n.getMessage/getUILanguage` | весь UI, `utils.ts` | Локализация | Клиентский i18n (JSON-словари те же 266 ключей) |
| `runtime.getManifest/getURL/openOptionsPage` | UI, логгер, updates | Версия, локальные ресурсы, миграции | Версия сервера в API/health; frontend-ассеты |
| `windows.create` | `Menu.tsx` | Открыть логгер в окне | Обычная вкладка веб-UI |
| `downloads`+`web_accessible_resources` | — | Инжект-скрипты странице | n/a |

---

## 9. Распил на «сервер + клиент»

### 9.1 Что куда переносится (и почему)

**Переносится на сервер почти без изменений (чистая логика):**

- `LoadStatus`/`LoadItem`/`FileItem`/`LoadConfig`/`UrlDetails` (`lib/types.ts`) — как домен-модели;
- `lib/link-processing.ts` (декодирование ссылок, качества, размеры);
- `lib/filename-maker.ts` (шаблоны имён, папки, очистка символов);
- `lib/utils.ts` (`sliceSeasons`, `loadIsCompleted`, `formatBytes`, `compareVersions`);
- `queue.ts` — переписать поверх БД (вместо `storage.local` observable-сторов);
- `core.ts` — state machine сохраняется, но `browser.downloads.*` заменяется на
  интерфейс downloader'а; таймауты/alarms — на планировщик;
- `site-loader/hdrezka.ts` — логика выбора качества/субтитров/имени сохраняется;
  `fetchVideoData` заменяется на серверный HTTP-клиент с заголовками (и опционально
  cookies от клиента); `createFileItem` пишет в БД вместо IDB;
- `network-layer/response-parser.ts` (парсинг seasons/episodes) — как есть;
- `network-layer/url-info-retrieval.ts` — вместо `mediabunny`/fetch-проб можно
  оставить `mediabunny` (работает в Node) или Range/HEAD-запросы; кэш → Redis;
- логгер (`lib/logger/**`) — с заменой транспорта (файл/БД вместо IDB и порта);
- `MessageBroker` — заменяется на WebSocket-события сервер → клиент.

**Остаётся на клиенте:**

- `src/extraction-scripts/**` — DOM/CDNPlayer/jQuery/CSP — только браузер;
- `page-bridge.ts` + `InjectionScripts/netRequests.js` — обход Cloudflare через
  живую вкладку (если сервер сам не умеет проходить CF);
- весь React-UI (`src/app`, `src/components`) — заменяется на веб-UI (можно
  переиспользовать компоненты почти целиком) и/или остаётся в расширении как
  тонкий клиент.

**Требует решения (развилка):**

- **Куки/session для `/ajax/get_cdn_series/`**: либо клиент передаёт серверу
  cookies (и/или результат запроса целиком), либо сервер использует
  headless-браузер/FlareSolverr, либо резолв ссылок остаётся на клиенте
  (расширение резолвит ссылку и отправляет её серверу — самый простой и
  надёжный путь, т.к. CF-сессия уже есть в браузере пользователя).
- **Сами медиа-ссылки CDN** обычно отдаются по прямым mp4-URL; сервер может
  качать их обычным HTTP-клиентом с нужными заголовками (Referer/Origin).
  Проверить на реальном файле: требуется ли Referer для скачивания (в текущем
  коде для `downloads.download` заголовки не задаются, только для fetch-проб).

### 9.2 Варианты клиента

| Вариант | Плюсы | Минусы |
|---|---|---|
| **A. Расширение как тонкий клиент (рекомендуется)** | Сохраняется вся DOM-экстракция и CF-сессия; сервер получает готовые данные (или даже готовый mp4-URL); UI можно переиспользовать; прогресс/управление через WS | Нужно переписать транспорт (`runtime.sendMessage` → HTTP/WS) и убрать локальные `downloads`/IDB-чтения прогресса |
| **B. Веб-морда без расширения** | Один UI, никаких стора браузера; ставки на сервер | Нужно решать CF и куки без браузера пользователя (FlareSolverr/headless/импорт cookies); определить тип страницы и вытащить `id/translator_id` можно только по URL + серверным парсингом HTML |
| **C. Гибрид** | Расширение как «браузерный агент» + веб-UI как основной пульт | Больше кода, но лучший UX |

Практичная схема: **сервер = очередь + резолв + скачивание + хранилище +
история/логи + API/WS; клиент = сбор параметров (расширение) + управление/прогресс
(веб-UI, который может жить и внутри расширения)**.

### 9.3 Предлагаемая структура репозитория

```
packages/
  core/      # домен: types, link-processing, filename-maker, utils, state machine,
             # интерфейс SiteResolver и интерфейс Downloader (без browser.*)
  server/    # HTTP API + WS + БД + downloader (aria2/собственный/ffmpeg) + scheduler
  client-web/# React-веб-UI (перенос src/app, src/components, _locales)
  client-ext/# расширение: extraction-scripts + отправка заданий + тонкий попап
             # (или переиспользование client-web как страницы options/popup)
```

Ключевые новые интерфейсы (сегодняшние швы `SiteLoader`, `ResourceLockManager`,
`DownloadManager` уже почти готовы к такой инверсии):

```ts
interface SiteResolver {              // было SiteLoader
  resolveTask(task: Task): Promise<ResolvedTask>;   // {videoUrl, subtitleUrl, qualities}
  createTask(initiator: TaskInitiator): Task[];
  makeFilename(...): Promise<string>;
}
interface Downloader {                // было browser.downloads
  start(req: {url, filename, headers?}): Promise<DownloadHandle>;
  pause(h): Promise<void>; resume(h): Promise<void>;
  cancel(h): Promise<void>;
  on(cb: (ev: DownloadEvent) => void): void;   // progress/complete/error
}
```

### 9.4 Черновик API (REST + WS)

```
POST   /api/v1/tasks            {Initiator}            → {taskIds: number[]}
GET    /api/v1/tasks?movieId=   → Task[]
POST   /api/v1/tasks/:id/pause | resume | cancel
POST   /api/v1/tasks/:id/retry
GET    /api/v1/queue            → очередь + активные + лимиты
GET    /api/v1/settings / PATCH → Settings
GET    /api/v1/movies/:id       → агрегат: LoadItems + FileItems + прогресс + размеры
POST   /api/v1/resolve          {QueryData, cookies?}  → ResponseVideoData (опционально)
GET    /api/v1/logs?since=      → LogMessage[]
WS     /api/v1/ws               сервер→клиент: task.progress, task.completed,
                                task.failed, queue.changed, notification, log
```

Соответствие сегодняшним сообщениям: `trigger` → `POST /tasks`;
`updateVideoInfo`/`getFileSize` → `POST /resolve` (+ позже `GET /probe`);
`requestToRestoreState`/`stopAllDownloads`/`clearCache`/`deleteExtensionData` →
`POST /system/*`; `setNotification`/`newFileSize`/`newVideoResolution` → WS-события.

### 9.5 Схема БД сервера (маппинг IDB)

| IDB стор | SQL-таблица | Примечание |
|---|---|---|
| `urlDetail` | `movies` (`movie_id` PK, `site_url`, `title_localized`, `title_original`) | `loadRegistry` → таблица `runs` или JSON-колонка |
| `loadConfig` | `load_configs` (`id` PK, `created_at`, `voice_over` JSONB, `quality`, `subtitle` JSONB, `favs`, `protocol`, `tab_id`/`client_id`) | `load_item_ids` — связь через `load_items.config_id` |
| `loadStorage` | `load_items` (`id` PK, `movie_id` FK, `season`, `episode`, `content`, `status`, `available_qualities` JSONB, `available_subtitles` JSONB) | индекс `movie_id`, `status` |
| `fileStorage` | `files` (`id` PK, `load_item_id` FK, `type`, `dependent_file_id`, `download_id`→`download_handle`, `file_name`, `url`, `retry_attempts`, `status`, `created_at`, `bytes_received`, `total_bytes`) | прогресс — колонки, не события браузера |
| `cacheStorage` | Redis (`key` → JSON, TTL 15 мин) | |
| `logStorage` | `logs` (или файлы + индекс) | TTL по настройке |

### 9.6 Подводные камни (важное для реализующего AI)

1. **Cloudflare/сессия.** Резолв ссылок сейчас возможен только с браузерными
   куками (и с фолбэком через страницу). Самый безопасный MVP: расширение
   резолвит ссылку само (`updateVideoInfo` уже возвращает `streams`/`qualities`)
   и отправляет серверу **готовые прямые URL**; сервер скачивает их.
2. **Referer/Origin для CDN.** Если CDN проверяет заголовки — сервер должен
   уметь их ставить (в расширении это делал `declarativeNetRequest`).
3. **Прямых mp4 может быть несколько** на качество (`urlsArr`); серверу стоит
   пробовать по очереди/параллельно (как `Promise.any` в `url-info-retrieval.ts`).
4. **HLS (m3u8) не реализован в UI** (`LoadButton` жёстко ставит `streaming`),
   но `LoadProtocol.hls` и фильтрация по `isM3u8Url` уже есть — сервер может
   закрыть эту дыру через ffmpeg (`-c copy`), это большой плюс серверной части.
5. **`mediabunny`** для размера/разрешения работает в браузере; в Node его
   можно использовать, но проще Range/HEAD + ffprobe — решать по месту.
6. **Имена файлов.** На сервере `saveAs`/`onDeterminingFilename`-логика не нужна;
   шаблоны должны применяться один раз, а коллизии (`uniquify`) решать самому.
7. **Лимиты и конкурентность.** `maxParallelDownloads`/`maxParallelDownloadsEpisodes`
   переносятся как есть; `ResourceLockManager` (приоритетные мьютексы) —
   переиспользуемая логика, но при многопроцессном сервере её нужно заменить
   на блокировки в БД/Redis.
8. **Восстановление состояния.** `stabilizeInsideState` важен и на сервере
   (после рестарта сервера перезапускать/помечать оборванные загрузки), но
   «спрашивать пользователя» не нужно — политику задать настройкой.
9. **`storage.session`-состояние попапа** (`t-<tabId>`, Redux) — при переходе
   на веб-UI заменить на состояние клиента (localStorage/IndexedDB) или на
   серверное `GET /api/v1/movies/:id`.
10. **Логи и source maps** — в проде sourcemap выключен; серверный логгер лучше
    сразу писать структурно (JSON) с traceId, как это уже делает `LogMetadata`.
11. **Идентификаторы downloadId** (`FileItem.downloadId`) — на сервере заменяются
    на свои handle'ы; логика «downloadId может повториться после очистки истории
    браузера» станет неактуальной.
12. **i18n** — все 266 ключей уже вынесены; для веб-UI достаточно скопировать
    `_locales/*/messages.json` и заменить `browser.i18n.getMessage` своей функцией.
13. **Прогресс.** Вместо `downloads.search` сервер должен эмитить прогресс
    (bytes/total) с разумной частотой (например, раз в 0.5–1 c) по WS.
14. **Файловая система сервера.** Нужны политики: корневая папка, шаблоны,
    санитайзинг имён (уже есть `removeBadSymbols`), права, очистка места.

### 9.7 Порядок работ (предложение)

1. Выделить `packages/core`: перенести `lib/types.ts`, `link-processing.ts`,
   `filename-maker.ts`, `utils.ts`, `site-loader-interface.ts`, `response-parser.ts`.
   Собрать `tsc` без DOM-зависимостей (почистить `settings`-глобал → прокидывать
   настройки параметром).
2. Реализовать `packages/server`: Fastify/Express + PostgreSQL (или SQLite) +
   Redis-кэш + WS (`ws`/socket.io); интерфейсы `SiteResolver` (HDrezka HTTP-клиент
   с заголовками и cookies) и `Downloader` (сначала — простой HTTP-докачиватель,
   затем HLS/ffmpeg); порт `DownloadManager`/`QueueController`/`ResourceLockManager`.
3. Расширение-агент: оставить `extraction-scripts`; `updateVideoInfo` вызывать
   локально (как сейчас) или отдавать серверу; `LoadButton` → `POST /tasks`
   с прямыми URL; убрать `browser.downloads`-прогресс, заменить WS-событиями.
4. Веб-UI: перенести `src/app` + `src/components`, заменить глобалы
   (`browser`, `settings`, `messageBroker`, `indexedDBObject`) на API-клиент и
   локальные сторы.
5. Переключить логи/уведомления/настройки на серверные; расширение оставить
   только там, где нужен DOM/CF.
6. Добавить серверные фичи, которых не было: HLS, докачка после рестарта,
   лимит скорости, расписание, библиотека файлов, раздача клиенту.

---

## 10. Известные баги и техдолг (найденные при разборе)

- `SettingsTab.tsx`: `actionOnLoadVideoError` сохраняется по ключу
  `actionOnLoadError` — настройка фактически не работает.
- `package.json` (1.0.2) опережает `CHANGELOG.md` (1.0.0).
- `LoadProtocol.hls` не выбирается в UI (в `LoadButton` жёстко `streaming`),
  m3u8-ветка `getVideoUrl` недостижима.
- `dist/make-meta.js` — обязательный шаг сборки, но лежит в `dist/`, который
  частично игнорируется (`.gitignore` игнорирует только `dist/build/*`).
- `page-bridge.netRequest`: при успешном ответе не очищается страховочный
  `setTimeout` (висит до 5 c), а при таймауте не удаляется тег `<script>`
  из DOM; интервал при таймауте очищается корректно.
- В `queue.ts` часть логов пишется через глобальный `logger`, а не переданный
  (несогласованность трассировки).
- Отсутствует тестовый фреймворк и тесты (нет `test`-скрипта); CI только собирает.

---

## 11. Глоссарий

- **SW / service worker** — фоновый процесс расширения (`background.ts`).
- **Initiator** — полный набор параметров задания, который popup отправляет в SW
  по кнопке «Скачать» (movieId, озвучка, качество, диапазон, субтитры, favs, …).
- **LoadItem** — единица работы: фильм или один эпизод (с учётом озвучки/качества
  из LoadConfig).
- **FileItem** — конкретный файл (video или subtitle), который скачивается;
  цепочка video → subtitle через `dependentFileItemId`.
- **LoadConfig** — параметры одного «клика» (общие для всех LoadItem-ов запуска).
- **UrlDetails** — страница фильма (URL, название) + реестр запусков.
- **PageType** — классификация страницы сайта (FILM/SERIAL/TRAILER/…).
- **QualitiesList** — распарсенные качества (`{[quality]: {urlsArr, isPremContent}}`).
- **ResponseVideoData** — сырой JSON-ответ ajax сайта.
- **Soft lock** — временная («мягкая») блокировка ресурса, которая может быть
  прервана более приоритетной задачей (`MutexWithSoftLock`).
- **stabilizeInsideState** — аудит и восстановление состояния после сбоя.
- **MV3/MV2** — манифесты Chrome/Firefox-версий расширения.

---

## 12. Реализованный распил: `server/` + `client-extension/`

В репозиторий добавлены две новые части (основное расширение не тронуто):

```
server/                     # Node.js + встроенный node:sqlite, БЕЗ зависимостей
  package.json              # только скрипты start/dev, engines: node >= 22.5
  src/config.js             # env-конфиг: PORT/HOST/DOWNLOAD_DIR/DB_FILE/AUTH_TOKEN/FFMPEG_PATH
  src/logger.js             # цветные логи (ANSI только в терминале, NO_COLOR), баннер сервера
  src/db.js                 # схема SQLite (tasks, settings), claimNextTask, stats, serializeTask,
                            # миграция старых шаблонов имён
  src/util.js               # buildFilename (шаблоны имён, S1E2 без нулей), sanitize, uniquify
  src/tasks.js              # prepareTask: приведение задачи к БД + имя файла по шаблону
  src/downloader.js         # пул воркеров, HTTP+Range-докачка, повторы, пауза/отмена,
                            # HLS через ffmpeg, восстановление после рестарта
  src/api.js                # REST-роутер + статика + CORS + опциональный токен
  src/index.js              # bootstrap: сброс «зависших» задач, печать LAN-адресов
  public/                   # веб-морда (ванильный JS): очередь, прогресс, настройки, форма прямой ссылки
  deploy/hdrezka-grabber-server.service  # готовый systemd-юнит (не-NixOS)
  README.md                 # запуск, CLI, NixOS, API, FAQ (m3u8, маскировка), диагностика

nix/                        # упаковка и модуль для NixOS
  package.nix               # пакет (без зависимостей: только nodejs + обёртка)
  module.nix                # services.hdrezka-grabber-server (системный юзер, каталоги,
                            # ожидание монтирований, ProtectSystem=strict, фаервол)
flake.nix                   # packages/default + nixosModules.default + overlay

client-extension/           # тонкий клиент (MV3, без сборки, чистый JS)
  manifest.json             # permissions: activeTab, scripting, storage; Chrome 111+ / FF 128+
  popup.html/css/js         # детект страницы (устойчивый разбор sof.tv.*) → озвучки → резолв →
                            # отправка задач; фолбэк серий из DOM; кнопка 🐞 (диагностика);
                            # управление загрузками (пауза/отмена/повтор/«остановить все»)
  README.md                 # установка, использование, ограничения
```

### Как это соотносится со старой архитектурой

| Старое (расширение) | Новое (сервер + клиент) |
|---|---|
| `load-manager/core.ts`, `queue.ts`, IndexedDB | `server/src/db.js` + `downloader.js` (таблица `tasks`, статусы, очередь, воркеры) |
| `browser.downloads.*` | HTTP-загрузчик с Range-докачкой, паузой, отменой, повторами; HLS через ffmpeg |
| `browser.alarms` (ретраи) | `next_attempt_at` в БД + воркеры |
| `storage.local: queue/activeDownloads` | таблица `tasks` (SELECT + UPDATE) |
| Прогресс через `downloads.onChanged` | `received_bytes/total_bytes` в БД, опрос `GET /api/state` (веб-морда и попап) |
| `MessageBroker`/уведомления | панель очереди в веб-морде и попапе |
| `filename-maker.ts` | `server/src/util.js: buildFilename` + настройки шаблонов (film/series/subtitle) |
| `site-loader/hdrezka.ts` (резолв) | `client-extension/popup.js: pageResolve` — запрос из MAIN-мира страницы |
| `extraction-scripts/*` | `pageDetect`/`pageVoiceOvers` в `popup.js` (MAIN-мир, без инжекта `<script>`) |
| `declarativeNetRequest` (Referer/Origin) | не нужно: запросы идут из контекста страницы |
| `www`-логика (попап с Redux) | упрощённый попап: озвучка, качество, субтитры, диапазон, очередь |

### API сервера (кратко)

`GET /api/state` · `POST /api/tasks` · `POST /api/tasks/:id/{cancel,pause,resume,retry}` ·
`DELETE /api/tasks/:id?file=1` ·
`POST /api/tasks/{cancel-all,resume-all,clear-finished,retry-failed}` · `GET /api/movies/:movieId` ·
`GET|PATCH /api/settings`. Подробности и примеры — `server/README.md`.
Серверный разбор страниц hdrezka был удалён: сайт отдаёт серверу страницу
входа/антибота, поэтому разбор делает расширение (у него сессия браузера).

### Имена файлов (по умолчанию)

Год — только на папке, серии — в подпапке `Season N`:
`%orig_title%%year_part%/%orig_title%` (фильм),
`%orig_title%%year_part%/%season_folder%/%orig_title%%sxxexx%` (сериал),
`…%sxxexx%.%subtitle_lang%` (субтитры, имя совпадает с видео + код языка —
для Jellyfin: `American Psycho.rus.vtt`).
Номера без ведущих нулей (`S1E10`). Название выбирается как английский вариант из
«Romaji / English» → оригинальное → локализованное; слеши в названии не создают
подпапок. Язык субтитров переводится в код функцией `subtitleLangCode`
(`util.js`): код из `subtitle_lns` → словарь названий (`Русский` → `rus`,
`Английский` → `en`) → латиница-фолбэк. Старые значения по умолчанию мигрируют
в БД автоматически.

### Задачи, которые остались на будущее

- Перенести «красивый» UI основного расширения (Redux, `src/components`) в веб-морду.
- Хранилище куки для серверного резолвера, чтобы он работал и при Cloudflare
  (сейчас в этом случае нужен путь через расширение).
- SSE/WebSocket вместо опроса раз в секунду (при большом числе задач).
- Управление очередью (порядок, приоритеты), лимит скорости.

Как запустить — см. README в `server/` и `client-extension/`.

### Что было проверено локально

- скачивание 20 МБ файла с проверкой md5; пауза/возобновление с Range;
  отмена с очисткой `.part`; продолжение загрузки после перезапуска сервера
  (в логе источника виден `Range: bytes=…-`); подмена недоступного URL резервным
  (`alt_urls`); ошибка 404 → статус `error` → `retry-failed` → успех;
  шаблоны имён с подпапками для сериалов и субтитров; HLS (m3u8 → mp4 через ffmpeg);
  лимит одновременности; `PATCH /api/settings`; токен (`401`/`200`) и CORS-preflight;
  веб-морда (статика + опрос состояния).
- приём задач «как из расширения» + скачивание: 14 проверок — имена файлов
  (год на папке, `Season N`, `S1E10`, длинное название с « / », субтитр рядом с
  видео), содержимое скачанных файлов, резервный URL, статистика.
- логика имён и выбора названия: 10 проверок (пример «Romaji / English»,
  год из диапазона 1999–2007, фильм без года, `AC/DC` без подпапок).
- CLI: 14 проверок — `--port` в трёх формах, приоритет над `PORT`, `--help`,
  `--version` (и то, что они не создают файлов), понятные ошибки на мусорные аргументы.
- NixOS: пакет собирается (`nix-build`) с install-проверками, модуль
  проэвалюирован на настоящей конфигурации (ExecStart, env, ReadWritePaths,
  RequiresMountsFor, фаервол, tmpfiles, пользователь).
- Сворачивание групп в веб-морде: 3 проверки (свёрнутая группа без `open`,
  остальные раскрыты, состояние сбрасывается только явно).
- «остановить всё» (cancel-all): 4 проверки — активная задача отменяется,
  ожидающие тоже, временные `.part` удаляются; формат логов: 6 проверок
  (без ANSI вне терминала, уровни, сообщение не теряется).
- повторная загрузка: 4 проверки (перезапись без « (1)», содержимое обновляется,
  выключенная перезапись снова даёт « (1)», сводка по фильму для предупреждения).
- докачка со старого `.part` после перезапуска: 7 проверок (в т.ч. доказательство
  через `Range: bytes=` в логе источника).
- веб-морда (Node + vm): 27 проверок — группировка фильм → серия → файлы,
  субтитры внутри карточки серии, статусы, оценка размера очереди, разметка,
  заголовки групп без папки категории.
- медиатека: 10 проверок — папка категории в имени, загрузка сразу в медиатеку
  (папки создаются автоматически), сериал в `Аниме/…/Season 1`, задача без
  категории в корне, отмена с очисткой `.part` в медиатеке.
- клиент расширения (Node + `vm` со стабами DOM): 20 проверок парсеров,
  27 проверок сборки задач и списка серий, 16 проверок `pageDetect`
  (фильм/сериал, разный порядок аргументов, JSON со скобками и запятыми,
  фолбэки из DOM), 11 проверок года/субтитров — файлы тестов в `/tmp`,
  в репозиторий не добавлялись.