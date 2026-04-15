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
import { providerRegistry } from './services/providers/registry.js';
import { ZhipuProvider } from './services/providers/zhipu.js';
import { GitHubProvider } from './services/providers/github.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// 应用配置
// ============================================================

const PORT: number = parseInt(process.env.PORT || '10240', 10);

// ============================================================
// 注册 AI 提供商
// ============================================================

providerRegistry.register(new ZhipuProvider());
if (process.env.GITHUB_TOKEN) {
  providerRegistry.register(new GitHubProvider());
}

// 注意：速率限制已移至 routes/api.ts 中，按模型动态配置

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

// 速率限制已在 routes/api.ts 中按模型动态配置

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
app.use('/bridge-bidding-assistant-server/api', apiRouter);

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
  logger.info('Server', `  日志目录: ${LOG_DIR}`);
  logger.info('Server', '========================================');
});

export default app;
