from flask import Flask, render_template, request, send_file, jsonify
from reconstruction import preprocessing, sfm, mvs, meshing, export
from pathlib import Path
import threading
import uuid

app = Flask(__name__)

jobs = {}

VALID_STRATEGIES = {"com_fundo", "sem_fundo"}


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/models/<path:filename>")
def serve_models(filename):
    return send_file(Path("static/models") / filename)


@app.route("/upload", methods=["POST"])
def upload():
    use_preprocess = request.form.get("use_preprocess", "true") == "true"
    uploaded_files = request.files.getlist("file")

    try:
        depth = int(request.form.get("depth", 9))
    except:
        depth = 9

    depth = max(7, min(12, depth))

    strategy = request.form.get("strategy", "com_fundo")
    if strategy not in VALID_STRATEGIES:
        strategy = "com_fundo"

    invert_normals = request.form.get("invertNormals", "false") == "true"

    valid_files = []
    for file in uploaded_files:
        filename = getattr(file, "filename", "").strip()
        if filename:
            valid_files.append(file)

    if not valid_files:
        return jsonify({
            "status": "error",
            "error": "Nenhuma imagem válida foi enviada."
        }), 400

    job_id = str(uuid.uuid4())

    job_dir = Path("jobs") / job_id
    colmap_dir = job_dir / "colmap"
    original_dir = colmap_dir / "images"
    processed_dir = colmap_dir / "images_processed"
    model_dir = Path("static") / "models" / job_id

    original_dir.mkdir(parents=True, exist_ok=True)
    processed_dir.mkdir(parents=True, exist_ok=True)
    model_dir.mkdir(parents=True, exist_ok=True)

    jobs[job_id] = {
        "stage": "preprocessamento",
        "error": "",
        "cancel": False
    }

    saved_filenames = []

    for file in valid_files:
        filename = file.filename.strip()
        original_path = original_dir / filename
        file.save(original_path)
        saved_filenames.append(filename)

    def is_cancelled():
        return jobs.get(job_id, {}).get("cancel", False)

    def pipeline():
        try:
            total = len(saved_filenames)

            for i, filename in enumerate(saved_filenames, start=1):
                if is_cancelled():
                    jobs[job_id]["stage"] = "idle"
                    return

                jobs[job_id]["stage"] = f"preprocessamento|{i}|{total}"

                preprocessing.preprocess_image(
                    input_path=str(original_dir / filename),
                    output_base_dir=str(processed_dir),
                    strategy=strategy,
                    use_preprocess=use_preprocess,
                    cancel_check=is_cancelled
                )

            sfm_input_dir = processed_dir / strategy

            if is_cancelled():
                jobs[job_id]["stage"] = "idle"
                return

            jobs[job_id]["stage"] = "sfm_features"

            sfm.run_sfm(
                image_dir=str(sfm_input_dir),
                colmap_path=colmap_dir,
                cancel_check=is_cancelled
            )

            if is_cancelled():
                jobs[job_id]["stage"] = "idle"
                return

            jobs[job_id]["stage"] = "mvs_depth"

            mvs.run_mvs(
                image_dir=str(sfm_input_dir),
                colmap_path=colmap_dir,
                cancel_check=is_cancelled
            )

            if is_cancelled():
                jobs[job_id]["stage"] = "idle"
                return

            jobs[job_id]["stage"] = "mesh_loading"

            meshing.generate_mesh(
                depth=depth,
                invert_normals=invert_normals,
                colmap_path=colmap_dir,
                output_path=model_dir / "mesh.ply",
                cancel_check=is_cancelled
            )

            if is_cancelled():
                jobs[job_id]["stage"] = "idle"
                return

            jobs[job_id]["stage"] = "exporting"

            export.export_mesh(
                input_path=model_dir / "mesh.ply",
                output_dir=model_dir
            )

            jobs[job_id]["stage"] = "done"

        except Exception as e:
            print("Erro no pipeline:", e)

            stage = jobs[job_id]["stage"]
            stage_key = stage.split("|")[0]

            error_messages = {
                "preprocessamento": "Erro durante o pré-processamento das imagens.",
                "sfm_features": "Erro durante a extração de características (SfM).",
                "sfm_verify": "Erro durante a reconstrução da câmera (SfM).",
                "mvs_depth": "Erro durante a geração dos depth maps (MVS).",
                "mvs_fusion": "Erro durante a fusão da nuvem de pontos.",
                "mesh_loading": "Erro ao carregar a nuvem de pontos.",
                "mesh_downsample": "Erro durante o downsample da malha.",
                "mesh_outliers": "Erro na remoção de outliers.",
                "mesh_normals": "Erro ao estimar as normais.",
                "mesh_poisson": "Erro durante a reconstrução Poisson.",
                "mesh_clean": "Erro durante a limpeza da malha.",
                "mesh_smooth": "Erro durante a suavização da malha.",
                "mesh_finalize": "Erro na finalização da malha.",
                "exporting": "Erro ao exportar o modelo 3D.",
            }

            jobs[job_id]["error"] = error_messages.get(
                stage_key,
                "Ocorreu um erro inesperado durante o processamento."
            )

            jobs[job_id]["stage"] = "error"

    pipeline_thread = threading.Thread(target=pipeline, daemon=True)
    pipeline_thread.start()

    return jsonify({
        "status": "ok",
        "job_id": job_id,
        "model_url": f"/models/{job_id}/mesh.ply"
    })


@app.route("/status/<job_id>", methods=["GET"])
def status(job_id):
    job = jobs.get(job_id)

    if not job:
        return jsonify({
            "stage": "not_found",
            "error": "Job não encontrado."
        }), 404

    return jsonify({
        "stage": job["stage"],
        "error": job["error"]
    })


@app.route("/cancel/<job_id>", methods=["POST"])
def cancel(job_id):
    job = jobs.get(job_id)

    if job:
        job["cancel"] = True
        job["stage"] = "idle"
        job["error"] = "cancelled"

    return jsonify({"status": "cancelled"})


if __name__ == "__main__":
    app.run(debug=True)
