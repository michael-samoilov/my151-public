import { useState, type ComponentProps } from 'react';

export type { ArtworkPose } from './artwork-types';

export interface PictureResources {
  src: string;
  sources: { srcSet: string; media?: string; type?: string }[];
}
export interface ArtworkController {
  snapshot(id: string): PictureResources | undefined;
  refresh(): void;
}
declare global { interface Window { p151HomeArtwork?: ArtworkController } }

import { mobileArtwork, MOBILE_MEDIA, EMPTY_IMAGE, artworkUrl, poseMedia } from './artwork-data';

// The controller owns resource attributes after parsing. Read its committed
// snapshot once so hydration and later locale updates retain those resources.
function Picture({ id, resources, ...props }: {
  id: string; resources: PictureResources;
} & Omit<ComponentProps<'img'>, 'src' | 'srcSet'>) {
  const [initial] = useState(() => typeof window === 'undefined'
    ? resources : window.p151HomeArtwork?.snapshot(id) ?? resources);
  return <picture className="contents" data-home-picture={id}>
    {initial.sources.map((source, index) => <source key={index} {...source} />)}
    <img {...props} src={initial.src} />
  </picture>;
}

export function HomeScreenshot({ id, image, ...props }: {
  id: string; image: { src: string; avif: string; width: number; height: number; fetchPriority?: 'high' };
} & Omit<ComponentProps<'img'>, 'src' | 'fetchPriority'>) {
  const { src, avif, ...dimensions } = image;
  const sources = [
    ...(mobileArtwork.length ? [{ media: MOBILE_MEDIA, srcSet: EMPTY_IMAGE }] : []),
    { type: 'image/avif', srcSet: avif },
  ];
  return <Picture id={id} resources={{ src, sources }} {...dimensions} {...props} />;
}

export function MobileArtwork({ toolKey, alt }: { toolKey: string; alt: string }) {
  if (!mobileArtwork.length) return null;
  const sources = mobileArtwork.flatMap((pose, index) => {
    const card = pose.cards.find(card => card.key === toolKey)!;
    return ['avif', 'webp'].map(format => ({
      type: `image/${format}`, media: poseMedia(index),
      srcSet: artworkUrl(card[format as 'avif' | 'webp'].file),
    }));
  });
  return <>{[0, 1].map(slot => <Picture key={slot} id={`${toolKey}-mobile-${slot}`}
    resources={{ src: EMPTY_IMAGE, sources: slot === 0 ? sources : [] }}
    alt={alt} data-baked-resource={toolKey} data-card-scene={toolKey} data-scene-slot={slot}
    draggable={false} decoding="sync" fetchPriority="high"
  />)}</>;
}
