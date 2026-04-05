import { useState, useCallback } from 'react';
import { StatCard } from '../StatCard';
import { BottomSheet } from '../BottomSheet';
import { useTheme } from '../../context/ThemeContext';
import { formatTemperature } from '../../utils/temperature';
import type { PoolStats, SeasonYear } from '../../types';
import styles from './StatsGrid.module.css';

interface StatsGridProps {
  stats: PoolStats | null;
  loading: boolean;
  selectedSensor?: string | null;
  range?: string;
}

function rangeLabel(range: string): string {
  if (range.startsWith('custom:')) return 'Custom';
  return range.toUpperCase();
}

export function StatsGrid({ stats, loading, selectedSensor, range = '3d' }: StatsGridProps) {
  const { unit } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [seasonData, setSeasonData] = useState<SeasonYear[]>([]);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const unitLabel = unit === 'F' ? '°F' : '°C';

  const openSeasonHistory = useCallback(() => {
    setSheetOpen(true);
    setSeasonData([]);
    setSeasonLoading(true);
    const sensorParam = selectedSensor ? `?sensor=${encodeURIComponent(selectedSensor)}` : '';
    fetch(`/api/season-history${sensorParam}`)
      .then((res) => res.ok ? res.json() : [])
      .then((data: SeasonYear[]) => setSeasonData(data))
      .catch(() => setSeasonData([]))
      .finally(() => setSeasonLoading(false));
  }, [selectedSensor]);

  const currentYear = new Date().getFullYear();

  return (
    <>
      <div className={styles.grid}>
        <StatCard label={`Average (${rangeLabel(range)})`} value={stats?.average ?? null} loading={loading}
          icon="≈" accentColor="#0ea5e9" />
        <StatCard label={`Peak (${rangeLabel(range)})`} value={stats?.peak ?? null} loading={loading}
          icon="↑" accentColor="#f59e0b" />
        <StatCard label="Season Avg (YTD)" value={stats?.seasonAvg ?? null} loading={loading}
          icon="≈" accentColor="#8b5cf6" onClick={openSeasonHistory} />
        <StatCard label="Season Peak (YTD)" value={stats?.seasonPeak ?? null} loading={loading}
          icon="↑" accentColor="#ec4899" onClick={openSeasonHistory} />
      </div>

      <BottomSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Season History"
      >
        {seasonLoading ? (
          <div className={styles.tableLoading}>Loading...</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Year</th>
                <th className={styles.th}>Average</th>
                <th className={styles.th}>Peak</th>
              </tr>
            </thead>
            <tbody>
              {seasonData.map((row) => (
                <tr
                  key={row.year}
                  className={row.year === currentYear ? styles.currentYear : ''}
                >
                  <td className={styles.td}>{row.year}</td>
                  <td className={styles.td}>
                    {row.average !== null ? `${formatTemperature(row.average, unit)}${unitLabel}` : '--'}
                  </td>
                  <td className={styles.td}>
                    {row.peak !== null ? `${formatTemperature(row.peak, unit)}${unitLabel}` : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </BottomSheet>
    </>
  );
}
