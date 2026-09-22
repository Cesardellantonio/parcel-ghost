/* Parcel Ghost — Web Audio SFX. No samples, no network. */
(() => {
  "use strict";

  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ac() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      if (!ctx) {
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.4;
        master.connect(ctx.destination);
        const len = Math.floor(ctx.sampleRate * 0.5);
        noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === "suspended") ctx.resume().catch(() => {});
      return ctx;
    } catch (err) {
      return null;
    }
  }

  function envGain(t, peak, attack, dur) {
    const g = ctx.createGain();
    g.connect(master);
    const top = Math.max(0.0001, peak);
    const a = Math.max(0.006, attack);
    const end = Math.max(a + 0.03, dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(top, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + end);
    return g;
  }

  function beep(freq, dur, type, peak, slideTo, when) {
    if (!ac()) return;
    const t = when == null ? ctx.currentTime : when;
    const osc = ctx.createOscillator();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(Math.max(40, freq), t);
    if (slideTo && slideTo > 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    }
    osc.connect(envGain(t, peak, 0.01, dur));
    osc.start(t);
    osc.stop(t + dur + 0.04);
  }

  function noise(dur, peak, freq, type) {
    if (!ac() || !noiseBuf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type || "bandpass";
    filter.frequency.value = freq || 480;
    filter.Q.value = 0.7;
    src.connect(filter).connect(envGain(t, peak, 0.005, dur));
    src.start(t);
    src.stop(t + dur + 0.03);
  }

  function chord(freqs, dur, peak) {
    if (!ac()) return;
    const t = ctx.currentTime;
    freqs.forEach((f, i) => {
      beep(f, dur, i % 2 === 0 ? "triangle" : "sine", peak * (1 - i * 0.12), null, t + i * 0.02);
    });
  }

  const api = {
    unlock() {
      ac();
    },

    solidify() {
      if (!ac()) return;
      beep(220, 0.08, "sine", 0.05, 440);
      beep(440, 0.12, "triangle", 0.06, 660);
      noise(0.05, 0.03, 900, "lowpass");
    },

    ghost() {
      if (!ac()) return;
      beep(520, 0.1, "sine", 0.04, 180);
      noise(0.08, 0.025, 1200, "highpass");
    },

    pickup() {
      if (!ac()) return;
      beep(392, 0.07, "square", 0.045, 523);
      beep(523, 0.09, "triangle", 0.05, 659);
    },

    drop() {
      if (!ac()) return;
      beep(330, 0.08, "triangle", 0.04, 196);
      noise(0.06, 0.03, 280, "lowpass");
    },

    deliver() {
      if (!ac()) return;
      chord([523, 659, 784], 0.16, 0.055);
      beep(1046, 0.12, "sine", 0.04, null, ctx.currentTime + 0.14);
    },

    photo() {
      if (!ac()) return;
      noise(0.12, 0.12, 2400, "bandpass");
      beep(880, 0.05, "square", 0.08);
      beep(110, 0.25, "sawtooth", 0.07, 55);
    },

    win() {
      if (!ac()) return;
      const t = ctx.currentTime;
      [523, 659, 784, 1046].forEach((f, i) => {
        beep(f, 0.18, "triangle", 0.06, null, t + i * 0.09);
      });
      beep(1318, 0.3, "sine", 0.045, null, t + 0.4);
    },

    fail() {
      if (!ac()) return;
      beep(220, 0.28, "sawtooth", 0.07, 90);
      beep(165, 0.35, "triangle", 0.05, 80);
      noise(0.2, 0.05, 200, "lowpass");
    },

    tick() {
      if (!ac()) return;
      beep(880, 0.03, "square", 0.035);
    },

    ui() {
      if (!ac()) return;
      beep(660, 0.04, "sine", 0.03);
    },
  };

  window.PGAudio = api;
})();
