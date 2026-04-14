<template>
  <div class="system-selector" :class="{ compact: compact }">
    <label v-if="!compact" class="selector-label" for="system-select">叫牌体系：</label>
    <select
      id="system-select"
      class="selector-dropdown"
      :value="modelValue"
      @change="onChange"
    >
      <option value="natural">自然二盖一体系 (2/1 GF)</option>
      <option value="precision">精确叫牌体系 (Precision)</option>
    </select>
    <span v-if="!compact" class="selector-hint">
      {{ modelValue === 'natural' ? '标准自然叫牌法' : '精确梅花开叫体系' }}
    </span>
  </div>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: String, default: 'natural' },
  compact: { type: Boolean, default: false }
})

const emit = defineEmits(['update:modelValue'])

function onChange(event) {
  emit('update:modelValue', event.target.value)
}
</script>

<style scoped>
.system-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.system-selector.compact {
  gap: 0;
}

.selector-label {
  color: #a8d5a8;
  font-size: 0.9rem;
  font-weight: 600;
  white-space: nowrap;
}

.selector-dropdown {
  padding: 0.25rem 0.4rem;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid #2d5a3d;
  border-radius: 5px;
  color: #fff;
  font-size: 0.8rem;
  cursor: pointer;
  transition: border-color 0.3s;
  outline: none;
  min-width: 160px;
}

.compact .selector-dropdown {
  min-width: 140px;
}

.selector-dropdown:focus {
  border-color: #4a90d9;
}

.selector-dropdown option {
  background: #1a2a1a;
  color: #fff;
}

.selector-hint {
  color: rgba(168, 213, 168, 0.6);
  font-size: 0.75rem;
  font-style: italic;
  white-space: nowrap;
}
</style>
