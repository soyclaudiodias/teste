import open3d as o3d
import trimesh
from pathlib import Path

# função principal para exportar a malha para outros formatos (chamada no arquivo com Flask)
def export_mesh():

    MODEL_PATH = Path("static") / "models"

    PLY_PATH = MODEL_PATH / "mesh.ply"
    OBJ_PATH = MODEL_PATH / "mesh.obj"
    STL_PATH = MODEL_PATH / "mesh.stl"
    GLB_PATH = MODEL_PATH / "mesh.glb"

    if not PLY_PATH.exists():
        raise RuntimeError("mesh.ply não encontrado!")

    print("Exportando formatos da malha...")

    # carregar mesh
    mesh = o3d.io.read_triangle_mesh(PLY_PATH)

    # exportar OBJ
    o3d.io.write_triangle_mesh(OBJ_PATH, mesh)

    # exportar STL
    o3d.io.write_triangle_mesh(STL_PATH, mesh)

    # exportar GLB usando trimesh
    tri_mesh = trimesh.load(PLY_PATH)
    tri_mesh.export(GLB_PATH)

    print()
    print("*"*50)
    print("Conversão concluída!")
    print("Formatos disponíveis: OBJ, STL, GLB")
    print("*"*50)
    print()