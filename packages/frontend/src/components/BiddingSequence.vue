<template>
  <div class="bidding-sequence">
    <div class="sequence-header">
      <h3 class="sequence-title">叫牌序列</h3>
      <div v-if="modelValue.length > 0" class="action-btns">
        <button class="btn btn-undo" @click="undoLast" title="撤销最后一步">
          ↩ 撤销
        </button>
        <button class="btn btn-clear" @click="clearAll" title="清空全部">
          ✕ 清空
        </button>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-if="modelValue.length === 0" class="empty-state">
      <p>暂无叫牌记录</p>
      <p class="empty-hint">请在叫牌面板中选择叫品</p>
    </div>

    <!-- 叫牌表格 -->
    <div v-else class="sequence-table-container">
      <table class="sequence-table">
        <thead>
          <tr>
            <th
              v-for="player in players"
              :key="player"
              :class="['player-header', { active: currentPlayer === player }]"
            >
              {{ playerNames[player] }} ({{ player }})
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, rowIndex) in tableRows" :key="rowIndex">
            <td
              v-for="(cell, colIndex) in row"
              :key="colIndex"
              :class="['bid-cell', cellClass(cell)]"
            >
              <span v-if="cell" class="bid-text">{{ formatBid(cell) }}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useBridge } from '../composables/useBridge'
import type { BidItem } from '../composables/useBridge'

const props = defineProps<{
  modelValue: BidItem[]
  currentPlayer: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: BidItem[]]
}>()

const {
  PLAYERS: players,
  PLAYER_NAMES: playerNames,
  BID_PASS,
  BID_DOUBLE,
  BID_REDOUBLE
} = useBridge()

const tableRows = computed<(string | null)[][]>(() => {
  const rows: (string | null)[][] = []
  const seq = props.modelValue
  if (seq.length === 0) return rows

  let currentRow: (string | null)[] = new Array(4).fill(null)
  for (const item of seq) {
    const playerIndex = players.indexOf(item.player)
    currentRow[playerIndex] = item.bid
    if (playerIndex === 3) {
      rows.push(currentRow)
      currentRow = new Array(4).fill(null)
    }
  }
  if (currentRow.some(cell => cell !== null)) rows.push(currentRow)
  return rows
})

function formatBid(bid: string): string {
  if (!bid) return ''
  if (bid === BID_PASS) return 'Pass'
  if (bid === BID_DOUBLE) return 'X'
  if (bid === BID_REDOUBLE) return 'XX'
  return bid.replace(/S/g, '♠').replace(/H/g, '♥').replace(/D/g, '♦').replace(/C/g, '♣').replace(/NT/g, 'NT')
}

function cellClass(bid: string | null): string {
  if (!bid) return ''
  if (bid === BID_PASS) return 'pass'
  if (bid === BID_DOUBLE) return 'double'
  if (bid === BID_REDOUBLE) return 'redouble'
  if (bid.includes('S')) return 'spades'
  if (bid.includes('H')) return 'hearts'
  if (bid.includes('D')) return 'diamonds'
  if (bid.includes('C')) return 'clubs'
  if (bid.includes('NT')) return 'no-trump'
  return ''
}

function undoLast() {
  const newSequence = [...props.modelValue]
  newSequence.pop()
  emit('update:modelValue', newSequence)
}

function clearAll() {
  emit('update:modelValue', [])
}
</script>

<style scoped>
.bidding-sequence {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
  padding: 0.75rem 1rem;
  border: 1px solid #2d5a3d;
}

.sequence-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.sequence-title {
  color: #fff;
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

/* 按钮组：放在一起 */
.action-btns {
  display: flex;
  gap: 0.35rem;
}

.action-btns .btn {
  padding: 0.2rem 0.6rem;
  font-size: 0.75rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.btn-undo {
  background: rgba(243, 156, 18, 0.15);
  color: #f39c12;
  border: 1px solid rgba(243, 156, 18, 0.4);
}
.btn-undo:hover { background: rgba(243, 156, 18, 0.3); }

.btn-clear {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
  border: 1px solid rgba(231, 76, 60, 0.4);
}
.btn-clear:hover { background: rgba(231, 76, 60, 0.3); }

.empty-state {
  text-align: center;
  padding: 1rem;
  color: #a8d5a8;
  font-size: 0.9rem;
}

.empty-hint {
  font-size: 0.8rem;
  color: rgba(168, 213, 168, 0.5);
  margin: 0.3rem 0 0;
}

.sequence-table-container { overflow-x: auto; }

.sequence-table {
  width: 100%;
  border-collapse: collapse;
}

.sequence-table th {
  padding: 0.4rem 0.5rem;
  color: #a8d5a8;
  font-size: 0.8rem;
  font-weight: 600;
  border-bottom: 1px solid #2d5a3d;
  text-align: center;
}

.sequence-table th.active {
  color: #f1c40f;
  border-bottom-color: #f1c40f;
}

.sequence-table td {
  padding: 0.35rem 0.4rem;
  text-align: center;
  border-bottom: 1px solid rgba(45, 90, 61, 0.2);
  min-width: 3.5rem;
}

.bid-text {
  display: inline-block;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  font-weight: 600;
  font-size: 0.85rem;
}

.bid-cell.spades .bid-text { color: #4a90d9; background: rgba(74, 144, 217, 0.15); }
.bid-cell.hearts .bid-text { color: #e74c3c; background: rgba(231, 76, 60, 0.15); }
.bid-cell.diamonds .bid-text { color: #f39c12; background: rgba(243, 156, 18, 0.15); }
.bid-cell.clubs .bid-text { color: #27ae60; background: rgba(39, 174, 96, 0.15); }
.bid-cell.no-trump .bid-text { color: #95a5a6; background: rgba(149, 165, 166, 0.15); }
.bid-cell.pass .bid-text { color: #7f8c8d; background: rgba(127, 140, 141, 0.08); }
.bid-cell.double .bid-text { color: #e74c3c; background: rgba(231, 76, 60, 0.2); font-weight: bold; }
.bid-cell.redouble .bid-text { color: #4a90d9; background: rgba(74, 144, 217, 0.2); font-weight: bold; }
</style>
