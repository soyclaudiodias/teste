import pycolmap
import open3d as o3d
from pathlib import Path
import shutil
import time


def run_mvs(image_dir=None, colmap_path="colmap", cancel_check=None):
    start_time = time.time()

    print("\n[MVS]\n")

    colmap_path = Path(colmap_path)
    image_dir = Path(image_dir) if image_dir else colmap_path / "images"

    sparse_dir = colmap_path / "sparse" / "0"
    dense_dir = colmap_path / "dense"

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    if not sparse_dir.exists():
        raise RuntimeError(f"Modelo SfM não encontrado em: {sparse_dir}")

    if dense_dir.exists():
        shutil.rmtree(dense_dir)

    dense_dir.mkdir(parents=True, exist_ok=True)

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    pycolmap.undistort_images(
        output_path=dense_dir,
        image_path=image_dir,
        input_path=sparse_dir
    )

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    options = pycolmap.PatchMatchOptions()
    options.max_image_size = 1600
    options.num_iterations = 5
    options.num_samples = 10
    options.window_radius = 5
    options.filter = True

    pycolmap.patch_match_stereo(
        str(dense_dir),
        options=options
    )

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    fusion_options = pycolmap.StereoFusionOptions()
    fusion_options.min_num_pixels = 3
    fusion_options.max_reproj_error = 1
    fusion_options.max_depth_error = 0.01

    fused_path = dense_dir / "fused.ply"

    pycolmap.stereo_fusion(
        output_path=str(fused_path),
        workspace_path=str(dense_dir),
        options=fusion_options,
        output_type="PLY"
    )

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    if not fused_path.exists():
        raise RuntimeError("fused.ply não foi gerado pelo MVS.")

    end_time = time.time()
    dif_time = end_time - start_time

    dense_point_cloud = o3d.io.read_point_cloud(str(fused_path))
    dense_points_amount = len(dense_point_cloud.points)

    print()
    print("*" * 50)
    print(f"Pontos 3D (MVS): {dense_points_amount}")
    print(f"Tempo gasto (MVS): {dif_time / 60:.2f} minutos")
    print("MVS finalizado com sucesso!")
    print("*" * 50)
    print()
