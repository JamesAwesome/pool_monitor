import { useState } from 'react';
import { CHEMS, CHEM_BY_KEY } from '../../constants/chemicals';
import { useChemistryData } from '../../hooks/useChemistryData';
import { latestReading } from '../../utils/chemistry';
import { ChemCard } from '../ChemCard';
import { ChemFocusSheet } from '../ChemFocusSheet';
import { LogTestFlow } from '../LogTestFlow';
import { HistorySheet } from '../HistorySheet';
import { Toast } from '../Toast';
import { DateRangePicker } from '../DateRangePicker';
import { BottomSheet } from '../BottomSheet';
import { OverlayPill } from '../OverlayPill';
import type { ChemKey, ChemistryReading } from '../../types';
import styles from './ChemistryTab.module.css';

const RANGES = [
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'season', label: 'Season' },
  { key: 'all', label: 'All' },
];

export function ChemistryTab() {
  const [range, setRange] = useState('season');
  const [showCustom, setShowCustom] = useState(false);
  const [poolOn, setPoolOn] = useState(true);
  const [airOn, setAirOn] = useState(true);
  const [selected, setSelected] = useState<ChemKey | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ChemistryReading | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
        <div className={styles.headBtns}>
          <button type="button" className={styles.histBtn} onClick={() => setHistOpen(true)}>History</button>
          <button type="button" className={styles.logBtn} onClick={() => { setEditEntry(null); setLogOpen(true); }}>＋ Log test</button>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.overlayControl}>
          <span className={styles.overlayLabel}>OVERLAY TEMP</span>
          <OverlayPill label="Pool" variant="pool" active={poolOn} onToggle={() => setPoolOn((v) => !v)} />
          <OverlayPill label="Air" variant="air" active={airOn} onToggle={() => setAirOn((v) => !v)} />
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

      <BottomSheet open={showCustom} onClose={() => setShowCustom(false)} title="Custom range">
        <DateRangePicker onApply={(from, to) => { setRange(`custom:${from}:${to}`); setShowCustom(false); }} />
      </BottomSheet>

      {loading && readings.length === 0 ? (
        <p className={styles.loading}>Loading…</p>
      ) : (
        <div className={styles.grid}>
          {CHEMS.map((c) => (
            <ChemCard key={c.key} meta={c} readings={readings}
              poolHistory={poolHistory} airHistory={airHistory} showPool={poolOn} showAir={airOn} onOpen={setSelected} />
          ))}
        </div>
      )}

      {selected && (
        <ChemFocusSheet meta={CHEM_BY_KEY[selected]} readings={readings}
          poolHistory={poolHistory} airHistory={airHistory} onClose={() => setSelected(null)} />
      )}

      <HistorySheet
        open={histOpen}
        readings={readings}
        onClose={() => setHistOpen(false)}
        onSelect={(r) => { setHistOpen(false); setEditEntry(r); setLogOpen(true); }}
        onNew={() => { setHistOpen(false); setEditEntry(null); setLogOpen(true); }}
      />

      <LogTestFlow open={logOpen} onClose={() => { setLogOpen(false); setEditEntry(null); }} latest={latestValues}
        editEntry={editEntry}
        readings={readings}
        onSaved={() => { setLogOpen(false); setToast(editEntry ? 'Changes saved' : 'Reading saved'); setEditEntry(null); refetch(); }}
        onDeleted={() => { setLogOpen(false); setToast('Entry deleted'); setEditEntry(null); refetch(); }} />

      <Toast open={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
    </div>
  );
}
