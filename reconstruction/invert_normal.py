import open3d as o3d
import numpy as np
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
INPUT_PATH = BASE_DIR.parent / "static" / "models" / "mesh.ply"
OUTPUT_PATH = INPUT_PATH

if not INPUT_PATH.exists():
    raise FileNotFoundError(f"Arquivo não encontrado: {INPUT_PATH}")

mesh = o3d.io.read_triangle_mesh(str(INPUT_PATH))

if mesh.is_empty():
    raise RuntimeError("A malha está vazia ou não pôde ser carregada!")

# inverte a orientação dos triângulos
triangles = np.asarray(mesh.triangles)
mesh.triangles = o3d.utility.Vector3iVector(triangles[:, [0, 2, 1]])

# recalcula as normais
mesh.compute_vertex_normals()
mesh.compute_triangle_normals()

# salva
o3d.io.write_triangle_mesh(str(OUTPUT_PATH), mesh)

print("\nMalha invertida com sucesso!")
print("Vértices:", len(mesh.vertices))
print("Triângulos:", len(mesh.triangles), "\n")