import { redirect } from "next/navigation";

// The marketing site lives at agentreflex.dev; docs root redirects into /docs.
export default function HomePage() {
  redirect("/docs");
}
