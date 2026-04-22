/**
 * DeepSeek AI 提供商
 *
 * 封装 DeepSeek 系列模型的 API 调用，
 * 支持流式和非流式两种响应模式，包含错误处理和重试逻辑。
 */

import axios from 'axios'
import type { AIProvider, ChatOptions, ChatResult, ModelConfig } from './types.js'
import type { ProviderConfigEntry } from '../../config/providersConfig.js'
import { logger } from '../logger.js'

// ============================================================
// 配置
// ============================================================

const DEFAULT_API_URL: string = 'https://api.deepseek.com/chat/completions'
const MAX_RETRIES: number = 3
const RETRY_DELAY: number = 1000
const REQUEST_TIMEOUT: number = 60000

/**
 * 默认可用模型列表
 *
 * - deepseek-chat:    DeepSeek V3, 64K上下文, 并发10, 限速5
 * - deepseek-reasoner: DeepSeek R1, 64K上下文, 并发5, 限速3
 */
const defaultModels: ModelConfig[] = [
  { id: 'deepseek-chat', name: 'DeepSeek V3', contextLength: 64, maxConcurrency: 10, defaultRateLimit: 5, enabled: true },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1', contextLength: 64, maxConcurrency: 5, defaultRateLimit: 3, enabled: true },
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
// DeepSeekProvider 实现
// ============================================================

export class DeepSeekProvider implements AIProvider {
  id = 'deepseek'
  name = 'DeepSeek'
  apiUrl: string
  apiKey: string
  defaultTemperature: number
  defaultMaxTokens: number
  models: ModelConfig[]

  constructor(config?: ProviderConfigEntry) {
    this.apiUrl = config?.apiUrl || DEFAULT_API_URL
    this.apiKey = config?.apiKey || process.env.DEEPSEEK_API_KEY || ''
    this.defaultTemperature = config?.temperature ?? 0.2
    this.defaultMaxTokens = config?.maxTokens || 4096
    this.name = config?.name || 'DeepSeek'
    this.models = (config?.models?.length ? config.models : defaultModels).map(m => ({
      id: m.id,
      name: m.name,
      contextLength: m.contextLength,
      maxConcurrency: m.maxConcurrency,
      defaultRateLimit: m.defaultRateLimit,
      dailyLimit: (m as any).dailyLimit,
      enabled: m.enabled,
    }))
  }

  /**
   * 调用 DeepSeek API（非流式模式）
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
      temperature: temperature !== undefined ? temperature : this.defaultTemperature,
      max_tokens: maxTokens || this.defaultMaxTokens,
      stream: false,
    }

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info('DeepSeek', `非流式请求 - 第 ${attempt} 次尝试 (模型: ${modelId})`)

        logger.debug('DeepSeek', `请求体: ${JSON.stringify(requestBody)}`)

        const response = await axios.post(this.apiUrl, requestBody, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: REQUEST_TIMEOUT,
        })

        const data = response.data

        logger.debug('DeepSeek', `响应体: ${JSON.stringify(data)}`)

        if (data.choices && data.choices.length > 0) {
          const content: string = data.choices[0].message?.content || ''
          const usage: Record<string, number> = data.usage || {}

          logger.info('DeepSeek', `响应成功 - tokens: ${usage.total_tokens || '未知'}`)

          return {
            content,
            usage,
            model: data.model,
            finishReason: data.choices[0].finish_reason,
          }
        }

        throw new Error('DeepSeek 返回了空的响应内容')
      } catch (error: any) {
        lastError = error
        const errorMsg: string = error.response?.data?.error?.message || error.message
        logger.error('DeepSeek', `第 ${attempt} 次请求失败: ${errorMsg}`)

        if (!isRetryableError(error) || attempt === MAX_RETRIES) {
          break
        }

        const delay: number = RETRY_DELAY * Math.pow(2, attempt - 1)
        logger.info('DeepSeek', `${delay}ms 后重试...`)
        await sleep(delay)
      }
    }

    throw new Error(
      `DeepSeek 调用失败（已重试 ${MAX_RETRIES} 次）: ${lastError?.message || '未知错误'}`,
    )
  }

  /**
   * 调用 DeepSeek API（流式模式）
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
      temperature: temperature !== undefined ? temperature : this.defaultTemperature,
      max_tokens: maxTokens || this.defaultMaxTokens,
      stream: true,
    }

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info('DeepSeek', `流式请求 - 第 ${attempt} 次尝试 (模型: ${modelId})`)

        logger.debug('DeepSeek', `请求体: ${JSON.stringify(requestBody)}`)

        const response = await axios.post(this.apiUrl, requestBody, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
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
                logger.info('DeepSeek', '流式响应完成')
                return
              }

              try {
                const data = JSON.parse(dataStr)

                logger.debug('DeepSeek', `响应体: ${JSON.stringify(data)}`)

                const delta: string | undefined = data.choices?.[0]?.delta?.content

                if (delta) {
                  yield delta
                }

                if (data.choices?.[0]?.finish_reason) {
                  logger.info('DeepSeek', `流式响应完成 - finish_reason: ${data.choices[0].finish_reason}`)
                  return
                }
              } catch (parseError: any) {
                logger.warn('DeepSeek', `解析流式数据失败: ${parseError.message}, 数据: ${dataStr}`)
              }
            }
          }
        }

        logger.info('DeepSeek', '流式连接已关闭')
        return
      } catch (error: any) {
        lastError = error
        const errorMsg: string = error.response?.data?.error?.message || error.message
        logger.error('DeepSeek', `流式第 ${attempt} 次请求失败: ${errorMsg}`)

        if (!isRetryableError(error) || attempt === MAX_RETRIES) {
          break
        }

        const delay: number = RETRY_DELAY * Math.pow(2, attempt - 1)
        logger.info('DeepSeek', `${delay}ms 后重试...`)
        await sleep(delay)
      }
    }

    throw new Error(
      `DeepSeek 流式调用失败（已重试 ${MAX_RETRIES} 次）: ${lastError?.message || '未知错误'}`,
    )
  }
}
