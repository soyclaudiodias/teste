# testando a visualização da malha gerada

import open3d as o3d

mesh = o3d.io.read_triangle_mesh("../static/models/mesh.ply")

o3d.visualization.draw_geometries([mesh])