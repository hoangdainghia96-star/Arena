import { ArenaSettings, BattleEvent, ElementType } from '../types/game';

class ImmersiveAudioEngine {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private bgmInterval: number | null = null;
  private currentStage: 1 | 2 | 3 | 'victory' | 'menu' = 'menu';
  private stepIndex = 0;
  private settings: ArenaSettings['audio'] = {
    masterMuted: false,
    musicVolume: 0.55,
    sfxVolume: 0.75,
    voiceVolume: 0.85,
    ambientVolume: 0.5,
  };

  private ensureContext(): AudioContext | null {
    if (this.settings.masterMuted) return null;
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
        this.musicGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();
        this.voiceGain = this.ctx.createGain();
        this.ambientGain = this.ctx.createGain();

        this.musicGain.connect(this.ctx.destination);
        this.sfxGain.connect(this.ctx.destination);
        this.voiceGain.connect(this.ctx.destination);
        this.ambientGain.connect(this.ctx.destination);
        this.syncVolumes();
      } catch {
        return null;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public updateSettings(audioSettings: ArenaSettings['audio']): void {
    this.settings = { ...audioSettings };
    this.syncVolumes();
    if (this.settings.masterMuted) {
      this.stopMusicLoop();
    }
  }

  private syncVolumes(): void {
    if (!this.ctx) return;
    const muteFactor = this.settings.masterMuted ? 0 : 1;
    const now = this.ctx.currentTime;
    this.musicGain?.gain.setTargetAtTime(this.settings.musicVolume * 0.22 * muteFactor, now, 0.05);
    this.sfxGain?.gain.setTargetAtTime(this.settings.sfxVolume * 0.45 * muteFactor, now, 0.05);
    this.voiceGain?.gain.setTargetAtTime(this.settings.voiceVolume * 0.38 * muteFactor, now, 0.05);
    this.ambientGain?.gain.setTargetAtTime(this.settings.ambientVolume * 0.18 * muteFactor, now, 0.05);
  }

  private createSpatialPanner(ctx: AudioContext, worldX = 0): AudioNode {
    if (typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-0.9, Math.min(0.9, worldX / 32));
      panner.connect(this.sfxGain!);
      return panner;
    }
    return this.sfxGain!;
  }

  public startBattleMusic(stage: 1 | 2 | 3 = 1): void {
    this.currentStage = stage;
    if (this.settings.masterMuted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (this.bgmInterval !== null) {
      window.clearInterval(this.bgmInterval);
    }

    const tempoMs = stage === 3 ? 185 : stage === 2 ? 220 : 250;
    // D-minor / E-minor anime battle ostinato scale notes (Hz)
    const scale =
      stage === 3
        ? [146.83, 174.61, 220.0, 233.08, 293.66, 349.23, 440.0, 466.16]
        : [130.81, 155.56, 196.0, 233.08, 261.63, 311.13, 392.0, 466.16];

    this.bgmInterval = window.setInterval(() => {
      if (this.settings.masterMuted || !this.ctx || !this.musicGain) return;
      const now = this.ctx.currentTime;
      const pattern = [0, 2, 4, 2, 5, 4, 7, 4];
      const noteFreq = scale[pattern[this.stepIndex % pattern.length]];

      const osc = this.ctx.createOscillator();
      const noteGain = this.ctx.createGain();
      osc.type = this.currentStage === 3 ? 'sawtooth' : 'triangle';
      osc.frequency.setValueAtTime(noteFreq, now);

      noteGain.gain.setValueAtTime(0.001, now);
      noteGain.gain.linearRampToValueAtTime(0.26, now + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(noteGain);
      noteGain.connect(this.musicGain);
      osc.start(now);
      osc.stop(now + 0.19);

      // Ambient wind/hum drone on every 8th beat
      if (this.stepIndex % 8 === 0 && this.ambientGain) {
        const ambOsc = this.ctx.createOscillator();
        const ambNode = this.ctx.createGain();
        ambOsc.type = 'sine';
        ambOsc.frequency.setValueAtTime(noteFreq * 0.5, now);
        ambNode.gain.setValueAtTime(0.001, now);
        ambNode.gain.linearRampToValueAtTime(0.22, now + 0.35);
        ambNode.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
        ambOsc.connect(ambNode);
        ambNode.connect(this.ambientGain);
        ambOsc.start(now);
        ambOsc.stop(now + 1.55);
      }

      this.stepIndex++;
    }, tempoMs);
  }

  public stopMusicLoop(): void {
    if (this.bgmInterval !== null) {
      window.clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }

  public playSkillSound(element: ElementType, isUltimate = false, worldX = 0): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;

    const now = ctx.currentTime;
    const dest = this.createSpatialPanner(ctx, worldX);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const baseFreqMap: Record<ElementType, number> = {
      fire: 240,
      void: 135,
      lightning: 520,
      solar: 380,
      photon: 640,
      abyss: 105,
      chrono: 440,
      wind: 320,
      crimson: 480,
      crystal: 360,
    };

    const startFreq = baseFreqMap[element] || 300;
    const duration = isUltimate ? 0.75 : 0.24;

    osc.type = isUltimate ? 'sawtooth' : element === 'lightning' ? 'square' : 'triangle';
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(
      isUltimate ? startFreq * 0.35 : startFreq * 1.45,
      now + duration
    );

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(isUltimate ? 0.65 : 0.32, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playEventCue(event: BattleEvent): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxGain) return;
    const now = ctx.currentTime;
    const worldX = event.position?.[0] ?? 0;
    const dest = this.createSpatialPanner(ctx, worldX);

    if (event.type === 'ELIMINATION') {
      // Dramatic dual-chord chime
      [330, 220, 165].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + i * 0.08);
        g.gain.setValueAtTime(0.001, now + i * 0.08);
        g.gain.linearRampToValueAtTime(0.45, now + i * 0.08 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.45);
        osc.connect(g);
        g.connect(dest);
        osc.start(now + i * 0.08);
        osc.stop(now + i * 0.08 + 0.48);
      });
    } else if (event.type === 'ALLIANCE_FORMED') {
      // Rising harmonic fifth
      [261.63, 329.63, 392.0].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.07);
        g.gain.setValueAtTime(0.001, now + i * 0.07);
        g.gain.linearRampToValueAtTime(0.35, now + i * 0.07 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.35);
        osc.connect(g);
        g.connect(dest);
        osc.start(now + i * 0.07);
        osc.stop(now + i * 0.07 + 0.38);
      });
    } else if (event.type === 'ALLIANCE_BETRAYED') {
      // Dissonant tritone sting
      [311.13, 220.0, 155.56].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + i * 0.06);
        g.gain.setValueAtTime(0.001, now + i * 0.06);
        g.gain.linearRampToValueAtTime(0.5, now + i * 0.06 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.06 + 0.5);
        osc.connect(g);
        g.connect(dest);
        osc.start(now + i * 0.06);
        osc.stop(now + i * 0.06 + 0.52);
      });
    } else if (event.type === 'VICTORY') {
      this.stopMusicLoop();
      this.currentStage = 'victory';
      // Triumphant Champion Fanfare Arpeggio
      [261.63, 329.63, 392.0, 523.25, 659.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + i * 0.12);
        g.gain.setValueAtTime(0.001, now + i * 0.12);
        g.gain.linearRampToValueAtTime(0.5, now + i * 0.12 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.85);
        osc.connect(g);
        g.connect(this.musicGain!);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.9);
      });
    }

    // Play character voice cadence tone if voiceLine is attached
    if (event.voiceLine && this.voiceGain && this.settings.voiceVolume > 0.02) {
      const vOsc = ctx.createOscillator();
      const vGain = ctx.createGain();
      vOsc.type = 'sine';
      vOsc.frequency.setValueAtTime(190, now);
      vOsc.frequency.linearRampToValueAtTime(245, now + 0.12);
      vOsc.frequency.linearRampToValueAtTime(175, now + 0.28);
      vGain.gain.setValueAtTime(0.001, now);
      vGain.gain.linearRampToValueAtTime(0.28, now + 0.03);
      vGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      vOsc.connect(vGain);
      vGain.connect(this.voiceGain);
      vOsc.start(now);
      vOsc.stop(now + 0.32);
    }
  }
}

export const audioEngine = new ImmersiveAudioEngine();
