// バランス調整用スイープ: 牌供給バイアスと盤面高さを変えて和了率を測る。
//   node test/balance.mjs
import { Game, PHASE, MELD_SLOTS } from '../src/game.js';
import { Board } from '../src/board.js';

/** game.js の ORIENT と同じ定義（0=上 1=右 2=下 3=左） */
const ORIENT = [[0, -1], [1, 0], [0, 1], [-1, 0]];
import { MODE_A, MODE_B } from '../src/tiles.js';

function cloneBoard(b) {
  const n = new Board(b.cols, b.rows);
  for (let r = 0; r < b.rows; r++) n.grid[r] = [...b.grid[r]];
  return n;
}

function bestPlacement(g) {
  const [a, b] = g.piece.tiles;
  let best = null;
  for (let rot = 0; rot < 4; rot++) {
    for (let col = 0; col < g.board.cols; col++) {
      const bd = cloneBoard(g.board);
      const cells = dropCells(bd, col, rot);
      if (!cells) continue;
      bd.set(cells[0][0], cells[0][1], a);
      bd.set(cells[1][0], cells[1][1], b);
      bd.applyGravity();
      const melds = bd.findMelds(MELD_SLOTS - g.meldStock.length);
      const h = [];
      for (let c = 0; c < bd.cols; c++) {
        let hh = 0;
        for (let r = 0; r < bd.rows; r++) if (bd.grid[r][c]) { hh = bd.rows - r; break; }
        h.push(hh);
      }
      let bump = 0;
      for (let c = 0; c + 1 < h.length; c++) bump += Math.abs(h[c] - h[c + 1]);
      const sc = melds.length * 5000 + bd.pairableCells().size * 40 - Math.max(...h) * 60 - bump * 12 + Math.random();
      if (!best || sc > best.s) best = { s: sc, col, rot };
    }
  }
  return best;
}

/** 指定の列・向きで落としたときに2枚が収まるセル */
function dropCells(board, col, rot) {
  const [dc, dr] = ORIENT[rot];
  const fits = (r) => board.isEmpty(r, col) && board.isEmpty(r + dr, col + dc);
  let row = 1;
  if (!fits(row)) return null;
  while (fits(row + 1)) row++;
  return [[row, col], [row + dr, col + dc]];
}

function play(cfg) {
  const g = new Game({ ...cfg, hanchan: false, onEvent: () => {} });
  const st = { agari: 0, drops: 0, melds: 0, chiitoi: 0, kan: 0, maxChain: 0, yaku: new Set() };
  g.onEvent = (ev) => {
    if (ev.type === 'agari') {
      st.agari++;
      if (ev.agari.chiitoi) st.chiitoi++;
      const s = ev.agari.scored;
      for (const y of s.isYakuman ? s.yakuman : s.yaku) st.yaku.add(y.name);
    } else if (ev.type === 'meld') {
      st.melds += ev.melds.length;
      st.maxChain = Math.max(st.maxChain, ev.chain);
    } else if (ev.type === 'kan') st.kan++;
  };
  let guard = 0;
  while (g.phase !== PHASE.GAMEOVER && guard++ < 30000 && st.drops < 400) {
    if (g.phase === PHASE.AGARI) { g.continueAfterAgari(); continue; }
    if (g.phase === PHASE.FALLING) {
      const cells = g.pairableCells();
      if (cells.size > 0 && (g.waitingForHead || Math.random() < 0.3)) {
        const key = [...cells][Math.floor(Math.random() * cells.size)];
        g.tapCell(Math.floor(key / g.board.cols), key % g.board.cols);
        g.update(300);
        continue;
      }
      const p = bestPlacement(g);
      if (p) {
        for (let i = 0; i < p.rot; i++) g.rotateCW();
        for (let n = 0; n < g.board.cols && g.piece && g.piece.col !== p.col; n++) {
          const before = g.piece.col;
          if (g.piece.col < p.col) g.moveRight(); else g.moveLeft();
          if (g.piece.col === before) break; // 移動できない = 詰まっている
        }
      }
      g.hardDrop();
      st.drops++;
    }
    g.update(300);
  }
  return { ...st, score: g.score };
}

const N = 12;
const allYaku = new Set();
console.log('bias  rows mode | 落下   面子   和了  七対子 暗槓 最大連鎖 平均スコア');
console.log('-'.repeat(72));
for (const rows of [12, 14]) {
  for (const bias of [0, 0.4, 0.62, 0.8]) {
    for (const mode of [MODE_A, MODE_B]) {
      const agg = { drops: 0, melds: 0, agari: 0, chiitoi: 0, kan: 0, chain: 0, score: 0 };
      for (let i = 0; i < N; i++) {
        const r = play({ mode, rows, bias });
        agg.drops += r.drops; agg.melds += r.melds; agg.agari += r.agari;
        agg.chiitoi += r.chiitoi; agg.kan += r.kan;
        agg.chain = Math.max(agg.chain, r.maxChain); agg.score += r.score;
        for (const y of r.yaku) allYaku.add(y);
      }
      const f = (x) => (x / N).toFixed(1).padStart(5);
      console.log(
        `${bias.toFixed(2)}  ${rows}   ${mode}    |${f(agg.drops)} ${f(agg.melds)} ${f(agg.agari)} ${f(agg.chiitoi)} ${f(agg.kan)}   ${String(agg.chain).padStart(3)}   ${Math.round(agg.score / N).toLocaleString().padStart(9)}`
      );
    }
  }
}
console.log('\n観測された役:\n  ' + [...allYaku].sort().join(' / '));
