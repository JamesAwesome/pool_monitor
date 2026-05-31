import { useState } from 'react';
import { CHEMS, CHEM_BY_KEY } from '../../constants/chemicals';
import { useChemistryData } from '../../hooks/useChemistryData';
import { latestReading } from '../../utils/chemistry';
import { ChemCard } from '../ChemCard';
import { ChemFocusSheet } from '../ChemFocusSheet';
import { LogTestFlow } from '../LogTestFlow';
import { Toast } from '../Toast';
import { DateRangePicker } from '../DateRangePicker';
import type { ChemKey } from '../../types';
import styles from './ChemistryTab.module.css';

type Overlay = 'pool' | 'air' | 'off';

const RANGES = [
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'season', label: 'Season' },
  { key: 'all', label: 'All' },
];

export function ChemistryTab() {
  const [range, setRange] = useState('season');
  const [showCustom, setShowCustom] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>('pool');
  const [selected, setSelected] = useState<ChemKey | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [toast, setToast] = useState(false);

  const { readings, poolHistory, airHistory, loading, refetch } = useChemistryData(range);

  const lastDate = readings.length ? new Date(readings[readings.length - 1].date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

  const latestValues: Partial<Record<ChemKey, number>> = {};
  for (const c of CHEMS) {
    const v = latestReading(readings, c.key);
    if (v !== null) latestValues[c.key] = v;
  }

  return (
    <div className={styles.tab}>
      <div className={styles.head}>
        <div>
          <h2 className={styles.title}>Chemistry</h2>
          <p className={styles.subtitle}>Last test {lastDate} · tap a card to correlate with temp</p>
        </div>
        <button type="button" className={styles.logBtn} onClick={() => setLogOpen(true)}>＋ Log test</button>
      </div>

      <div className={styles.controls}>
        <div className={styles.overlayControl}>
          <span className={styles.overlayLabel}>OVERLAY TEMP</span>
          <div className={styles.segment}>
            {(['pool', 'air', 'off'] as Overlay[]).map((o) => (
              <button key={o} type="button"
                className={`${styles.segBtn} ${overlay === o ? styles.segActive : ''}`}
                onClick={() => setOverlay(o)}>
                {o === 'pool' ? 'Pool' : o === 'air' ? 'Air' : 'Off'}
              </button>
            ))}
          </div>
        </div>
        <div className={styles.rangeRow}>
          {RANGES.map((r) => (
            <button key={r.key} type="button"
              className={`${styles.rangeBtn} ${range === r.key && !showCustom ? styles.rangeActive : ''}`}
              onClick={() => { setRange(r.key); setShowCustom(false); }}>{r.label}</button>
          ))}
          <button type="button" className={`${styles.rangeBtn} ${showCustom ? styles.rangeActive : ''}`}
            onClick={() => setShowCustom((v) => !v)}>Custom</button>
        </div>
      </div>

      {showCustom && (
        <DateRangePicker onApply={(from, to) => { setRange(`custom:${from}:${to}`); setShowCustom(false); }} />
      )}

      {loading && readings.length === 0 ? (
        <p className={styles.loading}>Loading…</p>
      ) : (
        <div className={styles.grid}>
          {CHEMS.map((c) => (
            <ChemCard key={c.key} meta={c} readings={readings}
              poolHistory={poolHistory} airHistory={airHistory} overlay={overlay} onOpen={setSelected} />
          ))}
        </div>
      )}

      {selected && (
        <ChemFocusSheet meta={CHEM_BY_KEY[selected]} readings={readings}
          poolHistory={poolHistory} airHistory={airHistory} onClose={() => setSelected(null)} />
      )}

      <LogTestFlow open={logOpen} onClose={() => setLogOpen(false)} latest={latestValues}
        onSaved={() => { setLogOpen(false); setToast(true); refetch(); }} />

      <Toast open={toast} message="Reading saved" onDismiss={() => setToast(false)} />
    </div>
  );
}
