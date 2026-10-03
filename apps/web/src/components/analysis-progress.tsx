'use client';

import { useEffect, useRef, useState } from 'react';

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
  const [pollingIssue, setPollingIssue] = useState(false);
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let consecutiveFailures = 0;
    const load = async () => {
      try {
        const response = await fetch(`/api/analysis-runs/${encodeURIComponent(runId)}`);
        if (!response.ok) throw new Error('Run status is unavailable.');
        const result = (await response.json()) as AnalysisRun;
        if (!active) return;
        consecutiveFailures = 0;
        setRun(result);
        setMessage('');
        setPollingIssue(false);
        if (result.status === 'queued' || result.status === 'running') {
          timer = setTimeout(() => void load(), 2_000);
        }
      } catch {
        if (!active) return;
        consecutiveFailures += 1;
        setPollingIssue(true);
        setMessage(
          runRef.current
            ? ''
            : 'Analysis status could not be loaded. Refresh to try again.',
        );
        if (
          !runRef.current ||
          runRef.current.status === 'queued' ||
          runRef.current.status === 'running'
        ) {
          const delayMs = Math.min(10_000, 1_000 * 2 ** Math.min(consecutiveFailures - 1, 4));
          timer = setTimeout(() => void load(), delayMs);
        }
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
      {pollingIssue && (
        <p className="notice" role="status">
          Status refresh is temporarily unavailable; retrying automatically.
        </p>
      )}
      <div className="panel">
        <h2>Status: {run.status}</h2>
        <p>
          {run.status === 'queued' && 'Analysis is queued and will start when a worker is available.'}
          {run.status === 'running' && 'Analysis is in progress. Stage status refreshes automatically.'}
          {run.status === 'completed' && 'Analysis completed successfully.'}
          {run.status === 'partial' && 'Analysis completed with issues or unprocessed scope.'}
          {run.status === 'failed' && 'Analysis failed. Review the stage details below.'}
        </p>
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
              stage.progress.total !== undefined && stage.progress.total > 0 ? (
                <label>
                  Progress: {stage.progress.current ?? 0} / {stage.progress.total}
                  <progress
                    aria-label={`${stage.name.replaceAll('_', ' ')} progress`}
                    value={stage.progress.current ?? 0}
                    max={stage.progress.total}
                  />
                </label>
              ) : <p>Progress: {stage.progress.current ?? 0}</p>
            )}
            {stage.error && <p className="error">{stage.error.message}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
