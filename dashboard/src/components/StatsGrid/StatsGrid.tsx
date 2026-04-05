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
      <StatCard label="Average" value={stats?.average ?? null} loading={loading}
        icon="≈" accentColor="#0ea5e9" />
      <StatCard label="Peak" value={stats?.peak ?? null} loading={loading}
        icon="↑" accentColor="#f59e0b" />
      <StatCard label="Season Avg (YTD)" value={stats?.seasonAvg ?? null} loading={loading}
        icon="≈" accentColor="#8b5cf6" />
      <StatCard label="Season Peak (YTD)" value={stats?.seasonPeak ?? null} loading={loading}
        icon="↑" accentColor="#ec4899" />
    </div>
  );
}
