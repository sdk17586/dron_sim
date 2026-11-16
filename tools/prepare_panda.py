#!/usr/bin/env python3
"""Build offline Panda visuals and a bounded teaching trajectory from official ROS meshes.

Development only: trimesh, pycollada, numpy, scipy, fast-simplification, pillow.
No ROS, Python packages, asset server or Isaac Lab installation is needed at runtime.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import math
from pathlib import Path
import re
import urllib.request
import xml.etree.ElementTree as ET

import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
import trimesh

COMMIT = 'ddd2fffd9de44b02ad15b4bbb2bfa2cec4d60d98'
REPO = 'https://github.com/frankarobotics/franka_ros'
BASE = f'https://raw.githubusercontent.com/frankarobotics/franka_ros/{COMMIT}/'
NAMES = [f'link{i}' for i in range(8)] + ['hand', 'finger']
PATHS = ['LICENSE', 'NOTICE', 'franka_description/package.xml'] + [
    'franka_description/robots/common/' + n for n in
    ['franka_arm.xacro', 'franka_hand.xacro', 'franka_robot.xacro', 'utils.xacro']
] + ['franka_description/robots/panda/joint_limits.yaml'] + [
    f'franka_description/meshes/visual/{name}.dae' for name in NAMES]


def vec(value):
    # Only the pinned upstream numeric pi expressions are expanded, never evaluated.
    value = re.sub(r'\$\{(-?)pi(?:/(\d+))?\}',
                   lambda m: str((-1 if m[1] else 1) * math.pi / int(m[2] or 1)), value)
    return [float(v) for v in value.split()]


def matrix(xyz, rpy):
    result = np.eye(4)
    result[:3, :3] = Rotation.from_euler('xyz', rpy).as_matrix()
    result[:3, 3] = xyz
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source-dir', type=Path, default=Path('/tmp/aerolab-panda-source'))
    parser.add_argument('--output', type=Path, default=Path('assets/models/panda'))
    parser.add_argument('--download', action='store_true')
    args = parser.parse_args()
    args.source_dir.mkdir(parents=True, exist_ok=True)
    if args.download:
        def fetch(path):
            (args.source_dir / Path(path).name).write_bytes(urllib.request.urlopen(BASE + path, timeout=90).read())
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(fetch, PATHS))
    arm = ET.parse(args.source_dir / 'franka_arm.xacro').getroot()
    origins = []
    for i in range(1, 8):
        origin = arm.find(f'.//joint[@name="${{arm_id}}_joint{i}"]/origin')
        origins.append([vec(origin.get('xyz', '0 0 0')), vec(origin.get('rpy', '0 0 0'))])
    limits_text = (args.source_dir / 'joint_limits.yaml').read_text()
    limits = [[float(a), float(b)] for a, b in re.findall(r'lower:\s*([-\d.]+)\s+upper:\s*([-\d.]+)', limits_text)]
    assert len(limits) == 7
    fixed = matrix([0, 0, .107], [0, 0, -math.pi/4])
    tcp = matrix([0, 0, .1034], [0, 0, 0])
    def forward(q):
        t = np.eye(4)
        for (xyz, rpy), angle in zip(origins, q):
            t = t @ matrix(xyz, rpy) @ matrix([0, 0, 0], [0, 0, angle])
        return t @ fixed @ tcp
    seed = np.array([0., -.569, 0., -2.81, 0., 3.037, .741])
    down = Rotation.from_euler('xyz', [math.pi, 0, 0]).as_matrix()
    def solve(position, previous):
        def error(q):
            t = forward(q)
            return np.r_[5*(t[:3, 3]-position), Rotation.from_matrix(down.T @ t[:3, :3]).as_rotvec(), .002*(q-previous)]
        result = least_squares(error, previous, bounds=np.array(limits).T, max_nfev=1200,
                               ftol=1e-12, xtol=1e-12, gtol=1e-12).x
        assert np.linalg.norm(forward(result)[:3, 3]-position) < .001
        return result
    source, target = [.45, -.22, .025], [.45, .22, .025]
    positions = {'approach': [.45, -.22, .30], 'pick': source, 'lift': [.45, -.22, .30],
                 'transfer': [.45, .22, .30], 'place': target, 'retreat': [.45, .22, .30]}
    poses = {'home': seed.tolist()}
    for name, position in positions.items():
        seed = solve(np.array(position), seed)
        poses[name] = seed.tolist()
    # A horizontal transfer follows multiple Cartesian waypoints, rather than sweeping low.
    paths = {}
    seed = np.array(poses['lift'])
    paths['transfer'] = []
    for y in np.linspace(-.22, .22, 9)[1:]:
        seed = solve(np.array([.45, y, .30]), seed)
        paths['transfer'].append(seed.tolist())
    poses['transfer'] = paths['transfer'][-1]
    for name in ['place', 'retreat']:
        seed = solve(np.array(positions[name]), seed); poses[name] = seed.tolist()
    args.output.mkdir(parents=True, exist_ok=True)
    generated = []
    for quality, budget in [('detail', 5000), ('compatible', 180)]:
        scene = trimesh.Scene(base_frame='panda')
        scene.graph.update(frame_from='panda', frame_to='panda_link0', matrix=np.eye(4))
        for i, (xyz, rpy) in enumerate(origins, 1):
            scene.graph.update(frame_from=f'panda_link{i-1}', frame_to=f'panda_link{i}', matrix=matrix(xyz,rpy))
        scene.graph.update(frame_from='panda_link7', frame_to='panda_hand', matrix=fixed)
        for side in ['left', 'right']:
            scene.graph.update(frame_from='panda_hand', frame_to=f'panda_{side}finger', matrix=matrix([0,0,.0584],[0,0,0]))
        faces = 0
        for name in NAMES:
            mesh_scene = trimesh.load(args.source_dir / (name+'.dae'), force='scene')
            total = sum(len(m.faces) for m in mesh_scene.geometry.values())
            for index, node in enumerate(mesh_scene.graph.nodes_geometry):
                transform, geometry = mesh_scene.graph[node]
                mesh = mesh_scene.geometry[geometry].copy(); mesh.apply_transform(transform)
                color = np.array(mesh.visual.material.main_color)
                # DAE has split vertices at normal/UV seams. Weld before decimation so
                # simplifying connected surfaces does not discard isolated triangles.
                mesh.merge_vertices(merge_tex=True, merge_norm=True, digits_vertex=6)
                count = max(12, round(budget * len(mesh.faces) / total))
                if len(mesh.faces) > count:
                    mesh = mesh.simplify_quadric_decimation(face_count=count)
                mesh.visual = trimesh.visual.TextureVisuals(material=trimesh.visual.material.PBRMaterial(
                    baseColorFactor=color, metallicFactor=.18, roughnessFactor=.42))
                links = [f'panda_{side}finger' for side in ['left','right']] if name=='finger' else ['panda_'+name]
                for link in links:
                    part = mesh.copy()
                    if link=='panda_rightfinger': part.apply_transform(matrix([0,0,0],[0,0,math.pi]))
                    key = f'{link}_visual_{index}'
                    scene.add_geometry(part, geom_name=key, node_name=key, parent_node_name=link)
                    faces += len(part.faces)
        data = scene.export(file_type='glb', include_normals=True)
        file = args.output / f'panda-{quality}.glb'; file.write_bytes(data)
        generated.append({'file':file.name,'triangles':faces,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
        print(file, faces, 'triangles', len(data), 'bytes', flush=True)
    for name in ['LICENSE', 'NOTICE', 'package.xml','franka_arm.xacro','franka_hand.xacro','franka_robot.xacro','utils.xacro','joint_limits.yaml']:
        (args.output/name).write_bytes((args.source_dir/name).read_bytes())
    rig = {'origins':origins,'limits':limits,'poses':poses,'paths':paths,'source':source,'target':target}
    Path('src/content/panda-rig.js').write_text('// Generated by tools/prepare_panda.py from pinned official Franka ROS descriptions.\nexport const PANDA_RIG = '+json.dumps(rig,indent=2)+';\n')
    metadata = {'name':'Franka Emika Panda','repository':REPO,'commit':COMMIT,'license':'Apache-2.0',
        'isaacLabConfiguration':'https://github.com/isaac-sim/IsaacLab/blob/main/source/isaaclab_assets/isaaclab_assets/robots/franka.py',
        'files':[{'path':p,'url':BASE+p,'sha256':hashlib.sha256((args.source_dir/Path(p).name).read_bytes()).hexdigest()} for p in PATHS],
        'generated':generated,'changes':['Visuals reduced and DAE materials converted to GLB; joint origins preserved',
            'ROS Z-up converted to Y-up by viewer; fingers animated symmetrically',
            'Bounded pick-and-place poses generated by IK for this fictional training workstation',
            'Browser animation only, not Isaac Lab physics or a manufacturer operation procedure']}
    (args.output/'source.json').write_text(json.dumps(metadata,indent=2)+'\n')


if __name__ == '__main__': main()
