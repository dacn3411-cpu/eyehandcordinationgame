/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private sfxBus: GainNode | null = null;
  private bgmBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private softClipCurve: Float32Array<ArrayBuffer> | null = null;

  private bgmTimer: number | null = null;
  private isPlayingBgm = false;
  private isPausedBgm = false;
  private bgmStep = 0;

  private _sfxEnabled = true;
  private _sfxVolume = 0.8;
  private _bgmEnabled = true;

  public get sfxEnabled(): boolean {
    return this._sfxEnabled;
  }
  public set sfxEnabled(val: boolean) {
    this._sfxEnabled = val;
    this.updateBusGains();
  }

  public get sfxVolume(): number {
    return this._sfxVolume;
  }
  public set sfxVolume(val: number) {
    this._sfxVolume = Math.max(0, Math.min(1, val));
    this.updateBusGains();
  }

  public get bgmEnabled(): boolean {
    return this._bgmEnabled;
  }
  public set bgmEnabled(val: boolean) {
    this._bgmEnabled = val;
    this.updateBusGains();
  }

  public syncSettings(opts: {
    sfxEnabled: boolean;
    sfxVolume: number;
    bgmEnabled: boolean;
  }) {
    this._sfxEnabled = opts.sfxEnabled;
    this._sfxVolume = Math.max(0, Math.min(1, opts.sfxVolume));
    this._bgmEnabled = opts.bgmEnabled;
    this.updateBusGains();
  }

  private ensureAudioGraph() {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
    }

    if (!this.compressor && this.ctx) {
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.setValueAtTime(-14, this.ctx.currentTime);
      comp.knee.setValueAtTime(10, this.ctx.currentTime);
      comp.ratio.setValueAtTime(6, this.ctx.currentTime);
      comp.attack.setValueAtTime(0.002, this.ctx.currentTime);
      comp.release.setValueAtTime(0.14, this.ctx.currentTime);
      comp.connect(this.ctx.destination);
      this.compressor = comp;

      const sfxGain = this.ctx.createGain();
      sfxGain.connect(comp);
      this.sfxBus = sfxGain;

      const bgmGain = this.ctx.createGain();
      bgmGain.connect(comp);
      this.bgmBus = bgmGain;

      this.updateBusGains();
    }

    if (!this.noiseBuffer && this.ctx) {
      const len = Math.floor(this.ctx.sampleRate * 0.6);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      this.noiseBuffer = buf;
    }

    if (!this.softClipCurve) {
      const samples = 512;
      const buf = new ArrayBuffer(samples * 4);
      const curve = new Float32Array(buf);
      const drive = 2.6;
      const norm = Math.tanh(drive);
      for (let i = 0; i < samples; i++) {
        const x = (i * 2) / (samples - 1) - 1;
        curve[i] = Math.tanh(drive * x) / norm;
      }
      this.softClipCurve = curve;
    }
  }

  private updateBusGains() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.sfxBus) {
      const targetSfx = this._sfxEnabled ? this._sfxVolume : 0;
      this.sfxBus.gain.setTargetAtTime(targetSfx, now, 0.015);
    }
    if (this.bgmBus) {
      const targetBgm =
        this._bgmEnabled && this.isPlayingBgm && !this.isPausedBgm ? 0.09 : 0;
      this.bgmBus.gain.setTargetAtTime(targetBgm, now, 0.08);
    }
  }

  public initOrResume() {
    try {
      this.ensureAudioGraph();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.updateBusGains();
    } catch {
      // Ignore if AudioContext is blocked prior to user gesture
    }
  }

  private playFilteredTone(params: {
    freqStart: number;
    freqEnd?: number;
    durationSec: number;
    type?: OscillatorType;
    gain: number;
    delaySec?: number;
    attackSec?: number;
    filterType?: BiquadFilterType;
    filterFreq?: number;
    filterQ?: number;
  }) {
    if (!this._sfxEnabled) return;
    this.initOrResume();
    if (!this.ctx || !this.sfxBus) return;

    try {
      const now = this.ctx.currentTime + (params.delaySec ?? 0);
      const dur = Math.max(0.012, params.durationSec);
      const attack = Math.min(params.attackSec ?? 0.004, dur * 0.35);

      const osc = this.ctx.createOscillator();
      osc.type = params.type ?? 'sine';
      osc.frequency.setValueAtTime(Math.max(20, params.freqStart), now);
      if (params.freqEnd !== undefined && params.freqEnd !== params.freqStart) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(20, params.freqEnd),
          now + dur,
        );
      }

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(Math.max(0.0005, params.gain), now + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      if (params.filterType && params.filterFreq) {
        const filter = this.ctx.createBiquadFilter();
        filter.type = params.filterType;
        filter.frequency.setValueAtTime(params.filterFreq, now);
        if (params.filterQ !== undefined) {
          filter.Q.setValueAtTime(params.filterQ, now);
        }
        osc.connect(filter);
        filter.connect(env);
      } else {
        osc.connect(env);
      }

      env.connect(this.sfxBus);
      osc.start(now);
      osc.stop(now + dur + 0.015);
    } catch {
      // Ignore audio errors
    }
  }

  private playFilteredNoise(params: {
    durationSec: number;
    gain: number;
    filterType: BiquadFilterType;
    freqStart: number;
    freqEnd?: number;
    filterQ?: number;
    delaySec?: number;
    attackSec?: number;
    destination?: AudioNode;
  }) {
    if (!this._sfxEnabled) return;
    this.initOrResume();
    if (!this.ctx || !this.sfxBus || !this.noiseBuffer) return;

    try {
      const now = this.ctx.currentTime + (params.delaySec ?? 0);
      const dur = Math.max(0.01, params.durationSec);
      const attack = Math.min(params.attackSec ?? 0.002, dur * 0.3);

      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = params.filterType;
      filter.frequency.setValueAtTime(Math.max(40, params.freqStart), now);
      if (params.freqEnd !== undefined && params.freqEnd !== params.freqStart) {
        filter.frequency.exponentialRampToValueAtTime(
          Math.max(40, params.freqEnd),
          now + dur,
        );
      }
      if (params.filterQ !== undefined) {
        filter.Q.setValueAtTime(params.filterQ, now);
      }

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(Math.max(0.0005, params.gain), now + attack);
      env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

      src.connect(filter);
      filter.connect(env);
      env.connect(params.destination ?? this.sfxBus);
      src.start(now);
      src.stop(now + dur + 0.015);
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * 1. Valorant Vandal-style heavy 7.62mm single-shot rifle (4 layers + soft-clipping WaveShaper + ±3% micro variation)
   */
  public playShoot() {
    if (!this._sfxEnabled) return;
    this.initOrResume();
    if (!this.ctx || !this.sfxBus || !this.noiseBuffer) return;

    try {
      const now = this.ctx.currentTime;
      const variation = 0.97 + Math.random() * 0.06; // ±3% organic pitch & filter micro-variation

      const shaper = this.ctx.createWaveShaper();
      if (this.softClipCurve) {
        shaper.curve = this.softClipCurve;
        shaper.oversample = '2x';
      }
      const rifleSum = this.ctx.createGain();
      rifleSum.gain.setValueAtTime(0.92, now);
      rifleSum.connect(shaper);
      shaper.connect(this.sfxBus);

      // Layer 1: Heavy Sub Punch (170Hz -> 48Hz in 55ms)
      const subOsc = this.ctx.createOscillator();
      subOsc.type = 'triangle';
      subOsc.frequency.setValueAtTime(170 * variation, now);
      subOsc.frequency.exponentialRampToValueAtTime(48 * variation, now + 0.055);
      const subGain = this.ctx.createGain();
      subGain.gain.setValueAtTime(0.001, now);
      subGain.gain.linearRampToValueAtTime(0.58, now + 0.003);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.065);
      subOsc.connect(subGain);
      subGain.connect(rifleSum);
      subOsc.start(now);
      subOsc.stop(now + 0.075);

      // Layer 2: Explosive Crack (1.2kHz ~ 3.5kHz bandpass white noise, 35ms punch)
      this.playFilteredNoise({
        durationSec: 0.036,
        gain: 0.56,
        filterType: 'bandpass',
        freqStart: 2350 * variation,
        freqEnd: 1450 * variation,
        filterQ: 0.95,
        attackSec: 0.0015,
        destination: rifleSum,
      });

      // Layer 3: Mechanical Bolt Metallic Snap (3.0kHz ~ 4.8kHz, crisp 15ms click)
      this.playFilteredNoise({
        durationSec: 0.015,
        gain: 0.34,
        filterType: 'bandpass',
        freqStart: 4100 * variation,
        freqEnd: 3300 * variation,
        filterQ: 2.2,
        attackSec: 0.001,
        destination: rifleSum,
      });

      // Layer 4: Tight Indoor/Courtyard Room Tail (125ms decaying low-pass tail)
      this.playFilteredNoise({
        durationSec: 0.125,
        gain: 0.24,
        filterType: 'lowpass',
        freqStart: 1250 * variation,
        freqEnd: 240,
        filterQ: 0.7,
        attackSec: 0.005,
        destination: this.sfxBus,
      });
    } catch {
      // Ignore audio errors
    }
  }

  /**
   * 2. Clean restrained hit sounds (NO combo pitch escalation or combo fanfare)
   */
  public playHitGood() {
    // Solid, calm low-mid confirmation thud + light transient
    this.playFilteredTone({
      freqStart: 540,
      freqEnd: 370,
      durationSec: 0.075,
      type: 'triangle',
      gain: 0.24,
      filterType: 'lowpass',
      filterFreq: 1650,
    });
    this.playFilteredTone({
      freqStart: 920,
      freqEnd: 740,
      durationSec: 0.032,
      type: 'sine',
      gain: 0.1,
    });
  }

  public playHitPerfect() {
    // Crisp high crunch (22ms) + clean single crystalline confirmation tone
    this.playFilteredNoise({
      durationSec: 0.022,
      gain: 0.2,
      filterType: 'bandpass',
      freqStart: 2500,
      freqEnd: 1850,
      filterQ: 1.4,
      attackSec: 0.001,
    });
    this.playFilteredTone({
      freqStart: 1396.91,
      freqEnd: 1318.51,
      durationSec: 0.115,
      type: 'sine',
      gain: 0.26,
      attackSec: 0.002,
    });
  }

  public playMiss() {
    this.playNonTarget();
  }

  public playNonTarget() {
    // Low, short dull block thud
    this.playFilteredTone({
      freqStart: 185,
      freqEnd: 105,
      durationSec: 0.068,
      type: 'triangle',
      gain: 0.2,
      filterType: 'lowpass',
      filterFreq: 480,
    });
  }

  public playWrongSelection() {
    // Slightly firmer muted block feedback
    this.playFilteredTone({
      freqStart: 175,
      freqEnd: 95,
      durationSec: 0.085,
      type: 'sawtooth',
      gain: 0.18,
      filterType: 'lowpass',
      filterFreq: 420,
    });
  }

  public playRearSpawnAlert() {
    // Subtle muted tactical radar ping (kept restrained)
    this.playFilteredTone({
      freqStart: 784,
      freqEnd: 784,
      durationSec: 0.07,
      type: 'sine',
      gain: 0.09,
    });
  }

  public playObstacleBump() {
    this.playFilteredTone({
      freqStart: 145,
      freqEnd: 68,
      durationSec: 0.18,
      type: 'triangle',
      gain: 0.28,
      filterType: 'lowpass',
      filterFreq: 380,
    });
  }

  /**
   * 3. Laser Track, Indoor Range & UI Tactical SFX
   */
  public playLaserDragStep(progress: number) {
    const p = Math.max(0, Math.min(1, progress));
    const baseFreq = 320 + p * 360;
    this.playFilteredTone({
      freqStart: baseFreq,
      freqEnd: baseFreq + 45,
      durationSec: 0.048,
      type: 'sine',
      gain: 0.09,
      attackSec: 0.006,
      filterType: 'bandpass',
      filterFreq: 750 + p * 1100,
      filterQ: 1.2,
    });
  }

  public playLaserTrackComplete() {
    this.playFilteredTone({
      freqStart: 880,
      freqEnd: 880,
      durationSec: 0.14,
      type: 'sine',
      gain: 0.24,
      attackSec: 0.003,
    });
    this.playFilteredTone({
      freqStart: 1318.51,
      freqEnd: 1318.51,
      durationSec: 0.16,
      type: 'triangle',
      gain: 0.14,
      delaySec: 0.035,
      filterType: 'lowpass',
      filterFreq: 2600,
    });
  }

  public playIndoorRangeWarning() {
    // Low tactical double-beep warning
    this.playFilteredTone({
      freqStart: 350,
      freqEnd: 295,
      durationSec: 0.11,
      type: 'sawtooth',
      gain: 0.22,
      delaySec: 0,
      filterType: 'lowpass',
      filterFreq: 950,
    });
    this.playFilteredTone({
      freqStart: 350,
      freqEnd: 295,
      durationSec: 0.12,
      type: 'sawtooth',
      gain: 0.22,
      delaySec: 0.17,
      filterType: 'lowpass',
      filterFreq: 950,
    });
  }

  public playIndoorRangeClear() {
    // Weighty, clean tactical completion resolve
    this.playFilteredTone({
      freqStart: 110,
      freqEnd: 73.42,
      durationSec: 0.26,
      type: 'triangle',
      gain: 0.26,
      filterType: 'lowpass',
      filterFreq: 320,
    });
    this.playFilteredTone({
      freqStart: 659.25,
      freqEnd: 659.25,
      durationSec: 0.11,
      type: 'sine',
      gain: 0.22,
      delaySec: 0.01,
    });
    this.playFilteredTone({
      freqStart: 987.77,
      freqEnd: 987.77,
      durationSec: 0.24,
      type: 'sine',
      gain: 0.25,
      delaySec: 0.095,
    });
  }

  public playCountdownBeep(isStart: boolean) {
    if (isStart) {
      this.playFilteredTone({
        freqStart: 1046.5,
        freqEnd: 1046.5,
        durationSec: 0.18,
        type: 'sine',
        gain: 0.26,
      });
      this.playFilteredTone({
        freqStart: 523.25,
        freqEnd: 523.25,
        durationSec: 0.14,
        type: 'triangle',
        gain: 0.14,
        filterType: 'lowpass',
        filterFreq: 1200,
      });
    } else {
      this.playFilteredTone({
        freqStart: 587.33,
        freqEnd: 587.33,
        durationSec: 0.09,
        type: 'sine',
        gain: 0.19,
      });
    }
  }

  public playUiClick() {
    // Short, clean Valorant menu high-tech click
    this.playFilteredTone({
      freqStart: 1850,
      freqEnd: 1180,
      durationSec: 0.018,
      type: 'sine',
      gain: 0.14,
      attackSec: 0.001,
    });
    this.playFilteredNoise({
      durationSec: 0.008,
      gain: 0.08,
      filterType: 'highpass',
      freqStart: 3200,
      attackSec: 0.001,
    });
  }

  public playFanfare() {
    // Restrained tactical session-complete chord (no bouncy arcade arpeggio)
    this.playIndoorRangeClear();
  }

  /**
   * 4. Valorant-style calm tactical ambient BGM (dark low-pass synth pad + subtle deep bass pulse)
   */
  public startBgm() {
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    this.initOrResume();
    this.isPlayingBgm = true;
    this.isPausedBgm = false;
    this.bgmStep = 0;
    this.updateBusGains();

    // Subtle evolving minor tactical chord progression (D2 -> Bb1 -> C2 -> A1)
    const bassRoots = [73.42, 58.27, 65.41, 55.0];
    const padChords = [
      [146.83, 220.0, 261.63],
      [116.54, 174.61, 220.0],
      [130.81, 196.0, 246.94],
      [110.0, 164.81, 220.0],
    ];

    const triggerAmbientBar = () => {
      if (!this.isPlayingBgm || this.isPausedBgm || !this._bgmEnabled) return;
      if (!this.ctx || this.ctx.state !== 'running' || !this.bgmBus) return;

      const idx = this.bgmStep % bassRoots.length;
      const isPadStep = this.bgmStep % 2 === 0;
      const rootFreq = bassRoots[Math.floor(this.bgmStep / 2) % bassRoots.length];
      const chord = padChords[Math.floor(this.bgmStep / 2) % padChords.length];
      this.bgmStep += 1;

      try {
        const now = this.ctx.currentTime;

        // Subtle deep sub-bass pulse every 850ms
        const bassOsc = this.ctx.createOscillator();
        bassOsc.type = 'triangle';
        bassOsc.frequency.setValueAtTime(rootFreq, now);
        const bassFilter = this.ctx.createBiquadFilter();
        bassFilter.type = 'lowpass';
        bassFilter.frequency.setValueAtTime(175, now);
        const bassGain = this.ctx.createGain();
        bassGain.gain.setValueAtTime(0.0001, now);
        bassGain.gain.linearRampToValueAtTime(0.42, now + 0.08);
        bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.78);
        bassOsc.connect(bassFilter);
        bassFilter.connect(bassGain);
        bassGain.connect(this.bgmBus);
        bassOsc.start(now);
        bassOsc.stop(now + 0.82);

        // Warm dark low-pass synth pad every 1.7s
        if (isPadStep) {
          for (let c = 0; c < chord.length; c++) {
            const padOsc = this.ctx.createOscillator();
            padOsc.type = 'sawtooth';
            padOsc.frequency.setValueAtTime(chord[c] * (c === 1 ? 1.0025 : 0.998), now);
            const padFilter = this.ctx.createBiquadFilter();
            padFilter.type = 'lowpass';
            padFilter.frequency.setValueAtTime(320, now);
            padFilter.frequency.linearRampToValueAtTime(220, now + 1.65);
            const padGain = this.ctx.createGain();
            padGain.gain.setValueAtTime(0.0001, now);
            padGain.gain.linearRampToValueAtTime(0.14, now + 0.45);
            padGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.68);
            padOsc.connect(padFilter);
            padFilter.connect(padGain);
            padGain.connect(this.bgmBus);
            padOsc.start(now);
            padOsc.stop(now + 1.72);
          }
        }
        void idx;
      } catch {
        // Ignore audio scheduling errors
      }
    };

    triggerAmbientBar();
    this.bgmTimer = window.setInterval(triggerAmbientBar, 850);
  }

  public setBgmPaused(paused: boolean) {
    this.isPausedBgm = paused;
    this.updateBusGains();
  }

  public stopBgm() {
    this.isPlayingBgm = false;
    this.isPausedBgm = false;
    if (this.bgmTimer !== null) {
      window.clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
    this.updateBusGains();
  }
}

export const soundEngine = new SoundEngine();

if (typeof window !== 'undefined') {
  const resumeOnFirstGesture = () => {
    soundEngine.initOrResume();
  };
  window.addEventListener('pointerdown', resumeOnFirstGesture, { passive: true, once: true });
  window.addEventListener('keydown', resumeOnFirstGesture, { passive: true, once: true });
}
