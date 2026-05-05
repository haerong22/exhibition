// Procedural sound effects using Web Audio API.
// No external files needed.

const STRIDE_DISTANCE = 1.3; // meters between footsteps

export class SoundManager {
  private audioCtx: AudioContext | null = null;
  // Always start muted — user opts in per session via M key or button
  private muted = true;
  private accumulatedDistance = 0;
  private stepIndex = 0;

  // Must be called from a user gesture (click, key press) due to autoplay policy
  ensureContext(): void {
    if (!this.audioCtx) {
      const Ctor = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      this.audioCtx = new Ctor();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  isMuted(): boolean { return this.muted; }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  // Track player movement and emit footsteps based on distance traveled
  onMove(distance: number): void {
    if (this.muted || distance <= 0) return;
    this.accumulatedDistance += distance;
    if (this.accumulatedDistance >= STRIDE_DISTANCE) {
      this.accumulatedDistance = 0;
      this.playFootstep();
    }
  }

  resetStride(): void {
    this.accumulatedDistance = 0;
  }

  playFootstep(): void {
    if (this.muted) return;
    this.ensureContext();
    const ctx = this.audioCtx;
    if (!ctx) return;

    const now = ctx.currentTime;
    const sampleRate = ctx.sampleRate;
    // Alternate L/R: slight tonal variation per foot
    const isLeft = (this.stepIndex++ % 2) === 0;
    const variance = 0.92 + Math.random() * 0.16;
    const pan = isLeft ? -0.18 : 0.18;

    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(ctx.destination);

    // ---- Layer 1: low body thud — heavy "뚜벅" weight ----
    const bodyDur = 0.13;
    const bodyLen = Math.floor(sampleRate * bodyDur);
    const bodyBuf = ctx.createBuffer(1, bodyLen, sampleRate);
    const bodyData = bodyBuf.getChannelData(0);
    for (let i = 0; i < bodyLen; i++) {
      const t = i / bodyLen;
      // Slight attack ramp + exponential decay — feels like sole pressing into floor
      const attack = Math.min(1, t / 0.04);
      const decay = Math.pow(1 - t, 3);
      bodyData[i] = (Math.random() - 0.5) * attack * decay;
    }
    const bodySrc = ctx.createBufferSource();
    bodySrc.buffer = bodyBuf;
    const bodyFilter = ctx.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.value = 220 * variance;
    bodyFilter.Q.value = 0.9;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.32;
    bodySrc.connect(bodyFilter).connect(bodyGain).connect(panner);
    bodySrc.start(now);

    // ---- Layer 2: muffled mid contact — soft sole-rub texture ----
    const midDur = 0.07;
    const midLen = Math.floor(sampleRate * midDur);
    const midBuf = ctx.createBuffer(1, midLen, sampleRate);
    const midData = midBuf.getChannelData(0);
    for (let i = 0; i < midLen; i++) {
      const t = i / midLen;
      const env = Math.pow(1 - t, 5);
      midData[i] = (Math.random() - 0.5) * env;
    }
    const midSrc = ctx.createBufferSource();
    midSrc.buffer = midBuf;
    const midFilter = ctx.createBiquadFilter();
    midFilter.type = 'bandpass';
    midFilter.frequency.value = 700 * variance;
    midFilter.Q.value = 0.8;
    const midGain = ctx.createGain();
    midGain.gain.value = 0.08;
    midSrc.connect(midFilter).connect(midGain).connect(panner);
    midSrc.start(now + 0.006);
  }
}
