/**
 * Provider 配置管理模块
 *
 * 从 config/providers.json 加载 provider 配置（API Key、模型列表等），
 * 支持运行时读取和更新配置。
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ============================================================
// 类型定义
// ============================================================

export interface ModelConfigEntry {
  id: string
  name: string
  comment?: string
  contextLength: number
  maxConcurrency: number
  defaultRateLimit: number
  dailyLimit?: number
  enabled: boolean
}

export interface ProviderConfigEntry {
  name: string
  comment?: string
  enabled: boolean
  apiKey: string
  apiUrl: string
  temperature: number
  maxTokens: number
  defaultModelRateLimit?: number
  models: ModelConfigEntry[]
}

export interface ProvidersConfig {
  providers: Record<string, ProviderConfigEntry>
}

// ============================================================
// 配置加载
// ============================================================

const __dirname = dirname(fileURLToPath(import.meta.url))

function getConfigPath(): string {
  const candidates = [
    resolve(__dirname, '..', '..', 'config', 'providers.json'),
    resolve(__dirname, '..', '..', '..', 'config', 'providers.json'),
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return candidates[0]
}

let configPath = getConfigPath()
let config: ProvidersConfig

/**
 * 加载配置文件
 */
export function loadProvidersConfig(): ProvidersConfig {
  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8')
      config = JSON.parse(raw)
      console.log(`[ProvidersConfig] 加载配置成功: ${configPath}`)
    } catch (err) {
      console.error(`[ProvidersConfig] 加载配置失败:`, err)
      config = { providers: {} }
    }
  } else {
    console.log(`[ProvidersConfig] 配置文件不存在: ${configPath}`)
    config = { providers: {} }
  }
  return config
}

/**
 * 获取完整配置
 */
export function getProvidersConfig(): ProvidersConfig {
  return config
}

/**
 * 获取指定 provider 配置
 */
export function getProviderConfig(providerId: string): ProviderConfigEntry | undefined {
  return config.providers[providerId]
}

/**
 * 更新指定 provider 配置（写入文件）
 */
export function updateProviderConfig(providerId: string, updates: Partial<ProviderConfigEntry>): ProviderConfigEntry {
  if (!config.providers[providerId]) {
    throw new Error(`Provider ${providerId} 不存在`)
  }
  config.providers[providerId] = { ...config.providers[providerId], ...updates }
  saveConfig()
  return config.providers[providerId]
}

/**
 * 获取所有已启用的 provider 列表
 */
export function getEnabledProviders(): Array<{ id: string; config: ProviderConfigEntry }> {
  return Object.entries(config.providers)
    .filter(([, c]) => c.enabled && c.apiKey)
    .map(([id, c]) => ({ id, config: c }))
}

/**
 * 保存配置到文件
 */
function saveConfig(): void {
  try {
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8')
    console.log(`[ProvidersConfig] 配置已保存: ${configPath}`)
  } catch (err) {
    console.error(`[ProvidersConfig] 保存配置失败:`, err)
  }
}
