/**
 * Provider 注册表
 *
 * 管理所有已注册的 AI 提供商，提供按 ID 查找、
 * 获取模型配置等能力。
 */

import type { AIProvider, ProviderInfo, ModelConfig } from './types.js'
import { logger } from '../logger.js'

class ProviderRegistry {
  private providers = new Map<string, AIProvider>()

  register(provider: AIProvider): void {
    this.providers.set(provider.id, provider)
    logger.info('ProviderRegistry', `注册提供商: ${provider.name} (${provider.id})`)
  }

  getProvider(providerId: string): AIProvider | undefined {
    return this.providers.get(providerId)
  }

  getAllProviders(): AIProvider[] {
    return Array.from(this.providers.values())
  }

  getProviderInfo(): ProviderInfo[] {
    return this.getAllProviders().map(p => ({
      id: p.id,
      name: p.name,
      models: p.models.filter(m => m.enabled).map(({ id, name, contextLength, maxConcurrency, defaultRateLimit, dailyLimit }) => ({
        id, name, contextLength, maxConcurrency, defaultRateLimit, dailyLimit, enabled: true
      }))
    }))
  }

  /** 根据 providerId:modelId 查找模型配置 */
  getModelConfig(providerAndModel: string): { provider: AIProvider; model: ModelConfig } | undefined {
    const [providerId, modelId] = providerAndModel.split(':')
    if (!providerId || !modelId) return undefined
    const provider = this.providers.get(providerId)
    if (!provider) return undefined
    const model = provider.models.find(m => m.id === modelId)
    if (!model) return undefined
    return { provider, model }
  }
}

export const providerRegistry = new ProviderRegistry()
