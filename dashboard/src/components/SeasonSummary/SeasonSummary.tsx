import { useState } from 'react';
import type { ReactNode } from 'react';
import { useTheme } from '../../context/ThemeContext';
import { useSeasonSummary } from '../../hooks/useSeasonSummary';
import { CHEM_BY_KEY } from '../../constants/chemicals';
import type { SeasonSummary as Summary, TemperatureUnit } from '../../types';
import { fmtTemp, fmtDelta, shortDate, hourLabel, weekdayName, score, num, funFacts, thresholdLabel } from '../../utils/seasonFacts';
import styles from './SeasonSummary.module.css';

const RANKS = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH', '9TH', '10TH'];
const MAX_RANKS = RANKS.length;
const MIN_YEAR = 2000; // matches the server's isValidYear floor

function Row({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <li className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.leader} aria-hidden="true" />
      <span className={styles.rowValue}>
        {value}
        {sub && <span className={styles.rowSub}> {sub}</span>}
      </span>
    </li>
  );
}

function Stage({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <section className={styles.stage} aria-label={title}>
      <h3 className={styles.stageTitle}>
        <span className={styles.stageNum}>{n}</span> {title}
      </h3>
      <ul className={styles.rows}>{children}</ul>
    </section>
  );
}

function HighScores({ board }: { board: Summary['swims']['leaderboard'] }) {
  if (board.length === 0) {
    return <p className={styles.empty}>NO SWIMMERS LOGGED</p>;
  }
  return (
    <table className={styles.scores}>
      <thead>
        <tr><th>RANK</th><th>SWIMMER</th><th>DIPS</th></tr>
      </thead>
      <tbody>
        {board.slice(0, MAX_RANKS).map((p, i) => (
          <tr key={p.emoji} className={styles[`rank${Math.min(i, 5)}`]} data-testid="score-row">
            <td>{RANKS[i]}</td>
            <td className={styles.swimmer}>{p.emoji}</td>
            <td>{score(p.count, 5)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Stages({ s, unit }: { s: Summary; unit: TemperatureUnit }) {
  const { pool, air, sky, chemistry: chem, events: ev, swims } = s;
  return (
    <>
      {pool && (
        <Stage n="STAGE 1" title="WATER TEMP">
          <Row label="Season avg" value={fmtTemp(pool.avg, unit)} />
          {pool.high && <Row label="High score" value={fmtTemp(pool.high.value, unit)} sub={shortDate(pool.high.date)} />}
          {pool.low && <Row label="Low score" value={fmtTemp(pool.low.value, unit)} sub={shortDate(pool.low.date)} />}
          <Row label="Hottest day" value={fmtTemp(pool.hottestDay.value, unit)} sub={shortDate(pool.hottestDay.date)} />
          <Row label="Coldest day" value={fmtTemp(pool.coldestDay.value, unit)} sub={shortDate(pool.coldestDay.date)} />
          <Row label="Avg daily swing" value={fmtDelta(pool.avgDailySwing, unit)} />
          <Row label="Wildest swing" value={fmtDelta(pool.biggestSwing.value, unit)} sub={shortDate(pool.biggestSwing.date)} />
          {pool.biggestWarmUp && <Row label="Biggest warm-up" value={`+${fmtDelta(pool.biggestWarmUp.value, unit)}`} sub={shortDate(pool.biggestWarmUp.date)} />}
          {pool.biggestCoolDown && <Row label="Biggest cool-down" value={`−${fmtDelta(pool.biggestCoolDown.value, unit)}`} sub={shortDate(pool.biggestCoolDown.date)} />}
          <Row label={`Days ≥ ${thresholdLabel(80, unit)}`} value={pool.warmDays} />
          <Row label={`Days ≥ ${thresholdLabel(70, unit)}`} value={pool.swimmableDays} />
          {pool.longestWarmStreak && <Row label="Heat streak" value={`${pool.longestWarmStreak.days}d`} sub={shortDate(pool.longestWarmStreak.start)} />}
          <Row label="Days tracked" value={pool.days} sub={`${shortDate(pool.firstDate)}–${shortDate(pool.lastDate)}`} />
        </Stage>
      )}

      <Stage n="STAGE 2" title="CHEMISTRY">
        <Row label="Tests logged" value={chem.tests} />
        <Row label="Test days" value={chem.testDays} />
        {chem.avgDaysBetween !== null && <Row label="Test every" value={`${num(chem.avgDaysBetween)}d`} />}
        {chem.longestGap && <Row label="Longest gap" value={`${chem.longestGap.days}d`} sub={shortDate(chem.longestGap.from)} />}
        {chem.params.map((p) => {
          const meta = CHEM_BY_KEY[p.key];
          const f = (v: number) => v.toFixed(meta.decimals);
          return (
            <Row
              key={p.key}
              label={`${meta.short} avg`}
              value={`${f(p.avg)}${meta.unit ? ` ${meta.unit}` : ''}`}
              sub={`${f(p.min)}–${f(p.max)}`}
            />
          );
        })}
      </Stage>

      <Stage n="STAGE 3" title="MAINTENANCE">
        <Row label="Chem additions" value={ev.chemical.additions} />
        {ev.chemical.avgDaysBetween !== null && <Row label="Dose every" value={`${num(ev.chemical.avgDaysBetween)}d`} />}
        {ev.chemical.products.map((p) => (
          <Row key={`${p.product}|${p.unit}`} label={p.product} value={`${num(p.total, 2)} ${p.unit}`} sub={`×${p.count}`} />
        ))}
        <Row label="Water top-offs" value={ev.water.count} sub={ev.water.totals.map((t) => `${num(t.total)} ${t.unit}`).join(' + ') || undefined} />
        <Row label="Backwashes" value={ev.backwash.count} />
        <Row label="Notes" value={ev.notes} />
      </Stage>

      {(air || sky) && (
        <Stage n="STAGE 4" title="WEATHER">
          {air && <Row label="Air avg" value={fmtTemp(air.avg, unit)} />}
          {air && <Row label="Air high" value={fmtTemp(air.high.value, unit)} sub={shortDate(air.high.date)} />}
          {air && <Row label="Air low" value={fmtTemp(air.low.value, unit)} sub={shortDate(air.low.date)} />}
          {sky && <Row label="Sunny days" value={sky.sunnyDays} />}
          {sky && <Row label="Rainy days" value={sky.rainyDays} />}
          {sky && <Row label="Usual sky" value={sky.topCondition.label} sub={`${sky.topCondition.pct}%`} />}
        </Stage>
      )}

      <Stage n="BONUS" title="SWIMS">
        <Row label="Swim sessions" value={swims.sessions} />
        <Row label="Total dips" value={swims.dips} />
        <Row label="Players" value={swims.swimmers} />
        {swims.first && <Row label="First swim" value={shortDate(swims.first)} />}
        {swims.last && <Row label="Last swim" value={shortDate(swims.last)} />}
        {swims.busiestDay && <Row label="Busiest day" value={`${swims.busiestDay.dips} dips`} sub={shortDate(swims.busiestDay.date)} />}
        {swims.longestStreak && swims.longestStreak.days > 1 && <Row label="Swim streak" value={`${swims.longestStreak.days}d`} sub={shortDate(swims.longestStreak.start)} />}
        {swims.favoriteWeekday !== null && <Row label="Fave day" value={weekdayName(swims.favoriteWeekday)} />}
        {swims.favoriteHour !== null && <Row label="Fave time" value={hourLabel(swims.favoriteHour)} />}
        {swims.coldestSwim && <Row label="Coldest swim" value={fmtTemp(swims.coldestSwim.value, unit)} sub={swims.coldestSwim.people.join('')} />}
        {swims.warmestSwim && <Row label="Warmest swim" value={fmtTemp(swims.warmestSwim.value, unit)} sub={swims.warmestSwim.people.join('')} />}
      </Stage>
    </>
  );
}

export interface SeasonSummaryViewProps {
  year: number;
  maxYear: number;
  onYearChange: (year: number) => void;
  summary: Summary | null;
  loading: boolean;
  error: string | null;
  unit: TemperatureUnit;
}

function hasAnyData(s: Summary): boolean {
  return s.pool !== null || s.air !== null || s.sky !== null
    || s.chemistry.tests > 0 || s.events.total > 0 || s.swims.sessions > 0;
}

export function SeasonSummaryView({ year, maxYear, onYearChange, summary, loading, error, unit }: SeasonSummaryViewProps) {
  const facts = summary ? funFacts(summary, unit) : [];
  return (
    <div className={styles.cabinet}>
      <div className={styles.screen}>
        <header className={styles.marquee}>
          <p className={`${styles.blink} ${styles.gameOver}`}>GAME OVER</p>
          <div className={styles.yearNav}>
            <button type="button" className={styles.arrow} onClick={() => onYearChange(year - 1)} disabled={year <= MIN_YEAR} aria-label="Previous season">◀</button>
            <h2 className={styles.title}>SEASON {year}</h2>
            <button type="button" className={styles.arrow} onClick={() => onYearChange(year + 1)} disabled={year >= maxYear} aria-label="Next season">▶</button>
          </div>
          <p className={styles.tagline}>THANKS FOR PLAYING · FINAL STATS</p>
        </header>

        {loading && <p className={`${styles.status} ${styles.blink}`}>LOADING…</p>}
        {!loading && error && <p className={styles.status}>TILT! COULDN’T LOAD THE SCORES</p>}
        {!loading && !error && summary && !hasAnyData(summary) && (
          <p className={styles.status}>NO PLAYERS THIS SEASON</p>
        )}

        {!loading && !error && summary && hasAnyData(summary) && (
          <>
            <div className={styles.topBar}>
              <div><span className={styles.topLabel}>DIPS</span><span className={styles.topScore}>{score(summary.swims.dips)}</span></div>
              <div>
                <span className={styles.topLabel}>HI-TEMP</span>
                <span className={styles.topScore}>{summary.pool?.high ? fmtTemp(summary.pool.high.value, unit) : '---'}</span>
              </div>
              <div><span className={styles.topLabel}>DOSES</span><span className={styles.topScore}>{score(summary.events.chemical.doses)}</span></div>
            </div>

            <section className={styles.highScores} aria-label="High scores">
              <h3 className={styles.hsTitle}>★ HIGH SCORES ★</h3>
              <HighScores board={summary.swims.leaderboard} />
            </section>

            <Stages s={summary} unit={unit} />

            {facts.length > 0 && (
              <section className={styles.stage} aria-label="Achievements unlocked">
                <h3 className={styles.stageTitle}><span className={styles.stageNum}>★</span> ACHIEVEMENTS UNLOCKED</h3>
                <ul className={styles.facts}>
                  {facts.map((f) => (
                    <li key={f.text} className={styles.fact}>
                      <span className={styles.factIcon} aria-hidden="true">{f.icon}</span>
                      <span>{f.text}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        <footer className={styles.footer}>
          <p className={styles.blink}>INSERT COIN FOR SEASON {year + 1}</p>
          <p className={styles.credit}>CREDIT 00</p>
        </footer>
      </div>
    </div>
  );
}

export function SeasonSummary({ initialYear }: { initialYear?: number }) {
  const maxYear = new Date().getFullYear();
  const [year, setYear] = useState(Math.min(initialYear ?? maxYear, maxYear));
  const { summary, loading, error } = useSeasonSummary(year);
  const { unit } = useTheme();
  return (
    <SeasonSummaryView
      year={year}
      maxYear={maxYear}
      onYearChange={(y) => setYear(Math.min(y, maxYear))}
      summary={summary}
      loading={loading}
      error={error}
      unit={unit}
    />
  );
}
