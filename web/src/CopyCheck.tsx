import type { MediaItem } from "./protocol";
import { matchLocalFile } from "./localFileMatch";
import { Notice } from "./Notice";

/** Warns, without blocking, when the Viewer's copy differs from the Local File that was set. duration is the copy's, from its player. */
export function CopyCheck({ item, copy, duration }: { item: Extract<MediaItem, { source: "local" }>; copy: File; duration: number }) {
  const result = matchLocalFile(item, { name: copy.name, size: copy.size, duration });
  if (result === "same") return null;
  return <Notice tone="warn">{result}. You can keep watching anyway.</Notice>;
}
