<template>
  <div class="bidding-pad">
    <div class="pad-row">
      <!-- 级别选择 -->
      <div class="level-group">
        <button
          v-for="level in bidLevels"
          :key="level"
          :class="['level-btn', { active: selectedLevel === level }]"
          @click="selectedLevel = level"
        >
          {{ level }}
        </button>
      </div>

      <!-- 分隔符 -->
      <div class="separator">×</div>

      <!-- 花色选择 -->
      <div class="strain-group">
        <button
          v-for="strain in bidStrains"
          :key="strain"
          :class="['strain-btn', strainClass(strain), {
            disabled: isBidDisabled(`${selectedLevel}${strain}`)
          }]"
          :disabled="isBidDisabled(`${selectedLevel}${strain}`)"
          @click="placeBid(`${selectedLevel}${strain}`)"
        >
          {{ strainSymbol(strain) }}
        </button>
      </div>

      <!-- 分隔符 -->
      <div class="separator">|</div>

      <!-- 特殊叫品 -->
      <div class="special-group">
        <button
          class="special-btn pass"
          @click="placeBid('Pass')"
        >
          Pass
        </button>
        <button
          :class="['special-btn', 'double', { disabled: !canDouble }]"
          :disabled="!canDouble"
          @click="placeBid('X')"
        >
          X
        </button>
        <button
          :class="['special-btn', 'redouble', { disabled: !canRedouble }]"
          :disabled="!canRedouble"
          @click="placeBid('XX')"
        >
          XX
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useBridge } from '../composables/useBridge'

const props = defineProps({
  modelValue: {
    type: Array,
    required: true,
    default: () => []
  },
  currentPlayer: {
    type: String,
    default: 'N'
  },
  disabledBids: {
    type: Set,
    default: () => new Set()
  }
})

const emit = defineEmits(['update:modelValue'])

const {
  BID_LEVELS: bidLevels,
  BID_STRAINS: bidStrains,
  SUIT_SYMBOLS: suitSymbols,
  SUIT_COLORS: suitColors,
  bidToValue
} = useBridge()

// 当前选中的级别
const selectedLevel = ref(1)

// 获取花色符号
function strainSymbol(strain) {
  if (strain === 'NT') return 'NT'
  return suitSymbols[strain] || strain
}

// 获取花色 CSS 类名
function strainClass(strain) {
  const map = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades', NT: 'no-trump' }
  return map[strain] || ''
}

// 判断叫品是否被禁用
function isBidDisabled(bid) {
  return props.disabledBids.has(bid)
}

// 是否可以加倍
const canDouble = computed(() => {
  const sequence = props.modelValue
  if (sequence.length === 0) return false

  let lastBidIndex = -1
  for (let i = sequence.length - 1; i >= 0; i--) {
    if (bidToValue(sequence[i].bid) !== null) {
      lastBidIndex = i
      break
    }
  }
  if (lastBidIndex === -1) return false

  for (let i = lastBidIndex + 1; i < sequence.length; i++) {
    if (sequence[i].bid === 'X' || sequence[i].bid === 'XX') return false
  }
  return true
})

// 是否可以再加倍
const canRedouble = computed(() => {
  const sequence = props.modelValue
  if (sequence.length === 0) return false

  for (let i = sequence.length - 1; i >= 0; i--) {
    if (sequence[i].bid === 'XX') return false
    if (sequence[i].bid === 'X') return true
    if (bidToValue(sequence[i].bid) !== null) break
  }
  return false
})

// 放置叫品
function placeBid(bid) {
  const newSequence = [...props.modelValue, {
    player: props.currentPlayer,
    bid: bid
  }]
  emit('update:modelValue', newSequence)
}
</script>

<style scoped>
.bidding-pad {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 0.5rem 0.6rem;
  border: 1px solid #2d5a3d;
}

.pad-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

/* 级别按钮 */
.level-group {
  display: flex;
  gap: 3px;
}

.level-btn {
  width: 1.8rem;
  height: 1.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid #2d5a3d;
  border-radius: 4px;
  color: #a8d5a8;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.level-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.level-btn.active {
  background: #2d5a3d;
  border-color: #4a90d9;
  color: #fff;
  box-shadow: 0 0 6px rgba(74, 144, 217, 0.3);
}

/* 分隔符 */
.separator {
  color: #2d5a3d;
  font-size: 0.9rem;
  font-weight: bold;
  user-select: none;
  padding: 0 0.1rem;
}

/* 花色按钮 */
.strain-group {
  display: flex;
  gap: 3px;
}

.strain-btn {
  min-width: 2rem;
  height: 1.8rem;
  padding: 0 0.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
}

.strain-btn:hover:not(.disabled) {
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.strain-btn.clubs:not(.disabled) { background: rgba(39, 174, 96, 0.3); border-color: #27ae60; }
.strain-btn.diamonds:not(.disabled) { background: rgba(243, 156, 18, 0.3); border-color: #f39c12; }
.strain-btn.hearts:not(.disabled) { background: rgba(231, 76, 60, 0.3); border-color: #e74c3c; }
.strain-btn.spades:not(.disabled) { background: rgba(74, 144, 217, 0.3); border-color: #4a90d9; }
.strain-btn.no-trump:not(.disabled) { background: rgba(149, 165, 166, 0.3); border-color: #95a5a6; }

.strain-btn.clubs:not(.disabled):hover { background: rgba(39, 174, 96, 0.5); }
.strain-btn.diamonds:not(.disabled):hover { background: rgba(243, 156, 18, 0.5); }
.strain-btn.hearts:not(.disabled):hover { background: rgba(231, 76, 60, 0.5); }
.strain-btn.spades:not(.disabled):hover { background: rgba(74, 144, 217, 0.5); }
.strain-btn.no-trump:not(.disabled):hover { background: rgba(149, 165, 166, 0.5); }

.strain-btn.disabled {
  opacity: 0.2;
  cursor: not-allowed;
  background: rgba(255, 255, 255, 0.03);
}

/* 特殊叫品 */
.special-group {
  display: flex;
  gap: 3px;
}

.special-btn {
  height: 1.8rem;
  padding: 0 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  color: #fff;
}

.special-btn.pass {
  background: rgba(255, 255, 255, 0.1);
  border-color: #7f8c8d;
}
.special-btn.pass:hover { background: rgba(255, 255, 255, 0.2); }

.special-btn.double {
  background: rgba(231, 76, 60, 0.3);
  border-color: #e74c3c;
}
.special-btn.double:hover:not(.disabled) { background: rgba(231, 76, 60, 0.5); }

.special-btn.redouble {
  background: rgba(74, 144, 217, 0.3);
  border-color: #4a90d9;
}
.special-btn.redouble:hover:not(.disabled) { background: rgba(74, 144, 217, 0.5); }

.special-btn.disabled {
  opacity: 0.2;
  cursor: not-allowed;
}
</style>
