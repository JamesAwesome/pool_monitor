import { useState, type CSSProperties } from 'react';
import { CHEMS, CHEM_BY_KEY } from '../../constants/chemicals';
import { useChemistryData } from '../../hooks/useChemistryData';
import { useSwimData } from '../../hooks/useSwimData';
import { useEventData } from '../../hooks/useEventData';
import { latestReading } from '../../utils/chemistry';
import { ChemCard } from '../ChemCard';
import { ChemFocusSheet } from '../ChemFocusSheet';
import { LogTestFlow } from '../LogTestFlow';
import { HistorySheet } from '../HistorySheet';
import { EventLogFlow } from '../EventLogFlow';
import { LogBookSheet } from '../LogBookSheet';
import { Toast } from '../Toast';
import { DateRangePicker } from '../DateRangePicker';
import { BottomSheet } from '../BottomSheet';
import { OverlayPill } from '../OverlayPill';
import { EVENT_KIND_ORDER, EVENT_KINDS } from '../../constants/events';
import type { ChemKey, ChemistryReading, EventKind, PoolEvent } from '../../types';
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
  const [swimOn, setSwimOn] = useState(true);
  const [selected, setSelected] = useState<ChemKey | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<ChemistryReading | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [eventsOn, setEventsOn] = useState(true);
  const [evFlowOpen, setEvFlowOpen] = useState(false);
  const [evMode, setEvMode] = useState<'chooser' | 'form'>('form');
  const [evKind, setEvKind] = useState<EventKind>('chemical');
  const [evEntry, setEvEntry] = useState<PoolEvent | null>(null);
  const [bookOpen, setBookOpen] = useState(false);

  const { readings, poolHistory, airHistory, loading, refetch } = useChemistryData(range);
  const { swims } = useSwimData(range);
  const { events, refetch: refetchEvents } = useEventData(range);
  const { events: seasonEvents, refetch: refetchSeasonEvents } = useEventData('season');
  const refetchAllEvents = () => { refetchEvents(); refetchSeasonEvents(); };

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

      <div className={styles.logEventCard}>
        <div className={styles.logEventHead}>
          <span className={styles.logEventLabel}>Log event</span>
          <button type="button" className={styles.logEventBook} onClick={() => setBookOpen(true)}>Log book ›</button>
        </div>
        <div className={styles.logEventBtns}>
          {EVENT_KIND_ORDER.map((kk) => {
            const k = EVENT_KINDS[kk];
            return (
              <button key={kk} type="button" className={styles.logEventBtn}
                style={{ '--kc': k.color } as CSSProperties}
                onClick={() => { setEvEntry(null); setEvKind(kk); setEvMode('form'); setEvFlowOpen(true); }}>
                <span className={styles.logEventIco} style={{ background: k.tint }}>{k.icon}</span>{k.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.overlayControl}>
          <span className={styles.overlayLabel}>OVERLAY TEMP</span>
          <OverlayPill label="Pool" variant="pool" active={poolOn} onToggle={() => setPoolOn((v) => !v)} />
          <OverlayPill label="Air" variant="air" active={airOn} onToggle={() => setAirOn((v) => !v)} />
          {swims.length > 0 && (
            <OverlayPill label="Swim" variant="swim" active={swimOn} onToggle={() => setSwimOn((v) => !v)} />
          )}
          {events.length > 0 && (
            <OverlayPill label="Events" variant="events" active={eventsOn} onToggle={() => setEventsOn((v) => !v)} />
          )}
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
              poolHistory={poolHistory} airHistory={airHistory} showPool={poolOn} showAir={airOn}
              swims={swimOn ? swims : undefined} events={eventsOn ? events : undefined} onOpen={setSelected} />
          ))}
        </div>
      )}

      {selected && (
        <ChemFocusSheet meta={CHEM_BY_KEY[selected]} readings={readings}
          poolHistory={poolHistory} airHistory={airHistory} swims={swims} events={events} onClose={() => setSelected(null)} />
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

      <LogBookSheet open={bookOpen} events={seasonEvents}
        onClose={() => setBookOpen(false)}
        onEdit={(e) => { setBookOpen(false); setEvEntry(e); setEvKind(e.kind); setEvMode('form'); setEvFlowOpen(true); }}
        onNew={() => { setBookOpen(false); setEvEntry(null); setEvMode('chooser'); setEvFlowOpen(true); }} />

      <EventLogFlow open={evFlowOpen} mode={evMode} kind={evKind} editEntry={evEntry}
        onPickKind={(k) => { setEvKind(k); setEvMode('form'); }}
        onClose={() => { setEvFlowOpen(false); setEvEntry(null); }}
        onSaved={() => { setEvFlowOpen(false); setToast(evEntry ? 'Entry updated' : `${EVENT_KINDS[evKind].noun} logged`); setEvEntry(null); refetchAllEvents(); }}
        onDeleted={() => { setEvFlowOpen(false); setEvEntry(null); setToast('Entry deleted'); refetchAllEvents(); }} />

      <Toast open={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
    </div>
  );
}
