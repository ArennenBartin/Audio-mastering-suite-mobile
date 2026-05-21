import toWav from 'audiobuffer-to-wav';
import { Preset } from './types';

export interface AnalysisScore {
  globalPeak: number;
  envLow: AudioBuffer;
  envMid: AudioBuffer;
  envHigh: AudioBuffer;
  envFull: AudioBuffer;
}

function generateImpulseResponse(ctx: BaseAudioContext, duration: number, decay: number, type: string): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, sampleRate);
  for (let i = 0; i < 2; i++) {
    const channel = impulse.getChannelData(i);
    let prev = 0;
    for (let j = 0; j < length; j++) {
      let noise = (Math.random() * 2 - 1);
      // simple lowpass to soften harsh metallic noise
      noise = (noise + prev) * 0.5;
      prev = noise;

      if (type === 'Pillowy') noise *= Math.sin(j / length * Math.PI);
      else if (type === 'Tape') noise *= (Math.random() > 0.5 ? 1 : -1) * 0.5;
      else if (type === 'Tight') noise *= Math.exp(-j / (sampleRate * 0.1));
      
      channel[j] = noise * Math.exp(-j / (sampleRate * decay));
    }
  }
  return impulse;
}

function makeDistortionCurve(amount: number) {
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const drive = Math.max(amount * 2, 0.01);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

async function extractEnv(audioBuf: AudioBuffer, filterFreqs?: [number, number]): Promise<AudioBuffer> {
  const oCtx = new OfflineAudioContext(1, audioBuf.length, audioBuf.sampleRate);
  const source = oCtx.createBufferSource();
  const monoBuffer = oCtx.createBuffer(1, audioBuf.length, audioBuf.sampleRate);
  const mData = monoBuffer.getChannelData(0);
  const lData = audioBuf.getChannelData(0);
  const rData = audioBuf.numberOfChannels > 1 ? audioBuf.getChannelData(1) : lData;
  for (let i = 0; i < audioBuf.length; i++) {
    mData[i] = (lData[i] + rData[i]) * 0.5;
  }
  source.buffer = monoBuffer;

  let head: AudioNode = source;

  if (filterFreqs) {
    if (filterFreqs[0] > 0) {
      const hp = oCtx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = filterFreqs[0];
      head.connect(hp); head = hp;
    }
    if (filterFreqs[1] < 20000) {
      const lp = oCtx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = filterFreqs[1];
      head.connect(lp); head = lp;
    }
  }

  const shaper = oCtx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    curve[i] = Math.abs((i / 255) * 2 - 1);
  }
  shaper.curve = curve;
  head.connect(shaper);

  const smooth = oCtx.createBiquadFilter();
  smooth.type = 'lowpass';
  smooth.frequency.value = 5; // 5Hz LP for slow responsive breathing
  shaper.connect(smooth);
  smooth.connect(oCtx.destination);

  source.start(0);
  return await oCtx.startRendering();
}

export async function analyzeAudio(buffer: AudioBuffer): Promise<AnalysisScore> {
  // Peak scanning for pure gain staging safety
  let globalPeak = 0.01;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > globalPeak) globalPeak = abs;
    }
  }

  // Pass 1 Offline Extracts - true reactive foundations
  const envFull = await extractEnv(buffer);
  const envLow = await extractEnv(buffer, [0, 250]);
  const envMid = await extractEnv(buffer, [250, 4000]);
  const envHigh = await extractEnv(buffer, [4000, 20000]);

  return { globalPeak, envLow, envMid, envHigh, envFull };
}

function createLR4(ctx: BaseAudioContext, freq: number, type: 'lowpass' | 'highpass') {
  const f1 = ctx.createBiquadFilter();
  f1.type = type; f1.frequency.value = freq;
  f1.Q.value = 0.707;
  const f2 = ctx.createBiquadFilter();
  f2.type = type; f2.frequency.value = freq;
  f2.Q.value = 0.707;
  f1.connect(f2);
  return { in: f1, out: f2 };
}

export async function renderAudio(buffer: AudioBuffer, preset: Preset, analysis: AnalysisScore): Promise<ArrayBuffer> {
  const { globalPeak, envLow, envMid, envHigh, envFull } = analysis;
  const oCtx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

  const source = oCtx.createBufferSource();
  source.buffer = buffer;

  // Auto trim to leave safe headroom
  const trimLevel = (1.0 / globalPeak) * 0.7; // 3dB of native headroom prior to suite
  const trimGain = oCtx.createGain();
  trimGain.gain.value = trimLevel;
  source.connect(trimGain);

  // Linkwitz-Riley multi-band phase splits
  const lowSplit = createLR4(oCtx, 250, 'lowpass');
  const midSplitH = createLR4(oCtx, 250, 'highpass');
  const midSplitL = createLR4(oCtx, 4000, 'lowpass');
  const highSplit = createLR4(oCtx, 4000, 'highpass');

  trimGain.connect(lowSplit.in);
  trimGain.connect(midSplitH.in);
  midSplitH.out.connect(midSplitL.in);
  trimGain.connect(highSplit.in);

  function applyBand(input: AudioNode, bandPreset: Preset['low'], envB: AudioBuffer, reactAction: 'duck' | 'boost') {
    const g = oCtx.createGain();
    g.gain.value = Math.max(bandPreset.gain, 0.01);
    input.connect(g);

    // Warmth / Harmonic Drive Stage
    const shaper = oCtx.createWaveShaper();
    shaper.curve = makeDistortionCurve(bandPreset.drive);
    shaper.oversample = '4x';
    g.connect(shaper);

    const outGain = oCtx.createGain();
    outGain.gain.value = 1.0;
    shaper.connect(outGain);

    // Contextual Audio-Reactivity
    const reactScale = preset.reactivity;
    if (reactScale > 0) {
      const envSrc = oCtx.createBufferSource();
      envSrc.buffer = envB;
      const modGain = oCtx.createGain();
      
      if (reactAction === 'duck') {
        // Duck the signal when env is high
        modGain.gain.value = -reactScale;
        outGain.gain.value = 1.0;
      } else if (reactAction === 'boost') {
        // Boost the signal when env is low (thicken quiet parts)
        outGain.gain.value = 1.0 + (reactScale * 0.5);
        modGain.gain.value = -reactScale * 0.5;
      }
      
      envSrc.connect(modGain);
      modGain.connect(outGain.gain);
      envSrc.start(0);
    }

    const filter = oCtx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = bandPreset.filterCutoff;
    filter.Q.value = 0.5;
    filter.gain.value = 2.0; // gentle bump
    outGain.connect(filter);

    return filter;
  }

  // Low bolsters when dropping, Mid tucks on presence, High shimmers on dark spots
  const lowOut = applyBand(lowSplit.out, preset.low, envLow, 'boost');
  const midOut = applyBand(midSplitL.out, preset.mid, envMid, 'duck');
  const highOut = applyBand(highSplit.out, preset.high, envHigh, 'boost');

  const sum = oCtx.createGain();
  sum.gain.value = preset.intensity;
  lowOut.connect(sum);
  midOut.connect(sum);
  highOut.connect(sum);

  const fxBus = oCtx.createGain();
  sum.connect(fxBus);

  // Global Space (Reverb & Delay)
  const reverbWet = oCtx.createGain();
  reverbWet.gain.value = preset.space.mix;
  const convolver = oCtx.createConvolver();
  convolver.buffer = generateImpulseResponse(oCtx, 2.5, 2.0, preset.space.irType);
  fxBus.connect(convolver);
  convolver.connect(reverbWet);

  const delay = oCtx.createDelay(10.0);
  delay.delayTime.value = preset.space.delayTime;
  const delayFeedback = oCtx.createGain();
  delayFeedback.gain.value = preset.space.delayFeedback;
  
  const delayDamp = oCtx.createBiquadFilter();
  delayDamp.type = 'lowpass';
  delayDamp.frequency.value = 3000;
  
  const delayWet = oCtx.createGain();
  delayWet.gain.value = preset.space.mix * 0.8;
  
  fxBus.connect(delay);
  delay.connect(delayDamp);
  delayDamp.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(delayWet);

  // Space Mod (Ducked by Full Env so reverb steps out of the way of transients)
  const duckFX = oCtx.createGain();
  duckFX.gain.value = 1.0;
  if (preset.reactivity > 0) {
     const envS = oCtx.createBufferSource();
     envS.buffer = envFull;
     const mod = oCtx.createGain();
     mod.gain.value = -preset.reactivity * 0.9;
     envS.connect(mod);
     mod.connect(duckFX.gain);
     envS.start(0);
  }
  reverbWet.connect(duckFX);
  delayWet.connect(duckFX);
  
  const masterBus = oCtx.createGain();
  sum.connect(masterBus);
  duckFX.connect(masterBus);

  // Safety Soft Clip & Peak Limiter
  const finalShaper = oCtx.createWaveShaper();
  finalShaper.curve = makeDistortionCurve(0.1); // subtle harmonic finish
  finalShaper.oversample = '4x';
  masterBus.connect(finalShaper);

  const comp = oCtx.createDynamicsCompressor();
  comp.threshold.value = -1.0;
  comp.knee.value = 5.0;
  comp.ratio.value = 20.0;
  comp.attack.value = 0.005;
  comp.release.value = 0.05;
  finalShaper.connect(comp);
  comp.connect(oCtx.destination);

  source.start(0);
  const rendered = await oCtx.startRendering();
  return toWav(rendered);
}
