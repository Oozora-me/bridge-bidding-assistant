/**
 * Express 服务器入口
 *
 * 桥牌叫牌助手后端服务，提供牌型分析、叫牌进程分析和叫牌建议 API。
 */

import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './routes/api.js';
import { logger } from './services/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// 应用配置
// ============================================================

const PORT: number = parseInt(process.env.PORT || '3001', 10);

// 速率限制配置：通过环境变量 RATE_LIMIT_PER_MINUTE 配置，默认 10 次/分钟
const RATE_LIMIT_WINDOW_MS: number = 60 * 1000; // 1 分钟窗口
const RATE_LIMIT_MAX: number = parseInt(process.env.RATE_LIMIT_PER_MINUTE || '10', 10);

// ============================================================
// 速率限制中间件（基于内存的滑动窗口）
// ============================================================

interface RateLimitOptions {
  windowMs: number;
  max: number;
}

/**
 * 简易速率限制器
 * 按 IP 地址限制请求频率，支持通过环境变量 RATE_LIMIT_PER_MINUTE 配置
 */
function rateLimit({ windowMs, max }: RateLimitOptions) {
  // 存储每个 IP 的请求时间戳
  const requests = new Map<string, number[]>();

  // 定期清理过期记录（每 5 分钟）
  setInterval(() => {
    const now = Date.now();
    for (const [ip, timestamps] of requests) {
      // 移除超出窗口的旧记录
      const filtered = timestamps.filter(t => now - t < windowMs);
      if (filtered.length === 0) {
        requests.delete(ip);
      } else {
        requests.set(ip, filtered);
      }
    }
  }, 5 * 60 * 1000);

  return (req: Request, res: Response, next: NextFunction) => {
    const ip: string = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();

    if (!requests.has(ip)) {
      requests.set(ip, []);
    }

    const timestamps: number[] = requests.get(ip)!;

    // 移除超出时间窗口的旧记录
    const windowStart = now - windowMs;
    while (timestamps.length > 0 && timestamps[0] < windowStart) {
      timestamps.shift();
    }

    if (timestamps.length >= max) {
      const retryAfter = Math.ceil((timestamps[0] + windowMs - now) / 1000);
      logger.warn('RateLimit', `IP ${ip} 请求过于频繁，已拒绝。当前窗口内请求数: ${timestamps.length}/${max}`);
      res.status(429).json({
        success: false,
        error: `请求过于频繁，请在 ${retryAfter} 秒后重试（限制: ${max} 次/分钟）`,
        retryAfter
      });
      return;
    }

    timestamps.push(now);
    next();
  };
}

// ============================================================
// 创建 Express 应用
// ============================================================

const app = express();

// ============================================================
// 中间件
// ============================================================

// CORS 跨域支持
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// JSON 请求体解析
app.use(express.json({ limit: '1mb' }));

// URL 编码请求体解析
app.use(express.urlencoded({ extended: true }));

// 速率限制（仅对 /api 路由生效）
app.use('/api', rateLimit({ windowMs: RATE_LIMIT_WINDOW_MS, max: RATE_LIMIT_MAX }));

// ============================================================
// 路由
// ============================================================

// 健康检查接口
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'bridge-bidding-assistant',
    timestamp: new Date().toISOString()
  });
});

// API 路由
app.use('/api', apiRouter);

// ============================================================
// 错误处理
// ============================================================

// 404 处理
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `接口不存在: ${req.method} ${req.path}`
  });
});

// 全局错误处理
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Server', `服务器错误: ${err.stack}`);
  res.status(500).json({
    success: false,
    error: '服务器内部错误'
  });
});

// ============================================================
// 启动服务器
// ============================================================

const LOG_DIR: string = process.env.LOG_DIR || path.resolve(__dirname, '../logs');

app.listen(PORT, () => {
  logger.info('Server', '========================================');
  logger.info('Server', '  桥牌叫牌助手后端服务已启动');
  logger.info('Server', `  地址: http://localhost:${PORT}`);
  logger.info('Server', `  API:  http://localhost:${PORT}/api`);
  logger.info('Server', `  健康: http://localhost:${PORT}/health`);
  logger.info('Server', `  速率限制: ${RATE_LIMIT_MAX} 次/分钟`);
  logger.info('Server', `  日志目录: ${LOG_DIR}`);
  logger.info('Server', '========================================');
});

export default app;
