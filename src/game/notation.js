// 中文纵线记谱法: 红方用汉字数字(一二三…九, 从红方右侧数), 黑方用阿拉伯数字(1-9, 从黑方右侧数)
// 动作: 平(横移) / 进(前行) / 退(后退)
// 直行子(车炮兵将帅)进退用步数; 斜行子(马相象仕士)进退用目标纵线
import { colorOf, typeOf, RED, PIECE_CHARS, K, A, B, N, R, C, P } from './xiangqi.js'

const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九']
// 两侧纵线号都等于 9 - col; 红用汉字数字, 黑用阿拉伯数字
const fileLabel = (col, side) => (side === RED ? CN_NUM[9 - col] : String(9 - col))
const stepLabel = (n, side) => (side === RED ? CN_NUM[n] : String(n))

// 同线同种棋子消歧: 前/中/后 (前 = 靠近敌方那一侧)
function disambiguate(g, from, side, t, file) {
  const same = []
  for (let r = 0; r < 10; r++) {
    const idx = r * 9 + file
    const p = g.board[idx]
    if (p !== 0 && colorOf(p) === side && typeOf(p) === t) same.push(idx)
  }
  if (same.length < 2) return ''
  same.sort((a, b) => Math.floor(a / 9) - Math.floor(b / 9))
  const pos = same.indexOf(from)
  // 行号小 = 靠近黑方; 对红方来说行号小的在前, 黑方相反
  const posFromFront = side === RED ? pos : same.length - 1 - pos
  if (same.length === 2) return posFromFront === 0 ? '前' : '后'
  if (same.length === 3) return ['前', '中', '后'][posFromFront] || ''
  return posFromFront === 0 ? '前' : posFromFront === same.length - 1 ? '后' : '中'
}

// 在 makeMove 之前调用
export function moveToNotation(g, from, to) {
  const piece = g.board[from]
  if (!piece) return ''
  const side = colorOf(piece)
  const t = typeOf(piece)
  const fr = Math.floor(from / 9), fc = from % 9
  const tr = Math.floor(to / 9), tc = to % 9

  const prefix = disambiguate(g, from, side, t, fc)
  const name = PIECE_CHARS[piece]
  const startFile = fileLabel(fc, side)

  const forward = side === RED ? -1 : 1 // 行号变化方向
  const dr = tr - fr

  if (dr === 0) {
    // 平移: 目标纵线
    return `${prefix}${name}${startFile}平${fileLabel(tc, side)}`
  }
  const goingForward = Math.sign(dr) === forward
  const action = goingForward ? '进' : '退'
  if (t === N || t === A || t === B) {
    // 斜行子: 用目标纵线
    return `${prefix}${name}${startFile}${action}${fileLabel(tc, side)}`
  }
  // 直行子: 用步数
  return `${prefix}${name}${startFile}${action}${stepLabel(Math.abs(dr), side)}`
}
