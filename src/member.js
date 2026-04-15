/**
 * 成员状态管理
 * 所有页面共享当前选中的成员信息
 */

import { ref, watch } from 'vue'

// 当前成员的响应式引用
export const currentMemberId = ref(localStorage.getItem('currentMemberId') || null)
export const currentMember = ref(null)

// 监听变化，自动同步到 localStorage
watch(currentMemberId, (newId) => {
  if (newId) {
    localStorage.setItem('currentMemberId', newId)
  } else {
    localStorage.removeItem('currentMemberId')
  }
})

// 设置当前成员
export const setCurrentMember = (member) => {
  currentMember.value = member
  currentMemberId.value = member?.id || null
}

// 清除当前成员
export const clearCurrentMember = () => {
  currentMember.value = null
  currentMemberId.value = null
}
