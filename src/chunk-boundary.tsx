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
  offline: boolean;
}

/** navigator.onLine is trusted only when it says false — the api.ts rule. */
const isOffline = () =>
  typeof navigator !== "undefined" && navigator.onLine === false;

export class ChunkBoundary extends Component<Props, State> {
  state: State = { failed: false, offline: isOffline() };

  // The message has to be able to change after it is on screen: someone whose
  // wifi drops reads "you are offline", reconnects, and the retry then works.
  // Without this the copy keeps naming a cause that has gone away.
  private readonly sync = () => this.setState({ offline: isOffline() });

  componentDidMount() {
    window.addEventListener("online", this.sync);
    window.addEventListener("offline", this.sync);
  }

  componentWillUnmount() {
    window.removeEventListener("online", this.sync);
    window.removeEventListener("offline", this.sync);
  }

  static getDerivedStateFromError(error: unknown): State {
    // A reload is the fix for a chunk that is gone because the deploy moved
    // on. It is not the fix for a chunk that could not be fetched because
    // there is no network — and the two are indistinguishable from the error
    // alone, since an offline dynamic import reports exactly "Failed to fetch
    // dynamically imported module".
    //
    // Reloading offline navigates to the browser's own network error page.
    // Measured: the document is replaced, #root is gone, and anything typed
    // goes with it. Worse than the white page this boundary exists to
    // prevent, because the boundary's own error UI — which has a retry — was
    // right there.
    //
    // navigator.onLine is trusted only when it says false, the rule api.ts
    // follows: a browser can claim to be online while reaching nothing, so a
    // false positive here would be a chunk failure we decline to reload for,
    // which the retry button still covers.
    //
    // Covered end to end in e2e/behaviour.spec.ts. The commit that added this
    // guard said the browser suite could not reach the branch because
    // Playwright's setOffline leaves navigator.onLine true; that was wrong —
    // it flips it, and so does CDP's emulateNetworkConditions. The reading
    // that suggested otherwise was taken on the error page, after the
    // navigation this prevents had already happened.
    const offline = isOffline();
    if (looksLikeChunkFailure(error) && !offline) {
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
    return { failed: true, offline };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    // Reached when the reload has already happened and the import still
    // fails, or when the error was something else entirely. Deliberately
    // plain markup and no owned components: whatever just broke, this has to
    // render.
    return (
      <p className="error" role="alert">
        <span className="error-text">
          {i18n.t(
            // Offline, "a new version was released" is a cause this component
            // has already ruled out — it declined to reload precisely because
            // it knew the network was gone. Naming the wrong cause sends
            // someone looking for a fix that does not exist.
            this.state.offline ? "errors.chunkFailedOffline" : "errors.chunkFailed",
          )}
        </span>
        <button
          type="button"
          className="error-dismiss"
          onClick={() => {
            // The same reload the automatic path refuses to do while offline,
            // and for the same measured reason: it lands on the browser's own
            // error page, which replaces the document. Guarding one path and
            // not the other left the defect sitting behind a button whose
            // whole purpose is to be pressed when something is broken.
            if (isOffline()) {
              this.sync();
              return;
            }
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
