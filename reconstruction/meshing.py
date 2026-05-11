import open3d as o3d
from pathlib import Path
import numpy as np
import time

# função principal para gerar a malha a partir da nuvem de pontos densa (chamada no arquivo com Flask)
def generate_mesh(depth=10, invert_normals=False, cancel_check=None):

    start_time = time.time()

    print("\n[Meshing]\n")

    colmap_path = Path("colmap")
    fused_path = colmap_path / "dense" / "fused.ply"
    output_path = Path("static") / "models" / "mesh.ply"

    # verifica cancelamento antes de começar
    if cancel_check and cancel_check():
        raise Exception("cancelled")

    if not fused_path.exists():
        raise RuntimeError("fused.ply não encontrado! Rode o MVS primeiro.")

    point_cloud = o3d.io.read_point_cloud(fused_path)
    points_amount = len(point_cloud.points)

    # verifica cancelamento após carregar nuvem
    if cancel_check and cancel_check():
        raise Exception("cancelled")

    # calcula tamanho da cena com bounding box e diagonal
    bbox = point_cloud.get_axis_aligned_bounding_box()
    diag = np.linalg.norm(bbox.get_extent())

    max_points = 1005000
    downsampled_points_amount = points_amount

    # downsample da nuvem se necessário
    if points_amount > max_points:
        print("\nCalculando o melhor voxel para Downsampling...\n")

        best_voxel_size = get_best_voxel_size(point_cloud, diag, max_points, cancel_check)

        if cancel_check and cancel_check():
            raise Exception("cancelled")

        point_cloud = point_cloud.voxel_down_sample(best_voxel_size)
        downsampled_points_amount = len(point_cloud.points)

        print(f"\nVoxel size usado: {best_voxel_size:.8f}")
        print(f"Downsample: {downsampled_points_amount} pontos 3D\n")
    else:
        print(f"\nSem Downsample: {points_amount} pontos 3D\n")

    print("\nGerando a malha...\n")

    # verifica cancelamento antes de continuar
    if cancel_check and cancel_check():
        raise Exception("cancelled")

    # recalcula tamanho da cena após downsample
    bbox = point_cloud.get_axis_aligned_bounding_box()
    diag = np.linalg.norm(bbox.get_extent())

    # raios adaptativos
    radius_normals = diag * 0.01
    radius_outlier = diag * 0.02

    # remove outliers estatísticos
    point_cloud, ind = point_cloud.remove_statistical_outlier(
        nb_neighbors=20,
        std_ratio=2.0
    )

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    # remove outliers de raio
    point_cloud, ind = point_cloud.remove_radius_outlier(
        nb_points=16,
        radius=radius_outlier
    )

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    # estima normais
    point_cloud.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(
            radius=radius_normals,
            max_nn=30
        )
    )

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    point_cloud.orient_normals_consistent_tangent_plane(100)

    # gera a malha usando Poisson Surface Reconstruction
    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        point_cloud,
        depth=depth,
        scale=1.1,
        linear_fit=True
    )

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    # organiza as densidades para remover outliers da malha
    densities = np.asarray(densities)
    threshold = np.quantile(densities, 0.10)

    vertices_to_remove = densities < threshold
    mesh.remove_vertices_by_mask(vertices_to_remove)

    # mais camada de otimização da malha
    mesh.remove_duplicated_vertices()
    mesh.remove_duplicated_triangles()
    mesh.remove_degenerate_triangles()
    mesh.remove_non_manifold_edges()

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    # suavização taubin
    mesh = mesh.filter_smooth_taubin(number_of_iterations=3)

    # simplifica a malha
    triangles = len(mesh.triangles)
    target = min(triangles, 400000)

    mesh = mesh.simplify_quadric_decimation(target)

    mesh.remove_unreferenced_vertices()
    mesh.compute_vertex_normals()

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    # mantém apenas o maior cluster de triângulos para garantir uma malha conectada
    triangle_clusters, cluster_n_triangles, cluster_area = (
        mesh.cluster_connected_triangles()
    )

    triangle_clusters = np.asarray(triangle_clusters)
    cluster_n_triangles = np.asarray(cluster_n_triangles)

    largest_cluster = cluster_n_triangles.argmax()
    triangles_to_remove = triangle_clusters != largest_cluster

    mesh.remove_triangles_by_mask(triangles_to_remove)
    mesh.remove_unreferenced_vertices()
    mesh.remove_degenerate_triangles()
    mesh.remove_non_manifold_edges()

    # recalcula normais após remover clusters
    mesh.compute_vertex_normals()

    # remove vértices inválidos (NaN/Inf)
    vertices = np.asarray(mesh.vertices)
    valid = np.isfinite(vertices).all(axis=1)
    mesh.remove_vertices_by_mask(~valid)

    if len(mesh.triangles) == 0:
        raise RuntimeError("Malha vazia após reconstrução.")

    if invert_normals:
        print("\nInvertendo normais da malha...\n")
        triangles = np.asarray(mesh.triangles)
        mesh.triangles = o3d.utility.Vector3iVector(triangles[:, [0, 2, 1]])
        mesh.compute_vertex_normals()
        mesh.compute_triangle_normals()

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    end_time = time.time()
    dif_time = end_time - start_time

    # garante diretório e salva a malha
    output_path.parent.mkdir(parents=True, exist_ok=True)
    o3d.io.write_triangle_mesh(output_path, mesh)

    vertices_amount = len(mesh.vertices)
    triangles_amount = len(mesh.triangles)

    print()
    print("*"*50)
    print("Vertices:", vertices_amount)
    print("Triângulos:", triangles_amount)
    print("Pontos 3D (MVS):", points_amount)
    print("Pontos 3D (Downsample):", downsampled_points_amount)
    print("Tempo gasto (Meshing):", f"{dif_time/60:.2f}", "minutos")
    print("Mesh gerada e otimizada com sucesso!")
    print("*"*50)
    print()


# função para encontrar o melhor voxel a fim de reduzir a quantidade de pontos 3D da nuvem
def get_best_voxel_size(point_cloud, diag, max_points, cancel_check=None):

    initial_voxel_size = diag * 0.00005
    increaser = 1.05
    
    voxel_size = initial_voxel_size
    test_point_cloud = point_cloud.voxel_down_sample(voxel_size)

    while len(test_point_cloud.points) > max_points:

        if cancel_check and cancel_check():
            raise Exception("cancelled")

        voxel_size *= increaser
        test_point_cloud = point_cloud.voxel_down_sample(voxel_size)

    return voxel_size

#generate_mesh() # teste local