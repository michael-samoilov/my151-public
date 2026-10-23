export interface ArtworkAsset { file: string; bytes: number; sha256: string }
export interface ArtworkCard {
  key: 'favorites' | 'dex' | 'league';
  panel: { x: number; y: number; width: number; height: number };
  capture: { x: number; y: number; width: number; height: number };
  trim: { left: number; top: number; width: number; height: number };
  placement: { left: number; top: number; width: number; height: number };
  avif: ArtworkAsset;
  webp: ArtworkAsset;
}
export interface ArtworkManifest {
  version: 1;
  status: 'PASS';
  baseCommit: string;
  inputs: Array<{ path: string; sha256: string }>;
  poses: Array<{ viewportWidth: number; dpr: number; cards: ArtworkCard[] }>;
}
export const WIDTHS: number[];
export const CARD_KEYS: string[];
export const ASSET_DIRECTORY: string;
export const ASSET_URL: string;
export const INPUT_FILES: string[];
export function hash(bytes: Uint8Array | string): string;
export function inputHashes(root: string): Array<{ path: string; sha256: string }>;
export function validateHomeArtwork(root: string, directory?: string): ArtworkManifest;
export function copyHomeArtwork(root: string, outDir: string): ArtworkManifest;

export function presentationManifest(root: string): { poses: Array<{ viewportWidth: number; cards: Array<{ key: ArtworkCard['key']; panel: { width: number }; placement: ArtworkCard['placement']; avif: { file: string }; webp: { file: string } }> }> };
