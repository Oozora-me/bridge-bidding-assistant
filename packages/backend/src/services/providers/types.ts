/**
 * AI 模型提供商抽象接口
 *
 * 定义所有 AI 提供商必须实现的统一接口，
 * 支持非流式和流式两种调用模式。
 */

export interface ChatOptions {
  systemPrompt?: string
  userPrompt?: string
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface ChatResult {
  content: string
  usage: Record<string, number>
  model: string
  finishReason?: string
}

export interface ModelConfig {
  id: string
  name: string
  contextLength: number  // K tokens
  maxConcurrency: number
  defaultRateLimit: number
  dailyLimit?: number
  enabled: boolean
}

export interface ProviderInfo {
  id: string           // 'zhipu' | 'github' | ...
  name: string         // '智谱AI' | 'GitHub Models' | ...
  models: ModelConfig[]
}

export interface AIProvider {
  id: string
  name: string
  models: ModelConfig[]
  chat(options: ChatOptions): Promise<ChatResult>
  chatStream(options: ChatOptions): AsyncGenerator<string, void, unknown>
}
