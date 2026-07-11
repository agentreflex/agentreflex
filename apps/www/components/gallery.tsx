"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";

type Kind = "proactive" | "protective";
type Reflex = { name: string; instinct: string; trigger: string; kind: Kind; by: string };

const REFLEXES: Reflex[] = [
  {
    name: "no-force-push",
    instinct: "flinch at a force-push to shared branches",
    trigger: "on Bash · git push --force",
    kind: "protective",
    by: "core",
  },
  {
    name: "no-secrets",
    instinct: "never read or write .env or secret files",
    trigger: "on Read/Write · *.env*",
    kind: "protective",
    by: "core",
  },
  {
    name: "no-rm-rf",
    instinct: "refuse a recursive delete of a dangerous path",
    trigger: "on Bash · rm -rf /*",
    kind: "protective",
    by: "core",
  },
  {
    name: "no-curl-bash",
    instinct: "never pipe a remote script into a shell",
    trigger: "on Bash · curl … | sh",
    kind: "protective",
    by: "core",
  },
  {
    name: "stay-in-repo",
    instinct: "don't edit files outside the project",
    trigger: "on Write · ../**",
    kind: "protective",
    by: "core",
  },
  {
    name: "ask-on-prod",
    instinct: "pause before anything touches production",
    trigger: "on Bash · *deploy*",
    kind: "protective",
    by: "core",
  },
  {
    name: "abide",
    instinct: "your human↔agent working agreement, enforced",
    trigger: "on Bash · Edit",
    kind: "protective",
    by: "core",
  },
  {
    name: "scope-check",
    instinct: "gate write-tool calls to declared path patterns",
    trigger: "on Write · Edit · MultiEdit",
    kind: "protective",
    by: "core",
  },
  {
    name: "recover",
    instinct: "snapshot a file before the agent edits it",
    trigger: "on Edit · Write",
    kind: "proactive",
    by: "core",
  },
  {
    name: "prefer-rg",
    instinct: "reach for ripgrep over recursive grep",
    trigger: "on Bash · grep -r",
    kind: "proactive",
    by: "core",
  },
  {
    name: "conventional-commits",
    instinct: "shape commit messages to the convention",
    trigger: "on Bash · git commit -m",
    kind: "proactive",
    by: "core",
  },
];

const KIND_COLOR: Record<Kind, string> = {
  proactive: "var(--color-signal)",
  protective: "var(--color-amber)",
};

function Card({
  reflex,
  copied,
  onAdd,
}: {
  reflex: Reflex;
  copied: boolean;
  onAdd: (name: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onAdd(reflex.name)}
      className="group flex flex-col gap-2.5 bg-[var(--color-background)] p-5 text-left transition-colors hover:bg-[var(--color-surface)]"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[var(--color-foreground)]">{reflex.name}</span>
        <span className="ar-label" style={{ color: KIND_COLOR[reflex.kind] }}>
          {reflex.kind}
        </span>
      </div>
      <span className="text-xs leading-relaxed text-[var(--color-muted)]">{reflex.instinct}</span>
      <span className="mt-1 font-mono text-[11px] text-[var(--color-faint)]">{reflex.trigger}</span>
      <div className="mt-2 flex items-center justify-between">
        <span className="ar-label text-[var(--color-faint)]">by {reflex.by}</span>
        <span className="ar-label text-[var(--color-faint)] transition-colors group-hover:text-[var(--color-signal)]">
          {copied ? "copied ✓" : "add ›"}
        </span>
      </div>
    </button>
  );
}

export function Commons() {
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [copied, setCopied] = useState<string | null>(null);
  const shown = REFLEXES.filter((r) => filter === "all" || r.kind === filter);

  async function add(name: string) {
    try {
      await navigator.clipboard.writeText(`npx agentreflex add ${name}`);
    } catch {
      /* clipboard may be unavailable */
    }
    setCopied(name);
    setTimeout(() => setCopied((c) => (c === name ? null : c)), 1400);
  }

  return (
    <section id="commons" className="mx-auto max-w-6xl px-6 py-24">
      <div className="ar-label flex items-center justify-between">
        <span>
          <span style={{ color: "var(--color-signal)" }}>02</span> &nbsp;the commons
        </span>
        <span>{shown.length} reflexes · open</span>
      </div>
      <h2 className="mt-5 max-w-3xl text-balance text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
        An open commons of reflexes.
      </h2>
      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">
        Yours to copy, remix, and give back — proactive or protective, every one a file you own.
      </p>

      <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | Kind)}>
          <TabsList className="gap-2">
            <TabsTrigger value="all">all</TabsTrigger>
            <TabsTrigger value="proactive">proactive</TabsTrigger>
            <TabsTrigger value="protective">protective</TabsTrigger>
          </TabsList>
        </Tabs>
        <a
          href="https://docs.agentreflex.dev/writing-a-reflex"
          className="ar-label text-[var(--color-foreground)] hover:text-[var(--color-signal)]"
        >
          contribute yours ›
        </a>
      </div>

      <div className="mt-6 grid gap-px overflow-hidden rounded border border-[var(--color-border)] bg-[var(--color-border)] text-sm sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((r) => (
          <Card key={r.name} reflex={r} copied={copied === r.name} onAdd={add} />
        ))}
        <a
          href="https://docs.agentreflex.dev/writing-a-reflex"
          className="group flex flex-col justify-center gap-2.5 bg-[var(--color-surface)] p-5 transition-colors hover:bg-[var(--color-surface-2)]"
        >
          <span className="text-[var(--color-foreground)] transition-colors group-hover:text-[var(--color-signal)]">
            + bring your own
          </span>
          <span className="text-xs leading-relaxed text-[var(--color-muted)]">
            a reflex is a file you own — ts, python, or bash. share it by URL or PR it here.
          </span>
          <span className="mt-1 font-mono text-[11px] text-[var(--color-faint)]">
            defineReflex(…)
          </span>
        </a>
      </div>
    </section>
  );
}
