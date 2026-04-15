<template>
  <div class="hand-input">
    <div class="hand-input-header">
      <h3 class="hand-input-title">输入手牌</h3>
      <div class="header-actions">
        <button class="btn-small" @click="randomDeal">
          随机发牌
        </button>
        <button class="btn-small" @click="clearHand">
          清空
        </button>
      </div>
    </div>

    <div class="hand-input-grid">
      <!-- 黑桃 -->
      <div class="suit-row">
        <span class="suit-label spade">♠</span>
        <input
          type="text"
          class="card-input"
          v-model="localHand.spades"
          placeholder="如 AKQJT"
          maxlength="13"
          @input="onInput('spades')"
          :class="{ error: errors.spades }"
        />
        <span class="card-count">{{ (localHand.spades || '').length }}</span>
      </div>

      <!-- 红心 -->
      <div class="suit-row">
        <span class="suit-label heart">♥</span>
        <input
          type="text"
          class="card-input"
          v-model="localHand.hearts"
          placeholder="如 AKQJT"
          maxlength="13"
          @input="onInput('hearts')"
          :class="{ error: errors.hearts }"
        />
        <span class="card-count">{{ (localHand.hearts || '').length }}</span>
      </div>

      <!-- 方块 -->
      <div class="suit-row">
        <span class="suit-label diamond">♦</span>
        <input
          type="text"
          class="card-input"
          v-model="localHand.diamonds"
          placeholder="如 AKQJT"
          maxlength="13"
          @input="onInput('diamonds')"
          :class="{ error: errors.diamonds }"
        />
        <span class="card-count">{{ (localHand.diamonds || '').length }}</span>
      </div>

      <!-- 梅花 -->
      <div class="suit-row">
        <span class="suit-label club">♣</span>
        <input
          type="text"
          class="card-input"
          v-model="localHand.clubs"
          placeholder="如 AKQJT"
          maxlength="13"
          @input="onInput('clubs')"
          :class="{ error: errors.clubs }"
        />
        <span class="card-count">{{ (localHand.clubs || '').length }}</span>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMessage" class="error-message">
      {{ errorMessage }}
    </div>

    <!-- 统计信息 - 单行紧凑显示 -->
    <div class="hand-stats-inline">
      <span class="stat-chip hcp">HCP: <strong>{{ hcp }}</strong></span>
      <span class="stat-separator">|</span>
      <span class="stat-chip distribution">{{ distribution }}</span>
      <span class="stat-separator">|</span>
      <span class="stat-chip" :class="{ 'card-count-error': totalCards !== 13 && totalCards > 0 }">{{ totalCards }}张</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from 'vue'
import { useBridge } from '../composables/useBridge'
import type { Hand } from '../composables/useBridge'

const props = defineProps<{
  modelValue: Hand
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Hand]
}>()

const { calculateHCP, calculateDistribution, validateHand, dealRandomHand, RANKS } = useBridge()

// 本地手牌状态
const localHand = reactive<Hand>({
  spades: props.modelValue.spades || '',
  hearts: props.modelValue.hearts || '',
  diamonds: props.modelValue.diamonds || '',
  clubs: props.modelValue.clubs || ''
})

// 错误状态
const errors = reactive<Record<string, boolean>>({
  spades: false,
  hearts: false,
  diamonds: false,
  clubs: false
})

// 监听 props 变化
watch(() => props.modelValue, (newVal) => {
  localHand.spades = newVal.spades || ''
  localHand.hearts = newVal.hearts || ''
  localHand.diamonds = newVal.diamonds || ''
  localHand.clubs = newVal.clubs || ''
}, { deep: true })

// 计算 HCP
const hcp = computed<number>(() => {
  return calculateHCP(localHand)
})

// 计算牌型分布
const distribution = computed<string>(() => {
  const total = totalCards.value
  if (total === 0) return '-'
  return calculateDistribution(localHand)
})

// 计算总张数
const totalCards = computed<number>(() => {
  return (
    (localHand.spades || '').length +
    (localHand.hearts || '').length +
    (localHand.diamonds || '').length +
    (localHand.clubs || '').length
  )
})

// 错误信息
const errorMessage = computed<string>(() => {
  const validation = validateHand(localHand)
  return validation.valid ? '' : validation.message
})

// 输入处理
function onInput(suit: keyof Hand) {
  // 转为大写
  localHand[suit] = localHand[suit].toUpperCase()

  // 验证输入
  const validRanks = new Set(RANKS)
  let filtered = ''
  const seen = new Set<string>()
  let hasError = false

  for (const card of localHand[suit]) {
    if (!validRanks.has(card)) {
      hasError = true
      continue
    }
    if (seen.has(card)) {
      hasError = true
      continue
    }
    seen.add(card)
    filtered += card
  }

  localHand[suit] = filtered
  errors[suit] = hasError

  // 发出更新事件
  emit('update:modelValue', { ...localHand })
}

// 随机发牌
function randomDeal() {
  const newHand = dealRandomHand()
  localHand.spades = newHand.spades
  localHand.hearts = newHand.hearts
  localHand.diamonds = newHand.diamonds
  localHand.clubs = newHand.clubs
  emit('update:modelValue', { ...localHand })
}

// 清空手牌
function clearHand() {
  localHand.spades = ''
  localHand.hearts = ''
  localHand.diamonds = ''
  localHand.clubs = ''
  errors.spades = false
  errors.hearts = false
  errors.diamonds = false
  errors.clubs = false
  emit('update:modelValue', { ...localHand })
}
</script>

<style scoped>
.hand-input {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  padding: 0.75rem 1rem;
  border: 1px solid #2d5a3d;
}

.hand-input-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.hand-input-title {
  color: #fff;
  margin: 0;
  font-size: 1rem;
}

.header-actions {
  display: flex;
  gap: 0.35rem;
}

.btn-small {
  padding: 0.15rem 0.5rem;
  font-size: 0.75rem;
  border: 1px solid #2d5a3d;
  border-radius: 4px;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.1);
  color: #a8d5a8;
  transition: all 0.2s ease;
}

.btn-small:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  border-color: #3d7a4d;
}

.hand-input-grid {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.suit-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.suit-label {
  font-size: 1.2rem;
  width: 1.5rem;
  text-align: center;
  flex-shrink: 0;
}

.suit-label.spade {
  color: #4a90d9;
}

.suit-label.heart {
  color: #e74c3c;
}

.suit-label.diamond {
  color: #f39c12;
}

.suit-label.club {
  color: #27ae60;
}

.card-input {
  flex: 1;
  padding: 0.35rem 0.6rem;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid #2d5a3d;
  border-radius: 6px;
  color: #fff;
  font-size: 0.95rem;
  font-family: 'Courier New', monospace;
  letter-spacing: 3px;
  text-transform: uppercase;
  transition: border-color 0.3s;
}

.card-input:focus {
  outline: none;
  border-color: #4a90d9;
  background: rgba(255, 255, 255, 0.15);
}

.card-input.error {
  border-color: #e74c3c;
}

.card-input::placeholder {
  color: rgba(255, 255, 255, 0.3);
  letter-spacing: 1px;
  font-size: 0.8rem;
}

.card-count {
  color: #a8d5a8;
  font-size: 0.8rem;
  width: 1.5rem;
  text-align: center;
  flex-shrink: 0;
}

.error-message {
  color: #e74c3c;
  font-size: 0.8rem;
  margin-top: 0.4rem;
  padding: 0.3rem;
  background: rgba(231, 76, 60, 0.1);
  border-radius: 4px;
  text-align: center;
}

/* 单行紧凑统计信息 */
.hand-stats-inline {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 4px;
  font-size: 0.8rem;
  color: #a8d5a8;
}

.stat-chip {
  white-space: nowrap;
}

.stat-chip.hcp strong {
  color: #f1c40f;
  font-size: 0.9rem;
}

.stat-chip.distribution {
  color: #4a90d9;
  font-family: 'Courier New', monospace;
}

.stat-separator {
  color: rgba(168, 213, 168, 0.3);
  font-size: 0.7rem;
}

.card-count-error {
  color: #e74c3c !important;
}

/* 移动端适配 */
@media (max-width: 768px) {
  .hand-input { padding: 0.6rem 0.75rem; border-radius: 10px; }
  .hand-input-header { margin-bottom: 0.4rem; }
  .hand-input-title { font-size: 0.9rem; }
  .btn-small { padding: 0.2rem 0.6rem; font-size: 0.8rem; }
  .card-input {
    height: 2.4rem;
    font-size: 1rem;
    letter-spacing: 2px;
    padding: 0.3rem 0.5rem;
  }
  .suit-label { font-size: 1.3rem; width: 1.8rem; }
  .card-count { font-size: 0.85rem; width: 1.8rem; }
  .hand-stats-inline { font-size: 0.85rem; padding: 0.3rem 0.5rem; }
}

@media (max-width: 480px) {
  .hand-input { padding: 0.5rem 0.6rem; }
  .card-input { height: 2.6rem; font-size: 1.05rem; }
  .suit-label { font-size: 1.4rem; }
}
</style>
