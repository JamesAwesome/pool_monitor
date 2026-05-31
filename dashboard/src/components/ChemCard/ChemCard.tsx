import type { ChemMeta } from '../../constants/chemicals';
import type { ChemistryReading, ChemKey, TimeSeriesPoint } from '../../types';
import { latestReading, computeDelta, formatChemValue } from '../../utils/chemistry';
import { DeltaTag } from '../DeltaTag';
import { ChemChart } from '../ChemChart';
import styles from './ChemCard.module.css';

interface ChemCardProps {
  meta: ChemMeta;
  readings: ChemistryReading[];
  poolHistory: TimeSeriesPoint[];
  airHistory: TimeSeriesPoint[];
  overlay: 'pool' | 'air' | 'off';
  onOpen: (key: ChemKey) => void;
}

export function ChemCard({ meta, readings, poolHistory, airHistory, overlay, onOpen }: ChemCardProps) {
  const latest = latestReading(readings, meta.key);
  const delta = computeDelta(readings, meta.key, meta.decimals);

  return (
    <button
      type="button"
      className={styles.card}
      style={{ borderTop: `3px solid ${meta.color}` }}
      onClick={() => onOpen(meta.key)}
    >
      <div className={styles.top}>
        <span className={styles.name}>{meta.name.toUpperCase()}</span>
        <DeltaTag delta={delta} decimals={meta.decimals} />
      </div>
      <div className={styles.valueRow}>
        <span className={styles.value} style={{ color: meta.color }}>
          {latest !== null ? formatChemValue(latest, meta.decimals) : '--'}
        </span>
        {meta.unit && <span className={styles.unit}>{meta.unit}</span>}
      </div>
      <ChemChart
        readings={readings}
        chemKey={meta.key}
        color={meta.color}
        decimals={meta.decimals}
        poolHistory={poolHistory}
        airHistory={airHistory}
        showPool={overlay === 'pool'}
        showAir={overlay === 'air'}
        variant="mini"
      />
    </button>
  );
}
