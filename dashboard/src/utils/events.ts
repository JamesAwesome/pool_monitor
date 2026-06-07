import type { ChemItem, PoolEvent } from '../types';

export function sortedEvents(list: PoolEvent[]): PoolEvent[] {
  return [...list].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
}

export function chemItems(ev: PoolEvent): ChemItem[] {
  if (ev.items && ev.items.length) return ev.items;
  if (ev.product) return [{ product: ev.product, amount: ev.amount ?? 0, unit: ev.unit ?? '' }];
  return [];
}

export function summary(ev: PoolEvent): string {
  switch (ev.kind) {
    case 'chemical': {
      const items = chemItems(ev);
      if (items.length === 0) return 'Chemical';
      if (items.length === 1) return `${items[0].product} · ${items[0].amount} ${items[0].unit}`;
      const names = items.map((i) => i.product);
      const extra = names.length - 2;
      return extra > 0 ? `${names.slice(0, 2).join(', ')} +${extra} more` : names.join(', ');
    }
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
