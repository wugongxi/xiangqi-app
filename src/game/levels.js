// 残局闯关: 玩家执红先行, 将死黑方即通关
// 棋子字符: 大写=红(KABNRCP), 小写=黑(kabnrcp), '.'=空
// 行序: row0(黑方顶部) → row9(红方底部), 每行 9 字符
// 所有关卡均经 test-levels.mjs 验证: 无照面/无开局将军/红方可在限步内强制将死

export const LEVELS = [
  {
    id: 1,
    name: '双车错',
    tip: '先用车封锁下二路, 再沉车叫将, 两步将死黑将',
    rows: [
      '....k....',
      '.........',
      '.......R.',
      '.........',
      '.........',
      'R........',
      '.........',
      '.........',
      '.........',
      '...K.....',
    ],
  },
  {
    id: 2,
    name: '重炮杀',
    tip: '后炮平中, 借前炮作炮架叫将, 黑将无路可逃',
    rows: [
      '...aka...',
      '...PCP...',
      '.........',
      '.........',
      '.........',
      '...C.....',
      '.........',
      '.........',
      '.........',
      '....K....',
    ],
  },
  {
    id: 3,
    name: '马后炮',
    tip: '跳马入宫顶住将门作炮架, 马后炮一击致命',
    rows: [
      '...aka...',
      '...P.P...',
      '.........',
      '.....N...',
      '.........',
      '....C....',
      '.........',
      '.........',
      '.........',
      '....K....',
    ],
  },
  {
    id: 4,
    name: '车马临门',
    tip: '沉车底线叫将, 车马兵把将门封死',
    rows: [
      '...k.....',
      '....P....',
      '...a.N...',
      '.......R.',
      '......b..',
      '.........',
      '.........',
      '.........',
      '.........',
      '....K....',
    ],
  },
  {
    id: 5,
    name: '炮碾丹砂',
    tip: '小卒挺进宫心作炮架, 沉车护架, 炮碾丹砂成杀',
    rows: [
      '...aka...',
      '.......R.',
      'b...P....',
      '.........',
      '.........',
      '..C......',
      '.........',
      '.........',
      '.........',
      '....K....',
    ],
  },
  {
    id: 6,
    name: '三子归边',
    tip: '车马炮三子归边, 车占宫心一步成杀',
    rows: [
      '...aka...',
      'R........',
      '.........',
      '...N.....',
      '......b..',
      '....C....',
      '.........',
      '.........',
      '.........',
      '....K....',
    ],
  },
]

export function buildLevelBoard(level) {
  return parseRows(level.rows)
}

function parseRows(rows) {
  const board = new Array(90).fill(0)
  rows.forEach((row, r) => {
    for (let c = 0; c < 9; c++) {
      const ch = row[c]
      if (ch && ch !== '.') board[r * 9 + c] = P[ch]
    }
  })
  return board
}

const P = { K: 1, A: 2, B: 3, N: 4, R: 5, C: 6, P: 7, k: 8, a: 9, b: 10, n: 11, r: 12, c: 13, p: 14 }

export function loadProgress() {
  try {
    const v = JSON.parse(localStorage.getItem('xiangqi-levels') || '{}')
    return Math.max(1, Math.min(LEVELS.length, v.unlocked || 1))
  } catch (e) { return 1 }
}
export function saveProgress(unlocked) {
  try { localStorage.setItem('xiangqi-levels', JSON.stringify({ unlocked })) } catch (e) { /* 忽略 */ }
}
