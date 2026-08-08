// 盤面と面子検出

import { suitOf, numOf } from './tiles.js';

export const COLS = 8;
export const ROWS = 14;
/** 落下ピースの牌数（縦並び） */
export const PIECE_SIZE = 2;

const PRIORITY = { kantsu: 3, kotsu: 2, shuntsu: 1 };

export class Board {
  constructor(cols = COLS, rows = ROWS) {
    this.cols = cols;
    this.rows = rows;
    this.grid = Array.from({ length: rows }, () => Array(cols).fill(null));
  }

  get(r, c) {
    if (r < 0 || r >= this.rows || c < 0 || c >= this.cols) return undefined;
    return this.grid[r][c];
  }

  set(r, c, v) {
    this.grid[r][c] = v;
  }

  isEmpty(r, c) {
    if (c < 0 || c >= this.cols || r >= this.rows) return false;
    if (r < 0) return true; // 盤面上部への湧き出しは許可
    return this.grid[r][c] === null;
  }

  /** 盤面・退避枠の在庫計算用 */
  allTiles() {
    const out = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) if (this.grid[r][c]) out.push(this.grid[r][c]);
    }
    return out;
  }

  /** 各列を下詰めする。動いたら true */
  applyGravity() {
    let moved = false;
    for (let c = 0; c < this.cols; c++) {
      let write = this.rows - 1;
      for (let r = this.rows - 1; r >= 0; r--) {
        const v = this.grid[r][c];
        if (v !== null) {
          if (write !== r) {
            this.grid[write][c] = v;
            this.grid[r][c] = null;
            moved = true;
          }
          write--;
        }
      }
    }
    return moved;
  }

  /** 盤面が空か */
  isClear() {
    return this.grid.every((row) => row.every((v) => v === null));
  }

  /**
   * 成立している面子の候補をすべて列挙する。
   * 直線（横・縦）に隣接する3マス（槓子は4マス）のみ。斜めは不採用。
   */
  meldCandidates() {
    const out = [];
    const dirs = [
      [0, 1], // 横
      [1, 0], // 縦
    ];
    for (const [dr, dc] of dirs) {
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          // 槓子: 同一牌4連続
          const c4 = this.line(r, c, dr, dc, 4);
          if (c4 && c4.tiles.every((t) => t === c4.tiles[0])) {
            out.push({ type: 'kantsu', ...c4 });
          }
          const c3 = this.line(r, c, dr, dc, 3);
          if (!c3) continue;
          const [a, b, d] = c3.tiles;
          if (a === b && b === d) {
            out.push({ type: 'kotsu', ...c3 });
          } else if (isShuntsu(c3.tiles)) {
            out.push({ type: 'shuntsu', ...c3 });
          }
        }
      }
    }
    return out;
  }

  line(r, c, dr, dc, len) {
    const cells = [];
    const tiles = [];
    for (let i = 0; i < len; i++) {
      const rr = r + dr * i;
      const cc = c + dc * i;
      const v = this.get(rr, cc);
      if (!v) return null;
      cells.push([rr, cc]);
      tiles.push(v);
    }
    return { cells, tiles };
  }

  /**
   * 重複しない面子を優先度順に貪欲選択する。
   * 優先度: 槓子 > 刻子 > 順子、同順位は「下にあるもの > 左にあるもの」。
   * @param {number} limit 面子枠の空き数
   */
  findMelds(limit) {
    if (limit <= 0) return [];
    const cands = this.meldCandidates();
    cands.sort((x, y) => {
      const p = PRIORITY[y.type] - PRIORITY[x.type];
      if (p !== 0) return p;
      const yr = Math.max(...y.cells.map((v) => v[0])) - Math.max(...x.cells.map((v) => v[0]));
      if (yr !== 0) return yr; // 下にあるものを優先
      return Math.min(...x.cells.map((v) => v[1])) - Math.min(...y.cells.map((v) => v[1]));
    });

    const used = new Set();
    const picked = [];
    for (const cand of cands) {
      if (picked.length >= limit) break;
      const keys = cand.cells.map(([r, c]) => r * this.cols + c);
      if (keys.some((k) => used.has(k))) continue;
      keys.forEach((k) => used.add(k));
      picked.push(cand);
    }
    return picked;
  }

  /** (r,c) の牌と同じ牌が上下左右に隣接しているか。相方の座標を返す */
  pairPartner(r, c) {
    const v = this.get(r, c);
    if (!v) return null;
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (this.get(r + dr, c + dc) === v) return [r + dr, c + dc];
    }
    return null;
  }

  /** 対子を構成できる全セル（ハイライト用）。キーは r*cols+c */
  pairableCells() {
    const set = new Set();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c] && this.pairPartner(r, c)) set.add(r * this.cols + c);
      }
    }
    return set;
  }

  remove(cells) {
    for (const [r, c] of cells) this.grid[r][c] = null;
  }
}

/** 同種の連番3枚か（順不同を許可） */
export function isShuntsu(tiles) {
  const s = suitOf(tiles[0]);
  if (s === 'z') return false;
  if (!tiles.every((t) => suitOf(t) === s)) return false;
  const nums = tiles.map(numOf).sort((a, b) => a - b);
  return nums[1] === nums[0] + 1 && nums[2] === nums[1] + 1;
}

/** 面子候補を役判定器が食える形に正規化（順子は昇順に並べ替える） */
export function normalizeMeld(cand) {
  const tiles = [...cand.tiles];
  if (cand.type === 'shuntsu') tiles.sort((a, b) => numOf(a) - numOf(b));
  return { type: cand.type, tiles };
}
