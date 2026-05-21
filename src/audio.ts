import { Preset } from './types';
import toWav from 'audiobuffer-to-wav';
import * as Tone from 'tone';

// Polyfill essentia
declare global {
  interface Window {
    EssentiaWASM: any;
    EssentiaJS: any;
  }
}

// Generate simple impulse responses for Convolver
function generateImpulseResponse(ctx: BaseAudioContext, duration: number, decay: number, type: Preset['convolver']['irType']): AudioBuffer {
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

// Create a WaveShaper curve for drive
function makeDistortionCurve(amount: number) {
  const n_samples = 44100;
  const curve = new Float32Array(n_samples);
  const drive = Math.max(amount * 10, 0.01);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n_samples; ++i) {
    const x = (i * 2) / n_samples - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

export async function extractBPM(audioBuffer: AudioBuffer): Promise<number> {
  if (!window.EssentiaWASM || !window.EssentiaJS) return 120; // fallback
  return new Promise((resolve) => {
    window.EssentiaWASM().then((WasmModule: any) => {
      const essentia = new window.EssentiaJS(WasmModule);
      // use left channel
      const audioData = essentia.arrayToVector(audioBuffer.getChannelData(0));
      // compute rhythm
      const metric = essentia.PercivalBpmEstimator(audioData, 1024, 2048, 44100, 44100);
      resolve(metric.bpm || 120);
    });
  });
}

function createBand(
  ctx: OfflineAudioContext, 
  input: any, 
  presetBand: Preset['low'] | Preset['mid'] | Preset['high'], 
  envFollower: Tone.Follower,
  envToDrive: number
) {
  const group = ctx.createGain();
  
  // Pre-Gain
  const preGain = ctx.createGain();
  preGain.gain.value = presetBand.gain;
  input.connect(preGain);

  // Crossfade between dry and wet
  const crossFade = new Tone.CrossFade(presetBand.drive);
  
  // Audio-reactive drive modulation mapping:
  const scale = new Tone.Scale(0, envToDrive);
  Tone.connect(envFollower, scale);
  Tone.connect(scale, crossFade.fade);
  
  // Heavy smooth distortion curve for the wet path
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeDistortionCurve(0.8);
  shaper.oversample = '4x';
  
  // Drive gain into shaper
  const shaperDriveIn = ctx.createGain();
  shaperDriveIn.gain.value = 4.0;
  // Volume compensation
  const shaperDriveOut = ctx.createGain();
  shaperDriveOut.gain.value = 0.4;
  
  // Dry path
  Tone.connect(preGain, crossFade.a);
  
  // Wet path
  preGain.connect(shaperDriveIn);
  shaperDriveIn.connect(shaper);
  shaper.connect(shaperDriveOut);
  Tone.connect(shaperDriveOut, crossFade.b);

  // Filter
  const filter = ctx.createBiquadFilter();
  filter.type = 'peaking';
  filter.frequency.value = presetBand.filterCutoff;
  filter.Q.value = 0.5; // smoother
  filter.gain.value = 2.0;

  Tone.connect(crossFade, filter);
  filter.connect(group);

  return group;
}

export async function renderAudio(buffer: AudioBuffer, preset: Preset): Promise<{ wav: ArrayBuffer, bpm: number }> {
    const bpm = await extractBPM(buffer);
    
    // We will render using Tone.Offline so that we can easily use Tone's nodes
    const renderedBuffer = await Tone.Offline(async () => {
        const source = new Tone.BufferSource(buffer).start(0);
        const currentToneContext = Tone.getContext();
        const ctx = currentToneContext.rawContext as OfflineAudioContext;
        
        // Linkwitz-Riley crossover using Tone.MultibandSplit
        // LR4 crossover at 200Hz and 4kHz
        const split = new Tone.MultibandSplit({
            lowFrequency: 200,
            highFrequency: 4000
        });
        
        source.connect(split);

        // Env followers for each band
        const lowFollower = new Tone.Follower({ smoothing: 0.1 });
        const midFollower = new Tone.Follower({ smoothing: 0.05 });
        const highFollower = new Tone.Follower({ smoothing: 0.02 });
        
        split.low.connect(lowFollower);
        split.mid.connect(midFollower);
        split.high.connect(highFollower);
        
        const lowBand = createBand(ctx, split.low, preset.low, lowFollower, preset.envToDrive);
        const midBand = createBand(ctx, split.mid, preset.mid, midFollower, preset.envToDrive);
        const highBand = createBand(ctx, split.high, preset.high, highFollower, preset.envToDrive);

        const buildBus = ctx.createGain();
        lowBand.connect(buildBus);
        midBand.connect(buildBus);
        highBand.connect(buildBus);
        
        // Effects Bus
        const fxBus = ctx.createGain();
        buildBus.connect(fxBus);
        
        // Delay
        if (preset.delay.mix > 0) {
            const delay = new Tone.PingPongDelay({
                delayTime: preset.delay.time,
                feedback: preset.delay.feedback,
                wet: preset.delay.mix
            });
            Tone.connect(fxBus, delay);
            delay.toDestination();
        }

        // Convolver
        if (preset.convolver.mix > 0) {
            const convolver = ctx.createConvolver();
            convolver.buffer = generateImpulseResponse(ctx, 2.5, 2.0, preset.convolver.irType);
            const convWet = ctx.createGain();
            convWet.gain.value = preset.convolver.mix;
            
            fxBus.connect(convolver);
            convolver.connect(convWet);
            Tone.connect(convWet, Tone.getDestination());
        }

        // Dry Sum
        Tone.connect(buildBus, Tone.getDestination());
        
        // Safety Limiter
        const limiter = new Tone.Limiter(-0.5);
        // By default Tone.Destination is where toDestination() outputs
        // We ensure we don't clip output
        Tone.getDestination().chain(limiter);

    }, buffer.duration, buffer.numberOfChannels || 2, buffer.sampleRate);
    
    // Format to WAV
    const wav = toWav(renderedBuffer.get());
    return { wav, bpm };
}
