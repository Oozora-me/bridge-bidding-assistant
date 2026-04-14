/**
 * API 路由模块
 *
 * 定义桥牌叫牌助手的所有 API 路由：
 * - GET  /api/models          - 获取可用模型列表
 * - POST /api/analyze-hand    - 分析牌型
 * - POST /api/analyze-bidding - 分析叫牌进程
 * - POST /api/suggest-bid     - 建议下一步叫牌
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { chat, chatStream } from '../services/zhipu.js';
import { analyzeHandPrompt, analyzeBiddingPrompt, suggestBidPrompt } from '../prompts/bridge.js';
import { getEnabledConventions } from '../config/bidding.js';
import { getModelConfig, getEnabledModels } from '../config/models.js';
import { logger } from '../services/logger.js';

const router: Router = express.Router();

// ============================================================
// 中间件：请求日志
// ============================================================

router.use((req: Request, res: Response, next: NextFunction) => {
  logger.info('API', `${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// ============================================================
// 中间件：按模型动态速率限制（基于内存的滑动窗口）
// ============================================================

// 存储每个 IP + 模型 的请求时间戳
const rateLimitRequests = new Map<string, number[]>();

// 默认速率限制（当模型配置找不到时使用）
const DEFAULT_RATE_LIMIT: number = 10;
const RATE_LIMIT_WINDOW_MS: number = 60 * 1000; // 1 分钟窗口

// 定期清理过期记录（每 5 分钟）
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitRequests) {
    const filtered = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
    if (filtered.length === 0) {
      rateLimitRequests.delete(key);
    } else {
      rateLimitRequests.set(key, filtered);
    }
  }
}, 5 * 60 * 1000);

/**
 * 动态速率限制中间件
 * 根据请求中指定的 model 参数，从模型配置中获取对应的 rate limit
 */
function dynamicRateLimit(req: Request, res: Response, next: NextFunction): void {
  const modelId: string = req.body?.model || '';
  const modelConfig = getModelConfig(modelId);
  const max: number = modelConfig?.defaultRateLimit || DEFAULT_RATE_LIMIT;

  const ip: string = req.ip || req.connection.remoteAddress || 'unknown';
  const key: string = `${ip}:${modelId || 'default'}`;
  const now = Date.now();

  if (!rateLimitRequests.has(key)) {
    rateLimitRequests.set(key, []);
  }

  const timestamps: number[] = rateLimitRequests.get(key)!;

  // 移除超出时间窗口的旧记录
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < windowStart) {
    timestamps.shift();
  }

  if (timestamps.length >= max) {
    const retryAfter = Math.ceil((timestamps[0] + RATE_LIMIT_WINDOW_MS - now) / 1000);
    logger.warn('RateLimit', `IP ${ip} 请求过于频繁（模型: ${modelId || '默认'}），已拒绝。当前窗口内请求数: ${timestamps.length}/${max}`);
    res.status(429).json({
      success: false,
      error: `请求过于频繁，请在 ${retryAfter} 秒后重试（限制: ${max} 次/分钟）`,
      retryAfter
    });
    return;
  }

  timestamps.push(now);
  next();
}

// 对所有 POST 路由应用动态速率限制
router.post('*', dynamicRateLimit);

// ============================================================
// 路由：获取可用模型列表
// ============================================================

router.get('/models', (_req: Request, res: Response): void => {
  const models = getEnabledModels().map(({ id, name, contextLength, maxConcurrency, defaultRateLimit, enabled }) => ({
    id,
    name,
    contextLength,
    maxConcurrency,
    defaultRateLimit,
    enabled,
  }));

  res.json({
    success: true,
    data: models,
  });
});

// ============================================================
// 路由：分析牌型
// ============================================================

router.post('/analyze-hand', async (req: Request, res: Response): Promise<void> => {
  try {
    const { hand, system, stream, model } = req.body;

    if (!hand) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数: hand'
      });
      return;
    }

    if (!hand.spades && !hand.hearts && !hand.diamonds && !hand.clubs) {
      res.status(400).json({
        success: false,
        error: '手牌数据不能为空，至少需要提供一个花色'
      });
      return;
    }

    const nsSystem: string = req.body.nsSystem || req.body.system || 'natural-2over1';
    const ewSystem: string = req.body.ewSystem || req.body.system || 'natural-2over1';

    const conventions = getEnabledConventions(nsSystem);
    logger.info('API', `/analyze-hand 请求 - NS体系: ${nsSystem}, EW体系: ${ewSystem}, 模型: ${model || '默认'}, 启用约定叫: ${conventions.map(c => c.name).join(', ') || '无'}`);

    const prompts = analyzeHandPrompt(hand, nsSystem);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      try {
        for await (const chunk of chatStream({
          systemPrompt: prompts.system,
          userPrompt: prompts.user,
          model
        })) {
          res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (streamError: any) {
        logger.error('API', `流式响应错误: ${streamError.message}`);
        res.write(`data: ${JSON.stringify({ error: streamError.message })}\n\n`);
        res.end();
      }
      return;
    }

    const result = await chat({
      systemPrompt: prompts.system,
      userPrompt: prompts.user,
      model,
      maxTokens: 4096
    });

    res.json({
      success: true,
      data: {
        content: result.content,
        usage: result.usage,
        model: result.model
      }
    });
  } catch (error: any) {
    logger.error('API', `/analyze-hand 错误: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `牌型分析失败: ${error.message}`
    });
  }
});

// ============================================================
// 路由：分析叫牌进程
// ============================================================

router.post('/analyze-bidding', async (req: Request, res: Response): Promise<void> => {
  try {
    const { biddingSequence, vulnerability, dealer, system, stream, model } = req.body;

    if (!biddingSequence || !Array.isArray(biddingSequence) || biddingSequence.length === 0) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数: biddingSequence（必须是非空数组）'
      });
      return;
    }

    const nsSystem: string = req.body.nsSystem || req.body.system || 'natural-2over1';
    const ewSystem: string = req.body.ewSystem || req.body.system || 'natural-2over1';

    const conventions = getEnabledConventions(nsSystem);
    logger.info('API', `/analyze-bidding 请求 - NS体系: ${nsSystem}, EW体系: ${ewSystem}, 模型: ${model || '默认'}, 启用约定叫: ${conventions.map(c => c.name).join(', ') || '无'}`);

    const prompts = analyzeBiddingPrompt(
      { biddingSequence, vulnerability, dealer },
      nsSystem, ewSystem
    );

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      try {
        for await (const chunk of chatStream({
          systemPrompt: prompts.system,
          userPrompt: prompts.user,
          model
        })) {
          res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (streamError: any) {
        logger.error('API', `流式响应错误: ${streamError.message}`);
        res.write(`data: ${JSON.stringify({ error: streamError.message })}\n\n`);
        res.end();
      }
      return;
    }

    const result = await chat({
      systemPrompt: prompts.system,
      userPrompt: prompts.user,
      model,
      maxTokens: 4096
    });

    res.json({
      success: true,
      data: {
        content: result.content,
        usage: result.usage,
        model: result.model
      }
    });
  } catch (error: any) {
    logger.error('API', `/analyze-bidding 错误: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `叫牌分析失败: ${error.message}`
    });
  }
});

// ============================================================
// 路由：建议下一步叫牌
// ============================================================

router.post('/suggest-bid', async (req: Request, res: Response): Promise<void> => {
  try {
    const { hand, biddingSequence, position, vulnerability, system, stream, model } = req.body;

    if (!hand) {
      res.status(400).json({
        success: false,
        error: '缺少必要参数: hand'
      });
      return;
    }

    if (!hand.spades && !hand.hearts && !hand.diamonds && !hand.clubs) {
      res.status(400).json({
        success: false,
        error: '手牌数据不能为空，至少需要提供一个花色'
      });
      return;
    }

    const nsSystem: string = req.body.nsSystem || req.body.system || 'natural-2over1';
    const ewSystem: string = req.body.ewSystem || req.body.system || 'natural-2over1';

    const conventions = getEnabledConventions(nsSystem);
    logger.info('API', `/suggest-bid 请求 - NS体系: ${nsSystem}, EW体系: ${ewSystem}, 模型: ${model || '默认'}, 启用约定叫: ${conventions.map(c => c.name).join(', ') || '无'}`);

    const prompts = suggestBidPrompt(
      { hand, biddingSequence: biddingSequence || [], position, vulnerability },
      nsSystem, ewSystem
    );

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      try {
        for await (const chunk of chatStream({
          systemPrompt: prompts.system,
          userPrompt: prompts.user,
          model
        })) {
          res.write(`data: ${JSON.stringify({ content: chunk })}\n\n`);
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (streamError: any) {
        logger.error('API', `流式响应错误: ${streamError.message}`);
        res.write(`data: ${JSON.stringify({ error: streamError.message })}\n\n`);
        res.end();
      }
      return;
    }

    const result = await chat({
      systemPrompt: prompts.system,
      userPrompt: prompts.user,
      model,
      maxTokens: 4096
    });

    res.json({
      success: true,
      data: {
        content: result.content,
        usage: result.usage,
        model: result.model
      }
    });
  } catch (error: any) {
    logger.error('API', `/suggest-bid 错误: ${error.message}`);
    res.status(500).json({
      success: false,
      error: `叫牌建议失败: ${error.message}`
    });
  }
});

// ============================================================
// 导出
// ============================================================

export default router;
