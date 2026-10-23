// Reads the words in a screenshot (a WhatsApp or Telegram chat, a text message,
// an email) right on the device. The picture is never uploaded anywhere.

let workerPromise = null;
let progressListener = null;

function getWorker() {
  if (!workerPromise) {
    workerPromise = import("tesseract.js").then(({ createWorker }) =>
      createWorker("eng", 1, { logger: (m) => progressListener && progressListener(m) })
    );
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That picture couldn't be opened.")); };
    img.src = url;
  });
}

// Phone screenshots are tall and narrow; enlarge small ones so small chat text reads well.
function prepare(img) {
  const longSide = Math.max(img.naturalWidth, img.naturalHeight);
  let scale = 1;
  if (img.naturalWidth < 1000) scale = Math.min(2, 1000 / img.naturalWidth);
  if (longSide * scale > 4000) scale = 4000 / longSide;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.filter = "grayscale(1) contrast(1.25)";
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Removes the usual chat-app clutter (times, ticks, "Today") so only the words are left.
function tidy(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1)
    .filter((l) => !/^(\d{1,2}:\d{2}\s*(am|pm)?\s*[✓✔vV]*|today|yesterday|delivered|read|seen)$/i.test(l))
    .join("\n");
}

export async function readScreenshot(file, onProgress = () => {}) {
  onProgress("Opening the screenshot…");
  const img = await loadImage(file);
  progressListener = (m) => {
    if (m.status === "recognizing text") onProgress(`Reading the screenshot… ${Math.round((m.progress || 0) * 100)}%`);
    else onProgress("Getting the reader ready (first time takes a few seconds)…");
  };
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(prepare(img));
    return tidy(data?.text || "");
  } finally {
    progressListener = null;
  }
}
