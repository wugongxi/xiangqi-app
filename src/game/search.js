// AI 引擎: negamax + α-β 剪枝 + 迭代加深 + 置换表 + 静态搜索
import {
  createGame, setupKingsAndHash, makeMove, unmakeMove, genMoves,
  inCheck, gameStatus, colorOf, typeOf, moveFrom, moveTo, ZOBRIST_PIECE,
} from './xiangqi.js'
import { evaluate, PIECE_VALUE } from './evaluate.js'

const INF = 1e9
const MATE = 900000

// 置换表
const TT_SIZE = 1 << 20
const TT_MASK = TT_SIZE - 1
const tt = new Int32Array(TT_SIZE * 4) // [hashLo, hashHi, score, depth|flag<<16|move>>? ] 用两个槽存 move
const ttMove = new Int32Array(TT_SIZE)
const ttDepth = new Int8Array(TT_SIZE)
const ttFlag = new Uint8Array(TT_SIZE) // 0 空 1 exact 2 lower 3 upper
const ttValid = new Uint8Array(TT_SIZE)

function ttStore(hash, depth, score, flag, move) {
  const idx = hash & TT_MASK
  // 深度优先替换
  if (!ttValid[idx] || ttDepth[idx] <= depth) {
    ttValid[idx] = 1
    ttMove[idx] = move
    ttDepth[idx] = depth
    ttFlag[idx] = flag
    tt[idx * 2] = score
  }
}
function ttProbe(hash) {
  const idx = hash & TT_MASK
  if (!ttValid[idx]) return null
  return { move: ttMove[idx], depth: ttDepth[idx], flag: ttFlag[idx], score: tt[idx * 2] }
}
export function ttClear() { ttValid.fill(0) }

// 启发: 杀手走法 + 历史表
const killer = Array.from({ length: 64 }, () => [0, 0])
const history = new Int32Array(90 * 90)

function moveScore(g, m, ttMv, ply) {
  if (m === ttMv) return 1e7
  const cap = g.board[moveTo(m)]
  if (cap) {
    // MVV-LVA
    const victim = PIECE_VALUE[typeOf(cap)]
    const attacker = PIECE_VALUE[typeOf(g.board[moveFrom(m)])]
    return 1e6 + victim * 16 - attacker / 16
  }
  if (killer[ply][0] === m) return 9e5
  if (killer[ply][1] === m) return 8e5
  return history[m]
}

function orderMoves(g, moves, ttMv, ply) {
  const scored = moves.map(m => [moveScore(g, m, ttMv, ply), m])
  scored.sort((a, b) => b[0] - a[0])
  return scored.map(s => s[1])
}

// 静态搜索: 只展开吃子, 消除水平线效应
function quiescence(g, alpha, beta, qdepth = 0) {
  nodes++
  if (nodes % 2048 === 0 && deadline && Date.now() > deadline) throw TIMEOUT
  const stand = evaluate(g) * (g.side === 0 ? 1 : -1)
  if (stand >= beta) return beta
  if (stand > alpha) alpha = stand
  if (qdepth >= 6 || alpha >= beta) return alpha // 深度上限, 避免爆炸
  const caps = genMoves(g).filter(m => g.board[moveTo(m)] !== 0)
  const ordered = orderMoves(g, caps, 0, 0)
  for (const m of ordered) {
    makeMove(g, moveFrom(m), moveTo(m))
    if (inCheck(g, 1 - g.side)) { unmakeMove(g); continue }
    let score
    try {
      score = -quiescence(g, -beta, -alpha, qdepth + 1)
    } finally {
      unmakeMove(g)
    }
    if (score >= beta) return beta
    if (score > alpha) alpha = score
  }
  return alpha
}

function negamax(g, depth, alpha, beta, ply) {
  nodes++
  if (nodes % 4096 === 0 && deadline && Date.now() > deadline) throw TIMEOUT

  if (depth <= 0) return quiescence(g, alpha, beta)

  const hash = g.hash >>> 0
  const entry = ttProbe(hash)
  let ttMv = 0
  if (entry) {
    ttMv = entry.move
    if (entry.depth >= depth && ply > 0) {
      const s = entry.score
      if (entry.flag === 1) return s
      if (entry.flag === 2 && s >= beta) return s
      if (entry.flag === 3 && s <= alpha) return s
    }
  }

  const moves = genMoves(g)
  const ordered = orderMoves(g, moves, ttMv, ply)
  const origAlpha = alpha
  let best = -INF, bestMove = 0
  let legalCount = 0

  for (const m of ordered) {
    const from = moveFrom(m), to = moveTo(m)
    makeMove(g, from, to)
    if (inCheck(g, 1 - g.side)) { unmakeMove(g); continue } // 非法(自将)
    legalCount++
    let score
    try {
      // 将军延伸: 限制次数, 避免连续将军导致深度不下降而无限递归
      const ext = ply < 20 && inCheck(g, g.side) ? 1 : 0
      const nd = Math.max(depth - 1, 0) + ext
      score = -negamax(g, nd, -beta, -alpha, ply + 1)
    } finally {
      unmakeMove(g)
    }
    if (score > best) { best = score; bestMove = m }
    if (score > alpha) alpha = score
    if (alpha >= beta) {
      const cap = g.board[moveTo(m)]
      if (!cap && ply < killer.length) {
        if (killer[ply][0] !== m) { killer[ply][1] = killer[ply][0]; killer[ply][0] = m }
        history[m] += depth * depth
      }
      break
    }
  }

  if (legalCount === 0) {
    // 被将死或困毙
    return -MATE + ply
  }

  const flag = best <= origAlpha ? 3 : best >= beta ? 2 : 1
  ttStore(hash, depth, best, flag, bestMove)
  return best
}

const TIMEOUT = Symbol('timeout')
let nodes = 0
let deadline = 0

// 根搜索: 返回 {move, score, depth}
export function searchBestMove(g, options = {}) {
  const maxDepth = options.maxDepth || 4
  const timeMs = options.timeMs || 1500
  const randomness = options.randomness || 0 // 根节点随机扰动分值, 用于低难度

  nodes = 0
  deadline = Date.now() + timeMs
  if (options.clearTT !== false) ttClear()
  killer.forEach(k => { k[0] = 0; k[1] = 0 })
  history.fill(0)

  let bestMove = 0, bestScore = 0, completedDepth = 0
  const rootMoves = genMoves(g)

  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      const scored = []
      let alpha = -INF
      const ordered = orderMoves(g, rootMoves, bestMove, 0)
      let localBest = 0, localScore = -INF
      for (const m of ordered) {
        makeMove(g, moveFrom(m), moveTo(m))
        if (inCheck(g, 1 - g.side)) { unmakeMove(g); continue }
        let score
        try {
          score = -negamax(g, depth - 1, -INF, -alpha, 1)
        } finally {
          unmakeMove(g)
        }
        if (randomness > 0) score += (Math.random() - 0.5) * randomness
        scored.push({ move: m, score })
        if (score > localScore) { localScore = score; localBest = m; alpha = score }
      }
      bestMove = localBest
      bestScore = localScore
      completedDepth = depth
      // 提前完成且剩余时间不足以再搜一层
      if (Date.now() > deadline - (deadline - (deadline - timeMs)) * 0.4) break
    } catch (e) {
      if (e === TIMEOUT) break
      throw e
    }
  }
  return { move: bestMove, score: bestScore, depth: completedDepth, nodes }
}

// 难度配置 (旧"困难"深度 6/2.5s 实测偏弱, 重排为递进梯度:
// 新"简单"=旧"困难", "中等"/"困难"在此基础上加深搜索)
export const DIFFICULTY = {
  1: { name: '入门', maxDepth: 5, timeMs: 1500, randomness: 90 },
  2: { name: '简单', maxDepth: 6, timeMs: 2500, randomness: 0 },
  3: { name: '中等', maxDepth: 8, timeMs: 5000, randomness: 0 },
  4: { name: '困难', maxDepth: 12, timeMs: 9000, randomness: 0 },
}
