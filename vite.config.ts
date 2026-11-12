import { defineConfig } from "vite";

export default defineConfig({
  // ES module workers so the model engine can run off the main thread
  worker: { format: "es" },
  server: { port: 5179, host: true },
  build: { target: "es2022" },
});
