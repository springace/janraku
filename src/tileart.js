// 牌の絵柄を SVG で描く
//
// 「4筒」のような文字表示は瞬時に判別しづらいため、実際の牌と同じ絵柄を描画する。
// 外部画像を使わずインライン SVG で生成しているので、任意のサイズで鮮明に出る。
// viewBox は 40 x 48（盤面セルの縦横比 1:1.2 と一致）。

import { suitOf, numOf, HONOR_LABEL } from './tiles.js';

const BLUE = '#1a5aa8';
const DEEP = '#123f77';
const RED = '#b3261e';
const GREEN = '#1a7a42';
const DARK = '#2b2b2b';
const FACE = '#f6f1e2';
const SLATE = '#4a5c68';

const FONT = `'Hiragino Mincho ProN','Yu Mincho','Noto Serif JP',serif`;

const cache = new Map();

/** 牌1枚ぶんの SVG 文字列を返す（結果はキャッシュする） */
export function tileSVG(id) {
  let svg = cache.get(id);
  if (svg === undefined) {
    svg = `<svg class="face" viewBox="0 0 40 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${draw(id)}</svg>`;
    cache.set(id, svg);
  }
  return svg;
}

function draw(id) {
  const s = suitOf(id);
  const n = numOf(id);
  if (s === 'p') return pinzu(n);
  if (s === 's') return souzu(n);
  if (s === 'm') return manzu(n);
  return honor(n);
}

// ---------- 筒子: 丸を並べる ----------

/** 円ひとつ。外周＋内側の抜きで牌らしい二重丸にする */
function dot(x, y, r, color = BLUE) {
  return (
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>` +
    `<circle cx="${x}" cy="${y}" r="${r * 0.44}" fill="${FACE}"/>`
  );
}

const PINZU = {
  1: [[20, 24, 11]],
  2: [[20, 14, 7.5], [20, 34, 7.5]],
  3: [[10, 12, 6.5], [20, 24, 6.5], [30, 36, 6.5]],
  4: [[12, 14, 7], [28, 14, 7], [12, 34, 7], [28, 34, 7]],
  5: [[11, 13, 6], [29, 13, 6], [20, 24, 6], [11, 35, 6], [29, 35, 6]],
  6: [[12, 12, 6], [28, 12, 6], [12, 24, 6], [28, 24, 6], [12, 36, 6], [28, 36, 6]],
  7: [[10, 9, 5], [20, 13, 5], [30, 17, 5], [12, 30, 5.5], [28, 30, 5.5], [12, 41, 5.5], [28, 41, 5.5]],
  8: [[12, 9, 5], [28, 9, 5], [12, 20, 5], [28, 20, 5], [12, 31, 5], [28, 31, 5], [12, 42, 5], [28, 42, 5]],
  9: [[9, 12, 5.4], [20, 12, 5.4], [31, 12, 5.4], [9, 24, 5.4], [20, 24, 5.4], [31, 24, 5.4], [9, 36, 5.4], [20, 36, 5.4], [31, 36, 5.4]],
};

function pinzu(n) {
  if (n === 1) {
    // 1筒は大きく、赤を差した特徴的な面
    return (
      `<circle cx="20" cy="24" r="13" fill="${DEEP}"/>` +
      `<circle cx="20" cy="24" r="9.5" fill="${FACE}"/>` +
      `<circle cx="20" cy="24" r="6.5" fill="${RED}"/>` +
      `<circle cx="20" cy="24" r="2.6" fill="${FACE}"/>`
    );
  }
  const pts = PINZU[n];
  return pts
    .map(([x, y, r], i) => dot(x, y, r, n === 5 && i === 2 ? RED : BLUE))
    .join('');
}

// ---------- 索子: 竹を並べる ----------

/** 竹1本。節を入れて竹らしく見せる。rot は (x,y) を中心とした回転角 */
function stick(x, y, w, h, color = GREEN, rot = 0) {
  const t = rot ? ` transform="rotate(${rot} ${x} ${y})"` : '';
  return (
    `<g${t}>` +
    `<rect x="${x - w / 2}" y="${y - h / 2}" width="${w}" height="${h}" rx="${w / 2}" fill="${color}"/>` +
    `<rect x="${x - w / 2}" y="${y - h * 0.1}" width="${w}" height="${h * 0.2}" fill="${FACE}" opacity=".55"/>` +
    `</g>`
  );
}

const SOUZU = {
  2: [[20, 13, 6, 16], [20, 35, 6, 16]],
  3: [[20, 11, 5.5, 14], [13, 33, 5.5, 14], [27, 33, 5.5, 14]],
  4: [[12, 13, 5.5, 15], [28, 13, 5.5, 15], [12, 35, 5.5, 15], [28, 35, 5.5, 15]],
  5: [[11, 12, 5, 13], [29, 12, 5, 13], [20, 24, 5, 13], [11, 36, 5, 13], [29, 36, 5, 13]],
  6: [[10, 13, 5, 15], [20, 13, 5, 15], [30, 13, 5, 15], [10, 35, 5, 15], [20, 35, 5, 15], [30, 35, 5, 15]],
  7: [[20, 9, 5, 13], [10, 26, 5, 12], [20, 26, 5, 12], [30, 26, 5, 12], [10, 40, 5, 12], [20, 40, 5, 12], [30, 40, 5, 12]],
  8: [[9, 14, 4.4, 15, -22], [16, 13, 4.4, 15, -22], [24, 13, 4.4, 15, 22], [31, 14, 4.4, 15, 22],
      [9, 35, 4.4, 15, 22], [16, 36, 4.4, 15, 22], [24, 36, 4.4, 15, -22], [31, 35, 4.4, 15, -22]],
  9: [[10, 10, 5, 12], [20, 10, 5, 12], [30, 10, 5, 12], [10, 24, 5, 12], [20, 24, 5, 12], [30, 24, 5, 12], [10, 38, 5, 12], [20, 38, 5, 12], [30, 38, 5, 12]],
};

function souzu(n) {
  if (n === 1) return bird();
  const pts = SOUZU[n];
  // 5索は中央、7索は先頭を赤にするのが伝統的な配色
  const redIndex = n === 5 ? 2 : n === 7 ? 0 : -1;
  return pts.map(([x, y, w, h, rot], i) => stick(x, y, w, h, i === redIndex ? RED : GREEN, rot || 0)).join('');
}

/** 1索は鳥（孔雀）。小さくても鳥だと分かるよう、頭・胴・尾の輪郭を非対称にしている */
function bird() {
  return (
    // 首から胴へ
    `<path d="M14 13 L25 27 L11 27 Z" fill="${GREEN}"/>` +
    `<ellipse cx="18.5" cy="29" rx="8.6" ry="11" fill="${GREEN}"/>` +
    // 尾羽
    `<path d="M24 21 L34.5 26 L28 29.5 L35 34 L26.5 35.5 L29 41 L21 36 Z" fill="${GREEN}"/>` +
    // 頭・くちばし・目
    `<circle cx="14" cy="12" r="5.6" fill="${GREEN}"/>` +
    `<path d="M9 11 L2.5 13.4 L9.2 15.6 Z" fill="${RED}"/>` +
    `<circle cx="15.4" cy="10.8" r="1.6" fill="${FACE}"/>` +
    // 胸の抜き
    `<ellipse cx="17.5" cy="30" rx="4.4" ry="7" fill="${FACE}" opacity=".7"/>` +
    // 脚
    `<path d="M15 40 L13 45.5 M21 40 L23 45.5" stroke="${RED}" stroke-width="1.9" stroke-linecap="round" fill="none"/>`
  );
}

// ---------- 萬子: 漢数字 + 萬 ----------

const KANJI = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

function manzu(n) {
  return (
    `<text x="20" y="21" font-family="${FONT}" font-size="21" font-weight="700" fill="${DARK}" text-anchor="middle" dominant-baseline="middle">${KANJI[n]}</text>` +
    `<text x="20" y="38" font-family="${FONT}" font-size="19" font-weight="700" fill="${RED}" text-anchor="middle" dominant-baseline="middle">萬</text>`
  );
}

// ---------- 字牌 ----------

function honor(n) {
  if (n === 5) {
    // 白は伝統どおり枠のみ
    return (
      `<rect x="8.5" y="7" width="23" height="34" rx="2" fill="none" stroke="${SLATE}" stroke-width="2.4"/>` +
      `<rect x="12" y="10.5" width="16" height="27" rx="1.5" fill="none" stroke="${SLATE}" stroke-width="1"/>`
    );
  }
  const color = n === 6 ? GREEN : n === 7 ? RED : DARK;
  return `<text x="20" y="25" font-family="${FONT}" font-size="29" font-weight="700" fill="${color}" text-anchor="middle" dominant-baseline="middle">${HONOR_LABEL[n]}</text>`;
}
