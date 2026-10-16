export function isShareAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });

  // Only iPhone and iPad open the share sheet. Its one-tap "Save Image" goes
  // straight to Photos, where <a download> would open a browser-tab preview.
  // Everywhere else the file downloads. Desktop Chrome, Edge, and Safari also
  // support sharing files, but their share menu offers apps instead of a save,
  // so a desktop export belongs in the Downloads folder. Android's share sheet
  // has no obvious "Save to device" either, and its Downloads folder is one
  // the gallery scans. iPadOS reports a Mac user agent, so touch tells it apart.
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
