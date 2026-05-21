import toWav from 'audiobuffer-to-wav';
import { Preset } from './types';

export interface AnalysisScore {
  inputPeak: number;
  inputRMS: number;
  envLow: AudioBuffer;
  envMid: AudioBuffer;
  envHigh: AudioBuffer;
  envFull: AudioBuffer;
  envTransient: AudioBuffer;
  envMotion: AudioBuffer;
}

export interface RenderStats {
  inputPeak: number;
  inputRMS: number;
  outputPeak: number;
  outputRMS: number;
}

export interface RenderResult {
  wav: ArrayBuffer;
  stats: RenderStats;
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

export async function analyzeAudio(buffer: AudioBuffer): Promise<AnalysisScore> {
  const numChannels = buffer.numberOfChannels;
  const length = buffer.length;
  const sr = buffer.sampleRate;

  const mono = new Float32Array(length);
  for (let c = 0; c < numChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) mono[i] += data[i] / numChannels;
  }

  let p = 0;
  let sumSq = 0;
  for (let i = 0; i < length; i++) {
    const abs = Math.abs(mono[i]);
    if (abs > p) p = abs;
    sumSq += abs * abs;
  }
  const inputPeak = p;
  const inputRMS = Math.sqrt(sumSq / length);

  const oCtx = new OfflineAudioContext(3, length, sr);
  const src = oCtx.createBufferSource();
  const monoBuf = oCtx.createBuffer(1, length, sr);
  monoBuf.copyToChannel(mono, 0);
  src.buffer = monoBuf;

  const lowFilter = oCtx.createBiquadFilter(); lowFilter.type = 'lowpass'; lowFilter.frequency.value = 250;
  const midFilterH = oCtx.createBiquadFilter(); midFilterH.type = 'highpass'; midFilterH.frequency.value = 250;
  const midFilterL = oCtx.createBiquadFilter(); midFilterL.type = 'lowpass'; midFilterL.frequency.value = 4000;
  const highFilter = oCtx.createBiquadFilter(); highFilter.type = 'highpass'; highFilter.frequency.value = 4000;

  const merger = oCtx.createChannelMerger(3);
  src.connect(lowFilter); lowFilter.connect(merger, 0, 0);
  src.connect(midFilterH); midFilterH.connect(midFilterL); midFilterL.connect(merger, 0, 1);
  src.connect(highFilter); highFilter.connect(merger, 0, 2);
  src.start(0);

  const bandsBuffer = await oCtx.startRendering();

  const hop = Math.floor(sr / 1000); // 1ms hop size
  const cLen = Math.ceil(length / hop);

  const envLow = oCtx.createBuffer(1, length, sr);
  const envMid = oCtx.createBuffer(1, length, sr);
  const envHigh = oCtx.createBuffer(1, length, sr);
  const envFull = oCtx.createBuffer(1, length, sr);
  const envTransient = oCtx.createBuffer(1, length, sr);
  const envMotion = oCtx.createBuffer(1, length, sr);

  const lOut = envLow.getChannelData(0);
  const mOut = envMid.getChannelData(0);
  const hOut = envHigh.getChannelData(0);
  const fOut = envFull.getChannelData(0);
  const tOut = envTransient.getChannelData(0);
  const moOut = envMotion.getChannelData(0);

  const lIn = bandsBuffer.getChannelData(0);
  const mIn = bandsBuffer.getChannelData(1);
  const hIn = bandsBuffer.getChannelData(2);

  const attack = 0.3;
  const release = 0.05;

  let pl=0, pm=0, ph=0, pf=0;
  let prevF=0, prevM=0, prevH=0;
  for (let i = 0; i < cLen; i++) {
    const start = i * hop;
    const end = Math.min(start + hop, length);
    let sl=0, sm=0, sh=0, sf=0;
    for (let j = start; j < end; j++) {
      sl += Math.abs(lIn[j]); sm += Math.abs(mIn[j]); sh += Math.abs(hIn[j]); sf += Math.abs(mono[j]);
    }
    const n = end - start;
    const vl = sl/n; const vm = sm/n; const vh = sh/n; const vf = sf/n;

    const cvL = pl + (vl > pl ? attack : release) * (vl - pl); pl = cvL;
    const cvM = pm + (vm > pm ? attack : release) * (vm - pm); pm = cvM;
    const cvH = ph + (vh > ph ? attack : release) * (vh - ph); ph = cvH;
    const cvF = pf + (vf > pf ? attack : release) * (vf - pf); pf = cvF;

    const cvT = Math.max(0, cvF - prevF) * 15;
    const cvMo = (Math.abs(cvM - prevM) + Math.abs(cvH - prevH)) * 25;
    
    prevF = cvF; prevM = cvM; prevH = cvH;

    for (let j = start; j < end; j++) {
      lOut[j] = cvL;
      mOut[j] = cvM;
      hOut[j] = cvH;
      fOut[j] = cvF;
      tOut[j] = cvT;
      moOut[j] = cvMo;
    }
  }

  const smoothPass = (arr: Float32Array, alpha: number) => {
    let prev = arr[0];
    for (let i = 0; i < arr.length; i++) {
      arr[i] = prev + alpha * (arr[i] - prev);
      prev = arr[i];
    }
  };
  
  smoothPass(lOut, 0.01); smoothPass(mOut, 0.01); smoothPass(hOut, 0.01);
  smoothPass(fOut, 0.005); smoothPass(tOut, 0.02); smoothPass(moOut, 0.005);

  return { inputPeak, inputRMS, envLow, envMid, envHigh, envFull, envTransient, envMotion };
}

function createLR4(ctx: BaseAudioContext, freq: number, type: 'lowpass' | 'highpass') {
  const f1 = ctx.createBiquadFilter(); f1.type = type; f1.frequency.value = freq; f1.Q.value = 0.707;
  const f2 = ctx.createBiquadFilter(); f2.type = type; f2.frequency.value = freq; f2.Q.value = 0.707;
  f1.connect(f2);
  return { in: f1, out: f2 };
}

export async function renderAudio(buffer: AudioBuffer, preset: Preset, analysis: AnalysisScore): Promise<RenderResult> {
  const oCtx = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  
  function playEnv(envBuf: AudioBuffer) {
    const src = oCtx.createBufferSource();
    src.buffer = envBuf;
    src.start(0);
    return src;
  }
  
  const envLow = playEnv(analysis.envLow);
  const envMid = playEnv(analysis.envMid);
  const envHigh = playEnv(analysis.envHigh);
  const envFull = playEnv(analysis.envFull);
  const envTrans = playEnv(analysis.envTransient);
  const envMotion = playEnv(analysis.envMotion);
  
  function createMod(base: number, modNode: AudioNode, depth: number) {
    const vca = oCtx.createGain();
    vca.gain.value = base;
    const depthNode = oCtx.createGain();
    depthNode.gain.value = depth;
    modNode.connect(depthNode);
    depthNode.connect(vca.gain);
    return vca;
  }

  const safeIn = oCtx.createGain();
  const headroomToLeave = 0.5; // -6dB safe head room
  safeIn.gain.value = headroomToLeave / Math.max(analysis.inputPeak, 0.01);
  
  const source = oCtx.createBufferSource();
  source.buffer = buffer;
  source.connect(safeIn);
  source.start(0);

  const lowSplit = createLR4(oCtx, 250, 'lowpass');
  const midSplitH = createLR4(oCtx, 250, 'highpass');
  const midSplitL = createLR4(oCtx, 4000, 'lowpass');
  const highSplit = createLR4(oCtx, 4000, 'highpass');

  safeIn.connect(lowSplit.in);
  safeIn.connect(midSplitH.in); midSplitH.out.connect(midSplitL.in);
  safeIn.connect(highSplit.in);

  // LOW BAND: Thickener and Kick Tighter
  const lowBaseIn = oCtx.createGain(); lowBaseIn.gain.value = preset.low.gain;
  lowSplit.out.connect(lowBaseIn);
  const lowThickVCA = createMod(1.0 + preset.motionAmount, envLow, -preset.motionAmount * 2.0);
  lowBaseIn.connect(lowThickVCA);
  const lowTransDuck = createMod(1.0, envTrans, -preset.motionAmount);
  lowThickVCA.connect(lowTransDuck);
  const lowSat = oCtx.createWaveShaper(); lowSat.curve = makeDistortionCurve(preset.low.drive * 0.5); lowSat.oversample = '2x';
  lowTransDuck.connect(lowSat);

  // MID BAND: Presence Ducking and Living Tone
  const midBaseIn = oCtx.createGain(); midBaseIn.gain.value = preset.mid.gain;
  midSplitL.out.connect(midBaseIn);
  const midDuck = createMod(1.0 + preset.motionAmount * 0.5, envMid, -preset.motionAmount * 1.5);
  midBaseIn.connect(midDuck);
  const midFilter = oCtx.createBiquadFilter(); midFilter.type = 'peaking'; midFilter.frequency.value = preset.mid.filterCutoff; midFilter.Q.value = 0.5; midFilter.gain.value = 1.0; 
  const midMotionMod = oCtx.createGain(); midMotionMod.gain.value = preset.motionAmount * 800; 
  envMotion.connect(midMotionMod); midMotionMod.connect(midFilter.frequency);
  midDuck.connect(midFilter);
  const midSat = oCtx.createWaveShaper(); midSat.curve = makeDistortionCurve(preset.mid.drive * 0.3);
  midFilter.connect(midSat);

  // HIGH BAND: Air Enhancer & Shimmer 
  const highBaseIn = oCtx.createGain(); highBaseIn.gain.value = preset.high.gain;
  highSplit.out.connect(highBaseIn);
  const highShimmerVCA = createMod(1.0 + preset.airShimmer, envFull, -preset.airShimmer * 2.0);
  highBaseIn.connect(highShimmerVCA);
  const highSat = oCtx.createWaveShaper(); highSat.curve = makeDistortionCurve(preset.high.drive * 0.4);
  highShimmerVCA.connect(highSat);

  const sum = oCtx.createGain(); sum.gain.value = preset.masterAmount;
  lowSat.connect(sum); midSat.connect(sum); highSat.connect(sum);

  // GLOBAL SPACE
  const fxBus = oCtx.createGain();
  sum.connect(fxBus);
  const spaceMix = preset.space.mix * preset.spaceBreath;
  
  const reverbWet = oCtx.createGain(); reverbWet.gain.value = spaceMix;
  const convolver = oCtx.createConvolver(); convolver.buffer = generateImpulseResponse(oCtx, 2.5, 2.0, preset.space.irType);
  fxBus.connect(convolver); convolver.connect(reverbWet);

  const delay = oCtx.createDelay(10.0); delay.delayTime.value = preset.space.delayTime;
  const delayFeedback = oCtx.createGain(); delayFeedback.gain.value = preset.space.delayFeedback;
  const delayDamp = oCtx.createBiquadFilter(); delayDamp.type = 'lowpass'; delayDamp.frequency.value = 3000;
  const delayWet = oCtx.createGain(); delayWet.gain.value = spaceMix * 0.8;
  fxBus.connect(delay); delay.connect(delayDamp); delayDamp.connect(delayFeedback); delayFeedback.connect(delay); delay.connect(delayWet);

  // Space Ducking
  const spaceDucker = createMod(1.0, envFull, -0.8 * preset.spaceBreath); // Ducks when loud
  reverbWet.connect(spaceDucker); delayWet.connect(spaceDucker);

  const masterBus = oCtx.createGain();
  sum.connect(masterBus); spaceDucker.connect(masterBus);

  // TONE CORRECTION & FINAL MASTERING
  const toneEQ = oCtx.createBiquadFilter(); toneEQ.type = 'highshelf'; toneEQ.frequency.value = 8000; toneEQ.gain.value = preset.airShimmer * 3.0; 
  masterBus.connect(toneEQ);

  const finalDrive = oCtx.createWaveShaper(); finalDrive.curve = makeDistortionCurve(0.05);
  toneEQ.connect(finalDrive);

  const limiter = oCtx.createDynamicsCompressor();
  limiter.threshold.value = preset.safetyLimit;
  limiter.knee.value = 0.0;
  limiter.ratio.value = 20.0;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.1;

  finalDrive.connect(limiter);
  limiter.connect(oCtx.destination);

  const renderedBuffer = await oCtx.startRendering();

  let oP = 0; let oSumSq = 0;
  for (let c = 0; c < renderedBuffer.numberOfChannels; c++) {
    const data = renderedBuffer.getChannelData(c);
    for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i]);
        if (abs > oP) oP = abs;
        oSumSq += abs * abs;
    }
  }
  const outputPeak = oP;
  const outputRMS = Math.sqrt(oSumSq / (renderedBuffer.numberOfChannels * renderedBuffer.length));

  return {
    wav: toWav(renderedBuffer),
    stats: { inputPeak: analysis.inputPeak, inputRMS: analysis.inputRMS, outputPeak, outputRMS }
  };
}
