<template>
  <Teleport to="body">
    <div v-if="modelValue" class="usage-overlay" @click.self="close">
      <div class="usage-modal">
        <div class="usage-header">
          <h3 class="usage-title">API 用量统计</h3>
          <button class="usage-close" @click="close">&times;</button>
        </div>
        <div class="usage-body">
          <div v-if="loading" class="usage-loading">加载中...</div>
          <div v-else-if="error" class="usage-error">{{ error }}</div>
          <template v-else>
            <div v-for="group in providerGroups" :key="group.providerName" class="provider-group">
              <h4 class="provider-name">{{ group.providerName }}</h4>
              <table class="usage-table">
                <thead>
                  <tr>
                    <th>模型</th>
                    <th>今日用量</th>
                    <th>每日限额</th>
                    <th>剩余</th>
                    <th>分钟限制</th>
                    <th>最大并发</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in group.items" :key="item.modelKey">
                    <td class="model-name">{{ item.modelName }}</td>
                    <td>{{ item.todayCount }}</td>
                    <td>{{ item.todayLimit !== null ? item.todayLimit : '无限制' }}</td>
                    <td :class="{ 'remaining-low': item.todayRemaining !== null && item.todayRemaining <= 5 }">
                      {{ item.todayRemaining !== null ? item.todayRemaining : '-' }}
                    </td>
                    <td>{{ item.minuteLimit }}</td>
                    <td>{{ item.maxConcurrency }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const BASE_URL = '/bridge-bidding-assistant-server/api'

interface UsageSummary {
  modelKey: string
  modelName: string
  providerName: string
  todayCount: number
  todayLimit: number | null
  todayRemaining: number | null
  minuteLimit: number
  maxConcurrency: number
}

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const loading = ref(false)
const error = ref('')
const usageData = ref<UsageSummary[]>([])

const providerGroups = computed(() => {
  const map = new Map<string, UsageSummary[]>()
  for (const item of usageData.value) {
    if (!map.has(item.providerName)) {
      map.set(item.providerName, [])
    }
    map.get(item.providerName)!.push(item)
  }
  return Array.from(map.entries()).map(([providerName, items]) => ({
    providerName,
    items,
  }))
})

function close() {
  emit('update:modelValue', false)
}

async function fetchUsage() {
  loading.value = true
  error.value = ''
  try {
    const res = await fetch(`${BASE_URL}/usage`)
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    }
    const json = await res.json()
    if (json.success) {
      usageData.value = json.data || []
    } else {
      error.value = json.error || '获取用量数据失败'
    }
  } catch (e: unknown) {
    error.value = (e as Error).message || '网络错误'
  } finally {
    loading.value = false
  }
}

watch(() => props.modelValue, (val) => {
  if (val) {
    fetchUsage()
  }
})
</script>

<style scoped>
.usage-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.usage-modal {
  background: linear-gradient(135deg, #1a472a 0%, #0d2818 100%);
  border: 2px solid #2d5a3d;
  border-radius: 10px;
  width: 90%;
  max-width: 860px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.usage-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid #2d5a3d;
  flex-shrink: 0;
}

.usage-title {
  margin: 0;
  color: #fff;
  font-size: 1.1rem;
  font-weight: 700;
}

.usage-close {
  background: none;
  border: none;
  color: #a8d5a8;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0 0.25rem;
  line-height: 1;
  transition: color 0.2s;
}

.usage-close:hover {
  color: #fff;
}

.usage-body {
  padding: 1rem 1.25rem;
  overflow-y: auto;
  flex: 1;
}

.usage-loading,
.usage-error {
  text-align: center;
  color: #a8d5a8;
  padding: 2rem 0;
  font-size: 0.95rem;
}

.usage-error {
  color: #e74c3c;
}

.provider-group {
  margin-bottom: 1.25rem;
}

.provider-group:last-child {
  margin-bottom: 0;
}

.provider-name {
  margin: 0 0 0.5rem;
  color: #a8d5a8;
  font-size: 0.95rem;
  font-weight: 700;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid rgba(45, 90, 61, 0.5);
}

.usage-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.usage-table th {
  background: rgba(0, 0, 0, 0.3);
  color: #a8d5a8;
  font-weight: 600;
  padding: 0.4rem 0.6rem;
  text-align: left;
  border-bottom: 1px solid #2d5a3d;
  white-space: nowrap;
}

.usage-table td {
  padding: 0.35rem 0.6rem;
  color: #d4e8d4;
  border-bottom: 1px solid rgba(45, 90, 61, 0.3);
}

.usage-table tbody tr:hover {
  background: rgba(255, 255, 255, 0.05);
}

.model-name {
  font-weight: 600;
  color: #fff;
}

.remaining-low {
  color: #e74c3c;
  font-weight: 700;
}
</style>
