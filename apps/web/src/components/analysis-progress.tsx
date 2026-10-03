'use client';

import { useEffect, useState } from 'react';

interface AnalysisStage {
  readonly name: string;
  readonly status: string;
  readonly attemptCount: number;
  readonly progress?: { readonly current?: number; readonly total?: number };
  readonly error?: { readonly code: string; readonly message: string };
}

interface AnalysisRun {
  readonly id: string;
  readonly repositoryId: string;
  readonly status: 'queued' | 'running' | 'completed' | 'partial' | 'failed';
  readonly requestedRevision?: string;
  readonly snapshotRevision?: string;
  readonly stages: readonly AnalysisStage[];
  readonly nextAttemptAt?: string;
  readonly error?: { readonly code: string; readonly message: string };
}

export function AnalysisProgress({
  runId,
  reused,
}: {
  readonly runId: string;
  readonly reused: boolean;
}) {
  const [run, setRun] = useState<AnalysisRun | null>(null);
  const [message, setMessage] = useState('Loading analysis status…');

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const response = await fetch(`/api/analysis-runs/${encodeURIComponent(runId)}`);
        if (!response.ok) throw new Error('Run status is unavailable.');
        const result = (await response.json()) as AnalysisRun;
        if (!active) return;
        setRun(result);
        setMessage('');
        if (result.status === 'queued' || result.status === 'running') {
          timer = setTimeout(() => void load(), 2_000);
        }
      } catch {
        if (active) setMessage('Analysis status could not be loaded. Refresh to try again.');
      }
    };
    void load();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [runId]);

  if (!run) return <p role="status">{message}</p>;
  return (
    <section aria-live="polite">
      {reused && <p className="notice" role="status">An existing active analysis was reused.</p>}
      <div className="panel">
        <h2>Status: {run.status}</h2>
        {run.requestedRevision && <p>Requested revision: {run.requestedRevision}</p>}
        {run.snapshotRevision && <p>Analyzed revision: <code>{run.snapshotRevision}</code></p>}
        {run.nextAttemptAt && (
          <p role="status">Transient failure; retry scheduled for {new Date(run.nextAttemptAt).toLocaleString()}.</p>
        )}
        {run.error && <p className="error" role="alert">{run.error.message}</p>}
      </div>
      <h2>Analysis stages</h2>
      <ol className="stage-list">
        {run.stages.map((stage) => (
          <li className="panel" key={stage.name}>
            <h3>{stage.name.replaceAll('_', ' ')}</h3>
            <p>Status: {stage.status} · Attempts: {stage.attemptCount}</p>
            {stage.progress && (
              <p>
                Progress: {stage.progress.current ?? 0}
                {stage.progress.total !== undefined ? ` / ${stage.progress.total}` : ''}
              </p>
            )}
            {stage.error && <p className="error">{stage.error.message}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
