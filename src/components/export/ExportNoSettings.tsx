/**
 * The settings area of an export that has nothing to set. Pass `bare` to
 * `ExportPreviewShell` with it, so the phone sheet shrinks to fit.
 */
export function ExportNoSettings({ note }: { note: string }) {
  return (
    <p className="px-3 py-3 text-sm text-muted-foreground" data-export-no-settings>
      {note}
    </p>
  );
}
