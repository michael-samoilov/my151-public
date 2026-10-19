import type { ArtworkPose } from './artwork-types';

declare const __HOME_ARTWORK_CAPTURE__: boolean;
declare const __HOME_MOBILE_ARTWORK__: ArtworkPose[];

export const MOBILE_MEDIA = '(max-width:480px) and (hover:none) and (pointer:coarse) and (any-hover:none)';
export const EMPTY_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
export const mobileArtwork = __HOME_ARTWORK_CAPTURE__ ? [] : __HOME_MOBILE_ARTWORK__;
export const artworkUrl = (file: string) => `/assets/home-mobile/${file}`;
export const poseMedia = (index: number) => {
  const poses = mobileArtwork;
  const lo = index ? (poses[index - 1].viewportWidth + poses[index].viewportWidth) / 2 : 0;
  const hi = index === poses.length - 1 ? 480 : (poses[index].viewportWidth + poses[index + 1].viewportWidth) / 2;
  return `${MOBILE_MEDIA} and (min-width:${lo + (index ? 0.001 : 0)}px) and (max-width:${hi}px)`;
};

