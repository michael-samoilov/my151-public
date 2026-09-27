import { useEffect, useRef, useState } from 'react';
import { usePokedexStore, type Removal } from '@/store/usePokedexStore';
import { getPokemonById } from '@/hooks/usePokemonData';
import { pokemonLabel, useNamesVersion, useT, useTn, type TFn, type TnFn } from '@/i18n';

/** How long the toast stays up, unless a pointer or focus is on it. */
const UNDO_TOAST_MS = 6000;

/** What the toast says went: the line by its first removed stage, one
 *  Pokémon by name, or the whole dex by count. */
function removalMessage(removal: Removal, t: TFn, tn: TnFn): string {
  if (removal.kind === 'all') return tn('builder.undo.cleared', removal.ids.length);
  const removed = new Set(removal.ids);
  const firstStage =
    removal.ids.find((id) => !removed.has(getPokemonById(id)?.evolvesFrom ?? -1)) ?? removal.ids[0];
  const pokemon = getPokemonById(firstStage);
  const label = pokemon ? pokemonLabel(pokemon.id, pokemon.name) : null;
  if (!label || label.pending) return tn('builder.undo.removedCount', removal.ids.length);
  return removal.ids.length === 1
    ? t('builder.undo.removed', { name: label.name })
    : t('builder.undo.removedLine', { name: label.name });
}

/**
 * The Undo toast for the builder's tile X and Clear All.
 *
 * It floats at the bottom of the builder column and takes presses only on
 * itself, so the grid under and around it stays usable. The live region is
 * always mounted, so a screen reader announces each new message. A pointer
 * or focus on the toast holds its timer.
 */
export function UndoToast() {
  const t = useT();
  const tn = useTn();
  useNamesVersion();
  const removal = usePokedexStore((s) => s.lastRemoval);
  const sections = usePokedexStore((s) => s.sections);
  const undoRemoval = usePokedexStore((s) => s.undoRemoval);
  const dismissRemoval = usePokedexStore((s) => s.dismissRemoval);
  // The removal whose toast a pointer or focus is on. Keyed to the removal,
  // so a hold never carries over to the next toast.
  const [heldFor, setHeldFor] = useState<Removal | null>(null);
  const undoRef = useRef<HTMLButtonElement>(null);
  const keyboardRef = useRef(false);

  // A newer change to the dex voids the snapshot, since restoring it would
  // erase that change.
  const live = removal && sections === removal.after ? removal : null;
  const held = live !== null && heldFor === live;
  useEffect(() => {
    if (removal && !live) dismissRemoval();
  }, [removal, live, dismissRemoval]);

  useEffect(() => {
    if (!live || held) return;
    const timer = window.setTimeout(dismissRemoval, UNDO_TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [live, held, dismissRemoval]);

  // A removal made from the keyboard unmounts the focused control, and focus
  // falls back to the page. Move it to Undo instead. A pointer removal leaves
  // focus where it is.
  useEffect(() => {
    const onKey = () => { keyboardRef.current = true; };
    const onPointer = () => { keyboardRef.current = false; };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);
  useEffect(() => {
    if (!live || !keyboardRef.current) return;
    if (document.activeElement && document.activeElement !== document.body) return;
    undoRef.current?.focus();
  }, [live]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-undo-toast
      className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center px-3"
    >
      {live && (
        <div
          key={live.ids.join(',') + live.kind}
          onPointerEnter={() => setHeldFor(live)}
          onPointerLeave={() => setHeldFor(null)}
          onFocus={() => setHeldFor(live)}
          onBlur={() => setHeldFor(null)}
          className="undo-toast-in pointer-events-auto flex max-w-full items-center gap-3 rounded-full bg-foreground py-1.5 pl-4 pr-1.5 text-sm text-background shadow-lg"
        >
          <span className="min-w-0 text-pretty">{removalMessage(live, t, tn)}</span>
          <button
            ref={undoRef}
            type="button"
            onClick={undoRemoval}
            className="shrink-0 cursor-pointer rounded-full bg-primary px-3.5 py-1.5 font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t('builder.undo.action')}
          </button>
        </div>
      )}
    </div>
  );
}
