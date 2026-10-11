# HDrezka Grabber Server

Сервер загрузок для hdrezka + тонкое расширение-клиент. Расширение в браузере
достаёт прямые ссылки со страницы фильма/сериала и отправляет задачи на сервер —
файлы качаются **сразу на сервер** (в медиатеку Jellyfin-совместимой раскладкой),
ноутбук можно закрыть. Прогресс, очередь и все настройки — в веб-морде.

Репозиторий — форк [kristal374/HDrezka-Grabber](https://github.com/kristal374/HDrezka-Grabber)
(GPL-3.0). От исходного проекта здесь осталась идея и разбор страниц hdrezka;
сервер и клиент — новая разработка (сервер на чистом Node.js без зависимостей,
клиент — отдельное расширение вместо полноценного браузерного загрузчика).

## Состав

| Путь | Что это |
| --- | --- |
| `server/` | Сервер загрузок: Node.js ≥ 22.5, без npm-зависимостей (встроенный `node:sqlite`), веб-морда. Подробности — `server/README.md` |
| `client-extension/` | Расширение-клиент (Chrome 111+ / Firefox 128+): кнопка «Скачать на сервер» на странице hdrezka. См. `client-extension/README.md` |
| `nix/` | `package.nix` (сборка пакета), `module.nix` (NixOS-модуль для флейков), `hdrezka-grabber.nix` (самодостаточный модуль без флейков — просто скопировать в свой конфиг) |
| `flake.nix` | Флейк: `nixosModules.default`, `packages.hdrezka-grabber-server`, overlay |
| `ARCHITECTURE.md` | Разбор архитектуры (для разработки/ИИ-моделей) |
| `server/deploy/` | Готовый systemd-юнит для систем без NixOS |

## Быстрый старт без Nix

```bash
node server/src/index.js --port 8080
```

Открыть `http://<адрес-сервера>:8080/` — это веб-морда. Из командной строки
меняется **только порт**; всё остальное (папки, шаблоны имён, медиатека,
лимиты, токен) настраивается в веб-морде и хранится в SQLite.

Переменные окружения (для systemd/NixOS): `PORT`, `HOST`, `DB_FILE`,
`DOWNLOAD_DIR`, `LIBRARY_DIR` (начальное значение папки медиатеки),
`AUTH_TOKEN`, `FFMPEG_PATH`, `USER_AGENT`.

Данные по умолчанию: база — `server/data/grabber.db`, загрузки — `server/downloads/`.
Обе папки в `.gitignore` и в репозиторий не попадают.

## Расширение

1. Chrome/Edge/Opera: `chrome://extensions` → «Режим разработчика» → «Загрузить
   распакованное расширение» → папка `client-extension/`.
   Firefox: `about:debugging#/runtime/this-firefox` → «Загрузить временное
   дополнение» → `client-extension/manifest.json`.
2. В попапе расширения (⚙) указать адрес сервера, например `http://192.168.1.50:8080`.

## NixOS без флейков

`nix/hdrezka-grabber.nix` — самодостаточный модуль: сам скачивает исходники с
GitHub (`fetchFromGitHub`) и сам собирает пакет. Флейки не нужны — просто
скопируйте файл в свой конфиг:

```bash
cp nix/hdrezka-grabber.nix ~/nixos/Custom/HDrezka/module.nix
```

и подключите как обычно:

```nix
# ~/nixos/Custom/HDrezka/default.nix (или где у вас список импортов)
{ ... }:
{
  imports = [ ./Custom/HDrezka/module.nix ];

  services.hdrezka-grabber-server = {
    enable = true;
    port = 8080;                 # если 8080 занят — поставьте другой
    openFirewall = true;         # чтобы расширение с ноутбука видело сервер
    dataDir = "/idkselfhost/HDrezka";              # база (история/настройки)
    downloadDir = "/idkselfhost/HDrezka/downloads"; # куда качать без медиатеки
    libraryDir = "/idkselfhost/Media";              # качать сразу в медиатеку (опционально)
    extraPackages = [ pkgs.ffmpeg ];                # для .m3u8 (HLS)
  };
}
```

Модуль создаёт системного пользователя `hdrezka-grabber`, каталоги, systemd-сервис
с ограничениями (`ProtectSystem=strict`, `ReadWritePaths` только на свои папки) и
открывает порт в фаерволе при `openFirewall = true`. Если медиатека общая с
Jellyfin — укажите `group` от медиасервера, чтобы права совпадали.

### Обновление версии в модуле

Модуль пиннит исходники на тег репозитория. Чтобы обновить:

1. Поставьте новый тег в репозитории (например `v0.2.0`).
2. В `module.nix` поменяйте `rev = "v0.1.0";` на новый тег.
3. Поставьте `hash = lib.fakeHash;` и запустите `nixos-rebuild switch` — Nix
   напишет в ошибке настоящий хеш (`got: sha256-...`), впишите его вместо `lib.fakeHash`.

Хеш также можно получить заранее:

```bash
nix-prefetch-url --unpack https://github.com/flaemer-idk/HDrezka-Grabber-Server/archive/refs/tags/v0.1.0.tar.gz
```

## Nix (флейки)

```bash
nix run .#hdrezka-grabber-server -- --port 8080   # запустить без установки
nix build .#hdrezka-grabber-server                # собрать пакет
```

Подключение модуля во флейк-конфиге — два шага: инпут и модуль в `modules`
(или `imports`, если конфиг разбит на файлы):

```nix
# flake.nix
{
  inputs.hdrezka-grabber = {
    url = "github:flaemer-idk/HDrezka-Grabber-Server";
    inputs.nixpkgs.follows = "nixpkgs";   # собирать на вашем nixpkgs
  };

  outputs = { self, nixpkgs, hdrezka-grabber, ... }: {
    nixosConfigurations.myhost = nixpkgs.lib.nixosSystem {
      modules = [
        ./configuration.nix
        hdrezka-grabber.nixosModules.default   # services.hdrezka-grabber-server
      ];
    };
  };
}
```

```nix
# configuration.nix
{ pkgs, ... }:
{
  services.hdrezka-grabber-server = {
    enable = true;                                # сервис стартует при загрузке
    port = 8080;                                  # веб-морда и API
    openFirewall = true;                          # чтобы расширение видело сервер
    downloadDir = "/idkselfhost/HDrezka/downloads";
    extraPackages = [ pkgs.ffmpeg ];              # для .m3u8 (HLS)
  };
}
```

После первого подключения и каждого нового коммита в этом репозитории:

```bash
nix flake update hdrezka-grabber        # перечитать репозиторий
sudo nixos-rebuild switch --flake .#myhost
```

Для локальной разработки вместо `github:` можно указать путь
(`url = "path:/home/user/HDrezka-Grabber-Server";`) — тогда правки видны сразу
после `nix flake update hdrezka-grabber`.

Флейкам нужны файлы, добавленные в Git (`git add server nix flake.nix`), иначе
`nix build` скажет «is not tracked by Git».

## Системы без NixOS

Готовый юнит: `server/deploy/hdrezka-grabber-server.service`
(скопировать в `/etc/systemd/system/`, поправить `ExecStart`/`User`/пути).

## Лицензия

GPL-3.0 (см. `LICENSE`) — как у исходного проекта, форком которого является
этот репозиторий.