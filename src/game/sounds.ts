// Simple Web Audio API sound system
class SoundSystem {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private initialized = false;

  init() {
    if (this.initialized) return;
    try {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3;
      this.masterGain.connect(this.ctx.destination);
      this.initialized = true;
    } catch (e) {
      console.warn('Audio not available');
    }
  }

  private playTone(freq: number, duration: number, type: OscillatorType = 'square', volume = 0.3) {
    if (!this.ctx || !this.masterGain) return;
    
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, this.ctx.currentTime + duration);
    
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  private playNoise(duration: number, volume = 0.2) {
    if (!this.ctx || !this.masterGain) return;
    
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1));
    }
    
    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2000;
    
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    
    source.start();
  }

  shoot() {
    this.playNoise(0.08, 0.15);
    this.playTone(200, 0.05, 'square', 0.1);
  }

  shootShotgun() {
    this.playNoise(0.15, 0.25);
    this.playTone(100, 0.1, 'sawtooth', 0.15);
  }

  shootSniper() {
    this.playNoise(0.2, 0.2);
    this.playTone(80, 0.15, 'square', 0.2);
  }

  zombieHit() {
    this.playTone(150, 0.1, 'sawtooth', 0.1);
  }

  zombieDeath() {
    this.playTone(80, 0.3, 'sawtooth', 0.15);
    this.playNoise(0.2, 0.1);
  }

  collectBonus() {
    this.playTone(440, 0.1, 'sine', 0.2);
    setTimeout(() => this.playTone(660, 0.1, 'sine', 0.2), 50);
    setTimeout(() => this.playTone(880, 0.15, 'sine', 0.2), 100);
  }

  explosion() {
    this.playNoise(0.4, 0.3);
    this.playTone(60, 0.3, 'sawtooth', 0.2);
  }

  waveComplete() {
    this.playTone(523, 0.15, 'sine', 0.2);
    setTimeout(() => this.playTone(659, 0.15, 'sine', 0.2), 150);
    setTimeout(() => this.playTone(784, 0.2, 'sine', 0.2), 300);
  }

  gameOver() {
    this.playTone(300, 0.3, 'sawtooth', 0.2);
    setTimeout(() => this.playTone(200, 0.3, 'sawtooth', 0.2), 300);
    setTimeout(() => this.playTone(100, 0.5, 'sawtooth', 0.2), 600);
  }
}

export const soundSystem = new SoundSystem();
