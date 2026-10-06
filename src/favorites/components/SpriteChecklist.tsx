import { useEffect, useState } from 'react';
import { pickerSpriteCssPx } from '../model/pickerSprite';
import { SPRITE_REVIEWS, type SpriteReview } from '../model/spriteChecklist';

const STATUS = {
  'needs-art': 'Needs art',
  'needs-choice': 'Needs your choice',
  'needs-identity': 'Confirm form',
  'candidate-found': 'Candidate found',
};

export function SpriteChecklist() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const spritePx = pickerSpriteCssPx(width);
  const entries = SPRITE_REVIEWS.filter((entry) =>
    (status === 'all' || entry.status === status)
    && `${entry.name} ${entry.search} ${entry.interpretations?.join(' ') ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <main className="min-h-dvh bg-background px-4 py-5 text-foreground sm:px-6" data-testid="sprite-checklist">
      <div className="mx-auto max-w-5xl space-y-5">
        <a href="/favorite-pokemon-picker" className="inline-flex min-h-11 items-center text-sm text-primary underline">Back to picker</a>
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">Sprite checklist</h1>
          <p className="text-sm">Gen 5 pixel art. No shinies. Preview only. Compare candidates before choosing.</p>
          <p className="text-sm text-muted-foreground">Images added here stay in this tab. Your favorite picks and shared sprites stay unchanged.</p>
        </header>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm">Find a form
            <input value={search} onChange={(event) => setSearch(event.target.value)} type="search" className="block min-h-11 w-full rounded-md border bg-background px-3" />
          </label>
          <label className="space-y-1 text-sm">Status
            <select value={status} onChange={(event) => setStatus(event.target.value)} className="block min-h-11 w-full rounded-md border bg-background px-3">
              <option value="all">All forms</option>
              {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
        <p className="text-sm" aria-live="polite">{entries.length} of {SPRITE_REVIEWS.length} entries · {spritePx}px picker size</p>
        {entries.length === 0 ? <p>No matching forms. Try another name or status.</p> : null}
        <div className="grid items-start gap-4 lg:grid-cols-2">
          {SPRITE_REVIEWS.map((entry) => <ReviewCard key={entry.key} entry={entry} spritePx={spritePx} visible={entries.includes(entry)} />)}
        </div>
      </div>
    </main>
  );
}

function ReviewCard({ entry, spritePx, visible }: { entry: SpriteReview; spritePx: number; visible: boolean }) {
  const [uploads, setUploads] = useState<{ sprite: string; label: string }[]>([]);
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  function addImages(files: FileList | null) {
    if (!files) return;
    setError('');
    for (const file of Array.from(files)) {
      if (!['image/png', 'image/gif', 'image/webp', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        setError('Use PNG, GIF, WebP, or JPEG under 5 MB.');
        continue;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const sprite = reader.result;
          setUploads((current) => [...current, { sprite, label: file.name }]);
        }
      };
      reader.readAsDataURL(file);
    }
  }
  return (
    <article className="min-w-0 space-y-3 rounded-lg border bg-card p-4" data-sprite-review={entry.key} hidden={!visible}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">{entry.name}</h2>
        <span className="rounded bg-muted px-2 py-1 text-xs">{STATUS[entry.status]}</span>
      </div>
      <p className="text-sm text-muted-foreground">{entry.placement}</p>
      <p className="text-sm">{entry.note}</p>
      {entry.interpretations ? <div className="flex flex-wrap gap-2">{entry.interpretations.map((name) => <span key={name} className="rounded border px-2 py-1 text-sm">{name}</span>)}</div> : null}
      <div className="grid grid-cols-2 gap-4">
        {entry.currentId ? <figure className="space-y-1">
          <img data-audit-scale="intended" src={`/sprites/pokemon/${entry.currentId}.png`} alt={`${entry.name} current sprite`} width={spritePx} height={spritePx} style={{ imageRendering: 'pixelated', width: spritePx, height: spritePx, objectFit: 'contain' }} />
          <figcaption className="text-sm">Current sprite</figcaption>
        </figure> : null}
        {entry.candidates.map((candidate) => <figure key={candidate.sprite} className="min-w-0 space-y-1">
          <img data-audit-scale="intended" src={candidate.sprite} alt={`${entry.name} ${candidate.label}`} width={spritePx} height={spritePx} style={{ imageRendering: candidate.label === 'Pose reference' ? 'auto' : 'pixelated', width: spritePx, height: spritePx, objectFit: 'contain' }} />
          <figcaption className="text-sm">{candidate.label}</figcaption>
          <a className="block text-sm text-primary underline" href={candidate.source} target="_blank" rel="noreferrer">Source</a>
          <p className="max-w-48 text-xs text-muted-foreground">{candidate.note}</p>
        </figure>)}
        {uploads.map((upload, index) => <figure key={`${upload.label}-${index}`} className="max-w-40 space-y-1">
          <img data-audit-scale="intended" src={upload.sprite} alt={`${entry.name} uploaded candidate ${index + 1}`} width={spritePx} height={spritePx} style={{ imageRendering: 'pixelated', objectFit: 'contain' }} />
          <figcaption className="break-words text-sm">Candidate {index + 1}</figcaption>
          <p className="break-words text-xs">{upload.label}</p>
          <button type="button" className="min-h-11 text-sm text-primary underline" onClick={() => setUploads((current) => current.filter((_, at) => at !== index))}>Remove</button>
        </figure>)}
      </div>
      {entry.candidates.length === 0 ? <p className="text-sm text-muted-foreground">No verified candidate yet. Add images below for comparison.</p> : null}
      <div className="text-sm">
        <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="flex min-h-11 cursor-pointer items-center">Search and add candidates</button>
        {expanded ? <div className="space-y-3 pt-2">
          <p className="break-words">Search for “{entry.search}”.</p>
          <a href={`https://www.google.com/search?q=${encodeURIComponent(entry.search)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-primary underline">Search the web</a>
          <label className="block space-y-1">Source link or artist credit
            <input type="text" value={source} onChange={(event) => setSource(event.target.value)} className="block min-h-11 w-full rounded border bg-background px-2" />
          </label>
          <label className="block space-y-1">Add candidate images
            <input type="file" multiple accept="image/png,image/gif,image/webp,image/jpeg" className="block min-h-11 w-full min-w-0 text-sm" onChange={(event) => { addImages(event.target.files); event.target.value = ''; }} />
          </label>
          <div tabIndex={0} role="group" aria-label={`Paste candidate for ${entry.name}`} className="rounded border border-dashed p-3" onPaste={(event) => addImages(event.clipboardData.files)}>Paste an image here, or select files above.</div>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          {source ? <p className="break-words text-sm">Your source: {source}</p> : null}
        </div> : null}
      </div>
    </article>
  );
}
