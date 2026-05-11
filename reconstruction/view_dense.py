# testando a visualização da nuvem de pontos densa

import open3d as o3d

point_cloud = o3d.io.read_point_cloud("../colmap/dense/fused.ply")

print(point_cloud)
print("\nPontos 3D:", len(point_cloud.points), "\n")

o3d.visualization.draw_geometries([point_cloud])