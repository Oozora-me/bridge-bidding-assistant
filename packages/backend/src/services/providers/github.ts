/**
 * GitHub Models 提供商
 *
 * 通过 GitHub Models API（OpenAI 兼容格式）调用各种开源模型，
 * 支持流式和非流式两种响应模式，包含错误处理和重试逻辑。
 *
 * 环境变量: GITHUB_TOKEN（GitHub Personal Access Token）
 */

import axios from 'axios'
import type { AIProvider, ChatOptions, ChatResult, ModelConfig } from './types.js'
import { logger } from '../logger.js'

// ============================================================
// 配置
// ============================================================

const GITHUB_API_URL: string = 'https://models.inference.ai.azure.com/chat/completions'
const GITHUB_TOKEN: string = process.env.GITHUB_TOKEN || ''
const MAX_RETRIES: number = 3
const RETRY_DELAY: number = 1000
const REQUEST_TIMEOUT: number = 60000

/**
 * GitHub 免费模型列表
 *
 * 基于 GitHub Models 官方文档，使用 OpenAI 兼容 API 格式。
 */
const models: ModelConfig[] = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextLength: 128, maxConcurrency: 10, defaultRateLimit: 5, enabled: true },
  { id: 'Meta-Llama-3.1-8B-Instruct', name: 'Llama 3.1 8B', contextLength: 128, maxConcurrency: 10, defaultRateLimit: 5, enabled: true },
  { id: 'Meta-Llama-3.1-70B-Instruct', name: 'Llama 3.1 70B', contextLength: 128, maxConcurrency: 5, defaultRateLimit: 3, enabled: true },
  { id: 'Mistral-large-2407', name: 'Mistral Large', contextLength: 128, maxConcurrency: 5, defaultRateLimit: 3, enabled: true },
  { id: 'Phi-3.5-mini-instruct', name: 'Phi 3.5 Mini', contextLength: 128, maxConcurrency: 10, defaultRateLimit: 5, enabled: true },
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
// GitHubProvider 实现
// ============================================================

export class GitHubProvider implements AIProvider {
  id = 'github'
  name = 'GitHub Models'
  models = models

  /**
   * 调用 GitHub Models API（非流式模式）
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

    if (!GITHUB_TOKEN) {
      throw new Error('GitHub Models 未配置 GITHUB_TOKEN 环境变量')
    }

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
    }

    let lastError: Error | null = null

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info('GitHubModels', `非流式请求 - 第 ${attempt} 次尝试 (模型: ${modelId})`)

        const response = await axios.post(GITHUB_API_URL, requestBody, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${GITHUB_TOKEN}`,
          },
          timeout: REQUEST_TIMEOUT,
        })

        const data = response.data
        if (data.choices && data.choices.length > 0) {
          const content: string = data.choices[0].message?.content || ''
          const usage: Record<string, number> = data.usage || {}

          logger.info('GitHubModels', `响应成功 - tokens: ${usage.total_tokens || '未知'}`)

          return {
            content,
            usage,
            model: data.model,
            finishReason: data.choices[0].finish_reason,
          }
        }

        throw new Error('GitHub Models 返回了空的响应内容')
      } catch (error: any) {
        lastError = error
        const errorMsg: string = error.response?.data?.error?.message || error.message
        logger.error('GitHubModels', `第 ${attempt} 次请求失败: ${errorMsg}`)

        if (!isRetryableError(error) || attempt === MAX_RETRIES) {
          break
        }

        const delay: number = RETRY_DELAY * Math.pow(2, attempt - 1)
        logger.info('GitHubModels', `${delay}ms 后重试...`)
        await sleep(delay)
      }
    }

    throw new Error(
      `GitHub Models 调用失败（已重试 ${MAX_RETRIES} 次）: ${lastError?.message || '未知错误'}`,
    )
  }

  /**
   * 调用 GitHub Models API（流式模式）
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

    if (!GITHUB_TOKEN) {
      throw new Error('GitHub Models 未配置 GITHUB_TOKEN 环境变量')
    }

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
        logger.info('GitHubModels', `流式请求 - 第 ${attempt} 次尝试 (模型: ${modelId})`)

        const response = await axios.post(GITHUB_API_URL, requestBody, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${GITHUB_TOKEN}`,
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
                logger.info('GitHubModels', '流式响应完成')
                return
              }

              try {
                const data = JSON.parse(dataStr)
                const delta: string | undefined = data.choices?.[0]?.delta?.content

                if (delta) {
                  yield delta
                }

                if (data.choices?.[0]?.finish_reason) {
                  logger.info('GitHubModels', `流式响应完成 - finish_reason: ${data.choices[0].finish_reason}`)
                  return
                }
              } catch (parseError: any) {
                logger.warn('GitHubModels', `解析流式数据失败: ${parseError.message}, 数据: ${dataStr}`)
              }
            }
          }
        }

        logger.info('GitHubModels', '流式连接已关闭')
        return
      } catch (error: any) {
        lastError = error
        const errorMsg: string = error.response?.data?.error?.message || error.message
        logger.error('GitHubModels', `流式第 ${attempt} 次请求失败: ${errorMsg}`)

        if (!isRetryableError(error) || attempt === MAX_RETRIES) {
          break
        }

        const delay: number = RETRY_DELAY * Math.pow(2, attempt - 1)
        logger.info('GitHubModels', `${delay}ms 后重试...`)
        await sleep(delay)
      }
    }

    throw new Error(
      `GitHub Models 流式调用失败（已重试 ${MAX_RETRIES} 次）: ${lastError?.message || '未知错误'}`,
    )
  }
}
