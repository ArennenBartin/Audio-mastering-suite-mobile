import { Preset } from './types';

export const BASE_PRESETS: Preset[] = [
  {
    name: "Pillowy",
    intensity: 1.0,
    reactivity: 0.8,
    low: { gain: 1.2, drive: 0.1, filterCutoff: 180 },
    mid: { gain: 0.9, drive: 0.05, filterCutoff: 1200 },
    high: { gain: 1.0, drive: 0.05, filterCutoff: 8000 },
    space: { mix: 0.4, irType: "Pillowy", delayTime: 0.3, delayFeedback: 0.2 },
  },
  {
    name: "Tape",
    intensity: 1.1,
    reactivity: 0.6,
    low: { gain: 1.1, drive: 0.3, filterCutoff: 250 },
    mid: { gain: 1.0, drive: 0.2, filterCutoff: 2500 },
    high: { gain: 0.8, drive: 0.15, filterCutoff: 6500 },
    space: { mix: 0.1, irType: "Tape", delayTime: 0.15, delayFeedback: 0.3 },
  },
  {
    name: "Cathedral",
    intensity: 1.0,
    reactivity: 0.9,
    low: { gain: 1.0, drive: 0.05, filterCutoff: 120 },
    mid: { gain: 0.9, drive: 0.05, filterCutoff: 1500 },
    high: { gain: 1.1, drive: 0.05, filterCutoff: 9000 },
    space: { mix: 0.8, irType: "Cathedral", delayTime: 0.5, delayFeedback: 0.6 },
  },
  {
    name: "Tight",
    intensity: 1.2,
    reactivity: 0.4,
    low: { gain: 0.9, drive: 0.15, filterCutoff: 220 },
    mid: { gain: 1.1, drive: 0.2, filterCutoff: 2000 },
    high: { gain: 1.1, drive: 0.2, filterCutoff: 7500 },
    space: { mix: 0.1, irType: "Tight", delayTime: 0.1, delayFeedback: 0.0 },
  },
  {
    name: "Air",
    intensity: 1.0,
    reactivity: 0.8,
    low: { gain: 0.9, drive: 0.05, filterCutoff: 150 },
    mid: { gain: 1.0, drive: 0.1, filterCutoff: 3000 },
    high: { gain: 1.3, drive: 0.2, filterCutoff: 11000 },
    space: { mix: 0.3, irType: "Air", delayTime: 0.3, delayFeedback: 0.2 },
  },
  {
    name: "Wide",
    intensity: 1.1,
    reactivity: 0.7,
    low: { gain: 1.1, drive: 0.1, filterCutoff: 200 },
    mid: { gain: 0.8, drive: 0.15, filterCutoff: 2000 },
    high: { gain: 1.2, drive: 0.15, filterCutoff: 9000 },
    space: { mix: 0.5, irType: "Wide", delayTime: 0.25, delayFeedback: 0.5 },
  }
];
