import { useEffect, useRef, useState } from 'react';

export type ExportPreviewJob = {
  key: string;
  render: () => Promise<Blob>;
};

/**
 * Paint the active export first, then fill the rest of the job list in the
 * background. Setting switches read a cached blob URL with no extra render.
 */
export function useExportPreviewCache(opts: {
  enabled: boolean;
  activeKey: string;
  jobs: readonly ExportPreviewJob[];
}): { urls: Record<string, string>; busy: boolean } {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef(urls);
  urlsRef.current = urls;
  const jobsRef = useRef(opts.jobs);
  jobsRef.current = opts.jobs;
  const objectUrlsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!opts.enabled) return;
    let cancelled = false;
    const pending = new Set<string>();

    const remember = (key: string, blob: Blob) => {
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      objectUrlsRef.current.add(url);
      const warm = new Image();
      warm.src = url;
      setUrls((prev) => {
        const stale = prev[key];
        if (stale && stale !== url) {
          URL.revokeObjectURL(stale);
          objectUrlsRef.current.delete(stale);
        }
        return { ...prev, [key]: url };
      });
    };

    const runJob = async (job: ExportPreviewJob) => {
      if (cancelled || urlsRef.current[job.key] || pending.has(job.key)) return;
      pending.add(job.key);
      try {
        const blob = await job.render();
        remember(job.key, blob);
      } catch (err) {
        console.error('Export preview failed:', err);
      } finally {
        pending.delete(job.key);
      }
    };

    const pump = async () => {
      const jobs = jobsRef.current;
      const active = jobs.find((job) => job.key === opts.activeKey);
      if (active) await runJob(active);
      if (cancelled) return;
      const rest = jobs.filter((job) => job.key !== opts.activeKey);
      for (const job of rest) {
        if (cancelled) return;
        await runJob(job);
      }
    };

    void pump();
    return () => {
      cancelled = true;
    };
  }, [opts.activeKey, opts.enabled, opts.jobs]);

  useEffect(() => {
    const live = new Set(opts.jobs.map((job) => job.key));
    setUrls((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [key, url] of Object.entries(prev)) {
        if (live.has(key)) continue;
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(url);
        delete next[key];
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [opts.jobs]);

  useEffect(() => {
    const held = objectUrlsRef.current;
    return () => {
      for (const url of held) URL.revokeObjectURL(url);
      held.clear();
    };
  }, []);

  return { urls, busy: opts.enabled && !urls[opts.activeKey] };
}
