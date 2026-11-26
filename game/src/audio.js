// Skyline Courier — audio: a small procedural soundscape (engine hum,
// ring chime, alarms) built on WebAudio. No audio files, no network.

function makeAudio() {
  const audio = {
    ctx: null, engine: null, engineGain: null, started: false,
    start() {
      if (this.started) return;
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = 55;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        const gain = this.ctx.createGain();
        gain.gain.value = 0.0;
        osc.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
        osc.start();
        this.engine = osc; this.engineGain = gain; this.engineFilter = filter;
        this.started = true;
      } catch (e) { /* audio is optional */ }
    },
    setEngine(throttle, speed) {
      if (!this.started || !this.engineGain) return;
      try {
        const t = this.ctx.currentTime;
        this.engineGain.gain.setTargetAtTime(0.015 + throttle * 0.045, t, 0.1);
        this.engine.frequency.setTargetAtTime(48 + throttle * 55 + speed * 0.12, t, 0.1);
      } catch (e) { /* ignore */ }
    },
    beep(freq, dur, vol, when) {
      if (!this.started) return;
      try {
        const t = this.ctx.currentTime + (when || 0);
        const o = this.ctx.createOscillator();
        o.type = 'sine'; o.frequency.value = freq;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(t); o.stop(t + dur + 0.05);
      } catch (e) { /* ignore */ }
    },
    ring() { this.beep(880, 0.35, 0.14); this.beep(1318, 0.4, 0.1, 0.09); },
    miss() { this.beep(220, 0.3, 0.1); },
    win() { this.beep(523, 0.25, 0.12); this.beep(659, 0.25, 0.12, 0.12); this.beep(784, 0.5, 0.12, 0.24); },
    crash() { this.beep(110, 0.7, 0.18); this.beep(82, 0.9, 0.15, 0.1); },
  };
  return audio;
}
