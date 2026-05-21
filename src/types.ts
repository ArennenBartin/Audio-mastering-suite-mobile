export interface BandPreset {
  gain: number;
  drive: number;
  filterCutoff: number;
}

export interface Preset {
  name: string;
  masterAmount: number;
  motionAmount: number;
  spaceBreath: number;
  airShimmer: number;
  safetyLimit: number;
  dramaticMode: boolean;
  dramaticAmount: number;
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
