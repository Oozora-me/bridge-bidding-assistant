/**
 * 桥牌叫牌助手 - API 调用封装
 * 封装与后端通信的三个核心接口
 */

import type { Hand, BidItem } from '../composables/useBridge'

const BASE_URL = '/api'

export interface ModelInfo {
  id: string
  name: string
  contextLength: number
  maxConcurrency: number
  defaultRateLimit: number
}

interface AnalyzeHandParams {
  hand: Hand
  nsSystem: string
  ewSystem: string
  model?: string
}

interface AnalyzeBiddingParams {
  sequence: BidItem[]
  nsSystem: string
  ewSystem: string
  model?: string
}

interface SuggestBidParams {
  hand: Hand
  sequence: BidItem[]
  position: string
  nsSystem: string
  ewSystem: string
  model?: string
}

/**
 * 通用请求方法
 */
async function request(endpoint: string, data: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: '网络请求失败' }))
    throw new Error(errorData.error || `请求失败 (${response.status})`)
  }

  const result = await response.json()
  if (!result.success) throw new Error(result.error || '请求失败')
  return result.data?.content || ''
}

/**
 * 获取可用模型列表
 */
export async function getModels(): Promise<ModelInfo[]> {
  const response = await fetch(`${BASE_URL}/models`)

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: '网络请求失败' }))
    throw new Error(errorData.error || `请求失败 (${response.status})`)
  }

  const result = await response.json()
  if (!result.success) throw new Error(result.error || '请求失败')
  return result.data || []
}

/**
 * 分析手牌
 */
export async function analyzeHand(params: AnalyzeHandParams): Promise<string> {
  return request('/analyze-hand', {
    hand: params.hand,
    nsSystem: params.nsSystem,
    ewSystem: params.ewSystem,
    ...(params.model ? { model: params.model } : {})
  })
}

/**
 * 分析叫牌序列
 */
export async function analyzeBidding(params: AnalyzeBiddingParams): Promise<string> {
  const biddingSequence = (params.sequence || []).map((item: BidItem) => ({
    position: item.player,
    bid: item.bid
  }))
  return request('/analyze-bidding', {
    biddingSequence,
    nsSystem: params.nsSystem,
    ewSystem: params.ewSystem,
    ...(params.model ? { model: params.model } : {})
  })
}

/**
 * 获取叫牌建议
 */
export async function suggestBid(params: SuggestBidParams): Promise<string> {
  const biddingSequence = (params.sequence || []).map((item: BidItem) => ({
    position: item.player,
    bid: item.bid
  }))
  return request('/suggest-bid', {
    hand: params.hand,
    biddingSequence,
    position: params.position || 'S',
    nsSystem: params.nsSystem,
    ewSystem: params.ewSystem,
    ...(params.model ? { model: params.model } : {})
  })
}
