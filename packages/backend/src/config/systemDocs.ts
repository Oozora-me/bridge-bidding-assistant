/**
 * 叫牌体系文档加载模块
 *
 * 启动时从 docs/ 目录加载体系规则文档（Markdown 格式），
 * 作为 AI 提示词的完整体系规则基础。
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

/**
 * 标准化体系 ID（支持别名）
 */
function normalizeSystemId(systemId: string): string {
  if (!systemId) return 'natural-2over1'
  const id = systemId.toLowerCase().trim()
  if (id === 'natural' || id === 'natural-2over1' || id === '2over1' || id === '2/1') return 'natural-2over1'
  if (id === 'precision' || id === '精确') return 'precision'
  return id
}

// 体系文档缓存
const systemDocsCache: Record<string, string> = {
  'natural-2over1': '',
  'precision': ''
}

/**
 * 获取 docs 目录路径
 * tsx 开发时: src/config/ -> ../../../.. -> 项目根目录 (tsx 会多加一层 src)
 * 编译后: dist/config/ -> ../../../.. -> 项目根目录
 */
function getDocsDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url))
  // 尝试多个路径，兼容 tsx 开发和编译后运行
  const candidates = [
    resolve(currentDir, '..', '..', '..', '..', 'docs'),  // tsx: src/config/ -> packages/backend/src/config/ -> 4级
    resolve(currentDir, '..', '..', '..', 'docs'),          // 编译后: dist/config/ -> 3级
  ]
  for (const dir of candidates) {
    if (existsSync(dir)) return dir
  }
  // 默认返回三级路径
  return candidates[1]
}

/**
 * 初始化：加载所有体系文档
 */
export function initSystemDocs(): void {
  const docsDir = getDocsDir()
  console.log(`[SystemDocs] docs 目录: ${docsDir}`)

  loadDoc('natural-2over1', resolve(docsDir, 'bidding-systems', '2-1-GF-System.md'))
  loadDoc('precision', resolve(docsDir, 'bidding-systems', 'Precision-System.md'))

  const loaded = Object.entries(systemDocsCache)
    .filter(([, content]) => content.length > 0)
    .map(([id]) => id)

  if (loaded.length > 0) {
    console.log(`[SystemDocs] 已加载体系文档: ${loaded.join(', ')}`)
  }
}

/**
 * 获取指定体系的完整规则文档内容
 * 支持别名：natural -> natural-2over1
 */
export function getSystemDocContent(systemId: string): string {
  const normalizedId = normalizeSystemId(systemId)
  return systemDocsCache[normalizedId] || systemDocsCache['natural-2over1'] || ''
}

/**
 * 加载单个体系文档
 */
function loadDoc(systemId: string, filePath: string): void {
  if (existsSync(filePath)) {
    try {
      const content = readFileSync(filePath, 'utf-8')
      systemDocsCache[systemId] = content
      console.log(`[SystemDocs] 加载 ${filePath} 成功 (${content.length} 字符)`)
    } catch (err) {
      console.error(`[SystemDocs] 加载 ${filePath} 失败:`, err)
    }
  } else {
    console.log(`[SystemDocs] ${filePath} 不存在，跳过`)
  }
}
