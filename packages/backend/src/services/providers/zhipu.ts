/**
 * 智谱 AI 提供商
 *
 * 封装智谱 GLM 系列模型的 API 调用，
 * 支持流式和非流式两种响应模式，包含错误处理和重试逻辑。
 */

import axios from 'axios'
import type { AIProvider, ChatOptions, ChatResult, ModelConfig } from './types.js'
import { logger } from '../logger.js'

// ============================================================
// 配置
// ============================================================

const ZHIPU_API_URL: string = 'https://open.bigmodel.cn/api/paas/v4/chat/completions'
const ZHIPU_API_KEY: string =
  process.env.ZHIPU_API_KEY || '8899210c8fad4beaabb34c509506456e.XfQQ9Rq5DZAUSehu'
const MAX_RETRIES: number = 3
const RETRY_DELAY: number = 1000
const REQUEST_TIMEOUT: number = 60000

/**
 * 可用免费模型列表
 *
 * 注：Cogview-3-Flash（图片生成）和 CogVideoX-Flash（视频生成）
 *     使用不同的 API 端点，无法用于文本对话分析，此处不纳入。
 *
 * - GLM-4-Flash:              免费, 128K上下文, 官方并发200
 * - GLM-4-Flash-250414:       免费, 128K上下文, 官方并发200 (带日期后缀的版本)
 * - GLM-4.7-Flash:            免费, 200K上下文, 官方并发200
 * - GLM-4V-Flash:             免费, 多模态(图片/视频/文本), 官方并发200
 * - GLM-4.6V-Flash:           免费, 多模态(图片/视频/文本), 官方并发200
 * - GLM-4.1V-Thinking-Flash:  免费, 视觉推理, 64K上下文, 官方并发200
 */
const models: ModelConfig[] = [
  // 非多模态（按并发数降序）
  { id: 'GLM-4-Flash', name: 'GLM-4-Flash', contextLength: 128, maxConcurrency: 200, defaultRateLimit: 100, enabled: true },
  { id: 'GLM-4-Flash-250414', name: 'GLM-4-Flash-250414', contextLength: 128, maxConcurrency: 5, defaultRateLimit: 3, enabled: true },
  { id: 'GLM-4.7-Flash', name: 'GLM-4.7-Flash', contextLength: 200, maxConcurrency: 1, defaultRateLimit: 1, enabled: true },
  // 多模态（按并发数降序）
  { id: 'GLM-4V-Flash', name: 'GLM-4V-Flash (多模态)', contextLength: 128, maxConcurrency: 10, defaultRateLimit: 5, enabled: true },
  { id: 'GLM-4.1V-Thinking-Flash', name: 'GLM-4.1V-Thinking-Flash (视觉推理)', contextLength: 64, maxConcurrency: 5, defaultRateLimit: 3, enabled: true },
  { id: 'GLM-4.6V-Flash', name: 'GLM-4.6V-Flash (多模态)', contextLength: 128, maxConcurrency: 1, defaultRateLimit: 1, enabled: true },
]

// ============================================================
// 工具函数
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableError(error: any): boolean {
  if (
    error.code === 'ECONNABORTED' ||
    error.code === 'ETIMEDOUT' ||
    error.code === 'ECONNRESET'
  ) {
    return true
  }
  if (error.response) {
    const status: number = error.response.status
    return status === 429 || (status >= 500 && status < 600)
  }
  if (!error.response && error.request) {
    return true
  }
  return false
}

// ============================================================
// ZhipuProvider 实现
// ============================================================

export class ZhipuProvider implements AIProvider {
  id = 'zhipu'
  name = '智谱AI'
  models = models

  /**
   * 调用智谱 AI API（非流式模式）
   */
  async chat(options: ChatOptions): Promise<ChatResult> {
    const {
      systemPrompt,
      userPrompt,
      model,
      temperature,
      maxTokens,
    } = options

    const modelId: string = model || this.models[0].id

    const messages: Array<{ role: string; content: string }> = []

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }

    if (userPrompt) {
      messages.push({ role: 'user', content: userPrompt })
    }

    const requestBody = {
      model: modelId,
      messages,
      temperature: temperature !== undefined ? temperature : 0.7,
      max_tokens: maxTokens || 4096,
      stream: false,
    }

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info('ZhipuAI', `非流式请求 - 第 ${attempt} 次尝试 (模型: ${modelId})`)

        const response = await axios.post(ZHIPU_API_URL, requestBody, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ZHIPU_API_KEY}`,
          },
          timeout: REQUEST_TIMEOUT,
        })

        const data = response.data
        if (data.choices && data.choices.length > 0) {
          const content: string = data.choices[0].message?.content || ''
          const usage: Record<string, number> = data.usage || {}

          logger.info('ZhipuAI', `响应成功 - tokens: ${usage.total_tokens || '未知'}`)

          return {
            content,
            usage,
            model: data.model,
            finishReason: data.choices[0].finish_reason,
          }
        }

        throw new Error('智谱 AI 返回了空的响应内容')
      } catch (error: any) {
        lastError = error
        const errorMsg: string = error.response?.data?.error?.message || error.message
        logger.error('ZhipuAI', `第 ${attempt} 次请求失败: ${errorMsg}`)

        if (!isRetryableError(error) || attempt === MAX_RETRIES) {
          break
        }

        const delay: number = RETRY_DELAY * Math.pow(2, attempt - 1)
        logger.info('ZhipuAI', `${delay}ms 后重试...`)
        await sleep(delay)
      }
    }

    throw new Error(
      `智谱 AI 调用失败（已重试 ${MAX_RETRIES} 次）: ${lastError?.message || '未知错误'}`,
    )
  }

  /**
   * 调用智谱 AI API（流式模式）
   */
  async *chatStream(options: ChatOptions): AsyncGenerator<string, void, unknown> {
    const {
      systemPrompt,
      userPrompt,
      model,
      temperature,
      maxTokens,
    } = options

    const modelId: string = model || this.models[0].id

    const messages: Array<{ role: string; content: string }> = []

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt })
    }

    if (userPrompt) {
      messages.push({ role: 'user', content: userPrompt })
    }

    const requestBody = {
      model: modelId,
      messages,
      temperature: temperature !== undefined ? temperature : 0.7,
      max_tokens: maxTokens || 4096,
      stream: true,
    }

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info('ZhipuAI', `流式请求 - 第 ${attempt} 次尝试 (模型: ${modelId})`)

        const response = await axios.post(ZHIPU_API_URL, requestBody, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${ZHIPU_API_KEY}`,
          },
          timeout: REQUEST_TIMEOUT,
          responseType: 'stream',
        })

        const stream = response.data
        let buffer: string = ''

        for await (const chunk of stream) {
          buffer += chunk.toString()

          const lines: string[] = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed: string = line.trim()

            if (!trimmed || trimmed.startsWith(':')) {
              continue
            }

            if (trimmed.startsWith('data: ')) {
              const dataStr: string = trimmed.slice(6)

              if (dataStr === '[DONE]') {
                logger.info('ZhipuAI', '流式响应完成')
                return
              }

              try {
                const data = JSON.parse(dataStr)
                const delta: string | undefined = data.choices?.[0]?.delta?.content

                if (delta) {
                  yield delta
                }

                if (data.choices?.[0]?.finish_reason) {
                  logger.info('ZhipuAI', `流式响应完成 - finish_reason: ${data.choices[0].finish_reason}`)
                  return
                }
              } catch (parseError: any) {
                logger.warn('ZhipuAI', `解析流式数据失败: ${parseError.message}, 数据: ${dataStr}`)
              }
            }
          }
        }

        logger.info('ZhipuAI', '流式连接已关闭')
        return
      } catch (error: any) {
        lastError = error
        const errorMsg: string = error.response?.data?.error?.message || error.message
        logger.error('ZhipuAI', `流式第 ${attempt} 次请求失败: ${errorMsg}`)

        if (!isRetryableError(error) || attempt === MAX_RETRIES) {
          break
        }

        const delay: number = RETRY_DELAY * Math.pow(2, attempt - 1)
        logger.info('ZhipuAI', `${delay}ms 后重试...`)
        await sleep(delay)
      }
    }

    throw new Error(
      `智谱 AI 流式调用失败（已重试 ${MAX_RETRIES} 次）: ${lastError?.message || '未知错误'}`,
    )
  }
}
