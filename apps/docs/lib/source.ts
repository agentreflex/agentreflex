import { docs } from "@/.source/server";
import { loader } from "fumadocs-core/source";

// https://fumadocs.dev/docs/headless/source-api
export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});
