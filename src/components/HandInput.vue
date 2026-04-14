<template>
  <div class="hand-input">
    <h3 class="hand-input-title">输入手牌</h3>

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

    <!-- 统计信息 -->
    <div class="hand-stats">
      <div class="stat-item">
        <span class="stat-label">HCP（高牌点力）</span>
        <span class="stat-value hcp">{{ hcp }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">牌型分布</span>
        <span class="stat-value distribution">{{ distribution }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">总张数</span>
        <span class="stat-value" :class="{ 'card-count-error': totalCards !== 13 && totalCards > 0 }">
          {{ totalCards }}
        </span>
      </div>
    </div>

    <!-- 操作按钮 -->
    <div class="hand-actions">
      <button class="btn btn-secondary" @click="randomDeal">
        随机发牌
      </button>
      <button class="btn btn-secondary" @click="clearHand">
        清空
      </button>
    </div>
  </div>
</template>

<script setup>
import { reactive, computed, watch } from 'vue'
import { useBridge } from '../composables/useBridge'

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
    default: () => ({ spades: '', hearts: '', diamonds: '', clubs: '' })
  }
})

const emit = defineEmits(['update:modelValue'])

const { calculateHCP, calculateDistribution, validateHand, dealRandomHand, RANKS } = useBridge()

// 本地手牌状态
const localHand = reactive({
  spades: props.modelValue.spades || '',
  hearts: props.modelValue.hearts || '',
  diamonds: props.modelValue.diamonds || '',
  clubs: props.modelValue.clubs || ''
})

// 错误状态
const errors = reactive({
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
const hcp = computed(() => {
  return calculateHCP(localHand)
})

// 计算牌型分布
const distribution = computed(() => {
  const total = totalCards.value
  if (total === 0) return '-'
  return calculateDistribution(localHand)
})

// 计算总张数
const totalCards = computed(() => {
  return (
    (localHand.spades || '').length +
    (localHand.hearts || '').length +
    (localHand.diamonds || '').length +
    (localHand.clubs || '').length
  )
})

// 错误信息
const errorMessage = computed(() => {
  const validation = validateHand(localHand)
  return validation.valid ? '' : validation.message
})

// 输入处理
function onInput(suit) {
  // 转为大写
  localHand[suit] = localHand[suit].toUpperCase()

  // 验证输入
  const validRanks = new Set(RANKS)
  let filtered = ''
  const seen = new Set()
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
  padding: 1.5rem;
  border: 1px solid #2d5a3d;
}

.hand-input-title {
  color: #fff;
  margin: 0 0 1rem;
  font-size: 1.2rem;
  text-align: center;
}

.hand-input-grid {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.suit-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.suit-label {
  font-size: 1.5rem;
  width: 2rem;
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
  padding: 0.6rem 1rem;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid #2d5a3d;
  border-radius: 8px;
  color: #fff;
  font-size: 1.1rem;
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
  font-size: 0.9rem;
}

.card-count {
  color: #a8d5a8;
  font-size: 0.9rem;
  width: 2rem;
  text-align: center;
  flex-shrink: 0;
}

.error-message {
  color: #e74c3c;
  font-size: 0.9rem;
  margin-top: 0.75rem;
  padding: 0.5rem;
  background: rgba(231, 76, 60, 0.1);
  border-radius: 6px;
  text-align: center;
}

.hand-stats {
  display: flex;
  justify-content: space-around;
  margin-top: 1.25rem;
  padding: 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
}

.stat-label {
  color: #a8d5a8;
  font-size: 0.8rem;
}

.stat-value {
  color: #fff;
  font-size: 1.2rem;
  font-weight: bold;
}

.stat-value.hcp {
  color: #f1c40f;
  font-size: 1.5rem;
}

.stat-value.distribution {
  color: #4a90d9;
  font-family: 'Courier New', monospace;
}

.card-count-error {
  color: #e74c3c !important;
}

.hand-actions {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
  justify-content: center;
}

.btn {
  padding: 0.5rem 1.25rem;
  font-size: 0.9rem;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  border: 1px solid #2d5a3d;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: #3d7a4d;
}

@media (max-width: 480px) {
  .hand-stats {
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }
}
</style>
