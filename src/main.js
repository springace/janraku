// UI・描画・入力

import { Game, PHASE, MELD_SLOTS, PAIR_SLOTS } from './game.js';
import { MODE_A, MODE_B, tileFace, tileName } from './tiles.js';
import { COLS, ROWS, PIECE_SIZE } from './board.js';

const $ = (id) => document.getElementById(id);

const el = {
  app: $('app'),
  score: $('score'), level: $('level'), kyoku: $('kyoku'),
  next: $('next'), pauseBtn: $('pauseBtn'),
  stocks: $('stocks'), meldStock: $('meldStock'), pairStock: $('pairStock'),
  playfield: $('playfield'), boardWrap: $('boardWrap'), board: $('board'), banner: $('banner'),
  controls: $('controls'), toast: $('toast'),
  titleScreen: $('titleScreen'), startBtn: $('startBtn'), rulesBtn: $('rulesBtn'),
  rulesScreen: $('rulesScreen'), rulesCloseBtn: $('rulesCloseBtn'),
  agariScreen: $('agariScreen'), agariRank: $('agariRank'), agariHand: $('agariHand'),
  agariYaku: $('agariYaku'), agariCalc: $('agariCalc'), agariGain: $('agariGain'), agariBtn: $('agariBtn'),
  overScreen: $('overScreen'), overTitle: $('overTitle'), finalScore: $('finalScore'),
  overStats: $('overStats'), retryBtn: $('retryBtn'), toTitleBtn: $('toTitleBtn'),
  pauseScreen: $('pauseScreen'), resumeBtn: $('resumeBtn'), quitBtn: $('quitBtn'),
};

let game = null;
let rafId = 0;
let lastTs = 0;
let tilePx = 40;
let opts = { mode: MODE_A, hanchan: false };
let bannerTimer = 0;
let toastTimer = 0;

// ---------- 牌の描画 ----------

function tileHTML(id, size = '') {
  const f = tileFace(id);
  const sub = f.sub ? `<span class="s">${f.sub}</span>` : '';
  return `<div class="tile ${f.cls} ${size}" title="${tileName(id)}"><span class="m">${f.main}</span>${sub}</div>`;
}

// ---------- 盤面 ----------

const cells = [];

function buildBoard() {
  el.board.innerHTML = '';
  cells.length = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const d = document.createElement('div');
      d.className = 'cell';
      d.dataset.r = r;
      d.dataset.c = c;
      el.board.appendChild(d);
      cells.push(d);
    }
  }
}

function layout() {
  // 盤面を最小サイズにしてから測ることで、盤面自身の大きさが余白計算に影響するのを防ぐ
  document.documentElement.style.setProperty('--tile', '8px');
  void el.playfield.offsetHeight;
  const wrapH = el.playfield.clientHeight;
  const wrapW = el.playfield.clientWidth;
  const byW = (wrapW - 10 - (COLS - 1)) / COLS;
  const byH = (wrapH - 10 - (ROWS - 1)) / (ROWS * 1.2);
  tilePx = Math.max(14, Math.floor(Math.min(byW, byH)));
  document.documentElement.style.setProperty('--tile', tilePx + 'px');
  document.documentElement.style.setProperty('--rows', ROWS);
  document.documentElement.style.setProperty('--cols', COLS);
  const mini = Math.max(13, Math.min(22, Math.floor((el.app.clientWidth - 60) / 18)));
  document.documentElement.style.setProperty('--mini', mini + 'px');

  // 端数や測定誤差ではみ出す場合に備えて、実寸で収まるまで縮める
  for (let i = 0; i < 24 && tilePx > 14; i++) {
    if (el.board.offsetHeight <= el.playfield.clientHeight && el.board.offsetWidth <= el.playfield.clientWidth) break;
    tilePx--;
    document.documentElement.style.setProperty('--tile', tilePx + 'px');
  }
}

function renderBoard() {
  const pieceMap = new Map();
  if (game.piece) {
    for (const [r, c, t] of game.pieceCells()) pieceMap.set(r * COLS + c, t);
  }
  const ghost = game.piece && game.phase === PHASE.FALLING ? game.ghostRow() : null;
  const ghostSet = new Set();
  if (ghost !== null && ghost !== game.piece.row) {
    for (let i = 0; i < PIECE_SIZE; i++) {
      ghostSet.add((ghost - (PIECE_SIZE - 1) + i) * COLS + game.piece.col);
    }
  }
  const pairable = game.pairableCells();
  const flashSet = new Set(game.flash.map(([r, c]) => r * COLS + c));

  for (let i = 0; i < cells.length; i++) {
    const r = (i / COLS) | 0;
    const c = i % COLS;
    const key = r * COLS + c;
    let tile = game.board.get(r, c);
    let cls = 'cell';
    if (!tile && pieceMap.has(key)) {
      tile = pieceMap.get(key);
      cls += ' piece';
    } else if (tile) {
      if (pairable.has(key)) cls += ' pairable';
      if (flashSet.has(key)) cls += ' flash';
    }
    if (!tile && ghostSet.has(key)) cls += ' ghost';

    const sig = cls + '|' + (tile || '');
    const node = cells[i];
    if (node.dataset.sig !== sig) {
      node.dataset.sig = sig;
      node.className = cls;
      node.innerHTML = tile ? tileHTML(tile) : '';
    }
  }
}

// ---------- 退避枠・HUD ----------

let stockSig = '';

function renderStocks() {
  const sig = JSON.stringify([game.meldStock, game.pairStock]);
  if (sig === stockSig) return;
  const isNew = stockSig !== '';
  stockSig = sig;

  el.meldStock.innerHTML = Array.from({ length: MELD_SLOTS }, (_, i) => {
    const m = game.meldStock[i];
    if (!m) return '<div class="slot"></div>';
    return `<div class="slot filled">${m.tiles.map((t) => tileHTML(t, 'mini')).join('')}</div>`;
  }).join('');

  el.pairStock.innerHTML = Array.from({ length: PAIR_SLOTS }, (_, i) => {
    const p = game.pairStock[i];
    if (!p) return '<div class="slot"></div>';
    return `<div class="slot filled">${tileHTML(p, 'mini micro')}${tileHTML(p, 'mini micro')}</div>`;
  }).join('');

  if (isNew) {
    const last = el.meldStock.querySelectorAll('.slot.filled');
    if (last.length) last[last.length - 1].classList.add('pop');
  }
  el.stocks.classList.toggle('waiting', game.waitingForHead);
}

let hudSig = '';
function renderHud() {
  const sig = `${game.score}|${game.level}|${game.kyoku}|${game.next.join('')}`;
  if (sig === hudSig) return;
  hudSig = sig;
  el.score.textContent = game.score.toLocaleString();
  el.level.textContent = game.level;
  el.kyoku.textContent = game.hanchan ? `${game.kyoku}/8` : game.kyoku;
  el.next.innerHTML = game.next.map((t) => tileHTML(t, 'mini')).join('');
}

// ---------- 演出 ----------

function showBanner(text) {
  el.banner.textContent = text;
  el.banner.classList.remove('hidden');
  el.banner.style.animation = 'none';
  void el.banner.offsetWidth;
  el.banner.style.animation = '';
  bannerTimer = 700;
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove('hidden');
  toastTimer = 1400;
}

// ---------- ループ ----------

function loop(ts) {
  rafId = requestAnimationFrame(loop);
  const dt = Math.min(64, ts - lastTs || 16);
  lastTs = ts;

  if (game) {
    game.update(dt);
    renderBoard();
    renderStocks();
    renderHud();
  }
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) el.banner.classList.add('hidden');
  }
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) el.toast.classList.add('hidden');
  }
}

// ---------- ゲームイベント ----------

function onEvent(ev) {
  if (ev.type === 'meld') {
    if (ev.chain >= 2) showBanner(`${ev.chain} 連鎖!`);
  } else if (ev.type === 'kan') {
    showBanner('暗槓!');
  } else if (ev.type === 'agari') {
    showAgari(ev.agari);
  } else if (ev.type === 'gameover') {
    showOver('終局', false);
  } else if (ev.type === 'complete') {
    showOver('半荘終了', true);
  }
}

function meldLabel(type) {
  return { shuntsu: '順子', kotsu: '刻子', kantsu: '槓子' }[type] || '';
}

function showAgari(a) {
  const s = a.scored;
  el.agariRank.textContent = s.rank || `${s.han}翻`;
  el.agariRank.classList.toggle('yakuman', s.isYakuman);

  const groups = [];
  if (a.chiitoi) {
    for (const p of a.hand.pairs) {
      groups.push(`<div class="hand-group">${tileHTML(p, 'mini')}${tileHTML(p, 'mini')}</div>`);
    }
  } else {
    for (const m of a.hand.melds) {
      groups.push(`<div class="hand-group" title="${meldLabel(m.type)}">${m.tiles.map((t) => tileHTML(t, 'mini')).join('')}</div>`);
    }
    groups.push(`<div class="hand-group head" title="雀頭">${tileHTML(a.hand.pair, 'mini')}${tileHTML(a.hand.pair, 'mini')}</div>`);
  }
  el.agariHand.innerHTML = groups.join('');

  const rows = s.isYakuman
    ? s.yakuman.map((y) => `<li><span>${y.name}</span><b>役満</b></li>`)
    : s.yaku.map((y) => `<li><span>${y.name}</span><b>${y.han}翻</b></li>`);
  el.agariYaku.innerHTML = rows.join('');

  el.agariCalc.textContent = s.isYakuman
    ? `${a.chiitoi ? 25 : s.fu}符 — 役満 ${s.score.toLocaleString()}点`
    : `${s.fu}符 ${s.han}翻 — ${s.score.toLocaleString()}点`;

  const mul = a.multiplier > 1 ? `${a.maxChain}連鎖 ×${a.multiplier.toFixed(1)}` : '連鎖なし';
  el.agariGain.innerHTML = `+${a.gained.toLocaleString()}<small>${mul}</small>`;

  el.agariScreen.classList.remove('hidden');
}

function showOver(title, cleared) {
  el.overTitle.textContent = title;
  el.finalScore.textContent = game.score.toLocaleString();
  el.overStats.innerHTML = [
    `和了 ${game.agariCount} 回`,
    `Lv.${game.level} 到達`,
    `モード: ${game.mode === MODE_A ? '老頭萬子' : '全牌'}`,
  ].join('<br>');
  el.overScreen.classList.remove('hidden');
}

// ---------- 入力 ----------

function act(name) {
  if (!game || game.phase !== PHASE.FALLING) return;
  if (name === 'left') game.moveLeft();
  else if (name === 'right') game.moveRight();
  else if (name === 'rotate') game.rotate();
  else if (name === 'soft') game.softDrop();
  else if (name === 'hard') game.hardDrop();
}

function bindControls() {
  for (const btn of el.controls.querySelectorAll('.ctrl')) {
    let repeatTimer = 0;
    let delayTimer = 0;
    const name = btn.dataset.act;
    const repeatable = name === 'left' || name === 'right' || name === 'soft';

    const stop = () => {
      clearInterval(repeatTimer);
      clearTimeout(delayTimer);
    };
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      act(name);
      if (repeatable) {
        delayTimer = setTimeout(() => {
          repeatTimer = setInterval(() => act(name), 90);
        }, 240);
      }
    });
    for (const evt of ['pointerup', 'pointercancel', 'pointerleave']) {
      btn.addEventListener(evt, stop);
    }
  }
}

function bindBoardGestures() {
  let active = false;
  let sx = 0, sy = 0, appliedH = 0, downCell = null, moved = false;

  el.board.addEventListener('pointerdown', (e) => {
    if (!game || game.phase !== PHASE.FALLING) return;
    active = true;
    moved = false;
    appliedH = 0;
    sx = e.clientX;
    sy = e.clientY;
    downCell = e.target.closest('.cell');
    el.board.setPointerCapture(e.pointerId);
  });

  el.board.addEventListener('pointermove', (e) => {
    if (!active) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) moved = true;
    const step = Math.trunc(dx / Math.max(24, tilePx * 0.8));
    while (appliedH < step) { game.moveRight(); appliedH++; }
    while (appliedH > step) { game.moveLeft(); appliedH--; }
  });

  const finish = (e) => {
    if (!active) return;
    active = false;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;

    if (!moved) {
      if (downCell) tryBank(+downCell.dataset.r, +downCell.dataset.c);
      return;
    }
    if (appliedH !== 0) return; // 横移動として消費済み
    if (dy > tilePx * 1.6 && Math.abs(dx) < tilePx) game.hardDrop();
    else if (dy < -tilePx * 1.2 && Math.abs(dx) < tilePx) game.rotate();
  };
  el.board.addEventListener('pointerup', finish);
  el.board.addEventListener('pointercancel', () => { active = false; });
}

function tryBank(r, c) {
  const res = game.tapCell(r, c);
  if (res && res.ok === false && res.reason) toast(res.reason);
}

function bindKeys() {
  window.addEventListener('keydown', (e) => {
    if (!game) return;
    const k = e.key;
    if (k === 'ArrowLeft') act('left');
    else if (k === 'ArrowRight') act('right');
    else if (k === 'ArrowUp') act('rotate');
    else if (k === 'ArrowDown') act('soft');
    else if (k === ' ') act('hard');
    else if (k === 'p' || k === 'P') togglePause();
    else return;
    e.preventDefault();
  });
}

function togglePause() {
  if (!game) return;
  if (game.phase === PHASE.PAUSED) {
    game.togglePause();
    el.pauseScreen.classList.add('hidden');
  } else if (game.phase === PHASE.FALLING || game.phase === PHASE.RESOLVING) {
    game.togglePause();
    el.pauseScreen.classList.remove('hidden');
  }
}

// ---------- 画面遷移 ----------

function startGame() {
  stockSig = '';
  hudSig = '';
  game = new Game({ mode: opts.mode, hanchan: opts.hanchan, onEvent });
  window.__game = game; // デバッグ/自動テスト用
  el.titleScreen.classList.add('hidden');
  el.overScreen.classList.add('hidden');
  el.agariScreen.classList.add('hidden');
  el.pauseScreen.classList.add('hidden');
  // 退避枠・HUD を描いてから採寸する（中身が入ると各段の高さが変わるため）
  renderStocks();
  renderHud();
  layout();
  renderBoard();
}

function bindMenus() {
  for (const group of document.querySelectorAll('.choice')) {
    group.addEventListener('click', (e) => {
      const btn = e.target.closest('.choice-btn');
      if (!btn) return;
      for (const b of group.children) b.classList.remove('selected');
      btn.classList.add('selected');
      if (group.dataset.group === 'mode') opts.mode = btn.dataset.value === 'A' ? MODE_A : MODE_B;
      else opts.hanchan = btn.dataset.value === 'hanchan';
    });
  }

  el.startBtn.addEventListener('click', startGame);
  el.rulesBtn.addEventListener('click', () => el.rulesScreen.classList.remove('hidden'));
  el.rulesCloseBtn.addEventListener('click', () => el.rulesScreen.classList.add('hidden'));

  el.agariBtn.addEventListener('click', () => {
    el.agariScreen.classList.add('hidden');
    game.continueAfterAgari();
  });

  el.retryBtn.addEventListener('click', startGame);
  el.toTitleBtn.addEventListener('click', () => {
    el.overScreen.classList.add('hidden');
    el.titleScreen.classList.remove('hidden');
  });

  el.pauseBtn.addEventListener('click', togglePause);
  el.resumeBtn.addEventListener('click', togglePause);
  el.quitBtn.addEventListener('click', () => {
    el.pauseScreen.classList.add('hidden');
    el.titleScreen.classList.remove('hidden');
    game = null;
  });
}

// ---------- 起動 ----------

buildBoard();
bindControls();
bindBoardGestures();
bindKeys();
bindMenus();
layout();

window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 120));
document.addEventListener('gesturestart', (e) => e.preventDefault());

rafId = requestAnimationFrame(loop);
