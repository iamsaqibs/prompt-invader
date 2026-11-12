// Runs inside a Web Worker: hosts the WebLLM engine handle so that WebGPU
// inference never blocks the UI thread. The main thread talks to it through
// the standard WebLLM worker proxy protocol.
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg: MessageEvent) => {
  handler.onmessage(msg);
};
