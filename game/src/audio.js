// Procedural WebAudio: no audio files. Engine hum, a two-tone siren, a gunshot
// burst and a pickup chime are all synthesised. The context is created lazily
// on the first user gesture (browsers block audio before that); in screenshot
// mode nothing is created at all.
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenHigh = false;
  let sirenTimer = 0;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(ctx.destination);
      sirenOsc.start();
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function blip(freq, seconds, type, volume, slideTo) {
    if (!ensure()) return;
    try {
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, t);
      if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + seconds);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(volume, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + seconds + 0.02);
    } catch {
      // Audio is decoration; a failure never breaks the game.
    }
  }

  return {
    unlock() {
      const c = ensure();
      if (c && c.state === 'suspended') c.resume().catch(() => {});
    },
    // Called every frame: engine pitch follows speed, siren wails while wanted.
    update(dt, speed, wanted) {
      if (!ctx) return;
      try {
        if (engineGain) {
          engineGain.gain.value = speed > 0.5 ? 0.035 + Math.min(0.05, speed * 0.0012) : 0.012;
          engineOsc.frequency.value = 48 + speed * 3.2;
        }
        if (sirenGain) {
          if (wanted > 0) {
            sirenTimer -= dt;
            if (sirenTimer <= 0) {
              sirenTimer = 0.45;
              sirenHigh = !sirenHigh;
              sirenOsc.frequency.value = sirenHigh ? 880 : 660;
            }
            sirenGain.gain.value = 0.028;
          } else {
            sirenGain.gain.value = 0;
          }
        }
      } catch {
        // Ignore.
      }
    },
    shoot() {
      if (!ensure()) return;
      try {
        const t = ctx.currentTime;
        const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.12, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const gain = ctx.createGain();
        gain.gain.value = 0.25;
        const filter = ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 900;
        src.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        src.start(t);
      } catch {
        // Ignore.
      }
    },
    pickup() {
      blip(660, 0.12, 'sine', 0.18);
      setTimeout(() => blip(990, 0.18, 'sine', 0.18), 90);
    },
    crash() {
      blip(90, 0.25, 'square', 0.2, 45);
    },
    missionDone() {
      blip(523, 0.14, 'sine', 0.2);
      setTimeout(() => blip(659, 0.14, 'sine', 0.2), 130);
      setTimeout(() => blip(784, 0.3, 'sine', 0.22), 260);
    },
  };
}
