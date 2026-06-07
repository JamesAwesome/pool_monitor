import { CHEM_PRODUCTS, CHEM_UNITS } from '../../constants/events';
import { Segmented } from './Segmented';
import styles from './EventLogFlow.module.css';

export interface ChemRow { product: string; other: string; amount: string; unit: string }

export function newChemRow(): ChemRow {
  return { product: '', other: '', amount: '', unit: 'oz' };
}

interface ChemItemRowProps {
  row: ChemRow;
  index: number;
  accent: string;
  onChange: (patch: Partial<ChemRow>) => void;
  onRemove?: () => void;
}

export function ChemItemRow({ row, index, accent, onChange, onRemove }: ChemItemRowProps) {
  return (
    <div className={styles.chemRow}>
      <div className={styles.chemRowHead}>
        <span className={styles.pickerLabel}>Chemical {index + 1}</span>
        {onRemove && (
          <button type="button" className={styles.removeRow} aria-label={`Remove chemical ${index + 1}`} onClick={onRemove}>
            Remove
          </button>
        )}
      </div>
      <div className={styles.chipWrap}>
        {CHEM_PRODUCTS.map((p) => (
          <button
            key={p}
            type="button"
            className={`${styles.chip} ${row.product === p ? styles.chipOn : ''}`}
            style={{ '--accent': accent } as React.CSSProperties}
            onClick={() => onChange({ product: p })}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className={`${styles.chip} ${row.product === 'Other' ? styles.chipOn : ''}`}
          style={{ '--accent': accent } as React.CSSProperties}
          onClick={() => onChange({ product: 'Other' })}
        >
          Other…
        </button>
      </div>
      {row.product === 'Other' && (
        <input
          className={`${styles.input} ${styles.mt}`}
          placeholder="Product name"
          value={row.other}
          onChange={(e) => onChange({ other: e.target.value })}
        />
      )}
      <div className={`${styles.formGrid} ${styles.mt}`}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Amount</span>
          <input
            className={styles.input}
            type="number"
            inputMode="decimal"
            min="0"
            placeholder="0"
            value={row.amount}
            onChange={(e) => onChange({ amount: e.target.value })}
          />
        </label>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Unit</span>
          <Segmented options={CHEM_UNITS} value={row.unit} onChange={(u) => onChange({ unit: u })} accent={accent} />
        </div>
      </div>
    </div>
  );
}
