import { initGame } from "./game";
import { webgpuSupported } from "./engine";
import "./style.css";

if (!webgpuSupported()) {
  document.getElementById("webgpu-warn")!.hidden = false;
  (document.getElementById("btn-jackin") as HTMLButtonElement).disabled = true;
}

initGame();
