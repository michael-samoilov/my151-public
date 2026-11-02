export function isShareAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });

  // platform: On iOS, <a download> opens a tab preview, while the share sheet's "Save Image" goes straight to Photos.
  // platform: iPadOS reports a Mac user agent, so touch support tells an iPad apart.
  const isIos =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIos && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
