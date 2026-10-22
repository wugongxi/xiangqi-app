// AI Web Worker: 在后台线程搜索, 不阻塞 UI
import { createGame, setupKingsAndHash, moveFrom, moveTo, gameStatus, legalMoves } from './xiangqi.js'
import { searchBestMove, DIFFICULTY } from './search.js'
import { lookupBook } from './book.js'

self.onmessage = (e) => {
  const { type, payload } = e.data
  if (type === 'search') {
    const { board, side, moveList, difficulty, seq } = payload
    const g = createGame()
    // board 已是当前局面(含所有历史着法), 不可再用 moveList 重放, 否则等于每步走两次
    g.board = Int8Array.from(board)
    g.side = side
    setupKingsAndHash(g)
    const cfg = DIFFICULTY[difficulty] || DIFFICULTY[3]
    const st = gameStatus(g)
    if (st === 'mate' || st === 'stalemate') {
      self.postMessage({ type: 'result', payload: { seq, move: null, reason: st } })
      return
    }

    // 开局库: 前几个半回合用定式, 校验合法后随机选择
    const bookMoves = lookupBook(moveList || [])
    if (bookMoves && bookMoves.length) {
      const legal = new Set(legalMoves(g))
      const valid = bookMoves.filter(m => legal.has(m))
      if (valid.length) {
        const pick = valid[Math.floor(Math.random() * valid.length)]
        self.postMessage({
          type: 'result',
          payload: {
            seq,
            move: { from: moveFrom(pick), to: moveTo(pick) },
            book: true, depth: 0, nodes: 0, elapsed: 0, levelName: cfg.name,
          },
        })
        return
      }
    }

    const t0 = Date.now()
    const result = searchBestMove(g, cfg)
    self.postMessage({
      type: 'result',
      payload: {
        seq,
        move: result.move ? { from: moveFrom(result.move), to: moveTo(result.move) } : null,
        score: result.score,
        depth: result.depth,
        nodes: result.nodes,
        elapsed: Date.now() - t0,
        levelName: cfg.name,
      },
    })
  }
}
