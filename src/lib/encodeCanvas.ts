const ENCODE_HOLD_LIMIT_MS = 15000;

let encodesInProgress = 0;

export function canvasEncodeInProgress(): boolean {
  return encodesInProgress > 0;
}

export function encodeCanvasPng(
  canvas: HTMLCanvasElement,
  { failure, timeoutMs }: { failure: string; timeoutMs?: number },
): Promise<Blob> {
  encodesInProgress += 1;
  let held = true;
  const release = () => {
    if (!held) return;
    held = false;
    encodesInProgress -= 1;
    window.clearTimeout(holdLimit);
  };
  const holdLimit = window.setTimeout(release, ENCODE_HOLD_LIMIT_MS);
  return new Promise<Blob>((resolve, reject) => {
    // platform: iOS occasionally never calls the `toBlob` callback, so a timeout keeps the export spinner from hanging.
    const timer = timeoutMs === undefined ? undefined : window.setTimeout(() => {
      release();
      reject(new Error('Canvas toBlob timed out'));
    }, timeoutMs);
    try {
      canvas.toBlob((blob) => {
        window.clearTimeout(timer);
        release();
        if (blob) resolve(blob);
        else reject(new Error(failure));
      }, 'image/png');
    } catch (error) {
      window.clearTimeout(timer);
      release();
      throw error;
    }
  });
}
