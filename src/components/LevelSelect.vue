<script setup>
import { ref } from 'vue'
import { LEVELS, loadProgress } from '../game/levels.js'

const emit = defineEmits(['start', 'back'])
const unlocked = ref(loadProgress())

function pick(lv, idx) {
  if (idx > unlocked.value - 1) return
  emit('start', lv)
}
</script>

<template>
  <div class="levels">
    <div class="head">
      <button class="btn back" @click="$emit('back')">← 返回</button>
      <h3>残局闯关</h3>
      <span class="progress">已通关 {{ unlocked - 1 }} / {{ LEVELS.length }}</span>
    </div>
    <div class="grid">
      <button
        v-for="(lv, i) in LEVELS"
        :key="lv.id"
        class="card"
        :class="{ locked: i > unlocked - 1 }"
        @click="pick(lv, i)"
      >
        <div class="no">第{{ lv.id }}关</div>
        <div class="nm">{{ lv.name }}</div>
        <div class="tip">{{ i > unlocked - 1 ? '未解锁' : lv.tip }}</div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.levels { width: 100%; max-width: 560px; }
.head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.head h3 { font-size: 18px; color: #6b543a; flex: 1; }
.progress { font-size: 12px; color: #999; }
.btn.back {
  border: 1px solid #d0d0d0; background: #fff; border-radius: 8px;
  padding: 6px 14px; font-size: 13px; cursor: pointer;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
}
.card {
  text-align: left;
  border: 1px solid #e2d5b8;
  background: #fffdf7;
  border-radius: 12px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.card:hover:not(.locked) { border-color: #b03a2a; transform: translateY(-2px); box-shadow: 0 4px 12px rgba(60,40,10,0.12); }
.card.locked { opacity: 0.5; cursor: not-allowed; }
.no { font-size: 12px; color: #b0a48c; margin-bottom: 4px; }
.nm { font-size: 16px; font-weight: 700; color: #8b2f23; font-family: "KaiTi","STKaiti",serif; margin-bottom: 6px; }
.tip { font-size: 12px; color: #888; line-height: 1.4; }
</style>
