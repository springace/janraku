// 牌の定義と牌山
// 牌ID は `${数字}${種別}` の2文字文字列。 例) "1m" = 1萬, "5p" = 5筒, "7z" = 中
// z(字牌): 1東 2南 3西 4北 5白 6發 7中

export const MODE_A = 'A'; // 老頭萬子モード: 萬子は1萬・9萬のみ
export const MODE_B = 'B'; // 全牌モード

export const SUIT_LABEL = { m: '萬', p: '筒', s: '索' };
export const HONOR_LABEL = { 1: '東', 2: '南', 3: '西', 4: '北', 5: '白', 6: '發', 7: '中' };

export const suitOf = (id) => id[1];
export const numOf = (id) => id.charCodeAt(0) - 48;

export const isHonor = (id) => id[1] === 'z';
export const isTerminal = (id) => id[1] !== 'z' && (id[0] === '1' || id[0] === '9');
export const isYaochu = (id) => isHonor(id) || isTerminal(id);
export const isSangen = (id) => id[1] === 'z' && id[0] >= '5'; // 白發中
export const isKaze = (id) => id[1] === 'z' && id[0] <= '4'; // 東南西北

/** そのモードで使う牌種の一覧 */
export function kindsForMode(mode) {
  const kinds = [];
  const manzu = mode === MODE_A ? [1, 9] : [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (const n of manzu) kinds.push(`${n}m`);
  for (let n = 1; n <= 9; n++) kinds.push(`${n}p`);
  for (let n = 1; n <= 9; n++) kinds.push(`${n}s`);
  for (let n = 1; n <= 7; n++) kinds.push(`${n}z`);
  return kinds;
}

export function shuffle(arr, rand = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * 牌山を構築する。
 * 「同じ牌は世界に4枚まで」を保つため、盤面・退避枠に出ている牌 (inPlay) を差し引く。
 */
export function buildWall(mode, inPlay = [], rand = Math.random) {
  const counts = new Map();
  for (const k of kindsForMode(mode)) counts.set(k, 4);
  for (const t of inPlay) {
    if (counts.has(t)) counts.set(t, counts.get(t) - 1);
  }
  const wall = [];
  for (const [k, c] of counts) {
    for (let i = 0; i < Math.max(0, c); i++) wall.push(k);
  }
  return shuffle(wall, rand);
}

/**
 * 牌の供給器。
 *
 * 一様ランダムに配ると「隣接3マスで順子/刻子が揃う」確率が低すぎてゲームが成立しないため、
 * 一定確率でピースの牌に「テーマ」（同一種＋近い数字、または同一字牌）を与えて配る。
 * 残り枚数を管理しているので「同じ牌は世界に4枚まで」の制約は保たれる。
 */
export class TileSupply {
  constructor(mode, { bias = 0.45, rand = Math.random } = {}) {
    this.mode = mode;
    this.bias = bias;
    this.rand = rand;
    this.kinds = kindsForMode(mode);
    this.replenish([]);
  }

  /** 場に出ている牌を差し引いて残り枚数を作り直す */
  replenish(inPlay) {
    this.counts = new Map(this.kinds.map((k) => [k, 4]));
    for (const t of inPlay) {
      if (this.counts.has(t)) this.counts.set(t, this.counts.get(t) - 1);
    }
    this.total = 0;
    for (const [k, v] of this.counts) {
      const n = Math.max(0, v);
      this.counts.set(k, n);
      this.total += n;
    }
  }

  _take(t) {
    this.counts.set(t, this.counts.get(t) - 1);
    this.total--;
    return t;
  }

  _pick(weight) {
    let sum = 0;
    const avail = [];
    const w = [];
    for (const k of this.kinds) {
      if (this.counts.get(k) <= 0) continue;
      const x = Math.max(0, weight(k));
      avail.push(k);
      w.push(x);
      sum += x;
    }
    if (avail.length === 0) return null;
    if (sum <= 0) return avail[Math.floor(this.rand() * avail.length)];
    let r = this.rand() * sum;
    for (let i = 0; i < avail.length; i++) {
      r -= w[i];
      if (r <= 0) return avail[i];
    }
    return avail[avail.length - 1];
  }

  /** ピースを n 枚引く。inPlay は山が尽きたときの再構成に使う */
  drawPiece(inPlay = [], n = 2) {
    if (this.total < n) this.replenish(inPlay);
    if (this.total < n) this.replenish([]);

    const weight = this.rand() < this.bias ? this._themeWeight() : () => 1;
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = this._pick(weight);
      if (t === null) break;
      out.push(this._take(t));
    }
    while (out.length < n) out.push(out[0] || this.kinds[0]);
    return out;
  }

  /** テーマ重み: 同一種で数字が近い牌／同一字牌を厚くする */
  _themeWeight() {
    const suits = ['m', 'p', 's', 'z'];
    const suit = suits[Math.floor(this.rand() * suits.length)];

    if (suit === 'z') {
      const target = `${1 + Math.floor(this.rand() * 7)}z`;
      return (k) => (k === target ? 6 : isHonor(k) ? 0.4 : 0.05);
    }
    const pool = this.kinds.filter((k) => suitOf(k) === suit);
    if (pool.length === 0) return () => 1;
    const center = numOf(pool[Math.floor(this.rand() * pool.length)]);
    return (k) => {
      if (suitOf(k) !== suit) return 0.05;
      const d = Math.abs(numOf(k) - center);
      if (d <= 1) return 4;
      if (d === 2) return 1.2;
      return 0.25;
    };
  }
}

/** 表示用のラベル: { main, sub, cls } */
export function tileFace(id) {
  const s = suitOf(id);
  const n = numOf(id);
  if (s === 'z') return { main: HONOR_LABEL[n], sub: '', cls: n >= 5 ? `honor h${n}` : 'honor kaze' };
  return { main: String(n), sub: SUIT_LABEL[s], cls: s };
}

/** 「1萬」のような読み上げ用テキスト */
export function tileName(id) {
  const s = suitOf(id);
  const n = numOf(id);
  if (s === 'z') return HONOR_LABEL[n];
  return `${n}${SUIT_LABEL[s]}`;
}
