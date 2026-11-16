"""Build the gripper's training-only impact damage from the bundled Franka meshes.

Requires trimesh, manifold3d, networkx and numpy at build time. Dimensions below
are in millimetres in the imported housing and left finger coordinate systems.
"""
from pathlib import Path

import manifold3d as md
import networkx as nx
import numpy as np
import trimesh

ASSETS = Path(__file__).resolve().parents[1] / 'assets/models/panda'


def solid(vertices, faces, **relations):
    mesh = md.Mesh(np.asarray(vertices, dtype=np.float32),
                   np.asarray(faces, dtype=np.uint32), **relations)
    result = md.Manifold(mesh)
    if result.status() != md.Error.NoError or result.is_empty():
        raise ValueError(f'Invalid cutting solid: {result.status()}')
    return result


def shell_with_temporary_caps(mesh):
    # The CAD shell is open where other materials meet. Close its original seams
    # for the boolean, then omit those faces from the exported surface.
    mesh = max(mesh.split(only_watertight=False), key=lambda piece: len(piece.faces))
    edge_counts = np.bincount(mesh.edges_unique_inverse)[mesh.edges_unique_inverse]
    edges = nx.DiGraph()
    edges.add_edges_from(mesh.edges[edge_counts == 1])
    vertices, faces = mesh.vertices.tolist(), mesh.faces.tolist()
    for loop in nx.simple_cycles(edges):
        center = len(vertices)
        vertices.append(mesh.vertices[loop].mean(axis=0))
        faces.extend((b, a, center) for a, b in zip(loop, loop[1:] + loop[:1]))
    outer_id = md.Manifold.reserve_ids(2)
    result = solid(vertices, faces, run_index=np.uint32([0, mesh.faces.size, len(faces)*3]),
                   run_original_id=np.uint32([outer_id, outer_id + 1]))
    return result, outer_id


def groove(path):
    # Each station gives y, z, surface half-width and depth at the impact.
    # A triangular cross section leaves recessed, faceted walls and a tapered tip.
    vertices, faces = [], []
    for y, z, width, depth in path:
        vertices.extend([(19.2, y-width, z), (19.2, y+width, z), (18.3-depth, y, z)])
    for i in range(len(path)-1):
        for side in range(3):
            a, b = 3*i+side, 3*i+(side+1)%3
            faces.extend([(a,b,b+3), (a,b+3,a+3)])
    faces.extend([(0,2,1), tuple(range(len(vertices)-3,len(vertices)))])
    mesh = trimesh.Trimesh(vertices, faces)
    mesh.fix_normals()
    return solid(mesh.vertices, mesh.faces).as_original()


def subtract(mesh, cutter, outside_id):
    result = (mesh - cutter).to_mesh()
    source, exposed = [], []
    for index, original_id in enumerate(result.run_original_id):
        first, last = result.run_index[index:index+2]
        triangles = result.tri_verts[first//3:last//3]
        if original_id == outside_id:
            source.extend(triangles)
        elif original_id == cutter.original_id():
            exposed.extend(triangles)
    if not source or not exposed:
        raise ValueError('Damage does not intersect the part')
    surfaces = []
    for faces in [source, exposed]:
        part = trimesh.Trimesh(result.vert_properties[:,:3], faces, process=False)
        part.remove_unreferenced_vertices()
        surfaces.append(part)
    return surfaces


def bend(vertices):
    # Preserve the slide in the housing. Bend the shank through a short rounded
    # hinge, then carry the distal steel and rubber together as one rigid tip.
    x, y, z = vertices.T.copy()
    start, span, angle = 15., 11., np.radians(39.)
    along = np.clip(z-start, 0, span)
    theta = angle*along/span
    radius = span/angle
    extension = np.maximum(z-start-span, 0)
    offset_y = radius*(1-np.cos(theta)) + extension*np.sin(theta)
    offset_z = start + radius*np.sin(theta) + extension*np.cos(theta)
    return np.column_stack((x, 18+offset_y+(y-18)*np.cos(theta),
                            np.minimum(z, start)-start+offset_z-(y-18)*np.sin(theta)))


def build():
    model = trimesh.load(ASSETS/'panda-detail.glb', force='scene')
    scene = trimesh.Scene()

    def source(name):
        mesh = model.geometry[name].copy()
        mesh.apply_scale(1000)
        mesh.update_faces(mesh.unique_faces() & mesh.nondegenerate_faces())
        return mesh

    def add(name, mesh, material, *, flat=False):
        if flat:
            mesh = trimesh.Trimesh(mesh.vertices[mesh.faces].reshape(-1, 3),
                                   np.arange(mesh.faces.size).reshape(-1, 3), process=False)
        mesh.apply_scale(.001)
        mesh.visual = trimesh.visual.TextureVisuals(material=material)
        scene.add_geometry(mesh, geom_name=name, node_name=name)

    def material(color, metalness, roughness):
        return trimesh.visual.material.PBRMaterial(baseColorFactor=color, metallicFactor=metalness,
                                                  roughnessFactor=roughness, doubleSided=True)

    shell = source('panda_hand_visual_1')
    shell_solid, shell_id = shell_with_temporary_caps(shell)
    tear = groove([(36,31,.12,1.4),(40,36,.6,2.2),(41,39,.55,2.4),(47,43,1.1,3.2),
                   (45.5,45,1.25,3.5),(52,50,1.35,3.8),(55,52,1.7,4.2),
                   (54.3,54,1.6,4.7),(60.5,58.5,2.7,5.3),(63,61,4.1,7.3),
                   (62,63,4.9,8.2),(65,68,6,8.8)])
    fork = groove([(66,45,.1,1.25),(64.2,48,.35,1.8),(65,50,.45,2),
                   (61.2,53.4,.7,2.7),(61.9,55,.75,3.1),(59.8,58.8,1,3.5)])
    # An oblique impact chips the rounded lip at the mouth of the crack.
    chip = md.Manifold.sphere(1, 10).scale((4.8,9.3,4.7)).rotate((-17,0,-12)).translate((18.6,62.8,63.4))
    casing, fracture = subtract(shell_solid, (tear + fork + chip).as_original(), shell_id)
    add('impact_shell', casing, shell.visual.material)
    add('impact_fracture', fracture, material([80,84,86,255], .16, .91), flat=True)

    jaw = source('panda_leftfinger_visual_1')
    jaw.vertices = bend(jaw.vertices)
    add('impact_jaw', jaw, jaw.visual.material)
    pad = source('panda_leftfinger_visual_0')
    original = solid(pad.vertices, pad.faces).as_original()
    # A missing diagonal corner reveals the end of the steel backing.
    outline = [(-14,58),(-4,52),(0,48),(2,48.5),(7,43),(15,40),(15,65),(-14,65)]
    corner = md.CrossSection([np.array(outline)]).extrude(30)
    corner = corner.rotate((90,0,0)).translate((0,20,0)).warp(
        lambda p: (p[0], p[1], p[2]+p[1]*.14)).as_original()
    skin, torn = subtract(original, corner, original.original_id())
    for name, part, color in [('impact_pad',skin,[65,68,68,255]),('impact_pad_tear',torn,[43,44,45,255])]:
        part.vertices = bend(part.vertices)
        add(name,part,material(color,.02,.91), flat=name.endswith('tear'))
    (ASSETS/'gripper-impact.glb').write_bytes(scene.export(file_type='glb',include_normals=True))


if __name__ == '__main__':
    build()
