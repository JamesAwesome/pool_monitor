import { ThemeProvider } from './context/ThemeContext';
import { usePoolData } from './hooks/usePoolData';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { CurrentTemp } from './components/CurrentTemp';
import { StatsGrid } from './components/StatsGrid';
import { TempChart } from './components/TempChart';
import { BatteryStatus } from './components/BatteryStatus';
import styles from './App.module.css';

function Dashboard() {
  const { stats, history, battery, range, setRange, loading, error } = usePoolData();

  return (
    <main className={styles.main}>
      <div className="container">
        {error && <p className={styles.error}>{error}</p>}
        <CurrentTemp value={stats?.current ?? null} loading={loading} />
        <StatsGrid stats={stats} loading={loading} />
        <TempChart data={history} range={range} onRangeChange={setRange} loading={loading} />
        <BatteryStatus data={battery} loading={loading} />
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
