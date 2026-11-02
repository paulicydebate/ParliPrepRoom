// Gov/Opp color pairs for the flow, speech tags and sheet dots. Each color
// has a deeper shade for light backgrounds and a brighter one for dark mode,
// so text stays readable on both.

export interface Tone {
  light: string;
  dark: string;
}

export interface Colorway {
  id: string;
  label: string;
  gov: Tone;
  opp: Tone;
}

const t = (light: string, dark: string): Tone => ({ light, dark });

const BLUE = t('#1f5fc9', '#7aa7ff');
const RED = t('#c62828', '#ff7b72');
const TEAL = t('#0f766e', '#2dd4bf');
const ORANGE = t('#c2410c', '#fb923c');
const GREEN = t('#15803d', '#4ade80');
const PINK = t('#be185d', '#f472b6');
const PURPLE = t('#6d28d9', '#b794f6');
const GOLD = t('#a16207', '#facc15');
const NAVY = t('#1e3a8a', '#a5b4fc');
const FOREST = t('#166534', '#5edc8a');
const CRIMSON = t('#b91c1c', '#f87171');
const SILVER = t('#475569', '#cbd5e1');
const MAROON = t('#7f1d1d', '#f19a9a');
const BLACK = t('#1f2937', '#d1d5db');
const SKY = t('#0369a1', '#7dd3fc');
const LIME = t('#4d7c0f', '#a3e635');
const MAGENTA = t('#a21caf', '#f0abfc');
const YELLOW = t('#a16207', '#fde047');

export const COLORWAYS: Colorway[] = [
  { id: 'blue-red', label: 'Blue & Red', gov: BLUE, opp: RED },
  { id: 'teal-orange', label: 'Teal & Orange', gov: TEAL, opp: ORANGE },
  { id: 'blue-orange', label: 'Blue & Orange', gov: BLUE, opp: ORANGE },
  { id: 'green-pink', label: 'Green & Pink', gov: GREEN, opp: PINK },
  { id: 'purple-gold', label: 'Purple & Gold', gov: PURPLE, opp: GOLD },
  { id: 'purple-yellow', label: 'Purple & Yellow', gov: PURPLE, opp: YELLOW },
  { id: 'navy-gold', label: 'Navy & Gold', gov: NAVY, opp: GOLD },
  { id: 'green-gold', label: 'Green & Gold', gov: FOREST, opp: GOLD },
  { id: 'maroon-gold', label: 'Maroon & Gold', gov: MAROON, opp: GOLD },
  { id: 'red-gold', label: 'Red & Gold', gov: CRIMSON, opp: GOLD },
  { id: 'crimson-silver', label: 'Crimson & Silver', gov: CRIMSON, opp: SILVER },
  { id: 'teal-black', label: 'Teal & Black', gov: TEAL, opp: BLACK },
  { id: 'sky-navy', label: 'Sky & Navy', gov: SKY, opp: NAVY },
  { id: 'orange-navy', label: 'Orange & Navy', gov: ORANGE, opp: NAVY },
  { id: 'purple-teal', label: 'Purple & Teal', gov: PURPLE, opp: TEAL },
  { id: 'lime-magenta', label: 'Lime & Magenta', gov: LIME, opp: MAGENTA },
];

export const DEFAULT_COLORWAY = 'blue-red';

/** A custom color: the picked color for light mode, a brighter mix for dark mode. */
export function customTone(hex: string): Tone {
  return { light: hex, dark: `color-mix(in srgb, ${hex} 60%, white)` };
}

export function resolveColorway(id: string, custom: { gov: string; opp: string }): { gov: Tone; opp: Tone } {
  if (id === 'custom') return { gov: customTone(custom.gov), opp: customTone(custom.opp) };
  const c = COLORWAYS.find((x) => x.id === id) ?? COLORWAYS[0];
  return { gov: c.gov, opp: c.opp };
}
