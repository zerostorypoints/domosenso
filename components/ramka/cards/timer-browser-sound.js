// Audio graph time bounds output even when the browser delays JavaScript timers.
export class TimerBrowserSound {
  constructor(createContext = () => {
    const AudioContext = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    return AudioContext ? new AudioContext() : null;
  }) { this.createContext = createContext; }
  async unlockAudioContext() {
    this.context ??= this.createContext();
    const context = this.context;
    if (!context) return false;
    await context.resume();
    return this.context === context && context.state === 'running';
  }
  play(seconds = 30) {
    this.stop();
    const context = this.context;
    if (context?.state !== 'running') return false;
    const oscillator = context.createOscillator(), gain = context.createGain();
    const duration = Math.min(30, Math.max(0, Number.isFinite(seconds) ? seconds : 30));
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.setValueAtTime(0, context.currentTime + duration);
    oscillator.frequency.value = 660;
    oscillator.connect(gain);
    gain.connect(context.destination);
    this.output = {oscillator, gain};
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      if (this.output?.oscillator === oscillator) this.output = null;
    };
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
    return true;
  }
  stop() {
    if (!this.output) return;
    const {oscillator, gain} = this.output;
    this.output = null;
    try { oscillator.stop(); } catch { /* already ended */ }
    oscillator.disconnect();
    gain.disconnect();
  }
  close() {
    this.stop();
    const context = this.context;
    this.context = null;
    if (context) void context.close().catch(() => {});
  }
}
