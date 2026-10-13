import type { MouseEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Psyduck holding its head, as a line drawing: a 64-unit box, a 2-unit
 * stroke, and round caps and joins, like the app's outline icons. The box
 * grows with its rem size and the stroke stays 2 units (see `pathScale.ts`).
 * The face (bill, eyes and jaw) is the "Traced bill" drawing; the crown, the
 * fanned hair and the spiked, webbed hands are traced from the official art.
 */
export function PsyduckArt({ className }: { className?: string }) {
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
      <path d="M42.701 45.92C41.247 48.019 39.352 49.793 37.145 51.105 M24.936 18.271C24.998 18.26 25.06 18.249 25.122 18.239C32.774 16.959 40.462 18.736 46.667 22.932" />
      <path d="M32.15 17.908C32.412 15.332 31.852 12.739 30.55 10.5" />
      <path d="M36.15 18.471C37.14 15.009 38.768 11.764 40.95 8.9" />
      <path d="M40.15 19.612C41.636 16.803 44.397 14.895 47.55 14.5" />
      <path d="M10.285 36.806C9.92 30.312 13.142 23.854 19.16 20.38L21.065 19.28C20.343 19.011 19.795 18.41 19.595 17.666C19.395 16.922 19.567 16.127 20.056 15.532C19.296 15.659 18.522 15.41 17.978 14.865C17.434 14.319 17.187 13.544 17.315 12.785L15.41 13.885C10.073 16.966 6.373 22.25 5.303 28.319C4.625 32.166 5.047 36.078 6.456 39.63" />
      <path d="M47.25 28.5 C47.25 27.3 46.843 27.775 45.75 26.9 C47.497 27.277 49.285 26.465 50.15 24.9 C50.747 25.966 51.827 26.673 53.043 26.792 C54.259 26.912 55.457 26.429 56.25 25.5 L56.25 28.5 C56.25 35.987 59.05 37.413 59.05 44.9 C59.05 48.324 56.274 51.1 52.85 51.1 C49.426 51.1 46.65 48.324 46.65 44.9 C46.65 38.007 47.25 35.393 47.25 28.5 Z" />
      <path d="M7.946 43.983 C10.206 40.78 15.093 38.564 19.338 37.397 C21.129 36.905 22.542 36.24 24.5 36.24 C26.992 36.24 29.484 37.575 32.154 38.643 C35.002 39.8 37.672 41.313 37.138 43.805 C36.693 45.941 34.443 47.881 33.044 49.857 C31.418 52.153 29.306 55.197 25.39 55.197 L13.998 55.197 C11.506 55.197 9.511 53.975 8.302 51.993 C7.014 49.881 6.749 45.679 7.946 43.983 Z" />
      <path d="M22.275 24.225C24.488 24.225 26.28 26.017 26.28 28.23C26.28 30.443 24.488 32.235 22.275 32.235C20.062 32.235 18.27 30.443 18.27 28.23C18.27 26.017 20.062 24.225 22.275 24.225 Z" />
      <path d="M36.07 26.45C38.528 26.45 40.52 28.442 40.52 30.9C40.52 33.358 38.528 35.35 36.07 35.35C33.612 35.35 31.62 33.358 31.62 30.9C31.62 28.442 33.612 26.45 36.07 26.45 Z" />
      <circle cx="22.453" cy="27.785" r="1" fill="currentColor" stroke="none" />
      <circle cx="35.091" cy="31.345" r="1" fill="currentColor" stroke="none" />
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
