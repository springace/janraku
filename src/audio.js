// 音楽・効果音
//
// 音源ファイルは持たず Web Audio API で合成する。追加リクエストが無く、
// ライセンスの心配もなく、どの端末でも同じ音が鳴る。
//
// BGM は陽音階（ヨナ抜き）の琴風プラックによる4小節ループ。レベルが上がると
// テンポが上がる。iOS の自動再生制限があるため、必ずユーザー操作の中で unlock() を呼ぶ。

const KEY = { muted: 'janraku.muted', bgm: 'janraku.bgm', sfx: 'janraku.sfx' };

function load(k, def) {
  try {
    const v = localStorage.getItem(k);
    return v === null ? def : v === '1';
  } catch {
    return def;
  }
}
function save(k, v) {
  try { localStorage.setItem(k, v ? '1' : '0'); } catch { /* プライベートモード等では保存しない */ }
}

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

/** 陽音階（D・ヨナ抜き長音階）: D E G A B */
const SCALE = [0, 2, 5, 7, 9];
const ROOT = 62; // D4

/** 4小節ぶんのベース根音 */
const BASS = [38, 35, 31, 33];
/** 8ステップ x 4小節の旋律。数値は音階の度数、-1 は休符 */
const MOTIF = [
  [0, -1, 2, -1, 4, -1, 2, -1],
  [1, -1, 0, -1, -1, 2, -1, -1],
  [4, -1, 3, -1, 2, -1, 0, -1],
  [2, -1, 4, -1, 3, -1, 1, -1],
];
/** レベルが上がると重なる対旋律 */
const COUNTER = [
  [-1, 4, -1, -1, -1, 6, -1, -1],
  [-1, 3, -1, -1, -1, 4, -1, -1],
  [-1, 5, -1, -1, -1, 4, -1, -1],
  [-1, 4, -1, -1, -1, 2, -1, -1],
];

const STEPS = 32;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.15;

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.muted = load(KEY.muted, false);
    this.musicOn = load(KEY.bgm, true);
    this.sfxOn = load(KEY.sfx, true);
    this.bpm = 92;
    this.level = 1;
    this._timer = 0;
    this._step = 0;
    this._nextTime = 0;
    this._playing = false;
  }

  /** ユーザー操作の中から呼ぶこと（iOS の自動再生制限のため） */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? 0.16 : 0;
      this.musicGain.connect(this.master);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxOn ? 0.34 : 0;
      this.sfxGain.connect(this.master);

      this.noise = this._makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  _makeNoise() {
    const len = Math.floor(this.ctx.sampleRate * 0.4);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------- 設定 ----------

  setMuted(v) {
    this.muted = v;
    save(KEY.muted, v);
    if (this.master) this._ramp(this.master.gain, v ? 0 : 1);
  }

  setMusic(v) {
    this.musicOn = v;
    save(KEY.bgm, v);
    if (this.musicGain) this._ramp(this.musicGain.gain, v ? 0.16 : 0);
  }

  setSfx(v) {
    this.sfxOn = v;
    save(KEY.sfx, v);
    if (this.sfxGain) this._ramp(this.sfxGain.gain, v ? 0.34 : 0);
  }

  _ramp(param, to) {
    const t = this.ctx.currentTime;
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    param.linearRampToValueAtTime(to, t + 0.08);
  }

  // ---------- 音の部品 ----------

  /** 減衰の速い撥弦音。琴やスチールパンのような音 */
  _pluck(freq, at, dur, gain, dest, type = 'triangle') {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(freq * 7, at);
    f.frequency.exponentialRampToValueAtTime(Math.max(220, freq * 1.6), at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(f).connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /** 単純なトーン。slideTo を渡すと周波数が滑る */
  _tone(freq, at, dur, gain, type = 'sine', slideTo = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(this.sfxGain);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  /** ノイズ。打楽器や「置いた」音に使う */
  _noise(at, dur, gain, cutoff, dest, type = 'lowpass') {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(dest);
    src.start(at);
    src.stop(at + dur + 0.02);
  }

  // ---------- 効果音 ----------

  /** name に応じた効果音を鳴らす */
  play(name, arg = 0) {
    if (!this.ctx || this.muted || !this.sfxOn) return;
    const t = this.ctx.currentTime;
    switch (name) {
      case 'move':
        this._tone(300, t, 0.035, 0.16, 'square');
        break;
      case 'rotate':
        this._tone(420, t, 0.06, 0.18, 'triangle', 620);
        break;
      case 'lock':
        this._tone(120, t, 0.09, 0.3, 'sine', 70);
        this._noise(t, 0.06, 0.22, 900, this.sfxGain);
        break;
      case 'meld': {
        // 連鎖が伸びるほど高い音になる
        const chain = Math.max(1, arg);
        for (let i = 0; i < 3; i++) {
          const deg = (i + (chain - 1) * 2) % SCALE.length;
          const oct = Math.floor((i + (chain - 1) * 2) / SCALE.length);
          this._pluck(mtof(ROOT + 12 + SCALE[deg] + oct * 12), t + i * 0.055, 0.32, 0.4, this.sfxGain);
        }
        break;
      }
      case 'pair':
        this._pluck(mtof(ROOT + 12), t, 0.22, 0.3, this.sfxGain);
        this._pluck(mtof(ROOT + 19), t + 0.05, 0.28, 0.26, this.sfxGain);
        break;
      case 'kan':
        for (let i = 0; i < 4; i++) {
          this._pluck(mtof(ROOT + SCALE[i % 5] + 12 + Math.floor(i / 5) * 12), t + i * 0.05, 0.4, 0.42, this.sfxGain);
        }
        this._noise(t, 0.25, 0.16, 5200, this.sfxGain, 'highpass');
        break;
      case 'discard':
        this._tone(400, t, 0.16, 0.24, 'sawtooth', 150);
        this._noise(t, 0.12, 0.12, 1600, this.sfxGain);
        break;
      case 'levelup':
        [0, 2, 4].forEach((d, i) => this._pluck(mtof(ROOT + 12 + SCALE[d]), t + i * 0.07, 0.3, 0.32, this.sfxGain));
        break;
      case 'ui':
        this._tone(660, t, 0.05, 0.14, 'sine');
        break;
      case 'deny':
        this._tone(180, t, 0.14, 0.22, 'square', 120);
        break;
      case 'agari':
        this._fanfare(t, arg);
        break;
      case 'gameover':
        [9, 7, 5, 2, 0].forEach((d, i) => {
          this._pluck(mtof(ROOT + d - 12), t + i * 0.16, 0.7, 0.34, this.sfxGain);
        });
        break;
      default:
        break;
    }
  }

  /** 和了のファンファーレ。yakuman を渡すと長く豪華になる */
  _fanfare(t, yakuman) {
    const seq = yakuman
      ? [0, 2, 4, 5, 7, 9, 12, 14, 16, 19]
      : [0, 4, 7, 12, 9, 12];
    const step = yakuman ? 0.1 : 0.11;
    seq.forEach((semi, i) => {
      this._pluck(mtof(ROOT + 12 + semi), t + i * step, 0.55, 0.42, this.sfxGain);
    });
    // 締めの和音
    const end = t + seq.length * step + 0.05;
    [0, 7, 12, 16].forEach((semi) => {
      this._pluck(mtof(ROOT + 12 + semi), end, yakuman ? 1.6 : 1.1, 0.3, this.sfxGain);
    });
    this._noise(t, 0.5, 0.1, 6000, this.sfxGain, 'highpass');
  }

  // ---------- BGM ----------

  startMusic() {
    if (!this.ctx || this._playing) return;
    this._playing = true;
    this._step = 0;
    this._nextTime = this.ctx.currentTime + 0.08;
    this._timer = setInterval(() => this._schedule(), LOOKAHEAD_MS);
  }

  stopMusic() {
    this._playing = false;
    clearInterval(this._timer);
    this._timer = 0;
  }

  setLevel(n) {
    this.level = n;
    this.bpm = Math.min(132, 92 + (n - 1) * 4);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _schedule() {
    if (!this._playing || !this.ctx) return;
    const spb = 60 / this.bpm / 2; // 8分音符
    while (this._nextTime < this.ctx.currentTime + SCHEDULE_AHEAD) {
      this._emitStep(this._step, this._nextTime);
      this._nextTime += spb;
      this._step = (this._step + 1) % STEPS;
    }
  }

  _emitStep(step, at) {
    if (this.muted || !this.musicOn) return;
    const bar = Math.floor(step / 8);
    const beat = step % 8;
    const dest = this.musicGain;

    // ベース
    if (beat === 0 || beat === 4) {
      this._pluck(mtof(BASS[bar] + (beat === 4 ? 7 : 0)), at, 0.5, 0.5, dest, 'sine');
    }
    // バスドラム
    if (beat === 0 || beat === 6) {
      this._tone2(90, at, 0.14, 0.5, dest, 45);
    }
    // ハイハット
    if (beat % 2 === 1) {
      this._noise(at, 0.045, 0.09, 7000, dest, 'highpass');
    }
    // 主旋律
    const deg = MOTIF[bar][beat];
    if (deg >= 0) {
      const oct = Math.floor(deg / SCALE.length);
      this._pluck(mtof(ROOT + 12 + SCALE[deg % SCALE.length] + oct * 12), at, 0.45, 0.42, dest);
    }
    // 対旋律はレベル3以上で重なる
    if (this.level >= 3) {
      const c = COUNTER[bar][beat];
      if (c >= 0) {
        const oct = Math.floor(c / SCALE.length);
        this._pluck(mtof(ROOT + 24 + SCALE[c % SCALE.length] + oct * 12), at, 0.3, 0.16, dest);
      }
    }
  }

  /** BGM 用のトーン（sfxGain ではなく指定先に出す） */
  _tone2(freq, at, dur, gain, dest, slideTo = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dest);
    o.start(at);
    o.stop(at + dur + 0.02);
  }
}
