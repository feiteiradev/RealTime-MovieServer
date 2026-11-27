import { useEffect, useState } from "react";
import type { MediaItem } from "./protocol";
import { readDuration } from "./player/localFilePlayer";
import { matchLocalFile } from "./localFileMatch";
import { Notice } from "./Notice";

/** Warns, without blocking, when the Viewer's copy differs from the Local File that was set. */
export function CopyCheck({ item, copy }: { item: Extract<MediaItem, { source: "local" }>; copy: File }) {
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setWarning(null);
    readDuration(copy).then(
      (duration) => {
        const result = matchLocalFile(item, { name: copy.name, size: copy.size, duration });
        if (!cancelled) setWarning(result === "same" ? null : result);
      },
      () => {}, // undecodable: the player already says "try an MP4 copy"
    );
    return () => {
      cancelled = true;
    };
  }, [item, copy]);

  if (!warning) return null;
  return <Notice tone="warn">{warning}. You can keep watching anyway.</Notice>;
}
