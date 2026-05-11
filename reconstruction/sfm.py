import pycolmap
from pathlib import Path
import shutil
import time


def run_sfm(image_dir=None, colmap_path="colmap", cancel_check=None):
    start_time = time.time()

    print("\n[SfM]\n")

    colmap_root = Path(colmap_path)
    image_dir = Path(image_dir) if image_dir else colmap_root / "images"

    sparse_root = colmap_root / "sparse"
    sparse_dir = sparse_root / "0"

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    if not image_dir.exists():
        raise RuntimeError(f"Pasta de imagens não encontrada: {image_dir}")

    if sparse_root.exists():
        shutil.rmtree(sparse_root)

    sparse_dir.mkdir(parents=True, exist_ok=True)

    database = colmap_root / "database.db"

    if database.exists():
        database.unlink()

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    pycolmap.extract_features(database, image_dir)

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    pycolmap.match_exhaustive(database)

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    recs = pycolmap.incremental_mapping(
        database,
        image_dir,
        sparse_dir
    )

    recs_amount = len(recs)

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    if recs_amount == 0:
        raise RuntimeError("Nenhuma reconstrução válida foi criada!")

    largest_rec = max(recs.values(), key=lambda m: m.num_images())
    largest_rec.write(sparse_dir)

    end_time = time.time()
    dif_time = end_time - start_time

    print()
    print("*" * 50)
    print("Reconstruções válidas:", recs_amount)
    print("Imagens reconstruídas:", largest_rec.num_images())
    print("Pontos 3D (SfM):", largest_rec.num_points3D())
    print("Tempo gasto (SfM):", f"{dif_time / 60:.2f}", "minutos")
    print("SfM finalizado com sucesso!")
    print("*" * 50)
    print()
