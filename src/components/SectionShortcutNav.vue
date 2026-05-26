<template>
  <div class="shortcut-nav">
    <button
      v-for="item in items"
      :key="item.to"
      type="button"
      class="shortcut-chip"
      :class="{ active: route.path === item.to }"
      @click="router.push(item.to)"
    >
      <span class="shortcut-icon">{{ item.icon }}</span>
      <span>{{ item.label }}</span>
    </button>
  </div>
</template>

<script setup>
import { useRoute, useRouter } from 'vue-router'

const props = defineProps({
  items: {
    type: Array,
    default: () => [],
  },
})

const router = useRouter()
const route = useRoute()
</script>

<style scoped>
.shortcut-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.shortcut-chip {
  border: none;
  background: #f5f7fb;
  color: #4b5563;
  border-radius: 999px;
  padding: 8px 12px;
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.shortcut-chip.active {
  background: #e8f1ff;
  color: #1d4ed8;
  font-weight: 600;
}

.shortcut-icon {
  font-size: 14px;
}
</style>
