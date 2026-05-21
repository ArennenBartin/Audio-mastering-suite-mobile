import { Preset } from './types';

export const BASE_PRESETS: Preset[] = [
  {
    name: "Pillowy",
    low: { gain: 1.5, drive: 0.1, filterCutoff: 180 },
    mid: { gain: 0.8, drive: 0.4, filterCutoff: 1200 },
    high: { gain: 1.0, drive: 0.2, filterCutoff: 8000 },
    convolver: { mix: 0.4, irType: "Pillowy" },
    delay: { mix: 0.1, time: 0.3, feedback: 0.2 },
    envToDrive: 0.3
  },
  {
    name: "Tape",
    low: { gain: 1.2, drive: 0.7, filterCutoff: 250 },
    mid: { gain: 1.0, drive: 0.8, filterCutoff: 2500 },
    high: { gain: 0.7, drive: 0.5, filterCutoff: 6500 },
    convolver: { mix: 0.1, irType: "Tape" },
    delay: { mix: 0.2, time: 0.15, feedback: 0.4 },
    envToDrive: 0.6
  },
  {
    name: "Cathedral",
    low: { gain: 1.0, drive: 0.1, filterCutoff: 120 },
    mid: { gain: 0.9, drive: 0.1, filterCutoff: 1500 },
    high: { gain: 1.3, drive: 0.1, filterCutoff: 9000 },
    convolver: { mix: 0.8, irType: "Cathedral" },
    delay: { mix: 0.3, time: 0.5, feedback: 0.6 },
    envToDrive: 0.1
  },
  {
    name: "Tight",
    low: { gain: 0.9, drive: 0.3, filterCutoff: 220 },
    mid: { gain: 1.1, drive: 0.3, filterCutoff: 2000 },
    high: { gain: 1.1, drive: 0.4, filterCutoff: 7500 },
    convolver: { mix: 0.2, irType: "Tight" },
    delay: { mix: 0.0, time: 0.1, feedback: 0.0 },
    envToDrive: 0.8
  },
  {
    name: "Air",
    low: { gain: 0.8, drive: 0.1, filterCutoff: 150 },
    mid: { gain: 1.0, drive: 0.2, filterCutoff: 3000 },
    high: { gain: 1.6, drive: 0.6, filterCutoff: 11000 },
    convolver: { mix: 0.3, irType: "Air" },
    delay: { mix: 0.1, time: 0.3, feedback: 0.2 },
    envToDrive: 0.4
  },
  {
    name: "Wide",
    low: { gain: 1.1, drive: 0.2, filterCutoff: 200 },
    mid: { gain: 0.8, drive: 0.3, filterCutoff: 2000 },
    high: { gain: 1.4, drive: 0.3, filterCutoff: 9000 },
    convolver: { mix: 0.5, irType: "Wide" },
    delay: { mix: 0.4, time: 0.25, feedback: 0.5 },
    envToDrive: 0.5
  }
];
