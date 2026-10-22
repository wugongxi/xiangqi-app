// 开局库: 常见开局定式, 键为已走过的着法序列 "from,to,from,to..."
// 坐标 idx = row*9+col, row0 = 黑方顶部, 红在 row 9
// 运行时会在 Worker 里校验合法性, 非法则回落到搜索
// 着法均为整数编码 from*90+to

const mv = (from, to) => from * 90 + to
// 字典键: 已走着法序列 "from,to,from,to..."
const key = (...pairs) => {
  const seq = []
  for (let i = 0; i < pairs.length; i += 2) seq.push(`${pairs[i]},${pairs[i + 1]}`)
  return seq.join(',')
}

// 红方第一着候选
// 70→67: 炮二平五 (中炮)   60→51: 兵七进一 (仙人指路)
// 83→67: 相三进五 (飞相)   82→65: 马八进七 (起马)
const RED_FIRST = [mv(70, 67), mv(60, 51), mv(83, 67), mv(82, 65)]

// 黑方应对 (键: 红方第一着)
const BLACK_REPLIES = {
  // 对中炮: 屏风马(右马 0,7→2,6) / 还架中炮 / 挺3卒 / 屏风马(左马)
  '70,67': [mv(7, 24), mv(19, 22), mv(29, 38), mv(1, 20)],
  // 对仙人指路: 卒3进1 / 中炮(右) / 中炮(左)
  '60,51': [mv(29, 38), mv(25, 22), mv(19, 22)],
  // 对飞相: 卒3进1 / 中炮 / 飞象
  '83,67': [mv(29, 38), mv(25, 22), mv(2, 22)],
  // 对起马: 卒7进1 / 中炮 / 飞象
  '82,65': [mv(33, 42), mv(25, 22), mv(2, 22)],
}

// 红方第二着 (键: 两回合着法序列)
const RED_SECOND = {
  // 中炮 对 屏风马: 马二进三 / 车一平二 / 兵九进一
  '70,67,7,24': [mv(88, 69), mv(89, 88), mv(62, 53)],
  // 中炮 对 还中炮: 马二进三 / 车一平二
  '70,67,19,22': [mv(88, 69), mv(89, 88)],
  // 中炮 对 挺3卒: 马二进三 / 兵三进一
  '70,67,29,38': [mv(88, 69), mv(62, 53)],
  // 仙人指路 对 中炮: 炮二平五 / 马二进三
  '60,51,25,22': [mv(70, 67), mv(88, 69)],
  // 仙人指路 对 挺卒: 炮二平五 / 马二进三
  '60,51,29,38': [mv(70, 67), mv(88, 69)],
}

// 黑方第三着 (键: 三回合序列前缀, 常见马炮联动)
const BLACK_THIRD = {
  // 中炮-屏风马 后红跳右马: 黑起横车 / 补士
  [`${mv(70, 67)},${mv(7, 24)},${mv(88, 69)}`]: [mv(8, 11), mv(3, 13)],
  // 中炮-还中炮 后红跳马: 黑跳屏风马 / 补士
  [`${mv(70, 67)},${mv(19, 22)},${mv(88, 69)}`]: [mv(7, 24), mv(3, 13)],
}

export function lookupBook(moveList) {
  const seq = moveList.map(m => `${m.from},${m.to}`).join(',')
  if (seq === '') return RED_FIRST.slice()
  if (moveList.length === 1) return BLACK_REPLIES[seq] || null
  if (moveList.length === 2) return RED_SECOND[seq] || null
  if (moveList.length === 3) return BLACK_THIRD[seq] || null
  return null
}
