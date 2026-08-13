// Catches a failed lazy() import and recovers from it.
//
// Eight tabs are code-split behind one Suspense boundary and nothing caught
// what happens when one of those imports rejects. Measured: the whole tree
// unmounts — document.body empty, zero children under #root, no top bar, no
// bottom bar, and not even a console error to explain it. A white page.
//
// This is not a hypothetical. The service worker calls skipWaiting() and
// clients.claim(), so a deploy takes effect in tabs that are already open;
// the built chunk filenames are content-hashed, so the ones that tab is
// holding references to are gone from the server the moment the deploy
// lands. Any user with Zenith open who then visits a tab they had not
// already loaded gets the white page. It resolves on reload, which is
// exactly the thing a white page gives you no reason to try.
//
// So the first response to a chunk failure is to reload, once. The new
// document references the new chunks, which is the actual fix — asking the
// user to perform it by hand is asking them to guess. The guard is
// sessionStorage rather than state: a reload discards state by definition,
// so a counter held in memory would permit an infinite loop, which is a
// worse failure than the one being handled.
import { Component, type ReactNode } from "react";
import i18n from "./i18n";

import { CHUNK_RETRY_KEY as RETRIED } from "./hooks";

// Vite/Rollup, Chrome, Firefox and Safari all word this differently, and a
// module that 404s during import is reported as a TypeError in some of them.
// Matching loosely on purpose: the cost of a false positive is one reload,
// and the cost of a false negative is the white page this exists to stop.
function looksLikeChunkFailure(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /dynamically imported module|Importing a module script failed|Failed to fetch dynamically imported module|ChunkLoadError|error loading dynamically imported module/i.test(
    message,
  );
}

interface Props {
  children: ReactNode;
}

interface State {
  failed: boolean;
}

export class ChunkBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(error: unknown): State {
    if (looksLikeChunkFailure(error)) {
      let retried = "1";
      try {
        retried = sessionStorage.getItem(RETRIED) ?? "";
      } catch {
        // Private mode, or storage disabled. Treat it as "already retried"
        // rather than risk reloading forever.
        retried = "1";
      }
      if (!retried) {
        try {
          sessionStorage.setItem(RETRIED, "1");
        } catch {
          /* handled above */
        }
        window.location.reload();
      }
    }
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // Reached when the reload has already happened and the import still
    // fails, or when the error was something else entirely. Deliberately
    // plain markup and no owned components: whatever just broke, this has to
    // render.
    return (
      <p className="error" role="alert">
        <span className="error-text">{i18n.t("errors.chunkFailed")}</span>
        <button
          type="button"
          className="error-dismiss"
          onClick={() => {
            try {
              sessionStorage.removeItem(RETRIED);
            } catch {
              /* nothing to clear */
            }
            window.location.reload();
          }}
        >
          {i18n.t("common.retry")}
        </button>
      </p>
    );
  }
}
