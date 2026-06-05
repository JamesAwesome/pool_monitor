import type { PoolEvent } from '../types';

export function sortedEvents(list: PoolEvent[]): PoolEvent[] {
  return [...list].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

export function summary(ev: PoolEvent): string {
  switch (ev.kind) {
    case 'chemical': return `${ev.product} · ${ev.amount} ${ev.unit}`;
    case 'water': return `Added water · ${ev.amount} ${ev.unit}`;
    case 'backwash': return 'Backwashed the filter';
    case 'note': return ev.note ?? '';
    default: return '';
  }
}

export function whenLabel(ev: PoolEvent): string {
  const d = new Date(`${ev.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const t = new Date(`2000-01-01T${ev.time}:00`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${d} · ${t}`;
}

export function countByKind(list: PoolEvent[]): Record<PoolEvent['kind'], number> {
  const c = { chemical: 0, water: 0, backwash: 0, note: 0 };
  for (const e of list) c[e.kind] += 1;
  return c;
}
