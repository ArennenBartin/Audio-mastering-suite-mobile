export interface BandPreset {
  gain: number;
  drive: number;
  filterCutoff: number;
}

export interface Preset {
  name: string;
  low: BandPreset;
  mid: BandPreset;
  high: BandPreset;
  convolver: {
    mix: number;
    irType: "Pillowy" | "Tape" | "Cathedral" | "Tight" | "Air" | "Wide";
  };
  delay: {
    mix: number;
    time: number;
    feedback: number;
  };
  envToDrive: number;
}
