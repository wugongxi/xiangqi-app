// 象棋规则核心
// 棋盘: 10 行 x 9 列, idx = row * 9 + col
// row 0 = 黑方底线(棋盘顶部), row 9 = 红方底线(棋盘底部)
// 红方向上走(row 递减), 黑方向下走(row 递增)
// side: 0 = 红, 1 = 黑
// 棋子: 0 空; 红 1帅 2仕 3相 4马 5车 6炮 7兵; 黑 8将 9士 10象 11马 12车 13炮 14卒

export const RED = 0
export const BLACK = 1

export const EMPTY = 0
export const K = 1, A = 2, B = 3, N = 4, R = 5, C = 6, P = 7 // 帅仕相马车炮兵
export const kK = 8, kA = 9, kB = 10, kN = 11, kR = 12, kC = 13, kP = 14

export const PIECE_CHARS = {
  1: '帥', 2: '仕', 3: '相', 4: '馬', 5: '車', 6: '炮', 7: '兵',
  8: '將', 9: '士', 10: '象', 11: '馬', 12: '車', 13: '砲', 14: '卒',
}

export const colorOf = p => (p === 0 ? -1 : p >= 8 ? BLACK : RED)
export const typeOf = p => (p === 0 ? 0 : p >= 8 ? p - 7 : p)

// ---------- Zobrist ----------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0)
  }
}
const rnd = mulberry32(20261021)
export const ZOBRIST_PIECE = Array.from({ length: 15 }, () =>
  Array.from({ length: 90 }, () => rnd()))
export const ZOBRIST_SIDE = rnd()

export function initialBoard() {
  const b = new Int8Array(90)
  const back = [R, N, B, A, K, A, B, N, R]
  for (let c = 0; c < 9; c++) {
    b[0 * 9 + c] = back[c] + 7   // 黑方后排
    b[9 * 9 + c] = back[c]       // 红方后排
    b[2 * 9 + c] = c === 1 || c === 7 ? kC : EMPTY
    b[7 * 9 + c] = c === 1 || c === 7 ? C : EMPTY
    b[3 * 9 + c] = c % 2 === 0 ? kP : EMPTY
    b[6 * 9 + c] = c % 2 === 0 ? P : EMPTY
  }
  return b
}

// ---------- 局面对象 ----------
export function createGame() {
  return {
    board: initialBoard(),
    side: RED,
    kingPos: [null, null], // [红帅idx, 黑将idx]
    hash: 0,
    history: [], // {move, captured, hash, side}
    moveList: [], // {from, to, captured}
  }
}

export function setupKingsAndHash(g) {
  g.kingPos = [null, null]
  g.hash = 0
  for (let i = 0; i < 90; i++) {
    const p = g.board[i]
    if (p === 0) continue
    g.hash ^= ZOBRIST_PIECE[p][i]
    if (p === K) g.kingPos[RED] = i
    if (p === kK) g.kingPos[BLACK] = i
  }
  if (g.side === BLACK) g.hash ^= ZOBRIST_SIDE
}

export function makeMove(g, from, to) {
  const b = g.board
  const p = b[from], cap = b[to]
  g.history.push({ move: from * 90 + to, captured: cap, hash: g.hash, side: g.side })
  if (cap) g.hash ^= ZOBRIST_PIECE[cap][to]
  g.hash ^= ZOBRIST_PIECE[p][from] ^ ZOBRIST_PIECE[p][to]
  b[to] = p; b[from] = EMPTY
  if (p === K) g.kingPos[RED] = to
  if (p === kK) g.kingPos[BLACK] = to
  g.side = 1 - g.side
  g.hash ^= ZOBRIST_SIDE
  g.moveList.push({ from, to, captured: cap })
}

export function unmakeMove(g) {
  const h = g.history.pop()
  const from = Math.floor(h.move / 90), to = h.move % 90
  const b = g.board
  const p = b[to]
  b[from] = p; b[to] = h.captured
  if (p === K) g.kingPos[RED] = from
  if (p === kK) g.kingPos[BLACK] = from
  if (h.captured) g.hash ^= ZOBRIST_PIECE[h.captured][to]
  g.hash ^= ZOBRIST_PIECE[p][from] ^ ZOBRIST_PIECE[p][to]
  g.side = h.side
  g.moveList.pop()
  return h.move
}

// ---------- 位置辅助 ----------
const inBoard = (r, c) => r >= 0 && r <= 9 && c >= 0 && c <= 8
const inPalace = (r, c, side) => c >= 3 && c <= 5 && (side === RED ? r >= 7 : r <= 2)
const ownHalf = (r, side) => (side === RED ? r >= 5 : r <= 4)
const DIR4 = [[-1, 0], [1, 0], [0, -1], [0, 1]]

// sq 是否被 bySide 方攻击
export function attacked(g, sq, bySide) {
  const b = g.board
  const r0 = Math.floor(sq / 9), c0 = sq % 9

  // 车 / 对将(帅将照面视同被攻击)
  for (const [dr, dc] of DIR4) {
    let r = r0 + dr, c = c0 + dc
    while (inBoard(r, c)) {
      const p = b[r * 9 + c]
      if (p !== EMPTY) {
        const t = typeOf(p)
        if (colorOf(p) === bySide && (t === R || t === K)) return true
        break
      }
      r += dr; c += dc
    }
  }
  // 炮: 隔一子打
  for (const [dr, dc] of DIR4) {
    let r = r0 + dr, c = c0 + dc, screen = 0
    while (inBoard(r, c)) {
      const p = b[r * 9 + c]
      if (p !== EMPTY) {
        screen++
        if (screen === 2) {
          if (colorOf(p) === bySide && typeOf(p) === C) return true
          break
        }
      }
      r += dr; c += dc
    }
  }
  // 马: 反向查马腿
  const NOFF = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]
  for (const [dr, dc] of NOFF) {
    const nr = r0 + dr, nc = c0 + dc
    if (!inBoard(nr, nc)) continue
    const p = b[nr * 9 + nc]
    if (p === EMPTY || colorOf(p) !== bySide || typeOf(p) !== N) continue
    // 马在 (nr,nc) 跳向 (r0,c0), 马腿在马位旁
    const lr = Math.abs(dr) === 2 ? nr - dr / 2 : nr
    const lc = Math.abs(dc) === 2 ? nc - dc / 2 : nc
    if (b[lr * 9 + lc] === EMPTY) return true
  }
  // 兵/卒
  if (bySide === RED) {
    // 红兵向上走, 攻击其上方一格; 过河后可横走
    if (r0 + 1 <= 9 && b[(r0 + 1) * 9 + c0] === P) return true
    if (r0 >= 5) {
      if (c0 - 1 >= 0 && b[r0 * 9 + c0 - 1] === P) return true
      if (c0 + 1 <= 8 && b[r0 * 9 + c0 + 1] === P) return true
    }
  } else {
    if (r0 - 1 >= 0 && b[(r0 - 1) * 9 + c0] === kP) return true
    if (r0 <= 4) {
      if (c0 - 1 >= 0 && b[r0 * 9 + c0 - 1] === kP) return true
      if (c0 + 1 <= 8 && b[r0 * 9 + c0 + 1] === kP) return true
    }
  }
  return false
}

export function inCheck(g, side) {
  return attacked(g, g.kingPos[side], 1 - side)
}

// ---------- 伪合法走法生成 ----------
export function genMoves(g) {
  const moves = []
  const b = g.board
  const me = g.side, opp = 1 - me
  for (let sq = 0; sq < 90; sq++) {
    const p = b[sq]
    if (p === EMPTY || colorOf(p) !== me) continue
    const t = typeOf(p)
    const r0 = Math.floor(sq / 9), c0 = sq % 9
    const push = (r, c) => {
      if (!inBoard(r, c)) return
      const q = b[r * 9 + c]
      if (q !== EMPTY && colorOf(q) === me) return
      moves.push(sq * 90 + r * 9 + c)
    }
    if (t === K) {
      for (const [dr, dc] of DIR4) {
        const r = r0 + dr, c = c0 + dc
        if (inPalace(r, c, me)) push(r, c)
      }
    } else if (t === A) {
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        const r = r0 + dr, c = c0 + dc
        if (inPalace(r, c, me)) push(r, c)
      }
    } else if (t === B) {
      for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) {
        const r = r0 + dr, c = c0 + dc
        if (!inBoard(r, c) || !ownHalf(r, me)) continue
        if (b[(r0 + dr / 2) * 9 + (c0 + dc / 2)] !== EMPTY) continue // 塞象眼
        push(r, c)
      }
    } else if (t === N) {
      const NM = [[-2, -1, -1, 0], [-2, 1, -1, 0], [-1, -2, 0, -1], [-1, 2, 0, 1],
                  [1, -2, 0, -1], [1, 2, 0, 1], [2, -1, 1, 0], [2, 1, 1, 0]]
      for (const [dr, dc, lr, lc] of NM) {
        if (!inBoard(r0 + dr, c0 + dc)) continue
        if (b[(r0 + lr) * 9 + (c0 + lc)] !== EMPTY) continue // 蹩马腿
        push(r0 + dr, c0 + dc)
      }
    } else if (t === R) {
      for (const [dr, dc] of DIR4) {
        let r = r0 + dr, c = c0 + dc
        while (inBoard(r, c)) {
          const q = b[r * 9 + c]
          if (q === EMPTY) moves.push(sq * 90 + r * 9 + c)
          else { if (colorOf(q) === opp) moves.push(sq * 90 + r * 9 + c); break }
          r += dr; c += dc
        }
      }
    } else if (t === C) {
      for (const [dr, dc] of DIR4) {
        let r = r0 + dr, c = c0 + dc, jumped = false
        while (inBoard(r, c)) {
          const q = b[r * 9 + c]
          if (!jumped) {
            if (q === EMPTY) moves.push(sq * 90 + r * 9 + c)
            else jumped = true
          } else if (q !== EMPTY) {
            if (colorOf(q) === opp) moves.push(sq * 90 + r * 9 + c)
            break
          }
          r += dr; c += dc
        }
      }
    } else if (t === P) {
      const fwd = me === RED ? -1 : 1
      push(r0 + fwd, c0)
      const crossed = me === RED ? r0 <= 4 : r0 >= 5
      if (crossed) { push(r0, c0 - 1); push(r0, c0 + 1) }
    }
  }
  return moves
}

// 合法走法(走完不被将军, 且帅将不照面)
export function legalMoves(g) {
  const res = []
  for (const m of genMoves(g)) {
    const from = Math.floor(m / 90), to = m % 90
    makeMove(g, from, to)
    const ok = !inCheck(g, 1 - g.side) // 1 - g.side = 刚走棋的一方
    unmakeMove(g)
    if (ok) res.push(m)
  }
  return res
}

// 终局判定: 返回 'check' | 'mate' | 'stalemate' | null (针对当前行棋方)
export function gameStatus(g) {
  if (legalMoves(g).length > 0) {
    return inCheck(g, g.side) ? 'check' : null
  }
  return inCheck(g, g.side) ? 'mate' : 'stalemate'
}

export const moveFrom = m => Math.floor(m / 90)
export const moveTo = m => m % 90
