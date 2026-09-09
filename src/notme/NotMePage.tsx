import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getClientId, isOptedOut, setOptOut } from '@/lib/clientId';

/**
 * Confirms that this browser is excluded from analytics, and lets it back in.
 *
 * A page rather than only the `?notme` query flag, because the flag gives no
 * feedback: you type it, nothing visible happens, and weeks later you find out
 * whether it worked by looking for your own sessions in the dashboard. This
 * says so immediately, on every device you have to repeat it on.
 */
export function NotMePage({ applied }: { applied: boolean }) {
  const [out, setOut] = useState(() => isOptedOut());
  const [failed, setFailed] = useState(!applied);
  // The id this browser would report. Shown so an existing record can be found
  // and deleted in the dashboard: opting out stops new beacons, it does not
  // remove what earlier visits already wrote.
  const [cid] = useState(() => getClientId());

  const toggle = (next: boolean) => {
    const ok = setOptOut(next);
    setOut(isOptedOut());
    setFailed(!ok);
  };

  return (
    <main className="min-h-dvh flex items-center justify-center p-4">
      <div className="w-full max-w-md flex flex-col gap-3 bg-card rounded-lg shadow-elevated p-4">
        <h1 className="text-lg font-bold">
          <span className="text-primary">my151</span> · Not me
        </h1>

        {failed ? (
          <p className="text-sm text-destructive">
            This browser would not keep the setting. Its storage is blocked or discarded, so the
            exclusion cannot be remembered here — private windows behave this way. Your visits are
            still being counted.
          </p>
        ) : out ? (
          <p className="text-sm">
            <span className="font-medium text-primary">This browser is excluded.</span> Nothing you
            do in the dex builder, the gym leader maker or the hub is recorded.
          </p>
        ) : (
          <p className="text-sm">
            This browser is <span className="font-medium">counted like anyone else&rsquo;s</span>.
          </p>
        )}

        <div className="text-xs text-muted-foreground flex flex-col gap-2">
          <p>
            The setting is stored in this browser and covers every page on this domain, so one
            visit here is enough for all three tools. It does not travel: repeat it on each device
            and browser you use, and again after clearing site data. A private window forgets it
            when it closes, and a preview deployment is a different domain with its own setting.
          </p>
          <p>
            Visiting any page with <code className="bg-muted px-1 rounded">?notme</code> does the
            same thing. This page exists so you can see that it worked.
          </p>
          {out && (
            <p>
              Opting out stops new reports; it does not delete what earlier visits recorded. To
              remove those, find this id on the analytics page and delete it:{' '}
              <code className="bg-muted px-1 rounded break-all">{cid}</code>
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {out ? (
            <Button variant="outline" onClick={() => toggle(false)}>
              Count this browser again
            </Button>
          ) : (
            <Button onClick={() => toggle(true)}>Exclude this browser</Button>
          )}
          <Button variant="ghost" asChild>
            <a href="/">Back to my151</a>
          </Button>
        </div>
      </div>
    </main>
  );
}
