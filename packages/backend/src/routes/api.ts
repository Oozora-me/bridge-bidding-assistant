/**
 * API 路由模块
 *
 * 定义桥牌叫牌助手的所有 API 路由：
 * - POST /api/analyze-hand    - 分析牌型
 * - POST /api/analyze-bidding - 分析叫牌进程
 * - POST /api/suggest-bid     - 建议下一步叫牌
 */

import express, { Router, Request, Response, NextFunction } from 'express';
import { chat, chatStream } from '../services/zhipu.js';
import { analyzeHandPrompt, analyzeBiddingPrompt, suggestBidPrompt } from '../prompts/bridge.js';
import { getEnabledConventions } from '../config/bidding.js';
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
// 路由：分析牌型
// ============================================================

router.post('/analyze-hand', async (req: Request, res: Response): Promise<void> => {
  try {
    const { hand, system, stream } = req.body;

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
    logger.info('API', `/analyze-hand 请求 - NS体系: ${nsSystem}, EW体系: ${ewSystem}, 启用约定叫: ${conventions.map(c => c.name).join(', ') || '无'}`);

    const prompts = analyzeHandPrompt(hand, nsSystem);

    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');

      try {
        for await (const chunk of chatStream({
          systemPrompt: prompts.system,
          userPrompt: prompts.user
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
    const { biddingSequence, vulnerability, dealer, system, stream } = req.body;

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
    logger.info('API', `/analyze-bidding 请求 - NS体系: ${nsSystem}, EW体系: ${ewSystem}, 启用约定叫: ${conventions.map(c => c.name).join(', ') || '无'}`);

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
          userPrompt: prompts.user
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
    const { hand, biddingSequence, position, vulnerability, system, stream } = req.body;

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
    logger.info('API', `/suggest-bid 请求 - NS体系: ${nsSystem}, EW体系: ${ewSystem}, 启用约定叫: ${conventions.map(c => c.name).join(', ') || '无'}`);

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
          userPrompt: prompts.user
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
