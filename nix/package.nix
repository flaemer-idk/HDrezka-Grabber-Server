# Упаковка сервера HDrezka Grabber для Nix.
# Зависимостей нет: нужен только Node.js (используется встроенный node:sqlite),
# поэтому сборка сводится к копированию файлов и обёртке-лаунчеру.
{
  lib,
  stdenv,
  nodejs,
  makeWrapper,
  ffmpeg ? null,
}:

let
  packageJson = lib.importJSON ../server/package.json;
in
stdenv.mkDerivation (finalAttrs: {
  pname = "hdrezka-grabber-server";
  version = packageJson.version;

  # Только то, что нужно серверу: без тестов, логов, базы, загрузок и node_modules.
  # Каталоги перечислены отдельно — иначе фильтр отсекает их вместе с содержимым.
  src = lib.sourceByRegex ../server [
    "^package\\.json$"
    "^README\\.md$"
    "^src$"
    "^src/.*$"
    "^public$"
    "^public/.*$"
  ];

  nativeBuildInputs = [ makeWrapper ];

  installPhase = ''
    runHook preInstall

    mkdir -p $out/share/hdrezka-grabber-server $out/bin
    cp -r package.json README.md src public $out/share/hdrezka-grabber-server/

    # Обёртка: запускает node с сервером и задаёт разумные пути по умолчанию,
    # чтобы `nix run` работал без предварительной настройки (в Store писать нельзя).
    makeWrapper ${lib.getExe nodejs} $out/bin/hdrezka-grabber-server \
      --add-flags "$out/share/hdrezka-grabber-server/src/index.js" \
      --run 'export DB_FILE="''${DB_FILE:-''${XDG_STATE_HOME:-$HOME/.local/state}/hdrezka-grabber/grabber.db}"' \
      --run 'export DOWNLOAD_DIR="''${DOWNLOAD_DIR:-''${XDG_DOWNLOAD_DIR:-$HOME/Downloads}/HDrezkaGrabber}"' \
      ${lib.optionalString (ffmpeg != null) ''--prefix PATH : ${lib.makeBinPath [ ffmpeg ]}''}

    runHook postInstall
  '';

  doInstallCheck = true;
  installCheckPhase = ''
    runHook preInstallCheck
    $out/bin/hdrezka-grabber-server --version | grep -q ${finalAttrs.version}
    $out/bin/hdrezka-grabber-server --help | grep -q -- '--port'
    runHook postInstallCheck
  '';

  meta = {
    description = "Локальный сервер загрузок hdrezka с веб-мордой (качает на сервер, а не в браузер)";
    homepage = "https://github.com/kristal374/HDrezka-Grabber";
    license = lib.licenses.gpl3Only;
    mainProgram = "hdrezka-grabber-server";
    platforms = lib.platforms.all;
  };
})