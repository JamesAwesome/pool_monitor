import { StatCard } from '../StatCard';
import type { PoolStats } from '../../types';
import styles from './StatsGrid.module.css';

interface StatsGridProps {
  stats: PoolStats | null;
  loading: boolean;
}

export function StatsGrid({ stats, loading }: StatsGridProps) {
  return (
    <div className={styles.grid}>
      <StatCard label="Average" value={stats?.average ?? null} loading={loading} />
      <StatCard label="Peak" value={stats?.peak ?? null} loading={loading} />
      <StatCard label="Season Avg (180d)" value={stats?.seasonAvg ?? null} loading={loading} />
      <StatCard label="Season Peak (180d)" value={stats?.seasonPeak ?? null} loading={loading} />
    </div>
  );
}
