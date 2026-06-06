/** Pure formatters for the chemistry focus-chart hover tooltip. Extracted so the
 *  logic is unit-testable (recharts tooltips can't be hover-triggered in jsdom). */

export interface ChemTooltipOpts {
  name: string;      // chemical label, e.g. 'pH', 'Free Chlorine'
  decimals: number;  // chemical decimals
  unit: string;      // chemical unit, '' for pH
  tempUnit: string;  // '°F' | '°C'
}

/** Format one tooltip row by series key. Returns [valueText, label] or null for
 *  an unrecognized series. `key` is the recharts series name (= the dataKey:
 *  'chem' | 'pool' | 'air'). Pool/air values are already in display units. */
export function formatChemTooltipItem(
  key: string,
  value: number,
  opts: ChemTooltipOpts,
): [string, string] | null {
  if (key === 'chem') {
    const u = opts.unit ? ` ${opts.unit}` : '';
    return [`${value.toFixed(opts.decimals)}${u}`, opts.name];
  }
  if (key === 'pool') return [`${value.toFixed(1)}${opts.tempUnit}`, 'Pool temp'];
  if (key === 'air') return [`${value.toFixed(1)}${opts.tempUnit}`, 'Air temp'];
  return null;
}

/** Header label: localized date + time for the hovered reading's epoch. */
export function formatChemTooltipLabel(t: number): string {
  const d = new Date(t);
  const date = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} · ${time}`;
}
