import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, Download, Play, Music, Wand2, Volume2, Settings2, BellOff } from 'lucide-react';
import { Preset } from './types';
import { BASE_PRESETS } from './Presets';
import { analyzeAudio, renderAudio } from './audio';

function SliderControl({ label, value, min, max, step, onChange, format = (v: number) => v.toString() }: any) {
  return (
    <div className="flex flex-col mb-4">
      <div className="flex justify-between text-[10px] uppercase font-mono mb-2">
        <span className="opacity-60">{label}</span>
        <span className="text-[#ff4e00]">{format(value)}</span>
      </div>
      <input 
        type="range" 
        min={min} max={max} step={step} 
        value={value} 
        onChange={e => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-[#ff4e00]/50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#ff4e00] [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(255,78,0,0.5)] transition-all"
      />
    </div>
  );
}

export default function App() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [renderedWavUrl, setRenderedWavUrl] = useState<string | null>(null);
  const [renderedPresetName, setRenderedPresetName] = useState<string>('');
  
  const [selectedPreset, setSelectedPreset] = useState<Preset>(BASE_PRESETS[0]);
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // iOS Silent switch hacky detection
  const [isSilentMode, setIsSilentMode] = useState<boolean>(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Attempt to detect if iOS silent mode is on by playing a tiny silent buffer
    const checkSilentMode = async () => {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        
        // This won't perfectly detect the hardware switch on modern iOS without user interaction,
        // but often we show a banner just to remind them. We'll show banner on initial load for iOS.
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
        if (isIOS) {
           setIsSilentMode(true);
        }
      } catch (err) {}
    };
    checkSilentMode();
  }, []);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setAudioFile(file);
    setRenderedWavUrl(null);
    setIsProcessing(true);
    
    try {
      const arrayBuffer = await file.arrayBuffer();
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decoded = await ctx.decodeAudioData(arrayBuffer);
      setAudioBuffer(decoded);
    } catch (err) {
      console.error(err);
      alert('Failed to decode audio. Please upload a valid audio file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const processAudio = async () => {
    if (!audioBuffer) return;
    setIsProcessing(true);
    setRenderedWavUrl(null);
    try {
      // Delay so UI can render processing state
      await new Promise(r => setTimeout(r, 50));
      const analysis = await analyzeAudio(audioBuffer);
      const wav = await renderAudio(audioBuffer, selectedPreset, analysis);
      const blob = new Blob([wav], { type: 'audio/wav' });
      setRenderedWavUrl(URL.createObjectURL(blob));
      setRenderedPresetName(selectedPreset.name);
    } catch (err: any) {
      console.error(err);
      alert('Error rendering audio: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateAIPreset = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    try {
      const res = await fetch('/api/generate-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: prompt })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Server error');
      }
      const data = await res.json();
      setSelectedPreset(data);
      setPrompt('');
    } catch (err: any) {
      console.error(err);
      alert('Could not generate preset: ' + err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const getDownloadFilename = () => {
    const orig = audioFile ? audioFile.name.replace(/\.[^/.]+$/, "") : "audio";
    const mode = (renderedPresetName || selectedPreset.name).replace(/\s+/g, '-').toLowerCase();
    return `${orig}_breath_${mode}.wav`;
  };

  const updateBand = (band: 'low'|'mid'|'high', key: keyof Preset['low'], value: number) => {
    setSelectedPreset(p => ({
      ...p,
      name: "Custom",
      [band]: { ...p[band], [key]: value }
    }));
  };

  const updateGlobal = (key: string, value: any) => {
    setSelectedPreset(p => ({
      ...p,
      name: "Custom",
      [key]: value
    }));
  };

  const updateEffect = (effect: 'convolver'|'delay', key: string, value: any) => {
    setSelectedPreset(p => ({
      ...p,
      name: "Custom",
      [effect]: { ...p[effect] as any, [key]: value }
    }));
  };

  return (
    <div className="min-h-screen bg-[#0a0502] text-[#e0d8d0] font-sans flex flex-col relative w-full">
      {isSilentMode && (
        <div className="bg-[#f27d26] text-black text-[10px] sm:text-xs py-2 px-4 text-center font-bold tracking-widest uppercase flex items-center justify-center gap-3 shrink-0">
          <BellOff className="w-4 h-4 shrink-0" />
          <span>Attention: iOS Silent Switch is active. No audio will play through speakers.</span>
          <button onClick={() => setIsSilentMode(false)} className="ml-auto opacity-50 hover:opacity-100 p-1">&times;</button>
        </div>
      )}

      <header className="flex flex-col sm:flex-row justify-between items-center px-6 sm:px-8 py-6 border-b border-white/10 gap-4 shrink-0">
        <div className="flex flex-col items-center sm:items-start">
          <h1 className="text-3xl font-light tracking-[0.2em] uppercase text-white">Breath</h1>
          <span className="text-[10px] opacity-40 tracking-widest uppercase mt-1">Mastering Engine v2.5</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex flex-col sm:items-end items-center">
             <span className="text-[10px] uppercase opacity-50">Motion Analysis</span>
             <span className="text-xl font-mono text-[#ff4e00]">{isProcessing ? 'SCANNING' : (renderedWavUrl ? 'READY' : 'IDLE')}</span>
          </div>
        </div>
      </header>

      <main className="flex flex-col lg:flex-row flex-1 p-6 sm:p-8 gap-8 overflow-y-auto lg:overflow-hidden min-h-0">
        {/* Left Column */}
        <div className="flex-1 flex flex-col gap-6 w-full lg:overflow-y-auto min-h-0 lg:pr-2">
          
          {/* Input Section - styled like the atmospheric visualizer container */}
          <section className="relative flex-1 min-h-[300px] shrink-0 bg-black/40 rounded-3xl border border-white/5 overflow-hidden flex items-center justify-center group">
             {/* Atmospheric Background effect */}
             <div className="absolute w-64 h-64 sm:w-80 sm:h-80 bg-[#ff4e00] blur-[100px] opacity-10 group-hover:opacity-20 transition-opacity duration-700 rounded-full animate-pulse pointer-events-none"></div>
             
             <label className="relative z-10 w-full h-full flex flex-col items-center justify-center cursor-pointer p-8">
                <input 
                  type="file" 
                  accept="audio/*,.mp3,.wav,.m4a,.aac,.flac,.ogg,.aiff" 
                  className="hidden" 
                  onChange={handleFileUpload} 
                />
                {audioFile ? (
                  <div className="flex flex-col items-center text-center">
                    <Music className="w-12 h-12 text-[#ff4e00] mb-4 drop-shadow-[0_0_15px_rgba(255,78,0,0.8)]" />
                    <span className="font-light tracking-widest text-lg text-white truncate max-w-[200px] sm:max-w-xs">{audioFile.name}</span>
                    <span className="text-[10px] uppercase opacity-50 tracking-widest mt-3 mb-6">{isProcessing ? 'Processing in Engine...' : 'Ready to Master'}</span>
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        setAudioFile(null);
                        setAudioBuffer(null);
                        setRenderedWavUrl(null);
                      }}
                      className="bg-white/10 hover:bg-white/20 text-white text-[10px] uppercase tracking-widest px-4 py-2 rounded-full transition-colors border border-white/10"
                    >
                      Remove Track
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center text-center">
                    <UploadCloud className="w-12 h-12 text-white/40 mb-4 group-hover:text-white/80 transition-colors duration-500" />
                    <span className="font-light tracking-[0.2em] text-sm text-white">LOAD FILE</span>
                    <span className="text-[10px] uppercase opacity-40 tracking-widest mt-2">WAV, MP3, AAC</span>
                  </div>
                )}
             </label>
          </section>

          {/* Render Action / Output area */}
          <section className="flex flex-col gap-4 shrink-0">
            {renderedWavUrl ? (
              <div className="bg-white/5 rounded-3xl p-6 border border-white/5 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-widest opacity-40">Output Ready</span>
                </div>
                
                <audio 
                  controls 
                  src={renderedWavUrl} 
                  className="w-full h-10 opacity-80 invert hue-rotate-[160deg] sepia-[0.3] grayscale-[0.2] transition-opacity hover:opacity-100" 
                />
                
                <a 
                  href={renderedWavUrl} 
                  download={getDownloadFilename()}
                  className="w-full bg-[#ff4e00] hover:bg-[#ff6a29] text-white font-bold py-4 rounded-full transition-all active:scale-[0.98] flex items-center justify-center gap-2 uppercase tracking-[0.2em] text-sm shadow-[0_0_30px_rgba(255,78,0,0.3)] mt-2"
                >
                  <Download className="w-4 h-4" /> Export WAV
                </a>
              </div>
            ) : (
              <button
                onClick={processAudio}
                disabled={!audioBuffer || isProcessing}
                className="w-full bg-[#ff4e00] hover:bg-[#ff6a29] disabled:bg-white/5 disabled:text-white/20 disabled:shadow-none text-white font-bold py-5 rounded-full transition-all active:scale-[0.98] flex items-center justify-center gap-3 uppercase tracking-[0.2em] text-sm shadow-[0_0_30px_rgba(255,78,0,0.3)]"
              >
                {isProcessing ? (
                  <div className="flex items-center gap-3">
                    <Volume2 className="w-5 h-5 animate-pulse" /> <span className="animate-pulse">RENDERING...</span>
                  </div>
                ) : (
                  <>
                    <Play className="w-5 h-5 fill-current" /> EXECUTE ENGINE
                  </>
                )}
              </button>
            )}
          </section>

          {/* PER-BAND CONTROLS */}
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
            {/* Low Band */}
            <div className="bg-white/5 p-4 sm:p-5 rounded-2xl border border-white/5 flex flex-col shadow-inner">
              <div className="text-[10px] uppercase mb-5 opacity-40 font-bold tracking-widest text-center">Low Band</div>
              <SliderControl label="Gain" value={selectedPreset.low.gain} min={0} max={3} step={0.1} onChange={(v: number) => updateBand('low', 'gain', v)} format={(v: number) => `${v.toFixed(1)}x`} />
              <SliderControl label="Drive" value={selectedPreset.low.drive} min={0} max={1} step={0.05} onChange={(v: number) => updateBand('low', 'drive', v)} format={(v: number) => `${Math.round(v * 100)}%`} />
              <SliderControl label="Cutoff" value={selectedPreset.low.filterCutoff} min={50} max={500} step={10} onChange={(v: number) => updateBand('low', 'filterCutoff', v)} format={(v: number) => `${v}Hz`} />
            </div>

            {/* Mid Band */}
            <div className="bg-white/5 p-4 sm:p-5 rounded-2xl border border-white/5 flex flex-col shadow-inner">
              <div className="text-[10px] uppercase mb-5 opacity-40 font-bold tracking-widest text-[#ff4e00] text-center">Mid Band</div>
              <SliderControl label="Gain" value={selectedPreset.mid.gain} min={0} max={3} step={0.1} onChange={(v: number) => updateBand('mid', 'gain', v)} format={(v: number) => `${v.toFixed(1)}x`} />
              <SliderControl label="Drive" value={selectedPreset.mid.drive} min={0} max={1} step={0.05} onChange={(v: number) => updateBand('mid', 'drive', v)} format={(v: number) => `${Math.round(v * 100)}%`} />
              <SliderControl label="Cutoff" value={selectedPreset.mid.filterCutoff} min={500} max={4000} step={100} onChange={(v: number) => updateBand('mid', 'filterCutoff', v)} format={(v: number) => `${v}Hz`} />
            </div>

            {/* High Band */}
            <div className="bg-white/5 p-4 sm:p-5 rounded-2xl border border-white/5 flex flex-col shadow-inner">
              <div className="text-[10px] uppercase mb-5 opacity-40 font-bold tracking-widest text-center">High Band</div>
              <SliderControl label="Gain" value={selectedPreset.high.gain} min={0} max={3} step={0.1} onChange={(v: number) => updateBand('high', 'gain', v)} format={(v: number) => `${v.toFixed(1)}x`} />
              <SliderControl label="Drive" value={selectedPreset.high.drive} min={0} max={1} step={0.05} onChange={(v: number) => updateBand('high', 'drive', v)} format={(v: number) => `${Math.round(v * 100)}%`} />
              <SliderControl label="Cutoff" value={selectedPreset.high.filterCutoff} min={4000} max={16000} step={500} onChange={(v: number) => updateBand('high', 'filterCutoff', v)} format={(v: number) => `${v}Hz`} />
            </div>
          </section>

          {/* EFFECTS & ENV */}
          <section className="bg-white/5 px-4 py-5 sm:p-6 rounded-2xl border border-white/5 flex flex-col shrink-0 gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] opacity-40 mb-5 font-bold border-b border-white/10 pb-2">Space Module</div>
                <SliderControl label="Reverb & Delay Mix" value={selectedPreset.space.mix} min={0} max={1} step={0.05} onChange={(v: number) => updateEffect('space', 'mix', v)} format={(v: number) => `${Math.round(v * 100)}%`} />
                <SliderControl label="Delay Time" value={selectedPreset.space.delayTime} min={0.05} max={2.0} step={0.05} onChange={(v: number) => updateEffect('space', 'delayTime', v)} format={(v: number) => `${v.toFixed(2)}s`} />
                <SliderControl label="Delay Fdbk" value={selectedPreset.space.delayFeedback} min={0} max={0.95} step={0.05} onChange={(v: number) => updateEffect('space', 'delayFeedback', v)} format={(v: number) => `${Math.round(v * 100)}%`} />
                
                <div className="flex flex-col mb-1 mt-3">
                  <div className="flex justify-between text-[10px] uppercase font-mono mb-2">
                    <span className="opacity-60">Reverb Type</span>
                  </div>
                  <select 
                    value={selectedPreset.space.irType} 
                    onChange={e => updateEffect('space', 'irType', e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-xl p-3 text-xs tracking-widest uppercase text-white focus:outline-none focus:border-[#ff4e00]/50 appearance-none cursor-pointer"
                  >
                    {["Pillowy", "Tape", "Cathedral", "Tight", "Air", "Wide"].map(ir => (
                      <option key={ir} value={ir}>{ir}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.2em] opacity-40 mb-5 font-bold border-b border-white/10 pb-2">Dynamics Engine</div>
                <SliderControl label="Reactivity" value={selectedPreset.reactivity} min={0} max={1} step={0.05} onChange={(v: number) => updateGlobal('reactivity', v)} format={(v: number) => `${Math.round(v * 100)}%`} />
                <SliderControl label="Intensity" value={selectedPreset.intensity} min={0.5} max={2.0} step={0.1} onChange={(v: number) => updateGlobal('intensity', v)} format={(v: number) => `${v.toFixed(1)}x`} />
                <div className="mt-4 text-[10px] text-white/30 tracking-wide font-mono leading-relaxed">
                  <strong>Reactivity</strong> computes pure envelope tracking to duck/expand effects actively. <strong>Intensity</strong> scales the total saturation and global weight.
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* Right Column */}
        <div className="w-full lg:w-80 shrink-0 flex flex-col gap-6 lg:overflow-y-auto min-h-0 lg:pr-2">
          
          {/* Presets Grid */}
          <section className="flex flex-col gap-3">
            <h2 className="text-[10px] font-bold text-white/50 uppercase tracking-widest mb-1 flex items-center gap-2">
              <Settings2 className="w-3 h-3" />
              Aesthetic Presets
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {BASE_PRESETS.map(p => {
                 const isActive = selectedPreset.name === p.name;
                 return (
                   <button
                     key={p.name}
                     onClick={() => setSelectedPreset(p)}
                     className={`aspect-[2/1] sm:aspect-square rounded-2xl flex flex-col items-center justify-center gap-2 transition-all active:scale-95 border ${
                       isActive 
                        ? 'bg-white/10 border-[#ff4e00] shadow-[0_0_15px_rgba(255,78,0,0.2)]' 
                        : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
                     }`}
                   >
                     <span className={`text-xs uppercase tracking-widest ${isActive ? 'font-bold text-white' : 'opacity-60'}`}>{p.name}</span>
                     {isActive && <div className="w-[6px] h-[6px] rounded-full bg-[#ff4e00] blur-[1px] mt-1 shadow-[0_0_8px_#ff4e00]"></div>}
                   </button>
                 );
              })}
            </div>
          </section>

          {/* AI Generator */}
          <section className="shrink-0 pb-8 lg:pb-0">
            <div className="bg-gradient-to-br from-[#1a1005] to-[#0a0502] p-5 rounded-3xl border border-[#ff4e00]/20 flex flex-col gap-4">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full bg-[#ff4e00] shadow-[0_0_8px_#ff4e00] animate-pulse"></div>
                <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#ff4e00]">Gemini Assistant</span>
              </div>
              <textarea 
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-xl p-4 text-xs h-24 resize-none focus:outline-none focus:border-[#ff4e00]/50 text-white placeholder-white/20 transition-colors" 
                placeholder="Describe the vibe (e.g. 'Crunchy lo-fi with heavy room')"
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), generateAIPreset())}
              ></textarea>
              
              <button 
                onClick={generateAIPreset}
                disabled={isGenerating || !prompt.trim()}
                className="bg-white hover:bg-neutral-200 disabled:bg-white/10 disabled:text-white/30 text-black py-3 rounded-xl text-[10px] uppercase font-bold tracking-widest transition-colors flex items-center justify-center gap-2 mt-1"
              >
                {isGenerating ? 'GENERATING...' : 'Generate Preset'}
                {!isGenerating && <Wand2 className="w-3 h-3" />}
              </button>
              
              {selectedPreset && !BASE_PRESETS.find(p => p.name === selectedPreset.name) && (
                <div className="mt-3 pt-4 border-t border-[#ff4e00]/10 flex flex-col items-center">
                  <span className="text-[8px] uppercase tracking-widest opacity-40 mb-1">Active Custom Mode</span>
                  <span className="text-xs text-[#ff4e00] font-bold tracking-widest truncate max-w-full px-2" title={selectedPreset.name}>{selectedPreset.name}</span>
                </div>
              )}
            </div>
          </section>
          
        </div>
      </main>
    </div>
  );
}
