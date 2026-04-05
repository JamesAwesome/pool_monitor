import { useState, useCallback } from 'react';
import { StatCard } from '../StatCard';
import { BottomSheet } from '../BottomSheet';
import { useTheme } from '../../context/ThemeContext';
import { formatTemperature } from '../../utils/temperature';
import type { PoolStats, SeasonYear, StatDetailPeriod } from '../../types';
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

function formatPeriodLabel(start: string, stop: string): string {
  const s = new Date(start);
  const e = new Date(stop);
  e.setDate(e.getDate() - 1); // stop is exclusive, show inclusive end
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  if (s.toDateString() === e.toDateString()) {
    return s.toLocaleDateString(undefined, opts);
  }
  return `${s.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
}

export function StatsGrid({ stats, loading, selectedSensor, range = '3d' }: StatsGridProps) {
  const { unit } = useTheme();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [seasonData, setSeasonData] = useState<SeasonYear[]>([]);
  const [seasonLoading, setSeasonLoading] = useState(false);
  const [detailType, setDetailType] = useState<'average' | 'peak' | null>(null);
  const [detailData, setDetailData] = useState<StatDetailPeriod[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
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

  const openStatDetail = useCallback((stat: 'average' | 'peak') => {
    setDetailType(stat);
    setDetailData([]);
    setDetailLoading(true);
    const sensorParam = selectedSensor ? `&sensor=${encodeURIComponent(selectedSensor)}` : '';
    fetch(`/api/stat-detail?range=${encodeURIComponent(range)}&stat=${stat}${sensorParam}`)
      .then((res) => res.ok ? res.json() : [])
      .then((data: StatDetailPeriod[]) => setDetailData(data))
      .catch(() => setDetailData([]))
      .finally(() => setDetailLoading(false));
  }, [range, selectedSensor]);

  const currentYear = new Date().getFullYear();

  return (
    <>
      <div className={styles.grid}>
        <StatCard label={`Average (${rangeLabel(range)})`} value={stats?.average ?? null} loading={loading}
          icon="≈" accentColor="#0ea5e9" onClick={() => openStatDetail('average')} />
        <StatCard label={`Peak (${rangeLabel(range)})`} value={stats?.peak ?? null} loading={loading}
          icon="↑" accentColor="#f59e0b" onClick={() => openStatDetail('peak')} />
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
        <div className={styles.sheetContent}>
        {seasonLoading ? (
          <div className={styles.tableLoading}>Loading...</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Year</th>
                <th className={styles.th}>Average</th>
                <th className={styles.th}>Peak</th>
                <th className={`${styles.th} ${styles.thRight}`}>Low</th>
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
                  <td className={`${styles.td} ${styles.tdRight}`}>
                    {row.low !== null ? `${formatTemperature(row.low, unit)}${unitLabel}` : '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      </BottomSheet>

      <BottomSheet
        open={detailType !== null}
        onClose={() => setDetailType(null)}
        title={detailType === 'average' ? 'Average History' : 'Temperature Extremes'}
      >
        <div className={styles.sheetContent}>
        {detailLoading ? (
          <div className={styles.tableLoading}>Loading...</div>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.th}>Period</th>
                {detailType === 'average' && <th className={`${styles.th} ${styles.thRight}`}>Average</th>}
                {detailType === 'peak' && (
                  <>
                    <th className={`${styles.th} ${styles.thRight}`}>High</th>
                    <th className={`${styles.th} ${styles.thRight}`}>Low</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {detailData.map((row, i) => (
                <tr key={row.start} className={i === 0 ? styles.currentRow : ''}>
                  <td className={styles.td}>{formatPeriodLabel(row.start, row.stop)}</td>
                  {detailType === 'average' && (
                    <td className={`${styles.td} ${styles.tdRight}`}>
                      {row.average !== null && row.average !== undefined ? `${formatTemperature(row.average, unit)}${unitLabel}` : '--'}
                    </td>
                  )}
                  {detailType === 'peak' && (
                    <>
                      <td className={`${styles.td} ${styles.tdRight}`}>
                        {row.high !== null && row.high !== undefined ? `${formatTemperature(row.high, unit)}${unitLabel}` : '--'}
                      </td>
                      <td className={`${styles.td} ${styles.tdRight}`}>
                        {row.low !== null && row.low !== undefined ? `${formatTemperature(row.low, unit)}${unitLabel}` : '--'}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        </div>
      </BottomSheet>
    </>
  );
}
