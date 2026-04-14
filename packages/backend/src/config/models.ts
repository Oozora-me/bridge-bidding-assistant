/**
 * 模型配置模块
 *
 * 定义智谱免费模型的配置信息，包括上下文长度、并发限制等。
 * 可用模型列表参考官方定价页面：
 * https://open.bigmodel.cn/pricing
 */

// ============================================================
// 类型定义
// ============================================================

export interface ModelConfig {
  id: string           // 模型ID
  name: string         // 显示名称
  contextLength: number // 上下文长度(K)
  maxConcurrency: number // 官方最大并发数
  defaultRateLimit: number // 默认rate limit(最大并发的一半)
  enabled: boolean     // 是否启用
}

// ============================================================
// 常量
// ============================================================

/**
 * 可用模型列表
 *
 * - GLM-4-Flash:      免费, 128K上下文, 官方并发200, 默认rateLimit=100
 * - GLM-4.7-Flash:    免费, 200K上下文, 官方并发200, 默认rateLimit=100
 * - GLM-4V-Flash:     免费, 多模态, 官方并发200, 默认rateLimit=100 (暂不启用，纯文本场景)
 */
export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'GLM-4-Flash',
    name: 'GLM-4-Flash',
    contextLength: 128,
    maxConcurrency: 200,
    defaultRateLimit: 100,
    enabled: true,
  },
  {
    id: 'GLM-4.7-Flash',
    name: 'GLM-4.7-Flash',
    contextLength: 200,
    maxConcurrency: 200,
    defaultRateLimit: 100,
    enabled: true,
  },
  {
    id: 'GLM-4V-Flash',
    name: 'GLM-4V-Flash (多模态)',
    contextLength: 128,
    maxConcurrency: 200,
    defaultRateLimit: 100,
    enabled: false, // 暂不启用，纯文本场景
  },
];

// ============================================================
// 导出函数
// ============================================================

/**
 * 根据模型ID获取模型配置
 * @param modelId 模型ID
 * @returns 模型配置，未找到时返回 undefined
 */
export function getModelConfig(modelId: string): ModelConfig | undefined {
  return AVAILABLE_MODELS.find(m => m.id === modelId);
}

/**
 * 获取所有已启用的模型列表
 * @returns 已启用的模型配置数组
 */
export function getEnabledModels(): ModelConfig[] {
  return AVAILABLE_MODELS.filter(m => m.enabled);
}
