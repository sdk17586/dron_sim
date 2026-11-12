#!/usr/bin/env python3
"""Convert the pinned Unitree ROS Go2 URDF visuals into offline GLB assets.

Development only: pip install trimesh pycollada fast-simplification numpy scipy.
Run with --source-dir pointing to the downloaded DAE/URDF files, or --download.
The browser and start.sh do not run this tool or need these dependencies.
"""
import argparse
import hashlib
import json
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import urllib.request
import xml.etree.ElementTree as ET
import numpy as np
import trimesh

COMMIT = '725b59b6de39a26c425632120c89f23c49a36f1e'
REPOSITORY = 'https://github.com/unitreerobotics/unitree_ros'
NAMES = ['base', 'hip', 'thigh', 'thigh_mirror', 'calf', 'calf_mirror', 'foot']
PATHS = ['LICENSE', 'robots/go2_description/urdf/go2_description.urdf'] + ['robots/go2_description/dae/'+n+'.dae' for n in NAMES]


def origin(element):
    if element is None:
        return np.eye(4)
    xyz = [float(n) for n in element.get('xyz', '0 0 0').split()]
    rpy = [float(n) for n in element.get('rpy', '0 0 0').split()]
    matrix = trimesh.transformations.euler_matrix(*rpy, axes='sxyz')
    matrix[:3, 3] = xyz
    return matrix


def clustered(mesh, target):
    spacing = max(mesh.extents) / 120
    for _ in range(30):
        _, inverse = np.unique(np.floor(mesh.vertices / spacing).astype(np.int64), axis=0, return_inverse=True)
        count = np.bincount(inverse)
        vertices = np.column_stack([np.bincount(inverse, weights=mesh.vertices[:, i]) / count for i in range(3)])
        faces = inverse[mesh.faces]
        faces = faces[(faces[:, 0] != faces[:, 1]) & (faces[:, 1] != faces[:, 2]) & (faces[:, 0] != faces[:, 2])]
        _, keep = np.unique(np.sort(faces, axis=1), axis=0, return_index=True)
        result = trimesh.Trimesh(vertices=vertices, faces=faces[keep], process=False)
        result.remove_unreferenced_vertices()
        if len(result.faces) <= target or len(result.faces) < 16:
            return result
        spacing *= 1.25
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=Path('assets/models/go2'))
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args(); args.source_dir.mkdir(parents=True, exist_ok=True)
    if args.download:
        def fetch(path):
            url = f'https://raw.githubusercontent.com/unitreerobotics/unitree_ros/{COMMIT}/{path}'
            (args.source_dir/Path(path).name).write_bytes(urllib.request.urlopen(url, timeout=90).read())
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(fetch, PATHS))
    root = ET.parse(args.source_dir/'go2_description.urdf').getroot()
    meshes = {}
    for name in NAMES:
        source = trimesh.load(args.source_dir/(name+'.dae'), force='scene')
        meshes[name] = []
        for node in source.graph.nodes_geometry:
            transform, geometry = source.graph[node]
            mesh = source.geometry[geometry].copy(); mesh.apply_transform(transform)
            meshes[name].append(mesh)
    args.output.mkdir(parents=True, exist_ok=True)
    generated = []
    for quality, budgets in [('detail', dict(base=8000, hip=1400, thigh=1800, calf=600, foot=160)),
                             ('compatible', dict(base=650, hip=100, thigh=160, calf=70, foot=35))]:
        scene = trimesh.Scene(base_frame='go2')
        for link in root.findall('link'):
            scene.graph.update(frame_from='go2', frame_to=link.get('name'), matrix=np.eye(4))
        for joint in root.findall('joint'):
            scene.graph.update(frame_from=joint.find('parent').get('link'), frame_to=joint.find('child').get('link'), matrix=origin(joint.find('origin')))
        faces = 0
        for link in root.findall('link'):
            link_name = link.get('name')
            for visual in link.findall('visual'):
                mesh_element = visual.find('geometry/mesh')
                if mesh_element is None:
                    continue
                name = Path(mesh_element.get('filename')).stem
                budget = budgets[name.replace('_mirror', '')]
                total = sum(len(m.faces) for m in meshes[name])
                for index, original in enumerate(meshes[name]):
                    target = max(16, round(budget * len(original.faces) / total))
                    material = original.visual.material.copy()
                    mesh = original.copy()
                    mesh.merge_vertices(merge_tex=True, merge_norm=True, digits_vertex=6)
                    mesh.update_faces(mesh.nondegenerate_faces())
                    if quality == 'compatible':
                        mesh = mesh.simplify_quadric_decimation(face_count=min(len(mesh.faces), target), aggression=5)
                    if quality == 'compatible' and len(mesh.faces) > target * 1.25:
                        mesh = clustered(original, target)
                    # No textures are referenced by these upstream visuals.
                    material.metallicFactor = .18; material.roughnessFactor = .52
                    mesh.visual = trimesh.visual.TextureVisuals(material=material)
                    parts = [('shell', mesh, link_name, origin(visual.find('origin')))]
                    if name.startswith('thigh'):
                        mask = mesh.triangles_center[:, 2] < -.158
                        if mask.any() and (~mask).any():
                            module = mesh.submesh([np.flatnonzero(mask)], append=True)
                            shell = mesh.submesh([np.flatnonzero(~mask)], append=True)
                            module.apply_translation([0, 0, .213])
                            module_name = link_name.split('_')[0]+'_module'
                            matrix = np.eye(4); matrix[2, 3] = -.213
                            scene.graph.update(frame_from=link_name, frame_to=module_name, matrix=matrix)
                            parts = [('shell', shell, link_name, origin(visual.find('origin'))), ('module', module, module_name, np.eye(4))]
                    for kind, part, parent, transform in parts:
                        geometry = f'{link_name}_{index}_{kind}'
                        scene.add_geometry(part, geom_name=geometry, node_name=geometry, parent_node_name=parent, transform=transform)
                        faces += len(part.faces)
        data = scene.export(file_type='glb', include_normals=True)
        destination = args.output/f'go2-{quality}.glb'; destination.write_bytes(data)
        generated.append({'file':destination.name, 'triangles':faces, 'bytes':len(data), 'sha256':hashlib.sha256(data).hexdigest()})
        print(destination, faces, 'triangles', len(data), 'bytes', flush=True)
    for name in ['LICENSE', 'go2_description.urdf']:
        (args.output/name).write_bytes((args.source_dir/name).read_bytes())
    metadata = {'name':'Unitree Go2', 'repository':REPOSITORY, 'commit':COMMIT, 'license':'BSD-3-Clause',
                'files':[{'path':path, 'url':f'https://raw.githubusercontent.com/unitreerobotics/unitree_ros/{COMMIT}/{path}',
                          'sha256':hashlib.sha256((args.source_dir/Path(path).name).read_bytes()).hexdigest()} for path in PATHS],
                'generated':generated, 'changes':['URDF link hierarchy and visual origins retained; ROS frame converted by the viewer',
                    'Detailed geometry retained; compatible mesh clustered by material; no textures or network dependencies', 'Distal thigh faces separated as fictional removable teaching module',
                    'Presentation stance and gait are not a Unitree controller or service procedure']}
    (args.output/'source.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2)+'\n')


if __name__ == '__main__': main()
