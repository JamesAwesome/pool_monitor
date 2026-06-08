import { useState } from 'react';
import { ThemeProvider } from './context/ThemeContext';
import { usePoolData } from './hooks/usePoolData';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { CurrentTemp } from './components/CurrentTemp';
import { StatsGrid } from './components/StatsGrid';
import { TempChart } from './components/TempChart';
import { BatteryStatus } from './components/BatteryStatus';
import { SensorSelector } from './components/SensorSelector';
import { TabBar, type TabKey } from './components/TabBar';
import { ChemistryTab } from './components/ChemistryTab';
import { useSwimData } from './hooks/useSwimData';
import { useEventData } from './hooks/useEventData';
import { SwimLogFlow } from './components/SwimLogFlow';
import { SwimHistorySheet } from './components/SwimHistorySheet';
import { Toast } from './components/Toast';
import type { SwimSession } from './types';
import styles from './App.module.css';

function TemperatureTab() {
  const { stats, history, batteries, range, setRange, loading, error, sensors, selectedSensor, setSelectedSensor, airCurrent, airHistory } = usePoolData();
  // Chart markers follow the selected chart range; History + the log form's
  // "recent swimmers" use a season-wide set so the log doesn't shrink with zoom.
  const { swims, refetch: refetchSwims } = useSwimData(range);
  const { swims: seasonSwims, refetch: refetchSeasonSwims } = useSwimData('season');
  const refetchAllSwims = () => { refetchSwims(); refetchSeasonSwims(); };
  const { events } = useEventData(range);
  const [logOpen, setLogOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<SwimSession | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  return (
    <>
      {error && !loading && stats && <p className={styles.error}>{error}</p>}
      <SensorSelector sensors={sensors} selected={selectedSensor} onSelect={setSelectedSensor} />
      <CurrentTemp value={stats?.current ?? null} loading={loading} airCurrent={airCurrent} currentTime={stats?.currentTime ?? null} />
      <StatsGrid stats={stats} loading={loading} selectedSensor={selectedSensor} range={range} />

      <div className={styles.swimActions}>
        <button type="button" className={styles.histBtn} onClick={() => setHistOpen(true)}>History</button>
        <button type="button" className={styles.logBtn} onClick={() => { setEditEntry(null); setLogOpen(true); }}>＋ Log swim</button>
      </div>

      <TempChart data={history} range={range} onRangeChange={setRange} loading={loading} airHistory={airHistory} swims={swims} events={events} />
      <BatteryStatus batteries={batteries} loading={loading} />

      <SwimHistorySheet
        open={histOpen}
        swims={seasonSwims}
        onClose={() => setHistOpen(false)}
        onSelect={(s) => { setHistOpen(false); setEditEntry(s); setLogOpen(true); }}
        onNew={() => { setHistOpen(false); setEditEntry(null); setLogOpen(true); }}
      />
      <SwimLogFlow
        open={logOpen}
        swims={seasonSwims}
        editEntry={editEntry}
        onClose={() => { setLogOpen(false); setEditEntry(null); }}
        onSaved={() => { setLogOpen(false); setToast(editEntry ? 'Swim updated' : 'Swim logged'); setEditEntry(null); refetchAllSwims(); }}
        onDeleted={() => { setLogOpen(false); setToast('Swim deleted'); setEditEntry(null); refetchAllSwims(); }}
      />
      <Toast open={toast !== null} message={toast ?? ''} onDismiss={() => setToast(null)} />
    </>
  );
}

function Dashboard() {
  const [tab, setTab] = useState<TabKey>('temperature');
  return (
    <main className={styles.main}>
      <TabBar active={tab} onChange={setTab} />
      <div className="container">
        {tab === 'temperature' ? <TemperatureTab /> : <ChemistryTab />}
      </div>
    </main>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <div className={styles.app}>
        <Header />
        <Dashboard />
        <Footer />
      </div>
    </ThemeProvider>
  );
}
