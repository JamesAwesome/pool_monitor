import type { ChemKey } from '../types';

export interface ChemMeta {
  key: ChemKey;
  name: string;   // full name for headers
  short: string;  // short label for the log form
  unit: string;   // '' for pH
  decimals: number;
  color: string;  // oklch accent, used for chart strokes and card borders
}

export const CHEMS: ChemMeta[] = [
  { key: 'ph',  name: 'pH',                short: 'pH',  unit: '',    decimals: 1, color: 'oklch(0.58 0.15 260)' },
  { key: 'fc',  name: 'Free Chlorine',     short: 'FC',  unit: 'ppm', decimals: 1, color: 'oklch(0.64 0.13 205)' },
  { key: 'cc',  name: 'Combined Chlorine', short: 'CC',  unit: 'ppm', decimals: 1, color: 'oklch(0.68 0.14 70)'  },
  { key: 'ta',  name: 'Total Alkalinity',  short: 'TA',  unit: 'ppm', decimals: 0, color: 'oklch(0.58 0.15 305)' },
  { key: 'cya', name: 'Cyanuric Acid',     short: 'CYA', unit: 'ppm', decimals: 0, color: 'oklch(0.60 0.14 150)' },
  { key: 'ch',  name: 'Calcium Hardness',  short: 'CH',  unit: 'ppm', decimals: 0, color: 'oklch(0.62 0.15 350)' },
];

export const CHEM_BY_KEY: Record<ChemKey, ChemMeta> = Object.fromEntries(
  CHEMS.map((c) => [c.key, c]),
) as Record<ChemKey, ChemMeta>;
