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
    id: 'GLM-4-Flash-250414',
    name: 'GLM-4-Flash-250414',
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
    enabled: true,
  },
  {
    id: 'GLM-4.6V-Flash',
    name: 'GLM-4.6V-Flash (多模态)',
    contextLength: 128,
    maxConcurrency: 200,
    defaultRateLimit: 100,
    enabled: true,
  },
  {
    id: 'GLM-4.1V-Thinking-Flash',
    name: 'GLM-4.1V-Thinking-Flash (视觉推理)',
    contextLength: 64,
    maxConcurrency: 200,
    defaultRateLimit: 100,
    enabled: true,
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
