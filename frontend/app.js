/*
 * Detector de somnolencia — frontend móvil (PWA).
 *
 * 1. La cámara frontal se muestra en vivo y MediaPipe Face Landmarker detecta
 *    el rostro y los ojos en cada cuadro (corre en el navegador).
 * 2. Con los puntos de los ojos se calcula el EAR (Eye Aspect Ratio) como
 *    indicador en vivo de apertura de ojos.
 * 3. Al capturar, se recorta el rostro y se envía al backend con la CNN:
 *      POST {API_URL}/predict   (multipart/form-data, campo "file")
 *      -> { "label": "drowsy" | "non_drowsy", "confidence": 0.0 - 1.0 }
 *    Si el backend no responde, se usa un resultado de demostración basado
 *    en el EAR (no es la CNN).
 */
import { FaceLandmarker, FilesetResolver, DrawingUtils } from
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/vision_bundle.mjs";

const API_URL = "http://localhost:8000";
const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const EAR_THRESHOLD = 0.18; // por debajo => ojos cerrados. Calibrar con el dataset (sonriendo baja a ~0.21).

// Índices de la malla facial de MediaPipe para el EAR: [p1, p2, p3, p4, p5, p6]
const LEFT_EYE = [362, 385, 387, 263, 373, 380];
const RIGHT_EYE = [33, 160, 158, 133, 153, 144];

const $ = (id) => document.getElementById(id);
const els = {
  stage: $("stage"), video: $("video"), photo: $("photo"), overlay: $("overlay"), work: $("work"),
  empty: $("empty"), emptyText: $("emptyText"), startCam: $("startCam"),
  faceChip: $("faceChip"), apiChip: $("apiChip"),
  shutter: $("shutter"), file: $("fileInput"), toggleCam: $("toggleCam"),
  sheet: $("sheet"), title: $("resTitle"), conf: $("resConf"), fill: $("meterFill"),
  desc: $("resDesc"), ear: $("resEar"), source: $("resSource"), closeSheet: $("closeSheet"),
};
const ctx = els.overlay.getContext("2d");
const draw = new DrawingUtils(ctx);

let landmarker = null;
let runningMode = "VIDEO";
let stream = null;
let lastFace = null; // { landmarks, ear } del último cuadro analizado
let lastVideoTime = -1;
let frozen = false;

// ---------------------------------------------------------------- Detector
async function loadLandmarker() {
  setChip(els.faceChip, "Cargando detector…", "muted");
  try {
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode, numFaces: 1,
    });
    setChip(els.faceChip, "Sin rostro", "muted");
  } catch (err) {
    console.error(err);
    setChip(els.faceChip, "Detector no disponible", "bad");
  }
}

async function setMode(mode) {
  if (landmarker && runningMode !== mode) {
    runningMode = mode;
    await landmarker.setOptions({ runningMode: mode });
  }
}

function dist(a, b, w, h) {
  return Math.hypot((a.x - b.x) * w, (a.y - b.y) * h);
}
function eyeAspectRatio(lm, idx, w, h) {
  const [p1, p2, p3, p4, p5, p6] = idx.map((i) => lm[i]);
  return (dist(p2, p6, w, h) + dist(p3, p5, w, h)) / (2 * dist(p1, p4, w, h));
}

function faceBox(lm, w, h) {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of lm) {
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  return { x: x0 * w, y: y0 * h, w: (x1 - x0) * w, h: (y1 - y0) * h };
}

/** Procesa el resultado de MediaPipe: dibuja y devuelve { landmarks, ear } o null. */
function handleResult(result, w, h) {
  els.overlay.width = w;
  els.overlay.height = h;
  ctx.clearRect(0, 0, w, h);

  const lm = result.faceLandmarks?.[0];
  if (!lm) {
    setChip(els.faceChip, "Sin rostro", "muted");
    return null;
  }
  const ear = (eyeAspectRatio(lm, LEFT_EYE, w, h) + eyeAspectRatio(lm, RIGHT_EYE, w, h)) / 2;
  const closed = ear < EAR_THRESHOLD;
  const color = closed ? "#ff453a" : "#34c759";
  const line = Math.max(2, w / 320);

  const b = faceBox(lm, w, h);
  ctx.strokeStyle = "rgba(255,255,255,.8)";
  ctx.lineWidth = line;
  ctx.strokeRect(b.x, b.y, b.w, b.h);

  for (const set of [FaceLandmarker.FACE_LANDMARKS_LEFT_EYE, FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE]) {
    draw.drawConnectors(lm, set, { color, lineWidth: line });
  }
  for (const set of [FaceLandmarker.FACE_LANDMARKS_LEFT_IRIS, FaceLandmarker.FACE_LANDMARKS_RIGHT_IRIS]) {
    draw.drawConnectors(lm, set, { color: "#ffffff", lineWidth: line / 1.5 });
  }

  setChip(els.faceChip, `Ojos ${closed ? "cerrados" : "abiertos"} · ${ear.toFixed(2)}`, closed ? "bad" : "ok");
  return { landmarks: lm, ear };
}

function loop() {
  if (!stream) return;
  const v = els.video;
  if (!frozen && landmarker && runningMode === "VIDEO" && v.readyState >= 2 && v.currentTime !== lastVideoTime) {
    lastVideoTime = v.currentTime;
    lastFace = handleResult(landmarker.detectForVideo(v, performance.now()), v.videoWidth, v.videoHeight);
  }
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- Cámara
async function startCam() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
    });
  } catch (err) {
    console.error(err);
    els.emptyText.textContent = window.isSecureContext
      ? "No se pudo acceder a la cámara. Revisa los permisos del navegador."
      : "La cámara solo funciona con HTTPS o en localhost.";
    return;
  }
  await setMode("VIDEO");
  els.video.srcObject = stream;
  els.stage.className = "stage live";
  els.photo.hidden = true;
  els.empty.hidden = true;
  els.shutter.disabled = false;
  frozen = false;
  requestAnimationFrame(loop);
}

function stopCam() {
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  els.video.srcObject = null;
  els.shutter.disabled = true;
  ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
  if (!els.stage.classList.contains("photo")) {
    els.stage.className = "stage";
    els.empty.hidden = false;
    els.emptyText.textContent = "La cámara está apagada";
    setChip(els.faceChip, landmarker ? "Sin rostro" : els.faceChip.textContent, "muted");
  }
}

// ---------------------------------------------------------------- Captura
/** Dibuja la fuente en el canvas de trabajo, recortando el rostro si se detectó. */
function cropToBlob(source, w, h, face) {
  const c = els.work;
  let sx = 0, sy = 0, sw = w, sh = h;
  if (face) {
    const b = faceBox(face.landmarks, w, h);
    const side = Math.max(b.w, b.h) * 1.3; // margen alrededor del rostro
    sx = Math.max(0, b.x + b.w / 2 - side / 2);
    sy = Math.max(0, b.y + b.h / 2 - side / 2);
    sw = Math.min(side, w - sx);
    sh = Math.min(side, h - sy);
  }
  c.width = Math.round(sw);
  c.height = Math.round(sh);
  c.getContext("2d").drawImage(source, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.92));
}

async function analyze(source, w, h, face) {
  els.shutter.classList.add("busy");
  els.shutter.disabled = true;
  const blob = await cropToBlob(source, w, h, face);
  const res = await predict(blob, face?.ear ?? null);
  els.shutter.classList.remove("busy");
  els.shutter.disabled = !stream;
  showResult(res, face);
}

els.shutter.addEventListener("click", () => {
  if (!stream) return;
  frozen = true;
  els.video.pause();
  const v = els.video;
  analyze(v, v.videoWidth, v.videoHeight, lastFace);
});

els.file.addEventListener("change", async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  stopCam();
  els.photo.src = URL.createObjectURL(f);
  await els.photo.decode();
  els.photo.hidden = false;
  els.empty.hidden = true;
  els.stage.className = "stage photo";

  const img = els.photo, w = img.naturalWidth, h = img.naturalHeight;
  let face = null;
  if (landmarker) {
    await setMode("IMAGE");
    face = handleResult(landmarker.detect(img), w, h);
  }
  analyze(img, w, h, face);
});

// ---------------------------------------------------------------- Predicción
async function predict(blob, ear) {
  try {
    const fd = new FormData();
    fd.append("file", blob, "rostro.jpg");
    const r = await fetch(`${API_URL}/predict`, { method: "POST", body: fd, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    setChip(els.apiChip, "Modelo conectado", "ok");
    return { ...(await r.json()), source: "Modelo CNN" };
  } catch {
    setChip(els.apiChip, "Modo demo", "muted");
    if (ear == null) return { label: null, confidence: 0, source: "Demo" };
    // Demostración: regla simple con el EAR mientras no exista la CNN.
    const margin = Math.min(Math.abs(ear - EAR_THRESHOLD) / 0.1, 1);
    return {
      label: ear < EAR_THRESHOLD ? "drowsy" : "non_drowsy",
      confidence: 0.6 + margin * 0.35,
      source: "Demo (regla EAR)",
    };
  }
}

function showResult({ label, confidence, source }, face) {
  const s = els.sheet;
  els.ear.textContent = face ? face.ear.toFixed(3) : "—";
  els.source.textContent = source;
  els.fill.style.width = "0";

  if (label == null) {
    s.className = "sheet";
    els.title.textContent = "Sin rostro";
    els.conf.textContent = "";
    els.desc.textContent = "No se detectó un rostro. Acércate a la cámara con buena luz.";
  } else {
    const drowsy = label === "drowsy";
    s.className = "sheet " + (drowsy ? "drowsy" : "awake");
    els.title.textContent = drowsy ? "Somnoliento" : "Alerta";
    els.conf.textContent = Math.round(confidence * 100) + "%";
    els.desc.textContent = drowsy
      ? "Hay signos de somnolencia. Detente en un lugar seguro y descansa."
      : "No se ven signos de somnolencia.";
    requestAnimationFrame(() => (els.fill.style.width = confidence * 100 + "%"));
  }
  s.hidden = false;
}

els.closeSheet.addEventListener("click", () => {
  els.sheet.hidden = true;
  if (stream) {
    frozen = false;
    els.video.play();
  } else {
    els.photo.hidden = true;
    els.stage.className = "stage";
    ctx.clearRect(0, 0, els.overlay.width, els.overlay.height);
    startCam();
  }
});

// ---------------------------------------------------------------- Varios
function setChip(el, text, tone) {
  el.textContent = text;
  el.className = "chip " + tone;
}

els.startCam.addEventListener("click", startCam);
els.toggleCam.addEventListener("click", () => {
  els.sheet.hidden = true;
  if (stream) stopCam();
  else {
    els.photo.hidden = true;
    els.stage.className = "stage";
    startCam();
  }
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
setChip(els.apiChip, "Modo demo", "muted");
loadLandmarker();
startCam();
