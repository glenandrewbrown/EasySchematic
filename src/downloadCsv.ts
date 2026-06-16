/** Trigger a client-side CSV download with a UTF-8 BOM (so Excel detects the encoding)
 *  and a sanitized filename. Shared by the Reports dialog and the Schedule view. */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.replace(/[^a-zA-Z0-9-_ .]/g, "");
  a.click();
  URL.revokeObjectURL(url);
}
