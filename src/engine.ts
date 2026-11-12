// Model runtime: WebLLM (MLC) on WebGPU, hosted in a module Web Worker.
// Everything is local — weights are downloaded once, then cached by the
// browser; generation happens on the machine's own GPU.
import * as webllm from "@mlc-ai/web-llm";

export type ChatMsg = { role: "system" | "user" | "assistant"; content: string };
export type LoadProgress = { progress: number; text: string };

let engine: webllm.MLCEngineInterface | null = null;
let worker: Worker | null = null;
let loadedModelId: string | null = null;

export function webgpuSupported(): boolean {
  return typeof navigator !== "undefined" && !!navigator.gpu;
}

/**
 * Model tiers mapped to whatever the installed web-llm version ships in
 * its prebuilt catalog, best-first. Keeps us version-resilient: if a model
 * id is renamed upstream we still get something usable.
 */
export function modelCandidates(): { lite: string[]; std: string[] } {
  const ids = webllm.prebuiltAppConfig.model_list.map((m) => m.model_id);
  const pick = (...res: RegExp[]) =>
    ids.filter((id) => res.some((re) => re.test(id)));
  return {
    lite: pick(/Qwen2\.5-0\.5B-Instruct.*MLC$/, /SmolLM2-360M-Instruct.*MLC$/, /gemma-2-2b.*q4f16.*MLC$/),
    std: pick(/Qwen2\.5-1\.5B-Instruct.*MLC$/, /Qwen2\.5-3B-Instruct.*MLC$/, /SmolLM2-1\.7B-Instruct.*MLC$/),
  };
}

export async function initEngine(
  tier: "lite" | "std",
  onProgress: (p: LoadProgress) => void,
): Promise<string> {
  disposeEngine();
  const cands = modelCandidates();
  const id = (tier === "lite" ? cands.lite : cands.std)[0] ?? cands.lite[0] ?? cands.std[0];
  if (!id) throw new Error("No prebuilt WebLLM model available in this version");

  worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
  engine = await webllm.CreateWebWorkerMLCEngine(worker, id, {
    initProgressCallback: (r) =>
      onProgress({ progress: r.progress ?? 0, text: r.text ?? "" }),
  });
  loadedModelId = id;

  // Warm-up pass: force shader compilation + KV cache allocation up front.
  await engine.chat.completions.create({
    messages: [{ role: "user", content: "ping" }],
    max_tokens: 4,
  });
  return id;
}

export function currentModelId(): string | null {
  return loadedModelId;
}

/** Streams one assistant completion (deltas). */
export async function* chatStream(messages: ChatMsg[]): AsyncGenerator<string> {
  if (!engine) throw new Error("Engine not initialized");
  const stream = await engine.chat.completions.create({
    messages: messages as unknown as webllm.ChatCompletionMessageParam[],
    stream: true,
    temperature: 0.85,
    max_tokens: 260,
  });
  for await (const chunk of stream) {
    const delta = chunk?.choices?.[0]?.delta?.content;
    if (delta) yield delta as string;
  }
}

export function disposeEngine(): void {
  try {
    engine?.unload?.();
  } catch {
    /* engine may be mid-operation; the worker terminate below is the hard cutoff */
  }
  worker?.terminate();
  engine = null;
  worker = null;
  loadedModelId = null;
}
