/** True when the user cancelled the share sheet. Not a failed export. */
export function isShareAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** Share via native share sheet (mobile gallery save) or fall back to file download. */
export async function shareOrDownload(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });

  // Skip the share sheet on Android: its system share sheet is an app picker
  // with no obvious "Save to device" action, leaving users stuck (they end up
  // emailing the file to themselves to download it). Going straight to the
  // download path drops the file into /Downloads, which most Android galleries
  // auto-scan. iOS keeps the share path because its share sheet has a one-tap
  // "Save Image" that goes straight to Photos — strictly better than a
  // browser-tab preview, which is what <a download> falls back to on iOS.
  const isAndroid = /Android/i.test(navigator.userAgent);

  if (!isAndroid && navigator.canShare?.({ files: [file] })) {
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
