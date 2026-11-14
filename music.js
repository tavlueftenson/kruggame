/*
 * The Game of Krug: músicas originais, sintetizadas na hora com Web Audio.
 * Sequenciador, instrumentos e as seis músicas (KRUG_SONGS).
 */
(function (root) {
  'use strict';
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function freq(n) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(n);
    if (!m) throw new Error('nota inválida: ' + n);
    const midi = 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  /** "C5 . E5 - G5+B5" -> eventos { step, notes, len } (um token por passo; "-" segura, "." é pausa). */
  function parse(str) {
    const toks = str.trim().split(/\s+/);
    const ev = [];
    toks.forEach((tk, i) => {
      if (tk === '.') return;
      if (tk === '-') { if (ev.length) ev[ev.length - 1].len++; return; }
      ev.push({ step: i, notes: tk === 'x' || tk === 'o' ? [tk] : tk.split('+'), len: 1 });
    });
    return { ev, steps: toks.length };
  }

  // ---------------------------------------------------------------- instrumentos
  function env(ac, g, t, a, peak, dec, end) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
    return t + a + dec + (end || 0.02);
  }
  function osc(ac, type, f, t, stop, out, detune) {
    const o = ac.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    o.connect(out); o.start(t); o.stop(stop);
    return o;
  }
  function noiseBuf(ac) {
    if (ac.__noise) return ac.__noise;
    const b = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    ac.__noise = b;
    return b;
  }
  function noise(ac, t, dur, type, f, q, out) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf(ac);
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    s.connect(fl).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  const INST = {
    // Violão/ukulele dedilhado: dente de serra com filtro que fecha rápido
    pluck(ac, out, t, f, dur, v) {
      const g = ac.createGain(); g.connect(out);
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 2;
      fl.frequency.setValueAtTime(Math.min(9000, f * 9), t);
      fl.frequency.exponentialRampToValueAtTime(Math.max(300, f * 1.4), t + 0.3);
      fl.connect(g);
      const end = env(ac, g, t, 0.004, 0.22 * v, Math.min(1.4, dur + 0.35));
      osc(ac, 'sawtooth', f, t, end, fl, 0);
      osc(ac, 'triangle', f, t, end, fl, 7);
    },
    // Ukulele mais curtinho e brilhante, para acordes
    uke(ac, out, t, f, dur, v) {
      const g = ac.createGain(); g.connect(out);
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 3;
      fl.frequency.setValueAtTime(Math.min(9000, f * 7), t);
      fl.frequency.exponentialRampToValueAtTime(Math.max(400, f * 1.5), t + 0.18);
      fl.connect(g);
      const end = env(ac, g, t, 0.003, 0.13 * v, 0.32);
      osc(ac, 'sawtooth', f, t, end, fl);
    },
    // Glockenspiel / sininho
    bell(ac, out, t, f, dur, v) {
      [[1, 0.2, 1.3], [2.76, 0.06, 0.5], [5.4, 0.025, 0.25]].forEach(([m, a, d]) => {
        const g = ac.createGain(); g.connect(out);
        osc(ac, 'sine', f * m, t, env(ac, g, t, 0.002, a * v, d), g);
      });
    },
    // Caixinha de música
    musicbox(ac, out, t, f, dur, v) {
      [[1, 0.2, 1.8], [4, 0.05, 0.35], [3, 0.03, 0.6]].forEach(([m, a, d]) => {
        const g = ac.createGain(); g.connect(out);
        osc(ac, 'sine', f * m, t, env(ac, g, t, 0.002, a * v, d), g);
      });
    },
    // Marimba de madeira
    marimba(ac, out, t, f, dur, v) {
      [[1, 0.26, 0.45], [3.93, 0.07, 0.07], [9.2, 0.02, 0.03]].forEach(([m, a, d]) => {
        const g = ac.createGain(); g.connect(out);
        osc(ac, 'sine', f * m, t, env(ac, g, t, 0.002, a * v, d), g);
      });
    },
    // Vibrafone, com tremolo
    vibes(ac, out, t, f, dur, v) {
      const g = ac.createGain(); g.connect(out);
      const trem = ac.createGain(); trem.gain.value = 1; trem.connect(g);
      const l = ac.createOscillator(); l.frequency.value = 5.2;
      const lg = ac.createGain(); lg.gain.value = 0.25; l.connect(lg).connect(trem.gain);
      const end = env(ac, g, t, 0.004, 0.16 * v, Math.min(2.2, dur + 0.9));
      l.start(t); l.stop(end);
      osc(ac, 'sine', f, t, end, trem);
      const g2 = ac.createGain(); g2.connect(out);
      osc(ac, 'sine', f * 4, t, env(ac, g2, t, 0.002, 0.02 * v, 0.2), g2);
    },
    // Flautinha com vibrato
    flute(ac, out, t, f, dur, v) {
      const g = ac.createGain(); g.connect(out);
      const hold = Math.max(0.08, dur - 0.04);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.13 * v, t + 0.05);
      g.gain.setValueAtTime(0.11 * v, t + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.14);
      const end = t + hold + 0.16;
      const o = osc(ac, 'sine', f, t, end, g);
      const o2 = osc(ac, 'triangle', f * 2, t, end, (() => { const h = ac.createGain(); h.gain.value = 0.12; h.connect(g); return h; })());
      const l = ac.createOscillator(); l.frequency.value = 5.5;
      const lg = ac.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.007, t + 0.25);
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(end);
      noise(ac, t, 0.06, 'bandpass', f * 2, 2, (() => { const h = ac.createGain(); h.gain.value = 0.03 * v; h.connect(out); return h; })());
    },
    // Videogame antigo: onda quadrada suave
    square(ac, out, t, f, dur, v) {
      const g = ac.createGain(); g.connect(out);
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 3200; fl.connect(g);
      const hold = Math.max(0.05, dur * 0.85);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07 * v, t + 0.005);
      g.gain.setValueAtTime(0.05 * v, t + hold);
      g.gain.exponentialRampToValueAtTime(0.0001, t + hold + 0.06);
      osc(ac, 'square', f, t, t + hold + 0.08, fl);
    },
    // Baixo redondinho
    bass(ac, out, t, f, dur, v) {
      const g = ac.createGain(); g.connect(out);
      const end = env(ac, g, t, 0.006, 0.32 * v, Math.min(0.9, dur + 0.15));
      osc(ac, 'triangle', f, t, end, g);
      osc(ac, 'sine', f, t, end, g);
    },
    // Baixo pizzicato (curtinho)
    pizz(ac, out, t, f, dur, v) {
      const g = ac.createGain(); g.connect(out);
      const end = env(ac, g, t, 0.004, 0.34 * v, 0.22);
      osc(ac, 'triangle', f, t, end, g);
      osc(ac, 'sine', f * 2, t, end, (() => { const h = ac.createGain(); h.gain.value = 0.2; h.connect(g); return h; })());
    },
    // Fundo macio de acordes
    pad(ac, out, t, f, dur, v) {
      const g = ac.createGain(); g.connect(out);
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1100; fl.connect(g);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035 * v, t + 0.35);
      g.gain.setValueAtTime(0.035 * v, t + Math.max(0.36, dur));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6);
      const end = t + dur + 0.65;
      osc(ac, 'triangle', f, t, end, fl, -7);
      osc(ac, 'triangle', f, t, end, fl, 7);
    },
  };

  const DRUM = {
    kick(ac, out, t, v) {
      const g = ac.createGain(); g.connect(out);
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      o.connect(g); env(ac, g, t, 0.003, 0.5 * v, 0.24); o.start(t); o.stop(t + 0.3);
    },
    snare(ac, out, t, v) {
      const g = ac.createGain(); g.connect(out); env(ac, g, t, 0.002, 0.16 * v, 0.14);
      noise(ac, t, 0.16, 'bandpass', 2200, 0.8, g);
    },
    hat(ac, out, t, v) {
      const g = ac.createGain(); g.connect(out); env(ac, g, t, 0.001, 0.06 * v, 0.035);
      noise(ac, t, 0.05, 'highpass', 8000, 0.7, g);
    },
    shaker(ac, out, t, v) {
      const g = ac.createGain(); g.connect(out);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * v, t + 0.025); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      noise(ac, t, 0.1, 'bandpass', 6500, 1.2, g);
    },
    wood(ac, out, t, v) {
      const g = ac.createGain(); g.connect(out);
      const o = ac.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(1250, t); o.frequency.exponentialRampToValueAtTime(950, t + 0.04);
      o.connect(g); env(ac, g, t, 0.001, 0.16 * v, 0.06); o.start(t); o.stop(t + 0.1);
    },
    rim(ac, out, t, v) {
      const g = ac.createGain(); g.connect(out); env(ac, g, t, 0.001, 0.12 * v, 0.04);
      noise(ac, t, 0.05, 'bandpass', 3200, 3, g);
      const g2 = ac.createGain(); g2.connect(out);
      osc(ac, 'triangle', 1750, t, env(ac, g2, t, 0.001, 0.06 * v, 0.03), g2);
    },
    // Panelinha / colher batendo
    clink(ac, out, t, v) {
      [2637, 3951, 5274].forEach((f, i) => {
        const g = ac.createGain(); g.connect(out);
        osc(ac, 'sine', f, t, env(ac, g, t, 0.001, (0.05 - i * 0.012) * v, 0.25 - i * 0.05), g);
      });
    },
    // Bolha subindo
    bubble(ac, out, t, v) {
      const g = ac.createGain(); g.connect(out);
      const o = ac.createOscillator(); o.type = 'sine';
      const f0 = 380 + Math.random() * 200;
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 2.6, t + 0.07);
      o.connect(g); env(ac, g, t, 0.004, 0.11 * v, 0.07); o.start(t); o.stop(t + 0.12);
    },
  };

  /**
   * Prepara a música para tocar passo a passo: para cada passo, a lista de
   * notas e batidas que começam nele.
   * song: { bpm, div, swing, tracks: [{ inst, vol, oct, strum, pattern }], drums: { nome: pattern } }
   */
  function compile(song) {
    const sd = 60 / song.bpm / (song.div || 2);
    let steps = 0;
    const parsed = song.tracks.map((tr) => { const p = parse(tr.pattern); steps = Math.max(steps, p.steps); return [tr, p]; });
    const dp = Object.entries(song.drums || {}).map(([n, pat]) => { const p = parse(pat); steps = Math.max(steps, p.steps); return [n, p]; });
    const byStep = Array.from({ length: steps }, () => []);
    for (const [tr, p] of parsed) {
      const fn = INST[tr.inst];
      const mul = Math.pow(2, tr.oct || 0);
      for (const e of p.ev) {
        e.notes.forEach((n, k) => {
          const f = freq(n) * mul, dur = e.len * sd, off = (tr.delay || 0) + k * (tr.strum || 0), v = tr.vol || 1;
          byStep[e.step].push((ac, out, t) => fn(ac, out, t + off, f, dur, v));
        });
      }
    }
    for (const [n, p] of dp) {
      for (const e of p.ev) {
        const v = e.notes[0] === 'o' ? 0.55 : 1;
        byStep[e.step].push((ac, out, t) => DRUM[n](ac, out, t, v));
      }
    }
    return { sd, steps, swing: song.swing || 0, byStep, duration: sd * steps };
  }

  /** Agenda uma passada inteira a partir de t0 (usado para gerar as amostras). */
  function schedule(ac, out, song, t0) {
    const c = song.__c || (song.__c = compile(song));
    for (let i = 0; i < c.steps; i++) {
      const t = t0 + i * c.sd + (i % 2 ? c.swing * c.sd : 0);
      for (const fn of c.byStep[i]) fn(ac, out, t);
    }
    return c.duration;
  }

  /**
   * Toca a música em repetição, agendando só um pouquinho à frente, para que
   * parar ou trocar de música seja quase imediato. Chame tick() a cada quadro.
   */
  function Player(ac, dest, song, vol, fadeIn = 0.5) {
    const c = song.__c || (song.__c = compile(song));
    const gain = ac.createGain();
    gain.connect(dest);
    const now = ac.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(vol, now + fadeIn);
    let pos = 0, next = now + 0.06, stopped = false, level = vol;
    return {
      gain,
      get level() { return level; },
      tick() {
        if (stopped) return;
        const t = ac.currentTime;
        if (next < t) { next = t + 0.03; } // a aba ficou parada: não tenta recuperar o atraso
        while (next < t + 0.35) {
          const at = next + (pos % 2 ? c.swing * c.sd : 0);
          for (const fn of c.byStep[pos]) fn(ac, gain, at);
          pos = (pos + 1) % c.steps;
          next += c.sd;
        }
      },
      /** Muda o volume suavemente (0 deixa tocando em silêncio). */
      fade(to, time = 0.4) {
        if (Math.abs(to - level) < 1e-4) return;
        level = to;
        const t = ac.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(Math.max(0.0001, to), t + time);
      },
      stop(time = 0.5) {
        if (stopped) return;
        this.fade(0, time);
        stopped = true;
        setTimeout(() => { try { gain.disconnect(); } catch (e) { /* já desligado */ } }, (time + 2.5) * 1000);
      },
    };
  }

  root.KrugMusic = { schedule, compile, Player, parse, freq, INST, DRUM };
})(typeof window !== 'undefined' ? window : globalThis);

/*
 * Músicas do jogo: uma por cômodo, a da tela de abertura e a da coragem.
 * Um token por passo; "-" segura a nota; "." é pausa; "+" junta notas num acorde.
 */
(function (root) {
  const J = (...bars) => bars.join('  ');
  const R = (bar, n) => Array(n).fill(bar).join('  ');

  const SONGS = {};

  // 1. Passeio na sala: ukulele e sininho, dó maior, balançadinho
  {
    const C = 'C4+E4+G4', Am = 'C4+E4+A4', F = 'C4+F4+A4', G = 'B3+D4+G4', Em = 'B3+E4+G4';
    const strum = (a, b) => `. . ${a} . . ${a} ${b || a} .`;
    SONGS.sala = {
      title: 'Passeio na sala', bpm: 112, div: 2, swing: 0.22,
      tracks: [
        { inst: 'pluck', vol: 1.1, pattern: J(
          'E5 . G5 . E5 D5 C5 .', 'A4 . C5 . E5 - . .', 'F5 . E5 . D5 . C5 .', 'D5 - B4 . G4 - . .',
          'E5 . G5 . C6 . G5 .', 'A5 . G5 . E5 . C5 .', 'A5 . F5 . D5 . B4 .', 'C5 - - - . . . .',
          // parte B
          'A5 . A5 . G5 . F5 .', 'G5 . F5 . E5 . D5 .', 'E5 . G5 . B5 . G5 .', 'A5 - - . . . . .',
          'F5 . A5 . C6 . A5 .', 'B5 . D6 . B5 . G5 .', 'G5 . E5 . A5 . C6 .', 'B5 - D6 - G5 - . .') },
        { inst: 'bell', vol: 0.8, oct: 1, pattern: J(
          '. . . . . . . .', '. . . . . . . .', '. . . . . . . .', '. . . . . . . .',
          'E5 . G5 . C6 . G5 .', 'A5 . G5 . E5 . C5 .', 'A5 . F5 . D5 . B4 .', 'C5 - - - . . . .',
          '. . . . . . . .', '. . . . . . . .', '. . . . . . . .', '. . . . . . . .',
          'F5 . A5 . C6 . A5 .', 'B5 . D6 . B5 . G5 .', 'G5 . E5 . A5 . C6 .', 'B5 - D6 - G5 - . .') },
        { inst: 'uke', vol: 0.9, strum: 0.012, pattern: J(strum(C), strum(Am), strum(F), strum(G), strum(C), strum(Am), `. . ${F} . . ${G} ${G} .`, strum(C),
          strum(F), strum(G), strum(Em), strum(Am), strum(F), strum(G), `. . ${Em} . . ${Am} ${Am} .`, strum(G)) },
        { inst: 'bass', vol: 1, pattern: J(
          'C3 . G2 . C3 . G2 .', 'A2 . E2 . A2 . E2 .', 'F2 . C3 . F2 . C3 .', 'G2 . D3 . G2 . D3 .',
          'C3 . G2 . C3 . G2 .', 'A2 . E2 . A2 . E2 .', 'F2 . C3 . G2 . D3 .', 'C3 . G2 . C3 . . .',
          'F2 . C3 . F2 . C3 .', 'G2 . D3 . G2 . D3 .', 'E2 . B2 . E2 . B2 .', 'A2 . E3 . A2 . E3 .',
          'F2 . C3 . F2 . C3 .', 'G2 . D3 . G2 . D3 .', 'E2 . B2 . A2 . E3 .', 'G2 . D3 . G2 . B2 .') },
      ],
      drums: {
        kick: R('x . . . x . . .', 16),
        shaker: R('o x o x o x o x', 16),
        snare: R('. . o . . . o .', 16),
      },
    };
  }

  // 2. Soneca no quarto: caixinha de música em valsa, fá maior, devagarzinho
  {
    SONGS.quarto = {
      title: 'Soneca no quarto', bpm: 84, div: 2, swing: 0,
      tracks: [
        { inst: 'musicbox', vol: 1, pattern: J(
          'C6 - A5 - F5 -', 'D6 - C6 - A5 -', 'Bb5 - D6 - F5 -', 'G5 - - - E5 -',
          'C6 - A5 - F5 -', 'D6 - F6 - D6 -', 'C6 - Bb5 - E5 -', 'F5 - - - . .',
          'D6 - - - Bb5 -', 'C6 - - - A5 -', 'Bb5 - A5 - G5 -', 'E5 - G5 - C6 -',
          'D6 - F6 - D6 -', 'C6 - A5 - F5 -', 'G5 - Bb5 - E5 -', 'G5 - - - . .') },
        { inst: 'musicbox', vol: 0.55, pattern: J(
          'F4 C5 A4 C5 A4 C5', 'D4 A4 F4 A4 F4 A4', 'Bb3 F4 D4 F4 D4 F4', 'C4 G4 E4 G4 Bb4 G4',
          'F4 C5 A4 C5 A4 C5', 'D4 A4 F4 A4 F4 A4', 'G3 D4 Bb4 C4 G4 Bb4', 'F4 C5 A4 F4 . .',
          'Bb3 F4 D4 F4 D4 F4', 'F4 C5 A4 C5 A4 C5', 'G3 D4 Bb4 D4 Bb4 D4', 'C4 G4 E4 G4 E4 G4',
          'Bb3 F4 D4 F4 D4 F4', 'A3 F4 C5 F4 C5 F4', 'G3 D4 Bb4 C4 G4 E4', 'C4 G4 E4 G4 Bb4 G4') },
        { inst: 'pad', vol: 1, pattern: J(
          'F3+A3+C4 - - - - -', 'D3+F3+A3 - - - - -', 'Bb2+D3+F3 - - - - -', 'C3+E3+G3 - - - - -',
          'F3+A3+C4 - - - - -', 'D3+F3+A3 - - - - -', 'G2+Bb2+D3 - - C3+E3+G3 - -', 'F3+A3+C4 - - - - -',
          'Bb2+D3+F3 - - - - -', 'F3+A3+C4 - - - - -', 'G2+Bb2+D3 - - - - -', 'C3+E3+G3 - - - - -',
          'Bb2+D3+F3 - - - - -', 'A2+C3+F3 - - - - -', 'G2+Bb2+D3 - - C3+E3+G3 - -', 'C3+E3+Bb3 - - - - -') },
        { inst: 'bass', vol: 0.6, pattern: J('F2 - - . . .', 'D2 - - . . .', 'Bb1 - - . . .', 'C2 - - . . .', 'F2 - - . . .', 'D2 - - . . .', 'G1 - - C2 - -', 'F2 - - . . .',
          'Bb1 - - . . .', 'F2 - - . . .', 'G1 - - . . .', 'C2 - - . . .', 'Bb1 - - . . .', 'A1 - - . . .', 'G1 - - C2 - -', 'C2 - - . . .') },
      ],
      drums: {},
    };
  }

  // 3. Cozinha animada: marimba saltitante, pizzicato e panelinhas, sol maior
  {
    SONGS.cozinha = {
      title: 'Cozinha animada', bpm: 126, div: 2, swing: 0.12,
      tracks: [
        { inst: 'marimba', vol: 1.1, pattern: J(
          'G5 G5 . B5 . D6 . B5', 'E5 E5 . G5 . B5 . G5', 'C6 . B5 . A5 . G5 .', 'F#5 . A5 . D6 - . .',
          'G5 G5 . B5 . D6 . G6', 'E6 . D6 . B5 . G5 .', 'C6 . E6 . D6 . F#5 .', 'G5 . D5 . G5 - . .',
          'E6 E6 . D6 . C6 . E6', 'D6 D6 . C6 . A5 . F#5', 'B5 . D6 . F#6 . D6 .', 'E6 - - . G5 . B5 .',
          'C6 C6 . E6 . G6 . E6', 'F#6 . E6 . D6 . A5 .', 'C6 . A5 . D6 . F#6 .', 'A6 - - . F#6 . D6 .') },
        { inst: 'marimba', vol: 0.5, pattern: J(
          '. B4+D5 . B4+D5 . B4+D5 . B4+D5', '. G4+B4 . G4+B4 . G4+B4 . G4+B4', '. E4+G4 . E4+G4 . E4+G4 . E4+G4', '. F#4+A4 . F#4+A4 . F#4+A4 . F#4+A4',
          '. B4+D5 . B4+D5 . B4+D5 . B4+D5', '. G4+B4 . G4+B4 . G4+B4 . G4+B4', '. E4+G4 . E4+G4 . F#4+A4 . F#4+A4', '. B4+D5 . B4+D5 . . . .',
          '. E4+G4 . E4+G4 . E4+G4 . E4+G4', '. F#4+A4 . F#4+A4 . F#4+A4 . F#4+A4', '. D4+F#4 . D4+F#4 . D4+F#4 . D4+F#4', '. G4+B4 . G4+B4 . G4+B4 . G4+B4',
          '. E4+G4 . E4+G4 . E4+G4 . E4+G4', '. F#4+A4 . F#4+A4 . F#4+A4 . F#4+A4', '. A4+C5 . A4+C5 . F#4+A4 . F#4+A4', '. F#4+A4 . F#4+A4 . F#4+C5 . F#4+C5') },
        { inst: 'pizz', vol: 1, pattern: J(
          'G2 . . G2 D3 . . .', 'E2 . . E2 B2 . . .', 'C3 . . C3 G2 . . .', 'D3 . . D3 A2 . . .',
          'G2 . . G2 D3 . . .', 'E2 . . E2 B2 . . .', 'C3 . . . D3 . . .', 'G2 . D3 . G2 . . .',
          'C3 . . C3 G2 . . .', 'D3 . . D3 A2 . . .', 'B2 . . B2 F#2 . . .', 'E2 . . E2 B2 . . .',
          'C3 . . C3 G2 . . .', 'D3 . . D3 A2 . . .', 'A2 . . . D3 . . .', 'D3 . A2 . D3 . F#2 .') },
      ],
      drums: {
        kick: R('x . . . x . . .', 16),
        wood: R('. o . x . o . x', 16),
        clink: R(R('. . . . . . . .', 3) + '  . . . . . . x .', 4),
      },
    };
  }

  // 4. Bolhas no banheiro: flautinha, acordes no contratempo e bolhas, ré maior
  {
    const D = 'D4+F#4+A4', Bm = 'D4+F#4+B4', G = 'D4+G4+B4', A = 'C#4+E4+A4', Fm = 'C#4+F#4+A4', Em = 'E4+G4+B4';
    const sk = (c) => `. ${c} . ${c} . ${c} . ${c}`;
    SONGS.banheiro = {
      title: 'Bolhas no banheiro', bpm: 100, div: 2, swing: 0.15,
      tracks: [
        { inst: 'flute', vol: 1, pattern: J(
          'F#5 - A5 - . F#5 E5 D5', 'B4 - D5 - F#5 - . .', 'G5 - F#5 - E5 - D5 -', 'E5 - - - . . . .',
          'F#5 - A5 - D6 - A5 -', 'B5 - A5 - F#5 - D5 -', 'G5 - B5 - A5 - C#6 -', 'D6 - - - . . . .',
          'B5 - - A5 G5 - . .', 'A5 - - G5 F#5 - . .', 'F#5 - A5 - C#6 - A5 -', 'B5 - - - . . F#5 -',
          'G5 - B5 - D6 - B5 -', 'C#6 - E6 - C#6 - A5 -', 'B5 - G5 - A5 - E5 -', 'C#5 - E5 - A5 - . .') },
        { inst: 'pad', vol: 1.2, pattern: J(...['F#3+A3+D4', 'F#3+B3+D4', 'G3+B3+D4', 'E3+A3+C#4', 'F#3+A3+D4', 'F#3+B3+D4'].map((c) => c + ' - - - - - - -'), 'G3+B3+D4 - - - E3+A3+C#4 - - -', 'F#3+A3+D4 - - - - - - -',
          ...['G3+B3+D4', 'E3+A3+C#4', 'F#3+A3+C#4', 'F#3+B3+D4', 'G3+B3+D4', 'E3+A3+C#4'].map((c) => c + ' - - - - - - -'), 'G3+B3+E4 - - - E3+A3+C#4 - - -', 'E3+A3+C#4 - - - - - - -') },
        { inst: 'uke', vol: 0.75, pattern: J(sk(D), sk(Bm), sk(G), sk(A), sk(D), sk(Bm), `. ${G} . ${G} . ${A} . ${A}`, sk(D),
          sk(G), sk(A), sk(Fm), sk(Bm), sk(G), sk(A), `. ${Em} . ${Em} . ${A} . ${A}`, sk(A)) },
        { inst: 'bass', vol: 1.1, pattern: J(
          'D2 - . D2 A2 - . .', 'B1 - . B1 F#2 - . .', 'G2 - . G2 D2 - . .', 'A2 - . A2 E2 - . .',
          'D2 - . D2 A2 - . .', 'B1 - . B1 F#2 - . .', 'G2 - . . A2 - . .', 'D2 - . D2 A1 - D2 .',
          'G2 - . G2 D2 - . .', 'A2 - . A2 E2 - . .', 'F#2 - . F#2 C#2 - . .', 'B1 - . B1 F#2 - . .',
          'G2 - . G2 D2 - . .', 'A2 - . A2 E2 - . .', 'E2 - . . A2 - . .', 'A2 - . A2 E2 - C#2 .') },
      ],
      drums: {
        kick: R('x . . . x . . .', 16),
        rim: R('. . . . x . . .', 16),
        hat: R('. x . x . x . x', 16),
        bubble: J('. . . . . . . x', '. . . . . . . .', '. x . . . . . .', '. . . . . x . .', '. . . . . . . .', '. . . x . . . x', '. . . . . . . .', '. . x . . . . .','. . . . . . x .', '. . . . . . . .', '. . . x . x . .', '. . . . . . . x', '. . . . . . x .', '. x . . . . . .', '. . . . . x . x', 'x . . . . . . .'),
      },
    };
  }

  // 5. Rabinho abanando: videogame antigo, lá maior, rapidinho
  {
    SONGS.coragem = {
      title: 'Rabinho abanando', bpm: 138, div: 2, swing: 0,
      tracks: [
        { inst: 'square', vol: 1, pattern: J(
          'A5 . C#6 . E6 . C#6 A5', 'F#5 . A5 . C#6 . A5 .', 'D6 . C#6 . B5 . A5 .', 'G#5 . B5 . E6 - . .',
          'A5 . E6 . A6 . E6 .', 'F#6 . E6 . C#6 . A5 .', 'D6 . F#6 . E6 . G#5 .', 'A5 . E5 . A5 - . .') },
        { inst: 'square', vol: 0.45, pattern: J(
          'A4 C#5 E5 C#5 A4 C#5 E5 C#5', 'F#4 A4 C#5 A4 F#4 A4 C#5 A4', 'D4 F#4 A4 F#4 D4 F#4 A4 F#4', 'E4 G#4 B4 G#4 E4 G#4 B4 G#4',
          'A4 C#5 E5 C#5 A4 C#5 E5 C#5', 'F#4 A4 C#5 A4 F#4 A4 C#5 A4', 'D4 F#4 A4 F#4 E4 G#4 B4 G#4', 'A4 C#5 E5 C#5 A4 . . .') },
        { inst: 'bass', vol: 1, pattern: J(
          'A2 . A2 . A2 . E2 .', 'F#2 . F#2 . F#2 . C#2 .', 'D2 . D2 . D2 . A2 .', 'E2 . E2 . E2 . B1 .',
          'A2 . A2 . A2 . E2 .', 'F#2 . F#2 . F#2 . C#2 .', 'D2 . D2 . E2 . E2 .', 'A2 . E2 . A2 . . .') },
      ],
      drums: {
        kick: R('x . . . x . . .', 8),
        snare: R('. . x . . . x .', 8),
        hat: R('o o o o o o o o', 8),
      },
    };
  }

  // 6. Domingo de sol: bossa nova com violão, vibrafone e chocalho
  {
    const Cm7 = 'C3+G3+B3+E4', Am7 = 'A2+G3+C4+E4', Dm7 = 'D3+A3+C4+F4', G7 = 'G2+F3+B3+D4', A7 = 'A2+G3+C#4+E4';
    const bA = (c) => `${c} . . ${c} . . ${c} .`;
    const bB = (c) => `. . ${c} . . ${c} . .`;
    SONGS.abertura = {
      title: 'Domingo de sol', bpm: 132, div: 2, swing: 0,
      tracks: [
        { inst: 'vibes', vol: 1, pattern: J(
          'E5 - - G5 - - B5 -', 'A5 - - - G5 - E5 -', 'F5 - - A5 - - C6 -', 'B5 - - - A5 - G5 -',
          'E5 - G5 - B5 - D6 -', 'C#6 - - - A5 - G5 -', 'F5 - A5 - G5 - F5 -', 'E5 - - - - - . .') },
        { inst: 'pluck', vol: 0.55, strum: 0.008, pattern: J(bA(Cm7), bB(Am7), bA(Dm7), bB(G7), bA(Cm7), bB(A7), `${Dm7} . . ${Dm7} ${G7} . . ${G7}`, bA(Cm7)) },
        { inst: 'bass', vol: 1, pattern: J(
          'C2 - - G2 - - - C2', 'A1 - - E2 - - - A1', 'D2 - - A2 - - - D2', 'G1 - - D2 - - - G1',
          'C2 - - G2 - - - C2', 'A1 - - E2 - - - A1', 'D2 - - A2 G1 - - D2', 'C2 - - G2 - - - .') },
      ],
      drums: {
        shaker: R('x o o x o o x o', 8),
        rim: R('x . . x . . x .  . . x . . x . .', 4),
        kick: R('x . . o x . . o', 8),
      },
    };
  }

  root.KRUG_SONGS = SONGS;
})(typeof window !== 'undefined' ? window : globalThis);
