<script setup>
import { watch, ref } from 'vue'

const props = defineProps({
  moves: { type: Array, required: true }, // [{from,to,captured,notation}]
  reviewPly: { type: Number, default: -1 }, // -1 = 实时; 否则复盘到第 N 步
})
const emit = defineEmits(['jump'])

const listEl = ref(null)

// 组合成回合行: [{n, red, black}]
function rows() {
  const out = []
  for (let i = 0; i < props.moves.length; i += 2) {
    out.push({
      n: i / 2 + 1,
      red: props.moves[i]?.notation || '',
      black: props.moves[i + 1]?.notation || '',
    })
  }
  return out
}

watch(() => props.moves.length, () => {
  if (props.reviewPly < 0 && listEl.value) {
    listEl.value.scrollTop = listEl.value.scrollHeight
  }
})
</script>

<template>
  <div class="panel">
    <div class="panel-title">
      <span>棋谱</span>
      <button class="copy" @click="$emit('jump', -2)" title="复制棋谱">复制</button>
    </div>
    <div ref="listEl" class="list">
      <div
        v-for="r in rows()"
        :key="r.n"
        class="row"
      >
        <span class="num">{{ r.n }}.</span>
        <button
          class="mv red"
          :class="{ cur: reviewPly === r.n * 2 - 1 }"
          @click="$emit('jump', r.n * 2 - 1)"
        >{{ r.red }}</button>
        <button
          v-if="r.black"
          class="mv black"
          :class="{ cur: reviewPly === r.n * 2 }"
          @click="$emit('jump', r.n * 2)"
        >{{ r.black }}</button>
      </div>
      <div v-if="!moves.length" class="empty">对局开始后在此显示着法</div>
    </div>
  </div>
</template>

<style scoped>
.panel {
  background: #fffdf7;
  border: 1px solid #e2d5b8;
  border-radius: 10px;
  padding: 10px 12px;
}
.panel-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: #6b543a;
  margin-bottom: 6px;
}
.copy {
  font-size: 12px;
  border: none;
  background: #f0e6d2;
  color: #6b543a;
  border-radius: 6px;
  padding: 3px 10px;
  cursor: pointer;
}
.list {
  max-height: 150px;
  overflow-y: auto;
  font-size: 13px;
}
.row {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 2px 0;
}
.num { color: #b0a48c; min-width: 26px; font-size: 12px; }
.mv {
  border: none;
  background: transparent;
  font-size: 13px;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 5px;
  font-family: "KaiTi", "STKaiti", serif;
}
.mv.red { color: #a33022; }
.mv.black { color: #333; }
.mv:hover { background: #f0e6d2; }
.mv.cur { background: #ffe9b8; font-weight: 700; }
.empty { color: #b0a48c; font-size: 12px; padding: 8px 0; }
</style>
