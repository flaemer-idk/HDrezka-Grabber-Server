/**
 * Цветные логи сервера.
 * Цвета включаются только при выводе в терминал (в systemd/journald остаётся
 * чистый текст); отключаются переменной NO_COLOR=1.
 */

const useColor = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;

const paint = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : String(text));

export const color = {
  dim: (text) => paint('2', text),
  gray: (text) => paint('90', text),
  red: (text) => paint('31', text),
  green: (text) => paint('32', text),
  yellow: (text) => paint('33', text),
  blue: (text) => paint('34', text),
  magenta: (text) => paint('35', text),
  cyan: (text) => paint('36', text),
  bold: (text) => paint('1', text),
};

const LEVEL_STYLES = {
  info: { label: 'INFO ', paint: color.blue },
  done: { label: 'ГОТОВО', paint: color.green },
  warn: { label: 'ВНИМАНИЕ', paint: color.yellow },
  error: { label: 'ОШИБКА', paint: color.red },
};

/** Подсвечивает идентификаторы задач вида #12. */
function highlight(message) {
  return String(message).replace(/(^|[\s(])#(\d+)\b/g, (_, prefix, id) => {
    return `${prefix}${color.cyan(color.bold(`#${id}`))}`;
  });
}

export function write(level, message) {
  const style = LEVEL_STYLES[level] ?? LEVEL_STYLES.info;
  const time = color.gray(`[${new Date().toLocaleTimeString('ru-RU')}]`);
  const line = `${time} ${style.paint(style.label)} ${highlight(message)}`;
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const log = {
  info: (message) => write('info', message),
  done: (message) => write('done', message),
  warn: (message) => write('warn', message),
  error: (message) => write('error', message),
};

/** Стартовая «шапка» сервера. */
export function printBanner({
  version,
  port,
  downloadDir,
  dbFile,
  ffmpegOk,
  authToken,
  addresses,
}) {
  const line = color.dim('─'.repeat(52));
  console.log('');
  console.log(`${color.bold('HDrezka Grabber Server')} ${color.gray(`v${version}`)}`);
  console.log(line);
  console.log(`  ${color.gray('Порт')}              ${color.cyan(String(port))}`);
  console.log(`  ${color.gray('Папка загрузок')}    ${downloadDir}`);
  console.log(`  ${color.gray('База данных')}       ${dbFile}`);
  console.log(
    `  ${color.gray('ffmpeg (для HLS)')}  ${
      ffmpegOk ? color.green('найден') : color.yellow('не найден — .m3u8 качаться не будет')
    }`,
  );
  console.log(
    `  ${color.gray('Токен API')}         ${
      authToken ? color.green('включён') : color.yellow('выключен (открытый доступ в локальной сети)')
    }`,
  );
  console.log(line);
  console.log(`  ${color.gray('Веб-морда')}  ${color.cyan(`http://localhost:${port}/`)}`);
  for (const address of addresses) {
    console.log(`              ${color.cyan(`http://${address}:${port}/`)}`);
  }
  console.log(line);
  console.log(`  ${color.gray('Этот же адрес укажите в настройках расширения (⚙).')}`);
  console.log('');
}