# 👾 PromptInvader

**A prompt-injection CTF where the target is a real LLM running inside your browser.**

No server. No API key. No telemetry. Model weights download once from the [`mlc-ai` Hugging Face org](https://huggingface.co/mlc-ai) and are cached by your browser. Every inference runs on **your own GPU via WebGPU**, and your prompts never leave the machine.

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
npm run build        # type-check + production bundle in dist/
npm run preview      # serve the production build locally
```

Requires Node 18+ and a WebGPU browser: Chrome/Edge 113+, Safari 26+, or Firefox 141+ (Windows). First run downloads the model; after that it's cached and the game works offline.

| Tier | Model | GPU memory |
|---|---|---|
| LITE | Qwen2.5-0.5B-Instruct (q4f16) | ~1 GB |
| STANDARD | Qwen2.5-1.5B-Instruct (q4f16) | ~1.6 GB |

If a model is missing from the installed WebLLM version's catalog, each tier falls back automatically: LITE → SmolLM2-360M → Gemma-2-2B, STANDARD → Qwen2.5-3B → SmolLM2-1.7B. The loaded model is shown in the header chip.

## Architecture

| Piece | Choice | Why |
|---|---|---|
| Runtime | [WebLLM (MLC)](https://github.com/mlc-ai/web-llm) on WebGPU | mature, prebuilt model catalog, streams tokens in a module Worker |
| Models | Qwen2.5 0.5B (LITE) / 1.5B (STANDARD), q4f16 quantized, with fallbacks | 1.5B is the sweet spot: follows system prompts well enough to *defend*, weak enough to *lose* believably |
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

Nodes unlock in order; cracking one opens the next.

| Stars | How |
|---|---|
| ★★★ | no hints, cracked within 4 attempts |
| ★★ | no hints in more than 4 attempts, **or** 1 hint within 4 attempts |
| ★ | anything else: 2 hints, 1 hint past 4 attempts, or the solution revealed |

The sample solution unlocks after 4 attempts and caps the node at ★. Honeypot levels add 2 to your attempt count whenever the model emits a bait phrase. Your best score per node is kept.

> **Ethics note:** levels are sandboxed fiction. The techniques taught (encoding tricks, delimiter confusion, format pressure) are exactly those in public OWASP/LLM01 literature and CTF culture; the goal is building defenders, not breaking systems. Don't use these ideas anywhere you lack authorization.

## Roadmap

- [ ] PWA manifest + service worker → fully offline CTF
- [ ] Multi-turn mode for levels 5+ (needs a per-level flag in the schema)
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
  honeypots: ["bait[-\\s_]?regex"], // optional: emitting one costs 2 extra attempts
}
```

Validator and honeypot patterns are case-insensitive regexes tested against the model's reply. `mode: "all"` requires every pattern to match (useful for multi-part secrets).

Rules: secrets stay fictional; validators match semantics, not exact strings; every level must end in a lesson. Run `npm run build` before opening a PR. It type-checks the level against the `Level` interface.

## License

[MIT](LICENSE)
