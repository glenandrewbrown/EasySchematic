import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_LIVE_CONTROL_URL,
  resolveLiveControlConfig,
  setLiveControlEnabled,
  setLiveControlToken,
} from "../liveControl/runtimeConfig";

function stubLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  return store;
}

describe("live control runtime config", () => {
  beforeEach(() => {
    stubLocalStorage();
  });

  it("is disabled with the default URL when nothing is configured", () => {
    const config = resolveLiveControlConfig();
    expect(config).toEqual({ enabled: false, token: undefined, url: DEFAULT_LIVE_CONTROL_URL });
  });

  it("enables and stores a token via the setters (no rebuild needed)", () => {
    setLiveControlEnabled(true);
    setLiveControlToken("easys-secret");

    const config = resolveLiveControlConfig();
    expect(config.enabled).toBe(true);
    expect(config.token).toBe("easys-secret");
    expect(config.url).toBe(DEFAULT_LIVE_CONTROL_URL);
  });

  it("treats an explicit localStorage 'false' as disabled, overriding build env", () => {
    setLiveControlEnabled(false);
    expect(resolveLiveControlConfig().enabled).toBe(false);
  });

  it("clears the token when set to null", () => {
    setLiveControlToken("temp");
    expect(resolveLiveControlConfig().token).toBe("temp");
    setLiveControlToken(null);
    expect(resolveLiveControlConfig().token).toBeUndefined();
  });
});
