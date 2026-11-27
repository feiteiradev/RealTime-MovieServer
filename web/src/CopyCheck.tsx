import { useEffect, useState } from "react";
import type { MediaItem } from "./protocol";
import { readDuration } from "./player/localFilePlayer";
import { matchLocalFile } from "./localFileMatch";

/** Warns, without blocking, when the Viewer's copy differs from the Local File that was set. */
export function CopyCheck({ item, copy }: { item: MediaItem; copy: File }) {
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
  return (
    <p role="status" className="text-amber-700">
      {warning}. You can keep watching anyway.
    </p>
  );
}
