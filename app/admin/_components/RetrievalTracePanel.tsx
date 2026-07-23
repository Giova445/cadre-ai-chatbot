import type { TraceRow } from "@/lib/admin/contracts";
import { ModeBadge } from "./ModeBadge";
import { ScoreBar } from "./ScoreBar";
import styles from "../admin.module.css";

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// Compact retrieval-trace card rendered under an assistant turn: the
// decision (mode + reason), the guardrail numbers that produced it, then the
// ranked chunk list. Cited vs retrieved-but-not-cited chunks are visually
// distinguished (accent left border + "Cited" pill vs dimmed + neutral pill)
// so a reviewer can see at a glance what actually grounded the answer versus
// what was retrieved but fell below the citation floor.
export function RetrievalTracePanel({ trace }: { trace: TraceRow }) {
  const chunks = [...trace.chunks].sort((a, b) => a.rank - b.rank);

  return (
    <section className={styles.tracePanel} aria-label="Retrieval trace">
      <div className={styles.traceHead}>
        <ModeBadge mode={trace.mode} />
        <span className={styles.traceReason}>{trace.reason}</span>
      </div>

      <dl className={styles.traceMeta}>
        <div>
          <dt>Coverage</dt>
          <dd>{pct(trace.coverage)}</dd>
        </div>
        <div>
          <dt>Threshold</dt>
          <dd>{trace.threshold.toFixed(4)}</dd>
        </div>
        <div>
          <dt>Top score</dt>
          <dd>{trace.topScore.toFixed(4)}</dd>
        </div>
        <div>
          <dt>Backend</dt>
          <dd>{trace.backend}</dd>
        </div>
        <div>
          <dt>Embedder</dt>
          <dd>{trace.embedderModel}</dd>
        </div>
      </dl>

      {chunks.length === 0 ? (
        <p className={styles.traceEmpty}>No chunks retrieved.</p>
      ) : (
        <table className={styles.chunkTable}>
          <caption className="sr-only">Retrieved chunks, ranked by score</caption>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Source</th>
              <th scope="col">Section</th>
              <th scope="col">Score</th>
              <th scope="col">Cited</th>
            </tr>
          </thead>
          <tbody>
            {chunks.map((chunk) => (
              <tr
                key={chunk.chunkId}
                className={chunk.cited ? styles.chunkRowCited : styles.chunkRowRetrieved}
              >
                <td>{chunk.rank}</td>
                <td>
                  {chunk.source}
                  {chunk.title ? <span className={styles.chunkTitle}> · {chunk.title}</span> : null}
                </td>
                <td>{chunk.section}</td>
                <td>
                  <ScoreBar score={chunk.score} />
                </td>
                <td>
                  {chunk.cited ? (
                    <span className={styles.citedBadge}>Cited</span>
                  ) : (
                    <span className={styles.notCitedBadge}>Retrieved only</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
