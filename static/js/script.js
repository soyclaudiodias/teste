// ===== ELEMENTOS DA UI =====
const dropzone = document.querySelector("#drop-zone");
const label = document.querySelector("label.file-input");
const input = document.querySelector("input[type='file']");
const cancelBtn = document.getElementById("cancel-btn");
const downloadBtn = document.getElementById("download-btn");
const downloadOptions = document.getElementById("download-options");
const form = document.querySelector("#generate form");

// ===== ESTADO GLOBAL =====
const addedImages = new Set();
const selectedFiles = [];
const maxImages = 100;

const imageFormats = ["image/png", "image/jpg", "image/jpeg", "image/webp"];
const modelExtensions = [".ply", ".obj", ".stl", ".glb", ".gltf"];

let selectedModelFile = null;
let progressInterval = null;
let isCancelled = false;
let hasError = false;
let modalAction = null;

let currentJobId = null;
let currentModelUrl = null;

// ===== UTIL =====
function getFileExtension(filename) {
  const lower = filename.toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  return dotIndex !== -1 ? lower.slice(dotIndex) : "";
}

function is3DModelFile(file) {
  const ext = getFileExtension(file.name || "");
  return modelExtensions.includes(ext);
}

// ===== STATUS =====
function setStageLabel(stageRaw, errorMsg = "") {
  const progressLabel = document.getElementById("progress-text");
  const bar = document.getElementById("progress-bar");

  if (!progressLabel || !bar) return;

  if (!stageRaw || stageRaw === "idle") {
    progressLabel.innerText = "Aguardando...";
    bar.style.width = "0%";
    return;
  }

  if (stageRaw.startsWith("error")) {
    progressLabel.innerText = "Erro: " + errorMsg;
    bar.style.width = "100%";
    bar.style.background = "#ff3434";
    return;
  }

  if (stageRaw.startsWith("done")) {
    progressLabel.innerText = "Concluído";
    bar.style.width = "100%";
    return;
  }

  const parts = stageRaw.split("|");

  const stage = parts[0];
  const current = parts[1] || "0";
  const total = parts[2] || "1";

  const labels = {
    preprocessamento: (cur, tot) =>
      `Pré-processamento (${cur}/${tot})`,
    sfm_features: "SfM: extração de features",
    mvs_depth: "MVS: geração de depth maps",
    mesh_loading: "Meshing",
    exporting: "Exportando",
  };

  const progressMap = {
    preprocessamento: 20,
    sfm_features: 40,
    mvs_depth: 70,
    mesh_loading: 90,
    exporting: 98,
    done: 100,
  };

  let text = labels[stage];

  if (typeof text === "function") {
    text = text(current, total);
  }

  progressLabel.innerText = text || "Processando...";
  bar.style.width = (progressMap[stage] || 0) + "%";
}

// ===== POLLING =====
async function checkProgress() {
  try {
    if (!currentJobId) {
      throw new Error("Job ID não encontrado.");
    }

    const res = await fetch(`/status/${currentJobId}`);

    if (!res.ok) {
      throw new Error(`Erro HTTP ${res.status}`);
    }

    const data = await res.json();

    const stage = data.stage;
    const error = data.error;

    if (error && error !== "" && error !== "cancelled") {
      hasError = true;

      setStageLabel("error", error);

      clearInterval(progressInterval);

      setTimeout(() => {
        resetUIToStart();
      }, 3000);

      return;
    }

    setStageLabel(stage);

    if (stage && stage.startsWith("done")) {
      clearInterval(progressInterval);

      document.querySelector("#progress-section").style.display = "none";
      document.querySelector("#viewer-section").style.display = "flex";

      window.dispatchEvent(
        new CustomEvent("mesh-ready", {
          detail: {
            modelUrl: currentModelUrl,
            jobId: currentJobId,
          },
        }),
      );
    }
  } catch (err) {
    console.log(err);

    setStageLabel("error", err.message);

    clearInterval(progressInterval);

    setTimeout(() => {
      resetUIToStart();
    }, 3000);
  }
}

function startProgressMonitoring() {
  clearInterval(progressInterval);
  progressInterval = setInterval(checkProgress, 1000);
}

// ===== RESET =====
function resetUIToStart() {
  document.querySelector("#progress-section").style.display = "none";
  document.querySelector("#viewer-section").style.display = "none";
  document.querySelector("#generate").style.display = "block";

  currentJobId = null;
  currentModelUrl = null;

  addedImages.clear();
  selectedFiles.length = 0;

  const boxZone = document.querySelector(".box-zone");
  if (boxZone) boxZone.innerHTML = "";

  input.value = "";
}

// ===== ENVIO =====
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (selectedFiles.length === 0) {
      alert("Selecione imagens.");
      return;
    }

    const formData = new FormData();

    const depthValue = document.getElementById("depth").value;
    const semFundo = document.getElementById("sem_fundo").checked;
    const usePreprocess =
      document.getElementById("use_preprocess").checked;

    const strategyValue = semFundo
      ? "sem_fundo"
      : "com_fundo";

    formData.append("depth", depthValue);
    formData.append("strategy", strategyValue);
    formData.append(
      "use_preprocess",
      usePreprocess ? "true" : "false",
    );

    selectedFiles.forEach((item, i) => {
      formData.append(
        "file",
        item.file,
        item.file.name || `image${i}.png`,
      );
    });

    document.querySelector("#generate").style.display = "none";
    document.querySelector("#viewer-section").style.display = "none";
    document.querySelector("#progress-section").style.display = "flex";

    setStageLabel("starting");

    try {
      const response = await fetch("/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro no upload.");
      }

      currentJobId = data.job_id;
      currentModelUrl = data.model_url;

      await checkProgress();
      startProgressMonitoring();
    } catch (e) {
      console.log(e);

      setStageLabel("error", e.message);

      setTimeout(() => {
        resetUIToStart();
      }, 3000);
    }
  });
}

// ===== CANCELAR =====
if (cancelBtn) {
  cancelBtn.addEventListener("click", async () => {
    try {
      if (currentJobId) {
        await fetch(`/cancel/${currentJobId}`, {
          method: "POST",
        });
      }

      clearInterval(progressInterval);

      resetUIToStart();
    } catch (err) {
      console.log(err);
    }
  });
}

// ===== DOWNLOAD =====
document.querySelectorAll(".download-options button").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!currentJobId) {
      alert("Nenhum modelo disponível.");
      return;
    }

    const format = btn.dataset.format;

    const formats = {
      ply: `/models/${currentJobId}/mesh.ply`,
      obj: `/models/${currentJobId}/mesh.obj`,
      stl: `/models/${currentJobId}/mesh.stl`,
      glb: `/models/${currentJobId}/mesh.glb`,
    };

    window.location.href = formats[format];
  });
});
