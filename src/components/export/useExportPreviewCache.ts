import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type ExportPreviewJob = {
  key: string;
  render: () => Promise<Blob>;
};

export function useExportPreviewCache(opts: {
  enabled: boolean;
  activeKey: string;
  jobs: readonly ExportPreviewJob[];
}): { urls: Record<string, string>; busy: boolean } {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const urlsRef = useRef(urls);
  const jobsRef = useRef(opts.jobs);
  const objectUrlsRef = useRef(new Set<string>());
  const shownKeyRef = useRef<string | null>(null);
  const activeReady = Boolean(urls[opts.activeKey]);
  useLayoutEffect(() => {
    urlsRef.current = urls;
    jobsRef.current = opts.jobs;
    if (urls[opts.activeKey]) shownKeyRef.current = opts.activeKey;
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
        if (!cancelled) setFailed((prev) => new Set(prev).add(job.key));
      } finally {
        pending.delete(job.key);
      }
    };

    const pump = async () => {
      const jobs = jobsRef.current;
      const active = jobs.find((job) => job.key === opts.activeKey);
      if (active) await runJob(active);
    };

    void pump();
    return () => {
      cancelled = true;
    };
  }, [opts.activeKey, opts.enabled, opts.jobs]);

  useEffect(() => {
    const live = new Set(opts.jobs.map((job) => job.key));
    if (!activeReady && shownKeyRef.current) live.add(shownKeyRef.current);
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
  }, [opts.jobs, activeReady]);

  useEffect(() => {
    const held = objectUrlsRef.current;
    return () => {
      for (const url of held) URL.revokeObjectURL(url);
      held.clear();
    };
  }, []);

  return { urls, busy: opts.enabled && !urls[opts.activeKey] && !failed.has(opts.activeKey) };
}
