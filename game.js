/* The Game of Krug
 * Labirinto visto de cima: leve a tampinha do Krug até a tigela de papá,
 * fugindo do má banho e comendo popoca e pão do queijo pelo caminho.
 */
(() => {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const canvas = $('#game');
  const ctx = canvas.getContext('2d');
  const stage = $('#stage');

  // ---------------------------------------------------------------------------
  // Configuração
  // ---------------------------------------------------------------------------
  const CFG = {
    speed: 7,            // casas por segundo da tampinha
    lateTurn: 0.45,      // tolerância (em casas) para virar logo depois de passar do cruzamento
    queueTime: 0.5,      // segundos que uma direção escolhida antes da hora fica guardada
    napTime: 1.6,        // segundos que o Krug fica parado se aquecendo no raio de sol
    catSight: 4,         // casas em linha reta em que o Krug enxerga o gato
    barkTime: 2.5,       // segundos latindo para o gato, sem controle
    catCooldown: 4,      // segundos sem se distrair de novo depois de latir
    catWalk: 1.1,        // casas por segundo do gato passeando
    catFlee: 5.5,        // casas por segundo do gato fugindo ofendido
    bowlEvery: [9, 13],  // a tigela muda de lugar a cada 9 a 13 s (fase 8 em diante)
    bowlWarnTime: 1.2,   // segundos balançando antes de fugir
    lives: 3,
    braveTime: 7,        // segundos de coragem depois do pão do queijo
    scaredTime: 1.1,     // segundos tremendo depois do má banho
    invulnTime: 2,       // segundos piscando depois de voltar ao começo
    minTile: 24,         // tamanho mínimo da casa em pixels CSS
    maxTile: 64,
    hitRadius: 0.62,     // distância (em casas) para encostar no banho
    pts: { popoca: 10, pao: 50, bathScared: 30, bowl: 100, coberta: 20, star: 50, ovo: 40 },
  };

  const D4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

  // ---------------------------------------------------------------------------
  // Armazenamento local (recorde e som)
  // ---------------------------------------------------------------------------
  const store = {
    get(k, d) {
      try { const v = localStorage.getItem('krug.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
    },
    set(k, v) { try { localStorage.setItem('krug.' + k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
  };

  // ---------------------------------------------------------------------------
  // Imagens
  // ---------------------------------------------------------------------------
  const IMG = {};
  function loadImg(key, src) {
    return new Promise((res) => {
      const i = new Image();
      i.onload = () => { IMG[key] = i; res(); };
      i.onerror = () => res();
      i.src = src;
    });
  }
  const imagesReady = Promise.all([
    loadImg('normal', 'assets/krug-normal.jpg'),
    loadImg('scared', 'assets/krug-scared.jpg'),
    loadImg('brave', 'assets/krug-brave.jpg'),
    loadImg('happy', 'assets/krug-happy.jpg'),
    loadImg('sleepy', 'assets/krug-sleepy.jpg'),
  ]);

  // ---------------------------------------------------------------------------
  // Sons: latidos gravados do Krug e efeitos sintetizados com Web Audio
  // ---------------------------------------------------------------------------
  const BARK_SINGLE = ['latido-1', 'latido-2', 'latido-3', 'latido-4', 'latido-5', 'latido-6'];
  const BARK_FILES = BARK_SINGLE.concat('latido-duplo');
  const barkRaw = {};
  const barkFetch = Promise.all(BARK_FILES.map((n) => fetch('assets/sons/' + n + '.mp3')
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .then((b) => { barkRaw[n] = b; })
    .catch(() => { /* sem o arquivo, usa o latido sintetizado */ })));

  const Snd = {
    ac: null,
    on: store.get('sound', true),
    buf: {},
    decoding: false,
    lastBark: -1,
    init(fromGesture = true) {
      if (fromGesture) this.gesture = true;
      if (!this.ac) {
        try { this.ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ac = null; }
      }
      if (this.ac && this.ac.state === 'suspended' && this.gesture) {
        try { const r = this.ac.resume(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* ignora */ }
      }
      if (this.ac && !this.decoding) {
        this.decoding = true;
        barkFetch.then(() => BARK_FILES.forEach((n) => {
          if (!barkRaw[n]) return;
          const done = (b) => { if (b) this.buf[n] = b; };
          try {
            const p = this.ac.decodeAudioData(barkRaw[n].slice(0), done, () => {});
            if (p && p.catch) p.catch(() => {});
          } catch (e) { /* formato não suportado */ }
        }));
      }
    },
    /** Toca um latido gravado; rate acima de 1 deixa mais agudo (susto), abaixo de 1 mais grave (valente). */
    play(name, { delay = 0, rate = 1, vol = 0.9 } = {}) {
      if (!this.on || !this.ac) return false;
      const b = this.buf[name];
      if (!b) return false;
      const t = this.ac.currentTime + delay;
      const src = this.ac.createBufferSource();
      src.buffer = b;
      src.playbackRate.value = rate;
      const g = this.ac.createGain();
      g.gain.value = vol;
      src.connect(g).connect(this.ac.destination);
      src.start(t);
      return true;
    },
    randomBark() {
      let i = (Math.random() * BARK_SINGLE.length) | 0;
      if (i === this.lastBark) i = (i + 1) % BARK_SINGLE.length;
      this.lastBark = i;
      return BARK_SINGLE[i];
    },
    tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null, delay = 0) {
      if (!this.on || !this.ac) return;
      const t = this.ac.currentTime + delay;
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.ac.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    },
    noise(dur, vol = 0.2, freq = 1500, delay = 0, q = 1) {
      if (!this.on || !this.ac) return;
      const t = this.ac.currentTime + delay;
      const len = Math.max(1, Math.floor(this.ac.sampleRate * dur));
      const buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ac.createBufferSource();
      src.buffer = buf;
      const f = this.ac.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const g = this.ac.createGain();
      g.gain.value = vol;
      src.connect(f).connect(g).connect(this.ac.destination);
      src.start(t);
    },
    bark(delay = 0, opts = {}) {
      if (this.play(this.randomBark(), { delay, ...opts })) return;
      this.synthBark(delay);
    },
    doubleBark(delay = 0) {
      if (this.play('latido-duplo', { delay })) return;
      this.synthBark(delay);
    },
    synthBark(delay = 0) {
      if (!this.on || !this.ac) return;
      [0, 0.2].forEach((d) => {
        const t = this.ac.currentTime + delay + d;
        const o = this.ac.createOscillator();
        const f = this.ac.createBiquadFilter();
        const g = this.ac.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(520, t);
        o.frequency.exponentialRampToValueAtTime(260, t + 0.12);
        f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 2;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.35, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
        o.connect(f).connect(g).connect(this.ac.destination);
        o.start(t); o.stop(t + 0.15);
      });
      this.noise(0.05, 0.12, 1800, delay);
      this.noise(0.05, 0.12, 1800, delay + 0.2);
    },
    popoca() { this.noise(0.05, 0.35, 2600, 0, 2); this.tone(1100, 0.05, 'square', 0.04, 1600); },
    pao() {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.14, null, i * 0.07));
      this.play(this.randomBark(), { delay: 0.3, rate: 1.12, vol: 0.7 });
    },
    bath() {
      this.noise(0.5, 0.25, 700, 0, 0.7);
      this.tone(520, 0.55, 'sine', 0.18, 140);
      this.tone(360, 0.4, 'triangle', 0.08, 120, 0.1);
      // Latido agudo de susto
      this.play(this.randomBark(), { delay: 0.05, rate: 1.5, vol: 0.75 });
    },
    scare() {
      // Latido grave e valente: agora quem foge é o banho
      if (!this.play(this.randomBark(), { rate: 0.82, vol: 1 })) this.synthBark();
      this.noise(0.25, 0.2, 900, 0.12, 0.8);
    },
    bowl() { [523, 659, 784, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.15, null, i * 0.1)); this.doubleBark(0.65); },
    bump() { this.tone(130, 0.07, 'square', 0.05, 90); },
    /**
     * Musiquinha original do intervalo: melodia em onda quadrada, baixo em onda
     * triangular e percussão de ruído, 4 compassos a 168 bpm. Retorna { stop }.
     */
    music() {
      const none = { stop() {}, duration: 6 };
      if (!this.on || !this.ac) return none;
      const ac = this.ac;
      const master = ac.createGain();
      master.gain.value = 0.9;
      master.connect(ac.destination);
      const t0 = ac.currentTime + 0.08;
      const e = 60 / 168 / 2; // colcheia
      const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const note = (m, start, dur, type, vol) => {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(hz(m), start);
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(vol, start + 0.01);
        g.gain.setValueAtTime(vol, start + dur * 0.6);
        g.gain.exponentialRampToValueAtTime(0.0001, start + dur * 0.95);
        o.connect(g).connect(master);
        o.start(start);
        o.stop(start + dur);
      };
      const C5 = 72, D5 = 74, E5 = 76, F5 = 77, G5 = 79, A5 = 81, B5 = 83, C6 = 84, D6 = 86;
      // [nota, duração em colcheias]
      const melody = [
        [C5, 1], [E5, 1], [G5, 1], [C6, 1], [A5, 1], [G5, 1], [E5, 1], [G5, 1],
        [F5, 1], [A5, 1], [C6, 1], [A5, 1], [G5, 1], [E5, 1], [D5, 1], [E5, 1],
        [C5, 1], [E5, 1], [G5, 1], [C6, 1], [D6, 1], [C6, 1], [B5, 1], [A5, 1],
        [G5, 1], [G5, 1], [A5, 1], [B5, 1], [C6, 4],
      ];
      let at = t0;
      for (const [m, len] of melody) {
        note(m, at, e * len, 'square', 0.07);
        note(m - 12, at, e * len, 'triangle', 0.05); // reforço uma oitava abaixo
        at += e * len;
      }
      const C3 = 48, D3 = 50, E3 = 52, F3 = 53, G3 = 55, G2 = 43, C4 = 60, D4 = 62;
      const bass = [C3, G3, E3, G3, F3, C4, G3, D4, C3, G3, F3, G3, G2, D3];
      bass.forEach((m, i) => note(m, t0 + i * 2 * e, e * 1.8, 'triangle', 0.22));
      note(C3, t0 + 14 * 2 * e, e * 4, 'triangle', 0.22);
      // Percussão: bumbo nos tempos 1 e 3, chimbal nos contratempos
      const beats = 16;
      for (let b = 0; b < beats; b++) {
        const bt = t0 + b * 2 * e;
        if (b % 2 === 0) {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.frequency.setValueAtTime(150, bt);
          o.frequency.exponentialRampToValueAtTime(45, bt + 0.12);
          g.gain.setValueAtTime(0.35, bt);
          g.gain.exponentialRampToValueAtTime(0.0001, bt + 0.14);
          o.connect(g).connect(master);
          o.start(bt); o.stop(bt + 0.15);
        }
        const len = Math.floor(ac.sampleRate * 0.04);
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
        const src = ac.createBufferSource();
        src.buffer = buf;
        const f = ac.createBiquadFilter();
        f.type = 'highpass'; f.frequency.value = 6000;
        const g = ac.createGain();
        g.gain.value = 0.12;
        src.connect(f).connect(g).connect(master);
        src.start(bt + e);
      }
      const total = (at - t0);
      return {
        duration: total,
        stop() {
          try {
            master.gain.cancelScheduledValues(ac.currentTime);
            master.gain.setTargetAtTime(0, ac.currentTime, 0.04);
            setTimeout(() => master.disconnect(), 400);
          } catch (err) { /* já parou */ }
        },
      };
    },
    yum() {
      [659, 784, 988, 1319].forEach((f, i) => this.tone(f, 0.12, 'triangle', 0.13, null, i * 0.06));
      this.play(this.randomBark(), { delay: 0.22, rate: 1.25, vol: 0.7 });
    },
    blergh() {
      if (!this.on || !this.ac) return;
      const t = this.ac.currentTime;
      const o = this.ac.createOscillator();
      const lfo = this.ac.createOscillator();
      const lg = this.ac.createGain();
      const g = this.ac.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(260, t);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.7);
      lfo.frequency.value = 18;
      lg.gain.value = 25;
      lfo.connect(lg).connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      o.connect(g).connect(this.ac.destination);
      o.start(t); lfo.start(t);
      o.stop(t + 0.8); lfo.stop(t + 0.8);
      this.play(this.randomBark(), { delay: 0.35, rate: 1.5, vol: 0.6 });
    },
    /** Tigela tremendo antes de fugir: "tremelique" agudo. */
    bowlWarn() {
      for (let i = 0; i < 6; i++) this.tone(i % 2 ? 1180 : 990, 0.07, 'square', 0.04, null, i * 0.12);
    },
    /** Tigela mudando de lugar: apito de escorregador subindo e descendo, mais um "boing". */
    bowlMove() {
      if (!this.on || !this.ac) return;
      const t = this.ac.currentTime;
      const o = this.ac.createOscillator();
      const g = this.ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(380, t);
      o.frequency.exponentialRampToValueAtTime(1500, t + 0.28);
      o.frequency.exponentialRampToValueAtTime(320, t + 0.62);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.18, t + 0.03);
      g.gain.setValueAtTime(0.18, t + 0.55);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.66);
      o.connect(g).connect(this.ac.destination);
      o.start(t); o.stop(t + 0.7);
      const b = this.ac.createOscillator();
      const bg = this.ac.createGain();
      const vib = this.ac.createOscillator();
      const vg = this.ac.createGain();
      b.type = 'triangle';
      b.frequency.setValueAtTime(180, t + 0.62);
      b.frequency.exponentialRampToValueAtTime(520, t + 0.72);
      b.frequency.exponentialRampToValueAtTime(140, t + 1.05);
      vib.frequency.value = 22; vg.gain.value = 30;
      vib.connect(vg).connect(b.frequency);
      bg.gain.setValueAtTime(0.0001, t + 0.62);
      bg.gain.exponentialRampToValueAtTime(0.25, t + 0.65);
      bg.gain.exponentialRampToValueAtTime(0.0001, t + 1.08);
      b.connect(bg).connect(this.ac.destination);
      b.start(t + 0.62); vib.start(t + 0.62);
      b.stop(t + 1.1); vib.stop(t + 1.1);
    },
    hiss() { this.noise(0.55, 0.22, 4500, 0, 0.7); },
    meow(delay = 0) {
      if (!this.on || !this.ac) return;
      const t = this.ac.currentTime + delay;
      const o = this.ac.createOscillator();
      const f = this.ac.createBiquadFilter();
      const g = this.ac.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(480, t);
      o.frequency.linearRampToValueAtTime(820, t + 0.18);
      o.frequency.exponentialRampToValueAtTime(420, t + 0.55);
      f.type = 'bandpass';
      f.Q.value = 4;
      f.frequency.setValueAtTime(900, t);
      f.frequency.linearRampToValueAtTime(1700, t + 0.2);
      f.frequency.exponentialRampToValueAtTime(800, t + 0.55);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
      g.gain.setValueAtTime(0.3, t + 0.35);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(f).connect(g).connect(this.ac.destination);
      o.start(t);
      o.stop(t + 0.62);
    },
    yawn() { this.tone(520, 0.7, 'sine', 0.1, 260); this.tone(780, 0.6, 'sine', 0.04, 390, 0.05); },
    coberta() { this.noise(0.18, 0.18, 600, 0, 0.6); [392, 523].forEach((f, i) => this.tone(f, 0.16, 'sine', 0.12, null, i * 0.08)); },
    shieldHit() { this.noise(0.4, 0.22, 700, 0, 0.7); this.tone(440, 0.25, 'sine', 0.12, 300); this.bark(0.25); },
    star(delay, i) { this.tone(880 + i * 220, 0.18, 'triangle', 0.14, null, delay); this.tone(1320 + i * 330, 0.12, 'sine', 0.07, null, delay + 0.05); },
    over() { [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, null, i * 0.22)); },
  };

  // ---------------------------------------------------------------------------
  // Labirinto
  // ---------------------------------------------------------------------------
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Gera um labirinto em grade de blocos (paredes ocupam casas inteiras). */
  function makeMaze(cw, ch, braid) {
    const W = cw * 2 + 1;
    const H = ch * 2 + 1;
    const g = Array.from({ length: H }, () => new Uint8Array(W).fill(1));
    const seen = new Uint8Array(cw * ch);
    const stack = [[0, 0]];
    seen[0] = 1;
    g[1][1] = 0;
    while (stack.length) {
      const [cx, cy] = stack[stack.length - 1];
      const opts = shuffle(D4.slice()).filter(([dx, dy]) => {
        const nx = cx + dx, ny = cy + dy;
        return nx >= 0 && ny >= 0 && nx < cw && ny < ch && !seen[ny * cw + nx];
      });
      if (!opts.length) { stack.pop(); continue; }
      const [dx, dy] = opts[0];
      const nx = cx + dx, ny = cy + dy;
      g[cy * 2 + 1 + dy][cx * 2 + 1 + dx] = 0;
      g[ny * 2 + 1][nx * 2 + 1] = 0;
      seen[ny * cw + nx] = 1;
      stack.push([nx, ny]);
    }
    // Abre alguns becos sem saída para criar caminhos alternativos
    for (let cy = 0; cy < ch; cy++) {
      for (let cx = 0; cx < cw; cx++) {
        const x = cx * 2 + 1, y = cy * 2 + 1;
        const open = D4.filter(([dx, dy]) => g[y + dy][x + dx] === 0);
        if (open.length === 1 && Math.random() < braid) {
          const walls = shuffle(D4.filter(([dx, dy]) => {
            const wx = x + dx, wy = y + dy;
            return g[wy][wx] === 1 && wx > 0 && wy > 0 && wx < W - 1 && wy < H - 1;
          }));
          if (walls.length) g[y + walls[0][1]][x + walls[0][0]] = 0;
        }
      }
    }
    return { g, W, H };
  }

  function bfs(m, sx, sy, blocked) {
    const { W, H, g } = m;
    const d = new Int32Array(W * H).fill(-1);
    const q = [sx + sy * W];
    d[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const p = q[i], x = p % W, y = (p / W) | 0;
      for (const [dx, dy] of D4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const np = nx + ny * W;
        if (g[ny][nx] === 0 && d[np] < 0 && !(blocked && blocked.has(np))) {
          d[np] = d[p] + 1;
          q.push(np);
        }
      }
    }
    return d;
  }

  function openCount(m, x, y) {
    let n = 0;
    for (const [dx, dy] of D4) if (m.g[y + dy][x + dx] === 0) n++;
    return n;
  }

  /** Trechos retos de corredor (horizontais e verticais) com pelo menos minLen casas. */
  function straightRuns(m, minLen) {
    const { W, H } = m;
    const segs = [];
    const scan = (horizontal) => {
      const A = horizontal ? H : W, B = horizontal ? W : H;
      for (let a = 1; a < A - 1; a++) {
        let run = [];
        for (let b = 0; b < B; b++) {
          const x = horizontal ? b : a, y = horizontal ? a : b;
          if (m.g[y][x] === 0) run.push([x, y]);
          else { if (run.length >= minLen) segs.push({ tiles: run, horizontal }); run = []; }
        }
      }
    };
    scan(true);
    scan(false);
    return segs;
  }

  /** Monta uma fase: labirinto, tigela, petiscos e banhos. */
  function buildLevel(n) {
    const portrait = stage.clientHeight >= stage.clientWidth;
    const small = Math.min(4 + n, 13);
    const large = Math.min(6 + Math.round(n * 1.5), 21);
    const cw = portrait ? small : large;
    const ch = portrait ? large : small;
    const m = makeMaze(cw, ch, Math.min(0.6, 0.3 + n * 0.03));
    const { W, H } = m;
    const idx = (x, y) => x + y * W;
    const startIdx = idx(1, 1);
    const d0 = bfs(m, 1, 1);

    const cells = [];
    for (let y = 1; y < H; y += 2) for (let x = 1; x < W; x += 2) cells.push(idx(x, y));

    // Tigela de papá na casa mais distante do começo
    let goalIdx = startIdx;
    for (const c of cells) if (d0[c] > d0[goalIdx]) goalIdx = c;

    const items = new Map();
    const pool = shuffle(cells.filter((c) => c !== goalIdx && d0[c] >= 2));

    // Pão do queijo: espalhado entre o começo e a tigela
    const nPao = Math.min(1 + Math.floor(n / 2), 5);
    const paoIdx = [];
    const maxD = d0[goalIdx];
    for (const c of pool) {
      if (paoIdx.length >= nPao) break;
      const r = d0[c] / maxD;
      if (r > 0.15 && r < 0.9) { items.set(c, 'pao'); paoIdx.push(c); }
    }

    // Cobertinha: a partir da fase 2, protege de um toque do má banho
    const nCob = n >= 2 ? (n >= 8 ? 2 : 1) : 0;
    const cobIdx = [];
    for (const c of pool) {
      if (cobIdx.length >= nCob) break;
      if (items.has(c)) continue;
      const r = d0[c] / maxD;
      if (r > 0.1 && r < 0.85) { items.set(c, 'coberta'); cobIdx.push(c); }
    }
    const must = paoIdx.concat(cobIdx);
    const theme = themeFor(n);

    // Má banho parado: nunca pode bloquear todos os caminhos
    const blocked = new Set();
    const pathOk = () => {
      const d = bfs(m, 1, 1, blocked);
      return d[goalIdx] >= 0 && must.every((p) => d[p] >= 0);
    };
    const baths = [];
    const nStatic = Math.min(Math.round((1 + Math.floor(n * 0.8)) * (theme.key === 'banheiro' ? 1.4 : 1)), 22);
    for (const c of shuffle(cells.slice())) {
      if (baths.length >= nStatic) break;
      if (c === goalIdx || items.has(c) || d0[c] < 4) continue;
      blocked.add(c);
      if (pathOk()) {
        baths.push({ x: c % W, y: (c / W) | 0, moving: false, gone: false, phase: Math.random() * 6 });
      } else {
        blocked.delete(c);
      }
    }

    // Má banho andando: patrulha um corredor reto, a partir da fase 3
    const nMoving = n >= 3 ? Math.min(Math.floor((n - 1) / 2), 7) : 0;
    if (nMoving) {
      const segs = straightRuns(m, 3);
      const used = new Set(blocked);
      let placed = 0;
      for (const s of shuffle(segs)) {
        if (placed >= nMoving) break;
        const ids = s.tiles.map(([x, y]) => idx(x, y));
        if (ids.some((p) => used.has(p) || p === goalIdx || p === startIdx || d0[p] < 5)) continue;
        // Para a checagem de caminho, só se pode cruzar o corredor na perpendicular
        const block = s.tiles.filter(([x, y]) => (s.horizontal
          ? m.g[y - 1][x] === 1 && m.g[y + 1][x] === 1
          : m.g[y][x - 1] === 1 && m.g[y][x + 1] === 1)).map(([x, y]) => idx(x, y));
        block.forEach((p) => blocked.add(p));
        if (!pathOk()) { block.forEach((p) => blocked.delete(p)); continue; }
        ids.forEach((p) => used.add(p));
        const a = s.tiles[0], b = s.tiles[s.tiles.length - 1];
        const len = s.tiles.length - 1;
        const pos = Math.random() * len;
        baths.push({
          moving: true, gone: false, phase: Math.random() * 6,
          ax: a[0], ay: a[1], bx: b[0], by: b[1], len,
          t: pos, dir: Math.random() < 0.5 ? 1 : -1,
          speed: Math.min(1.5 + n * 0.12, 3.2),
          x: a[0] + (b[0] - a[0]) * (pos / len), y: a[1] + (b[1] - a[1]) * (pos / len),
        });
        placed++;
      }
    }

    const bathSet = new Set(baths.filter((b) => !b.moving).map((b) => idx(b.x, b.y)));

    // Raio de sol: faixas de 2 ou 3 casas num corredor reto, a partir da fase 2
    const suns = [];
    const sunAt = new Map();
    const nSun = n >= 2 ? Math.min(1 + Math.floor(n / 3), 6) : 0;
    for (const r of shuffle(straightRuns(m, 3))) {
      if (suns.length >= nSun) break;
      const len = Math.min(r.tiles.length, Math.random() < 0.5 ? 2 : 3);
      const off = (Math.random() * (r.tiles.length - len + 1)) | 0;
      const tiles = r.tiles.slice(off, off + len);
      const ids = tiles.map(([x, y]) => idx(x, y));
      if (ids.some((p) => sunAt.has(p) || bathSet.has(p) || p === goalIdx || d0[p] < 3)) continue;
      ids.forEach((p) => sunAt.set(p, suns.length));
      suns.push({ tiles, horizontal: r.horizontal, phase: Math.random() * 6 });
    }

    // Ovos de páscoa a partir da fase 10: o preto (faz mal) nunca bloqueia caminho
    const darkSet = new Set();
    const nDark = n >= 10 ? Math.min(2 + Math.floor((n - 10) / 3), 6) : 0;
    const nWhite = n >= 10 ? Math.min(2 + Math.floor((n - 10) / 4), 4) : 0;
    for (const c of shuffle(cells.slice())) {
      if (darkSet.size >= nDark) break;
      if (c === goalIdx || items.has(c) || bathSet.has(c) || sunAt.has(c) || blocked.has(c) || d0[c] < 4) continue;
      blocked.add(c);
      if (pathOk()) { darkSet.add(c); items.set(c, 'ovoPreto'); } else blocked.delete(c);
    }

    // Tudo o que vale estrela precisa ser alcançável sem passar por banho nem ovo preto
    const reach = bfs(m, 1, 1, blocked);
    let wc = 0;
    for (const c of pool) {
      if (wc >= nWhite) break;
      if (items.has(c) || bathSet.has(c) || reach[c] < 0) continue;
      items.set(c, 'ovoBranco');
      wc++;
    }

    // Popoca espalhada pelo resto do labirinto
    const nPop = Math.min(Math.round(cells.length * 0.28), 45);
    let pc = 0;
    for (const c of pool) {
      if (pc >= nPop) break;
      if (items.has(c) || bathSet.has(c) || reach[c] < 0) continue;
      items.set(c, 'popoca');
      pc++;
    }

    // Gato gordinho: a partir da fase 4, longe do começo
    const nCat = n >= 4 ? (n >= 10 ? 2 : 1) : 0;
    const cats = [];
    for (const c of shuffle(cells.slice())) {
      if (cats.length >= nCat) break;
      if (d0[c] < 10 || c === goalIdx) continue;
      cats.push(makeCat(c % W, (c / W) | 0));
    }

    return {
      n, m, W, H, g: m.g, start: { x: 1, y: 1 },
      goal: { x: goalIdx % W, y: (goalIdx / W) | 0 },
      items, baths, idx, theme, popTotal: pc, paoTotal: paoIdx.length, suns, sunAt, cats, blocked,
      goalMoves: n >= 8, bowlTimer: 9 + Math.random() * 4, bowlWarn: 0, bowlPop: 0,
    };
  }

  // ---------------------------------------------------------------------------
  // Estado do jogo
  // ---------------------------------------------------------------------------
  const S = {
    mode: 'start',          // start | play | paused | levelDone | over
    level: 1,
    score: 0,
    lives: CFG.lives,
    best: store.get('best', 0),
    bestLevel: store.get('bestLevel', 0),
    time: 0,
    levelTime: 0,
    stars: 0,
    banner: null,
  };
  let L = null;             // fase atual
  const K = {               // a tampinha do Krug
    cx: 1, cy: 1, x: 1, y: 1, dir: null, prog: 0, moving: false, queue: null, queueT: 0,
    napT: 0, napDir: null, sunZone: null, zzz: 0,
    barkT: 0, barkEvery: 0, barkCat: null, catCooldown: 0, barkShake: 0, hopT: 0, sick: false,
    angle: 0, scaredT: 0, braveT: 0, invulnT: 0, happyT: 0, bumpT: 0, bumpDir: [0, 0], shield: false, shieldPop: 0,
  };
  const particles = [];
  const floaters = [];

  // ---------------------------------------------------------------------------
  // Tela e câmera
  // ---------------------------------------------------------------------------
  let dpr = 1, vw = 0, vh = 0, TS = 32;
  const cam = { x: 0, y: 0 };
  let staticLayer = null;

  function layout() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = stage.clientWidth;
    vh = stage.clientHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh + 'px';
    if (L) {
      const fit = Math.min(vw / L.W, vh / L.H);
      TS = Math.max(Math.min(fit, CFG.maxTile), CFG.minTile);
      buildStaticLayer();
      updateCamera(1, true);
    }
  }

  function updateCamera(dt, snap) {
    const mw = L.W * TS, mh = L.H * TS;
    const kx = (K.x + 0.5) * TS, ky = (K.y + 0.5) * TS;
    const tx = mw <= vw ? (mw - vw) / 2 : Math.max(0, Math.min(mw - vw, kx - vw / 2));
    const ty = mh <= vh ? (mh - vh) / 2 : Math.max(0, Math.min(mh - vh, ky - vh / 2));
    if (snap) { cam.x = tx; cam.y = ty; return; }
    const k = Math.min(1, dt * 7);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  }

  // ---------------------------------------------------------------------------
  // Cômodos: o cenário muda a cada 5 fases (sala, quarto, cozinha, banheiro)
  // ---------------------------------------------------------------------------
  function floorWood(g, W, H, s, rnd) {
    g.fillStyle = '#c99a6b';
    g.fillRect(0, 0, W * s, H * s);
    const ph = s * 0.5;
    for (let y = 0; y < H * s; y += ph) {
      let x = -rnd() * s * 2;
      while (x < W * s) {
        const len = s * (1.6 + rnd() * 2.4);
        const shade = 0.9 + rnd() * 0.2;
        g.fillStyle = `rgb(${Math.round(201 * shade)},${Math.round(154 * shade)},${Math.round(107 * shade)})`;
        g.fillRect(x, y, len, ph);
        g.fillStyle = 'rgba(90,55,25,.25)';
        g.fillRect(x, y, 1, ph);
        x += len;
      }
      g.fillStyle = 'rgba(90,55,25,.22)';
      g.fillRect(0, y, W * s, 1);
    }
  }

  function floorCarpet(g, W, H, s, rnd) {
    g.fillStyle = '#e9dcc8';
    g.fillRect(0, 0, W * s, H * s);
    // Tapete felpudo: pontinhos claros e escuros
    const n = Math.round(W * H * 14);
    for (let i = 0; i < n; i++) {
      g.fillStyle = rnd() < 0.5 ? 'rgba(120,90,60,.10)' : 'rgba(255,255,255,.35)';
      g.fillRect(rnd() * W * s, rnd() * H * s, Math.max(1, s * 0.05), Math.max(1, s * 0.05));
    }
    // Barrado do tapete
    g.strokeStyle = 'rgba(150,110,180,.35)';
    g.lineWidth = Math.max(2, s * 0.12);
    g.strokeRect(s * 1.35, s * 1.35, (W - 2.7) * s, (H - 2.7) * s);
  }

  function floorChecker(g, W, H, s) {
    const q = s * 0.5;
    for (let y = 0; y < H * 2; y++) {
      for (let x = 0; x < W * 2; x++) {
        g.fillStyle = (x + y) % 2 ? '#e6b9a2' : '#f6ecdc';
        g.fillRect(x * q, y * q, q + 0.5, q + 0.5);
      }
    }
  }

  function floorTiles(g, W, H, s, rnd) {
    g.fillStyle = '#c3b9a8';
    g.fillRect(0, 0, W * s, H * s);
    const q = s * 0.5, gap = Math.max(1, s * 0.04);
    for (let y = 0; y < H * 2; y++) {
      for (let x = 0; x < W * 2; x++) {
        const v = Math.round(rnd() * 8);
        g.fillStyle = `rgb(${232 + v},${225 + v},${210 + v})`;
        g.fillRect(x * q + gap / 2, y * q + gap / 2, q - gap, q - gap);
      }
    }
  }

  function decoCushion(g, x, y, s, top, isWall) {
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = Math.max(1, s * 0.03);
    g.setLineDash([s * 0.08, s * 0.07]);
    g.beginPath();
    const i = s * 0.16;
    if (!isWall(x, y + 1)) { g.moveTo(x * s, top + s - i); g.lineTo(x * s + s, top + s - i); }
    if (!isWall(x - 1, y)) { g.moveTo(x * s + i, top); g.lineTo(x * s + i, top + s); }
    if (!isWall(x + 1, y)) { g.moveTo(x * s + s - i, top); g.lineTo(x * s + s - i, top + s); }
    if (!isWall(x, y - 1)) { g.moveTo(x * s, top + i); g.lineTo(x * s + s, top + i); }
    g.stroke();
    g.setLineDash([]);
  }

  function decoDots(g, x, y, s, top) {
    // Edredom lilás de bolinhas brancas, como a manta do Krug
    g.fillStyle = 'rgba(255,255,255,.75)';
    const dots = (x + y) % 2 ? [[0.25, 0.3], [0.75, 0.75]] : [[0.72, 0.28], [0.28, 0.72]];
    for (const [dx, dy] of dots) {
      g.beginPath(); g.arc(x * s + dx * s, top + dy * s, s * 0.07, 0, Math.PI * 2); g.fill();
    }
  }

  function decoCabinet(g, x, y, s, top, isWall) {
    // Armário de madeira com portinha e puxador
    const i = s * 0.12;
    g.strokeStyle = 'rgba(70,35,10,.45)';
    g.lineWidth = Math.max(1, s * 0.04);
    g.strokeRect(x * s + i, top + i, s - 2 * i, s - 2 * i);
    g.fillStyle = '#f0d9a8';
    g.beginPath(); g.arc(x * s + s * 0.5, top + s * 0.5, Math.max(1.5, s * 0.06), 0, Math.PI * 2); g.fill();
    if (!isWall(x, y - 1)) { g.fillStyle = '#e8e2d6'; g.fillRect(x * s, top, s, Math.max(2, s * 0.1)); }
  }

  function decoTiles(g, x, y, s, top) {
    // Azulejos na parede
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = Math.max(1, s * 0.03);
    g.beginPath();
    g.moveTo(x * s + s / 2, top); g.lineTo(x * s + s / 2, top + s);
    g.moveTo(x * s, top + s / 2); g.lineTo(x * s + s, top + s / 2);
    g.stroke();
  }

  const THEMES = [
    { key: 'sala', name: 'sala', place: 'na sala', bg: '#134e4a', side: '#1a7a70', top: '#33bfae', floor: floorWood, deco: decoCushion, shadow: 'rgba(40,20,5,.28)' },
    { key: 'quarto', name: 'quarto', place: 'no quarto', bg: '#2f2547', side: '#6f5c9c', top: '#ab97dc', floor: floorCarpet, deco: decoDots, shadow: 'rgba(60,40,80,.25)' },
    { key: 'cozinha', name: 'cozinha', place: 'na cozinha', bg: '#3a2416', side: '#6b3f22', top: '#a8693a', floor: floorChecker, deco: decoCabinet, shadow: 'rgba(40,20,5,.3)' },
    { key: 'banheiro', name: 'banheiro', place: 'no banheiro', bg: '#173d55', side: '#2f6f99', top: '#6fb3dd', floor: floorTiles, deco: decoTiles, shadow: 'rgba(20,50,80,.22)' },
  ];
  const themeFor = (n) => THEMES[Math.floor((n - 1) / 5) % THEMES.length];

  function buildStaticLayer() {
    const c = document.createElement('canvas');
    c.width = Math.ceil(L.W * TS * dpr);
    c.height = Math.ceil(L.H * TS * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const W = L.W, H = L.H, s = TS, th = L.theme;
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };

    th.floor(g, W, H, s, rnd);

    const isWall = (x, y) => x >= 0 && y >= 0 && x < W && y < H && L.g[y][x] === 1;
    const lift = s * 0.14;

    // Sombra das paredes
    g.fillStyle = th.shadow;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (isWall(x, y)) g.fillRect(x * s + s * 0.12, y * s + s * 0.16, s, s);
    }
    // Lateral (mais escura)
    g.fillStyle = th.side;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isWall(x, y)) g.fillRect(x * s, y * s, s, s);
    // Topo
    g.fillStyle = th.top;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isWall(x, y)) g.fillRect(x * s, y * s - lift, s, s);
    // Brilho nas bordas e enfeite de cada cômodo
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!isWall(x, y)) continue;
      const top = y * s - lift;
      if (!isWall(x, y - 1)) { g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(x * s, top, s, Math.max(2, s * 0.08)); }
      th.deco(g, x, y, s, top, isWall);
    }
    staticLayer = c;
  }

  // ---------------------------------------------------------------------------
  // Desenhos dos objetos (coordenadas em pixels, s = tamanho da casa)
  // ---------------------------------------------------------------------------
  function drawPopoca(g, x, y, s, t = 0) {
    const bob = Math.sin(t * 3 + x * 0.1) * s * 0.03;
    const r = s * 0.5;
    const puffs = [[0, 0, 0.34], [-0.3, 0.1, 0.26], [0.3, 0.12, 0.27], [0.02, -0.28, 0.26], [0.08, 0.32, 0.22], [-0.2, -0.22, 0.2]];
    g.save();
    g.translate(x, y + bob);
    g.fillStyle = 'rgba(0,0,0,.15)';
    g.beginPath(); g.ellipse(0, r * 0.5, r * 0.55, r * 0.18, 0, 0, Math.PI * 2); g.fill();
    for (const [px, py, pr] of puffs) {
      g.beginPath();
      g.arc(px * r, py * r, pr * r, 0, Math.PI * 2);
      g.fillStyle = '#fff6df';
      g.fill();
      g.lineWidth = Math.max(1, s * 0.025);
      g.strokeStyle = '#e2b866';
      g.stroke();
    }
    g.fillStyle = '#f2c14e';
    g.beginPath(); g.arc(r * 0.06, r * 0.05, r * 0.09, 0, Math.PI * 2); g.fill();
    g.restore();
  }

  function drawPao(g, x, y, s, t = 0) {
    const r = s * 0.3;
    const pulse = 1 + Math.sin(t * 4) * 0.05;
    g.save();
    g.translate(x, y);
    const glow = g.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 1.9);
    glow.addColorStop(0, 'rgba(255,220,120,.55)');
    glow.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = glow;
    g.beginPath(); g.arc(0, 0, r * 1.9 * pulse, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.beginPath(); g.ellipse(r * 0.15, r * 0.9, r * 0.9, r * 0.3, 0, 0, Math.PI * 2); g.fill();
    const grd = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    grd.addColorStop(0, '#ffe7a3');
    grd.addColorStop(0.6, '#e9b14d');
    grd.addColorStop(1, '#c4802c');
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(150,85,25,.55)';
    const spots = [[0.3, 0.2], [-0.25, 0.35], [0.1, -0.35], [-0.4, -0.05], [0.45, -0.15], [0, 0.05]];
    for (const [sx, sy] of spots) { g.beginPath(); g.arc(sx * r, sy * r, r * 0.07, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = 'rgba(150,85,25,.5)';
    g.lineWidth = Math.max(1, s * 0.025);
    g.beginPath(); g.arc(r * 0.1, -r * 0.1, r * 0.55, -0.6, 0.6); g.stroke();
    g.restore();
  }

  function drawBath(g, x, y, s, t = 0, moving = false) {
    const w = s * 0.82, h = s * 0.6;
    const wob = Math.sin(t * (moving ? 9 : 3)) * s * 0.02;
    g.save();
    g.translate(x, y + wob);
    g.fillStyle = 'rgba(0,0,0,.22)';
    roundRect(g, -w / 2 + s * 0.06, -h / 2 + s * 0.08, w, h, h * 0.45); g.fill();
    // Banheira
    g.fillStyle = '#ffffff';
    roundRect(g, -w / 2, -h / 2, w, h, h * 0.45); g.fill();
    g.strokeStyle = '#8aa1b1';
    g.lineWidth = Math.max(1, s * 0.035);
    g.stroke();
    // Água
    g.fillStyle = '#5bb8f0';
    roundRect(g, -w / 2 + s * 0.07, -h / 2 + s * 0.07, w - s * 0.14, h - s * 0.14, h * 0.35); g.fill();
    // Torneira
    g.fillStyle = '#9fb3c2';
    g.fillRect(w / 2 - s * 0.16, -s * 0.05, s * 0.12, s * 0.1);
    // Espuma
    g.fillStyle = '#ffffff';
    const bubbles = [[-0.22, -0.05, 0.1], [-0.08, 0.06, 0.08], [0.06, -0.06, 0.09], [-0.28, 0.1, 0.06], [0.16, 0.08, 0.06]];
    bubbles.forEach(([bx, by, br], i) => {
      const rr = br * s * (1 + Math.sin(t * 5 + i) * 0.15);
      g.beginPath(); g.arc(bx * s, by * s, rr, 0, Math.PI * 2); g.fill();
    });
    // Olhinhos bravos
    g.fillStyle = '#1c3a4f';
    g.beginPath(); g.arc(-s * 0.1, -s * 0.02, s * 0.035, 0, Math.PI * 2); g.arc(s * 0.08, -s * 0.02, s * 0.035, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1c3a4f';
    g.lineWidth = Math.max(1, s * 0.03);
    g.beginPath();
    g.moveTo(-s * 0.16, -s * 0.1); g.lineTo(-s * 0.05, -s * 0.06);
    g.moveTo(s * 0.14, -s * 0.1); g.lineTo(s * 0.03, -s * 0.06);
    g.stroke();
    g.restore();
  }

  function drawBowl(g, x, y, s, t = 0) {
    const r = s * 0.45;
    g.save();
    g.translate(x, y);
    const pulse = 0.5 + Math.sin(t * 3) * 0.5;
    // Brilho chamando a atenção para o objetivo
    g.fillStyle = `rgba(255,236,140,${0.3 + pulse * 0.35})`;
    g.beginPath(); g.arc(0, 0, r * (1.15 + pulse * 0.2), 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath(); g.arc(s * 0.05, s * 0.07, r, 0, Math.PI * 2); g.fill();
    // Tigela azul com borda de inox
    const rim = g.createLinearGradient(-r, -r, r, r);
    rim.addColorStop(0, '#f4f7fb');
    rim.addColorStop(0.5, '#b8c3cf');
    rim.addColorStop(1, '#7d8895');
    g.fillStyle = rim;
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill();
    const body = g.createRadialGradient(-r * 0.2, -r * 0.25, r * 0.1, 0, 0, r * 0.82);
    body.addColorStop(0, '#5f8dff');
    body.addColorStop(1, '#2747b8');
    g.fillStyle = body;
    g.beginPath(); g.arc(0, 0, r * 0.82, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1a2f7a';
    g.beginPath(); g.arc(0, 0, r * 0.6, 0, Math.PI * 2); g.fill();
    // Ração
    const kib = [[0, 0], [0.28, 0.1], [-0.28, 0.06], [0.08, -0.28], [-0.14, 0.28], [0.2, 0.3], [-0.3, -0.2], [0.32, -0.18], [-0.05, -0.1], [0.05, 0.14]];
    kib.forEach(([kx, ky], i) => {
      g.fillStyle = i % 2 ? '#8f4f22' : '#c98140';
      g.beginPath(); g.arc(kx * r, ky * r, r * 0.12, 0, Math.PI * 2); g.fill();
    });
    // Patinha branca na lateral da tigela
    g.fillStyle = 'rgba(255,255,255,.85)';
    const pr = r * 0.05, px = 0, py = r * 0.71;
    g.beginPath(); g.ellipse(px, py, pr * 1.4, pr * 1.1, 0, 0, Math.PI * 2); g.fill();
    [[-1.5, -1.4], [-0.5, -2], [0.5, -2], [1.5, -1.4]].forEach(([a, b]) => { g.beginPath(); g.arc(px + a * pr, py + b * pr, pr * 0.55, 0, Math.PI * 2); g.fill(); });
    g.restore();
  }

  /** Cobertinha xadrez cinza dobrada, como a manta do Krug. */
  function drawCoberta(g, x, y, s, t = 0) {
    const w = s * 0.66, h = s * 0.5;
    const bob = Math.sin(t * 2.5 + x * 0.05) * s * 0.02;
    g.save();
    g.translate(x, y + bob);
    g.rotate(-0.12);
    g.fillStyle = 'rgba(0,0,0,.2)';
    roundRect(g, -w / 2 + s * 0.05, -h / 2 + s * 0.07, w, h, s * 0.08); g.fill();
    g.fillStyle = '#b9c0c8';
    roundRect(g, -w / 2, -h / 2, w, h, s * 0.08); g.fill();
    g.save();
    roundRect(g, -w / 2, -h / 2, w, h, s * 0.08); g.clip();
    g.fillStyle = 'rgba(70,78,90,.45)';
    for (let i = -2; i <= 2; i++) g.fillRect(i * w * 0.24 - w * 0.05, -h / 2, w * 0.1, h);
    g.fillStyle = 'rgba(255,255,255,.4)';
    for (let i = -1; i <= 1; i++) g.fillRect(-w / 2, i * h * 0.32 - h * 0.05, w, h * 0.1);
    // Dobra
    g.fillStyle = 'rgba(255,255,255,.35)';
    g.fillRect(-w / 2, h * 0.12, w, h * 0.06);
    g.restore();
    g.strokeStyle = '#7d8590';
    g.lineWidth = Math.max(1, s * 0.03);
    roundRect(g, -w / 2, -h / 2, w, h, s * 0.08); g.stroke();
    g.restore();
  }

  /** O Krug enrolado na cobertinha (anel xadrez em volta da tampinha). */
  function drawWrap(g, x, y, R, t) {
    g.save();
    g.translate(x, y);
    g.rotate(Math.sin(t * 2) * 0.15);
    g.lineWidth = R * 0.42;
    g.strokeStyle = '#b9c0c8';
    g.beginPath(); g.arc(0, 0, R * 1.1, 0, Math.PI * 2); g.stroke();
    g.lineWidth = R * 0.42;
    g.strokeStyle = 'rgba(70,78,90,.5)';
    g.setLineDash([R * 0.22, R * 0.3]);
    g.beginPath(); g.arc(0, 0, R * 1.1, 0, Math.PI * 2); g.stroke();
    g.setLineDash([]);
    g.lineWidth = Math.max(1, R * 0.07);
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.beginPath(); g.arc(0, 0, R * 1.1, 0, Math.PI * 2); g.stroke();
    g.restore();
  }

  /** Plaquinha no canto: popocas e pães do queijo comidos na fase. */
  function drawChip() {
    if (!L || (S.mode !== 'play' && S.mode !== 'levelDone' && S.mode !== 'paused')) return;
    let popLeft = 0, paoLeft = 0;
    for (const v of L.items.values()) { if (v === 'popoca') popLeft++; else if (v === 'pao') paoLeft++; }
    const popEaten = L.popTotal - popLeft, paoEaten = L.paoTotal - paoLeft;
    const fs = 14;
    ctx.save();
    ctx.font = `700 ${fs}px "Baloo 2", system-ui, sans-serif`;
    const t1 = `${popEaten}/${L.popTotal}`, t2 = `${paoEaten}/${L.paoTotal}`;
    const w1 = ctx.measureText(t1).width, w2 = ctx.measureText(t2).width;
    const pad = 8, ic = 18;
    const w = pad + ic + 4 + w1 + 12 + ic + 4 + w2 + pad, h = 28;
    const x = 8, y = vh - h - 8;
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    roundRect(ctx, x, y, w, h, 14); ctx.fill();
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    drawPopoca(ctx, x + pad + ic / 2, y + h / 2, ic * 1.15, 0);
    ctx.fillStyle = popLeft === 0 ? '#ffe08a' : '#fff';
    ctx.fillText(t1, x + pad + ic + 4, y + h / 2 + 1);
    const x2 = x + pad + ic + 4 + w1 + 12;
    drawPaoIcon(ctx, x2 + ic / 2, y + h / 2, ic);
    ctx.fillStyle = paoLeft === 0 ? '#ffe08a' : '#fff';
    ctx.fillText(t2, x2 + ic + 4, y + h / 2 + 1);
    ctx.restore();
  }

  /** Pão do queijo pequeno, sem brilho, para a plaquinha. */
  function drawPaoIcon(g, x, y, s) {
    const r = s * 0.42;
    const grd = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    grd.addColorStop(0, '#ffe7a3');
    grd.addColorStop(0.6, '#e9b14d');
    grd.addColorStop(1, '#c4802c');
    g.fillStyle = grd;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(150,85,25,.6)';
    [[0.3, 0.2], [-0.25, 0.3], [0.05, -0.35]].forEach(([a, b]) => { g.beginPath(); g.arc(x + a * r, y + b * r, r * 0.1, 0, Math.PI * 2); g.fill(); });
  }

  /** Ovo de páscoa: branco (o Krug pode comer) ou preto (faz mal). */
  function drawEgg(g, x, y, s, t, dark) {
    const rx = s * 0.28, ry = s * 0.36;
    const bob = Math.sin(t * 2.2 + x * 0.07) * s * 0.025;
    g.save();
    g.translate(x, y + bob);
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.beginPath(); g.ellipse(s * 0.04, ry * 0.95, rx * 0.95, ry * 0.25, 0, 0, Math.PI * 2); g.fill();
    g.rotate(-0.15);
    const egg = () => {
      g.beginPath();
      g.moveTo(0, -ry);
      g.bezierCurveTo(rx * 1.05, -ry, rx * 1.15, ry * 0.95, 0, ry);
      g.bezierCurveTo(-rx * 1.15, ry * 0.95, -rx * 1.05, -ry, 0, -ry);
      g.closePath();
    };
    const grd = g.createRadialGradient(-rx * 0.4, -ry * 0.4, rx * 0.1, 0, 0, ry * 1.1);
    if (dark) { grd.addColorStop(0, '#8a5634'); grd.addColorStop(1, '#3a2112'); }
    else { grd.addColorStop(0, '#fffdf6'); grd.addColorStop(1, '#e6d9c2'); }
    g.fillStyle = grd;
    egg(); g.fill();
    g.save();
    egg(); g.clip();
    if (dark) {
      // Fita dourada com lacinho
      g.fillStyle = '#e7b83f';
      g.fillRect(-rx * 1.2, -ry * 0.08, rx * 2.4, ry * 0.2);
      g.fillStyle = 'rgba(255,255,255,.18)';
      g.fillRect(-rx * 1.2, -ry * 0.08, rx * 2.4, ry * 0.06);
    } else {
      // Zigue-zague rosa e bolinhas azuis
      g.strokeStyle = '#f4a3b8';
      g.lineWidth = Math.max(1.5, s * 0.04);
      g.beginPath();
      for (let i = 0; i <= 6; i++) {
        const px = -rx * 1.1 + (i / 6) * rx * 2.2, py = (i % 2 ? -1 : 1) * ry * 0.1;
        if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
      }
      g.stroke();
      g.fillStyle = '#8cc7f0';
      [[-0.45, -0.5], [0.4, -0.45], [0, 0.5], [-0.5, 0.45], [0.5, 0.42]].forEach(([a, b]) => {
        g.beginPath(); g.arc(a * rx, b * ry, s * 0.03, 0, Math.PI * 2); g.fill();
      });
    }
    g.restore();
    if (dark) {
      g.fillStyle = '#e7b83f';
      g.beginPath(); g.ellipse(-rx * 0.35, -ry * 0.05, rx * 0.3, rx * 0.16, -0.5, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(rx * 0.05, -ry * 0.05, rx * 0.3, rx * 0.16, 0.5, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(255,255,255,.4)';
    g.beginPath(); g.ellipse(-rx * 0.4, -ry * 0.45, rx * 0.15, ry * 0.22, -0.3, 0, Math.PI * 2); g.fill();
    g.strokeStyle = dark ? 'rgba(30,15,5,.6)' : 'rgba(150,130,100,.6)';
    g.lineWidth = Math.max(1, s * 0.025);
    egg(); g.stroke();
    g.restore();
  }

  /** Tom avermelhado bem leve nas casas que o gato enxerga. */
  function drawCatSight(g, c, s) {
    const cx = Math.round(c.x), cy = Math.round(c.y);
    g.save();
    for (const [dx, dy] of D4) {
      for (let i = 1; i <= CFG.catSight; i++) {
        const x = cx + dx * i, y = cy + dy * i;
        if (L.g[y][x] === 1) break;
        g.fillStyle = `rgba(200,70,70,${0.13 * (1 - (i - 1) / (CFG.catSight + 1))})`;
        g.fillRect(x * s, y * s, s, s);
      }
    }
    g.restore();
  }

  /** Gato gordinho cinza, visto de cima. */
  function drawCat(g, x, y, s, c, t) {
    const R = s * 0.4;
    const puff = c.puff || 0;
    const moving = c.mode === 'walk' || c.mode === 'flee';
    g.save();
    g.translate(x, y);
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.beginPath(); g.ellipse(s * 0.05, s * 0.08, R * 1.15, R * 1.0, 0, 0, Math.PI * 2); g.fill();
    g.rotate(c.face + (moving ? Math.sin(t * (c.mode === 'flee' ? 22 : 8)) * 0.1 : 0));
    // Rabo (estufado quando o Krug late)
    const sw = Math.sin(t * (c.mode === 'sit' ? 2 : 5) + c.phase) * R * 0.6 * (1 - puff * 0.8);
    g.lineCap = 'round';
    g.strokeStyle = '#5f656d';
    g.lineWidth = R * (0.3 + puff * 0.4);
    g.beginPath(); g.moveTo(-R * 0.8, 0); g.quadraticCurveTo(-R * 1.5, sw, -R * 1.65, sw * 1.5 + R * 0.35); g.stroke();
    if (puff > 0.3) {
      g.strokeStyle = 'rgba(200,205,212,.7)';
      g.lineWidth = Math.max(1, R * 0.06);
      for (let k = 0; k < 7; k++) {
        const a = k / 6;
        const px = -R * 0.9 - a * R * 0.7, py = sw * a * 1.2 + R * 0.35 * a;
        g.beginPath(); g.moveTo(px, py - R * 0.3 * puff); g.lineTo(px, py + R * 0.3 * puff); g.stroke();
      }
    }
    // Patinhas aparecendo ao andar
    if (moving) {
      const st = Math.sin(t * (c.mode === 'flee' ? 24 : 9));
      g.fillStyle = '#8a9098';
      [[0.45, 0.62, 1], [0.45, -0.62, -1], [-0.45, 0.62, -1], [-0.45, -0.62, 1]].forEach(([px, py, ph]) => {
        g.beginPath(); g.arc(px * R + st * ph * R * 0.18, py * R, R * 0.17, 0, Math.PI * 2); g.fill();
      });
    }
    // Corpo gordinho
    const k = 1 + puff * 0.12;
    const body = g.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, -R * 0.1, 0, R * 1.05);
    body.addColorStop(0, '#c3c8ce');
    body.addColorStop(1, '#7e848c');
    g.fillStyle = body;
    g.beginPath(); g.ellipse(-R * 0.1, 0, R * 1.0 * k, R * 0.85 * k, 0, 0, Math.PI * 2); g.fill();
    // Listras
    g.strokeStyle = 'rgba(70,75,82,.5)';
    g.lineWidth = R * 0.12;
    for (let i = -1; i <= 1; i++) {
      const sx = -R * 0.15 + i * R * 0.38;
      g.beginPath(); g.moveTo(sx, -R * 0.72); g.quadraticCurveTo(sx - R * 0.15, 0, sx, R * 0.72); g.stroke();
    }
    // Cabeça
    g.fillStyle = '#9ba1a9';
    g.beginPath(); g.arc(R * 0.85, 0, R * 0.5, 0, Math.PI * 2); g.fill();
    // Orelhas
    [1, -1].forEach((sg) => {
      g.fillStyle = '#7e848c';
      g.beginPath(); g.moveTo(R * 0.62, sg * R * 0.18); g.lineTo(R * 0.98, sg * R * 0.42); g.lineTo(R * 0.6, sg * R * 0.68); g.closePath(); g.fill();
      g.fillStyle = '#e7a9b4';
      g.beginPath(); g.moveTo(R * 0.67, sg * R * 0.28); g.lineTo(R * 0.88, sg * R * 0.42); g.lineTo(R * 0.66, sg * R * 0.56); g.closePath(); g.fill();
    });
    // Olhos (fechados quando está sentado tranquilo)
    const calm = c.mode === 'sit' && Math.sin(t * 0.8 + c.phase) > 0.3;
    [1, -1].forEach((sg) => {
      if (calm) {
        g.strokeStyle = '#2e3238';
        g.lineWidth = Math.max(1, R * 0.06);
        g.beginPath(); g.arc(R * 1.05, sg * R * 0.2, R * 0.09, 0.2, Math.PI - 0.2); g.stroke();
      } else {
        g.fillStyle = c.mode === 'stare' ? '#f2d14b' : '#9bd36b';
        g.beginPath(); g.ellipse(R * 1.08, sg * R * 0.2, R * 0.1, R * 0.12, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#1d2024';
        g.beginPath(); g.ellipse(R * 1.1, sg * R * 0.2, R * 0.03, R * 0.09, 0, 0, Math.PI * 2); g.fill();
      }
    });
    // Focinho e bigodes
    g.fillStyle = '#e7a9b4';
    g.beginPath(); g.arc(R * 1.3, 0, R * 0.07, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.75)';
    g.lineWidth = Math.max(1, R * 0.03);
    [1, -1].forEach((sg) => {
      g.beginPath();
      g.moveTo(R * 1.25, sg * R * 0.1); g.lineTo(R * 1.6, sg * R * 0.35);
      g.moveTo(R * 1.25, sg * R * 0.12); g.lineTo(R * 1.55, sg * R * 0.5);
      g.stroke();
    });
    g.restore();
  }

  /** Faixa de sol no chão, entrando pela janela na diagonal. */
  function drawSun(g, z, s, t) {
    const xs = z.tiles.map((p) => p[0]), ys = z.tiles.map((p) => p[1]);
    const x0 = Math.min(...xs) * s, y0 = Math.min(...ys) * s;
    const w = (Math.max(...xs) + 1) * s - x0, h = (Math.max(...ys) + 1) * s - y0;
    drawSunRect(g, x0, y0, w, h, s, t + z.phase);
  }

  function drawSunRect(g, x0, y0, w, h, s, t) {
    g.save();
    g.beginPath();
    g.rect(x0, y0, w, h);
    g.clip();
    const a = 0.42 + Math.sin(t * 1.6) * 0.06;
    g.fillStyle = `rgba(255,205,70,${a})`;
    g.fillRect(x0, y0, w, h);
    // Faixas mais claras na diagonal
    g.fillStyle = 'rgba(255,250,215,.45)';
    const step = s * 0.7;
    for (let k = -h; k < w + h; k += step) {
      g.beginPath();
      g.moveTo(x0 + k, y0 + h);
      g.lineTo(x0 + k + h * 0.6, y0);
      g.lineTo(x0 + k + h * 0.6 + s * 0.28, y0);
      g.lineTo(x0 + k + s * 0.28, y0 + h);
      g.closePath();
      g.fill();
    }
    // Poeirinha brilhando no sol
    g.fillStyle = 'rgba(255,255,255,.8)';
    for (let i = 0; i < 5; i++) {
      const px = x0 + ((i * 0.37 + t * 0.05 * (1 + i % 3)) % 1) * w;
      const py = y0 + ((i * 0.61 + Math.sin(t * 0.7 + i) * 0.1 + 1) % 1) * h;
      g.beginPath(); g.arc(px, py, Math.max(1, s * 0.03), 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  /** Setinha amarela mostrando a direção já escolhida. */
  function drawQueueArrow(g, x, y, R, d, t) {
    const ang = Math.atan2(d[1], d[0]);
    const off = R * (1.25 + Math.sin(t * 14) * 0.08);
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.fillStyle = '#ffe08a';
    g.strokeStyle = 'rgba(60,30,10,.8)';
    g.lineWidth = Math.max(1.5, R * 0.1);
    g.beginPath();
    g.moveTo(off + R * 0.5, 0);
    g.lineTo(off, -R * 0.42);
    g.lineTo(off, R * 0.42);
    g.closePath();
    g.stroke();
    g.fill();
    g.restore();
  }

  const STAR_SVG = '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/></svg>';

  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  /** A tampinha de refrigerante com a carinha do Krug. */
  function drawCap(g, x, y, R, angle, face, opts = {}) {
    g.save();
    g.translate(x, y);
    // Sombra
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath(); g.ellipse(R * 0.12, R * 0.22, R * 1.02, R * 0.96, 0, 0, Math.PI * 2); g.fill();
    if (opts.glow) {
      g.shadowColor = 'rgba(255,210,80,.95)';
      g.shadowBlur = R * 0.9;
    }
    g.rotate(angle);
    // Borda serrilhada (21 dentes, como uma tampinha de verdade)
    const teeth = 21;
    g.beginPath();
    for (let i = 0; i <= teeth * 8; i++) {
      const a = (i / (teeth * 8)) * Math.PI * 2;
      const rr = R * (0.94 + 0.06 * Math.cos(a * teeth));
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.closePath();
    const metal = g.createLinearGradient(-R, -R, R, R);
    metal.addColorStop(0, '#ff5a5f');
    metal.addColorStop(0.5, '#d62828');
    metal.addColorStop(1, '#8e1414');
    g.fillStyle = metal;
    g.fill();
    g.shadowBlur = 0;
    g.lineWidth = Math.max(1, R * 0.05);
    g.strokeStyle = '#6d0f0f';
    g.stroke();
    // Anel interno prateado
    const ring = g.createLinearGradient(-R, -R, R, R);
    ring.addColorStop(0, '#ffffff');
    ring.addColorStop(0.5, '#c9ced6');
    ring.addColorStop(1, '#8b939e');
    g.fillStyle = ring;
    g.beginPath(); g.arc(0, 0, R * 0.82, 0, Math.PI * 2); g.fill();
    // Carinha
    g.save();
    g.beginPath(); g.arc(0, 0, R * 0.74, 0, Math.PI * 2); g.clip();
    if (face) g.drawImage(face, -R * 0.74, -R * 0.74, R * 1.48, R * 1.48);
    else { g.fillStyle = '#3b2a1e'; g.fillRect(-R, -R, R * 2, R * 2); }
    const shade = g.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.2, 0, 0, R * 0.8);
    shade.addColorStop(0, 'rgba(255,255,255,.12)');
    shade.addColorStop(1, 'rgba(0,0,0,.22)');
    g.fillStyle = shade;
    g.fillRect(-R, -R, R * 2, R * 2);
    g.restore();
    g.restore();
  }

  // ---------------------------------------------------------------------------
  // Efeitos
  // ---------------------------------------------------------------------------
  function burst(x, y, color, n, speed = 3, size = 0.08, gravity = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8);
      particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.5 + Math.random() * 0.5, color, size: size * (0.6 + Math.random() * 0.8), gravity });
    }
  }
  function floatText(x, y, text, color = '#fff') {
    floaters.push({ x, y, text, color, life: 0, max: 1 });
  }
  function banner(text, sub = '', dur = 1.6) {
    S.banner = { text, sub, life: 0, max: dur };
  }

  // ---------------------------------------------------------------------------
  // Movimento da tampinha
  // ---------------------------------------------------------------------------
  const isOpen = (x, y, d) => L.g[y + d[1]][x + d[0]] === 0;
  const same = (a, b) => a && b && a[0] === b[0] && a[1] === b[1];
  const opposite = (a, b) => a && b && a[0] === -b[0] && a[1] === -b[1];

  /** Para o Krug na próxima casa (o movimento é de casa em casa). */
  function stop() {
    Snd.init();
    if (S.mode !== 'play' || K.barkT > 0) return;
    K.queue = null;
    if (K.moving) K.stopReq = true;
    if (K.napT > 0) K.napDir = null;
  }

  function input(name) {
    Snd.init();
    if (S.mode !== 'play') return;
    K.stopReq = false;
    const d = DIRS[name];
    if (!d || K.scaredT > 0) return;
    if (K.barkT > 0) return; // latindo para o gato, esqueceu de tudo
    if (K.napT > 0) { K.napDir = d; return; } // guarda para quando acordar
    if (!K.moving) {
      if (isOpen(K.cx, K.cy, d)) { K.dir = d; K.moving = true; K.prog = 0; K.queue = null; }
      else { K.bumpT = 0.18; K.bumpDir = d; Snd.bump(); }
      return;
    }
    if (opposite(d, K.dir)) {
      // Meia-volta imediata
      K.cx += K.dir[0]; K.cy += K.dir[1];
      K.prog = 1 - K.prog;
      K.dir = d;
      K.queue = null;
    } else if (same(d, K.dir)) {
      K.queue = null;
    } else if (K.prog <= CFG.lateTurn && isOpen(K.cx, K.cy, d)) {
      // Tocou um pouco tarde: volta o pedacinho e vira no cruzamento que acabou de passar
      K.prog = 0;
      K.dir = d;
      K.queue = null;
    } else {
      // Tocou cedo: guarda a direção por pouco tempo e vira na primeira casa em que der
      K.queue = d;
      K.queueT = CFG.queueTime;
    }
  }

  /**
   * Decide o que fazer ao chegar numa casa: se o jogador escolheu outra direção
   * e ela está livre aqui, vira; senão segue reto até bater na parede.
   */
  function decide() {
    if (K.stopReq) {
      K.stopReq = false;
      K.queue = null;
      return null;
    }
    if (K.queue && isOpen(K.cx, K.cy, K.queue)) {
      const q = K.queue;
      K.queue = null;
      return q;
    }
    if (isOpen(K.cx, K.cy, K.dir)) return K.dir;
    K.queue = null;
    return null;
  }

  function arrive() {
    const i = L.idx(K.cx, K.cy);
    const it = L.items.get(i);
    const px = K.cx + 0.5, py = K.cy + 0.5;
    if (it === 'popoca') {
      L.items.delete(i);
      S.score += CFG.pts.popoca;
      K.happyT = 0.35;
      burst(px, py, '#fff6df', 8, 2.5, 0.09);
      floatText(px, py, '+' + CFG.pts.popoca);
      Snd.popoca();
    } else if (it === 'pao') {
      L.items.delete(i);
      S.score += CFG.pts.pao;
      K.braveT = CFG.braveTime;
      burst(px, py, '#f4b942', 16, 3.5, 0.1);
      floatText(px, py, '+' + CFG.pts.pao, '#ffe08a');
      banner('Krug corajoso!', 'Agora o má banho é que foge');
      Snd.pao();
    } else if (it === 'coberta') {
      L.items.delete(i);
      burst(px, py, '#d6dbe0', 14, 3, 0.1);
      if (K.shield) {
        S.score += CFG.pts.coberta;
        floatText(px, py, '+' + CFG.pts.coberta, '#e9edf1');
      } else {
        K.shield = true;
        K.shieldPop = 0.4;
        banner('Cobertinha!', 'Protege de um má banho');
      }
      K.happyT = 0.6;
      Snd.coberta();
      updateHud();
    }
    if (it === 'ovoBranco') {
      L.items.delete(i);
      S.score += CFG.pts.ovo;
      K.hopT = 0.6;
      K.happyT = 0.9;
      burst(px, py, '#fff6df', 14, 3, 0.09);
      burst(px, py, '#f4a3b8', 8, 3, 0.07);
      floatText(px, py, '+' + CFG.pts.ovo, '#ffe08a');
      if (!eggHintShown.white) { eggHintShown.white = true; banner('Chocolate branco!', 'O Krug adorou'); }
      Snd.yum();
    } else if (it === 'ovoPreto') {
      L.items.delete(i);
      eatDark(px, py);
      return;
    }
    if (K.cx === L.goal.x && K.cy === L.goal.y) { levelDone(); return; }
    // Raio de sol: ao entrar numa faixa, o Krug para um instante para se aquecer
    const z = L.sunAt.get(i);
    if (z === undefined) K.sunZone = null;
    else if (K.sunZone !== z) {
      K.sunZone = z;
      nap();
    }
  }

  const eggHintShown = { white: false, dark: false };

  /** Chocolate preto faz mal a cachorro: o Krug perde uma patinha (não volta ao começo). */
  function eatDark(px, py) {
    S.lives--;
    S.lastHurt = 'chocolate';
    K.sick = true;
    K.scaredT = 1.1;
    K.moving = false;
    K.queue = null;
    K.napT = 0;
    K.invulnT = CFG.invulnTime;
    burst(px, py, '#6b3e22', 18, 3.5, 0.09, 5);
    burst(px, py, '#9bc46b', 10, 2.5, 0.07);
    banner('Chocolate preto faz mal!', S.lives > 0 ? 'O Krug perdeu uma patinha' : '');
    Snd.blergh();
    if (navigator.vibrate) { try { navigator.vibrate([60, 40, 60]); } catch (e) { /* sem vibração */ } }
    updateHud();
  }

  let bowlHintShown = false;
  /** Da fase 8 em diante, a tigela de papá muda de lugar de tempos em tempos. */
  function stepBowl(dt) {
    if (L.bowlPop > 0) L.bowlPop = Math.max(0, L.bowlPop - dt);
    if (L.bowlWarn > 0) {
      L.bowlWarn -= dt;
      if (L.bowlWarn <= 0) { L.bowlWarn = 0; moveBowl(); }
      return;
    }
    L.bowlTimer -= dt;
    if (L.bowlTimer > 0) return;
    // Não foge quando o Krug já está chegando
    const near = Math.abs(K.x - L.goal.x) + Math.abs(K.y - L.goal.y) <= 3;
    if (near) { L.bowlTimer = 2; return; }
    L.bowlWarn = CFG.bowlWarnTime;
    Snd.bowlWarn();
  }

  function moveBowl() {
    const W = L.W;
    const kx = Math.round(K.x), ky = Math.round(K.y);
    const reach = bfs(L.m, 1, 1, L.blocked);
    const dK = bfs(L.m, kx, ky, L.blocked);
    const ok = [];
    for (let y = 1; y < L.H; y += 2) {
      for (let x = 1; x < W; x += 2) {
        const i = x + y * W;
        if (reach[i] < 0 || L.items.has(i) || L.sunAt.has(i)) continue;
        if (x === L.goal.x && y === L.goal.y) continue;
        if (dK[i] >= 0 && dK[i] < 8) continue;
        if (L.baths.some((b) => !b.moving && b.x === x && b.y === y)) continue;
        ok.push(i);
      }
    }
    L.bowlTimer = CFG.bowlEvery[0] + Math.random() * (CFG.bowlEvery[1] - CFG.bowlEvery[0]);
    if (!ok.length) return;
    const i = ok[(Math.random() * ok.length) | 0];
    burst(L.goal.x + 0.5, L.goal.y + 0.5, '#ffe08a', 16, 4, 0.09);
    L.goal = { x: i % W, y: (i / W) | 0 };
    L.bowlPop = 0.45;
    burst(L.goal.x + 0.5, L.goal.y + 0.5, '#8fb4ff', 16, 4, 0.09);
    Snd.bowlMove();
    if (!bowlHintShown) { bowlHintShown = true; banner('A tigela fugiu!', 'Ela muda de lugar de vez em quando'); }
  }

  let napHintShown = false;
  function nap() {
    if (K.barkT > 0) return; // latindo para o gato nem percebe o sol
    K.napT = CFG.napTime;
    K.napDir = K.dir;
    K.zzz = 0;
    K.queue = null;
    K.stopReq = false;
    if (!napHintShown) { napHintShown = true; banner('Que solzinho bom...', 'O Krug para um pouco para se aquecer'); }
    Snd.yawn();
  }

  function wake() {
    K.napT = 0;
    const d = K.napDir;
    K.napDir = null;
    if (d && isOpen(K.cx, K.cy, d)) { K.dir = d; K.moving = true; K.prog = 0; }
  }

  function stepKrug(dt) {
    if (K.scaredT > 0) return;
    if (K.barkT > 0 && !K.moving) { K.x = K.cx; K.y = K.cy; return; }
    if (K.napT > 0) {
      K.napT -= dt;
      K.zzz -= dt;
      if (K.zzz <= 0) { K.zzz = 0.45; floatText(K.x + 0.75, K.y + 0.2, 'z', '#ffffff'); }
      if (K.napT <= 0) wake();
      if (K.napT > 0) { K.x = K.cx; K.y = K.cy; return; }
    }
    let dist = CFG.speed * dt;
    while (dist > 0 && K.moving) {
      const d = Math.min(dist, 1 - K.prog);
      K.prog += d;
      dist -= d;
      const sign = K.dir[0] + K.dir[1] > 0 ? 1 : -1;
      K.angle += d * sign * 2.4;
      if (K.prog >= 1 - 1e-9) {
        K.cx += K.dir[0];
        K.cy += K.dir[1];
        K.prog = 0;
        arrive();
        if (S.mode !== 'play' || K.napT > 0 || K.scaredT > 0) { K.moving = false; break; }
        const next = decide();
        if (next) K.dir = next; else K.moving = false;
      }
    }
    K.x = K.cx + (K.moving ? K.dir[0] * K.prog : 0);
    K.y = K.cy + (K.moving ? K.dir[1] * K.prog : 0);
    if (!K.moving) {
      // A tampinha volta a ficar de pé quando para
      const target = Math.round(K.angle / (Math.PI * 2)) * Math.PI * 2;
      K.angle += (target - K.angle) * Math.min(1, dt * 6);
    }
  }

  function stepBaths(dt) {
    for (const b of L.baths) {
      b.phase += dt;
      if (b.gone) { b.goneT = (b.goneT || 0) + dt; continue; }
      if (b.moving) {
        b.t += b.dir * b.speed * dt;
        if (b.t > b.len) { b.t = b.len; b.dir = -1; }
        if (b.t < 0) { b.t = 0; b.dir = 1; }
        const f = b.t / b.len;
        b.x = b.ax + (b.bx - b.ax) * f;
        b.y = b.ay + (b.by - b.ay) * f;
      }
      if (K.scaredT > 0 || S.mode !== 'play') continue;
      const dx = b.x - K.x, dy = b.y - K.y;
      if (dx * dx + dy * dy < CFG.hitRadius * CFG.hitRadius) {
        if (K.braveT > 0) {
          b.gone = true;
          b.goneT = 0;
          S.score += CFG.pts.bathScared;
          burst(b.x + 0.5, b.y + 0.5, '#5bb8f0', 18, 4, 0.1, 6);
          floatText(b.x + 0.5, b.y + 0.5, '+' + CFG.pts.bathScared, '#bde6ff');
          Snd.scare();
        } else if (K.invulnT <= 0 && K.shield) {
          // A cobertinha molha no lugar do Krug
          K.shield = false;
          K.invulnT = 1.6;
          K.scaredT = 0.35;
          K.saved = true;
          K.moving = false;
          K.queue = null;
          burst(K.x + 0.5, K.y + 0.5, '#5bb8f0', 16, 3.5, 0.09, 6);
          burst(K.x + 0.5, K.y + 0.5, '#c9ced6', 10, 3, 0.1, 4);
          banner('Ufa!', 'A cobertinha protegeu o Krug');
          Snd.shieldHit();
          updateHud();
        } else if (K.invulnT <= 0) {
          hit(b);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Gato gordinho: se o Krug o vê no mesmo corredor, esquece de tudo e late
  // ---------------------------------------------------------------------------
  function makeCat(x, y) {
    return {
      cx: x, cy: y, x, y, dir: null, prog: 0, mode: 'sit', t: 1 + Math.random() * 2, path: null,
      face: Math.random() * Math.PI * 2, puff: 0, phase: Math.random() * 6,
    };
  }

  function lerpAngle(a, b, k) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * k;
  }

  /** O Krug enxerga o gato se estiverem no mesmo corredor reto, perto e sem parede no meio. */
  function catSees(c) {
    if (c.mode === 'flee') return false;
    const kx = Math.round(K.x), ky = Math.round(K.y);
    const cx = Math.round(c.x), cy = Math.round(c.y);
    if (kx !== cx && ky !== cy) return false;
    const dist = Math.abs(kx - cx) + Math.abs(ky - cy);
    if (dist > CFG.catSight) return false;
    const sx = Math.sign(cx - kx), sy = Math.sign(cy - ky);
    for (let i = 1; i < dist; i++) if (L.g[ky + sy * i][kx + sx * i] === 1) return false;
    return true;
  }

  function catChooseDir(c) {
    const open = D4.filter((d) => isOpen(c.cx, c.cy, d));
    const fwd = open.filter((d) => !c.dir || !opposite(d, c.dir));
    const opts = fwd.length ? fwd : open;
    return opts.length ? opts[(Math.random() * opts.length) | 0] : null;
  }

  /** Caminho para um canto longe do Krug, para onde o gato foge ofendido. */
  function catFleePath(c) {
    const d = bfs(L.m, c.cx, c.cy);
    const kx = Math.round(K.x), ky = Math.round(K.y);
    const cand = [];
    for (let i = 0; i < d.length; i++) {
      if (d[i] < 8 || d[i] > 30) continue;
      const x = i % L.W, y = (i / L.W) | 0;
      if (x % 2 === 0 || y % 2 === 0) continue;
      if (Math.abs(x - kx) + Math.abs(y - ky) < 10) continue;
      cand.push(i);
    }
    if (!cand.length) return [];
    let p = cand[(Math.random() * cand.length) | 0];
    const path = [];
    while (d[p] > 0) {
      path.push(p);
      const x = p % L.W, y = (p / L.W) | 0;
      const prev = D4.map(([dx, dy]) => (x + dx) + (y + dy) * L.W).find((q) => d[q] === d[p] - 1);
      if (prev === undefined) break;
      p = prev;
    }
    return path.reverse();
  }

  function catDirTo(c, idx) {
    return [(idx % L.W) - c.cx, ((idx / L.W) | 0) - c.cy];
  }

  let catHintShown = false;
  function startBark(c) {
    K.barkT = CFG.barkTime;
    K.barkEvery = 0.15;
    K.barkCat = c;
    K.queue = null;
    if (K.moving) K.stopReq = true; // termina a casa em que está e para
    if (K.napT > 0) { K.napT = 0; K.napDir = null; }
    // O gato para e encara o Krug, com o rabo estufado
    c.cx = Math.round(c.x); c.cy = Math.round(c.y);
    c.x = c.cx; c.y = c.cy; c.prog = 0; c.dir = null;
    c.mode = 'stare';
    c.puff = 1;
    c.face = Math.atan2(Math.round(K.y) - c.cy, Math.round(K.x) - c.cx);
    floatText(c.x + 0.5, c.y + 0.1, 'fsss!', '#e4e8ec');
    Snd.hiss();
    if (!catHintShown) { catHintShown = true; banner('Gato gordinho!', 'O Krug esqueceu de tudo'); }
  }

  function endBark() {
    K.barkT = 0;
    K.catCooldown = CFG.catCooldown;
    const c = K.barkCat;
    K.barkCat = null;
    if (!c) return;
    c.path = catFleePath(c);
    const nxt = c.path.shift();
    if (nxt === undefined) { c.mode = 'sit'; c.t = 1; c.dir = null; return; }
    c.mode = 'flee';
    c.dir = catDirTo(c, nxt);
    c.prog = 0;
    c.puff = 1;
    burst(c.x + 0.5, c.y + 0.5, '#9aa0a8', 10, 3, 0.08);
    Snd.meow();
  }

  function stepCats(dt) {
    for (const c of L.cats) {
      c.phase += dt;
      if (c.mode !== 'stare') c.puff = Math.max(0, c.puff - dt * 0.8);
      if (c.mode === 'stare') continue;
      if (c.mode === 'sit') {
        c.t -= dt;
        if (c.t <= 0) { c.dir = catChooseDir(c); c.prog = 0; c.mode = c.dir ? 'walk' : 'sit'; c.t = 1; }
      } else {
        const speed = c.mode === 'flee' ? CFG.catFlee : CFG.catWalk;
        let dist = speed * dt;
        while (dist > 0 && c.dir) {
          const d = Math.min(dist, 1 - c.prog);
          c.prog += d;
          dist -= d;
          if (c.prog >= 1 - 1e-9) {
            c.cx += c.dir[0]; c.cy += c.dir[1]; c.prog = 0;
            if (c.mode === 'flee') {
              const nxt = c.path && c.path.shift();
              if (nxt === undefined) { c.mode = 'sit'; c.t = 2 + Math.random() * 2; c.dir = null; break; }
              c.dir = catDirTo(c, nxt);
            } else {
              const isCell = c.cx % 2 === 1 && c.cy % 2 === 1;
              if (isCell && Math.random() < 0.18) { c.mode = 'sit'; c.t = 1.5 + Math.random() * 2.5; c.dir = null; break; }
              c.dir = catChooseDir(c);
            }
          }
        }
        if (c.dir) c.face = lerpAngle(c.face, Math.atan2(c.dir[1], c.dir[0]), Math.min(1, dt * 8));
      }
      c.x = c.cx + (c.dir ? c.dir[0] * c.prog : 0);
      c.y = c.cy + (c.dir ? c.dir[1] * c.prog : 0);
    }

    // Latindo para o gato
    if (K.barkT > 0) {
      K.barkT -= dt;
      K.barkEvery -= dt;
      if (K.barkEvery <= 0 && !K.moving) {
        K.barkEvery = 0.4 + Math.random() * 0.15;
        Snd.bark(0, { rate: 0.95 + Math.random() * 0.2, vol: 0.8 });
        floatText(K.x + 0.5 + (Math.random() - 0.5) * 0.5, K.y + 0.05, 'au!', '#ffe08a');
        K.barkShake = 0.15;
      }
      if (K.barkCat) K.barkCat.face = Math.atan2(K.y - K.barkCat.cy, K.x - K.barkCat.cx);
      if (K.barkT <= 0) endBark();
      return;
    }
    if (K.catCooldown > 0) { K.catCooldown = Math.max(0, K.catCooldown - dt); return; }
    if (K.scaredT > 0 || K.invulnT > 0) return;
    for (const c of L.cats) if (catSees(c)) { startBark(c); break; }
  }

  function hit(b) {
    if (K.barkT > 0) endBark();
    K.saved = false;
    K.sick = false;
    S.lastHurt = 'bath';
    K.napT = 0;
    K.napDir = null;
    S.lives--;
    K.scaredT = CFG.scaredTime;
    K.moving = false;
    K.queue = null;
    K.braveT = 0;
    burst(K.x + 0.5, K.y + 0.5, '#5bb8f0', 26, 4.5, 0.11, 7);
    banner('Má banho!', S.lives > 0 ? 'O Krug correu de volta para o começo' : '');
    Snd.bath();
    if (navigator.vibrate) { try { navigator.vibrate([80, 40, 120]); } catch (e) { /* sem vibração */ } }
    updateHud();
  }

  function afterScare() {
    if (K.saved) { K.saved = false; return; }
    if (K.sick) { K.sick = false; if (S.lives <= 0) gameOver(); return; }
    if (S.lives <= 0) { gameOver(); return; }
    K.cx = L.start.x; K.cy = L.start.y; K.x = K.cx; K.y = K.cy;
    K.prog = 0; K.dir = null;
    K.sunZone = null;
    K.invulnT = CFG.invulnTime;
  }

  // ---------------------------------------------------------------------------
  // Fluxo do jogo
  // ---------------------------------------------------------------------------
  function startLevel() {
    L = buildLevel(S.level);
    Object.assign(K, {
      cx: L.start.x, cy: L.start.y, x: L.start.x, y: L.start.y, dir: null, prog: 0, moving: false,
      queue: null, angle: 0, scaredT: 0, braveT: 0, invulnT: 0, happyT: 0, bumpT: 0, saved: false, stopReq: false,
      napT: 0, napDir: null, sunZone: null, zzz: 0,
      barkT: 0, barkEvery: 0, barkCat: null, catCooldown: 0, barkShake: 0, hopT: 0, sick: false,
    });
    particles.length = 0;
    floaters.length = 0;
    S.levelTime = 0;
    layout();
    S.mode = 'play';
    let sub = '';
    if (S.level === 1) sub = 'Leve o Krug até a tigela de papá';
    else if ((S.level - 1) % 5 === 0) sub = 'Agora ' + L.theme.place;
    banner('Fase ' + S.level, sub, sub ? 2.2 : 1.6);
    Snd.bark(0.1);
    updateHud();
  }

  function newGame() {
    S.level = 1;
    S.score = 0;
    S.lives = CFG.lives;
    S.stars = 0;
    S.lastHurt = null;
    K.shield = false;
    S.bestAtStart = S.best;
    hideAll();
    startLevel();
  }

  function levelDone() {
    S.mode = 'levelDone';
    const bonus = CFG.pts.bowl * S.level;
    S.score += bonus;
    K.happyT = 3;
    burst(L.goal.x + 0.5, L.goal.y + 0.5, '#ffe08a', 30, 5, 0.12);
    burst(L.goal.x + 0.5, L.goal.y + 0.5, '#ff6b6b', 20, 4, 0.1);
    Snd.bowl();
    // Estrelas: chegar à tigela, comer todas as popocas, comer todos os pães do queijo
    let popLeft = 0, paoLeft = 0;
    for (const v of L.items.values()) { if (v === 'popoca') popLeft++; else if (v === 'pao') paoLeft++; }
    const got = [true, popLeft === 0, paoLeft === 0];
    const nStars = got.filter(Boolean).length;
    const starBonus = (nStars - 1) * CFG.pts.star;
    S.score += starBonus;
    S.stars += nStars;
    let extra = '';
    if (S.level % 3 === 0 && S.lives < CFG.lives) { S.lives++; extra = ' e uma patinha de volta'; }
    updateHud();
    saveBest();
    $('#level-text').textContent = `Fase ${S.level} concluída. O Krug chegou à tigela de papá!`;
    $('#level-bonus').textContent = `+${bonus + starBonus} pontos${extra}`;
    const labels = [
      'Chegou à tigela de papá',
      popLeft === 0 ? 'Comeu todas as popocas' : `Comeu todas as popocas (${popLeft === 1 ? 'faltou 1' : `faltaram ${popLeft}`})`,
      paoLeft === 0 ? 'Comeu todos os pães do queijo' : `Comeu todos os pães do queijo (${paoLeft === 1 ? 'faltou 1' : `faltaram ${paoLeft}`})`,
    ];
    $('#star-list').innerHTML = labels.map((txt, i) => `<li class="${got[i] ? 'ok' : ''}">${STAR_SVG}<span>${txt}</span></li>`).join('');
    const big = $('#level-stars');
    big.innerHTML = got.map((ok, i) => `<span class="big-star ${ok ? 'ok' : ''}" style="animation-delay:${0.15 + i * 0.25}s">${STAR_SVG}</span>`).join('');
    setTimeout(() => {
      got.forEach((ok, i) => { if (ok) Snd.star(i * 0.25 + 0.15, i); });
    }, 900);
    setTimeout(() => show('#screen-level'), 900);
  }

  // ---------------------------------------------------------------------------
  // Intervalo a cada 5 fases: o Krug grande correndo atrás da tigela de papá
  // ---------------------------------------------------------------------------
  function playCutscene(level) {
    return new Promise((resolve) => {
      hideAll();
      const el = $('#screen-cut');
      const cv = $('#cut');
      const g = cv.getContext('2d');
      el.classList.remove('hidden');
      S.mode = 'cutscene';
      const W = window.innerWidth, H = window.innerHeight;
      const r = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(W * r);
      cv.height = Math.round(H * r);
      cv.style.width = W + 'px';
      cv.style.height = H + 'px';
      Snd.init();
      Snd.bark(0);
      const music = Snd.music();
      const DUR = 6.0;
      const t0 = performance.now();
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        music.stop();
        el.classList.add('hidden');
        el.removeEventListener('pointerdown', finish);
        window.removeEventListener('keydown', onKey);
        resolve();
      };
      const onKey = (e) => { if ([' ', 'Enter', 'Escape'].includes(e.key)) { e.preventDefault(); finish(); } };
      setTimeout(() => {
        if (done) return;
        el.addEventListener('pointerdown', finish);
        window.addEventListener('keydown', onKey);
      }, 400);
      let barked = false;
      let catDone = level < 10;
      const step = (now) => {
        if (done) return;
        const t = (now - t0) / 1000;
        if (!catDone && cutCat(W, H, t).scared) {
          catDone = true;
          Snd.hiss();
          Snd.bark(0.15, { rate: 1.05 });
          Snd.meow(0.45);
        }
        drawCutscene(g, W, H, r, t, level);
        if (!barked && t > 4.9) { barked = true; Snd.doubleBark(0); }
        if (t > DUR) finish(); else requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  /** Posições do intervalo: a tigela vai na frente e o Krug encurta a distância. */
  function cutLayout(W, H, t) {
    const R = Math.min(H * 0.17, W * 0.2);
    const legH = R * 0.35;
    const bowlW = R * 1.3, bowlH = R * 0.65;
    const gapAt = (tt) => R * Math.max(1.9, 2.7 - tt * 0.16);
    const bx0 = -bowlW / 2;
    const v = (W + R * 1.6 + bowlW / 2 + gapAt(5.3)) / 5.0;
    const bxAt = (tt) => bx0 + v * (tt - 0.3);
    const bx = bxAt(t);
    const kx = bx - gapAt(t);
    return { R, legH, bowlW, bowlH, v, bxAt, bx, kx, floorY: H * 0.7 };
  }

  /**
   * Gato do intervalo (fase 10 em diante): sentado no caminho, se irrita
   * quando o Krug chega perto e foge correndo para a direita.
   */
  function cutCat(W, H, t) {
    const { R, v } = cutLayout(W, H, t);
    const catX = W * 0.66;
    // Instante em que o Krug chega perto do gato
    let tScare = 0;
    for (let tt = 0; tt < 8; tt += 0.02) { if (cutLayout(W, H, tt).kx > catX - R * 2.6) { tScare = tt; break; } }
    const scared = t >= tScare;
    const run = Math.max(0, t - tScare - 0.35);
    const x = catX + run * v * 2.1 + (run > 0 ? 0 : 0);
    return { x, scared, tScare, run, R: R * 0.85, jump: scared && t - tScare < 0.35 ? Math.sin(((t - tScare) / 0.35) * Math.PI) : 0 };
  }

  /** Gato gordinho cinza visto de lado (só no intervalo). */
  function drawCatSide(g, x, floorY, R, t, st) {
    const running = st.run > 0;
    const y = floorY - R * 0.95 - st.jump * R * 0.9 - (running ? Math.abs(Math.sin(t * 20)) * R * 0.12 : 0);
    g.save();
    g.translate(x, y);
    // Sombra
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.beginPath(); g.ellipse(0, floorY - y - R * 0.02, R * 1.1, R * 0.16, 0, 0, Math.PI * 2); g.fill();
    // Sentado, olha para a esquerda (para o Krug); correndo, vai para a direita
    const dirX = running ? 1 : -1;
    g.scale(dirX, 1);
    // Rabo: enrolado no chão quando calmo, em pé e estufado quando irritado
    g.lineCap = 'round';
    g.strokeStyle = '#5f656d';
    g.lineWidth = R * (st.scared ? 0.42 : 0.22);
    g.beginPath();
    if (st.scared) { g.moveTo(-R * 0.9, -R * 0.1); g.quadraticCurveTo(-R * 1.5, -R * 0.6, -R * 1.25, -R * 1.5); }
    else { const sw = Math.sin(t * 3) * R * 0.15; g.moveTo(-R * 0.8, R * 0.6); g.quadraticCurveTo(-R * 1.6, R * 0.9 + sw, -R * 1.2, R * 0.35); }
    g.stroke();
    if (st.scared) {
      g.strokeStyle = 'rgba(200,205,212,.8)';
      g.lineWidth = Math.max(1, R * 0.06);
      for (let k = 0; k < 7; k++) {
        const a = k / 6;
        const px = -R * 0.95 - Math.sin(a * 1.6) * R * 0.5 + a * R * 0.2, py = -R * 0.1 - a * R * 1.4;
        g.beginPath(); g.moveTo(px - R * 0.25, py); g.lineTo(px + R * 0.25, py); g.stroke();
      }
    }
    // Patas
    g.fillStyle = '#7e848c';
    const legs = running ? [[-0.55, 1], [-0.25, -1], [0.3, 1], [0.6, -1]] : [[-0.4, 0], [0.45, 0]];
    legs.forEach(([lx, ph]) => {
      const sw = running ? Math.sin(t * 24) * ph * R * 0.25 : 0;
      g.beginPath(); g.ellipse(lx * R + sw, R * 0.75, R * 0.13, R * 0.3, sw / R, 0, Math.PI * 2); g.fill();
    });
    // Corpo gordinho
    const puff = st.scared ? 1.12 : 1;
    const body = g.createRadialGradient(-R * 0.2, -R * 0.4, R * 0.1, 0, 0, R * 1.1);
    body.addColorStop(0, '#c3c8ce');
    body.addColorStop(1, '#7e848c');
    g.fillStyle = body;
    g.beginPath();
    if (running) g.ellipse(0, R * 0.1, R * 1.05 * puff, R * 0.7 * puff, 0, 0, Math.PI * 2);
    else g.ellipse(0, R * 0.1, R * 0.85 * puff, R * 0.8 * puff, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(70,75,82,.5)';
    g.lineWidth = R * 0.12;
    for (let i = -1; i <= 1; i++) {
      g.beginPath(); g.moveTo(i * R * 0.35, -R * 0.6 * puff); g.quadraticCurveTo(i * R * 0.35 - R * 0.12, R * 0.05, i * R * 0.35, R * 0.4); g.stroke();
    }
    // Cabeça
    const hx = running ? R * 1.0 : R * 0.55, hy = running ? -R * 0.25 : -R * 0.6;
    g.fillStyle = '#9ba1a9';
    g.beginPath(); g.arc(hx, hy, R * 0.5, 0, Math.PI * 2); g.fill();
    // Orelhas (para trás quando irritado)
    const earTilt = st.scared ? 0.6 : 0;
    [[-0.25, 0], [0.2, 0.1]].forEach(([ex]) => {
      g.save();
      g.translate(hx + ex * R, hy - R * 0.35);
      g.rotate(-earTilt);
      g.fillStyle = '#7e848c';
      g.beginPath(); g.moveTo(-R * 0.17, R * 0.05); g.lineTo(0, -R * 0.38); g.lineTo(R * 0.17, R * 0.05); g.closePath(); g.fill();
      g.fillStyle = '#e7a9b4';
      g.beginPath(); g.moveTo(-R * 0.08, 0); g.lineTo(0, -R * 0.22); g.lineTo(R * 0.08, 0); g.closePath(); g.fill();
      g.restore();
    });
    // Olho (bravo quando irritado) e focinho
    g.fillStyle = st.scared ? '#f2d14b' : '#9bd36b';
    g.beginPath(); g.ellipse(hx + R * 0.22, hy - R * 0.05, R * 0.1, R * (st.scared ? 0.12 : 0.08), 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#1d2024';
    g.beginPath(); g.ellipse(hx + R * 0.24, hy - R * 0.05, R * 0.03, R * 0.08, 0, 0, Math.PI * 2); g.fill();
    if (st.scared) {
      g.strokeStyle = '#2e3238';
      g.lineWidth = Math.max(1.5, R * 0.06);
      g.beginPath(); g.moveTo(hx + R * 0.08, hy - R * 0.22); g.lineTo(hx + R * 0.36, hy - R * 0.14); g.stroke();
    }
    g.fillStyle = '#e7a9b4';
    g.beginPath(); g.arc(hx + R * 0.47, hy + R * 0.08, R * 0.06, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.8)';
    g.lineWidth = Math.max(1, R * 0.03);
    g.beginPath();
    g.moveTo(hx + R * 0.42, hy + R * 0.12); g.lineTo(hx + R * 0.85, hy + R * 0.05);
    g.moveTo(hx + R * 0.42, hy + R * 0.16); g.lineTo(hx + R * 0.82, hy + R * 0.25);
    g.stroke();
    g.restore();
    if (st.scared && st.run < 0.6) {
      g.save();
      g.globalAlpha = 1 - st.run / 0.6;
      g.font = `800 ${Math.round(R * 0.5)}px "Baloo 2", system-ui, sans-serif`;
      g.textAlign = 'center';
      g.lineWidth = R * 0.1;
      g.strokeStyle = '#0f2e2c';
      g.strokeText('fsss!', x, y - R * 1.5);
      g.fillStyle = '#e4e8ec';
      g.fillText('fsss!', x, y - R * 1.5);
      g.restore();
    }
  }

  function drawCutscene(g, W, H, r, t, level) {
    g.setTransform(r, 0, 0, r, 0, 0);
    // Fundo: parede e chão de madeira
    const floorY = H * 0.7;
    const wall = g.createLinearGradient(0, 0, 0, floorY);
    wall.addColorStop(0, '#0f2e2c');
    wall.addColorStop(1, '#1f5f59');
    g.fillStyle = wall;
    g.fillRect(0, 0, W, floorY);
    g.fillStyle = '#c99a6b';
    g.fillRect(0, floorY, W, H - floorY);
    g.fillStyle = 'rgba(90,55,25,.25)';
    for (let y = floorY; y < H; y += 22) g.fillRect(0, y, W, 2);
    const scroll = (t * 220) % 140;
    for (let y = floorY, row = 0; y < H; y += 22, row++) {
      for (let x = -scroll - (row % 2) * 70; x < W; x += 140) g.fillRect(x, y, 2, 22);
    }
    g.fillStyle = '#e8dcc6';
    g.fillRect(0, floorY - 10, W, 10); // rodapé

    const { R, legH, bowlW, bowlH, v, bxAt, bx, kx } = cutLayout(W, H, t);
    const hop = Math.abs(Math.sin(t * 8)) * R * 0.45;
    const by = floorY - bowlH / 2 - hop;

    // Ração caindo da tigela; o Krug come ao passar
    for (let k = 0; k < 40; k++) {
      const tk = 0.3 + k * 0.12;
      if (t < tk) break;
      const sx = bxAt(tk) - bowlW * 0.3;
      const dt = t - tk;
      const vx = -R * (1.2 + (k % 3) * 0.4);
      let x = sx + vx * dt;
      let y = floorY - bowlH - Math.abs(Math.sin(tk * 8)) * R * 0.45 - R * 2.2 * dt + 0.5 * R * 9 * dt * dt;
      if (y > floorY - 4) {
        const land = (2.2 + Math.sqrt(2.2 * 2.2 + 2 * 9 * ((floorY - 4 - (floorY - bowlH - Math.abs(Math.sin(tk * 8)) * R * 0.45)) / R))) / 9;
        x = sx + vx * land;
        y = floorY - 4;
      }
      if (x < kx + R * 0.6) continue; // comida!
      g.fillStyle = k % 2 ? '#8f4f22' : '#c98140';
      g.beginPath(); g.arc(x, y, R * 0.07, 0, Math.PI * 2); g.fill();
    }

    // Tigela de papá pulando
    g.save();
    g.translate(bx, by);
    g.rotate(Math.sin(t * 8) * 0.12);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath(); g.ellipse(0, bowlH / 2 + hop, bowlW * 0.5, R * 0.1, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#c98140';
    g.beginPath(); g.ellipse(0, -bowlH * 0.45, bowlW * 0.42, bowlH * 0.35, 0, Math.PI, 0); g.fill();
    for (let i = -3; i <= 3; i++) {
      g.fillStyle = i % 2 ? '#8f4f22' : '#c98140';
      g.beginPath(); g.arc(i * bowlW * 0.1, -bowlH * 0.55 - Math.cos(i) * bowlH * 0.12, R * 0.08, 0, Math.PI * 2); g.fill();
    }
    const bowlGrad = g.createLinearGradient(0, -bowlH / 2, 0, bowlH / 2);
    bowlGrad.addColorStop(0, '#5f8dff');
    bowlGrad.addColorStop(1, '#2747b8');
    g.fillStyle = bowlGrad;
    g.beginPath();
    g.moveTo(-bowlW / 2, -bowlH / 2);
    g.lineTo(bowlW / 2, -bowlH / 2);
    g.lineTo(bowlW * 0.36, bowlH / 2);
    g.lineTo(-bowlW * 0.36, bowlH / 2);
    g.closePath();
    g.fill();
    g.fillStyle = '#dfe5ec';
    g.fillRect(-bowlW / 2 - R * 0.05, -bowlH / 2 - R * 0.08, bowlW + R * 0.1, R * 0.14);
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.font = `800 ${Math.round(R * 0.26)}px "Baloo 2", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('PAPÁ', 0, bowlH * 0.08);
    g.restore();

    // Linhas de velocidade
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const ly = floorY - legH - R * (0.5 + i * 0.5);
      const off = ((t * 9 + i * 0.7) % 1) * R * 0.4;
      g.beginPath(); g.moveTo(kx - R * 1.3 - off, ly); g.lineTo(kx - R * 2.2 - off, ly); g.stroke();
    }

    // Krug grande correndo: patinhas, rabinho, orelhas e a tampinha rolando
    const ky = floorY - legH - R + Math.abs(Math.sin(t * 16)) * -R * 0.08;
    const run = Math.sin(t * 22);
    g.fillStyle = '#2a1d14';
    [[-0.55, 1], [-0.2, -1], [0.2, 1], [0.55, -1]].forEach(([px, ph]) => {
      const sw = run * ph * R * 0.22;
      g.save();
      g.translate(kx + px * R + sw, ky + R * 0.85);
      g.beginPath(); g.ellipse(0, legH * 0.55, R * 0.11, legH * 0.6, sw / R, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#c98a4b';
      g.beginPath(); g.ellipse(0, legH * 1.05, R * 0.13, R * 0.07, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    });
    // Rabinho abanando
    g.save();
    g.translate(kx - R * 0.9, ky - R * 0.2);
    g.rotate(-0.6 + Math.sin(t * 30) * 0.5);
    g.fillStyle = '#2a1d14';
    g.beginPath(); g.ellipse(-R * 0.25, 0, R * 0.32, R * 0.08, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    // Orelhas balançando
    [[-0.45, -1], [0.45, 1]].forEach(([ox, sgn]) => {
      g.save();
      g.translate(kx + ox * R, ky - R * 0.8);
      g.rotate(sgn * 0.5 + Math.sin(t * 18 + ox) * 0.35);
      g.fillStyle = '#1c130d';
      g.beginPath(); g.ellipse(0, -R * 0.18, R * 0.16, R * 0.3, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    });
    drawCap(g, kx, ky, R, Math.sin(t * 16) * 0.18, IMG.happy || IMG.normal); // balança sem virar a carinha
    // Poeirinha nos pés
    g.fillStyle = 'rgba(255,240,220,.6)';
    for (let i = 0; i < 4; i++) {
      const pt = ((t * 3 + i * 0.25) % 1);
      g.globalAlpha = 1 - pt;
      g.beginPath(); g.arc(kx - R * (0.8 + pt * 1.2), floorY - R * 0.05 - pt * R * 0.3, R * (0.06 + pt * 0.12), 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;

    // Gato gordinho mais à frente no chão (fase 10 em diante): a tigela e o Krug passam atrás dele
    if (level >= 10) {
      const st = cutCat(W, H, t);
      if (st.x < W + st.R * 3) drawCatSide(g, st.x, floorY + R * 0.55, st.R, t, st);
    }

    // Letreiro
    const ta = Math.min(1, t / 0.4) * Math.min(1, (6.0 - t) / 0.4);
    g.globalAlpha = Math.max(0, ta);
    const big = Math.round(Math.min(W * 0.1, 56));
    const titleY = Math.min(H * 0.2, floorY - legH - R * 2.5 - big * 1.4);
    g.font = `800 ${big}px "Baloo 2", system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    g.lineWidth = big * 0.18;
    g.strokeStyle = '#0f2e2c';
    g.strokeText('Corre, Krug!', W / 2, titleY);
    g.fillStyle = '#ffe08a';
    g.fillText('Corre, Krug!', W / 2, titleY);
    const sm = Math.round(big * 0.45);
    g.font = `700 ${sm}px "Baloo 2", system-ui, sans-serif`;
    g.lineWidth = sm * 0.25;
    g.strokeText(`${level} fases completas!`, W / 2, titleY + big * 0.85);
    g.fillStyle = '#fff';
    g.fillText(`${level} fases completas!`, W / 2, titleY + big * 0.85);
    g.globalAlpha = 1;
  }

  function nextLevel() {
    hideAll();
    S.level++;
    startLevel();
  }

  function saveBest() {
    let rec = false;
    if (S.score > S.best) { S.best = S.score; store.set('best', S.best); rec = true; }
    if (S.level > S.bestLevel) { S.bestLevel = S.level; store.set('bestLevel', S.bestLevel); }
    return rec;
  }

  function gameOver() {
    S.mode = 'over';
    saveBest();
    const rec = S.score > S.bestAtStart && S.score > 0;
    Snd.over();
    $('#over-title').textContent = rec ? 'Krug campeão!' : 'O Krug cansou...';
    $('#over-photo').src = rec ? 'assets/foto-recorde.jpg' : 'assets/foto-fim.jpg';
    $('#over-photo').alt = rec ? 'Krug dormindo com o cachecol do Brasil' : 'Krug dormindo no sofá';
    const why = S.lastHurt === 'chocolate' ? 'O chocolate preto fez mal ao Krug.' : 'O má banho venceu desta vez.';
    $('#over-text').textContent = `${why} Você chegou à fase ${S.level} com ${S.score} pontos e ${S.stars} ${S.stars === 1 ? 'estrela' : 'estrelas'}.`;
    $('#over-record').textContent = rec ? 'Novo recorde!' : `Recorde: ${S.best} pontos`;
    setTimeout(() => show('#screen-over'), 400);
  }

  function pause() {
    if (S.mode !== 'play') return;
    S.mode = 'paused';
    show('#screen-pause');
  }
  function resume() {
    if (S.mode !== 'paused') return;
    hideAll();
    S.mode = 'play';
    last = performance.now();
  }

  function show(sel) {
    hideAll();
    $(sel).classList.remove('hidden');
    const b = $(sel).querySelector('.btn');
    if (b) b.focus({ preventScroll: true });
  }
  function hideAll() { document.querySelectorAll('.overlay').forEach((o) => o.classList.add('hidden')); }

  // ---------------------------------------------------------------------------
  // Barra superior
  // ---------------------------------------------------------------------------
  const PAW = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="16" rx="5.2" ry="4.4"/><ellipse cx="5.2" cy="10.4" rx="2.2" ry="2.8"/><ellipse cx="9.3" cy="6.2" rx="2.2" ry="2.9"/><ellipse cx="14.7" cy="6.2" rx="2.2" ry="2.9"/><ellipse cx="18.8" cy="10.4" rx="2.2" ry="2.8"/></svg>';
  const SND_ON = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
  const SND_OFF = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
  let hudCache = '';
  function updateHud() {
    $('#hud-level').textContent = S.level;
    $('#hud-score').textContent = S.score;
    const key = S.lives + '/' + CFG.lives;
    if (key !== hudCache) {
      hudCache = key;
      let h = '';
      for (let i = 0; i < CFG.lives; i++) h += PAW.replace('<svg', i < S.lives ? '<svg' : '<svg class="lost"');
      $('#hud-lives').innerHTML = h;
    }
    $('#hud-shield').classList.toggle('on', !!K.shield);
  }
  function updateSoundBtn() { $('#btn-sound').innerHTML = Snd.on ? SND_ON : SND_OFF; }

  // ---------------------------------------------------------------------------
  // Laço principal
  // ---------------------------------------------------------------------------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function update(dt) {
    S.time += dt;
    if (!L) return;
    const live = S.mode === 'play' || S.mode === 'levelDone';
    if (!live) return;
    if (S.mode === 'play') {
      if (K.scaredT > 0) {
        K.scaredT -= dt;
        if (K.scaredT <= 0) { K.scaredT = 0; afterScare(); }
      }
      S.levelTime += dt;
      if (K.braveT > 0) K.braveT = Math.max(0, K.braveT - dt);
      if (K.shieldPop > 0) K.shieldPop = Math.max(0, K.shieldPop - dt);
      if (K.queue) { K.queueT -= dt; if (K.queueT <= 0) K.queue = null; }
      if (K.invulnT > 0) K.invulnT = Math.max(0, K.invulnT - dt);
      stepKrug(dt);
      stepBaths(dt);
      stepCats(dt);
      if (L.goalMoves) stepBowl(dt);
    }
    if (K.barkShake > 0) K.barkShake = Math.max(0, K.barkShake - dt);
    if (K.happyT > 0) K.happyT = Math.max(0, K.happyT - dt);
    if (K.hopT > 0) K.hopT = Math.max(0, K.hopT - dt);
    if (K.bumpT > 0) K.bumpT = Math.max(0, K.bumpT - dt);
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life += dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 0.96; p.vy *= 0.96;
      if (p.life > p.max) particles.splice(i, 1);
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life += dt;
      f.y -= dt * 0.9;
      if (f.life > f.max) floaters.splice(i, 1);
    }
    if (S.banner) { S.banner.life += dt; if (S.banner.life > S.banner.max) S.banner = null; }
    updateCamera(dt, false);
    const c = $('#courage');
    c.classList.toggle('on', K.braveT > 0);
    $('#courage-bar').style.width = (K.braveT / CFG.braveTime) * 100 + '%';
    $('#hud-score').textContent = S.score;
  }

  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = L ? L.theme.bg : '#134e4a';
    ctx.fillRect(0, 0, vw, vh);
    if (!L || !staticLayer) return;
    const t = S.time;
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    ctx.drawImage(staticLayer, 0, 0, L.W * TS, L.H * TS);

    const inView = (x, y) => (x + 1) * TS > cam.x && x * TS < cam.x + vw && (y + 1) * TS > cam.y && y * TS < cam.y + vh;
    const P = (v) => (v + 0.5) * TS;

    for (const z of L.suns) drawSun(ctx, z, TS, t);
    {
      // A tigela balança antes de fugir e aparece com um "pop" no lugar novo
      const warn = L.bowlWarn > 0 ? 1 - L.bowlWarn / CFG.bowlWarnTime : 0;
      const pop = L.bowlPop > 0 ? L.bowlPop / 0.45 : 0;
      ctx.save();
      ctx.translate(P(L.goal.x), P(L.goal.y));
      if (warn) ctx.rotate(Math.sin(t * 40) * 0.25 * warn);
      const sc = pop ? 1 + Math.sin(pop * Math.PI) * 0.35 - pop * 0.3 : 1;
      ctx.scale(sc, sc);
      drawBowl(ctx, 0, 0, TS, t);
      ctx.restore();
    }

    for (const [i, type] of L.items) {
      const x = i % L.W, y = (i / L.W) | 0;
      if (!inView(x, y)) continue;
      if (type === 'popoca') drawPopoca(ctx, P(x), P(y), TS, t);
      else if (type === 'pao') drawPao(ctx, P(x), P(y), TS, t);
      else if (type === 'ovoBranco') drawEgg(ctx, P(x), P(y), TS, t, false);
      else if (type === 'ovoPreto') drawEgg(ctx, P(x), P(y), TS, t, true);
      else drawCoberta(ctx, P(x), P(y), TS, t);
    }

    for (const b of L.baths) {
      if (b.gone) {
        // O banho foge assustado, encolhendo
        const k = Math.max(0, 1 - (b.goneT || 0) / 0.5);
        if (k <= 0) continue;
        ctx.save();
        ctx.globalAlpha = k;
        drawBath(ctx, P(b.x), P(b.y), TS * k, b.phase, true);
        ctx.restore();
        continue;
      }
      if (!inView(b.x, b.y)) continue;
      drawBath(ctx, P(b.x), P(b.y), TS, b.phase, b.moving);
    }

    // Gatos e o pedaço de corredor que eles vigiam
    for (const c of L.cats) {
      if (c.mode !== 'flee') drawCatSight(ctx, c, TS);
    }
    for (const c of L.cats) drawCat(ctx, P(c.x), P(c.y), TS, c, t);

    // Krug
    let face = IMG.normal;
    if (K.scaredT > 0) face = IMG.scared || face;
    else if (K.barkT > 0) face = IMG.brave || face;
    else if (K.braveT > 0) face = IMG.brave || face;
    else if (K.napT > 0) face = IMG.sleepy || face;
    else if (K.happyT > 0) face = IMG.happy || face;
    let kx = P(K.x), ky = P(K.y);
    if (K.scaredT > 0) { kx += Math.sin(t * 60) * TS * 0.06; ky += Math.cos(t * 47) * TS * 0.04; }
    if (K.barkShake > 0) { const k = K.barkShake / 0.15; ky -= Math.sin(k * Math.PI) * TS * 0.1; }
    let hopScale = 1;
    if (K.hopT > 0) {
      const k = 1 - K.hopT / 0.6;
      const up = Math.sin(k * Math.PI);
      ctx.fillStyle = 'rgba(0,0,0,.18)';
      ctx.beginPath(); ctx.ellipse(kx, ky + TS * 0.2, TS * 0.38 * (1 - up * 0.3), TS * 0.12, 0, 0, Math.PI * 2); ctx.fill();
      ky -= up * TS * 0.55;
      hopScale = 1 + up * 0.15;
    }
    if (K.bumpT > 0) { const b = Math.sin((K.bumpT / 0.18) * Math.PI) * TS * 0.12; kx += K.bumpDir[0] * b; ky += K.bumpDir[1] * b; }
    const blink = K.invulnT > 0 && Math.floor(t * 10) % 2 === 0;
    const braveBlink = K.braveT > 0 && (K.braveT > 2 || Math.floor(t * 8) % 2 === 0);
    ctx.save();
    if (blink) ctx.globalAlpha = 0.35;
    const scale = S.mode === 'levelDone' ? 1 + Math.sin(t * 10) * 0.06 : 1;
    if (K.shield) drawWrap(ctx, kx, ky, TS * 0.47 * scale * (1 + K.shieldPop * 0.6), t);
    drawCap(ctx, kx, ky, TS * 0.47 * scale * hopScale, K.angle, face, { glow: braveBlink });
    if (K.queue && K.moving) drawQueueArrow(ctx, kx, ky, TS * 0.47, K.queue, t);
    ctx.restore();

    // Partículas
    for (const p of particles) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x * TS, p.y * TS, p.size * TS, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Pontos flutuando
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const f of floaters) {
      const a = 1 - f.life / f.max;
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = `800 ${Math.round(TS * 0.45)}px "Baloo 2", system-ui, sans-serif`;
      ctx.lineWidth = Math.max(2, TS * 0.08);
      ctx.strokeStyle = 'rgba(60,30,10,.8)';
      ctx.strokeText(f.text, f.x * TS, f.y * TS);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x * TS, f.y * TS);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Seta apontando para a tigela quando ela está fora da tela
    const gx = P(L.goal.x) - cam.x, gy = P(L.goal.y) - cam.y;
    const margin = 26;
    if (gx < 0 || gy < 0 || gx > vw || gy > vh) {
      const cxs = vw / 2, cys = vh / 2;
      const ang = Math.atan2(gy - cys, gx - cxs);
      const sx = Math.abs(Math.cos(ang)) > 1e-6 ? (vw / 2 - margin) / Math.abs(Math.cos(ang)) : Infinity;
      const sy = Math.abs(Math.sin(ang)) > 1e-6 ? (vh / 2 - margin) / Math.abs(Math.sin(ang)) : Infinity;
      const dd = Math.min(sx, sy);
      const ax = cxs + Math.cos(ang) * dd, ay = cys + Math.sin(ang) * dd;
      const pulse = 1 + Math.sin(t * 6) * 0.08;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.fillStyle = 'rgba(19,78,74,.75)';
      ctx.beginPath(); ctx.arc(0, 0, 20 * pulse, 0, Math.PI * 2); ctx.fill();
      drawBowl(ctx, 0, 0, 30, t);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath(); ctx.moveTo(30 * pulse, 0); ctx.lineTo(20, -8); ctx.lineTo(20, 8); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    drawChip();

    // Faixa de mensagem
    if (S.banner) {
      const b = S.banner;
      const inA = Math.min(1, b.life / 0.2), outA = Math.min(1, (b.max - b.life) / 0.3);
      const a = Math.min(inA, outA);
      ctx.save();
      ctx.globalAlpha = a;
      const y = vh * 0.18;
      const big = Math.round(Math.min(vw * 0.09, 44));
      ctx.font = `800 ${big}px "Baloo 2", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = big * 0.18;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(19,78,74,.9)';
      ctx.strokeText(b.text, vw / 2, y);
      ctx.fillStyle = '#fff';
      ctx.fillText(b.text, vw / 2, y);
      if (b.sub) {
        const sm = Math.round(big * 0.42);
        ctx.font = `700 ${sm}px "Baloo 2", system-ui, sans-serif`;
        ctx.lineWidth = sm * 0.3;
        ctx.strokeText(b.sub, vw / 2, y + big * 0.8);
        ctx.fillText(b.sub, vw / 2, y + big * 0.8);
      }
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------------------
  // Controles
  // ---------------------------------------------------------------------------
  const KEYMAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
  };
  window.addEventListener('keydown', (e) => {
    if (KEYMAP[e.key]) {
      e.preventDefault();
      input(KEYMAP[e.key]);
      return;
    }
    if (e.key === ' ' || e.key === 'Spacebar') {
      if (S.mode === 'play') { e.preventDefault(); stop(); }
      return;
    }
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (S.mode === 'play') pause(); else if (S.mode === 'paused') resume();
    }
  });

  // Deslizar o dedo (sem precisar soltar para virar de novo)
  let swipe = null;
  stage.addEventListener('pointerdown', (e) => {
    Snd.init();
    swipe = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), id: e.pointerId, moved: false };
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    const th = 22;
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    if (Math.abs(dx) > Math.abs(dy)) input(dx > 0 ? 'right' : 'left');
    else input(dy > 0 ? 'down' : 'up');
    swipe.moved = true;
    swipe.x = e.clientX;
    swipe.y = e.clientY;
  });
  const endSwipe = () => { swipe = null; };
  stage.addEventListener('pointerup', (e) => {
    // Toque rápido sem arrastar: para o Krug
    if (swipe && !swipe.moved && performance.now() - swipe.t0 < 300
      && Math.hypot(e.clientX - swipe.x0, e.clientY - swipe.y0) < 12) stop();
    endSwipe();
  });
  stage.addEventListener('pointercancel', endSwipe);

  document.querySelectorAll('#dpad button').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('pressed');
      if (b.dataset.dir === 'stop') stop(); else input(b.dataset.dir);
    });
    const up = () => b.classList.remove('pressed');
    b.addEventListener('pointerup', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('pointercancel', up);
  });

  const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  if (isTouch) {
    CFG.minTile = 30;
    document.documentElement.classList.add('touch');
    $('#controls-hint').textContent = 'Deslize o dedo na tela ou use o direcional. A tampinha rola reto até bater na parede; escolha outra direção e ela vira assim que puder. Para parar, use o botão do meio ou dê um toque rápido no labirinto.';
  }

  $('#btn-play').addEventListener('click', () => { Snd.init(); newGame(); });
  $('#title-cap').addEventListener('pointerdown', (e) => {
    Snd.init();
    const c = e.currentTarget;
    c.classList.remove('wiggle');
    void c.offsetWidth;
    c.classList.add('wiggle');
    setTimeout(() => Snd.bark(), 30);
  });
  $('#btn-again').addEventListener('click', () => { Snd.init(); newGame(); });
  $('#btn-next').addEventListener('click', () => {
    Snd.init();
    if (S.level % 5 === 0) playCutscene(S.level).then(nextLevel);
    else nextLevel();
  });
  $('#btn-pause').addEventListener('click', () => { if (S.mode === 'play') pause(); else resume(); });
  $('#btn-resume').addEventListener('click', resume);
  $('#btn-restart').addEventListener('click', () => { Snd.init(); newGame(); });
  $('#btn-sound').addEventListener('click', () => {
    Snd.on = !Snd.on;
    store.set('sound', Snd.on);
    Snd.init();
    updateSoundBtn();
    if (Snd.on) Snd.popoca();
  });
  document.querySelectorAll('.btn, .icon-btn').forEach((b) => b.addEventListener('keydown', (e) => {
    if (KEYMAP[e.key]) e.stopPropagation();
  }));

  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 200));

  // ---------------------------------------------------------------------------
  // Início
  // ---------------------------------------------------------------------------
  function drawIcons() {
    document.querySelectorAll('canvas[data-icon]').forEach((c) => {
      const s = 40, r = 2;
      c.width = s * r; c.height = s * r;
      const g = c.getContext('2d');
      g.scale(r, r);
      const type = c.dataset.icon;
      if (type === 'bowl') drawBowl(g, s / 2, s / 2, s * 0.95, 1.5);
      if (type === 'popoca') drawPopoca(g, s / 2, s / 2, s * 0.95, 0);
      if (type === 'pao') drawPao(g, s / 2, s / 2, s * 1.1, 0);
      if (type === 'bath') drawBath(g, s / 2, s / 2, s * 1.05, 0);
      if (type === 'coberta') drawCoberta(g, s / 2, s / 2, s * 1.1, 0);
      if (type === 'ovoBranco') drawEgg(g, s / 2, s / 2, s * 1.1, 0, false);
      if (type === 'ovoPreto') drawEgg(g, s / 2, s / 2, s * 1.1, 0, true);
      if (type === 'cat') drawCat(g, s / 2 + 2, s / 2, s * 0.95, { face: -0.4, mode: 'sit', puff: 0, phase: 2 }, 0);
      if (type === 'sun') { g.fillStyle = '#c99a6b'; g.fillRect(0, 0, s, s); drawSunRect(g, 4, 4, s - 8, s - 8, s * 0.8, 0.5); }
    });
    const tc = $('#title-cap');
    const size = 120, r = 2;
    tc.width = size * r; tc.height = size * r;
    const g = tc.getContext('2d');
    g.scale(r, r);
    drawCap(g, size / 2 - 3, size / 2 - 4, size * 0.42, 0, IMG.normal);
  }

  function boot() {
    Snd.init(false); // já decodifica os latidos; o som só liga no primeiro toque
    layout();
    updateHud();
    updateSoundBtn();
    drawIcons();
    if (S.best > 0) $('#start-record').textContent = `Recorde: ${S.best} pontos (até a fase ${S.bestLevel})`;
    requestAnimationFrame((t) => { last = t; frame(t); });
  }
  imagesReady.then(boot);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (L) render(); });

  // Acesso para testes automatizados
  window.__krug = { S, K, get L() { return L; }, input, stop, newGame, nextLevel, playCutscene, buildLevel, CFG, drawCap, IMG, Snd };
})();
