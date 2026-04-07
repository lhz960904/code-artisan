import { describe, it, expect } from "bun:test";
import { LocalProvider } from "./provider";

describe("LocalProvider", () => {
  it("should acquire a new sandbox", async () => {
    const provider = new LocalProvider();
    const sandbox = await provider.acquire();

    expect(sandbox.id).toBeTruthy();
    expect(provider.get(sandbox.id)).toBe(sandbox);

    await provider.shutdown();
  });

  it("should return cached sandbox when id matches", async () => {
    const provider = new LocalProvider();
    const sandbox = await provider.acquire();
    const same = await provider.acquire(sandbox.id);

    expect(same).toBe(sandbox);

    await provider.shutdown();
  });

  it("should create new sandbox when id not found", async () => {
    const provider = new LocalProvider();
    const sandbox = await provider.acquire("nonexistent-id");

    expect(sandbox.id).not.toBe("nonexistent-id");

    await provider.shutdown();
  });

  it("should release sandbox", async () => {
    const provider = new LocalProvider();
    const sandbox = await provider.acquire();
    const id = sandbox.id;

    await provider.release(id);

    expect(provider.get(id)).toBeNull();
  });

  it("should shutdown all sandboxes", async () => {
    const provider = new LocalProvider();
    const s1 = await provider.acquire();
    const s2 = await provider.acquire();

    await provider.shutdown();

    expect(provider.get(s1.id)).toBeNull();
    expect(provider.get(s2.id)).toBeNull();
  });
});
