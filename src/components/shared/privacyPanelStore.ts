import { loadChunk } from '@/lib/staleDeploy';

export interface PrivacyPanelState { anchor: HTMLElement | null }

let state: PrivacyPanelState | null = null;
let linkHandled = false;
let hostLoading = false;
const listeners = new Set<() => void>();

export function subscribePrivacyPanel(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function privacyPanelState(): PrivacyPanelState | null {
  return state;
}

function emit(): void {
  for (const listener of listeners) listener();
}

export function openPrivacyPanel(anchor: HTMLElement | null): void {
  if (state) return;
  state = { anchor };
  emit();
  if (hostLoading) return;
  hostLoading = true;
  void loadChunk(() => import('./privacyHostMount')).then((module) => module.mountPrivacyHost());
}

export function closePrivacyPanel(): void {
  if (!state) return;
  state = null;
  emit();
}

export function openPrivacyPanelFromLink(search: string = window.location.search): void {
  if (linkHandled) return;
  linkHandled = true;
  if (new URLSearchParams(search).has('privacy')) openPrivacyPanel(null);
}
