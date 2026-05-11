import open3d as o3d
import trimesh
from pathlib import Path


def export_mesh(input_path=None, output_dir=None):
    if input_path is None:
        input_path = Path("static") / "models" / "mesh.ply"
    else:
        input_path = Path(input_path)

    if output_dir is None:
        output_dir = input_path.parent
    else:
        output_dir = Path(output_dir)

    output_dir.mkdir(parents=True, exist_ok=True)

    ply_path = input_path
    obj_path = output_dir / "mesh.obj"
    stl_path = output_dir / "mesh.stl"
    glb_path = output_dir / "mesh.glb"

    if not ply_path.exists():
        raise RuntimeError(f"mesh.ply não encontrado em: {ply_path}")

    print("Exportando formatos da malha...")

    mesh = o3d.io.read_triangle_mesh(str(ply_path))

    if mesh.is_empty():
        raise RuntimeError("A malha está vazia ou não pôde ser carregada.")

    o3d.io.write_triangle_mesh(str(obj_path), mesh)
    o3d.io.write_triangle_mesh(str(stl_path), mesh)

    tri_mesh = trimesh.load(str(ply_path))
    tri_mesh.export(str(glb_path))

    print()
    print("*" * 50)
    print("Conversão concluída!")
    print("Formatos disponíveis: PLY, OBJ, STL, GLB")
    print("Arquivos salvos em:", output_dir)
    print("*" * 50)
    print()
