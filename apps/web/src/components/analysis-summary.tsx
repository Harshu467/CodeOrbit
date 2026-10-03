'use client';

import { useEffect, useState } from 'react';

interface Summary {
  readonly runId: string;
  readonly status: 'queued' | 'running' | 'completed' | 'partial' | 'failed';
  readonly counts: {
    readonly files: number;
    readonly projects: number;
    readonly symbols: number;
    readonly apis: number;
    readonly tests: number;
    readonly dependencies: number;
    readonly relationships: number;
    readonly unresolvedRelationships: number;
  };
  readonly issues: readonly {
    readonly code: string;
    readonly message: string;
    readonly stage?: string;
    readonly path?: string;
  }[];
}

const COUNT_LABELS: ReadonlyArray<readonly [keyof Summary['counts'], string]> = [
  ['files', 'Files'],
  ['projects', 'Projects'],
  ['symbols', 'Symbols'],
  ['apis', 'APIs'],
  ['tests', 'Tests'],
  ['dependencies', 'Dependencies'],
  ['relationships', 'Relationships'],
  ['unresolvedRelationships', 'Unresolved relationships'],
];

export function AnalysisSummary({ runId }: { readonly runId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [message, setMessage] = useState('Loading analysis summary…');

  useEffect(() => {
    let active = true;
    void fetch(`/api/analysis-runs/${encodeURIComponent(runId)}/summary`)
      .then(async (response) => {
        if (!response.ok) throw new Error('Analysis summary is unavailable.');
        return (await response.json()) as Summary;
      })
      .then((result) => {
        if (!active) return;
        setSummary(result);
        setMessage('');
      })
      .catch(() => {
        if (active) setMessage('Analysis summary could not be loaded. Refresh to try again.');
      });
    return () => {
      active = false;
    };
  }, [runId]);

  if (!summary) return <p role="status">{message}</p>;
  return (
    <section aria-live="polite">
      <div className="panel">
        <h2>Status: {summary.status}</h2>
        {summary.status === 'partial' && (
          <p>Some files or relationships could not be fully analyzed; review the issues below.</p>
        )}
        {summary.status === 'failed' && (
          <p>The analysis did not produce a complete system model.</p>
        )}
      </div>
      <h2>System model</h2>
      <dl className="summary-counts">
        {COUNT_LABELS.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{summary.counts[key]}</dd>
          </div>
        ))}
      </dl>
      <h2>Issues and unresolved findings</h2>
      {summary.issues.length === 0 ? (
        <p>No analysis issues were reported.</p>
      ) : (
        <ul>
          {summary.issues.map((issue, index) => (
            <li key={`${issue.code}-${issue.path ?? 'repository'}-${index}`}>
              <strong>{issue.code.replaceAll('_', ' ')}</strong>: {issue.message}
              {issue.stage && <span> (stage: {issue.stage.replaceAll('_', ' ')})</span>}
              {issue.path && <code> — {issue.path}</code>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
