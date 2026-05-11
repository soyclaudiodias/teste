import pycolmap
from pathlib import Path
import shutil
import time

# função principal para executar o SfM (chamada no arquivo com Flask)
def run_sfm(image_dir=None, cancel_check=None):

    start_time = time.time()

    print("\n[SfM]\n")

    colmap_root = Path("colmap")
    image_dir = Path(image_dir) if image_dir else colmap_root / "images"
    sparse_root = colmap_root / "sparse"
    sparse_dir = sparse_root / "0"

    # verifica cancelamento antes de começar
    if cancel_check and cancel_check():
        raise Exception("cancelled")

    if not image_dir.exists():
        raise RuntimeError(f"Pasta de imagens não encontrada: {image_dir}")

    if sparse_root.exists():
        shutil.rmtree(sparse_root)
    sparse_dir.mkdir(parents=True)

    database = colmap_root / "database.db"
    if database.exists():
        database.unlink()

    # verifica cancelamento antes da extração de features
    if cancel_check and cancel_check():
        raise Exception("cancelled")
    
    # executa o SIFT (detector e descritor de features)
    pycolmap.extract_features(database, image_dir)

    # verifica cancelamento antes do matching
    if cancel_check and cancel_check():
        raise Exception("cancelled")
    
    # executa o matching (encontra correspondências entre as imagens) e executa o RANSAC para filtrar outliers
    pycolmap.match_exhaustive(database)

    # verifica cancelamento antes do incremental mapping
    if cancel_check and cancel_check():
        raise Exception("cancelled")

    # executa a triangulação incremental e o bundle adjustment para criar a reconstrução 3D
    recs = pycolmap.incremental_mapping(database, image_dir, sparse_dir)
    recs_amount = len(recs)

    # verifica cancelamento depois do incremental mapping
    if cancel_check and cancel_check():
        raise Exception("cancelled")

    end_time = time.time()
    dif_time = end_time - start_time

    if recs_amount == 0:
        raise RuntimeError("Nenhuma reconstrução válida foi criada!")
    else:
        print()
        print("*"*50)
        print("Reconstruções válidas:", recs_amount)

    largest_rec = max(recs.values(), key=lambda m: m.num_images())
    largest_rec.write(sparse_dir)

    print("Imagens reconstruídas:", largest_rec.num_images())
    print("Pontos 3D (SfM):", largest_rec.num_points3D())
    print("Tempo gasto (SfM):", f"{dif_time/60:.2f}", "minutos")
    print("SfM finalizado com sucesso!")
    print("*"*50)
    print()

#run_sfm() # teste local