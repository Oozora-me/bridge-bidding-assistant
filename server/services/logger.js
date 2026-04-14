import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = process.env.LOG_DIR || path.resolve(__dirname, '../../logs');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

function getLogFile() {
  const date = new Date().toISOString().split('T')[0];
  return path.join(LOG_DIR, `bridge-${date}.log`);
}

function formatMessage(level, module, message) {
  const time = new Date().toISOString();
  return `[${time}] [${level}] [${module}] ${message}`;
}

function writeToFile(formatted) {
  try {
    fs.appendFileSync(getLogFile(), formatted + '\n');
  } catch (err) {
    console.error('日志写入失败:', err.message);
  }
}

export const logger = {
  info(module, message) {
    const formatted = formatMessage('INFO', module, message);
    console.log(formatted);
    writeToFile(formatted);
  },
  warn(module, message) {
    const formatted = formatMessage('WARN', module, message);
    console.warn(formatted);
    writeToFile(formatted);
  },
  error(module, message) {
    const formatted = formatMessage('ERROR', module, message);
    console.error(formatted);
    writeToFile(formatted);
  }
};

export default logger;
