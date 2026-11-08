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
    speed: 8.5,          // casas por segundo da tampinha
    lives: 3,
    braveTime: 7,        // segundos de coragem depois do pão do queijo
    scaredTime: 1.1,     // segundos tremendo depois do má banho
    invulnTime: 2,       // segundos piscando depois de voltar ao começo
    minTile: 24,         // tamanho mínimo da casa em pixels CSS
    maxTile: 64,
    hitRadius: 0.62,     // distância (em casas) para encostar no banho
    pts: { popoca: 10, pao: 50, bathScared: 30, bowl: 100 },
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

    // Má banho parado: nunca pode bloquear todos os caminhos
    const blocked = new Set();
    const pathOk = () => {
      const d = bfs(m, 1, 1, blocked);
      return d[goalIdx] >= 0 && paoIdx.every((p) => d[p] >= 0);
    };
    const baths = [];
    const nStatic = Math.min(1 + Math.floor(n * 0.8), 16);
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
      const segs = [];
      const scan = (horizontal) => {
        const A = horizontal ? H : W, B = horizontal ? W : H;
        for (let a = 1; a < A - 1; a++) {
          let run = [];
          for (let b = 0; b < B; b++) {
            const x = horizontal ? b : a, y = horizontal ? a : b;
            if (m.g[y][x] === 0) run.push([x, y]);
            else { if (run.length >= 3) segs.push({ tiles: run, horizontal }); run = []; }
          }
        }
      };
      scan(true);
      scan(false);
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

    // Popoca espalhada pelo resto do labirinto
    const bathSet = new Set(baths.filter((b) => !b.moving).map((b) => idx(b.x, b.y)));
    const nPop = Math.round(cells.length * 0.28);
    let pc = 0;
    for (const c of pool) {
      if (pc >= nPop) break;
      if (items.has(c) || bathSet.has(c)) continue;
      items.set(c, 'popoca');
      pc++;
    }

    return {
      n, m, W, H, g: m.g, start: { x: 1, y: 1 },
      goal: { x: goalIdx % W, y: (goalIdx / W) | 0 },
      items, baths, idx,
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
    banner: null,
  };
  let L = null;             // fase atual
  const K = {               // a tampinha do Krug
    cx: 1, cy: 1, x: 1, y: 1, dir: null, prog: 0, moving: false, queue: null,
    angle: 0, scaredT: 0, braveT: 0, invulnT: 0, happyT: 0, bumpT: 0, bumpDir: [0, 0],
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

  // Chão de madeira e paredes de almofada verde-água (como o puff do Krug)
  function buildStaticLayer() {
    const c = document.createElement('canvas');
    c.width = Math.ceil(L.W * TS * dpr);
    c.height = Math.ceil(L.H * TS * dpr);
    const g = c.getContext('2d');
    g.scale(dpr, dpr);
    const W = L.W, H = L.H, s = TS;

    // Chão
    g.fillStyle = '#c99a6b';
    g.fillRect(0, 0, W * s, H * s);
    const ph = s * 0.5;
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
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

    const isWall = (x, y) => x >= 0 && y >= 0 && x < W && y < H && L.g[y][x] === 1;
    const lift = s * 0.14;

    // Sombra das paredes
    g.fillStyle = 'rgba(40,20,5,.28)';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (isWall(x, y)) g.fillRect(x * s + s * 0.12, y * s + s * 0.16, s, s);
    }
    // Lateral (mais escura)
    g.fillStyle = '#1a7a70';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (isWall(x, y)) g.fillRect(x * s, y * s, s, s);
    // Topo da almofada
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!isWall(x, y)) continue;
      g.fillStyle = '#33bfae';
      g.fillRect(x * s, y * s - lift, s, s);
    }
    // Brilho e costura nas bordas que dão para o chão
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!isWall(x, y)) continue;
      const top = y * s - lift;
      if (!isWall(x, y - 1)) { g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(x * s, top, s, Math.max(2, s * 0.08)); }
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

  function input(name) {
    Snd.init();
    if (S.mode !== 'play') return;
    const d = DIRS[name];
    if (!d || K.scaredT > 0) return;
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
    } else {
      K.queue = d; // vira no próximo cruzamento em que der
    }
  }

  /** Decide o que fazer ao chegar numa casa: virar, seguir o corredor ou parar. */
  function decide() {
    if (K.queue) {
      const q = K.queue;
      if (isOpen(K.cx, K.cy, q)) { K.queue = null; return q; }
    }
    const open = D4.filter((d) => isOpen(K.cx, K.cy, d));
    if (open.length >= 3) { K.queue = null; return null; }        // cruzamento: para
    const forward = open.filter((d) => !opposite(d, K.dir));
    if (forward.length === 1) return forward[0];                 // corredor ou curva: segue
    K.queue = null;
    return null;                                                 // beco: para
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
    }
    if (K.cx === L.goal.x && K.cy === L.goal.y) levelDone();
  }

  function stepKrug(dt) {
    if (K.scaredT > 0) return;
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
        if (S.mode !== 'play') { K.moving = false; break; }
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
        } else if (K.invulnT <= 0) {
          hit(b);
        }
      }
    }
  }

  function hit(b) {
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
    if (S.lives <= 0) { gameOver(); return; }
    K.cx = L.start.x; K.cy = L.start.y; K.x = K.cx; K.y = K.cy;
    K.prog = 0; K.dir = null;
    K.invulnT = CFG.invulnTime;
  }

  // ---------------------------------------------------------------------------
  // Fluxo do jogo
  // ---------------------------------------------------------------------------
  function startLevel() {
    L = buildLevel(S.level);
    Object.assign(K, {
      cx: L.start.x, cy: L.start.y, x: L.start.x, y: L.start.y, dir: null, prog: 0, moving: false,
      queue: null, angle: 0, scaredT: 0, braveT: 0, invulnT: 0, happyT: 0, bumpT: 0,
    });
    particles.length = 0;
    floaters.length = 0;
    layout();
    S.mode = 'play';
    banner('Fase ' + S.level, S.level === 1 ? 'Leve o Krug até a tigela de papá' : '');
    Snd.bark(0.1);
    updateHud();
  }

  function newGame() {
    S.level = 1;
    S.score = 0;
    S.lives = CFG.lives;
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
    let extra = '';
    if (S.level % 3 === 0 && S.lives < CFG.lives) { S.lives++; extra = ' e uma patinha de volta'; }
    updateHud();
    saveBest();
    $('#level-text').textContent = `Fase ${S.level} concluída. O Krug chegou à tigela de papá!`;
    $('#level-bonus').textContent = `+${bonus} pontos${extra}`;
    setTimeout(() => show('#screen-level'), 900);
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
    $('#over-text').textContent = `O má banho venceu desta vez. Você chegou à fase ${S.level} com ${S.score} pontos.`;
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
      if (K.braveT > 0) K.braveT = Math.max(0, K.braveT - dt);
      if (K.invulnT > 0) K.invulnT = Math.max(0, K.invulnT - dt);
      stepKrug(dt);
      stepBaths(dt);
    }
    if (K.happyT > 0) K.happyT = Math.max(0, K.happyT - dt);
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
    ctx.fillStyle = '#134e4a';
    ctx.fillRect(0, 0, vw, vh);
    if (!L || !staticLayer) return;
    const t = S.time;
    ctx.save();
    ctx.translate(-Math.round(cam.x), -Math.round(cam.y));
    ctx.drawImage(staticLayer, 0, 0, L.W * TS, L.H * TS);

    const inView = (x, y) => (x + 1) * TS > cam.x && x * TS < cam.x + vw && (y + 1) * TS > cam.y && y * TS < cam.y + vh;
    const P = (v) => (v + 0.5) * TS;

    drawBowl(ctx, P(L.goal.x), P(L.goal.y), TS, t);

    for (const [i, type] of L.items) {
      const x = i % L.W, y = (i / L.W) | 0;
      if (!inView(x, y)) continue;
      if (type === 'popoca') drawPopoca(ctx, P(x), P(y), TS, t);
      else drawPao(ctx, P(x), P(y), TS, t);
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

    // Krug
    let face = IMG.normal;
    if (K.scaredT > 0) face = IMG.scared || face;
    else if (K.braveT > 0) face = IMG.brave || face;
    else if (K.happyT > 0) face = IMG.happy || face;
    let kx = P(K.x), ky = P(K.y);
    if (K.scaredT > 0) { kx += Math.sin(t * 60) * TS * 0.06; ky += Math.cos(t * 47) * TS * 0.04; }
    if (K.bumpT > 0) { const b = Math.sin((K.bumpT / 0.18) * Math.PI) * TS * 0.12; kx += K.bumpDir[0] * b; ky += K.bumpDir[1] * b; }
    const blink = K.invulnT > 0 && Math.floor(t * 10) % 2 === 0;
    const braveBlink = K.braveT > 0 && (K.braveT > 2 || Math.floor(t * 8) % 2 === 0);
    ctx.save();
    if (blink) ctx.globalAlpha = 0.35;
    const scale = S.mode === 'levelDone' ? 1 + Math.sin(t * 10) * 0.06 : 1;
    drawCap(ctx, kx, ky, TS * 0.47 * scale, K.angle, face, { glow: braveBlink });
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
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (S.mode === 'play') pause(); else if (S.mode === 'paused') resume();
    }
  });

  // Deslizar o dedo (sem precisar soltar para virar de novo)
  let swipe = null;
  stage.addEventListener('pointerdown', (e) => {
    Snd.init();
    swipe = { x: e.clientX, y: e.clientY, id: e.pointerId };
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
  });
  stage.addEventListener('pointermove', (e) => {
    if (!swipe || e.pointerId !== swipe.id) return;
    const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y;
    const th = 22;
    if (Math.abs(dx) < th && Math.abs(dy) < th) return;
    if (Math.abs(dx) > Math.abs(dy)) input(dx > 0 ? 'right' : 'left');
    else input(dy > 0 ? 'down' : 'up');
    swipe.x = e.clientX;
    swipe.y = e.clientY;
  });
  const endSwipe = () => { swipe = null; };
  stage.addEventListener('pointerup', endSwipe);
  stage.addEventListener('pointercancel', endSwipe);

  document.querySelectorAll('#dpad button').forEach((b) => {
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      b.classList.add('pressed');
      input(b.dataset.dir);
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
    $('#controls-hint').textContent = 'Deslize o dedo na tela ou use o direcional. A tampinha rola pelo corredor e para no próximo cruzamento.';
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
  $('#btn-next').addEventListener('click', () => { Snd.init(); nextLevel(); });
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
  window.__krug = { S, K, get L() { return L; }, input, newGame, nextLevel, buildLevel, CFG, drawCap, IMG, Snd };
})();
