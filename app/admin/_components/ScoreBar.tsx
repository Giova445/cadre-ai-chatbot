import styles from "../admin.module.css";

// Horizontal bar visualizing a 0..1 cosine similarity score, with a 4dp
// numeric label. Clamped defensively — retrieval scores should already be in
// range, but this is display code and must never render a >100% bar.
export function ScoreBar({ score }: { score: number }) {
  const clamped = Math.min(1, Math.max(0, score));
  const pct = Math.round(clamped * 100);

  return (
    <div className={styles.scoreBar}>
      <div
        className={styles.scoreBarTrack}
        role="img"
        aria-label={`Score ${clamped.toFixed(4)} out of 1`}
      >
        <div className={styles.scoreBarFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.scoreBarLabel}>{clamped.toFixed(4)}</span>
    </div>
  );
}
