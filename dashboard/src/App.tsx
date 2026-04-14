import { ThemeProvider } from './context/ThemeContext';
import { usePoolData } from './hooks/usePoolData';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { CurrentTemp } from './components/CurrentTemp';
import { StatsGrid } from './components/StatsGrid';
import { TempChart } from './components/TempChart';
import { BatteryStatus } from './components/BatteryStatus';
import { SensorSelector } from './components/SensorSelector';
import styles from './App.module.css';

function Dashboard() {
  const { stats, history, batteries, range, setRange, loading, error, sensors, selectedSensor, setSelectedSensor, airCurrent } = usePoolData();

  return (
    <main className={styles.main}>
      <div className="container">
        {error && !loading && stats && <p className={styles.error}>{error}</p>}
        <SensorSelector sensors={sensors} selected={selectedSensor} onSelect={setSelectedSensor} />
        <CurrentTemp value={stats?.current ?? null} loading={loading} airCurrent={airCurrent} />
        <StatsGrid stats={stats} loading={loading} selectedSensor={selectedSensor} range={range} />
        <TempChart data={history} range={range} onRangeChange={setRange} loading={loading} />
        <BatteryStatus batteries={batteries} loading={loading} />
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
