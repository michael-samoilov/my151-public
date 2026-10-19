export interface ArtworkCard {
  key: string;
  panel: { width: number };
  placement: { left: number; top: number; width: number; height: number };
  avif: { file: string };
  webp: { file: string };
}
export interface ArtworkPose { viewportWidth: number; cards: ArtworkCard[] }
