<template>
  <Teleport to="body">
    <div v-if="modelValue" class="doc-overlay" @click.self="close">
      <div class="doc-modal">
        <div class="doc-header">
          <h3 class="doc-title">体系说明文档</h3>
          <button class="doc-close" @click="close">&times;</button>
        </div>
        <div class="doc-body">
          <div v-if="loading && !selectedSystem" class="doc-loading">加载中...</div>
          <div v-else-if="error" class="doc-error">{{ error }}</div>
          <template v-else>
            <!-- 体系列表 -->
            <div v-if="!selectedSystem" class="doc-list">
              <div
                v-for="sys in systems"
                :key="sys.id"
                class="doc-list-item"
                @click="selectSystem(sys)"
              >
                <span class="doc-list-name">{{ sys.name }}</span>
                <span class="doc-list-arrow">&rsaquo;</span>
              </div>
            </div>
            <!-- 文档内容 -->
            <div v-else class="doc-content">
              <button class="doc-back" @click="selectedSystem = null">&larr; 返回列表</button>
              <div class="doc-content-title">{{ selectedSystem.name }}</div>
              <div v-if="contentLoading" class="doc-loading">加载中...</div>
              <div v-else-if="contentError" class="doc-error">{{ contentError }}</div>
              <div v-else class="doc-markdown" v-html="renderedContent"></div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const BASE_URL = '/bridge-bidding-assistant-server/api'

interface SystemItem {
  id: string
  name: string
}

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const loading = ref(false)
const error = ref('')
const systems = ref<SystemItem[]>([])
const selectedSystem = ref<SystemItem | null>(null)
const contentLoading = ref(false)
const contentError = ref('')
const docContent = ref('')

function close() {
  emit('update:modelValue', false)
}

/**
 * 简单 Markdown 渲染：标题、粗体、斜体、列表、代码块、段落
 */
function simpleMarkdown(md: string): string {
  let html = md
    // 代码块 (```...```)
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // 标题 (### → h3, ## → h2, # → h1)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // 粗体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 斜体
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // 无序列表
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    // 有序列表
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // 水平线
    .replace(/^---$/gm, '<hr />')
    // 段落：两个换行
    .replace(/\n\n/g, '</p><p>')
    // 单换行
    .replace(/\n/g, '<br />')

  // 包裹 li 成 ul
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>')
  html = html.replace(/<\/ul>\s*<ul>/g, '')

  return `<p>${html}</p>`
}

const renderedContent = computed(() => simpleMarkdown(docContent.value))

async function fetchSystems() {
  loading.value = true
  error.value = ''
  selectedSystem.value = null
  docContent.value = ''
  try {
    const res = await fetch(`${BASE_URL}/system-docs`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (json.success) {
      systems.value = json.data || []
    } else {
      error.value = json.error || '获取体系列表失败'
    }
  } catch (e: unknown) {
    error.value = (e as Error).message || '网络错误'
  } finally {
    loading.value = false
  }
}

async function selectSystem(sys: SystemItem) {
  selectedSystem.value = sys
  contentLoading.value = true
  contentError.value = ''
  docContent.value = ''
  try {
    const res = await fetch(`${BASE_URL}/system-docs/${sys.id}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json()
    if (json.success) {
      docContent.value = json.data?.content || ''
    } else {
      contentError.value = json.error || '获取文档失败'
    }
  } catch (e: unknown) {
    contentError.value = (e as Error).message || '网络错误'
  } finally {
    contentLoading.value = false
  }
}

watch(() => props.modelValue, (val) => {
  if (val) {
    fetchSystems()
  }
})
</script>

<style scoped>
.doc-overlay {
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

.doc-modal {
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

.doc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid #2d5a3d;
  flex-shrink: 0;
}

.doc-title {
  margin: 0;
  color: #fff;
  font-size: 1.1rem;
  font-weight: 700;
}

.doc-close {
  background: none;
  border: none;
  color: #a8d5a8;
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0 0.25rem;
  line-height: 1;
  transition: color 0.2s;
}

.doc-close:hover {
  color: #fff;
}

.doc-body {
  padding: 1rem 1.25rem;
  overflow-y: auto;
  flex: 1;
}

.doc-loading,
.doc-error {
  text-align: center;
  color: #a8d5a8;
  padding: 2rem 0;
  font-size: 0.95rem;
}

.doc-error {
  color: #e74c3c;
}

/* 体系列表 */
.doc-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.doc-list-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid #2d5a3d;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.doc-list-item:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: #3d7a4d;
}

.doc-list-name {
  color: #d4e8d4;
  font-size: 0.95rem;
  font-weight: 600;
}

.doc-list-arrow {
  color: #a8d5a8;
  font-size: 1.2rem;
}

/* 文档内容 */
.doc-back {
  background: none;
  border: 1px solid #2d5a3d;
  color: #a8d5a8;
  padding: 0.3rem 0.8rem;
  border-radius: 5px;
  cursor: pointer;
  font-size: 0.85rem;
  transition: all 0.2s;
  margin-bottom: 0.75rem;
}

.doc-back:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: #3d7a4d;
  color: #fff;
}

.doc-content-title {
  color: #fff;
  font-size: 1.1rem;
  font-weight: 700;
  margin-bottom: 1rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #2d5a3d;
}

.doc-markdown {
  color: #d4e8d4;
  font-size: 0.9rem;
  line-height: 1.7;
}

.doc-markdown :deep(h1) {
  color: #fff;
  font-size: 1.3rem;
  margin: 1.2rem 0 0.6rem;
  font-weight: 700;
}

.doc-markdown :deep(h2) {
  color: #fff;
  font-size: 1.15rem;
  margin: 1rem 0 0.5rem;
  font-weight: 700;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid rgba(45, 90, 61, 0.5);
}

.doc-markdown :deep(h3) {
  color: #a8d5a8;
  font-size: 1.05rem;
  margin: 0.8rem 0 0.4rem;
  font-weight: 700;
}

.doc-markdown :deep(strong) {
  color: #fff;
  font-weight: 700;
}

.doc-markdown :deep(em) {
  color: #c8e8c8;
  font-style: italic;
}

.doc-markdown :deep(ul) {
  padding-left: 1.5rem;
  margin: 0.4rem 0;
}

.doc-markdown :deep(li) {
  margin: 0.2rem 0;
}

.doc-markdown :deep(pre) {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #2d5a3d;
  border-radius: 6px;
  padding: 0.75rem 1rem;
  overflow-x: auto;
  margin: 0.6rem 0;
  font-size: 0.85rem;
}

.doc-markdown :deep(code) {
  background: rgba(0, 0, 0, 0.25);
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  font-size: 0.85rem;
  color: #a8d5a8;
}

.doc-markdown :deep(pre code) {
  background: none;
  padding: 0;
}

.doc-markdown :deep(hr) {
  border: none;
  border-top: 1px solid #2d5a3d;
  margin: 1rem 0;
}

.doc-markdown :deep(p) {
  margin: 0.4rem 0;
}
</style>
