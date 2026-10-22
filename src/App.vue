<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import Board from './components/Board.vue'
import MovePanel from './components/MovePanel.vue'
import LevelSelect from './components/LevelSelect.vue'
import {
  createGame, initialBoard, setupKingsAndHash, makeMove, unmakeMove, legalMoves, gameStatus,
  colorOf, RED, BLACK,
} from './game/xiangqi.js'
import { moveToNotation } from './game/notation.js'
import { LEVELS, buildLevelBoard, loadProgress, saveProgress } from './game/levels.js'

// ---------- 顶层模式 ----------
const mode = ref('menu') // menu | free | levels
const currentLevel = ref(null)

// ---------- 对局状态 ----------
const board = ref(Array.from({ length: 90 }, () => 0))
const turn = ref(RED)
const moveList = ref([])          // {from,to,captured,notation}
const lastMove = ref(null)
const selected = ref(-1)
const hintMoves = ref([])
const thinking = ref(false)
const difficulty = ref(3)
const playerSide = ref(RED)
const gameOver = ref(null)
const showCheck = ref(false)
const muted = ref(localStorage.getItem('xiangqi-muted') === '1')

let g = createGame()
let worker = null
let checkTimer = 0
let thinkTimer = 0
let watchdog = 0
let searchSeq = 0                // 搜索请求序号: 丢弃过期/重复结果
const thinkElapsed = ref(0)
let initialArr = initialBoard()   // 复盘回放起点

const playerTurn = computed(() => turn.value === playerSide.value && !gameOver.value && !reviewMode.value)
const flipped = computed(() => playerSide.value === BLACK)
const difficultyName = computed(() => ({ 1: '入门', 2: '简单', 3: '中等', 4: '困难' }[difficulty.value]))

// ---------- 复盘 ----------
const reviewMode = ref(false)
const reviewPly = ref(0)

function boardAtPly(k) {
  const b = Array.from(initialArr)
  for (let i = 0; i < k; i++) {
    const m = moveList.value[i]
    b[m.to] = b[m.from]; b[m.from] = 0
  }
  return b
}
const displayBoard = computed(() =>
  reviewMode.value ? boardAtPly(reviewPly.value) : board.value)
const displayLastMove = computed(() => {
  if (reviewMode.value) return reviewPly.value > 0 ? moveList.value[reviewPly.value - 1] : null
  return lastMove.value
})

function enterReview(ply = moveList.value.length) {
  reviewMode.value = true
  reviewPly.value = Math.max(0, Math.min(ply, moveList.value.length))
  selected.value = -1
  hintMoves.value = []
}
function exitReview() { reviewMode.value = false }
function reviewStep(d) {
  reviewPly.value = Math.max(0, Math.min(reviewPly.value + d, moveList.value.length))
}
function onJump(ply) {
  if (ply === -2) { copyRecord(); return }
  if (!reviewMode.value) enterReview(ply)
  else reviewPly.value = Math.max(0, Math.min(ply, moveList.value.length))
}
async function copyRecord() {
  const lines = []
  for (let i = 0; i < moveList.value.length; i += 2) {
    const n = i / 2 + 1
    const red = moveList.value[i]?.notation || ''
    const black = moveList.value[i + 1]?.notation || ''
    lines.push(`${n}. ${red} ${black}`.trim())
  }
  const text = `${gameOver.value ? '对局结果: ' + (gameOver.value.win ? '红胜' : playerSide.value === RED ? '黑胜' : '红负') : '对局中'}\n` + lines.join('\n')
  try { await navigator.clipboard.writeText(text); alert('棋谱已复制到剪贴板') } catch (e) { /* 忽略 */ }
}

// ---------- 音效 ----------
let audioCtx = null
function beep(freq, dur = 0.08, type = 'sine', gain = 0.15) {
  if (muted.value) return
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const o = audioCtx.createOscillator(), gn = audioCtx.createGain()
    o.type = type; o.frequency.value = freq
    gn.gain.setValueAtTime(gain, audioCtx.currentTime)
    gn.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur)
    o.connect(gn); gn.connect(audioCtx.destination)
    o.start(); o.stop(audioCtx.currentTime + dur)
  } catch (e) { /* 忽略 */ }
}
const sndMove = () => beep(520, 0.07, 'triangle')
const sndCapture = () => { beep(300, 0.1, 'square', 0.12); setTimeout(() => beep(420, 0.08, 'triangle'), 30) }
const sndCheck = () => { beep(660, 0.09, 'sine'); setTimeout(() => beep(880, 0.12, 'sine'), 90) }
const sndEnd = () => { beep(392, 0.15); setTimeout(() => beep(523, 0.2), 150); setTimeout(() => beep(659, 0.3), 320) }
function toggleMute() {
  muted.value = !muted.value
  localStorage.setItem('xiangqi-muted', muted.value ? '1' : '0')
}

// ---------- 核心流程 ----------
function syncFromEngine() {
  board.value = Array.from(g.board)
  turn.value = g.side
}

function startFree() {
  mode.value = 'free'
  // 有存档则续玩, 否则开新局
  if (!tryRestore()) newGame(playerSide.value, difficulty.value)
}

function newGame(side = playerSide.value, diff = difficulty.value) {
  g = createGame()
  initialArr = initialBoard()
  setupKingsAndHash(g)
  playerSide.value = side
  difficulty.value = diff
  moveList.value = []
  lastMove.value = null
  selected.value = -1
  hintMoves.value = []
  gameOver.value = null
  showCheck.value = false
  thinking.value = false
  reviewMode.value = false
  searchSeq++
  stopThinkTimer()
  clearTimeout(checkTimer)
  syncFromEngine()
  saveGame()
  if (g.side !== playerSide.value) askAI()
}

function startLevel(lv) {
  mode.value = 'levels'
  currentLevel.value = lv
  g = createGame()
  initialArr = buildLevelBoard(lv)
  g.board = Int8Array.from(initialArr)
  g.side = RED
  setupKingsAndHash(g)
  playerSide.value = RED
  difficulty.value = 4
  moveList.value = []
  lastMove.value = null
  selected.value = -1
  hintMoves.value = []
  gameOver.value = null
  showCheck.value = false
  thinking.value = false
  reviewMode.value = false
  searchSeq++
  stopThinkTimer()
  syncFromEngine()
}

function backToMenu() {
  mode.value = 'menu'
  gameOver.value = null
  thinking.value = false
  searchSeq++
  stopThinkTimer()
  clearTimeout(checkTimer)
}

function applyMove(from, to) {
  const notation = moveToNotation(g, from, to)
  const captured = g.board[to]
  makeMove(g, from, to)
  moveList.value.push({ from, to, captured, notation })
  lastMove.value = { from, to }
  selected.value = -1
  hintMoves.value = []
  syncFromEngine()
  if (captured) sndCapture(); else sndMove()

  const st = gameStatus(g)
  if (st === 'mate' || st === 'stalemate') {
    finish(g.side !== playerSide.value)
    return true
  }
  if (st === 'check') {
    showCheck.value = true
    sndCheck()
    clearTimeout(checkTimer)
    checkTimer = setTimeout(() => { showCheck.value = false }, 1200)
  }
  return false
}

function finish(playerWin) {
  gameOver.value = playerWin
    ? { win: true, text: '恭喜获胜！' }
    : { win: false, text: '本局失利，再接再厉！' }
  sndEnd()
  // 通关解锁
  if (mode.value === 'levels' && playerWin && currentLevel.value) {
    const idx = LEVELS.findIndex(l => l.id === currentLevel.value.id)
    const next = idx + 1 < LEVELS.length ? LEVELS[idx + 1].id : null
    const unlocked = loadProgress()
    if (currentLevel.value.id >= unlocked && next) saveProgress(next)
    else if (currentLevel.value.id >= unlocked) saveProgress(LEVELS.length)
  }
  if (mode.value === 'free') localStorage.removeItem('xiangqi-save')
}

function nextLevel() {
  const idx = LEVELS.findIndex(l => l.id === currentLevel.value.id)
  if (idx + 1 < LEVELS.length) startLevel(LEVELS[idx + 1])
}

function onCellClick(idx) {
  if (!playerTurn.value || thinking.value || reviewMode.value) return
  const p = g.board[idx]
  if (selected.value >= 0 && hintMoves.value.includes(idx)) {
    const from = selected.value
    const ended = applyMove(from, idx)
    if (!ended) askAI()
    return
  }
  if (p && colorOf(p) === playerSide.value) {
    selected.value = idx
    const legal = legalMoves(g).filter(m => Math.floor(m / 90) === idx)
    hintMoves.value = legal.map(m => m % 90)
  } else {
    selected.value = -1
    hintMoves.value = []
  }
}

function askAI() {
  thinking.value = true
  thinkElapsed.value = 0
  const startAt = Date.now()
  clearInterval(thinkTimer)
  thinkTimer = setInterval(() => {
    thinkElapsed.value = ((Date.now() - startAt) / 1000).toFixed(1)
  }, 100)

  const seq = ++searchSeq
  // 看门狗: 超时未响应则用兜底着法接管, 避免永久卡在"思考中"
  clearTimeout(watchdog)
  watchdog = setTimeout(() => {
    if (seq !== searchSeq) return
    console.warn('[AI] 搜索超时, 启用兜底着法')
    fallbackMove(seq)
  }, 9000)

  // 注意: moveList 是 Vue 响应式 Proxy, 结构化克隆无法克隆 Proxy,
  // 直接 postMessage 会抛 DataCloneError, 必须转成纯数据
  const payload = {
    board: Array.from(g.board),
    side: g.side,
    moveList: moveList.value.map(m => ({ from: m.from, to: m.to })),
    difficulty: difficulty.value,
    seq,
  }
  try {
    if (!worker) throw new Error('Worker 未就绪')
    worker.postMessage({ type: 'search', payload })
  } catch (err) {
    console.error('[AI] 发送搜索请求失败:', err)
    fallbackMove(seq)
  }
}

// 兜底: 引擎无响应时在主线程做浅层搜索(或随机合法着法), 保证对局能继续
async function fallbackMove(seq) {
  if (seq !== searchSeq || gameOver.value) return
  stopThinkTimer()
  let pick = 0
  try {
    const ms = legalMoves(g)
    if (!ms.length) { thinking.value = false; finish(g.side !== playerSide.value); return }
    const { searchBestMove } = await import('./game/search.js')
    const r = searchBestMove(g, { maxDepth: 2, timeMs: 250, randomness: 90 })
    pick = (r.move && ms.includes(r.move)) ? r.move : ms[Math.floor(Math.random() * ms.length)]
  } catch (e) {
    const ms = legalMoves(g)
    if (!ms.length) { thinking.value = false; finish(g.side !== playerSide.value); return }
    pick = ms[Math.floor(Math.random() * ms.length)]
  }
  if (seq !== searchSeq) return
  thinking.value = false
  const ended = applyMove(Math.floor(pick / 90), pick % 90)
  if (!ended && mode.value === 'free') saveGame()
}

function stopThinkTimer() {
  clearInterval(thinkTimer)
  clearTimeout(watchdog)
  thinkElapsed.value = 0
}

function onWorkerMessage(e) {
  const { type, payload } = e.data || {}
  if (type !== 'result') return
  if (payload?.seq !== searchSeq) return   // 过期结果(已由兜底着法接管)
  stopThinkTimer()
  thinking.value = false
  if (!payload.move) {
    // 引擎未给出着法: 若已终局则判胜, 否则兜底走一步避免死锁
    if (payload.reason === 'mate' || payload.reason === 'stalemate') { finish(true); return }
    fallbackMove(++searchSeq)
    return
  }
  const ended = applyMove(payload.move.from, payload.move.to)
  if (!ended && mode.value === 'free') saveGame()
}

function onWorkerError(err) {
  console.error('[AI Worker]', err)
  if (thinking.value) fallbackMove(searchSeq)
}

// ---------- 悔棋 / 认输 / 存档 ----------
function undo() {
  if (thinking.value || !moveList.value.length || reviewMode.value) return
  searchSeq++   // 丢弃可能在途的 AI 结果
  gameOver.value = null
  do {
    unmakeMove(g)
    moveList.value.pop()
  } while (moveList.value.length && g.side !== playerSide.value)
  selected.value = -1
  hintMoves.value = []
  lastMove.value = moveList.value.length
    ? { from: moveList.value[moveList.value.length - 1].from, to: moveList.value[moveList.value.length - 1].to }
    : null
  syncFromEngine()
  if (mode.value === 'free') saveGame()
  if (g.side !== playerSide.value) askAI()
}

function resign() {
  if (gameOver.value) return
  finish(false)
}

function saveGame() {
  try {
    localStorage.setItem('xiangqi-save', JSON.stringify({
      board: Array.from(g.board),
      side: g.side,
      moveList: moveList.value,
      difficulty: difficulty.value,
      playerSide: playerSide.value,
    }))
  } catch (e) { /* 忽略 */ }
}

function tryRestore() {
  try {
    const raw = localStorage.getItem('xiangqi-save')
    if (!raw) return false
    const s = JSON.parse(raw)
    if (!s || !Array.isArray(s.board) || s.board.length !== 90) return false
    g = createGame()
    g.board = Int8Array.from(s.board)
    g.side = s.side
    setupKingsAndHash(g)
    moveList.value = s.moveList || []
    difficulty.value = s.difficulty || 3
    playerSide.value = s.playerSide || RED
    // 回放起点: 若有完整棋谱则从标准开局重建
    initialArr = initialBoard()
    lastMove.value = moveList.value.length
      ? { from: moveList.value[moveList.value.length - 1].from, to: moveList.value[moveList.value.length - 1].to }
      : null
    syncFromEngine()
    if (g.side !== playerSide.value) askAI()
    return true
  } catch (e) { return false }
}

onMounted(() => {
  worker = new Worker(new URL('./game/aiWorker.js', import.meta.url), { type: 'module' })
  worker.onmessage = onWorkerMessage
  worker.onerror = onWorkerError
  worker.onmessageerror = onWorkerError
  setupKingsAndHash(g)
  syncFromEngine()
})
onBeforeUnmount(() => {
  clearTimeout(checkTimer)
  stopThinkTimer()
  if (worker) worker.terminate()
})
</script>

<template>
  <div class="app">
    <!-- 主菜单 -->
    <div v-if="mode === 'menu'" class="menu">
      <h1 class="menu-title">中国象棋</h1>
      <p class="menu-sub">单机 AI 对弈 · 完全离线</p>
      <button class="menu-btn primary" @click="startFree">自由对弈</button>
      <button class="menu-btn" @click="mode = 'levels'">残局闯关</button>
      <p class="menu-hint">上局对弈已自动存档，进入自由对弈可续玩</p>
    </div>

    <!-- 关卡选择 -->
    <LevelSelect v-else-if="mode === 'levels' && !currentLevel" @start="startLevel" @back="backToMenu" />

    <!-- 对局界面 -->
    <template v-else>
      <header class="topbar">
        <button class="btn small" @click="backToMenu">菜单</button>
        <div class="title">
          <span v-if="mode === 'levels'" class="level-name">第{{ currentLevel.id }}关 · {{ currentLevel.name }}</span>
          <span v-else class="logo">中国象棋</span>
        </div>
        <button class="btn small" @click="toggleMute">{{ muted ? '🔇' : '🔊' }}</button>
      </header>

      <div class="status-bar">
        <span v-if="gameOver" class="chip">对局结束</span>
        <span v-else-if="thinking" class="chip thinking">AI 思考中… {{ thinkElapsed }}s</span>
        <span v-else-if="playerTurn" class="chip you">轮到你走（{{ playerSide === RED ? '红方' : '黑方' }}）</span>
        <span v-else class="chip">AI 行棋中</span>
        <span v-if="mode === 'levels'" class="chip ghost">目标：将死黑方</span>
      </div>

      <div v-if="showCheck" class="check-toast">将 军 ！</div>

      <main class="board-wrap">
        <Board
          :board="displayBoard"
          :last-move="displayLastMove"
          :selected="reviewMode ? -1 : selected"
          :hint-moves="reviewMode ? [] : hintMoves"
          :flipped="flipped"
          @cellClick="onCellClick"
        />
      </main>

      <!-- 复盘工具条 -->
      <div v-if="reviewMode" class="review-bar">
        <button class="btn small" @click="reviewStep(-999)" :disabled="reviewPly === 0">⏮</button>
        <button class="btn small" @click="reviewStep(-1)" :disabled="reviewPly === 0">◀</button>
        <span class="review-pos">{{ reviewPly }} / {{ moveList.length }}</span>
        <button class="btn small" @click="reviewStep(1)" :disabled="reviewPly >= moveList.length">▶</button>
        <button class="btn small" @click="reviewStep(999)" :disabled="reviewPly >= moveList.length">⏭</button>
        <button class="btn small primary" @click="exitReview">退出复盘</button>
      </div>

      <footer v-else class="controls">
        <div v-if="mode === 'free'" class="row">
          <label class="field">
            执子
            <select v-model.number="playerSide" @change="newGame(playerSide, difficulty)" :disabled="thinking">
              <option :value="0">红先</option>
              <option :value="1">黑后</option>
            </select>
          </label>
          <label class="field">
            难度
            <select v-model.number="difficulty" @change="newGame(playerSide, difficulty)" :disabled="thinking">
              <option :value="1">入门</option>
              <option :value="2">简单</option>
              <option :value="3">中等</option>
              <option :value="4">困难</option>
            </select>
          </label>
        </div>
        <div class="row">
          <button class="btn" @click="mode === 'free' ? newGame(playerSide, difficulty) : startLevel(currentLevel)">
            {{ thinking ? '思考中…' : '新对局' }}
          </button>
          <button class="btn" @click="undo" :disabled="thinking || moveList.length === 0">悔棋</button>
          <button class="btn" @click="enterReview()" :disabled="thinking || moveList.length === 0">复盘</button>
          <button class="btn danger" @click="resign" :disabled="!!gameOver">认输</button>
        </div>
      </footer>

      <MovePanel
        v-if="mode === 'free'"
        class="move-panel"
        :moves="moveList"
        :review-ply="reviewMode ? reviewPly : -1"
        @jump="onJump"
      />

      <transition name="fade">
        <div v-if="gameOver" class="overlay">
          <div class="modal">
            <div class="modal-title">{{ gameOver.text }}</div>
            <div class="modal-sub">
              {{ mode === 'levels' ? `第${currentLevel.id}关 · ${currentLevel.name}` : `难度：${difficultyName}` }}
              · 共 {{ Math.ceil(moveList.length / 2) }} 回合
            </div>
            <div class="modal-actions">
              <button v-if="mode === 'levels' && gameOver.win && currentLevel.id < LEVELS.length" class="btn primary" @click="nextLevel">下一关</button>
              <button class="btn" @click="mode === 'free' ? newGame(playerSide, difficulty) : startLevel(currentLevel)">再来一局</button>
              <button class="btn" @click="enterReview()">复盘</button>
            </div>
          </div>
        </div>
      </transition>
    </template>
  </div>
</template>

<style scoped>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  max-width: 620px;
  margin: 0 auto;
  padding: 12px 16px 24px;
}
/* 菜单 */
.menu { padding-top: 18vh; text-align: center; width: 100%; }
.menu-title {
  font-size: 44px;
  font-family: "KaiTi", "STKaiti", serif;
  color: #8b2f23;
  letter-spacing: 8px;
  margin-bottom: 6px;
}
.menu-sub { font-size: 13px; color: #999; margin-bottom: 40px; }
.menu-btn {
  display: block;
  width: 240px;
  margin: 0 auto 14px;
  padding: 13px;
  font-size: 16px;
  border-radius: 12px;
  border: 1px solid #d8c9a5;
  background: #fffdf7;
  color: #5a4632;
  cursor: pointer;
  transition: all 0.15s;
}
.menu-btn:hover { border-color: #8b2f23; color: #8b2f23; transform: translateY(-2px); }
.menu-btn.primary { background: #8b2f23; border-color: #8b2f23; color: #fff; }
.menu-btn.primary:hover { background: #a03a2c; color: #fff; }
.menu-hint { margin-top: 22px; font-size: 12px; color: #bbb; }

/* 顶栏 */
.topbar {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 8px;
}
.title { flex: 1; text-align: center; }
.logo { font-size: 20px; font-weight: 700; font-family: "KaiTi", "STKaiti", serif; color: #8b2f23; }
.level-name { font-size: 16px; font-weight: 700; font-family: "KaiTi", "STKaiti", serif; color: #8b2f23; }
.btn {
  padding: 9px 18px;
  border-radius: 10px;
  border: 1px solid #d0d0d0;
  background: #fff;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s;
}
.btn.small { padding: 6px 12px; font-size: 13px; }
.btn:hover:not(:disabled) { border-color: #8b2f23; color: #8b2f23; }
.btn:disabled { opacity: 0.45; cursor: not-allowed; }
.btn.danger:hover:not(:disabled) { border-color: #c0281c; color: #c0281c; }
.btn.primary { background: #8b2f23; border-color: #8b2f23; color: #fff; }
.btn.primary:hover:not(:disabled) { background: #a03a2c; color: #fff; }

.check-toast {
  position: fixed;
  top: 18%;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  font-size: 34px;
  font-weight: 700;
  font-family: "KaiTi", "STKaiti", serif;
  color: #c0281c;
  text-shadow: 0 2px 10px rgba(192, 40, 28, 0.4);
  animation: pulse 0.5s ease infinite alternate;
  pointer-events: none;
}
@keyframes pulse {
  from { transform: translateX(-50%) scale(1); opacity: 0.85; }
  to { transform: translateX(-50%) scale(1.12); opacity: 1; }
}
.board-wrap { width: 100%; }

/* 状态条 */
.status-bar {
  display: flex;
  gap: 8px;
  justify-content: center;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.chip {
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 999px;
  background: #f0e6d2;
  color: #7a6647;
}
.chip.you { background: #e8f5e0; color: #2d6a1e; font-weight: 600; }
.chip.thinking { background: #fdf0d5; color: #9a6a10; font-weight: 600; }
.chip.ghost { background: transparent; border: 1px dashed #d8c9a5; color: #a89b80; }

/* 复盘工具条 */
.review-bar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: center;
  margin-top: 14px;
  flex-wrap: wrap;
}
.review-pos { font-size: 13px; color: #888; min-width: 64px; text-align: center; }

/* 控制 */
.controls { width: 100%; max-width: 560px; margin-top: 14px; }
.row {
  display: flex;
  gap: 10px;
  justify-content: center;
  margin-top: 8px;
  flex-wrap: wrap;
}
.field { font-size: 13px; color: #555; display: flex; align-items: center; gap: 6px; }
.field select {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #ccc;
  background: #fff;
  font-size: 13px;
}
.move-panel { width: 100%; max-width: 560px; margin-top: 14px; }

/* 弹窗 */
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal {
  background: #fff;
  border-radius: 16px;
  padding: 32px 40px;
  text-align: center;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}
.modal-title { font-size: 22px; font-weight: 700; margin-bottom: 8px; }
.modal-sub { font-size: 13px; color: #888; margin-bottom: 20px; }
.modal-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.25s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
