# 👾 PromptInvader

**A prompt-injection CTF where the target is a real LLM running inside your browser.**

No server. No API key. No telemetry. Weights download once from the WebLLM CDN cache, and every inference runs on **your own GPU via WebGPU**.

```
10 levels · open-book defenses · zero backend · MIT
```

## Why

Prompt injection (OWASP GenAI Top-10: **LLM01**) is the most common failure mode of LLM-powered systems, yet it's usually taught with static slides. PromptInvader makes you the attacker: every level exposes its entire system prompt — the defense — and your only way to win is to make the *model itself* leak the secret. When you crack a node, the game explains the failure class and how to build the real-world countermeasure.

Playing it makes you better at defending it. That's the point.

## Run

```bash
npm install
npm run dev          # → http://localhost:5179
```

Requires a WebGPU browser: Chrome/Edge 113+, Safari 18+, or current Firefox with WebGPU. First run downloads the model (~350 MB for LITE, ~1 GB for STANDARD); after that it's cached and works offline.

## Architecture

| Piece | Choice | Why |
|---|---|---|
| Runtime | [WebLLM (MLC)](https://github.com/mlc-ai/web-llm) on WebGPU | mature, prebuilt model catalog, streams tokens in a module Worker |
| Models | Qwen2.5 0.5B (LITE) / 1.5B (STANDARD), q4f16 quantized | 1.5B is the sweet spot: follows system prompts well enough to *defend*, weak enough to *lose* believably |
| UI | Vite + TypeScript, zero framework | the game is a state machine, not an app; keeps the attack surface (and bundle) tiny |
| Levels | pure data (`src/levels.ts`) | level = system prompt + regex validator + hints + lesson; contributions are one object |
| State | `localStorage` only | progress is yours, portable via export (roadmap) |
| Secrets | visible in the prompt on purpose | the win condition is the *model's* output, not knowledge of the secret |

```
src/
  worker.ts    hosts the WebLLM engine handle (off main thread)
  engine.ts    model tiers, init + streaming chat
  levels.ts    the 10 nodes: prompts, validators, honeypots, lessons
  game.ts      screens, attack loop, scoring, win/lose modals
  main.ts      bootstrap (WebGPU capability check first)
```

## The campaign

Each node isolates one defense pattern, in rough order of real-world prevalence:

| # | Codename | Defense challenged |
|---|---|---|
| 01 | OPEN DOOR | none — baseline leak |
| 02 | COLD SHOULDER | refusal scripts |
| 03 | SPLIT SECOND | fragmentation rules (form bans) |
| 04 | DATA DUMP | "untrusted content" notices |
| 05 | FENCED YARD | delimiter fencing |
| 06 | NEEDLE FIELD | decoys + burial |
| 07 | DRAMA MASK | persona locks |
| 08 | TOOL TAP | "tool output is data" (indirect injection — you forge the tool output) |
| 09 | GHOST LURES | honeypots (bait triggers −2 attempts) |
| 10 | THE WARDEN | all of it, stacked |

Scoring: ★★★ = no hints, ≤4 attempts · ★★ = no hints · ★ = finished. Solutions unlock after 4 failed attempts but cap at ★.

> **Ethics note:** levels are sandboxed fiction. The techniques taught (encoding tricks, delimiter confusion, format pressure) are exactly those in public OWASP/LLM01 literature and CTF culture; the goal is building defenders, not breaking systems. Don't use these ideas anywhere you lack authorization.

## Roadmap

- [ ] PWA manifest + service worker → fully offline CTF
- [ ] Multi-turn mode for levels 5+ (flag already in level schema)
- [ ] Shareable "cracked node" badge cards (SVG, generated client-side)
- [ ] Level editor → share levels as JSON links
- [ ] Optional llama.cpp/WebGPU (`wllama`) runtime toggle for comparison runs
- [ ] Export/import progress file
- [ ] Deploy: GitHub Pages + Actions, so the demo link ships with the repo

## Contributing a level

Add one object to `src/levels.ts`:

```ts
{
  id: 11, codename: "NAME", defenseName: "pattern challenged",
  goal: "extract WHAT",
  systemPrompt: "the full defense, including secret and any honeypots",
  validators: { mode: "any", patterns: ["secret[-\\s_]?regex"] },
  hints: ["nudge 1", "nudge 2"],
  solution: "a working attack",
  educates: "what failure class this is (cite OWASP when it applies)",
  mitigation: "how engineers should actually defend this",
  attempts: 12,
}
```

Rules: secrets stay fictional; validators match semantics, not exact strings; every level must end in a lesson.

## License

MIT
