// Game layer: screens, progress, the attack loop, scoring.
// All state lives in the browser (localStorage) — there is no server anywhere.
import { chatStream, currentModelId, initEngine, type ChatMsg } from "./engine";
import {
  LEVELS,
  leaksSecret,
  looksLikeRefusal,
  touchesHoneypot,
  type Level,
} from "./levels";

/* --------------------------------- state -------------------------------- */

type Tier = "lite" | "std";
interface Save {
  tier: Tier;
  unlocked: number; // max level id unlocked (starts 1)
  stars: Record<string, number>; // levelId -> 1..3
}

const SAVE_KEY = "promptinvader:v1";

function loadSave(): Save {
  const fallback: Save = { tier: "std", unlocked: 1, stars: {} };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function persist(): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    /* private mode: progress just won't survive reload */
  }
}

let save = loadSave();
let engineReady = false;
let streaming = false;
let attempt = 0;
let hintsUsed = 0;
let solutionUsed = false;
let activeLevel: Level | null = null;
let transcript: ChatMsg[] = [];

const totalStars = LEVELS.length * 3;

/* ------------------------------ dom helpers ----------------------------- */

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const inputEl = () => $("attack-input") as HTMLTextAreaElement;
const sendBtn = () => $("btn-send") as HTMLButtonElement;
const hintBtn = () => $("btn-hint") as HTMLButtonElement;
const solBtn = () => $("btn-solution") as HTMLButtonElement;

function screens(): string[] {
  return ["screen-home", "screen-select", "screen-load", "screen-game"];
}

function show(id: string): void {
  for (const s of screens()) $(s).hidden = s !== id;
  if (id === "screen-select") renderLevelSelect();
  if (id === "screen-home") refreshHome();
}

function addChipStars(): void {
  const chip = $("chip-stars");
  const sum = Object.values(save.stars).reduce((a, b) => a + b, 0);
  chip.textContent = `★ ${sum}/${totalStars}`;
  chip.hidden = false;
}

/* ------------------------------ level select ---------------------------- */

function renderLevelSelect(): void {
  const grid = $("level-grid");
  grid.innerHTML = "";
  addChipStars();

  for (const lv of LEVELS) {
    const locked = lv.id > save.unlocked;
    const stars = save.stars[String(lv.id)] ?? 0;
    const card = document.createElement("button");
    card.className = `lv-card${locked ? " lv-locked" : ""}${stars ? " lv-cleared" : ""}`;
    card.disabled = locked;
    card.innerHTML = `
      <div class="lv-id">${String(lv.id).padStart(2, "0")}</div>
      <div class="lv-name">${lv.codename}</div>
      <div class="lv-defense">${lv.defenseName}</div>
      <div class="lv-stars">${locked ? "🔒" : "★".repeat(stars) + "☆".repeat(3 - stars)}</div>`;
    if (!locked) card.addEventListener("click", () => startLevel(lv));
    grid.appendChild(card);
  }
}

/* --------------------------------- boot --------------------------------- */

async function boot(tier: Tier): Promise<void> {
  save.tier = tier;
  persist();
  show("screen-load");
  const consoleEl = $("load-console");
  consoleEl.textContent = "";
  const log = (line: string): void => {
    consoleEl.append(line + "\n");
    consoleEl.scrollTop = consoleEl.scrollHeight;
  };
  log(`> initializing webgpu runtime (${tier.toUpperCase()})`);
  log("> fetching model weights — first run only");

  const modelId = await initEngine(tier, (p) => {
    $("loadbar-fill").style.width = `${Math.round(p.progress * 100)}%`;
    log(`> ${p.text.replace(/\n+/g, " ")}`);
  });

  log(`> model loaded: ${modelId}`);
  log("> shaders compiled. warden systems online.");
  engineReady = true;
  const chip = $("chip-model");
  chip.hidden = false;
  chip.textContent = `${modelId.split("/").pop() ?? modelId} (local/GPU)`;
  if (activeLevel) renderGameScreen();
  else show("screen-select");
}

/* -------------------------------- game ---------------------------------- */

function startLevel(lv: Level): void {
  activeLevel = lv;
  attempt = 0;
  hintsUsed = 0;
  solutionUsed = false;
  transcript = [];
  if (!engineReady) {
    show("screen-load");
    void boot(save.tier); // returns here when done
    return;
  }
  renderGameScreen();
}

function renderGameScreen(): void {
  const lv = activeLevel!;
  show("screen-game");
  $("lv-codename").textContent = `${String(lv.id).padStart(2, "0")} · ${lv.codename}`;
  $("lv-goal").textContent = lv.goal;
  $("lv-prompt").textContent = lv.systemPrompt;
  $("chat-trans").innerHTML = "";
  $("hints-box").hidden = true;
  $("hints-box").innerHTML = "";
  inputEl().value = "";
  hintBtn().disabled = false;
  solBtn().disabled = true;
  updateAttempts();
  sysMsg(
    `target acquired — defense: ${lv.defenseName.toLowerCase()}. ${lv.attempts} attempts.`,
  );
}

function updateAttempts(): void {
  const left = Math.max(0, activeLevel!.attempts - attempt);
  $("attempts-left").textContent = `⏳ attempts left: ${left}`;
  $("attempts-left").classList.toggle("chip-danger", left <= 3);
}

function chatNode(role: "you" | "model" | "sys"): HTMLDivElement {
  const div = document.createElement("div");
  div.className = `chat-row chat-${role}`;
  const who = document.createElement("span");
  who.className = "chat-who";
  who.textContent = role === "you" ? "YOU >" : role === "model" ? "ORBITAL >" : "SYS >";
  const body = document.createElement("span");
  body.className = "chat-body";
  div.append(who, body);
  const trans = $("chat-trans");
  trans.appendChild(div);
  trans.scrollTop = trans.scrollHeight;
  return div;
}

function sysMsg(text: string): void {
  chatNode("sys").querySelector(".chat-body")!.textContent = text;
}

/* ------------------------------ attack loop ----------------------------- */

async function sendAttack(): Promise<void> {
  const lv = activeLevel!;
  const input = inputEl();
  const text = input.value.trim();
  if (!text || streaming) return;

  attempt += 1;
  updateAttempts();
  input.value = "";

  const youNode = chatNode("you");
  youNode.querySelector(".chat-body")!.textContent = text;
  transcript.push({ role: "user", content: text });

  const modelNode = chatNode("model");
  const body = modelNode.querySelector(".chat-body")!;
  const messages: ChatMsg[] = [
    { role: "system", content: lv.systemPrompt },
    ...transcript,
  ];

  streaming = true;
  sendBtn().disabled = true;
  let reply = "";

  try {
    for await (const delta of chatStream(messages)) {
      reply += delta;
      body.textContent = reply;
      body.parentElement!.parentElement!.scrollTop = 1e9;
      if (leaksSecret(reply, lv)) break; // leak detected mid-stream — stop paying for tokens
    }
  } catch (err) {
    body.textContent += `\n[engine error: ${String(err)}]`;
  } finally {
    streaming = false;
    sendBtn().disabled = false;
  }

  transcript.push({ role: "assistant", content: reply });

  // honeypot: touching a bait burns 2 more attempts
  if (touchesHoneypot(reply, lv)) {
    attempt += 2;
    updateAttempts();
    sysMsg("🚨 honeypot tripped — bait phrase detected, monitor flagged -2 attempts");
  } else if (looksLikeRefusal(reply) && !leaksSecret(reply, lv)) {
    sysMsg("🛡 defense held (refusal detected)");
  }

  if (leaksSecret(reply, lv)) {
    void win(lv);
    return;
  }

  solBtn().disabled = attempt < 4; // enabled after 4 failed attempts
  if (attempt >= lv.attempts) void lose(lv);
}

/* --------------------------- hint / solution ---------------------------- */

function showHint(): void {
  const lv = activeLevel!;
  if (hintsUsed >= lv.hints.length) return;
  const box = $("hints-box");
  box.hidden = false;
  const line = document.createElement("div");
  line.textContent = `💡 ${lv.hints[hintsUsed]}`;
  box.append(line);
  hintsUsed += 1;
  if (hintsUsed >= 2) hintBtn().disabled = true;
}

function showSolution(): void {
  const lv = activeLevel!;
  solutionUsed = true;
  const box = $("hints-box");
  box.hidden = false;
  const line = document.createElement("div");
  line.className = "solution-line";
  line.textContent = `🔓 sample winning attack:\n${lv.solution}`;
  box.append(line);
  solBtn().disabled = true;
  sysMsg("solution revealed — this node will award at most ★");
}

/* --------------------------- win / lose modal --------------------------- */

function starsFor(lv: Level): number {
  if (solutionUsed) return 1;
  if (hintsUsed >= 2) return 1;
  if (hintsUsed === 1) return attempt <= 4 ? 2 : 1;
  return attempt <= 4 ? 3 : 2;
}

function openModal(title: string, body: Array<string | Node>, actions: Array<HTMLButtonElement>): void {
  $("modal-title").textContent = title;
  const b = $("modal-body");
  b.innerHTML = "";
  for (const part of body) if (typeof part === "string") b.append(part + "\n");
  else b.append(part);
  const a = $("modal-actions");
  a.innerHTML = "";
  for (const btn of actions) a.append(btn);
  $("modal").hidden = false;
}

function closeModal(): void {
  $("modal").hidden = true;
}

function win(lv: Level): void {
  const stars = starsFor(lv);
  const prev = save.stars[String(lv.id)] ?? 0;
  if (stars > prev) save.stars[String(lv.id)] = stars;
  if (lv.id >= save.unlocked) save.unlocked = Math.min(LEVELS.length, lv.id + 1);
  persist();
  addChipStars();

  const statline = document.createElement("div");
  statline.className = "modal-stat";
  statline.innerHTML =
    `★<b>${"★".repeat(stars)}${"☆".repeat(3 - stars)}</b> &nbsp;·&nbsp; attempts: ${attempt} &nbsp;·&nbsp; ` +
    `hints: ${hintsUsed} &nbsp;·&nbsp; model: ${currentModelId() ?? "?"}`;

  const lesson = document.createElement("div");
  lesson.className = "modal-lesson";
  lesson.innerHTML = `<div class="lesson-h">📖 WHAT JUST HAPPENED</div><p>${lv.educates}</p>` +
    `<div class="lesson-h">🛡 BUILDING IT FOR REAL</div><p>${lv.mitigation}</p>`;

  const nextId = Math.min(LEVELS.length, lv.id + 1);
  const actions: HTMLButtonElement[] = [];
  if (lv.id < LEVELS.length) {
    const next = mkBtn("▶ next node", "btn btn-primary", () => {
      closeModal();
      startLevel(LEVELS[nextId - 1]);
    });
    actions.push(next);
  } else {
    const finale = mkBtn("🏁 campaign complete — back to nodes", "btn btn-primary", () => {
      closeModal();
      show("screen-select");
    });
    actions.push(finale);
  }
  actions.push(mkBtn("node list", "btn", () => { closeModal(); show("screen-select"); }));

  openModal(`✔ NODE CRACKED — ${lv.codename}`, [statline, lesson], actions);
}

function lose(lv: Level): void {
  const body = document.createElement("div");
  body.innerHTML =
    `<p>Attempts exhausted. The ${lv.defenseName.toLowerCase()} held this time.</p>` +
    `<div class="lesson-h">🔓 SAMPLE WINNING ATTACK</div><pre class="modal-pre">${lv.solution}</pre>` +
    `<p class="dim">Study it, then come back — the model plays the same defense every time.</p>`;
  const retry = mkBtn("↺ retry node", "btn btn-primary", () => {
    closeModal();
    startLevel(lv);
  });
  const back = mkBtn("node list", "btn", () => { closeModal(); show("screen-select"); });
  openModal("✖ SESSION BURNED", [body], [retry, back]);
}

function mkBtn(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.className = cls;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

/* --------------------------------- home --------------------------------- */

function refreshHome(): void {
  const cleared = Object.keys(save.stars).length > 0;
  $("btn-continue").hidden = !cleared;
}

/* --------------------------------- wire --------------------------------- */

export function initGame(): void {
  // home
  $("btn-jackin").addEventListener("click", () => {
    const tier = (document.querySelector('input[name="model-pick"]:checked') as HTMLInputElement)
      .value as Tier;
    void boot(tier);
  });
  $("btn-continue").addEventListener("click", () => {
    if (!engineReady) {
      const tier = (document.querySelector('input[name="model-pick"]:checked') as HTMLInputElement)
        .value as Tier;
      void boot(tier);
    } else show("screen-select");
  });
  $("btn-back-home").addEventListener("click", () => show("screen-home"));

  // game
  $("btn-send").addEventListener("click", () => void sendAttack());
  $("attack-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendAttack();
    }
  });
  $("btn-hint").addEventListener("click", showHint);
  $("btn-solution").addEventListener("click", showSolution);
  $("btn-reset-hint").addEventListener("click", () => activeLevel && startLevel(activeLevel));
  $("btn-to-select").addEventListener("click", () => show("screen-select"));

  addChipStars();
  refreshHome();
}
