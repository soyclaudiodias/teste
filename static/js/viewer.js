import * as THREE from "three";
import { PLYLoader } from "https://cdn.jsdelivr.net/npm/three@0.156.0/examples/jsm/loaders/PLYLoader.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.156.0/examples/jsm/controls/OrbitControls.js";

let viewerInitialized = false;
let currentObject = null;

let scene = null;
let camera = null;
let renderer = null;
let controls = null;

let backendModelUrl = null;

window.addEventListener("mesh-ready", (event) => {
  backendModelUrl = event.detail?.modelUrl || null;

  if (!viewerInitialized) {
    initViewer();
    viewerInitialized = true;
  }

  loadMeshFromBackend();
});

function initViewer() {
  const canvas = document.getElementById("viewer-canvas");

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111111);

  const container = canvas.parentElement;

  camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    10000,
  );

  camera.position.set(0, 0, 10);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas,
  });

  renderer.setSize(
    container.clientWidth,
    container.clientHeight,
  );

  renderer.setPixelRatio(window.devicePixelRatio);

  controls = new OrbitControls(camera, renderer.domElement);

  const ambient = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambient);

  const light = new THREE.DirectionalLight(0xffffff, 1);

  light.position.set(5, 10, 7);

  scene.add(light);

  animate();
}

function clearCurrentObject() {
  if (!currentObject) return;

  scene.remove(currentObject);

  currentObject.traverse?.((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (child.material) {
      child.material.dispose?.();
    }
  });

  currentObject = null;
}

function fitCameraToObject(object) {
  const box = new THREE.Box3().setFromObject(object);

  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);

  object.position.sub(center);

  camera.position.set(0, 0, maxDim * 2.2);

  controls.target.set(0, 0, 0);
  controls.update();
}

function loadMeshFromBackend() {
  if (!backendModelUrl) {
    console.error("URL do modelo não encontrada.");
    return;
  }

  const loader = new PLYLoader();

  const url = `${backendModelUrl}?t=${Date.now()}`;

  loader.load(
    url,
    (geometry) => {
      clearCurrentObject();

      geometry.computeVertexNormals();

      const material = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        metalness: 0.1,
        roughness: 0.8,
      });

      const mesh = new THREE.Mesh(geometry, material);

      mesh.rotation.x = -Math.PI / 2;

      currentObject = mesh;

      scene.add(mesh);

      fitCameraToObject(mesh);
    },
    undefined,
    (error) => {
      console.error("Erro ao carregar malha:", error);
    },
  );
}

function animate() {
  requestAnimationFrame(animate);

  controls?.update();

  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}
