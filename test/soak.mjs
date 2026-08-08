// ヘッドレス耐久テスト: 簡易AIでゲームループを回し、例外・停止・和了到達を検証する。
//   node test/soak.mjs
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

function run(mode, bank) {
  const g = new Game({ mode, hanchan: false, onEvent: () => {} });
  const stats = { agari: 0, chiitoi: 0, kan: 0, maxChain: 0, drops: 0, yaku: new Set(), best: 0 };
  g.onEvent = (ev) => {
    if (ev.type === 'agari') {
      stats.agari++;
      if (ev.agari.chiitoi) stats.chiitoi++;
      const s = ev.agari.scored;
      stats.best = Math.max(stats.best, ev.agari.gained);
      for (const y of s.isYakuman ? s.yakuman : s.yaku) stats.yaku.add(y.name);
    } else if (ev.type === 'kan') stats.kan++;
    else if (ev.type === 'meld') stats.maxChain = Math.max(stats.maxChain, ev.chain);
  };

  let guard = 0;
  while (g.phase !== PHASE.GAMEOVER && guard++ < 4000) {
    if (g.phase === PHASE.AGARI) { g.continueAfterAgari(); continue; }
    if (g.phase === PHASE.FALLING) {
      if (bank) {
        const cells = g.pairableCells();
        if (cells.size > 0) {
          // 面子が4つ揃っている(雀頭待ち)なら必ず、それ以外は確率的にバンク
          const must = g.waitingForHead;
          if (must || Math.random() < 0.35) {
            const key = [...cells][Math.floor(Math.random() * cells.size)];
            g.tapCell(Math.floor(key / g.board.cols), key % g.board.cols);
            g.update(300);
            continue;
          }
        }
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
      stats.drops++;
    }
    g.update(300);
  }
  return { stats, score: g.score, level: g.level, stuck: guard >= 4000 };
}

const allYaku = new Set();
let total = 0;
let stuck = 0;
for (let i = 0; i < 6; i++) {
  const mode = i % 2 === 0 ? MODE_A : MODE_B;
  const bank = i % 4 !== 3;
  const r = run(mode, bank);
  total += r.stats.agari;
  if (r.stuck) stuck++;
  for (const y of r.stats.yaku) allYaku.add(y);
  console.log(
    `#${String(i).padStart(2)} mode${mode}${bank ? '+bank' : '     '} ` +
    `落下=${String(r.stats.drops).padStart(4)} 和了=${String(r.stats.agari).padStart(3)} ` +
    `七対子=${r.stats.chiitoi} 暗槓=${String(r.stats.kan).padStart(2)} ` +
    `最大連鎖=${r.stats.maxChain} 最高打点=${String(r.stats.best).padStart(6)} score=${r.score}`
  );
}
console.log(`\n合計和了: ${total} / 無限ループ: ${stuck}`);
console.log('観測された役:\n  ' + [...allYaku].sort().join(' / '));
if (total === 0 || stuck > 0) process.exit(1);
