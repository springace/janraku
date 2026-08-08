// ゲームループと状態管理

import { MODE_A, TileSupply } from './tiles.js';
import { Board, COLS, ROWS, PIECE_SIZE, normalizeMeld } from './board.js';
import { scoreHand, bestHand, chainMultiplier } from './score.js';

export const PHASE = {
  FALLING: 'falling',
  RESOLVING: 'resolving',
  AGARI: 'agari',
  GAMEOVER: 'gameover',
  PAUSED: 'paused',
};

export const MELD_SLOTS = 4;
export const PAIR_SLOTS = 7;

/** 退避枠から捨てるときのスコアペナルティ */
export const DISCARD_MELD_COST = 800;
export const DISCARD_PAIR_COST = 300;
const HANCHAN_KYOKU = 8;

const FLASH_MS = 260;
const SETTLE_MS = 140;
const LOCK_DELAY_MS = 260;

export class Game {
  constructor({ mode = MODE_A, hanchan = false, onEvent = () => {}, cols = COLS, rows = ROWS, bias } = {}) {
    this.mode = mode;
    this.hanchan = hanchan;
    this.onEvent = onEvent;

    this.board = new Board(cols, rows);
    this.supply = new TileSupply(mode, bias === undefined ? {} : { bias });
    this.meldStock = [];
    this.pairStock = [];

    this.score = 0;
    this.agariCount = 0;
    this.kyoku = 1;
    this.chain = 0;
    this.maxChain = 0;
    this.elapsed = 0;

    this.piece = null;
    this.next = this._draw();
    this.flash = [];
    this.pendingMelds = [];
    this.lastAgari = null;

    this.phase = PHASE.FALLING;
    this.resolveReturn = 'spawn';
    this.dropTimer = 0;
    this.lockTimer = -1;
    this.resolveTimer = 0;
    this.resolveStep = 'scan';

    this._spawn();
  }

  // ---------- 公開情報 ----------

  get level() {
    return 1 + Math.floor(this.agariCount / 2) + Math.floor(this.elapsed / 60000);
  }

  get dropInterval() {
    return Math.max(120, 780 - (this.level - 1) * 55);
  }

  /** 雀頭待ち（面子は揃っているが対子がない）状態か */
  get waitingForHead() {
    return this.meldStock.length >= MELD_SLOTS && this.pairStock.length === 0;
  }

  /** 現在バンク可能な対子セル（ハイライト用） */
  pairableCells() {
    if (this.phase !== PHASE.FALLING) return new Set();
    const cells = this.board.pairableCells();
    if (cells.size === 0) return cells;
    const out = new Set();
    for (const key of cells) {
      const r = Math.floor(key / this.board.cols);
      const c = key % this.board.cols;
      if (this._canBank(this.board.get(r, c))) out.add(key);
    }
    return out;
  }

  /** 落下中ピースが占めるセル [row, col, tileId][] */
  pieceCells() {
    if (!this.piece) return [];
    const { tiles, col, row } = this.piece;
    return tiles.map((t, i) => [row - (PIECE_SIZE - 1) + i, col, t]);
  }

  /** ハードドロップ着地予測位置 */
  ghostRow() {
    if (!this.piece) return null;
    let r = this.piece.row;
    while (this._canPlace(this.piece.col, r + 1)) r++;
    return r;
  }

  // ---------- 操作 ----------

  moveLeft() { this._shift(-1); }
  moveRight() { this._shift(1); }

  _shift(d) {
    if (this.phase !== PHASE.FALLING || !this.piece) return;
    if (this._canPlace(this.piece.col + d, this.piece.row)) {
      this.piece.col += d;
      this._refreshLockTimer();
      this.onEvent({ type: 'move' });
    }
  }

  /** 回転 = ピース内の牌の巡回シフト（2枚なら入れ替え） */
  rotate() {
    if (this.phase !== PHASE.FALLING || !this.piece) return;
    const t = [...this.piece.tiles];
    t.unshift(t.pop());
    this.piece.tiles = t;
    this.onEvent({ type: 'rotate' });
  }

  softDrop() {
    if (this.phase !== PHASE.FALLING || !this.piece) return;
    if (this._canPlace(this.piece.col, this.piece.row + 1)) {
      this.piece.row++;
      this.dropTimer = 0;
      this.score += 1;
    } else {
      this._lock();
    }
  }

  hardDrop() {
    if (this.phase !== PHASE.FALLING || !this.piece) return;
    while (this._canPlace(this.piece.col, this.piece.row + 1)) {
      this.piece.row++;
      this.score += 2;
    }
    this._lock();
  }

  togglePause() {
    if (this.phase === PHASE.PAUSED) {
      this.phase = this._pausedFrom;
    } else if (this.phase === PHASE.FALLING || this.phase === PHASE.RESOLVING) {
      this._pausedFrom = this.phase;
      this.phase = PHASE.PAUSED;
    }
    this.onEvent({ type: 'phase' });
  }

  /**
   * 盤面タップ: 隣接する同一牌2枚を対子枠へバンクする。
   * 対子枠に同じ牌が既にあれば合体して暗槓となり面子枠へ入る。
   */
  tapCell(r, c) {
    if (this.phase !== PHASE.FALLING) return { ok: false };
    const tile = this.board.get(r, c);
    if (!tile) return { ok: false };
    const partner = this.board.pairPartner(r, c);
    if (!partner) return { ok: false };

    const idx = this.pairStock.indexOf(tile);
    if (idx >= 0) {
      if (this.meldStock.length >= MELD_SLOTS) {
        return { ok: false, reason: '面子枠が満杯です' };
      }
      this.pairStock.splice(idx, 1);
      this.meldStock.push({ type: 'kantsu', tiles: [tile, tile, tile, tile] });
      this.score += 300;
      this.onEvent({ type: 'kan', tile });
    } else {
      if (this.pairStock.length >= PAIR_SLOTS) {
        return { ok: false, reason: '対子枠が満杯です' };
      }
      this.pairStock.push(tile);
      this.onEvent({ type: 'pair', tile });
    }

    this.board.remove([[r, c], partner]);
    this.resolveReturn = 'resume';
    this._beginResolve();
    return { ok: true };
  }

  /**
   * 退避枠から1つ捨てる。スコアペナルティがある。
   *
   * 面子枠に面子が1つでも入ると七対子ルートが塞がるため、また対子枠が埋まると
   * 新しい対子を確保できなくなるため、抜け道として用意している。
   * 捨てた後は解決フェーズを回すので、枠が空いたことで盤上に残っていた面子が
   * 改めて退避されることもある。
   */
  discardMeld(index) {
    if (this.phase !== PHASE.FALLING) return { ok: false };
    const meld = this.meldStock[index];
    if (!meld) return { ok: false };
    this.meldStock.splice(index, 1);
    this.score = Math.max(0, this.score - DISCARD_MELD_COST);
    this.onEvent({ type: 'discard', kind: 'meld', meld, cost: DISCARD_MELD_COST });
    this.resolveReturn = 'resume';
    this._beginResolve();
    return { ok: true };
  }

  discardPair(index) {
    if (this.phase !== PHASE.FALLING) return { ok: false };
    const tile = this.pairStock[index];
    if (!tile) return { ok: false };
    this.pairStock.splice(index, 1);
    this.score = Math.max(0, this.score - DISCARD_PAIR_COST);
    this.onEvent({ type: 'discard', kind: 'pair', tile, cost: DISCARD_PAIR_COST });
    this.resolveReturn = 'resume';
    this._beginResolve();
    return { ok: true };
  }

  /** 和了演出を閉じて次局へ */
  continueAfterAgari() {
    if (this.phase !== PHASE.AGARI) return;
    if (this.hanchan && this.kyoku > HANCHAN_KYOKU) {
      this.phase = PHASE.GAMEOVER;
      this.onEvent({ type: 'complete' });
      return;
    }
    if (this.resolveReturn === 'spawn') this._spawn();
    else {
      this.phase = PHASE.FALLING;
      this.lockTimer = -1;
    }
  }

  // ---------- ループ ----------

  update(dt) {
    if (this.phase === PHASE.PAUSED || this.phase === PHASE.GAMEOVER || this.phase === PHASE.AGARI) return;
    this.elapsed += dt;

    if (this.phase === PHASE.FALLING) {
      this._updateFalling(dt);
    } else if (this.phase === PHASE.RESOLVING) {
      this._updateResolve(dt);
    }
  }

  _updateFalling(dt) {
    if (!this.piece) return;
    if (this._canPlace(this.piece.col, this.piece.row + 1)) {
      this.lockTimer = -1;
      this.dropTimer += dt;
      if (this.dropTimer >= this.dropInterval) {
        this.dropTimer = 0;
        this.piece.row++;
      }
    } else {
      if (this.lockTimer < 0) this.lockTimer = LOCK_DELAY_MS;
      this.lockTimer -= dt;
      if (this.lockTimer <= 0) this._lock();
    }
  }

  _refreshLockTimer() {
    if (this.lockTimer >= 0 && this._canPlace(this.piece.col, this.piece.row + 1)) {
      this.lockTimer = -1;
    }
  }

  _lock() {
    const { tiles, col, row } = this.piece;
    for (let i = 0; i < PIECE_SIZE; i++) this.board.set(row - (PIECE_SIZE - 1) + i, col, tiles[i]);
    this.piece = null;
    this.lockTimer = -1;
    this.onEvent({ type: 'lock' });
    this.resolveReturn = 'spawn';
    this._beginResolve();
  }

  _beginResolve() {
    this.phase = PHASE.RESOLVING;
    this.chain = 0;
    this.resolveStep = 'scan';
    this.resolveTimer = 0;
  }

  _updateResolve(dt) {
    this.resolveTimer -= dt;
    if (this.resolveTimer > 0) return;

    if (this.resolveStep === 'scan') {
      this.board.applyGravity();
      const free = MELD_SLOTS - this.meldStock.length;
      const melds = this.board.findMelds(free);
      if (melds.length === 0) {
        this._endResolve();
        return;
      }
      this.chain++;
      this.maxChain = Math.max(this.maxChain, this.chain);
      this.pendingMelds = melds;
      this.flash = melds.flatMap((m) => m.cells);
      this.resolveStep = 'flash';
      this.resolveTimer = FLASH_MS;
      this.onEvent({ type: 'meld', melds, chain: this.chain });
    } else {
      for (const m of this.pendingMelds) {
        this.board.remove(m.cells);
        this.meldStock.push(normalizeMeld(m));
        this.score += 100 * this.chain;
      }
      this.pendingMelds = [];
      this.flash = [];
      this.resolveStep = 'scan';
      this.resolveTimer = SETTLE_MS;
    }
  }

  _endResolve() {
    if (this._checkAgari()) return;
    if (this.resolveReturn === 'spawn') {
      this._spawn();
    } else {
      this.phase = PHASE.FALLING;
      this.lockTimer = -1;
    }
  }

  // ---------- 和了 ----------

  _checkAgari() {
    const normal = this.meldStock.length >= MELD_SLOTS && this.pairStock.length > 0;
    const chiitoi = this.pairStock.length >= PAIR_SLOTS && this.meldStock.length === 0;
    if (!normal && !chiitoi) return false;

    let hand, scored, usedPair = null;
    if (normal) {
      const best = bestHand(this.meldStock.slice(0, MELD_SLOTS), this.pairStock);
      hand = best.hand;
      scored = best.scored;
      usedPair = best.pair;
    } else {
      hand = { chiitoi: true, pairs: [...this.pairStock] };
      scored = scoreHand(hand);
    }

    const mult = chainMultiplier(this.maxChain);
    const gained = Math.round(scored.score * mult);
    this.score += gained;

    // 使用した面子と雀頭を消費。未使用の対子は次局へ持ち越す。
    if (normal) {
      this.meldStock = this.meldStock.slice(MELD_SLOTS);
      this.pairStock.splice(this.pairStock.indexOf(usedPair), 1);
    } else {
      this.pairStock = [];
    }

    this.lastAgari = {
      hand,
      scored,
      usedPair,
      chiitoi: !!chiitoi,
      maxChain: this.maxChain,
      multiplier: mult,
      gained,
      kyoku: this.kyoku,
    };
    this.agariCount++;
    this.kyoku++;
    this.maxChain = 0;
    this.chain = 0;
    this.phase = PHASE.AGARI;
    this.onEvent({ type: 'agari', agari: this.lastAgari });
    return true;
  }

  // ---------- 内部 ----------

  _canBank(tile) {
    if (this.pairStock.includes(tile)) return this.meldStock.length < MELD_SLOTS;
    return this.pairStock.length < PAIR_SLOTS;
  }

  _canPlace(col, row) {
    for (let i = 0; i < PIECE_SIZE; i++) {
      if (!this.board.isEmpty(row - (PIECE_SIZE - 1) + i, col)) return false;
    }
    return true;
  }

  _spawn() {
    const col = Math.floor(this.board.cols / 2) - 1;
    const tiles = this.next;
    this.next = this._draw();
    if (!this._canPlace(col, PIECE_SIZE - 1)) {
      this.piece = null;
      this.phase = PHASE.GAMEOVER;
      this.onEvent({ type: 'gameover' });
      return;
    }
    this.piece = { tiles, col, row: PIECE_SIZE - 1 };
    this.dropTimer = 0;
    this.lockTimer = -1;
    this.phase = PHASE.FALLING;
    this.onEvent({ type: 'spawn' });
  }

  _draw() {
    return this.supply.drawPiece(this._inPlay(), PIECE_SIZE);
  }

  /** 山を再構成するときに差し引く「場に出ている牌」 */
  _inPlay() {
    return [
      ...this.board.allTiles(),
      ...this.meldStock.flatMap((m) => m.tiles),
      ...this.pairStock.flatMap((t) => [t, t]),
      ...(this.piece ? this.piece.tiles : []),
      ...(this.next || []),
    ];
  }
}
