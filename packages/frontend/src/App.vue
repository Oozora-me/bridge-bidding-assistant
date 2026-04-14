<template>
  <div class="app">
    <!-- 顶部工具栏 -->
    <header class="app-header">
      <div class="header-top">
        <h1 class="app-title">
          <span class="suit spade">♠</span>
          桥牌叫牌助手
          <span class="suit heart">♥</span>
        </h1>
        <div class="header-controls">
          <div class="system-pair">
            <div class="system-item">
              <label class="system-label">NS:</label>
              <SystemSelector v-model="nsSystem" compact />
            </div>
            <div class="system-item">
              <label class="system-label">EW:</label>
              <SystemSelector v-model="ewSystem" compact />
            </div>
          </div>
          <div class="dealer-selector">
            <label class="dealer-label">开叫人:</label>
            <select v-model="dealer" class="dealer-select">
              <option value="N">北 (N)</option>
              <option value="E">东 (E)</option>
              <option value="S">南 (S)</option>
              <option value="W">西 (W)</option>
            </select>
          </div>
        </div>
      </div>
      <div class="header-bottom">
        <div class="tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            :class="['tab-button', { active: activeTab === tab.id }]"
            @click="activeTab = tab.id"
          >
            {{ tab.name }}
          </button>
        </div>
      </div>
    </header>

    <!-- 主体：左右分栏 -->
    <main class="app-main">
      <!-- 左侧：操作区 -->
      <div class="panel-left">
        <!-- 牌型分析 -->
        <div v-show="activeTab === 'hand'" class="tab-pane">
          <HandInput v-model="hand" />
          <div class="analyze-actions">
            <button
              class="btn btn-primary btn-large"
              @click="doAnalyzeHand"
              :disabled="isAnalyzing || !hasAnyCard"
            >
              {{ isAnalyzing ? '分析中...' : '分析牌型' }}
            </button>
          </div>
        </div>

        <!-- 叫牌分析 -->
        <div v-show="activeTab === 'bidding'" class="tab-pane">
          <BiddingSequence
            v-model="biddingSequence"
            :current-player="nextPlayer"
          />
          <BiddingPad
            v-model="biddingSequence"
            :current-player="nextPlayer"
            :disabled-bids="disabledBidsSet"
          />
          <div class="analyze-actions">
            <button
              class="btn btn-primary btn-large"
              @click="doAnalyzeBidding"
              :disabled="isAnalyzing || biddingSequence.length === 0"
            >
              {{ isAnalyzing ? '分析中...' : '分析叫牌' }}
            </button>
          </div>
        </div>

        <!-- 叫牌建议 -->
        <div v-show="activeTab === 'suggest'" class="tab-pane">
          <div class="position-hint">
            🎯 你的方位：<strong>{{ suggestNextPlayer }}</strong>
            （{{ playerFullNames[suggestNextPlayer] }}）
          </div>
          <HandInput v-model="suggestHand" />
          <BiddingSequence
            v-model="suggestBiddingSequence"
            :current-player="suggestNextPlayer"
          />
          <BiddingPad
            v-model="suggestBiddingSequence"
            :current-player="suggestNextPlayer"
            :disabled-bids="suggestDisabledBidsSet"
          />
          <div class="analyze-actions">
            <button
              class="btn btn-primary btn-large"
              @click="doSuggestBid"
              :disabled="isAnalyzing || !hasAnySuggestCard"
            >
              {{ isAnalyzing ? '分析中...' : '获取叫牌建议' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 右侧：AI 分析结果 -->
      <div class="panel-right">
        <AnalysisResult
          :result="currentResult"
          :loading="isAnalyzing"
          @copy="copyResult"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useBridge } from './composables/useBridge'
import type { Hand, BidItem } from './composables/useBridge'
import { analyzeHand as apiAnalyzeHand, analyzeBidding as apiAnalyzeBidding, suggestBid as apiSuggestBid } from './api/bridge'

import SystemSelector from './components/SystemSelector.vue'
import HandInput from './components/HandInput.vue'
import BiddingPad from './components/BiddingPad.vue'
import BiddingSequence from './components/BiddingSequence.vue'
import AnalysisResult from './components/AnalysisResult.vue'

const { getNextPlayer, getDisabledBids } = useBridge()

const playerFullNames: Record<string, string> = { N: '北', E: '东', S: '南', W: '西' }

// 状态
const nsSystem = ref<string>('natural')
const ewSystem = ref<string>('natural')
const activeTab = ref<string>('hand')
const dealer = ref<string>('N')

const hand = ref<Hand>({ spades: '', hearts: '', diamonds: '', clubs: '' })
const biddingSequence = ref<BidItem[]>([])
const suggestHand = ref<Hand>({ spades: '', hearts: '', diamonds: '', clubs: '' })
const suggestBiddingSequence = ref<BidItem[]>([])

const isAnalyzing = ref<boolean>(false)
const handAnalysisResult = ref<string>('')
const biddingAnalysisResult = ref<string>('')
const suggestResult = ref<string>('')

const tabs = [
  { id: 'hand', name: '牌型分析' },
  { id: 'bidding', name: '叫牌分析' },
  { id: 'suggest', name: '叫牌建议' }
]

watch(dealer, () => {
  biddingSequence.value = []
  suggestBiddingSequence.value = []
})

const currentResult = computed<string>(() => {
  if (activeTab.value === 'hand') return handAnalysisResult.value
  if (activeTab.value === 'bidding') return biddingAnalysisResult.value
  if (activeTab.value === 'suggest') return suggestResult.value
  return ''
})

const hasAnyCard = computed<boolean>(() => !!(hand.value.spades || hand.value.hearts || hand.value.diamonds || hand.value.clubs))
const hasAnySuggestCard = computed<boolean>(() => !!(suggestHand.value.spades || suggestHand.value.hearts || suggestHand.value.diamonds || suggestHand.value.clubs))

const nextPlayer = computed<string>(() => getNextPlayer(biddingSequence.value, dealer.value))
const disabledBidsSet = computed<Set<string>>(() => getDisabledBids(biddingSequence.value))
const suggestNextPlayer = computed<string>(() => getNextPlayer(suggestBiddingSequence.value, dealer.value))
const suggestDisabledBidsSet = computed<Set<string>>(() => getDisabledBids(suggestBiddingSequence.value))

const doAnalyzeHand = async () => {
  isAnalyzing.value = true
  handAnalysisResult.value = ''
  try {
    handAnalysisResult.value = await apiAnalyzeHand({ hand: hand.value, nsSystem: nsSystem.value, ewSystem: ewSystem.value })
  } catch (error: unknown) {
    handAnalysisResult.value = `分析失败：${(error as Error).message}`
  } finally {
    isAnalyzing.value = false
  }
}

const doAnalyzeBidding = async () => {
  isAnalyzing.value = true
  biddingAnalysisResult.value = ''
  try {
    biddingAnalysisResult.value = await apiAnalyzeBidding({ sequence: biddingSequence.value, nsSystem: nsSystem.value, ewSystem: ewSystem.value })
  } catch (error: unknown) {
    biddingAnalysisResult.value = `分析失败：${(error as Error).message}`
  } finally {
    isAnalyzing.value = false
  }
}

const doSuggestBid = async () => {
  isAnalyzing.value = true
  suggestResult.value = ''
  try {
    suggestResult.value = await apiSuggestBid({ hand: suggestHand.value, sequence: suggestBiddingSequence.value, position: suggestNextPlayer.value, nsSystem: nsSystem.value, ewSystem: ewSystem.value })
  } catch (error: unknown) {
    suggestResult.value = `分析失败：${(error as Error).message}`
  } finally {
    isAnalyzing.value = false
  }
}

const copyResult = (text: string) => {
  navigator.clipboard.writeText(text).catch(() => {
    const textarea = document.createElement('textarea')
    textarea.value = text
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
  })
}
</script>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #1a472a 0%, #0d2818 100%);
  overflow: hidden;
}

.app-header {
  flex-shrink: 0;
  background: rgba(0, 0, 0, 0.35);
  border-bottom: 2px solid #2d5a3d;
}

.header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 1.5rem;
}

.app-title {
  font-size: 1.3rem;
  color: #fff;
  margin: 0;
  text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.5);
  white-space: nowrap;
}

.suit { font-size: 1.1rem; }
.suit.spade { color: #4a90d9; }
.suit.heart { color: #e74c3c; }

.header-controls {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

/* NS/EW 双体系选择 */
.system-pair {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.system-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.system-label {
  color: #a8d5a8;
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}

.dealer-selector {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.dealer-label {
  color: #a8d5a8;
  font-size: 0.8rem;
  white-space: nowrap;
}

.dealer-select {
  padding: 0.25rem 0.4rem;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid #2d5a3d;
  border-radius: 5px;
  color: #fff;
  font-size: 0.8rem;
  cursor: pointer;
  outline: none;
}

.dealer-select:hover { border-color: #3d7a4d; }
.dealer-select option { background: #1a472a; color: #fff; }

.header-bottom {
  display: flex;
  align-items: center;
  padding: 0 1.5rem 0.35rem;
}

.tabs { display: flex; gap: 0.35rem; }

.tab-button {
  padding: 0.3rem 0.8rem;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid #2d5a3d;
  color: #a8d5a8;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s ease;
  border-radius: 5px;
}

.tab-button:hover { background: rgba(255, 255, 255, 0.15); color: #fff; }
.tab-button.active { background: #2d5a3d; border-color: #3d7a4d; color: #fff; }

.app-main {
  flex: 1;
  display: flex;
  gap: 0.75rem;
  padding: 0.6rem 1.5rem;
  overflow: hidden;
  min-height: 0;
}

.panel-left {
  flex: 0 0 460px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tab-pane {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.panel-right {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
}

.analyze-actions {
  display: flex;
  justify-content: center;
  padding: 0.1rem 0;
}

.btn {
  padding: 0.4rem 1.3rem;
  font-size: 0.8rem;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-weight: 600;
}

.btn-primary {
  background: linear-gradient(135deg, #2d5a3d 0%, #1a472a 100%);
  color: #fff;
  border: 1px solid #3d7a4d;
}

.btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #3d7a4d 0%, #2d5a3d 100%);
  transform: translateY(-1px);
  box-shadow: 0 3px 8px rgba(45, 90, 61, 0.4);
}

.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

/* 加大分析按钮 */
.btn-large {
  padding: 0.6rem 2rem;
  font-size: 1rem;
  font-weight: 700;
  border-radius: 6px;
}

/* 叫牌建议 - 方位提示 */
.position-hint {
  background: rgba(74, 144, 217, 0.15);
  border: 1px solid rgba(74, 144, 217, 0.3);
  border-radius: 6px;
  padding: 0.3rem 0.6rem;
  color: #a8d5a8;
  font-size: 0.85rem;
  text-align: center;
}

.position-hint strong {
  color: #4a90d9;
  font-size: 1rem;
}

@media (max-width: 768px) {
  .app-main { flex-direction: column; overflow-y: auto; }
  .panel-left { flex: none; width: 100%; overflow-y: visible; }
  .panel-right { flex: none; min-height: 300px; }
  .header-top { flex-direction: column; gap: 0.3rem; align-items: flex-start; }
  .header-controls { width: 100%; flex-wrap: wrap; gap: 0.4rem; }
}

@media (max-width: 600px) {
  .header-top { padding: 0.3rem 1rem; }
  .header-bottom { padding: 0 1rem 0.25rem; }
  .app-main { padding: 0.4rem 1rem; }
  .app-title { font-size: 1rem; }
  .tab-button { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
}
</style>
