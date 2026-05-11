import open3d as o3d
from pathlib import Path
import numpy as np
import time


def generate_mesh(
    depth=10,
    invert_normals=False,
    colmap_path="colmap",
    output_path=None,
    cancel_check=None
):
    start_time = time.time()

    print("\n[Meshing]\n")

    colmap_path = Path(colmap_path)
    fused_path = colmap_path / "dense" / "fused.ply"

    if output_path is None:
        output_path = Path("static") / "models" / "mesh.ply"
    else:
        output_path = Path(output_path)

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    if not fused_path.exists():
        raise RuntimeError(f"fused.ply não encontrado em: {fused_path}")

    point_cloud = o3d.io.read_point_cloud(str(fused_path))
    points_amount = len(point_cloud.points)

    if points_amount == 0:
        raise RuntimeError("A nuvem de pontos está vazia.")

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    bbox = point_cloud.get_axis_aligned_bounding_box()
    diag = np.linalg.norm(bbox.get_extent())

    max_points = 1005000
    downsampled_points_amount = points_amount

    if points_amount > max_points:
        print("\nCalculando o melhor voxel para Downsampling...\n")

        best_voxel_size = get_best_voxel_size(
            point_cloud,
            diag,
            max_points,
            cancel_check
        )

        if cancel_check and cancel_check():
            raise Exception("cancelled")

        point_cloud = point_cloud.voxel_down_sample(best_voxel_size)
        downsampled_points_amount = len(point_cloud.points)

        print(f"\nVoxel size usado: {best_voxel_size:.8f}")
        print(f"Downsample: {downsampled_points_amount} pontos 3D\n")
    else:
        print(f"\nSem Downsample: {points_amount} pontos 3D\n")

    print("\nGerando a malha...\n")

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    bbox = point_cloud.get_axis_aligned_bounding_box()
    diag = np.linalg.norm(bbox.get_extent())

    radius_normals = diag * 0.01
    radius_outlier = diag * 0.02

    point_cloud, ind = point_cloud.remove_statistical_outlier(
        nb_neighbors=20,
        std_ratio=2.0
    )

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    point_cloud, ind = point_cloud.remove_radius_outlier(
        nb_points=16,
        radius=radius_outlier
    )

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    point_cloud.estimate_normals(
        search_param=o3d.geometry.KDTreeSearchParamHybrid(
            radius=radius_normals,
            max_nn=30
        )
    )

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    point_cloud.orient_normals_consistent_tangent_plane(100)

    mesh, densities = o3d.geometry.TriangleMesh.create_from_point_cloud_poisson(
        point_cloud,
        depth=depth,
        scale=1.1,
        linear_fit=True
    )

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    densities = np.asarray(densities)
    threshold = np.quantile(densities, 0.10)

    vertices_to_remove = densities < threshold
    mesh.remove_vertices_by_mask(vertices_to_remove)

    mesh.remove_duplicated_vertices()
    mesh.remove_duplicated_triangles()
    mesh.remove_degenerate_triangles()
    mesh.remove_non_manifold_edges()

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    mesh = mesh.filter_smooth_taubin(number_of_iterations=3)

    triangles = len(mesh.triangles)
    target = min(triangles, 400000)

    mesh = mesh.simplify_quadric_decimation(target)

    mesh.remove_unreferenced_vertices()
    mesh.compute_vertex_normals()

    if cancel_check and cancel_check():
        raise Exception("cancelled")

    triangle_clusters, cluster_n_triangles, cluster_area = (
        mesh.cluster_connected_triangles()
    )

    triangle_clusters = np.asarray(triangle_clusters)
    cluster_n_triangles = np.asarray(cluster_n_triangles)

    if len(cluster_n_triangles) > 0:
        largest_cluster = cluster_n_triangles.argmax()
        triangles_to_remove = triangle_clusters != largest_cluster

        mesh.remove_triangles_by_mask(triangles_to_remove)
        mesh.remove_unreferenced_vertices()
        mesh.remove_degenerate_triangles()
        mesh.remove_non_manifold_edges()

    mesh.compute_vertex_normals()

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

    output_path.parent.mkdir(parents=True, exist_ok=True)
    o3d.io.write_triangle_mesh(str(output_path), mesh)

    end_time = time.time()
    dif_time = end_time - start_time

    vertices_amount = len(mesh.vertices)
    triangles_amount = len(mesh.triangles)

    print()
    print("*" * 50)
    print("Vertices:", vertices_amount)
    print("Triângulos:", triangles_amount)
    print("Pontos 3D (MVS):", points_amount)
    print("Pontos 3D (Downsample):", downsampled_points_amount)
    print("Tempo gasto (Meshing):", f"{dif_time / 60:.2f}", "minutos")
    print("Mesh gerada e otimizada com sucesso!")
    print("Arquivo salvo em:", output_path)
    print("*" * 50)
    print()


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
