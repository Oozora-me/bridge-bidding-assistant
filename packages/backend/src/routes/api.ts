/**
 * API 路由模块
 *
 * 定义桥牌叫牌助手的所有 API 路由：
 * - GET  /api/models          - 获取可用提供商及模型列表
 * - POST /api/analyze-hand    - 分析牌型
 * - POST /api/analyze-bidding - 分析叫牌进程
 * - POST /api/suggest-bid     - 建议下一步叫牌
 *
 * model 参数格式: providerId:modelId（如 zhipu:GLM-4-Flash、github:gpt-4o-mini）
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { analyzeHandPrompt, analyzeBiddingPrompt, suggestBidPrompt } from '../prompts/bridge.js';
import { getEnabledConventions } from '../config/bidding.js';
import { getProvidersConfig, updateProviderConfig } from '../config/providersConfig.js';
import { checkUsage, recordConcurrencyStart, recordConcurrencyEnd, recordSuccess, getUsageSummary } from '../services/usageTracker.js';
import { providerRegistry } from '../services/providers/registry.js';
import { logger } from '../services/logger.js';
import { getSystemDocContent } from '../config/systemDocs.js';

const router: Router = express.Router();

// ============================================================
// 中间件：请求日志
// ============================================================

router.use((req: Request, res: Response, next: NextFunction) => {
  logger.info('API', `${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// ============================================================
// 中间件：多维度动态速率限制（全局用量 + per-IP 分钟限速 + 并发控制）
// ============================================================

// 存储 per-IP + 模型 的请求时间戳（用于 per-IP 分钟限速）
const rateLimitRequests = new Map<string, number[]>();

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
 * 多维度动态速率限制中间件
 * 1. 全局检查：并发数、每分钟请求数、每日限额
 * 2. per-IP 分钟限速检查
 * 3. 通过后记录并发开始，请求结束时释放
 */
function dynamicRateLimit(req: Request, res: Response, next: NextFunction): void {
  const modelKey: string = req.body?.model || '';
  const resolved = providerRegistry.getModelConfig(modelKey);
  const minuteLimit: number = resolved?.model?.defaultRateLimit || DEFAULT_RATE_LIMIT;
  const maxConcurrency: number = resolved?.model?.maxConcurrency || 10;
  const dailyLimit: number | undefined = resolved?.model?.dailyLimit;

  // 1. 全局多维度检查（并发、每分钟、每日）
  const usageCheck = checkUsage(modelKey, { minuteLimit, maxConcurrency, dailyLimit });
  if (!usageCheck.allowed) {
    logger.warn('RateLimit', `全局限制拒绝（模型: ${modelKey || '默认'}）: ${usageCheck.reason}`);
    res.status(429).json({
      success: false,
      error: usageCheck.reason,
    });
    return;
  }

  // 2. per-IP 分钟限速检查
  const ip: string = req.ip || req.connection.remoteAddress || 'unknown';
  const key: string = `${ip}:${modelKey || 'default'}`;
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

  if (timestamps.length >= minuteLimit) {
    const retryAfter = Math.ceil((timestamps[0] + RATE_LIMIT_WINDOW_MS - now) / 1000);
    logger.warn('RateLimit', `IP ${ip} 请求过于频繁（模型: ${modelKey || '默认'}），已拒绝。当前窗口内请求数: ${timestamps.length}/${minuteLimit}`);
    res.status(429).json({
      success: false,
      error: `请求过于频繁，请在 ${retryAfter} 秒后重试（限制: ${minuteLimit} 次/分钟）`,
      retryAfter
    });
    return;
  }

  timestamps.push(now);

  // 3. 记录并发开始
  recordConcurrencyStart(modelKey);
  res.on('finish', () => {
    recordConcurrencyEnd(modelKey);
  });

  next();
}

// 对所有 POST 路由应用动态速率限制
router.post('*', dynamicRateLimit);

// ============================================================
// 路由：获取可用提供商及模型列表
// ============================================================

router.get('/models', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    data: providerRegistry.getProviderInfo(),
  });
});

// ============================================================
// 路由：获取 Provider 配置（API Key 脱敏）
// ============================================================

router.get('/providers/config', (_req: Request, res: Response): void => {
  const config = getProvidersConfig();
  // API Key 脱敏：只保留前 4 位和后 4 位
  const sanitized: Record<string, any> = {};
  for (const [id, provider] of Object.entries(config.providers)) {
    const p = provider as any;
    sanitized[id] = {
      ...p,
      apiKey: p.apiKey ? `${p.apiKey.slice(0, 4)}****${p.apiKey.slice(-4)}` : '',
    };
  }
  res.json({
    success: true,
    data: sanitized,
  });
});

// ============================================================
// 路由：更新 Provider 配置
// ============================================================

router.put('/providers/config/:providerId', (req: Request, res: Response): void => {
  try {
    const { providerId } = req.params;
    const updated = updateProviderConfig(providerId, req.body);
    // 返回脱敏后的配置
    res.json({
      success: true,
      data: {
        ...updated,
        apiKey: updated.apiKey ? `${updated.apiKey.slice(0, 4)}****${updated.apiKey.slice(-4)}` : '',
      },
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================
// 路由：获取用量摘要
// ============================================================

router.get('/usage', (_req: Request, res: Response): void => {
  const providerInfos = providerRegistry.getProviderInfo();
  const modelConfigs = providerInfos.flatMap(p =>
    p.models.map(m => ({
      modelKey: `${p.id}:${m.id}`,
      modelName: m.name,
      providerName: p.name,
      minuteLimit: m.defaultRateLimit,
      maxConcurrency: m.maxConcurrency,
      dailyLimit: m.dailyLimit,
    }))
  );
  const summary = getUsageSummary(modelConfigs);
  res.json({
    success: true,
    data: summary,
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

    // 解析 provider 和模型
    const modelKey: string = model || 'zhipu:GLM-4-Flash';
    const resolved = providerRegistry.getModelConfig(modelKey);
    if (!resolved) {
      res.status(400).json({
        success: false,
        error: `不支持的模型: ${modelKey}`
      });
      return;
    }
    const { provider, model: modelConfig } = resolved;

    const prompts = analyzeHandPrompt(hand, nsSystem);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      try {
        for await (const chunk of provider.chatStream({
          systemPrompt: prompts.system,
          userPrompt: prompts.user,
          model: modelConfig.id
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

    const result = await provider.chat({
      systemPrompt: prompts.system,
      userPrompt: prompts.user,
      model: modelConfig.id,
      maxTokens: 4096
    });

    recordSuccess(modelKey);

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

    // 解析 provider 和模型
    const modelKey: string = model || 'zhipu:GLM-4-Flash';
    const resolved = providerRegistry.getModelConfig(modelKey);
    if (!resolved) {
      res.status(400).json({
        success: false,
        error: `不支持的模型: ${modelKey}`
      });
      return;
    }
    const { provider, model: modelConfig } = resolved;

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
        for await (const chunk of provider.chatStream({
          systemPrompt: prompts.system,
          userPrompt: prompts.user,
          model: modelConfig.id
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

    const result = await provider.chat({
      systemPrompt: prompts.system,
      userPrompt: prompts.user,
      model: modelConfig.id,
      maxTokens: 4096
    });

    recordSuccess(modelKey);

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

    // 解析 provider 和模型
    const modelKey: string = model || 'zhipu:GLM-4-Flash';
    const resolved = providerRegistry.getModelConfig(modelKey);
    if (!resolved) {
      res.status(400).json({
        success: false,
        error: `不支持的模型: ${modelKey}`
      });
      return;
    }
    const { provider, model: modelConfig } = resolved;

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
        for await (const chunk of provider.chatStream({
          systemPrompt: prompts.system,
          userPrompt: prompts.user,
          model: modelConfig.id
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

    const result = await provider.chat({
      systemPrompt: prompts.system,
      userPrompt: prompts.user,
      model: modelConfig.id,
      maxTokens: 4096
    });

    recordSuccess(modelKey);

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
// 路由：获取体系文档列表
// ============================================================

router.get('/system-docs', (_req: Request, res: Response): void => {
  const systems = [
    { id: 'natural-2over1', name: '自然二盖一 (2/1 GF)' },
    { id: 'precision', name: '精确叫牌 (Precision)' },
  ];
  res.json({ success: true, data: systems });
});

// ============================================================
// 路由：获取指定体系文档
// ============================================================

router.get('/system-docs/:systemId', (req: Request, res: Response): void => {
  const content = getSystemDocContent(req.params.systemId);
  res.json({ success: true, data: { content } });
});

// ============================================================
// 导出
// ============================================================

export default router;
