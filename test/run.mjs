// 単体テスト: node test/run.mjs
// 役判定器・点数計算器・面子検出は盤面/DOM に依存しないためそのまま実行できる。

import { evaluateHand } from '../src/yaku.js';
import { scoreHand, bestHand, calcFu, chainMultiplier } from '../src/score.js';
import { Board, isShuntsu, normalizeMeld } from '../src/board.js';
import { buildWall, kindsForMode, MODE_A, MODE_B } from '../src/tiles.js';
import { Game, PHASE, DISCARD_MELD_COST, DISCARD_PAIR_COST } from '../src/game.js';

let pass = 0;
let fail = 0;

function t(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (e) {
    fail++;
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${e.message}`);
  }
}
function eq(a, b, msg = '') {
  if (a !== b) throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
function ok(v, msg = '') {
  if (!v) throw new Error(msg || 'expected truthy');
}

const shun = (...tiles) => ({ type: 'shuntsu', tiles });
const kou = (t3) => ({ type: 'kotsu', tiles: [t3, t3, t3] });
const kan = (t4) => ({ type: 'kantsu', tiles: [t4, t4, t4, t4] });
const names = (r) => (r.isYakuman ? r.yakuman : r.yaku).map((y) => y.name);

// ================= 役判定 =================
console.log('\n役判定');

t('平和ツモ + 断幺九', () => {
  const hand = {
    melds: [shun('2p', '3p', '4p'), shun('5p', '6p', '7p'), shun('3s', '4s', '5s'), shun('6s', '7s', '8s')],
    pair: '5m',
  };
  const r = evaluateHand(hand);
  ok(names(r).includes('平和'), '平和');
  ok(names(r).includes('断幺九'), '断幺九');
  ok(names(r).includes('門前清自摸和'), 'ツモ');
  eq(r.han, 3);
});

t('雀頭が三元牌だと平和は不成立', () => {
  const hand = {
    melds: [shun('2p', '3p', '4p'), shun('5p', '6p', '7p'), shun('3s', '4s', '5s'), shun('6s', '7s', '8s')],
    pair: '7z',
  };
  ok(!names(evaluateHand(hand)).includes('平和'));
});

t('順子は順不同で入力しても平和・一盃口が判定できる', () => {
  const hand = {
    melds: [shun('4p', '2p', '3p'), shun('3p', '4p', '2p'), shun('3s', '4s', '5s'), shun('6s', '7s', '8s')],
    pair: '5m',
  };
  ok(names(evaluateHand(hand)).includes('一盃口'));
});

t('二盃口', () => {
  const hand = {
    melds: [shun('2p', '3p', '4p'), shun('2p', '3p', '4p'), shun('6s', '7s', '8s'), shun('6s', '7s', '8s')],
    pair: '5m',
  };
  const n = names(evaluateHand(hand));
  ok(n.includes('二盃口'));
  ok(!n.includes('一盃口'), '一盃口と重複しない');
});

t('4刻子は対々和ではなく四暗刻（役満）になる', () => {
  const hand = { melds: [kou('2p'), kou('5s'), kou('8m'), kou('3p')], pair: '5m' };
  const r = evaluateHand(hand);
  ok(r.isYakuman);
  ok(names(r).includes('四暗刻'));
  ok(!names(r).includes('対々和'), '対々和は存在しない');
});

t('三暗刻（刻子3 + 順子1）', () => {
  const hand = { melds: [kou('2p'), kou('5s'), kou('8m'), shun('3p', '4p', '5p')], pair: '5m' };
  ok(names(evaluateHand(hand)).includes('三暗刻'));
});

t('大三元', () => {
  const hand = { melds: [kou('5z'), kou('6z'), kou('7z'), shun('3p', '4p', '5p')], pair: '5m' };
  const r = evaluateHand(hand);
  ok(r.isYakuman);
  ok(names(r).includes('大三元'));
});

t('小三元 + 役牌2つ', () => {
  const hand = { melds: [kou('5z'), kou('6z'), shun('3p', '4p', '5p'), shun('6s', '7s', '8s')], pair: '7z' };
  const n = names(evaluateHand(hand));
  ok(n.includes('小三元'));
  eq(n.filter((x) => x.startsWith('役牌')).length, 2);
});

t('一気通貫', () => {
  const hand = {
    melds: [shun('1p', '2p', '3p'), shun('4p', '5p', '6p'), shun('7p', '8p', '9p'), shun('3s', '4s', '5s')],
    pair: '5m',
  };
  ok(names(evaluateHand(hand)).includes('一気通貫'));
});

t('三色同順', () => {
  const hand = {
    melds: [shun('1m', '2m', '3m'), shun('1p', '2p', '3p'), shun('1s', '2s', '3s'), shun('6s', '7s', '8s')],
    pair: '5p',
  };
  ok(names(evaluateHand(hand)).includes('三色同順'));
});

t('三色同刻', () => {
  const hand = { melds: [kou('1m'), kou('1p'), kou('1s'), shun('3p', '4p', '5p')], pair: '5s' };
  ok(names(evaluateHand(hand)).includes('三色同刻'));
});

t('清一色', () => {
  const hand = {
    melds: [shun('1p', '2p', '3p'), shun('4p', '5p', '6p'), shun('7p', '8p', '9p'), kou('2p')],
    pair: '5p',
  };
  const n = names(evaluateHand(hand));
  ok(n.includes('清一色'));
  ok(!n.includes('混一色'));
});

t('混一色', () => {
  const hand = {
    melds: [shun('1p', '2p', '3p'), shun('4p', '5p', '6p'), shun('7p', '8p', '9p'), kou('1z')],
    pair: '5p',
  };
  ok(names(evaluateHand(hand)).includes('混一色'));
});

t('混全帯幺九', () => {
  const hand = {
    melds: [shun('1p', '2p', '3p'), shun('7s', '8s', '9s'), kou('1z'), kou('9m')],
    pair: '1s',
  };
  ok(names(evaluateHand(hand)).includes('混全帯幺九'));
});

t('純全帯幺九（字牌なし）', () => {
  const hand = {
    melds: [shun('1p', '2p', '3p'), shun('7s', '8s', '9s'), kou('9m'), shun('1m', '2m', '3m')],
    pair: '9p',
  };
  const n = names(evaluateHand(hand));
  ok(n.includes('純全帯幺九'));
  ok(!n.includes('混全帯幺九'));
});

t('三槓子', () => {
  const hand = { melds: [kan('2p'), kan('5s'), kan('8m'), shun('3p', '4p', '5p')], pair: '5m' };
  ok(names(evaluateHand(hand)).includes('三槓子'));
});

t('四槓子は役満', () => {
  const hand = { melds: [kan('2p'), kan('5s'), kan('8m'), kan('3p')], pair: '5m' };
  const r = evaluateHand(hand);
  ok(r.isYakuman);
  ok(names(r).includes('四槓子'));
});

t('字一色（役満・複合）', () => {
  const hand = { melds: [kou('1z'), kou('2z'), kou('3z'), kou('5z')], pair: '7z' };
  const r = evaluateHand(hand);
  ok(r.isYakuman);
  ok(names(r).includes('字一色'));
  ok(names(r).includes('四暗刻'));
});

t('清老頭（役満）', () => {
  const hand = { melds: [kou('1m'), kou('9m'), kou('1p'), kou('9s')], pair: '9p' };
  const r = evaluateHand(hand);
  ok(r.isYakuman);
  ok(names(r).includes('清老頭'));
});

t('緑一色（役満）', () => {
  const hand = { melds: [shun('2s', '3s', '4s'), kou('6s'), kou('8s'), kou('6z')], pair: '4s' };
  const r = evaluateHand(hand);
  ok(r.isYakuman);
  ok(names(r).includes('緑一色'));
});

t('小四喜 / 大四喜', () => {
  const small = { melds: [kou('1z'), kou('2z'), kou('3z'), shun('3p', '4p', '5p')], pair: '4z' };
  ok(names(evaluateHand(small)).includes('小四喜'));
  const big = { melds: [kou('1z'), kou('2z'), kou('3z'), kou('4z')], pair: '5p' };
  ok(names(evaluateHand(big)).includes('大四喜'));
});

t('七対子', () => {
  const hand = { chiitoi: true, pairs: ['2p', '5p', '3s', '7s', '2m', '1z', '4z'] };
  const r = evaluateHand(hand);
  ok(names(r).includes('七対子'));
  ok(names(r).includes('門前清自摸和'));
  eq(r.han, 3);
});

t('七対子 + 混老頭', () => {
  const hand = { chiitoi: true, pairs: ['1m', '9m', '1p', '9p', '1s', '1z', '5z'] };
  const n = names(evaluateHand(hand));
  ok(n.includes('七対子'));
  ok(n.includes('混老頭'));
});

t('七対子 + 清一色', () => {
  const hand = { chiitoi: true, pairs: ['1p', '2p', '3p', '4p', '5p', '6p', '7p'] };
  ok(names(evaluateHand(hand)).includes('清一色'));
});

// ================= 符・点数 =================
console.log('\n符・点数');

t('平和ツモは20符固定', () => {
  const hand = {
    melds: [shun('2p', '3p', '4p'), shun('5p', '6p', '7p'), shun('3s', '4s', '5s'), shun('6s', '7s', '8s')],
    pair: '5m',
  };
  const s = scoreHand(hand);
  eq(s.fu, 20);
  eq(s.han, 3);
  eq(s.basic, 640);
  eq(s.score, 2560);
});

t('七対子は25符', () => {
  const hand = { chiitoi: true, pairs: ['2p', '5p', '3s', '7s', '2m', '1z', '4z'] };
  const s = scoreHand(hand);
  eq(s.fu, 25);
  eq(s.han, 3);
  eq(s.score, 3200);
});

t('暗刻・暗槓の符（幺九/中張）', () => {
  // 副底20 + ツモ2 + 中張暗刻4 + 幺九暗刻8 + 中張暗槓16 = 50 → 50符
  const hand = { melds: [kou('2p'), kou('1p'), kan('5s'), shun('3p', '4p', '5p')], pair: '2s' };
  const r = evaluateHand(hand);
  eq(calcFu(hand, r), 50);
});

t('役満は32000点', () => {
  const hand = { melds: [kou('2p'), kou('5s'), kou('8m'), kou('3p')], pair: '5m' };
  const s = scoreHand(hand);
  ok(s.isYakuman);
  eq(s.score, 32000);
  eq(s.rank, '役満');
});

t('複合役満は倍役満', () => {
  const hand = { melds: [kou('1z'), kou('2z'), kou('3z'), kou('5z')], pair: '7z' };
  const s = scoreHand(hand);
  eq(s.yakumanTimes, 2); // 四暗刻 + 字一色
  eq(s.score, 64000);
});

t('満貫で頭打ち（切り上げ満貫なし）', () => {
  const hand = {
    melds: [shun('1p', '2p', '3p'), shun('4p', '5p', '6p'), shun('7p', '8p', '9p'), shun('2p', '3p', '4p')],
    pair: '5p',
  };
  const s = scoreHand(hand); // 清一色6 + ツモ1 + 一気通貫2 + ... で跳満以上
  ok(s.han >= 6);
  ok(s.score >= 12000);
});

t('高点法: 最も高い対子が雀頭に選ばれる', () => {
  const melds = [shun('2p', '3p', '4p'), shun('5p', '6p', '7p'), shun('3s', '4s', '5s'), shun('6s', '7s', '8s')];
  // 5m は平和+断幺九、7z(中) は平和が消えて符だけ増える → 5m が高いはず
  const best = bestHand(melds, ['7z', '5m']);
  eq(best.pair, '5m');
});

t('連鎖倍率', () => {
  eq(chainMultiplier(1), 1);
  eq(chainMultiplier(2), 1.5);
  eq(chainMultiplier(3), 2);
  eq(chainMultiplier(9), 3);
});

// ================= 盤面 =================
console.log('\n盤面・面子検出');

t('isShuntsu は順不同を許可し、字牌は拒否する', () => {
  ok(isShuntsu(['3p', '1p', '2p']));
  ok(!isShuntsu(['1p', '2p', '4p']));
  ok(!isShuntsu(['1p', '2s', '3p']));
  ok(!isShuntsu(['1z', '2z', '3z']));
});

t('横並びの順子を検出する', () => {
  const b = new Board();
  b.set(11, 0, '3p'); b.set(11, 1, '1p'); b.set(11, 2, '2p');
  const m = b.findMelds(4);
  eq(m.length, 1);
  eq(m[0].type, 'shuntsu');
  eq(normalizeMeld(m[0]).tiles.join(''), '1p2p3p');
});

t('縦並びの刻子を検出する', () => {
  const b = new Board();
  b.set(9, 3, '7z'); b.set(10, 3, '7z'); b.set(11, 3, '7z');
  const m = b.findMelds(4);
  eq(m.length, 1);
  eq(m[0].type, 'kotsu');
});

t('4枚並びは刻子ではなく槓子になる', () => {
  const b = new Board();
  for (let c = 0; c < 4; c++) b.set(11, c, '5s');
  const m = b.findMelds(4);
  eq(m.length, 1);
  eq(m[0].type, 'kantsu');
  eq(m[0].tiles.length, 4);
});

t('面子枠の空きを超えて検出しない', () => {
  const b = new Board();
  b.set(11, 0, '1p'); b.set(11, 1, '2p'); b.set(11, 2, '3p');
  b.set(10, 0, '1s'); b.set(10, 1, '2s'); b.set(10, 2, '3s');
  eq(b.findMelds(4).length, 2);
  eq(b.findMelds(1).length, 1);
  eq(b.findMelds(0).length, 0);
});

t('同じ牌を2つの面子で二重使用しない', () => {
  const b = new Board();
  // 横に 1p 2p 3p 4p → 順子候補が2つ重なるが、取れるのは1つ
  b.set(11, 0, '1p'); b.set(11, 1, '2p'); b.set(11, 2, '3p'); b.set(11, 3, '4p');
  eq(b.findMelds(4).length, 1);
});

t('重力で下詰めされる', () => {
  const b = new Board();
  b.set(3, 2, '1p');
  b.set(7, 2, '2p');
  b.applyGravity();
  eq(b.get(b.rows - 1, 2), '2p');
  eq(b.get(b.rows - 2, 2), '1p');
  eq(b.get(3, 2), null);
});

t('隣接する同一牌を対子として検出する', () => {
  const b = new Board();
  b.set(11, 0, '5z'); b.set(11, 1, '5z');
  ok(b.pairPartner(11, 0));
  eq(b.pairableCells().size, 2);
  b.set(11, 3, '9m');
  eq(b.pairPartner(11, 3), null);
});

// ================= 牌山 =================
console.log('\n牌山');

t('モードAは27種108枚、萬子は1・9のみ', () => {
  const kinds = kindsForMode(MODE_A);
  eq(kinds.length, 27);
  eq(kinds.filter((k) => k.endsWith('m')).join(','), '1m,9m');
  eq(buildWall(MODE_A).length, 108);
});

t('モードBは34種136枚', () => {
  eq(kindsForMode(MODE_B).length, 34);
  eq(buildWall(MODE_B).length, 136);
});

t('場に出ている牌は山から差し引かれる（同一牌は世界に4枚まで）', () => {
  const wall = buildWall(MODE_B, ['1p', '1p', '1p']);
  eq(wall.length, 133);
  eq(wall.filter((t) => t === '1p').length, 1);
});

t('モードAでは三色同順が構成不可能', () => {
  // 萬子の順子が作れない = 三色同順の成立条件を満たせない
  const manzu = kindsForMode(MODE_A).filter((k) => k.endsWith('m')).map((k) => +k[0]);
  const canShuntsu = manzu.some((n) => manzu.includes(n + 1) && manzu.includes(n + 2));
  ok(!canShuntsu);
});

// ================= 退避枠から捨てる =================
console.log('\n退避枠から捨てる');

function newGame(mode = MODE_B) {
  return new Game({ mode, onEvent: () => {} });
}

t('面子を捨てるとスコアが引かれる', () => {
  const g = newGame();
  g.score = 5000;
  g.meldStock = [shun('1p', '2p', '3p'), kou('7z')];
  eq(g.discardMeld(0).ok, true);
  eq(g.meldStock.length, 1);
  eq(g.meldStock[0].type, 'kotsu');
  eq(g.score, 5000 - DISCARD_MELD_COST);
});

t('対子を捨てるとスコアが引かれる', () => {
  const g = newGame();
  g.score = 5000;
  g.pairStock = ['5s', '2p', '1z'];
  eq(g.discardPair(1).ok, true);
  eq(g.pairStock.join(','), '5s,1z');
  eq(g.score, 5000 - DISCARD_PAIR_COST);
});

t('スコアは0未満にならない', () => {
  const g = newGame();
  g.score = 100;
  g.meldStock = [kou('7z')];
  g.discardMeld(0);
  eq(g.score, 0);
});

t('空の枠は捨てられない', () => {
  const g = newGame();
  eq(g.discardMeld(0).ok, false);
  eq(g.discardPair(3).ok, false);
});

t('落下中以外は捨てられない', () => {
  const g = newGame();
  g.meldStock = [kou('7z')];
  g.phase = PHASE.RESOLVING;
  eq(g.discardMeld(0).ok, false);
  eq(g.meldStock.length, 1);
});

t('面子枠を空にすると七対子が発火する', () => {
  const g = newGame();
  g.meldStock = [kou('9m')];
  g.pairStock = ['1p', '2p', '3p', '4p', '5p', '6p', '7p'];
  g.discardMeld(0);
  // 捨てた後は解決フェーズを回すので、進めると和了判定に到達する
  for (let i = 0; i < 10 && g.phase !== PHASE.AGARI; i++) g.update(300);
  eq(g.phase, PHASE.AGARI);
  ok(g.lastAgari.chiitoi, '七対子で和了している');
  ok(g.lastAgari.scored.yaku.some((y) => y.name === '七対子'));
});

t('面子枠を空けると盤上に残っていた面子が改めて退避される', () => {
  const g = newGame();
  // 面子枠を満杯にし、盤面には成立済みの順子を置いておく
  g.meldStock = [kou('7z'), kou('6z'), kou('5z'), kou('1z')];
  g.pairStock = [];
  const bottom = g.board.rows - 1;
  g.board.set(bottom, 0, '1s');
  g.board.set(bottom, 1, '2s');
  g.board.set(bottom, 2, '3s');
  eq(g.board.findMelds(0).length, 0, '枠が満杯の間は退避されない');

  g.discardMeld(0);
  for (let i = 0; i < 10 && g.phase === PHASE.RESOLVING; i++) g.update(300);
  eq(g.meldStock.length, 4, '空いた枠に順子が入る');
  ok(g.meldStock.some((m) => m.type === 'shuntsu'), '順子が退避された');
  eq(g.board.get(bottom, 0), null, '盤面から消えている');
});

// ================= 落下ピースの回転と着地 =================
console.log('\n落下ピースの回転と着地');

/** ピースが占めるセルを "r,c|r,c" で表す */
const cellsOf = (g) => g.pieceCells().map(([r, c]) => `${r},${c}`).join('|');

t('右回転で 上→右→下→左 と一周する', () => {
  const g = newGame();
  const { col, row } = g.piece;
  eq(g.piece.rot, 0);
  eq(cellsOf(g), `${row},${col}|${row - 1},${col}`, '初期は軸の上');
  g.rotateCW();
  eq(cellsOf(g), `${g.piece.row},${g.piece.col}|${g.piece.row},${g.piece.col + 1}`, '右');
  g.rotateCW();
  eq(cellsOf(g), `${g.piece.row},${g.piece.col}|${g.piece.row + 1},${g.piece.col}`, '下');
  g.rotateCW();
  eq(cellsOf(g), `${g.piece.row},${g.piece.col}|${g.piece.row},${g.piece.col - 1}`, '左');
  g.rotateCW();
  eq(g.piece.rot, 0);
});

t('左回転は右回転の逆', () => {
  const g = newGame();
  const before = cellsOf(g);
  g.rotateCCW();
  eq(g.piece.rot, 3);
  g.rotateCW();
  eq(cellsOf(g), before);
});

t('壁際で回転すると内側へ押し戻される', () => {
  const g = newGame();
  g.piece.col = 0;
  g.piece.rot = 0;
  g.rotateCCW(); // 左向きにしようとすると盤外
  eq(g.piece.rot, 3, '回転は成立する');
  ok(g.piece.col >= 1, `軸が内側へずれる (col=${g.piece.col})`);
  for (const [, c] of g.pieceCells()) ok(c >= 0, '盤外にはみ出さない');
});

t('回転先が埋まっていると軸をずらして回る', () => {
  const g = newGame();
  const r = 5;
  g.piece.col = 3;
  g.piece.row = r;
  g.piece.rot = 0;
  g.board.set(r, 4, '1z'); // 右隣を塞ぐ
  g.rotateCW();
  eq(g.piece.rot, 1, '右向きになる');
  for (const [rr, cc] of g.pieceCells()) ok(g.board.get(rr, cc) === null, '既存の牌と重ならない');
});

t('横向きに置くと、下が空いている牌は落下する', () => {
  const g = newGame();
  const bottom = g.board.rows - 1;
  // 列3だけ1段高くしておく
  g.board.set(bottom, 3, '1z');
  g.piece = { tiles: ['5p', '6p'], col: 3, row: 2, rot: 1 }; // 軸=列3、相方=列4
  g.hardDrop();
  for (let i = 0; i < 6 && g.phase === PHASE.RESOLVING; i++) g.update(300);

  eq(g.board.get(bottom - 1, 3), '5p', '軸は積み上がった牌の上');
  eq(g.board.get(bottom, 4), '6p', '相方は空いていた下まで落ちる');
  eq(g.board.get(bottom - 1, 4), null, '浮いたままにならない');
});

t('縦向きの落下では隙間ができない', () => {
  const g = newGame();
  const bottom = g.board.rows - 1;
  g.piece = { tiles: ['5p', '6p'], col: 2, row: 2, rot: 0 };
  g.hardDrop();
  for (let i = 0; i < 6 && g.phase === PHASE.RESOLVING; i++) g.update(300);
  eq(g.board.get(bottom, 2), '5p');
  eq(g.board.get(bottom - 1, 2), '6p');
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
