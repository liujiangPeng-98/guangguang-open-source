import { afterEach, beforeEach, vi } from "vitest";

// Every network-dependent test must explicitly provide its own fake response.
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("Tests cannot access the network: mock fetch explicitly");
  }));
});
afterEach(() => {
  vi.unstubAllGlobals();
});
