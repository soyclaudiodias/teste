import * as THREE from "three";
import { PLYLoader } from "https://cdn.jsdelivr.net/npm/three@0.156.0/examples/jsm/loaders/PLYLoader.js";
import { OBJLoader } from "https://cdn.jsdelivr.net/npm/three@0.156.0/examples/jsm/loaders/OBJLoader.js";
import { STLLoader } from "https://cdn.jsdelivr.net/npm/three@0.156.0/examples/jsm/loaders/STLLoader.js";
import { GLTFLoader } from "https://cdn.jsdelivr.net/npm/three@0.156.0/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.156.0/examples/jsm/controls/OrbitControls.js";

let viewerInitialized = false;
let currentObject = null;
let scene = null;
let camera = null;
let renderer = null;
let controls = null;
let canvas = null;

window.addEventListener("mesh-ready", () => {
  if (!viewerInitialized) {
    initViewer();
    viewerInitialized = true;
  }

  loadMeshFromBackend();
});

window.addEventListener("local-model-selected", (event) => {
  if (!viewerInitialized) {
    initViewer();
    viewerInitialized = true;
  }

  const { file, extension } = event.detail;
  loadLocalModel(file, extension);
});

function initViewer() {
  canvas = document.getElementById("viewer-canvas");
  if (!canvas) {
    console.error("Canvas #viewer-canvas não encontrado!");
    return;
  }

  scene = new THREE.Scene();

  const bgCheckbox = document.getElementById("whiteBackground");

  scene.background = new THREE.Color(0x111111);

  if (bgCheckbox) {
    bgCheckbox.checked = false;

    bgCheckbox.addEventListener("change", () => {
      scene.background = new THREE.Color(
        bgCheckbox.checked ? 0xffffff : 0x111111
      );
    });
  }

  THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

  const container = canvas.parentElement;

  camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    10000
  );
  camera.position.set(0, 0, 10);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    canvas: canvas,
  });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.enableZoom = true;
  controls.enablePan = true;
  controls.enableRotate = true;
  controls.minDistance = 0.5;
  controls.maxDistance = 1000;

  const ambient = new THREE.AmbientLight(0xffffff, 0.8);
  scene.add(ambient);

  const light1 = new THREE.DirectionalLight(0xffffff, 1);
  light1.position.set(5, 10, 7);
  scene.add(light1);

  const light2 = new THREE.DirectionalLight(0xffffff, 0.6);
  light2.position.set(-5, -10, 7);
  scene.add(light2);

  animate();

  window.addEventListener("resize", () => {
    if (!canvas || !camera || !renderer) return;

    const container = canvas.parentElement;
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });
}

function clearCurrentObject() {
  if (!currentObject || !scene) return;

  scene.remove(currentObject);

  currentObject.traverse?.((child) => {
    if (child.geometry) child.geometry.dispose();

    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((mat) => mat.dispose && mat.dispose());
      } else if (child.material.dispose) {
        child.material.dispose();
      }
    }
  });

  currentObject = null;
}

function fitCameraToObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  object.position.sub(center);

  camera.position.set(0, 0, maxDim * 2.2);
  camera.near = Math.max(maxDim / 1000, 0.01);
  camera.far = Math.max(maxDim * 10, 1000);
  camera.updateProjectionMatrix();

  controls.target.set(0, 0, 0);
  controls.update();
}

function setupViewerOptions(object, supportsVertexColors = false) {
  const toggleColor = document.getElementById("toggleColor");
  if (toggleColor) {
    toggleColor.checked = true;
    toggleColor.onchange = () => {
      object.traverse?.((child) => {
        if (!child.isMesh || !child.material) return;

        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => {
            if ("vertexColors" in mat) {
              mat.vertexColors = supportsVertexColors && toggleColor.checked;
              mat.needsUpdate = true;
            }
          });
        } else if ("vertexColors" in child.material) {
          child.material.vertexColors = supportsVertexColors && toggleColor.checked;
          child.material.needsUpdate = true;
        }
      });
    };
  }

  const invertNormalsCheckbox = document.getElementById("invertNormals");
  if (invertNormalsCheckbox) {
    invertNormalsCheckbox.checked = false;

    invertNormalsCheckbox.onchange = () => {
      const invert = invertNormalsCheckbox.checked;

      object.traverse?.((child) => {
        if (!child.isMesh || !child.geometry) return;

        let geometry = child.geometry;

        if (!geometry.userData.originalGeometry) {
          geometry.userData.originalGeometry = geometry.clone();
        }

        const baseGeometry = geometry.userData.originalGeometry.clone();

        if (invert) {
          if (baseGeometry.index) {
            const index = baseGeometry.index.array;

            for (let i = 0; i < index.length; i += 3) {
              const temp = index[i + 1];
              index[i + 1] = index[i + 2];
              index[i + 2] = temp;
            }

            baseGeometry.index.needsUpdate = true;
          } else {
            const pos = baseGeometry.attributes.position;

            for (let i = 0; i < pos.count; i += 3) {
              for (let j = 0; j < 3; j++) {
                const b = pos.getX(i + 1 + j - j);
              }

              const ax = pos.getX(i), ay = pos.getY(i), az = pos.getZ(i);
              const bx = pos.getX(i + 1), by = pos.getY(i + 1), bz = pos.getZ(i + 1);
              const cx = pos.getX(i + 2), cy = pos.getY(i + 2), cz = pos.getZ(i + 2);

              pos.setXYZ(i + 1, cx, cy, cz);
              pos.setXYZ(i + 2, bx, by, bz);
            }

            pos.needsUpdate = true;
          }
        }

        baseGeometry.computeVertexNormals();
        child.geometry.dispose();
        child.geometry = baseGeometry;

        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((mat) => (mat.needsUpdate = true));
          } else {
            child.material.needsUpdate = true;
          }
        }
      });
    };
  }
}

function createDefaultMeshFromGeometry(geometry) {
  geometry.computeVertexNormals();

  const hasColors = geometry.hasAttribute("color");

  const material = new THREE.MeshStandardMaterial({
    color: 0xdddddd,
    metalness: 0.1,
    roughness: 0.8,
    vertexColors: hasColors,
    side: THREE.FrontSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;

  setupViewerOptions(mesh, hasColors);

  return mesh;
}

function loadMeshFromBackend() {
  if (!scene) return;

  const loader = new PLYLoader();

  loader.load(
    `/static/models/mesh.ply?t=${Date.now()}`,
    (geometry) => {
      clearCurrentObject();

      const mesh = createDefaultMeshFromGeometry(geometry);
      currentObject = mesh;
      scene.add(mesh);
      fitCameraToObject(mesh);
    },
    undefined,
    (error) => console.error("Erro no loader do backend:", error)
  );
}

function loadLocalModel(file, extension) {
  if (!scene || !file) return;

  const url = URL.createObjectURL(file);
  const ext = (extension || "").toLowerCase();

  clearCurrentObject();

  if (ext === ".ply") {
    const loader = new PLYLoader();

    loader.load(
      url,
      (geometry) => {
        const mesh = createDefaultMeshFromGeometry(geometry);
        currentObject = mesh;
        scene.add(mesh);
        fitCameraToObject(mesh);
        URL.revokeObjectURL(url);
      },
      undefined,
      (error) => {
        console.error("Erro ao carregar PLY local:", error);
        URL.revokeObjectURL(url);
      }
    );
    return;
  }

  if (ext === ".stl") {
    const loader = new STLLoader();

    loader.load(
      url,
      (geometry) => {
        const material = new THREE.MeshStandardMaterial({
          color: 0xcccccc,
          metalness: 0.1,
          roughness: 0.8,
          side: THREE.DoubleSide,
        });

        geometry.computeVertexNormals();

        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = -Math.PI / 2;

        currentObject = mesh;
        scene.add(mesh);
        fitCameraToObject(mesh);
        setupViewerOptions(mesh, false);
        URL.revokeObjectURL(url);
      },
      undefined,
      (error) => {
        console.error("Erro ao carregar STL local:", error);
        URL.revokeObjectURL(url);
      }
    );
    return;
  }

  if (ext === ".obj") {
    const loader = new OBJLoader();

    loader.load(
      url,
      (object) => {
        object.rotation.x = -Math.PI / 2;

        object.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshStandardMaterial({
              color: 0xcccccc,
              metalness: 0.1,
              roughness: 0.8,
              side: THREE.DoubleSide,
            });

            if (child.geometry) {
              child.geometry.computeVertexNormals();
            }
          }
        });

        currentObject = object;
        scene.add(object);
        fitCameraToObject(object);
        setupViewerOptions(object, false);
        URL.revokeObjectURL(url);
      },
      undefined,
      (error) => {
        console.error("Erro ao carregar OBJ local:", error);
        URL.revokeObjectURL(url);
      }
    );
    return;
  }

  if (ext === ".glb" || ext === ".gltf") {
    const loader = new GLTFLoader();

    loader.load(
      url,
      (gltf) => {
        const object = gltf.scene;
        object.rotation.x = -Math.PI / 2;

        object.traverse((child) => {
          if (child.isMesh && child.geometry) {
            child.geometry.computeVertexNormals();

            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach((mat) => {
                  mat.side = THREE.DoubleSide;
                  mat.needsUpdate = true;
                });
              } else {
                child.material.side = THREE.DoubleSide;
                child.material.needsUpdate = true;
              }
            }
          }
        });

        currentObject = object;
        scene.add(object);
        fitCameraToObject(object);
        setupViewerOptions(object, true);
        URL.revokeObjectURL(url);
      },
      undefined,
      (error) => {
        console.error("Erro ao carregar GLB/GLTF local:", error);
        URL.revokeObjectURL(url);
      }
    );
    return;
  }

  console.error("Formato não suportado:", ext);
  URL.revokeObjectURL(url);
}

function animate() {
  requestAnimationFrame(animate);

  if (controls) controls.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}