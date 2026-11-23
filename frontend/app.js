/*
 * Frontend DrowsyDetect.
 * Contrato esperado del backend (futuro):
 *   POST {API_URL}/predict   (multipart/form-data, campo "file")
 *   -> { "label": "drowsy" | "non_drowsy", "confidence": 0.0 - 1.0 }
 * Si el backend no responde, se usa un resultado simulado (modo demo).
 */
const API_URL = "http://localhost:8000";

const $ = (id) => document.getElementById(id);
const els = {
  file: $("fileInput"), drop: $("dropzone"), video: $("video"), camPh: $("camPlaceholder"),
  startCam: $("startCam"), snap: $("snap"), preview: $("preview"), prevPh: $("prevPlaceholder"),
  scan: $("scan"), analyze: $("analyze"), reset: $("reset"), canvas: $("canvas"),
  result: $("result"), badge: $("badge"), title: $("resTitle"), desc: $("resDesc"),
  fill: $("barFill"), conf: $("resConf"), status: $("apiStatus"),
};
let currentBlob = null;
let stream = null;

// ---- Pestañas
document.querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => {
  document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("active", x === t));
  document.querySelectorAll(".tab-content").forEach((c) => c.classList.toggle("active", c.id === "tab-" + t.dataset.tab));
  if (t.dataset.tab !== "camera") stopCam();
}));

// ---- Imagen
function setImage(blob) {
  currentBlob = blob;
  els.preview.src = URL.createObjectURL(blob);
  els.preview.hidden = false;
  els.prevPh.hidden = true;
  els.analyze.disabled = false;
  els.reset.disabled = false;
  els.result.hidden = true;
}
function clearAll() {
  currentBlob = null;
  els.preview.hidden = true; els.prevPh.hidden = false;
  els.analyze.disabled = true; els.reset.disabled = true;
  els.result.hidden = true; els.file.value = "";
}

els.file.addEventListener("change", (e) => e.target.files[0] && setImage(e.target.files[0]));
["dragover", "dragenter"].forEach((ev) => els.drop.addEventListener(ev, (e) => { e.preventDefault(); els.drop.classList.add("drag"); }));
["dragleave", "drop"].forEach((ev) => els.drop.addEventListener(ev, (e) => { e.preventDefault(); els.drop.classList.remove("drag"); }));
els.drop.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files[0];
  if (f && f.type.startsWith("image/")) setImage(f);
});
els.reset.addEventListener("click", clearAll);

// ---- Cámara
function stopCam() {
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null; els.video.srcObject = null;
  els.camPh.hidden = false; els.snap.disabled = true;
  els.startCam.textContent = "Encender cámara";
}
els.startCam.addEventListener("click", async () => {
  if (stream) return stopCam();
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    els.video.srcObject = stream;
    els.camPh.hidden = true; els.snap.disabled = false;
    els.startCam.textContent = "Apagar cámara";
  } catch {
    els.camPh.textContent = "No se pudo acceder a la cámara (revisa los permisos)";
  }
});
els.snap.addEventListener("click", () => {
  const v = els.video, c = els.canvas;
  c.width = v.videoWidth; c.height = v.videoHeight;
  const ctx = c.getContext("2d");
  ctx.translate(c.width, 0); ctx.scale(-1, 1); // coincide con el espejo de la vista
  ctx.drawImage(v, 0, 0);
  c.toBlob((b) => setImage(b), "image/jpeg", 0.92);
});

// ---- Predicción
async function predict(blob) {
  try {
    const fd = new FormData();
    fd.append("file", blob, "imagen.jpg");
    const r = await fetch(`${API_URL}/predict`, { method: "POST", body: fd, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(r.status);
    setStatus(true);
    return await r.json();
  } catch {
    setStatus(false);
    await new Promise((r) => setTimeout(r, 1500)); // simula latencia
    const drowsy = Math.random() > 0.5;
    return { label: drowsy ? "drowsy" : "non_drowsy", confidence: 0.75 + Math.random() * 0.24 };
  }
}
function setStatus(online) {
  els.status.classList.toggle("online", online);
  els.status.querySelector("span").textContent = online ? "Backend conectado" : "Modo demo";
}

els.analyze.addEventListener("click", async () => {
  if (!currentBlob) return;
  els.analyze.disabled = true; els.analyze.textContent = "Analizando…";
  els.scan.hidden = false; els.result.hidden = true;
  const res = await predict(currentBlob);
  els.scan.hidden = true;
  els.analyze.textContent = "Analizar"; els.analyze.disabled = false;
  showResult(res);
});

function showResult({ label, confidence }) {
  const drowsy = label === "drowsy";
  els.result.className = "result " + (drowsy ? "drowsy" : "awake");
  els.badge.textContent = drowsy ? "😴" : "😃";
  els.title.textContent = drowsy ? "Somnoliento (Drowsy)" : "Alerta (Non Drowsy)";
  els.desc.textContent = drowsy
    ? "Se detectan signos de somnolencia. Se recomienda detenerse a descansar."
    : "No se detectan signos de somnolencia en la imagen.";
  els.conf.textContent = (confidence * 100).toFixed(1) + "%";
  els.result.hidden = false;
  els.fill.style.width = "0";
  requestAnimationFrame(() => (els.fill.style.width = confidence * 100 + "%"));
}
