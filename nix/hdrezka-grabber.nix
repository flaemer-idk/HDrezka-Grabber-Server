# HDrezka Grabber Server — NixOS-модуль «без флейков» (самодостаточный).
#
# Сам скачивает исходники с GitHub (fetchFromGitHub) и сам собирает пакет —
# достаточно скопировать этот файл в свой конфиг:
#
#   cp nix/hdrezka-grabber.nix ~/nixos/Custom/HDrezka/module.nix
#
# и подключить как обычно:
#
#   imports = [ ./Custom/HDrezka/module.nix ];
#
#   services.hdrezka-grabber-server = {
#     enable = true;
#     port = 8080;
#     openFirewall = true;
#     dataDir = "/idkselfhost/HDrezka";                # база (история + настройки)
#     downloadDir = "/idkselfhost/HDrezka/downloads";  # куда качать без медиатеки
#     libraryDir = "/idkselfhost/Media";               # опционально: качать сразу в медиатеку
#     extraPackages = [ pkgs.ffmpeg ];                 # опционально: .m3u8 (HLS)
#   };
#
# Обновление версии: поменять rev на новый тег репозитория, поставить
# hash = lib.fakeHash и запустить nixos-rebuild switch — Nix напишет в ошибке
# настоящий хеш ("got: sha256-..."), его и вписать. Либо заранее:
#   nix-prefetch-url --unpack https://github.com/flaemer-idk/HDrezka-Grabber-Server/archive/refs/tags/<тег>.tar.gz
#
# Что за сервис: см. README.md репозитория. Из командной строки у сервера
# настраивается только порт; остальное (папки, шаблоны имён, медиатека, лимиты) —
# в веб-морде на http://<хост>:<порт>/.
{
  config,
  lib,
  pkgs,
  ...
}:

let
  cfg = config.services.hdrezka-grabber-server;

  # ── Исходники: тег репозитория ──────────────────────────────────────────
  fetched = pkgs.fetchFromGitHub {
    owner = "flaemer-idk";
    repo = "HDrezka-Grabber-Server";
    rev = "v0.1.0";
    hash = "sha256-hXU9n4nlh/Tw27VkB/0MvLyH9RirSOjP22luJTcKGXc=";
  };

  # Серверу нужен только Node.js: npm-зависимостей нет (встроенный node:sqlite,
  # значит нужен Node >= 22.5). nodejs_22 есть не во всех nixpkgs — на старых
  # берём pkgs.nodejs (тогда проверьте, что там >= 22.5).
  nodejs = pkgs.nodejs_22 or pkgs.nodejs;

  # Только то, что нужно серверу: без тестов, логов, базы и загрузок.
  # Каталоги перечислены отдельно — иначе фильтр отсекает их вместе с содержимым.
  serverSrc = lib.sourceByRegex "${fetched}/server" [
    "^package\\.json$"
    "^README\\.md$"
    "^src$"
    "^src/.*$"
    "^public$"
    "^public/.*$"
  ];

  # ── Пакет (то же, что nix/package.nix, но из скачанных исходников) ──────
  defaultPackage = pkgs.stdenv.mkDerivation {
    pname = "hdrezka-grabber-server";
    version = (lib.importJSON "${serverSrc}/package.json").version;
    src = serverSrc;

    nativeBuildInputs = [ pkgs.makeWrapper ];

    installPhase = ''
      runHook preInstall

      mkdir -p $out/share/hdrezka-grabber-server $out/bin
      cp -r package.json README.md src public $out/share/hdrezka-grabber-server/

      # Обёртка: запускает node с сервером и задаёт разумные пути по умолчанию,
      # чтобы `nix run` работал без настройки (в Store писать нельзя).
      makeWrapper ${lib.getExe nodejs} $out/bin/hdrezka-grabber-server \
        --add-flags "$out/share/hdrezka-grabber-server/src/index.js" \
        --run 'export DB_FILE="''${DB_FILE:-''${XDG_STATE_HOME:-$HOME/.local/state}/hdrezka-grabber/grabber.db}"' \
        --run 'export DOWNLOAD_DIR="''${DOWNLOAD_DIR:-''${XDG_DOWNLOAD_DIR:-$HOME/Downloads}/HDrezkaGrabber}"'

      runHook postInstall
    '';

    doInstallCheck = true;
    installCheckPhase = ''
      runHook preInstallCheck
      $out/bin/hdrezka-grabber-server --version | grep -q $version
      $out/bin/hdrezka-grabber-server --help | grep -q -- '--port'
      runHook postInstallCheck
    '';

    meta = {
      description = "Локальный сервер загрузок hdrezka с веб-мордой (качает на сервер, а не в браузер)";
      homepage = "https://github.com/flaemer-idk/HDrezka-Grabber-Server";
      license = lib.licenses.gpl3Only;
      mainProgram = "hdrezka-grabber-server";
      platforms = lib.platforms.all;
    };
  };

  dataDirDefault = "/var/lib/hdrezka-grabber";
in
{
  options.services.hdrezka-grabber-server = {
    enable = lib.mkEnableOption "HDrezka Grabber Server — сервер загрузок hdrezka с веб-мордой";

    package = lib.mkOption {
      type = lib.types.package;
      default = defaultPackage;
      defaultText = lib.literalExpression "пакет, собранный из flaemer-idk/HDrezka-Grabber-Server (тег v0.1.0)";
      description = "Пакет сервера.";
    };

    port = lib.mkOption {
      type = lib.types.port;
      default = 8080;
      description = "Порт веб-морды и API.";
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "0.0.0.0";
      description = "Адрес прослушивания.";
    };

    openFirewall = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = "Открыть порт в фаерволе (нужно, чтобы расширение с ноутбука видело сервер).";
    };

    user = lib.mkOption {
      type = lib.types.str;
      default = "hdrezka-grabber";
      description = "Пользователь, от которого работает сервис.";
    };

    group = lib.mkOption {
      type = lib.types.str;
      default = "hdrezka-grabber";
      description = ''
        Группа сервиса. Если медиатека лежит в общей папке (например, для Jellyfin),
        укажите ту же группу, что у медиасервера.
      '';
    };

    dataDir = lib.mkOption {
      type = lib.types.str;
      default = dataDirDefault;
      description = "Каталог с базой данных (история задач и настройки).";
    };

    downloadDir = lib.mkOption {
      type = lib.types.str;
      default = "${dataDirDefault}/downloads";
      description = "Каталог загрузок.";
    };

    libraryDir = lib.mkOption {
      type = lib.types.nullOr lib.types.str;
      default = null;
      description = ''
        Каталог медиатеки: если задан, файлы качаются сразу туда (начальное значение,
        потом можно поменять в веб-морде). Категории (Фильмы/Сериалы/Аниме/…)
        настраиваются там же.
      '';
    };

    environmentFile = lib.mkOption {
      type = lib.types.nullOr lib.types.path;
      default = null;
      example = "/run/secrets/hdrezka-grabber.env";
      description = ''
        Файл окружения systemd — удобно для секретов, например:
        `AUTH_TOKEN=секрет` (тогда тот же токен нужно вписать в расширении).
      '';
    };

    extraEnvironment = lib.mkOption {
      type = lib.types.attrsOf lib.types.str;
      default = { };
      example = { FFMPEG_PATH = "/run/current-system/sw/bin/ffmpeg"; };
      description = "Дополнительные переменные окружения сервиса.";
    };

    extraPackages = lib.mkOption {
      type = lib.types.listOf lib.types.package;
      default = [ ];
      example = lib.literalExpression "[ pkgs.ffmpeg ]";
      description = "Пакеты в PATH сервиса (например, ffmpeg для HLS/.m3u8).";
    };

    extraServiceConfig = lib.mkOption {
      type = lib.types.attrs;
      default = { };
      description = "Дополнительные настройки systemd-сервиса.";
    };
  };

  config = lib.mkIf cfg.enable {
    assertions = [
      {
        assertion = cfg.user != "root";
        message = "services.hdrezka-grabber-server.user: не запускайте сервер от root.";
      }
    ];

    users.users."${cfg.user}" = {
      isSystemUser = true;
      group = cfg.group;
      home = cfg.dataDir;
      description = "HDrezka Grabber Server";
    };
    users.groups."${cfg.group}" = { };

    systemd.tmpfiles.rules = [
      "d ${cfg.dataDir} 0750 ${cfg.user} ${cfg.group} -"
      "d ${cfg.downloadDir} 0750 ${cfg.user} ${cfg.group} -"
    ] ++ lib.optional (cfg.libraryDir != null) "d ${cfg.libraryDir} 0775 ${cfg.user} ${cfg.group} -";

    systemd.services.hdrezka-grabber-server = {
      description = "HDrezka Grabber Server";
      documentation = [ "https://github.com/flaemer-idk/HDrezka-Grabber-Server" ];
      wantedBy = [ "multi-user.target" ];
      after = [ "network-online.target" ];
      wants = [ "network-online.target" ];

      path = cfg.extraPackages;

      environment = {
        PORT = toString cfg.port;
        HOST = cfg.host;
        DB_FILE = "${cfg.dataDir}/grabber.db";
        DOWNLOAD_DIR = cfg.downloadDir;
      } // lib.optionalAttrs (cfg.libraryDir != null) {
        LIBRARY_DIR = cfg.libraryDir;
      } // cfg.extraEnvironment;

      serviceConfig = {
        Type = "simple";
        ExecStart = lib.getExe cfg.package;
        User = cfg.user;
        Group = cfg.group;
        WorkingDirectory = cfg.dataDir;
        Restart = "on-failure";
        RestartSec = 5;
        EnvironmentFile = lib.optional (cfg.environmentFile != null) cfg.environmentFile;
        RequiresMountsFor = [ cfg.downloadDir ] ++ lib.optional (cfg.libraryDir != null) cfg.libraryDir;

        # Ограничения доступа (серверу нужен только сеть и свои каталоги)
        NoNewPrivileges = true;
        PrivateTmp = true;
        ProtectSystem = "strict";
        ProtectHome = true;
        ProtectKernelTunables = true;
        ProtectControlGroups = true;
        RestrictAddressFamilies = [ "AF_INET" "AF_INET6" "AF_UNIX" ];
        CapabilityBoundingSet = "";
        ReadWritePaths = [ cfg.dataDir cfg.downloadDir ]
          ++ lib.optional (cfg.libraryDir != null) cfg.libraryDir;
      } // cfg.extraServiceConfig;
    };

    networking.firewall.allowedTCPPorts = lib.mkIf cfg.openFirewall [ cfg.port ];
  };
}