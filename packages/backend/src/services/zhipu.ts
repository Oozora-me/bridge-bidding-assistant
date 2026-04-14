/**
 * 智谱 AI 服务模块
 *
 * 封装智谱 GLM-4.7-Flash 模型的 API 调用，
 * 支持流式和非流式两种响应模式，包含错误处理和重试逻辑。
 */

import axios from "axios";
import { logger } from './logger.js';

// ============================================================
// 类型定义
// ============================================================

interface ChatOptions {
  systemPrompt?: string;
  userPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface ChatResult {
  content: string;
  usage: Record<string, number>;
  model: string;
  finishReason?: string;
}

// ============================================================
// 配置
// ============================================================

export const ZHIPU_API_URL: string = "https://open.bigmodel.cn/api/paas/v4/chat/completions";
const ZHIPU_API_KEY: string =
  process.env.ZHIPU_API_KEY ||
  "8899210c8fad4beaabb34c509506456e.XfQQ9Rq5DZAUSehu";
const DEFAULT_MODEL: string = process.env.ZHIPU_MODEL || 'GLM-4-Flash';
const MAX_RETRIES: number = 3;
const RETRY_DELAY: number = 1000;
const REQUEST_TIMEOUT: number = 60000;

// ============================================================
// 工具函数
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(error: any): boolean {
  if (
    error.code === "ECONNABORTED" ||
    error.code === "ETIMEDOUT" ||
    error.code === "ECONNRESET"
  ) {
    return true;
  }
  if (error.response) {
    const status: number = error.response.status;
    return status === 429 || (status >= 500 && status < 600);
  }
  if (!error.response && error.request) {
    return true;
  }
  return false;
}

// ============================================================
// 核心服务
// ============================================================

/**
 * 调用智谱 AI API（非流式模式）
 */
export async function chat(options: ChatOptions): Promise<ChatResult> {
  const {
    systemPrompt,
    userPrompt,
    model,
    temperature,
    maxTokens,
  } = options;

  const messages: Array<{ role: string; content: string }> = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  if (userPrompt) {
    messages.push({ role: "user", content: userPrompt });
  }

  const requestBody = {
    model: model || DEFAULT_MODEL,
    messages,
    temperature: temperature !== undefined ? temperature : 0.7,
    max_tokens: maxTokens || 4096,
    stream: false,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info('ZhipuAI', `非流式请求 - 第 ${attempt} 次尝试 (模型: ${model || DEFAULT_MODEL})`);

      const response = await axios.post(ZHIPU_API_URL, requestBody, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ZHIPU_API_KEY}`,
        },
        timeout: REQUEST_TIMEOUT,
      });

      const data = response.data;
      if (data.choices && data.choices.length > 0) {
        const content: string = data.choices[0].message?.content || "";
        const usage: Record<string, number> = data.usage || {};

        logger.info('ZhipuAI', `响应成功 - tokens: ${usage.total_tokens || "未知"}`);

        return {
          content,
          usage,
          model: data.model,
          finishReason: data.choices[0].finish_reason,
        };
      }

      throw new Error("智谱 AI 返回了空的响应内容");
    } catch (error: any) {
      lastError = error;
      const errorMsg: string = error.response?.data?.error?.message || error.message;
      logger.error('ZhipuAI', `第 ${attempt} 次请求失败: ${errorMsg}`);

      if (!isRetryableError(error) || attempt === MAX_RETRIES) {
        break;
      }

      const delay: number = RETRY_DELAY * Math.pow(2, attempt - 1);
      logger.info('ZhipuAI', `${delay}ms 后重试...`);
      await sleep(delay);
    }
  }

  throw new Error(
    `智谱 AI 调用失败（已重试 ${MAX_RETRIES} 次）: ${lastError?.message || "未知错误"}`,
  );
}

/**
 * 调用智谱 AI API（流式模式）
 */
export async function* chatStream(options: ChatOptions): AsyncGenerator<string, void, unknown> {
  const {
    systemPrompt,
    userPrompt,
    model,
    temperature,
    maxTokens,
  } = options;

  const messages: Array<{ role: string; content: string }> = [];

  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }

  if (userPrompt) {
    messages.push({ role: "user", content: userPrompt });
  }

  const requestBody = {
    model: model || DEFAULT_MODEL,
    messages,
    temperature: temperature !== undefined ? temperature : 0.7,
    max_tokens: maxTokens || 4096,
    stream: true,
  };

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      logger.info('ZhipuAI', `流式请求 - 第 ${attempt} 次尝试 (模型: ${model || DEFAULT_MODEL})`);

      const response = await axios.post(ZHIPU_API_URL, requestBody, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ZHIPU_API_KEY}`,
        },
        timeout: REQUEST_TIMEOUT,
        responseType: "stream",
      });

      const stream = response.data;
      let buffer: string = "";

      for await (const chunk of stream) {
        buffer += chunk.toString();

        const lines: string[] = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed: string = line.trim();

          if (!trimmed || trimmed.startsWith(":")) {
            continue;
          }

          if (trimmed.startsWith("data: ")) {
            const dataStr: string = trimmed.slice(6);

            if (dataStr === "[DONE]") {
              logger.info('ZhipuAI', '流式响应完成');
              return;
            }

            try {
              const data = JSON.parse(dataStr);
              const delta: string | undefined = data.choices?.[0]?.delta?.content;

              if (delta) {
                yield delta;
              }

              if (data.choices?.[0]?.finish_reason) {
                logger.info('ZhipuAI', `流式响应完成 - finish_reason: ${data.choices[0].finish_reason}`);
                return;
              }
            } catch (parseError: any) {
              logger.warn('ZhipuAI', `解析流式数据失败: ${parseError.message}, 数据: ${dataStr}`);
            }
          }
        }
      }

      logger.info('ZhipuAI', '流式连接已关闭');
      return;
    } catch (error: any) {
      lastError = error;
      const errorMsg: string = error.response?.data?.error?.message || error.message;
      logger.error('ZhipuAI', `流式第 ${attempt} 次请求失败: ${errorMsg}`);

      if (!isRetryableError(error) || attempt === MAX_RETRIES) {
        break;
      }

      const delay: number = RETRY_DELAY * Math.pow(2, attempt - 1);
      logger.info('ZhipuAI', `${delay}ms 后重试...`);
      await sleep(delay);
    }
  }

  throw new Error(
    `智谱 AI 流式调用失败（已重试 ${MAX_RETRIES} 次）: ${lastError?.message || "未知错误"}`,
  );
}

/**
 * 将流式响应转换为完整文本
 */
export async function chatFullText(options: ChatOptions): Promise<string> {
  let fullText: string = "";
  for await (const chunk of chatStream(options)) {
    fullText += chunk;
  }
  return fullText;
}

export { DEFAULT_MODEL };
