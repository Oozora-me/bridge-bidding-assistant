/**
 * 用量追踪模块
 *
 * 追踪每个模型的 API 调用情况，支持多维度限制：
 * - 每分钟请求数（rate limit，per-IP，在中间件中检查）
 * - 每日成功请求数（daily limit，全局）
 * - 最大并发数（concurrency limit，全局）
 *
 * 注意：
 * - 每日计数只统计成功请求（AI 返回有效结果）
 * - 并发计数在请求开始时 +1，结束时 -1（无论成功失败）
 * - 每日成功数持久化到 JSON 文件，服务重启不丢失
 * - 每日零点自动重置日计数
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

// ============================================================
// 类型定义
// ============================================================

export interface UsageSummary {
  modelKey: string
  modelName: string
  providerName: string
  todayCount: number
  todayLimit: number | null
  todayRemaining: number | null
  minuteLimit: number
  maxConcurrency: number
}

interface UsageEntry {
  todaySuccessCount: number
  currentConcurrency: number
  lastMinuteTimestamp: number
  currentMinuteCount: number
}

interface PersistentData {
  // "YYYY-MM-DD" -> { modelKey -> count }
  history: Record<string, Record<string, number>>
}

// ============================================================
// 文件持久化
// ============================================================

const __dirname = dirname(fileURLToPath(import.meta.url))

function getDataDir(): string {
  const candidates = [
    resolve(__dirname, '..', '..', 'data'),
    resolve(__dirname, '..', '..', '..', 'data'),
  ]
  for (const dir of candidates) {
    if (existsSync(dir)) return dir
  }
  return candidates[0]
}

function getUsageFilePath(): string {
  const dir = getDataDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return resolve(dir, 'usage.json')
}

function loadPersistentData(): PersistentData {
  const filePath = getUsageFilePath()
  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, 'utf-8')
      const data = JSON.parse(raw)
      // 兼容旧格式迁移
      if (data.date && data.counts && !data.history) {
        return { history: { [data.date]: data.counts } }
      }
      return data
    } catch {
      // 文件损坏，忽略
    }
  }
  return { history: {} }
}

function savePersistentData(data: PersistentData): void {
  try {
    const filePath = getUsageFilePath()
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch (err) {
    console.error('[UsageTracker] 保存用量数据失败:', err)
  }
}

// ============================================================
// 用量存储
// ============================================================

const usageMap = new Map<string, UsageEntry>();
let lastResetDate: string = '';
let persistentData: PersistentData = loadPersistentData();

/**
 * 每日零点重置
 */
function checkDailyReset(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (lastResetDate !== today) {
    // 从持久化数据恢复今日计数（如果是同一天重启）
    const todayHistory = persistentData.history[today];
    if (todayHistory) {
      for (const [modelKey, count] of Object.entries(todayHistory)) {
        if (!usageMap.has(modelKey)) {
          usageMap.set(modelKey, {
            todaySuccessCount: count,
            currentConcurrency: 0,
            lastMinuteTimestamp: Date.now(),
            currentMinuteCount: 0,
          });
        } else {
          usageMap.get(modelKey)!.todaySuccessCount = count;
        }
      }
      console.log(`[UsageTracker] 从文件恢复今日用量: ${today}, ${Object.keys(todayHistory).length} 个模型`);
    } else {
      // 新的一天，清空内存中的今日计数（历史数据保留在文件中）
      usageMap.clear();
      console.log(`[UsageTracker] 新的一天，用量已重置: ${today}`);
    }
    lastResetDate = today;
  }
}

/**
 * 确保条目存在
 */
function ensureEntry(modelKey: string): void {
  if (!usageMap.has(modelKey)) {
    usageMap.set(modelKey, {
      todaySuccessCount: 0,
      currentConcurrency: 0,
      lastMinuteTimestamp: Date.now(),
      currentMinuteCount: 0,
    });
  }
}

/**
 * 持久化当前用量到文件
 */
function persistUsage(): void {
  const today = new Date().toISOString().slice(0, 10);
  const counts: Record<string, number> = {};
  for (const [modelKey, entry] of usageMap) {
    if (entry.todaySuccessCount > 0) {
      counts[modelKey] = entry.todaySuccessCount;
    }
  }
  // 更新今日记录，保留历史
  persistentData.history[today] = counts;
  savePersistentData(persistentData);
}

// ============================================================
// 核心方法
// ============================================================

/**
 * 检查是否允许请求（多维度检查）
 */
export function checkUsage(modelKey: string, limits: {
  minuteLimit: number
  maxConcurrency: number
  dailyLimit?: number
}): { allowed: boolean; reason?: string } {
  checkDailyReset();
  ensureEntry(modelKey);

  const usage = usageMap.get(modelKey)!;
  const now = Date.now();
  const minuteWindow = 60 * 1000;

  // 1. 并发数检查
  if (usage.currentConcurrency >= limits.maxConcurrency) {
    return {
      allowed: false,
      reason: `并发请求已达上限 (${usage.currentConcurrency}/${limits.maxConcurrency})`,
    };
  }

  // 2. 每分钟限速检查
  if (now - usage.lastMinuteTimestamp >= minuteWindow) {
    usage.currentMinuteCount = 0;
    usage.lastMinuteTimestamp = now;
  }
  if (usage.currentMinuteCount >= limits.minuteLimit) {
    return {
      allowed: false,
      reason: `每分钟请求已达上限 (${usage.currentMinuteCount}/${limits.minuteLimit})`,
    };
  }

  // 3. 每日限额检查（只看成功数）
  if (limits.dailyLimit && usage.todaySuccessCount >= limits.dailyLimit) {
    return {
      allowed: false,
      reason: `每日请求已达上限 (${usage.todaySuccessCount}/${limits.dailyLimit})，明天重置`,
    };
  }

  return { allowed: true };
}

/**
 * 记录并发请求开始（中间件调用）
 */
export function recordConcurrencyStart(modelKey: string): void {
  checkDailyReset();
  ensureEntry(modelKey);
  const usage = usageMap.get(modelKey)!;
  usage.currentConcurrency++;
  usage.currentMinuteCount++;
}

/**
 * 记录并发请求结束（中间件调用，无论成功失败）
 */
export function recordConcurrencyEnd(modelKey: string): void {
  const usage = usageMap.get(modelKey);
  if (usage && usage.currentConcurrency > 0) {
    usage.currentConcurrency--;
  }
}

/**
 * 记录一次成功请求（API handler 成功时调用）
 * 同时持久化到文件
 */
export function recordSuccess(modelKey: string): void {
  checkDailyReset();
  ensureEntry(modelKey);
  const usage = usageMap.get(modelKey)!;
  usage.todaySuccessCount++;
  persistUsage();
}

/**
 * 获取所有模型的用量摘要
 */
export function getUsageSummary(modelConfigs: Array<{
  modelKey: string
  modelName: string
  providerName: string
  minuteLimit: number
  maxConcurrency: number
  dailyLimit?: number
}>): UsageSummary[] {
  checkDailyReset();

  return modelConfigs.map(config => {
    const usage = usageMap.get(config.modelKey);
    const todayCount = usage?.todaySuccessCount || 0;
    const todayLimit = config.dailyLimit ?? null;
    const todayRemaining = todayLimit !== null ? Math.max(0, todayLimit - todayCount) : null;

    return {
      modelKey: config.modelKey,
      modelName: config.modelName,
      providerName: config.providerName,
      todayCount,
      todayLimit,
      todayRemaining,
      minuteLimit: config.minuteLimit,
      maxConcurrency: config.maxConcurrency,
    };
  });
}
