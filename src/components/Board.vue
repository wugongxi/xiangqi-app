<script setup>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { PIECE_CHARS, colorOf, RED } from '../game/xiangqi.js'

const props = defineProps({
  board: { type: Array, required: true },     // 90 格
  lastMove: { type: Object, default: null },  // {from, to}
  selected: { type: Number, default: -1 },
  hintMoves: { type: Array, default: () => [] },
  flipped: { type: Boolean, default: false }, // 玩家执黑时翻转显示
})
const emit = defineEmits(['cellClick'])

const M = 34          // 边距
const CELL = 60       // 格距
const W = M * 2 + CELL * 8
const H = M * 2 + CELL * 9
const canvas = ref(null)
let ctx = null
let anim = null // {from,to,piece,start}
let rafId = 0
let bgCanvas = null // 静态棋盘离屏缓存

const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1

// 逻辑坐标 <-> 显示坐标 (翻转)
const toView = (r, c) => props.flipped ? [9 - r, 8 - c] : [r, c]
const fromView = (vr, vc) => props.flipped ? [9 - vr, 8 - vc] : [vr, vc]
const xy = (idx) => {
  const r = Math.floor(idx / 9), c = idx % 9
  const [vr, vc] = toView(r, c)
  return [M + vc * CELL, M + vr * CELL]
}

// ---------- 静态棋盘层 (离屏缓存, 仅在翻转变化时重建) ----------
function buildBackground() {
  bgCanvas = document.createElement('canvas')
  bgCanvas.width = W * dpr; bgCanvas.height = H * dpr
  const g = bgCanvas.getContext('2d')
  g.scale(dpr, dpr)

  g.fillStyle = '#f3dfb6'
  g.fillRect(0, 0, W, H)
  // 木纹质感: 淡横纹
  g.strokeStyle = 'rgba(180,140,80,0.08)'
  g.lineWidth = 2
  for (let y = 6; y < H; y += 14) {
    g.beginPath(); g.moveTo(4, y); g.lineTo(W - 4, y); g.stroke()
  }

  g.strokeStyle = '#5a4632'
  g.lineWidth = 1.5
  // 横线 10 条
  for (let r = 0; r < 10; r++) {
    g.beginPath(); g.moveTo(M, M + r * CELL); g.lineTo(M + 8 * CELL, M + r * CELL); g.stroke()
  }
  // 竖线: 中间断开(楚河汉界)
  for (let c = 0; c < 9; c++) {
    if (c === 0 || c === 8) {
      g.beginPath(); g.moveTo(M + c * CELL, M); g.lineTo(M + c * CELL, M + 9 * CELL); g.stroke()
    } else {
      g.beginPath(); g.moveTo(M + c * CELL, M); g.lineTo(M + c * CELL, M + 4 * CELL); g.stroke()
      g.beginPath(); g.moveTo(M + c * CELL, M + 5 * CELL); g.lineTo(M + c * CELL, M + 9 * CELL); g.stroke()
    }
  }
  // 外框加粗
  g.lineWidth = 3
  g.strokeRect(M - 6, M - 6, 8 * CELL + 12, 9 * CELL + 12)
  g.lineWidth = 1.5

  // 九宫斜线
  g.beginPath(); g.moveTo(M + 3 * CELL, M); g.lineTo(M + 5 * CELL, M + 2 * CELL); g.stroke()
  g.beginPath(); g.moveTo(M + 5 * CELL, M); g.lineTo(M + 3 * CELL, M + 2 * CELL); g.stroke()
  g.beginPath(); g.moveTo(M + 3 * CELL, M + 7 * CELL); g.lineTo(M + 5 * CELL, M + 9 * CELL); g.stroke()
  g.beginPath(); g.moveTo(M + 5 * CELL, M + 7 * CELL); g.lineTo(M + 3 * CELL, M + 9 * CELL); g.stroke()

  // 炮位/兵位标记
  const marks = [[2, 1], [2, 7], [3, 0], [3, 2], [3, 4], [3, 6], [3, 8],
                 [6, 0], [6, 2], [6, 4], [6, 6], [6, 8], [7, 1], [7, 7]]
  for (const [r, c] of marks) {
    const [vr, vc] = toView(r, c)
    const x = M + vc * CELL, y = M + vr * CELL
    const gap = 4, len = 8
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      if ((c === 0 && sx < 0) || (c === 8 && sx > 0)) continue
      g.beginPath()
      g.moveTo(x + sx * gap, y + sy * (gap + len)); g.lineTo(x + sx * gap, y + sy * gap); g.lineTo(x + sx * (gap + len), y + sy * gap)
      g.stroke()
    }
  }

  // 楚河汉界: 垂直居中于第 4/5 行之间的河界带 (y = M + 4.5*CELL)
  g.fillStyle = '#5a4632'
  g.font = `bold ${Math.floor(CELL * 0.52)}px "KaiTi","STKaiti","SimSun",serif`
  g.textAlign = 'center'; g.textBaseline = 'middle'
  const riverY = M + 4.5 * CELL
  const [, c1] = toView(5, 2); const [, c2] = toView(5, 6)
  g.fillText('楚  河', M + c1 * CELL, riverY)
  g.fillText('漢  界', M + c2 * CELL, riverY)
}

function drawPiece(x, y, piece, scale = 1) {
  const R0 = CELL * 0.44 * scale
  const color = colorOf(piece)
  ctx.save()
  ctx.beginPath(); ctx.arc(x + 2, y + 3, R0, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(90,60,20,0.25)'; ctx.fill()
  const grad = ctx.createRadialGradient(x - R0 * 0.35, y - R0 * 0.4, R0 * 0.15, x, y, R0)
  if (color === RED) { grad.addColorStop(0, '#fff6e8'); grad.addColorStop(1, '#f0d9ac') }
  else { grad.addColorStop(0, '#fdf6e9'); grad.addColorStop(1, '#e8d3a8') }
  ctx.beginPath(); ctx.arc(x, y, R0, 0, Math.PI * 2)
  ctx.fillStyle = grad; ctx.fill()
  ctx.strokeStyle = color === RED ? '#b03a2a' : '#2c2c2c'
  ctx.lineWidth = 2.2
  ctx.beginPath(); ctx.arc(x, y, R0 - 1.2, 0, Math.PI * 2); ctx.stroke()
  ctx.lineWidth = 1
  ctx.beginPath(); ctx.arc(x, y, R0 - 6, 0, Math.PI * 2); ctx.stroke()
  ctx.fillStyle = color === RED ? '#b03a2a' : '#2c2c2c'
  ctx.font = `bold ${Math.floor(R0 * 1.18)}px "KaiTi","STKaiti","SimSun",serif`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(PIECE_CHARS[piece] || '', x, y + R0 * 0.06)
  ctx.restore()
}

function drawAll(ts) {
  if (!bgCanvas) return
  ctx.drawImage(bgCanvas, 0, 0, W, H)
  const b = props.board
  let animInfo = null
  let animTo = -1
  if (anim) {
    const t = Math.min((ts - anim.start) / 220, 1)
    const ease = 1 - Math.pow(1 - t, 3)
    const [x1, y1] = xy(anim.from)
    const [x2, y2] = xy(anim.to)
    animInfo = {
      piece: anim.piece,
      x: x1 + (x2 - x1) * ease,
      y: y1 + (y2 - y1) * ease + Math.sin(t * Math.PI) * -10, // 轻微跃起
      done: t >= 1,
    }
    animTo = anim.to
    if (animInfo.done) anim = null
  }
  for (let i = 0; i < 90; i++) {
    const p = b[i]
    if (!p) continue
    if (animInfo && i === animTo) continue // 动画中的棋子单独画
    const [x, y] = xy(i)
    drawPiece(x, y, p)
  }
  if (props.selected >= 0) {
    const [x, y] = xy(props.selected)
    ctx.strokeStyle = '#e8a020'
    ctx.lineWidth = 3
    ctx.setLineDash([6, 4])
    ctx.beginPath(); ctx.arc(x, y, CELL * 0.5, 0, Math.PI * 2); ctx.stroke()
    ctx.setLineDash([])
  }
  if (props.lastMove && !anim) {
    for (const i of [props.lastMove.from, props.lastMove.to]) {
      const [x, y] = xy(i)
      ctx.fillStyle = 'rgba(232,160,32,0.35)'
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill()
    }
  }
  for (const i of props.hintMoves) {
    const [x, y] = xy(i)
    if (b[i]) {
      ctx.strokeStyle = 'rgba(60,150,60,0.9)'
      ctx.lineWidth = 3
      ctx.beginPath(); ctx.arc(x, y, CELL * 0.5, 0, Math.PI * 2); ctx.stroke()
    } else {
      ctx.fillStyle = 'rgba(60,150,60,0.75)'
      ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill()
    }
  }
  if (animInfo) drawPiece(animInfo.x, animInfo.y, animInfo.piece, 1.08)
}

function loop(ts) {
  rafId = 0 // 先清零, 即使 drawAll 抛错也不会残留过期 id 阻塞后续重绘
  drawAll(ts)
  if (anim) rafId = requestAnimationFrame(loop)
}

watch(() => props.lastMove, (mv) => {
  if (!mv) { anim = null; if (!rafId) rafId = requestAnimationFrame(loop); return }
  anim = { from: mv.from, to: mv.to, piece: props.board[mv.to], start: performance.now() }
  if (!rafId) rafId = requestAnimationFrame(loop)
})

watch(() => [props.board, props.selected, props.hintMoves], () => {
  if (!rafId) rafId = requestAnimationFrame(loop)
}, { deep: true })

watch(() => props.flipped, () => {
  buildBackground()
  if (!rafId) rafId = requestAnimationFrame(loop)
})

function onClick(e) {
  const rect = canvas.value.getBoundingClientRect()
  const scale = W / rect.width
  const x = (e.clientX - rect.left) * scale
  const y = (e.clientY - rect.top) * scale
  const vc = Math.round((x - M) / CELL)
  const vr = Math.round((y - M) / CELL)
  if (vc < 0 || vc > 8 || vr < 0 || vr > 9) return
  const [r, c] = fromView(vr, vc)
  emit('cellClick', r * 9 + c)
}

onMounted(() => {
  const cv = canvas.value
  cv.width = W * dpr; cv.height = H * dpr
  ctx = cv.getContext('2d')
  ctx.scale(dpr, dpr)
  buildBackground()
  rafId = requestAnimationFrame(loop)
})
onBeforeUnmount(() => { if (rafId) cancelAnimationFrame(rafId) })
</script>

<template>
  <canvas
    ref="canvas"
    class="board-canvas"
    :style="{ width: '100%', maxWidth: W + 'px', aspectRatio: W + '/' + H }"
    @click="onClick"
  />
</template>

<style scoped>
.board-canvas {
  display: block;
  margin: 0 auto;
  border-radius: 12px;
  box-shadow: 0 6px 24px rgba(60, 40, 10, 0.35), 0 2px 6px rgba(60, 40, 10, 0.25);
  cursor: pointer;
  touch-action: manipulation;
}
</style>
