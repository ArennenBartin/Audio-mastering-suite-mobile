export interface BandPreset {
  gain: number;
  drive: number;
  filterCutoff: number;
}

export interface Preset {
  name: string;
  intensity: number;
  reactivity: number;
  low: BandPreset;
  mid: BandPreset;
  high: BandPreset;
  space: {
    mix: number;
    irType: "Pillowy" | "Tape" | "Cathedral" | "Tight" | "Air" | "Wide";
    delayTime: number;
    delayFeedback: number;
  };
}
