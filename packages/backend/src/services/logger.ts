import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

const LOG_DIR: string = process.env.LOG_DIR || path.resolve(__dirname, '../../logs');
const LOG_LEVEL: LogLevel = (process.env.LOG_LEVEL as unknown as LogLevel) || LogLevel.INFO;
const LOG_CONSOLE: boolean = process.env.LOG_CONSOLE !== 'false'; // 默认启用

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFile(): string {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `bridge-${date}.log`);
}

function formatMessage(level: string, mod: string, message: string): string {
  const time = new Date().toISOString();
  return `[${time}] [${level}] [${mod}] ${message}`;
}

function shouldLog(level: LogLevel): boolean {
  return level >= LOG_LEVEL;
}

function writeToFile(formatted: string): void {
  try {
    fs.appendFileSync(getLogFile(), formatted + '\n');
  } catch (err) {
    // 静默失败
  }
}

export const logger = {
  debug(mod: string, message: string): void {
    if (!shouldLog(LogLevel.DEBUG)) return;
    const formatted = formatMessage('DEBUG', mod, message);
    if (LOG_CONSOLE) console.debug(formatted);
    writeToFile(formatted);
  },
  info(mod: string, message: string): void {
    if (!shouldLog(LogLevel.INFO)) return;
    const formatted = formatMessage('INFO', mod, message);
    if (LOG_CONSOLE) console.log(formatted);
    writeToFile(formatted);
  },
  warn(mod: string, message: string): void {
    if (!shouldLog(LogLevel.WARN)) return;
    const formatted = formatMessage('WARN', mod, message);
    if (LOG_CONSOLE) console.warn(formatted);
    writeToFile(formatted);
  },
  error(mod: string, message: string): void {
    if (!shouldLog(LogLevel.ERROR)) return;
    const formatted = formatMessage('ERROR', mod, message);
    if (LOG_CONSOLE) console.error(formatted);
    writeToFile(formatted);
  },
};

export default logger;
