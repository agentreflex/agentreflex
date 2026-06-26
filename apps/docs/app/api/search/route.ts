import { source } from "@/lib/source";
import { createFromSource } from "fumadocs-core/search/server";

// Static search index for `output: export` — built at compile time, queried
// client-side (RootProvider search type: "static").
export const revalidate = false;

export const { staticGET: GET } = createFromSource(source, {
  language: "english",
});
