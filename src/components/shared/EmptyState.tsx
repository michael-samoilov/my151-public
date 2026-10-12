import type { MouseEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Psyduck holding its head, as a line drawing: a 64-unit box, a 2-unit
 * stroke, and round caps and joins, like the app's outline icons. The box
 * grows with its rem size and the stroke stays 2 units (see `pathScale.ts`).
 * The paths are the "Traced bill" drawing, used as drawn.
 */
function PsyduckArt({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-art="psyduck"
    >
      <path d="M4.748 40.722L14.983 18.917C15.818 17.137 17.938 16.372 19.718 17.208C20.047 17.362 20.342 17.561 20.598 17.793 M6.6 45.52C6.552 45.5 6.504 45.479 6.457 45.457C4.677 44.622 3.912 42.502 4.748 40.722" />
      <path d="M31.11 19.095C37.037 19.095 42.287 21.991 45.522 26.446 M47.113 44.699C45.591 47.813 43.187 50.417 40.227 52.186 M13.343 37.991C13.321 37.629 13.31 37.263 13.31 36.895C13.31 27.064 21.279 19.095 31.11 19.095" />
      <path d="M48.91 38.675L48.91 29.775C48.91 26.826 51.301 24.435 54.25 24.435C57.199 24.435 59.59 26.826 59.59 29.775L59.59 38.675C59.59 41.624 57.199 44.015 54.25 44.015C51.301 44.015 48.91 41.624 48.91 38.675" />
      <path d="M10.996 45.083C13.488 42.057 18.116 39.565 22.388 38.497C24.168 37.963 25.592 37.34 27.55 37.34C30.042 37.34 32.534 38.675 35.204 39.743C38.052 40.9 40.722 42.413 40.188 44.905C39.743 47.041 37.518 48.999 36.094 50.957C34.492 53.271 32.356 56.297 28.44 56.297L17.048 56.297C14.556 56.297 12.598 55.051 11.352 53.093C10.106 50.957 9.928 46.863 10.996 45.083" />
      <path d="M25.325 25.325C27.538 25.325 29.33 27.117 29.33 29.33C29.33 31.543 27.538 33.335 25.325 33.335C23.112 33.335 21.32 31.543 21.32 29.33C21.32 27.117 23.112 25.325 25.325 25.325 Z" />
      <path d="M39.12 27.55C41.578 27.55 43.57 29.542 43.57 32C43.57 34.458 41.578 36.45 39.12 36.45C36.662 36.45 34.67 34.458 34.67 32C34.67 29.542 36.662 27.55 39.12 27.55 Z" />
      <path d="M37.198 20.168C39.264 16.774 40.247 12.828 40.01 8.86" />
      <path d="M41.064 22.139C44.008 18.079 45.936 13.374 46.685 8.415" />
      <path d="M44.337 24.985C47.821 22.144 50.475 18.419 52.025 14.2" />
      <circle cx="25.503" cy="28.885" r="1" fill="currentColor" stroke="none" />
      <circle cx="38.141" cy="32.445" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export interface EmptyStateAction {
  label: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}

/**
 * The empty state of a list: a quiet picture, a title that names the cause,
 * one line of body, and a button only when the person can fix it here.
 *
 * The title is the darkest thing, then the body, then the picture. Every size
 * is in rem, so the root font size scales the whole block on every screen.
 */
export function EmptyState({ title, body, action, testId, className }: {
  title: ReactNode;
  body: ReactNode;
  action?: EmptyStateAction;
  testId?: string;
  className?: string;
}) {
  return (
    <section
      data-testid={testId}
      className={cn('mx-auto flex w-full max-w-[17.5rem] flex-col items-center px-4 pb-8 pt-10 text-center', className)}
    >
      <PsyduckArt className="mb-3.5 size-14 shrink-0 text-[#a3a3a3]" />
      <h2 className="text-sm font-semibold tracking-tight text-foreground text-balance">{title}</h2>
      <p className="mt-1 text-xs leading-[1.125rem] text-muted-foreground text-balance">{body}</p>
      {action ? (
        <Button
          type="button"
          variant="outline"
          onClick={action.onClick}
          className="mt-4 h-auto min-h-8 max-w-full whitespace-normal bg-card px-3 py-[0.3125rem] text-xs leading-5 text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)] text-balance"
        >
          {action.label}
        </Button>
      ) : null}
    </section>
  );
}

/**
 * A title that repeats the search words, from a template such as
 * `No Pokémon match “{query}”`. The catalog holds each language's own quotes
 * around `{query}`. The words and their quotes stay together on one line, so a
 * line never starts with a closing quote. A search longer than 16 characters is
 * cut to 15 and "…", so the run fits a 320 px screen.
 */
export function QueryTitle({ template, query }: { template: string; query: string }) {
  const [head, tail = ''] = template.split('{query}');
  const open = /[\p{Pi}\p{Ps}"']\s?$/u.exec(head)?.[0] ?? '';
  const close = /^\s?[\p{Pf}\p{Pe}\p{Pi}"']/u.exec(tail)?.[0] ?? '';
  const chars = [...query.trim()];
  return (
    <>
      {head.slice(0, head.length - open.length)}
      <span className="whitespace-nowrap">{open}{chars.length > 16 ? `${chars.slice(0, 15).join('')}…` : chars.join('')}{close}</span>
      {tail.slice(close.length)}
    </>
  );
}
