import { ChevronRight, ExternalLink } from 'lucide-react';
import { useT, useTn } from '@/i18n';
import { artistProfile, type BundleCredit } from '@/data/spriteCredits';

/** Rows a phone shows before the fold. */
const FOLD_AFTER = 10;

const ROW = 'flex items-baseline justify-between gap-3 py-1.5 text-sm';

function ArtistRow({ name, files }: { name: string; files: number }) {
  const tn = useTn();
  const href = artistProfile(name);
  return (
    <li className={ROW}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-w-0 items-baseline gap-1 break-words font-medium text-foreground underline decoration-muted-foreground/40 underline-offset-2 hover:decoration-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 break-words">{name}</span>
          <ExternalLink className="h-3 w-3 shrink-0 self-center text-primary" aria-hidden />
        </a>
      ) : (
        <span className="min-w-0 break-words">{name}</span>
      )}
      <span className="shrink-0 tabular-nums text-muted-foreground">{tn('ack.sprites', files)}</span>
    </li>
  );
}

/** A bundle's artists, ranked by the app's files credited to them through it. */
export function BundleArtists({ entry }: { entry: BundleCredit }) {
  const t = useT();
  const tn = useTn();
  const shared = entry.artists.reduce((sum, [, files]) => sum + files, 0) > entry.sprites - entry.unconfirmed;
  const top = entry.artists.slice(0, FOLD_AFTER);
  const rest = entry.artists.slice(FOLD_AFTER);
  return (
    <div className="flex flex-col gap-2" data-testid="ack-artists">
      <p className="text-sm leading-relaxed" data-testid="ack-artists-summary">{tn('ack.bundleSprites', entry.sprites)}</p>
      {shared && <p className="text-xs leading-relaxed text-muted-foreground">{t('ack.sharedSprites')}</p>}
      <ol className="-mb-1 divide-y">
        {top.map(([name, files]) => <ArtistRow key={name} name={name} files={files} />)}
      </ol>
      {rest.length > 0 && (
        <details className="group -mx-3 border-t" data-testid="ack-artists-more">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
            <span>{tn('ack.showAllArtists', entry.artists.length)}</span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
          </summary>
          <ol className="divide-y px-3">
            {rest.map(([name, files]) => <ArtistRow key={name} name={name} files={files} />)}
          </ol>
        </details>
      )}
      {entry.unconfirmed > 0 && (
        <p className={`${ROW} -mx-3 border-t px-3 pt-2.5 pb-0 text-muted-foreground`} data-testid="ack-artists-unconfirmed">
          <span className="italic">{t('ack.notConfirmed')}</span>
          <span className="shrink-0 tabular-nums">{tn('ack.sprites', entry.unconfirmed)}</span>
        </p>
      )}
    </div>
  );
}
