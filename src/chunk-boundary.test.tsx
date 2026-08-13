import { render, screen } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
import "./i18n";
import { ChunkBoundary } from "./chunk-boundary";
import { CHUNK_RETRY_KEY, clearChunkRetry } from "./hooks";

// Eight tabs are code-split behind one Suspense boundary, and nothing caught
// a rejected import. Measured against the running app: the whole tree
// unmounts — empty body, zero children under #root, no top bar, no bottom
// bar, and no console error to explain it. A white page.
//
// It is reachable on every deploy. The service worker calls skipWaiting()
// and clients.claim(), so a release takes effect in tabs that are already
// open, and the built chunk names are content-hashed — so the ones an open
// tab still refers to are gone from the server. Anyone with Zenith open who
// then visits a tab they had not already loaded gets it.
const Boom = ({ message }: { message: string }) => {
  throw new Error(message);
};

const CHUNK_ERROR =
  "Failed to fetch dynamically imported module: /assets/admin-A_NWaZ90.js";

let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearChunkRetry();
  reload = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload },
  });
  // React logs the error it caught; this is about the recovery, not the noise.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  clearChunkRetry();
  vi.restoreAllMocks();
});

describe("chunk boundary", () => {
  test("reloads once when a chunk fails, because the reload is the fix", () => {
    // The new document references the new chunks. Asking the user to work
    // that out is asking them to guess.
    render(
      <ChunkBoundary>
        <Boom message={CHUNK_ERROR} />
      </ChunkBoundary>,
    );
    expect(reload).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(CHUNK_RETRY_KEY)).toBe("1");
  });

  test("does not reload a second time", () => {
    // A reload discards component state, so a counter held in memory would
    // permit an infinite loop — a worse failure than the white page. The
    // marker has to outlive the reload, which is why it is sessionStorage.
    sessionStorage.setItem(CHUNK_RETRY_KEY, "1");
    render(
      <ChunkBoundary>
        <Boom message={CHUNK_ERROR} />
      </ChunkBoundary>,
    );
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/new version/i);
  });

  test("shows something rather than nothing for any other error", () => {
    // The boundary's whole purpose is that the page is never blank. An error
    // it does not recognise still gets a message and a way out.
    render(
      <ChunkBoundary>
        <Boom message="something else entirely" />
      </ChunkBoundary>,
    );
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: /retry/i })).toBeTruthy();
  });

  test("renders its children when nothing is wrong", () => {
    render(
      <ChunkBoundary>
        <p>the app</p>
      </ChunkBoundary>,
    );
    expect(screen.getByText("the app")).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });
});
