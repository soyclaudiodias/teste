// ===== ELEMENTOS DA UI =====
const dropzone = document.querySelector("#drop-zone");
const label = document.querySelector("label.file-input");
const input = document.querySelector("input[type='file']");
const cancelBtn = document.getElementById("cancel-btn");
const downloadBtn = document.getElementById("download-btn");
const downloadOptions = document.getElementById("download-options");
const form = document.querySelector("#generate form");

// ===== ESTADO GLOBAL DO FRONTEND =====
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

function setDownloadVisibility(show) {
  const downloadMenu = document.querySelector(".download-menu");
  if (downloadMenu) {
    downloadMenu.style.display = show ? "flex" : "none";
  }
}

// ===== MODAL =====
function openConfirmModal(action) {
  const modal = document.getElementById("confirm-modal");
  const title = document.getElementById("modal-title");
  const text = document.getElementById("modal-text");

  if (!modal || !title || !text) {
    modalAction = action;
    return;
  }

  modalAction = action;

  if (action === "cancel") {
    title.innerText = "Cancelar processamento";
    text.innerText =
      "Tem certeza que deseja cancelar o processamento?\nO progresso atual será perdido.";
  }

  if (action === "return") {
    title.innerText = "Tem certeza que deseja voltar?";
    text.innerText =
      "Ao voltar, você perderá toda a geração atual.\nEssa ação não pode ser desfeita.";
  }

  modal.style.display = "flex";
}

// ===== UTILITÁRIOS DE UI =====
function getOrCreateBoxZone() {
  let boxZone = document.querySelector(".box-zone");

  if (!boxZone) {
    boxZone = document.createElement("div");
    boxZone.classList.add("box-zone");

    Object.assign(boxZone.style, {
      marginTop: "10px",
      display: "flex",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: "15px",
      width: "100%",
      gridArea: "auto",
    });

    const fileInput = document.querySelector(
      "#generate .upload-card .file-input",
    );

    fileInput.appendChild(boxZone);
  }

  return boxZone;
}

function updateButtonState() {
  const button = document.querySelector("input[type='submit']");
  const clearBtn = document.querySelector(".clear-all-btn");

  if (!button) return;

  const hasImages = selectedFiles.length > 0;

  button.disabled = !hasImages;
  button.classList.toggle("button-enabled", hasImages);
  button.classList.toggle("button-disabled", !hasImages);

  if (hasImages) {
    createClearButton();
    if (clearBtn) clearBtn.style.display = "block";
  } else if (clearBtn) {
    clearBtn.style.display = "none";
  }
}

function showMessage(text) {
  let msg = document.querySelector(".msg-erro");
  const formInput = document.querySelector("#generate form .file-input");

  if (!formInput) return;

  if (!msg) {
    msg = document.createElement("p");
    msg.classList.add("msg-erro");
    formInput.insertAdjacentElement("beforebegin", msg);
  }

  msg.textContent = text;
}

function getFileExtension(filename) {
  const lower = filename.toLowerCase();
  const dotIndex = lower.lastIndexOf(".");
  return dotIndex !== -1 ? lower.slice(dotIndex) : "";
}

function is3DModelFile(file) {
  const ext = getFileExtension(file.name || "");
  return modelExtensions.includes(ext);
}

function openViewerWithLocalModel(file) {
  selectedModelFile = file;

  document.querySelector("#generate").style.display = "none";
  document.querySelector("#progress-section").style.display = "none";
  document.querySelector("#viewer-section").style.display = "flex";

  setDownloadVisibility(false);

  window.dispatchEvent(
    new CustomEvent("local-model-selected", {
      detail: {
        file: file,
        extension: getFileExtension(file.name || ""),
      },
    }),
  );
}

function createClearButton() {
  if (document.querySelector(".clear-all-btn")) return;

  const btn = document.createElement("button");
  btn.innerText = "REMOVER TUDO";
  btn.type = "button";
  btn.classList.add("clear-all-btn");

  Object.assign(btn.style, {
    display: "block",
    width: "190px",
    fontSize: "16px",
    fontWeight: "bold",
    margin: "20px auto",
    padding: "14px 28px",
    borderRadius: "15px",
    border: "none",
    background: "#ff3434",
    color: "white",
    cursor: "pointer",
  });

  btn.addEventListener("click", () => {
    const boxZone = document.querySelector(".box-zone");
    if (boxZone) boxZone.innerHTML = "";

    addedImages.clear();
    selectedFiles.length = 0;
    input.value = "";

    updateButtonState();
    btn.remove();
  });

  document.querySelector("#generate form").appendChild(btn);
}

// ===== PREVIEW DE IMAGENS =====
function createImagePreview(file, fileID) {
  const boxZone = getOrCreateBoxZone();

  const wrapper = document.createElement("div");
  wrapper.dataset.fileId = fileID;

  Object.assign(wrapper.style, {
    position: "relative",
    width: "96px",
    height: "96px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  });

  const img = document.createElement("img");
  img.src = URL.createObjectURL(file);

  Object.assign(img.style, {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    borderRadius: "15px",
  });

  const removeBtn = document.createElement("button");
  removeBtn.innerText = "✕";
  removeBtn.type = "button";

  Object.assign(removeBtn.style, {
    position: "absolute",
    top: "5px",
    right: "5px",
    width: "20px",
    height: "20px",
    borderRadius: "15px",
    background: "#2B2B2B",
    color: "#D7D7D7",
    cursor: "pointer",
  });

  removeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    wrapper.remove();

    addedImages.delete(fileID);

    const index = selectedFiles.findIndex((item) => item.id === fileID);
    if (index !== -1) {
      selectedFiles.splice(index, 1);
    }

    updateButtonState();
  });

  wrapper.appendChild(img);
  wrapper.appendChild(removeBtn);
  boxZone.appendChild(wrapper);
}

// ===== INPUT DE ARQUIVOS =====
input.addEventListener("change", () => {
  const files = Array.from(input.files);

  if (files.length === 0) return;

  if (files.length === 1 && is3DModelFile(files[0])) {
    openViewerWithLocalModel(files[0]);
    input.value = "";
    return;
  }

  const onlyImages = files.every((file) => imageFormats.includes(file.type));

  if (!onlyImages) {
    showMessage(
      "* Selecione imagens JPG, PNG ou WEBP, ou então um único arquivo 3D.",
    );
    input.value = "";
    return;
  }

  const boxZone = getOrCreateBoxZone();
  const currentImages = boxZone.querySelectorAll(":scope > div").length;
  const spacesLeft = maxImages - currentImages;

  if (spacesLeft <= 0) {
    input.value = "";
    return;
  }

  files.slice(0, spacesLeft).forEach((file) => {
    const fileID = `${file.name}-${file.size}`;

    if (addedImages.has(fileID)) {
      showMessage("* Essa imagem já foi selecionada anteriormente.");
      return;
    }

    addedImages.add(fileID);

    selectedFiles.push({
      id: fileID,
      file: file,
    });

    createImagePreview(file, fileID);
  });

  input.value = "";
  createClearButton();
  updateButtonState();
});

// ===== DRAG & DROP =====
function onEnter() {
  label.classList.add("active");
}

function onLeave() {
  label.classList.remove("active");
}

label.addEventListener("dragenter", onEnter);
label.addEventListener("dragleave", onLeave);
label.addEventListener("dragend", onLeave);

label.addEventListener("dragover", (e) => {
  e.preventDefault();
  label.classList.add("active");
});

label.addEventListener("drop", (e) => {
  e.preventDefault();
  onLeave();

  const droppedFiles = Array.from(e.dataTransfer.files);

  if (droppedFiles.length === 0) return;

  if (droppedFiles.length === 1 && is3DModelFile(droppedFiles[0])) {
    openViewerWithLocalModel(droppedFiles[0]);
    return;
  }

  const onlyImages = droppedFiles.every((file) =>
    imageFormats.includes(file.type),
  );

  if (!onlyImages) {
    showMessage(
      "* Arraste imagens JPG, PNG ou WEBP, ou então um único arquivo 3D.",
    );
    return;
  }

  const boxZone = getOrCreateBoxZone();
  const currentImages = boxZone.querySelectorAll(":scope > div").length;
  const spacesLeft = maxImages - currentImages;

  if (spacesLeft <= 0) return;

  droppedFiles.slice(0, spacesLeft).forEach((file) => {
    const fileID = `${file.name}-${file.size}`;

    if (addedImages.has(fileID)) {
      showMessage("* Essa imagem já foi selecionada anteriormente.");
      return;
    }

    addedImages.add(fileID);

    selectedFiles.push({
      id: fileID,
      file: file,
    });

    createImagePreview(file, fileID);
  });

  createClearButton();
  updateButtonState();
});

// ===== PROGRESSO =====
function setStageLabel(stageRaw, errorMsg = "") {
  const progressLabel = document.getElementById("progress-text");
  const bar = document.getElementById("progress-bar");

  if (!progressLabel || !bar) return;

  if (!stageRaw || stageRaw === "idle") {
    progressLabel.innerText = "Aguardando...";
    bar.style.width = "0%";
    bar.style.background = "";
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
    bar.style.background = "";
    return;
  }

  const parts = (stageRaw || "").split("|");
  const stage = parts[0] || "starting";
  const current = parts[1] || "0";
  const total = parts[2] || "1";

  const labels = {
    starting: "Iniciando...",
    preprocessamento: (cur, tot) => `Pré-processamento (${cur}/${tot})`,
    sfm_features: "SfM: extração de features",
    sfm_verify: "SfM: verificação e reconstrução",
    mvs_depth: "MVS: geração de depth maps",
    mvs_fusion: "MVS: fusão da nuvem",
    mesh_loading: "Meshing: carregando nuvem",
    mesh_downsample: "Meshing: downsample",
    mesh_outliers: "Meshing: remoção de outliers",
    mesh_normals: "Meshing: estimando normais",
    mesh_poisson: "Meshing: Poisson Reconstruction",
    mesh_clean: "Meshing: limpeza",
    mesh_smooth: "Meshing: suavização",
    mesh_finalize: "Meshing: finalizando",
    exporting: "Carregando modelo",
  };

  const progressMap = {
    starting: 0,
    preprocessamento: 10,
    sfm_features: 25,
    sfm_verify: 40,
    mvs_depth: 60,
    mvs_fusion: 75,
    mesh_loading: 80,
    mesh_downsample: 82,
    mesh_outliers: 84,
    mesh_normals: 86,
    mesh_poisson: 88,
    mesh_clean: 92,
    mesh_smooth: 94,
    mesh_finalize: 99,
    exporting: 100,
    done: 100,
  };

  let text = labels[stage];
  if (typeof text === "function") {
    text = text(current, total);
  }
  if (!text) text = "Iniciando...";

  progressLabel.innerText = text;
  bar.style.transition = "width 0.3s ease";
  bar.style.width = (progressMap[stage] ?? 0) + "%";
}

function resetUIToStart() {
  isCancelled = false;

  const progressSection = document.querySelector("#progress-section");
  const viewerSection = document.querySelector("#viewer-section");
  const generateSection = document.querySelector("#generate");
  const boxZone = document.querySelector(".box-zone");

  if (progressSection) progressSection.style.display = "none";
  if (viewerSection) viewerSection.style.display = "none";
  if (generateSection) generateSection.style.display = "block";
  if (boxZone) boxZone.innerHTML = "";

  addedImages.clear();
  selectedFiles.length = 0;

  updateButtonState();
  input.value = "";
  setStageLabel("idle");
}

function startProgressMonitoring() {
  if (progressInterval) clearInterval(progressInterval);
  progressInterval = setInterval(checkProgress, 1000);
}

// ===== POLLING BACKEND =====
async function checkProgress() {
  try {
    const res = await fetch("/status");

    if (!res.ok) {
      throw new Error(`Erro HTTP ${res.status} ao consultar progresso.`);
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error("A rota /status não retornou JSON.");
    }

    const data = await res.json();

    const stage = data.stage;
    const error = data.error;

    if (error && error !== "" && error !== "cancelled") {
      hasError = true;
      setStageLabel("error", error);

      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }

      setTimeout(() => {
        isCancelled = false;
        hasError = false;
        resetUIToStart();
      }, 3000);

      return;
    }

    if (hasError) return;

    setStageLabel(stage);

    if (stage && stage.startsWith("done")) {
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }

      const progressSection = document.querySelector("#progress-section");
      const viewerSection = document.querySelector("#viewer-section");

      if (progressSection) progressSection.style.display = "none";
      if (viewerSection) viewerSection.style.display = "flex";

      setDownloadVisibility(true);

      window.dispatchEvent(new Event("mesh-ready"));
    }
  } catch (err) {
    console.log("Erro ao consultar progresso:", err);
    setStageLabel("error", err.message || "Erro ao consultar progresso.");

    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }

    setTimeout(() => {
      resetUIToStart();
    }, 2500);
  }
}

// ===== CANCELAMENTO =====
if (cancelBtn) {
  const modal = document.getElementById("confirm-modal");
  const confirmBack = document.getElementById("confirm-back");
  const cancelBack = document.getElementById("cancel-back");

  if (modal && confirmBack && cancelBack) {
    cancelBtn.addEventListener("click", () => {
      openConfirmModal("cancel");
    });

    confirmBack.addEventListener("click", async () => {
      modal.style.display = "none";

      if (modalAction !== "cancel") return;

      try {
        await fetch("/cancel", { method: "POST" });

        isCancelled = true;

        if (progressInterval) {
          clearInterval(progressInterval);
          progressInterval = null;
        }

        resetUIToStart();
      } catch (err) {
        console.log("Erro ao cancelar:", err);
      }

      modalAction = null;
    });

    cancelBack.addEventListener("click", () => {
      modal.style.display = "none";
      modalAction = null;
    });
  } else {
    cancelBtn.addEventListener("click", async () => {
      try {
        await fetch("/cancel", { method: "POST" });

        isCancelled = true;

        if (progressInterval) {
          clearInterval(progressInterval);
          progressInterval = null;
        }

        resetUIToStart();
      } catch (err) {
        console.log("Erro ao cancelar:", err);
      }
    });
  }
}

// ===== ENVIO PARA BACKEND =====
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (selectedFiles.length === 0) {
      showMessage("* Selecione pelo menos uma imagem.");
      return;
    }

    const formData = new FormData();

    const depthValue = document.getElementById("depth").value;
    const semFundo = document.getElementById("sem_fundo").checked;
    const usePreprocess = document.getElementById("use_preprocess").checked;
    const strategyValue = semFundo ? "sem_fundo" : "com_fundo";

    formData.append("depth", depthValue);
    formData.append("strategy", strategyValue);
    formData.append("use_preprocess", usePreprocess ? "true" : "false");

    selectedFiles.forEach((item, i) => {
      const originalFile = item.file;
      const originalName =
        originalFile.name && originalFile.name.trim()
          ? originalFile.name
          : `image${i}.png`;

      formData.append("file", originalFile, originalName);
    });

    const generateSection = document.querySelector("#generate");
    const progressSection = document.querySelector("#progress-section");
    const viewerSection = document.querySelector("#viewer-section");

    if (generateSection) generateSection.style.display = "none";
    if (viewerSection) viewerSection.style.display = "none";
    if (progressSection) progressSection.style.display = "flex";

    isCancelled = false;
    hasError = false;
    setStageLabel("starting|0|1");

    try {
      const response = await fetch("/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao enviar imagens.");
      }

      await checkProgress();
      startProgressMonitoring();
    } catch (e) {
      console.log("Erro na reconstrução:", e);
      setStageLabel("error", e.message || "Erro inesperado");

      setTimeout(() => {
        resetUIToStart();
      }, 2500);
    }
  });
}

// ===== VOLTAR =====
const returnBtn = document.getElementById("return-btn");

if (returnBtn) {
  const modal = document.getElementById("confirm-modal");
  const confirmBack = document.getElementById("confirm-back");
  const cancelBack = document.getElementById("cancel-back");

  if (modal && confirmBack && cancelBack) {
    returnBtn.addEventListener("click", () => {
      openConfirmModal("return");
    });

    confirmBack.addEventListener("click", async () => {
      modal.style.display = "none";

      if (modalAction === "return") {
        try {
          await fetch("/cancel", { method: "POST" });
        } catch (e) {}

        resetUIToStart();
      }

      modalAction = null;
    });

    cancelBack.addEventListener("click", () => {
      modal.style.display = "none";
      modalAction = null;
    });
  } else {
    returnBtn.addEventListener("click", async () => {
      try {
        await fetch("/cancel", { method: "POST" });
      } catch (e) {}

      resetUIToStart();
    });
  }
}

// ===== DOWNLOAD =====
if (downloadBtn) {
  downloadBtn.addEventListener("click", () => {
    downloadOptions.style.display =
      downloadOptions.style.display === "flex" ? "none" : "flex";
  });
}

document.querySelectorAll(".download-options button").forEach((btn) => {
  btn.addEventListener("click", () => {
    const format = btn.dataset.format;

    const formats = {
      ply: "/static/models/mesh.ply",
      obj: "/static/models/mesh.obj",
      stl: "/static/models/mesh.stl",
      glb: "/static/models/mesh.glb",
    };

    if (formats[format]) {
      window.location.href = formats[format];
    } else {
      alert("Formato não disponível.");
    }
  });
});

// ===== SLIDER =====
const depthSlider = document.getElementById("depth");
const depthValue = document.getElementById("depth-value");

if (depthSlider && depthValue) {
  depthSlider.addEventListener("input", () => {
    depthValue.innerText = depthSlider.value;
  });
}
