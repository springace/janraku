// 符・点数計算器 — 盤面ロジックから完全に独立（単体テスト可能）
// 要件定義 §8 の簡易符計算に準拠。全和了はツモ扱い、待ち符は 0。

import { isYaochu, isSangen } from './tiles.js';
import { evaluateHand } from './yaku.js';

export function calcFu(hand, result) {
  if (hand.chiitoi) return 25;
  if (result.yaku.some((y) => y.name === '平和')) return 20; // 平和ツモは20符固定

  let fu = 20; // 副底
  fu += 2; // ツモ

  for (const m of hand.melds) {
    const t = m.tiles[0];
    if (m.type === 'kotsu') fu += isYaochu(t) ? 8 : 4;
    else if (m.type === 'kantsu') fu += isYaochu(t) ? 32 : 16;
  }
  if (isSangen(hand.pair)) fu += 2; // 役牌の雀頭

  return Math.ceil(fu / 10) * 10;
}

/** 基本点と得点（子のツモ和了合計 = 基本点 x 4）。切り上げ満貫は不採用。 */
export function calcPoints(fu, han, yakumanTimes) {
  if (yakumanTimes > 0) {
    const label = yakumanTimes === 1 ? '役満' : `${yakumanTimes}倍役満`;
    return { basic: 8000 * yakumanTimes, score: 32000 * yakumanTimes, rank: label };
  }
  let basic;
  let rank = '';
  if (han >= 13) { basic = 8000; rank = '数え役満'; }
  else if (han >= 11) { basic = 6000; rank = '三倍満'; }
  else if (han >= 8) { basic = 4000; rank = '倍満'; }
  else if (han >= 6) { basic = 3000; rank = '跳満'; }
  else if (han >= 5) { basic = 2000; rank = '満貫'; }
  else {
    basic = fu * Math.pow(2, 2 + han);
    if (basic >= 2000) { basic = 2000; rank = '満貫'; }
  }
  return { basic, score: basic * 4, rank };
}

/** 手を評価して符・翻・点数まで一括で返す */
export function scoreHand(hand) {
  const result = evaluateHand(hand);
  const fu = calcFu(hand, result);
  const pts = calcPoints(fu, result.han, result.yakumanTimes);
  return { ...result, fu, ...pts };
}

/**
 * 高点法: 対子ストックの中から最も高得点になる雀頭を自動選択する。
 * @param {Array} melds 面子4つ
 * @param {string[]} pairStock 対子枠の牌
 */
export function bestHand(melds, pairStock) {
  let best = null;
  for (const pair of pairStock) {
    const hand = { melds, pair };
    const s = scoreHand(hand);
    if (!best || s.score > best.scored.score) best = { hand, scored: s, pair };
  }
  return best;
}

/** 連鎖倍率: 1連鎖=1.0, 2=1.5, 3=2.0, 4=2.5, 5以上=3.0 */
export function chainMultiplier(maxChain) {
  if (maxChain <= 1) return 1;
  return Math.min(3, 1 + (maxChain - 1) * 0.5);
}
