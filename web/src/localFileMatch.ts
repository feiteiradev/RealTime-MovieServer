import type { MediaItem } from "./protocol";

type FileDetails = { name: string; size: number; duration: number };

/** Compares a Viewer's copy with the Local File that was set: "same", or a warning that never blocks. */
export function matchLocalFile(set: MediaItem, copy: FileDetails): string {
  const diffs: string[] = [];
  const delta = copy.duration - set.duration;
  if (Math.abs(delta) >= 1) {
    const secs = Math.round(Math.abs(delta));
    const amount = secs >= 60 ? `${Math.round(secs / 60)} min` : `${secs} s`;
    diffs.push(`your copy is ${amount} ${delta < 0 ? "shorter" : "longer"}`);
  }
  if (copy.size !== set.size) diffs.push("different file size");
  if (copy.name !== set.name) diffs.push("different name");
  if (diffs.length === 0) return "same";
  const text = diffs.join(", ");
  return text[0].toUpperCase() + text.slice(1);
}
