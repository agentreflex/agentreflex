import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import recover from "../src/index.js";

describe("recover reflex", () => {
  it("snapshots a file before an edit and never blocks", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "ar-home-"));
    const proj = fs.mkdtempSync(path.join(os.tmpdir(), "ar-proj-"));
    // os.homedir() reads $HOME on POSIX and %USERPROFILE% on Windows — set both.
    const prevHome = process.env.HOME;
    const prevProfile = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    try {
      const file = path.join(proj, "a.txt");
      fs.writeFileSync(file, "v1");

      const decision = recover.onToolCall?.({
        event: "onToolCall",
        agent: "claude",
        tool: "Edit",
        paths: [file],
        cwd: proj,
        raw: {},
      });

      expect(decision).toEqual({ action: "pass" });

      const store = path.join(home, ".agentreflex", "recover");
      const snapshots = fs.existsSync(store)
        ? fs.readdirSync(store).flatMap((d) => fs.readdirSync(path.join(store, d)))
        : [];
      expect(snapshots.some((s) => s.endsWith("a.txt"))).toBe(true);
    } finally {
      // biome-ignore lint/performance/noDelete: unsetting an env var needs delete
      if (prevHome === undefined) delete process.env.HOME;
      else process.env.HOME = prevHome;
      // biome-ignore lint/performance/noDelete: unsetting an env var needs delete
      if (prevProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = prevProfile;
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(proj, { recursive: true, force: true });
    }
  });
});
