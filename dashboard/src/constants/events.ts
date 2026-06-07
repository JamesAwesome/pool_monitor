import type { EventKind } from '../types';

export interface EventKindMeta { key: EventKind; label: string; icon: string; color: string; tint: string; noun: string }

export const EVENT_KINDS: Record<EventKind, EventKindMeta> = {
  chemical: { key: 'chemical', label: 'Chemical', icon: '🧪', color: '#b45309', tint: 'rgba(180,83,9,0.13)',  noun: 'Chemical addition' },
  water:    { key: 'water',    label: 'Water',    icon: '💧', color: '#0369a1', tint: 'rgba(3,105,161,0.12)',  noun: 'Water addition' },
  backwash: { key: 'backwash', label: 'Backwash', icon: '🔄', color: '#0f766e', tint: 'rgba(15,118,110,0.12)', noun: 'Filter backwash' },
  note:     { key: 'note',     label: 'Note',     icon: '📝', color: '#475569', tint: 'rgba(71,85,105,0.14)',  noun: 'Note' },
};
export const EVENT_KIND_ORDER: EventKind[] = ['chemical', 'water', 'backwash', 'note'];
export const CHEM_PRODUCTS = ['Liquid chlorine', 'Cal-hypo', 'Tri-chlor tabs (3 in)', 'Tri-chlor tabs (1 in)', 'Muriatic acid', 'Soda ash', 'Baking soda', 'Stabilizer (CYA)', 'Calcium chloride', 'Algaecide'];
export const CHEM_UNITS = ['oz', 'lb', 'gal', 'tabs'];
export const WATER_UNITS = ['in', 'gal', 'min'];
