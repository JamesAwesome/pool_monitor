import { useState } from 'react';
import { BottomSheet } from '../BottomSheet';
import { ChemChart } from '../ChemChart';
import { DeltaTag } from '../DeltaTag';
import type { ChemMeta } from '../../constants/chemicals';
import type { ChemistryReading, TimeSeriesPoint } from '../../types';
import { latestReading, computeDelta, computeStats, formatChemValue } from '../../utils/chemistry';
import styles from './ChemFocusSheet.module.css';

interface ChemFocusSheetProps {
  meta: ChemMeta;
  readings: ChemistryReading[];
  poolHistory: TimeSeriesPoint[];
  airHistory: TimeSeriesPoint[];
  onClose: () => void;
}

export function ChemFocusSheet({ meta, readings, poolHistory, airHistory, onClose }: ChemFocusSheetProps) {
  const [poolOn, setPoolOn] = useState(true);
  const [airOn, setAirOn] = useState(false);

  const latest = latestReading(readings, meta.key);
  const delta = computeDelta(readings, meta.key, meta.decimals);
  const stats = computeStats(readings, meta.key);

  const recent = readings
    .filter((r) => typeof r[meta.key] === 'number')
    .slice(-6)
    .reverse();

  return (
    <BottomSheet open onClose={onClose} title={meta.name}>
      <div className={styles.body}>
        <div className={styles.header}>
          <span className={styles.name}>{meta.name.toUpperCase()}</span>
          <div className={styles.valueRow}>
            <span className={styles.value} style={{ color: meta.color }}>
              {latest !== null ? formatChemValue(latest, meta.decimals) : '--'}
            </span>
            {meta.unit && <span className={styles.unit}>{meta.unit}</span>}
            <DeltaTag delta={delta} decimals={meta.decimals} />
          </div>
        </div>

        <div className={styles.overlayRow}>
          <span className={styles.overlayLabel}>Overlay</span>
          <button type="button" aria-pressed={poolOn}
            className={`${styles.pill} ${poolOn ? styles.poolOn : ''}`} onClick={() => setPoolOn((v) => !v)}>
            <span className={styles.swatchPool} /> Pool temp
          </button>
          <button type="button" aria-pressed={airOn}
            className={`${styles.pill} ${airOn ? styles.airOn : ''}`} onClick={() => setAirOn((v) => !v)}>
            <span className={styles.swatchAir} /> Air temp
          </button>
        </div>

        <ChemChart readings={readings} chemKey={meta.key} color={meta.color} decimals={meta.decimals}
          poolHistory={poolHistory} airHistory={airHistory} showPool={poolOn} showAir={airOn} variant="full" />

        <div className={styles.stats}>
          {(['low', 'avg', 'high'] as const).map((k) => (
            <div key={k} className={styles.statBox}>
              <span className={styles.statKey}>{k === 'low' ? 'Low' : k === 'avg' ? 'Avg' : 'High'}</span>
              <span className={styles.statVal}>{stats ? formatChemValue(stats[k], meta.decimals) : '--'}</span>
            </div>
          ))}
        </div>

        <div className={styles.list}>
          {recent.map((r) => (
            <div key={r.date} className={styles.listRow}>
              <span>{new Date(r.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
              <span className={styles.listVal}>{formatChemValue(r[meta.key] as number, meta.decimals)}{meta.unit && ` ${meta.unit}`}</span>
            </div>
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}
