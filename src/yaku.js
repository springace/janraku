// 役判定器 — 盤面ロジックから完全に独立（単体テスト可能）
//
// 前提（要件定義 §7.1）:
//   ・すべて門前、和了はすべてツモ扱い
//   ・場風/自風が存在しないため役牌は三元牌（白發中）のみ
//   ・刻子は常に暗刻 → 対々和は成立せず、4刻子は四暗刻に格上げ
//   ・立直/一発/海底/嶺上/槍槓、九蓮宝燈、国士無双は不採用
//
// 入力 hand:
//   通常手  { melds: [{ type: 'shuntsu'|'kotsu'|'kantsu', tiles: [id,...] }, x4], pair: id }
//   七対子  { chiitoi: true, pairs: [id x7] }

import { suitOf, numOf, isHonor, isTerminal, isYaochu, isSangen, isKaze, tileName } from './tiles.js';

const GREEN = new Set(['2s', '3s', '4s', '6s', '8s', '6z']);

/** 手牌の全牌を平坦化（槓子は4枚のまま数える） */
export function handTiles(hand) {
  if (hand.chiitoi) return hand.pairs.flatMap((t) => [t, t]);
  return [...hand.melds.flatMap((m) => m.tiles), hand.pair, hand.pair];
}

/** 順子の起点キー（例: 3s4s5s → "s3"） */
function shuntsuKey(m) {
  const nums = m.tiles.map(numOf).sort((a, b) => a - b);
  return suitOf(m.tiles[0]) + nums[0];
}

/**
 * @returns {{ yaku: {name:string,han:number}[], yakuman: {name:string,times:number}[],
 *             han: number, yakumanTimes: number, isYakuman: boolean }}
 */
export function evaluateHand(hand) {
  const tiles = handTiles(hand);
  const yakuman = [];

  // ---------- 役満 ----------
  if (!hand.chiitoi) {
    const triplets = hand.melds.filter((m) => m.type !== 'shuntsu');
    const kantsu = hand.melds.filter((m) => m.type === 'kantsu');
    const sangenTri = triplets.filter((m) => isSangen(m.tiles[0]));
    const kazeTri = triplets.filter((m) => isKaze(m.tiles[0]));

    if (triplets.length === 4) yakuman.push({ name: '四暗刻', times: 1 });
    if (sangenTri.length === 3) yakuman.push({ name: '大三元', times: 1 });
    if (kazeTri.length === 4) yakuman.push({ name: '大四喜', times: 1 });
    else if (kazeTri.length === 3 && isKaze(hand.pair)) yakuman.push({ name: '小四喜', times: 1 });
    if (kantsu.length === 4) yakuman.push({ name: '四槓子', times: 1 });
  }
  if (tiles.every(isHonor)) yakuman.push({ name: '字一色', times: 1 });
  if (tiles.every(isTerminal)) yakuman.push({ name: '清老頭', times: 1 });
  if (tiles.every((t) => GREEN.has(t))) yakuman.push({ name: '緑一色', times: 1 });

  if (yakuman.length > 0) {
    const times = yakuman.reduce((a, y) => a + y.times, 0);
    return { yaku: [], yakuman, han: 0, yakumanTimes: times, isYakuman: true };
  }

  // ---------- 通常役 ----------
  const yaku = [];
  const add = (name, han) => yaku.push({ name, han });

  add('門前清自摸和', 1); // 和了はすべてツモ扱いのため常時成立

  if (tiles.every((t) => !isYaochu(t))) add('断幺九', 1);

  // 一色系
  const suits = new Set(tiles.filter((t) => !isHonor(t)).map(suitOf));
  const hasHonor = tiles.some(isHonor);
  if (suits.size === 1) {
    if (hasHonor) add('混一色', 3);
    else add('清一色', 6);
  }

  if (hand.chiitoi) {
    add('七対子', 2);
    if (tiles.every(isYaochu)) add('混老頭', 2);
    return finish(yaku);
  }

  const melds = hand.melds;
  const triplets = melds.filter((m) => m.type !== 'shuntsu');
  const shuntsuList = melds.filter((m) => m.type === 'shuntsu');
  const kantsu = melds.filter((m) => m.type === 'kantsu');

  // 平和: 4面子すべて順子 かつ 雀頭が役牌(三元牌)でない ※待ちの概念がないため条件から除外
  if (shuntsuList.length === 4 && !isSangen(hand.pair)) add('平和', 1);

  // 役牌（三元牌の刻子・槓子）
  for (const m of triplets) {
    if (isSangen(m.tiles[0])) add(`役牌 ${tileName(m.tiles[0])}`, 1);
  }

  // 一盃口 / 二盃口
  const keyCount = new Map();
  for (const m of shuntsuList) {
    const k = shuntsuKey(m);
    keyCount.set(k, (keyCount.get(k) || 0) + 1);
  }
  let peikoPairs = 0;
  for (const c of keyCount.values()) peikoPairs += Math.floor(c / 2);
  if (peikoPairs === 2) add('二盃口', 3);
  else if (peikoPairs === 1) add('一盃口', 1);

  // 一気通貫
  for (const s of ['m', 'p', 's']) {
    const starts = new Set(shuntsuList.filter((m) => suitOf(m.tiles[0]) === s).map((m) => shuntsuKey(m)));
    if (starts.has(s + 1) && starts.has(s + 4) && starts.has(s + 7)) {
      add('一気通貫', 2);
      break;
    }
  }

  // 混老頭（4刻子の混老頭は四暗刻として既に返却済みなので、ここには来ない）
  const allYaochu = tiles.every(isYaochu);
  if (allYaochu) add('混老頭', 2);

  // 混全帯幺九 / 純全帯幺九 ※全刻子の場合は混老頭・清老頭が優先されるため順子を1つ以上要求
  if (!allYaochu && shuntsuList.length > 0) {
    const everySetHasYaochu =
      melds.every((m) => m.tiles.some(isYaochu)) && isYaochu(hand.pair);
    if (everySetHasYaochu) {
      if (hasHonor) add('混全帯幺九', 2);
      else add('純全帯幺九', 3);
    }
  }

  // 三暗刻（門前のため刻子は常に暗刻。4つなら四暗刻で既に返却済み）
  if (triplets.length === 3) add('三暗刻', 2);

  // 三色同刻
  for (let n = 1; n <= 9; n++) {
    const found = new Set(
      triplets.filter((m) => !isHonor(m.tiles[0]) && numOf(m.tiles[0]) === n).map((m) => suitOf(m.tiles[0]))
    );
    if (found.size === 3) {
      add('三色同刻', 2);
      break;
    }
  }

  // 三色同順
  for (const [k, _] of keyCount) {
    const n = k.slice(1);
    if (keyCount.has('m' + n) && keyCount.has('p' + n) && keyCount.has('s' + n)) {
      add('三色同順', 2);
      break;
    }
  }

  // 三槓子（四槓子は役満で返却済み）
  if (kantsu.length === 3) add('三槓子', 2);

  // 小三元
  const sangenTriCount = triplets.filter((m) => isSangen(m.tiles[0])).length;
  if (sangenTriCount === 2 && isSangen(hand.pair)) add('小三元', 2);

  return finish(yaku);
}

function finish(yaku) {
  const han = yaku.reduce((a, y) => a + y.han, 0);
  return { yaku, yakuman: [], han, yakumanTimes: 0, isYakuman: false };
}
