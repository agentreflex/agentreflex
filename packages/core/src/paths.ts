import path from "node:path";

const segToRegExp = (seg: string): string =>
  seg
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*{2,}/g, "*") // a ** not standing alone as a segment degrades to *
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");

// Path glob → RegExp over /-separated relative paths: a standalone `**` segment
// crosses directories and matches zero or more segments (trailing: the directory
// itself and everything under it; interior: "src/" + "**" + "/index.ts" also
// matches src/index.ts), `*` matches within one segment, `?` exactly one
// character. Every regex metacharacter is escaped, so a pattern can never
// smuggle in raw regex.
export function pathGlobToRegExp(pattern: string): RegExp {
  const segs = pattern.replace(/\\/g, "/").replace(/^\.\//, "").split("/").filter(Boolean);
  let re = "";
  let omitSlash = true; // no separator before the first emitted segment
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    const last = i === segs.length - 1;
    if (seg === "**") {
      if (last) {
        re += re === "" ? ".*" : "(?:/.*)?";
      } else if (re === "") {
        re += "(?:[^/]+/)*";
        omitSlash = true;
      } else {
        re += "(?:/[^/]+)*";
        omitSlash = false;
      }
    } else {
      re += (omitSlash ? "" : "/") + segToRegExp(seg as string);
      omitSlash = false;
    }
  }
  return new RegExp(`^${re}$`);
}

/**
 * True if `filePath` (relative to `cwd`, or absolute) matches any glob, evaluated
 * against its `cwd`-relative form. Paths that resolve outside `cwd` never match —
 * `../escape.ts` can't satisfy an allow-list no matter how broad the glob — so a
 * reflex built on this can't be walked out of the project. Accepts a single glob
 * or a list, so a misconfigured scalar still behaves.
 */
export function pathMatchesGlob(filePath: string, globs: string | string[], cwd: string): boolean {
  const patterns = Array.isArray(globs) ? globs : [globs];
  const abs = path.resolve(cwd, filePath);
  const rel = path.relative(cwd, abs).replace(/\\/g, "/");
  if (rel.startsWith("../") || path.isAbsolute(rel)) return false;
  return patterns.some((p) => typeof p === "string" && pathGlobToRegExp(p).test(rel));
}
