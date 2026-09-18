import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type ExportPreviewJob = {
  key: string;
  render: () => Promise<Blob>;
};

/**
 * Paint the active export first. Later setting switches render that key on
 * demand and reuse a cached blob URL. Do not encode every permutation up
 * front: that work froze pointer-tilt.
 */
export function useExportPreviewCache(opts: {
  enabled: boolean;
  activeKey: string;
  jobs: readonly ExportPreviewJob[];
}): { urls: Record<string, string>; busy: boolean } {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef(urls);
  const jobsRef = useRef(opts.jobs);
  const objectUrlsRef = useRef(new Set<string>());
  useLayoutEffect(() => {
    urlsRef.current = urls;
    jobsRef.current = opts.jobs;
  });

  useEffect(() => {
    if (!opts.enabled) return;
    let cancelled = false;
    const pending = new Set<string>();

    const remember = (key: string, blob: Blob) => {
      if (cancelled) return;
      const url = URL.createObjectURL(blob);
      objectUrlsRef.current.add(url);
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
      // Skip the rest of the permutation list. Encoding every export on the
      // main thread stole frames from pointer-tilt. First paint stays the
      // active job; a later setting switch renders that key on demand.
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
