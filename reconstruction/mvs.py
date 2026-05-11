import pycolmap
import open3d as o3d
from pathlib import Path
import shutil
import time

# função principal para executar o MVS (chamada no arquivo com Flask)
def run_mvs(image_dir=None, cancel_check=None):

    start_time = time.time()

    print("\n[MVS]\n")

    colmap_path = Path("colmap")
    image_dir = Path(image_dir) if image_dir else colmap_path / "images"
    sparse_dir = colmap_path / "sparse/0"
    dense_dir = colmap_path / "dense"

    # verifica cancelamento antes de começar
    if cancel_check and cancel_check():
        raise Exception("cancelled")

    if not sparse_dir.exists():
        raise RuntimeError("Modelo SfM não encontrado em 'colmap/sparse/0'")

    if dense_dir.exists():
        shutil.rmtree(dense_dir)
    dense_dir.mkdir(parents=True)

    # verifica cancelamento antes do undistort
    if cancel_check and cancel_check():
        raise Exception("cancelled")

    # ajuste das imagens (lente)
    pycolmap.undistort_images(
        output_path=dense_dir,
        image_path=image_dir,
        input_path=sparse_dir
    )

    # verifica cancelamento antes do PatchMatch Stereo
    if cancel_check and cancel_check():
        raise Exception("cancelled")

    # configurações do PatchMatch Stereo
    options = pycolmap.PatchMatchOptions()
    options.max_image_size = 1600
    options.num_iterations = 5
    options.num_samples = 10
    options.window_radius = 5
    options.filter = True

    # execução do PatchMatch Stereo para gerar a nuvem de pontos densa
    pycolmap.patch_match_stereo(
        str(dense_dir),
        options=options
    )

    # verifica cancelamento antes da Stereo Fusion
    if cancel_check and cancel_check():
        raise Exception("cancelled")

    # configurações da Stereo Fusion
    fusion_options = pycolmap.StereoFusionOptions()
    fusion_options.min_num_pixels = 3
    fusion_options.max_reproj_error = 1
    fusion_options.max_depth_error = 0.01

    fused_path = dense_dir / "fused.ply"

    # execução da Stereo Fusion para gerar a nuvem de pontos densa final (fused.ply)
    pycolmap.stereo_fusion(
        output_path=str(fused_path),
        workspace_path=str(dense_dir),
        options=fusion_options,
        output_type="PLY"
    )

    # verifica cancelamento depois da fusão
    if cancel_check and cancel_check():
        raise Exception("cancelled")

    end_time = time.time()
    dif_time = end_time - start_time

    # análise da nuvem de pontos densa gerada
    dense_point_cloud = o3d.io.read_point_cloud(str(fused_path))
    dense_points_amount = len(dense_point_cloud.points)

    print()
    print("*"*50)
    print(f"Pontos 3D (MVS): {dense_points_amount}")
    print(f"Tempo gasto (MVS): {dif_time/60:.2f} minutos")
    print("MVS finalizado com sucesso!")
    print("*"*50)
    print()

#run_mvs() # teste local