<template>
  <div class="analysis-result">
    <!-- 加载动画 -->
    <div v-if="loading" class="loading-container">
      <div class="loading-spinner">
        <div class="spinner-suit">♠</div>
        <div class="spinner-suit">♥</div>
        <div class="spinner-suit">♦</div>
        <div class="spinner-suit">♣</div>
      </div>
      <p class="loading-text">AI 正在分析中...</p>
    </div>

    <!-- 空状态占位 -->
    <div v-else-if="!result" class="empty-placeholder">
      <div class="placeholder-icon">🃏</div>
      <p class="placeholder-text">AI 分析结果将在此处显示</p>
      <p class="placeholder-hint">请在左侧输入牌型或叫牌序列，点击分析按钮</p>
    </div>

    <!-- 结果展示 -->
    <div v-else class="result-container">
      <div class="result-header">
        <h3 class="result-title">分析结果</h3>
        <button class="btn btn-copy" @click="copyResult" title="复制结果">
          {{ copied ? '已复制 ✓' : '📋 复制' }}
        </button>
      </div>
      <div class="result-content" v-html="renderedContent"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
  result: string
  loading: boolean
}>()

const emit = defineEmits<{
  copy: [text: string]
}>()

const copied = ref<boolean>(false)

// 改进的 Markdown 渲染
const renderedContent = computed<string>(() => {
  if (!props.result) return ''

  let html = props.result

  // 1. 转义 HTML（保留后续要处理的标记）
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 2. 提取代码块（```...```），替换为占位符防止内部被处理
  const codeBlocks: { lang: string; code: string }[] = []
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length
    codeBlocks.push({ lang, code: code.trimEnd() })
    return `\n%%CODEBLOCK_${idx}%%\n`
  })

  // 3. 处理表格（|...|）
  html = html.replace(/^(\|.+\|)\n(\|[-:| ]+\|)\n((?:\|.+\|\n?)+)/gm, (_match: string, headerRow: string, _separatorRow: string, bodyRows: string) => {
    const headers = headerRow.split('|').filter((c: string) => c.trim()).map((c: string) => c.trim())
    const rows = bodyRows.trim().split('\n').map((row: string) =>
      row.split('|').filter((c: string) => c.trim()).map((c: string) => c.trim())
    )
    let table = '<table class="md-table"><thead><tr>'
    headers.forEach((h: string) => { table += `<th>${h}</th>` })
    table += '</tr></thead><tbody>'
    rows.forEach((row: string[]) => {
      table += '<tr>'
      row.forEach((cell: string) => { table += `<td>${cell}</td>` })
      table += '</tr>'
    })
    table += '</tbody></table>'
    return table
  })

  // 4. 处理引用块（> 开头）
  html = html.replace(/^(> .+\n?)+/gm, (match) => {
    const lines = match.trim().split('\n').map(l => l.replace(/^>\s?/, ''))
    return `<blockquote class="md-blockquote">${lines.join('<br />')}</blockquote>`
  })

  // 5. 处理标题（支持 ### 和 **粗体** 组合）
  html = html.replace(/^#### (.+)$/gm, '<h4 class="md-h4">$1</h4>')
  html = html.replace(/^### (.+)$/gm, '<h3 class="md-h3">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="md-h2">$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h2 class="md-h2">$1</h2>')

  // 6. 处理粗体、斜体、行内代码
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="md-bold">$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em class="md-italic">$1</em>')
  html = html.replace(/`(.+?)`/g, '<code class="md-code">$1</code>')

  // 7. 处理列表（支持嵌套）
  // 先处理嵌套列表（缩进的 - 或数字）
  html = html.replace(/^(\s+)- (.+)$/gm, (match, indent, content) => {
    const level = Math.floor(indent.length / 2)
    return `<li class="md-li md-li-nested md-li-level-${Math.min(level, 3)}">${content}</li>`
  })
  html = html.replace(/^(\s+)\d+\. (.+)$/gm, (match, indent, content) => {
    const level = Math.floor(indent.length / 2)
    return `<li class="md-li-ol md-li-nested md-li-level-${Math.min(level, 3)}">${content}</li>`
  })

  // 顶层无序列表
  html = html.replace(/^- (.+)$/gm, '<li class="md-li">$1</li>')
  // 顶层有序列表
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="md-li-ol">$1</li>')

  // 将连续的 li 包裹成 ul/ol
  html = html.replace(/((?:<li class="md-li(?:\s+md-li-nested[^"]*)?">.*<\/li>\n?)+)/g, (match) => {
    const hasNested = match.includes('md-li-nested')
    return `<ul class="md-ul${hasNested ? ' md-nested-list' : ''}">${match}</ul>`
  })
  html = html.replace(/((?:<li class="md-li-ol(?:\s+md-li-nested[^"]*)?">.*<\/li>\n?)+)/g, (match) => {
    const hasNested = match.includes('md-li-nested')
    return `<ol class="md-ol${hasNested ? ' md-nested-list' : ''}">${match}</ol>`
  })

  // 8. 分隔线 (---)
  html = html.replace(/^---$/gm, '<hr class="md-hr" />')

  // 9. 恢复代码块占位符
  codeBlocks.forEach((block, idx) => {
    const escaped = block.code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
    const langLabel = block.lang ? `<div class="md-code-lang">${block.lang}</div>` : ''
    html = html.replace(
      `%%CODEBLOCK_${idx}%%`,
      `<div class="md-code-block">${langLabel}<pre><code>${escaped}</code></pre></div>`
    )
  })

  // 10. 处理段落和换行
  // 按行分割，将非标签行合并为段落
  const blockElements = new Set([
    'h2', 'h3', 'h4', 'ul', 'ol', 'table', 'blockquote',
    'hr', 'div', 'pre'
  ])
  const lines = html.split('\n')
  const output: string[] = []
  let paragraphBuffer: string[] = []

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      const text = paragraphBuffer.join(' ').trim()
      if (text) {
        output.push(`<p class="md-p">${text}</p>`)
      }
      paragraphBuffer = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) {
      // 空行：结束当前段落
      flushParagraph()
      continue
    }
    // 检查是否是块级元素
    const isBlock = blockElements.has(
      trimmed.replace(/^<\/?/, '').split(/[\s>]/)[0].toLowerCase()
    )
    if (isBlock) {
      flushParagraph()
      output.push(trimmed)
    } else {
      paragraphBuffer.push(trimmed)
    }
  }
  flushParagraph()

  html = output.join('\n')

  // 11. 清理多余空行和 br
  html = html.replace(/<br\s*\/>\s*<\/p>/g, '</p>')
  html = html.replace(/<p class="md-p">\s*<\/p>/g, '')
  html = html.replace(/<\/(h[234]|ul|ol|blockquote|table|div|pre)>\s*<p class="md-p">\s*<\/p>/g, '</$1>')
  html = html.replace(/<p class="md-p">\s*<\/p>\s*<(h[234]|ul|ol|blockquote|table|div|pre)>/g, '<$1>')

  return html
})

// 复制结果（带视觉反馈）
function copyResult() {
  navigator.clipboard.writeText(props.result).then(() => {
    copied.value = true
    emit('copy', props.result)
    setTimeout(() => {
      copied.value = false
    }, 2000)
  }).catch(() => {
    const textarea = document.createElement('textarea')
    textarea.value = props.result
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    copied.value = true
    emit('copy', props.result)
    setTimeout(() => {
      copied.value = false
    }, 2000)
  })
}
</script>

<style scoped>
.analysis-result {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 加载动画 */
.loading-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.loading-spinner {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.spinner-suit {
  font-size: 1.5rem;
  animation: spin 1.5s ease-in-out infinite;
}

.spinner-suit:nth-child(1) { color: #4a90d9; animation-delay: 0s; }
.spinner-suit:nth-child(2) { color: #e74c3c; animation-delay: 0.2s; }
.spinner-suit:nth-child(3) { color: #f39c12; animation-delay: 0.4s; }
.spinner-suit:nth-child(4) { color: #27ae60; animation-delay: 0.6s; }

@keyframes spin {
  0%, 100% { transform: translateY(0) scale(1); opacity: 0.5; }
  50% { transform: translateY(-10px) scale(1.2); opacity: 1; }
}

.loading-text {
  color: #a8d5a8;
  font-size: 1rem;
}

/* 空状态占位 */
.empty-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  border: 2px dashed rgba(45, 90, 61, 0.5);
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.1);
}

.placeholder-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.6;
}

.placeholder-text {
  color: #a8d5a8;
  font-size: 1.1rem;
  margin: 0;
}

.placeholder-hint {
  color: rgba(168, 213, 168, 0.5);
  font-size: 0.85rem;
  margin: 0.5rem 0 0;
}

/* 结果容器 */
.result-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  border: 1px solid #2d5a3d;
  overflow: hidden;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.6rem 1rem;
  background: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid #2d5a3d;
  flex-shrink: 0;
}

.result-title {
  color: #fff;
  margin: 0;
  font-size: 1rem;
}

.btn-copy {
  padding: 0.3rem 0.8rem;
  background: rgba(255, 255, 255, 0.1);
  color: #a8d5a8;
  border: 1px solid #2d5a3d;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s ease;
}

.btn-copy:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.btn-copy.copied {
  background: rgba(39, 174, 96, 0.2);
  border-color: #27ae60;
  color: #27ae60;
}

.result-content {
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
  color: #e0e0e0;
  line-height: 1.7;
  font-size: 0.9rem;
}

/* ========== Markdown 渲染样式 ========== */

/* 段落 - 紧凑间距 */
.result-content :deep(.md-p) {
  margin: 0.2rem 0;
}

/* 标题 h2 */
.result-content :deep(.md-h2) {
  color: #fff;
  font-size: 1.2rem;
  margin: 0.8rem 0 0.3rem;
  padding-bottom: 0.3rem;
  border-bottom: 1px solid #2d5a3d;
}

/* 标题 h3 */
.result-content :deep(.md-h3) {
  color: #a8d5a8;
  font-size: 1.05rem;
  margin: 0.6rem 0 0.25rem;
}

/* 标题 h4 */
.result-content :deep(.md-h4) {
  color: #4a90d9;
  font-size: 0.95rem;
  margin: 0.5rem 0 0.2rem;
}

/* 粗体 */
.result-content :deep(.md-bold) {
  color: #f1c40f;
  font-weight: 700;
}

/* 斜体 */
.result-content :deep(.md-italic) {
  color: #bdc3c7;
  font-style: italic;
}

/* 行内代码 */
.result-content :deep(.md-code) {
  background: rgba(255, 255, 255, 0.1);
  padding: 0.15rem 0.4rem;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  color: #f39c12;
  font-size: 0.85rem;
}

/* 代码块 */
.result-content :deep(.md-code-block) {
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid #2d5a3d;
  border-radius: 6px;
  margin: 0.4rem 0;
  overflow-x: auto;
}

.result-content :deep(.md-code-lang) {
  padding: 0.2rem 0.6rem;
  font-size: 0.75rem;
  color: #a8d5a8;
  background: rgba(45, 90, 61, 0.3);
  border-bottom: 1px solid #2d5a3d;
  border-radius: 6px 6px 0 0;
}

.result-content :deep(.md-code-block pre) {
  margin: 0;
  padding: 0.6rem 0.8rem;
  font-family: 'Courier New', monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  color: #e0e0e0;
  white-space: pre;
  overflow-x: auto;
}

.result-content :deep(.md-code-block pre code) {
  background: none;
  padding: 0;
  color: inherit;
  font-size: inherit;
}

/* 引用块 */
.result-content :deep(.md-blockquote) {
  border-left: 3px solid #2d5a3d;
  padding: 0.3rem 0.6rem;
  margin: 0.3rem 0;
  background: rgba(45, 90, 61, 0.15);
  border-radius: 0 4px 4px 0;
  color: #bdc3c7;
  font-style: italic;
}

/* 表格 */
.result-content :deep(.md-table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0.4rem 0;
  font-size: 0.85rem;
}

.result-content :deep(.md-table th) {
  background: rgba(45, 90, 61, 0.3);
  color: #a8d5a8;
  padding: 0.35rem 0.6rem;
  border: 1px solid #2d5a3d;
  text-align: left;
  font-weight: 600;
}

.result-content :deep(.md-table td) {
  padding: 0.3rem 0.6rem;
  border: 1px solid rgba(45, 90, 61, 0.4);
  color: #e0e0e0;
}

.result-content :deep(.md-table tbody tr:hover) {
  background: rgba(255, 255, 255, 0.05);
}

/* 无序列表 */
.result-content :deep(.md-ul) {
  padding-left: 1.5rem;
  margin: 0.25rem 0;
}

.result-content :deep(.md-li) {
  margin: 0.15rem 0;
  list-style-type: disc;
}

/* 有序列表 */
.result-content :deep(.md-ol) {
  padding-left: 1.5rem;
  margin: 0.25rem 0;
}

.result-content :deep(.md-li-ol) {
  margin: 0.15rem 0;
  list-style-type: decimal;
}

/* 嵌套列表 */
.result-content :deep(.md-nested-list) {
  padding-left: 0.5rem;
}

.result-content :deep(.md-li-nested) {
  margin: 0.1rem 0;
}

.result-content :deep(.md-li-level-1) {
  list-style-type: circle;
}

.result-content :deep(.md-li-level-2) {
  list-style-type: square;
}

.result-content :deep(.md-li-level-3) {
  list-style-type: disc;
}

/* 分隔线 */
.result-content :deep(.md-hr) {
  border: none;
  border-top: 1px solid #2d5a3d;
  margin: 0.5rem 0;
}
</style>
