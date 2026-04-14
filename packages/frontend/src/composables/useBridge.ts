/**
 * 桥牌逻辑 composable
 * 包含 HCP 计算、牌型分布、随机发牌、叫牌合法性判断等核心逻辑
 */

import { computed, ref } from 'vue'

// 类型定义
export interface BidItem {
  player: string
  bid: string
}

export interface Hand {
  spades: string
  hearts: string
  diamonds: string
  clubs: string
}

export interface ValidationResult {
  valid: boolean
  message: string
}

// 花色定义
export const SUITS: string[] = ['C', 'D', 'H', 'S']
export const SUIT_SYMBOLS: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
export const SUIT_NAMES: Record<string, string> = { S: '黑桃', H: '红心', D: '方块', C: '梅花' }
export const SUIT_COLORS: Record<string, string> = { S: '#4a90d9', H: '#e74c3c', D: '#f39c12', C: '#27ae60' }

// 牌面定义
export const RANKS: string[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2']

// HCP 点值
export const HCP_VALUES: Record<string, number> = { A: 4, K: 3, Q: 2, J: 1, T: 0, '9': 0, '8': 0, '7': 0, '6': 0, '5': 0, '4': 0, '3': 0, '2': 0 }

// 玩家位置
export const PLAYERS: string[] = ['N', 'E', 'S', 'W']
export const PLAYER_NAMES: Record<string, string> = { N: '北', E: '东', S: '南', W: '西' }

// 叫品级别
export const BID_LEVELS: number[] = [1, 2, 3, 4, 5, 6, 7]
// 叫品花色（含 NT）
export const BID_STRAINS: string[] = ['C', 'D', 'H', 'S', 'NT']

// 特殊叫品
export const BID_PASS: string = 'Pass'
export const BID_DOUBLE: string = 'X'
export const BID_REDOUBLE: string = 'XX'

/**
 * 桥牌逻辑 composable
 */
export function useBridge() {
  /**
   * 计算单门花色的 HCP
   * @param cards - 牌面字符串，如 "AKQJT"
   * @returns HCP 点力
   */
  function calculateSuitHCP(cards: string): number {
    if (!cards) return 0
    let hcp = 0
    for (const card of cards.toUpperCase()) {
      hcp += HCP_VALUES[card] || 0
    }
    return hcp
  }

  /**
   * 计算整手牌的 HCP
   * @param hand - 手牌 { spades, hearts, diamonds, clubs }
   * @returns 总 HCP
   */
  function calculateHCP(hand: Hand): number {
    return (
      calculateSuitHCP(hand.spades) +
      calculateSuitHCP(hand.hearts) +
      calculateSuitHCP(hand.diamonds) +
      calculateSuitHCP(hand.clubs)
    )
  }

  /**
   * 计算牌型分布
   * @param hand - 手牌
   * @returns 牌型分布字符串，如 "4-4-3-2"
   */
  function calculateDistribution(hand: Hand): string {
    const lengths = [
      (hand.spades || '').length,
      (hand.hearts || '').length,
      (hand.diamonds || '').length,
      (hand.clubs || '').length
    ]
    return lengths.sort((a: number, b: number) => b - a).join('-')
  }

  /**
   * 验证牌面输入是否合法
   * @param cards - 牌面字符串
   * @returns 是否合法
   */
  function isValidCards(cards: string): boolean {
    if (!cards) return true
    const validRanks = new Set(RANKS)
    const seen = new Set<string>()
    for (const card of cards.toUpperCase()) {
      if (!validRanks.has(card)) return false
      if (seen.has(card)) return false // 重复牌
      seen.add(card)
    }
    return true
  }

  /**
   * 验证整手牌是否合法
   * @param hand - 手牌
   * @returns 验证结果
   */
  function validateHand(hand: Hand): ValidationResult {
    const allCards = new Set<string>()
    const suits = [
      { name: '黑桃', cards: hand.spades },
      { name: '红心', cards: hand.hearts },
      { name: '方块', cards: hand.diamonds },
      { name: '梅花', cards: hand.clubs }
    ]

    for (const suit of suits) {
      if (!suit.cards) continue
      for (const card of suit.cards.toUpperCase()) {
        if (!RANKS.includes(card)) {
          return { valid: false, message: `${suit.name}中包含无效牌面: ${card}` }
        }
        if (allCards.has(card)) {
          return { valid: false, message: `牌面 ${card} 重复出现` }
        }
        allCards.add(card)
      }
    }

    return { valid: true, message: '' }
  }

  /**
   * 随机发牌
   * @returns 随机手牌 { spades, hearts, diamonds, clubs }
   */
  function dealRandomHand(): Hand {
    // 创建一副牌
    const deck: string[] = []
    for (const rank of RANKS) {
      deck.push(rank)
    }

    // 洗牌（Fisher-Yates）
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[deck[i], deck[j]] = [deck[j], deck[i]]
    }

    // 分配到四门花色（每门 3-4 张，总共 13 张）
    // 先随机分配每门花色的张数
    const distribution = generateRandomDistribution()

    let cardIndex = 0
    const hand: Hand = { spades: '', hearts: '', diamonds: '', clubs: '' }

    // 按花色分配牌
    const suitKeys: (keyof Hand)[] = ['spades', 'hearts', 'diamonds', 'clubs']
    for (let i = 0; i < 4; i++) {
      const count = distribution[i]
      const cards = deck.slice(cardIndex, cardIndex + count)
      // 按大小排序（A 最大）
      cards.sort((a: string, b: string) => RANKS.indexOf(a) - RANKS.indexOf(b))
      hand[suitKeys[i]] = cards.join('')
      cardIndex += count
    }

    return hand
  }

  /**
   * 生成随机牌型分布（4 个数之和为 13）
   * @returns 四门花色的张数
   */
  function generateRandomDistribution(): number[] {
    // 使用加权随机，使常见牌型更可能出现
    const distributions: number[][] = [
      [4, 4, 3, 2], [4, 3, 3, 3], [5, 3, 3, 2], [5, 4, 2, 2],
      [4, 4, 4, 1], [5, 4, 3, 1], [6, 3, 2, 2], [6, 4, 2, 1],
      [5, 5, 2, 1], [6, 3, 3, 1], [4, 3, 3, 3], [5, 4, 4, 0],
      [6, 4, 3, 0], [7, 3, 2, 1], [7, 2, 2, 2], [6, 5, 1, 1],
      [7, 4, 1, 1], [7, 4, 2, 0], [8, 2, 2, 1], [8, 3, 1, 1]
    ]
    return distributions[Math.floor(Math.random() * distributions.length)]
  }

  /**
   * 将叫品字符串转为数值（用于比较大小）
   * @param bid - 叫品字符串，如 "1H", "3NT"
   * @returns 数值，特殊叫品返回 null
   */
  function bidToValue(bid: string): number | null {
    if (!bid || bid === BID_PASS || bid === BID_DOUBLE || bid === BID_REDOUBLE) {
      return null
    }
    const match = bid.match(/^(\d)(C|D|H|S|NT)$/i)
    if (!match) return null
    const level = parseInt(match[1])
    const strainIndex = BID_STRAINS.indexOf(match[2].toUpperCase())
    return (level - 1) * 5 + strainIndex
  }

  /**
   * 判断叫品是否合法（必须高于当前最高叫品）
   * @param bid - 待判断的叫品
   * @param sequence - 当前叫牌序列
   * @returns 是否合法
   */
  function isBidLegal(bid: string, sequence: BidItem[]): boolean {
    // Pass 始终合法
    if (bid === BID_PASS) return true

    // 找到当前最高叫品
    let highestValue = -1
    let hasBid = false
    for (const item of sequence) {
      const value = bidToValue(item.bid)
      if (value !== null) {
        hasBid = true
        if (value > highestValue) {
          highestValue = value
        }
      }
    }

    // 如果还没有实际叫品，任何叫品都合法
    if (!hasBid) return bid !== BID_DOUBLE && bid !== BID_REDOUBLE

    const bidValue = bidToValue(bid)

    // 实际叫品必须高于最高叫品
    if (bidValue !== null) {
      return bidValue > highestValue
    }

    // Double: 对方叫过牌且未被加倍
    if (bid === BID_DOUBLE) {
      // 找到最后一个实际叫品
      let lastBidder: string | null = null
      for (let i = sequence.length - 1; i >= 0; i--) {
        if (bidToValue(sequence[i].bid) !== null) {
          lastBidder = sequence[i].player
          break
        }
      }
      // 最后一个叫品必须是对方的
      if (!lastBidder) return false
      const lastBidderSide = (lastBidder === 'N' || lastBidder === 'S') ? 'NS' : 'EW'
      const currentPlayerSide = 'NS' // 简化处理
      if (lastBidderSide === currentPlayerSide) return false

      // 检查是否已经被加倍
      for (let i = sequence.length - 1; i >= 0; i--) {
        if (sequence[i].bid === BID_DOUBLE) return false
        if (bidToValue(sequence[i].bid) !== null) break
      }
      return true
    }

    // Redouble: 对方加倍了我方的叫品
    if (bid === BID_REDOUBLE) {
      // 找到最后一个加倍
      let lastDouble = false
      for (let i = sequence.length - 1; i >= 0; i--) {
        if (sequence[i].bid === BID_REDOUBLE) return false
        if (sequence[i].bid === BID_DOUBLE) {
          lastDouble = true
          break
        }
        if (bidToValue(sequence[i].bid) !== null) break
      }
      return lastDouble
    }

    return false
  }

  /**
   * 获取当前应该叫牌的玩家
   * @param sequence - 叫牌序列
   * @param dealer - 开叫人（庄家）'N'|'E'|'S'|'W'，默认 'N'
   * @returns 当前玩家
   */
  function getNextPlayer(sequence: BidItem[], dealer: string = 'N'): string {
    if (sequence.length === 0) return dealer
    const lastPlayer = sequence[sequence.length - 1].player
    const index = PLAYERS.indexOf(lastPlayer)
    return PLAYERS[(index + 1) % 4]
  }

  /**
   * 获取已叫过的叫品集合（用于置灰显示）
   * @param sequence - 叫牌序列
   * @returns 已叫过的叫品
   */
  function getCalledBids(sequence: BidItem[]): Set<string> {
    const called = new Set<string>()
    for (const item of sequence) {
      called.add(item.bid)
    }
    return called
  }

  /**
   * 获取当前不可用的叫品（低于最高叫品的实际叫品）
   * @param sequence - 叫牌序列
   * @returns 不可用的叫品
   */
  function getDisabledBids(sequence: BidItem[]): Set<string> {
    const disabled = new Set<string>()
    let highestValue = -1
    let hasBid = false

    for (const item of sequence) {
      const value = bidToValue(item.bid)
      if (value !== null) {
        hasBid = true
        if (value > highestValue) {
          highestValue = value
        }
      }
    }

    if (hasBid) {
      // 禁用所有低于或等于最高叫品的叫品
      for (const level of BID_LEVELS) {
        for (const strain of BID_STRAINS) {
          const bid = `${level}${strain}`
          const value = bidToValue(bid)
          if (value !== null && value <= highestValue) {
            disabled.add(bid)
          }
        }
      }
    }

    return disabled
  }

  return {
    // 常量
    SUITS,
    SUIT_SYMBOLS,
    SUIT_NAMES,
    SUIT_COLORS,
    RANKS,
    HCP_VALUES,
    PLAYERS,
    PLAYER_NAMES,
    BID_LEVELS,
    BID_STRAINS,
    BID_PASS,
    BID_DOUBLE,
    BID_REDOUBLE,

    // 方法
    calculateSuitHCP,
    calculateHCP,
    calculateDistribution,
    isValidCards,
    validateHand,
    dealRandomHand,
    bidToValue,
    isBidLegal,
    getNextPlayer,
    getCalledBids,
    getDisabledBids
  }
}
