/**
 * 桥牌叫牌助手 - API 调用封装
 * 封装与后端通信的三个核心接口
 */

const BASE_URL = '/api'

/**
 * 通用请求方法
 */
async function request(endpoint, data) {
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
 * 分析手牌
 */
export async function analyzeHand(params) {
  return request('/analyze-hand', {
    hand: params.hand,
    nsSystem: params.nsSystem,
    ewSystem: params.ewSystem
  })
}

/**
 * 分析叫牌序列
 */
export async function analyzeBidding(params) {
  const biddingSequence = (params.sequence || []).map(item => ({
    position: item.player || item.position,
    bid: item.bid
  }))
  return request('/analyze-bidding', {
    biddingSequence,
    nsSystem: params.nsSystem,
    ewSystem: params.ewSystem
  })
}

/**
 * 获取叫牌建议
 */
export async function suggestBid(params) {
  const biddingSequence = (params.sequence || []).map(item => ({
    position: item.player || item.position,
    bid: item.bid
  }))
  return request('/suggest-bid', {
    hand: params.hand,
    biddingSequence,
    position: params.position || 'S',
    nsSystem: params.nsSystem,
    ewSystem: params.ewSystem
  })
}
