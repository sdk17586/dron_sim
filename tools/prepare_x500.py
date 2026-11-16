#!/usr/bin/env python3
"""Build offline X500 visuals from pinned PX4 SDF/DAE/STL sources (development only).

Requires trimesh, pycollada, Pillow, fast-simplification, shapely, mapbox-earcut and manifold3d.
The two detachable blade halves and screw fittings belong to the teaching demo.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import urllib.request
import xml.etree.ElementTree as ET
import numpy as np
import manifold3d as md
from PIL import Image
import trimesh
from prepare_go2 import clustered

COMMIT = 'e5997f455e33ec071c7c677fc59a65781de496a4'
REPOSITORY = 'https://github.com/PX4/PX4-gazebo-models'
MODEL = 'models/x500_base/'
FILES = ['LICENSE', MODEL+'LICENSE', MODEL+'model.sdf', 'models/x500/model.sdf'] + [MODEL+'meshes/'+n for n in
    ['NXP-HGD-CF.dae','5010Base.dae','5010Bell.dae','1345_prop_ccw.stl','1345_prop_cw.stl','CF.png']]
UNITS = 16
BASIS = np.array([[0,-1,0,0],[0,0,1,0],[-1,0,0,0],[0,0,0,1]], dtype=float)
BASIS[:3,:3] *= UNITS
IDS = {'rotor_0':'front-right','rotor_1':'rear-left','rotor_2':'front-left','rotor_3':'rear-right'}


def pose(text):
    numbers = [float(n) for n in (text or '0 0 0 0 0 0').split()]
    matrix = trimesh.transformations.euler_matrix(*numbers[3:]);matrix[:3,3]=numbers[:3]
    return matrix


def strike_blade(half):
    """Keep the mounting end and fracture a closed section of the original airfoil."""
    blade = half.copy()
    blade.visual = trimesh.visual.ColorVisuals()
    root = blade.slice_plane([-.82, 0, 0], [1, 0, 0])
    # The imported half has open seams at the hub and original tip. Both
    # temporary caps lie outside the visible fracture and are omitted on export.
    outer = blade.slice_plane([-.82, 0, 0], [-1, 0, 0], cap=True)
    outer = outer.slice_plane([-2.10, 0, 0], [1, 0, 0], cap=True)
    outer.merge_vertices(merge_tex=True, merge_norm=True)
    reverse_winding = outer.volume < 0
    outer.fix_normals()
    solid = md.Manifold(md.Mesh(np.float32(outer.vertices), np.uint32(outer.faces))).as_original()

    # Follow the chord from leading to trailing edge, mirroring CW/CCW blades.
    sign = 1 if blade.bounds[1, 2] > abs(blade.bounds[0, 2]) else -1
    edge = [(-1.94,-.5),(-1.91,.015),(-1.76,.048),(-1.82,.063),(-1.63,.092),
            (-1.71,.10),(-1.56,.122),(-1.73,.131),(-1.78,.154),(-1.67,.186),(-1.60,.5)]
    outline = np.array(edge + [(-3,.5),(-3,-.5)])
    outline[:,1] *= sign
    cutter = md.CrossSection([outline], md.FillRule.EvenOdd).extrude(2).rotate((90,0,0)).translate((0,1,0))
    nick = md.Manifold.sphere(1,12).scale((.12,.13,.055)).translate((-1.36,-.43,sign*.228))
    cutter = (cutter + nick).as_original()
    cut = (solid - cutter).to_mesh()
    skin, exposed = [], []
    for i, source in enumerate(cut.run_original_id):
        start, end = cut.run_index[i:i+2]
        faces = cut.tri_verts[start//3:end//3]
        vertices = cut.vert_properties[:,:3]
        if source == solid.original_id():
            cap = np.all(np.isclose(vertices[faces,0], -.82), axis=1)
            skin.extend(faces[~cap])
        else:
            exposed.extend(faces)
    if not skin or not exposed:
        raise ValueError('No fracture surface on the X500 propeller')
    # Swept, lifted lip; deformation falls to zero well before the mounting mark.
    vertices = np.array(cut.vert_properties[:,:3], copy=True)
    bend = np.clip((-vertices[:,0]-1.12)/.76, 0, 1)**2
    vertices[:,1] += bend*(.17 + sign*vertices[:,2]*.65)
    vertices[:,2] += sign*.055*bend
    pieces = []
    for faces in [skin, exposed]:
        mesh = trimesh.Trimesh(vertices, faces, process=False)
        mesh.remove_unreferenced_vertices()
        pieces.append(mesh)
    # The source skin winds inward. Match it again at the hub-side join
    # after the solid operation, which requires outward-facing triangles.
    if reverse_winding:
        pieces[0].invert()
    skin = trimesh.util.concatenate([root, pieces[0]])
    skin.merge_vertices(merge_norm=True, merge_tex=True, digits_vertex=6)
    return skin, pieces[1]


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--source-dir',type=Path,required=True)
    parser.add_argument('--output',type=Path,default=Path('assets/models/x500'))
    parser.add_argument('--download',action='store_true')
    args=parser.parse_args();args.source_dir.mkdir(parents=True,exist_ok=True);args.output.mkdir(parents=True,exist_ok=True)
    if args.download:
        def fetch(path):
            target=args.source_dir/path;target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(urllib.request.urlopen(f'https://raw.githubusercontent.com/PX4/PX4-gazebo-models/{COMMIT}/{path}',timeout=90).read())
        with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(fetch,FILES))
    root=ET.parse(args.source_dir/(MODEL+'model.sdf')).getroot()
    raw={}
    def meshes(uri):
        path=uri.replace('model://','models/')
        if path not in raw:
            scene=trimesh.load(args.source_dir/path,force='scene')
            raw[path]=[]
            for node in scene.graph.nodes_geometry:
                matrix,name=scene.graph[node];m=scene.geometry[name].copy();m.apply_transform(matrix)
                raw[path].append((name,m))
        return raw[path]
    results=[]
    for quality in ['detail','compatible']:
        scene=trimesh.Scene(base_frame='x500');faces=0
        for name in ['frame',*IDS.values()]:scene.graph.update(frame_from='x500',frame_to=name,matrix=np.eye(4))
        def add(mesh,name,parent,material=None,min_faces=18):
            nonlocal faces
            m=mesh.copy()
            if quality=='detail':m.merge_vertices(merge_tex=False,merge_norm=False,digits_vertex=7)
            if quality=='compatible':
                budget=max(min_faces,round(len(m.faces)*.014))
                m.merge_vertices(merge_tex=True,merge_norm=True)
                m=m.simplify_quadric_decimation(face_count=budget,aggression=5)
                if len(m.faces)>budget*1.5:m=clustered(mesh,budget)
            mat=material or getattr(mesh.visual,'material',None)
            if mat is None:mat=trimesh.visual.material.PBRMaterial(baseColorFactor=[38,44,49,255],metallicFactor=.25,roughnessFactor=.4)
            else:mat=mat.copy()
            if quality=='compatible':mat.baseColorTexture=None
            uv=getattr(m.visual,'uv',None) if quality=='detail' else None
            m.visual=trimesh.visual.TextureVisuals(uv=uv,material=mat)
            scene.add_geometry(m,node_name=name,geom_name=name,parent_node_name=parent)
            faces+=len(m.faces)
        for link in root.findall('.//link'):
            link_name=link.get('name');leg=IDS.get(link_name)
            if leg:
                transform=BASIS@pose(link.findtext('pose'));position=transform[:3,3]
                frame=np.eye(4);frame[:3,3]=position
                scene.graph.update(frame_from='x500',frame_to=leg,matrix=frame)
            for visual in link.findall('visual'):
                uri=visual.findtext('geometry/mesh/uri')
                if not uri:continue
                local=pose(visual.findtext('pose'))
                scale=visual.findtext('geometry/mesh/scale')
                if scale:local[:3,:3]=local[:3,:3]@np.diag([float(n) for n in scale.split()])
                converted=BASIS@local
                is_prop=uri.endswith('.stl')
                for index,(name,original) in enumerate(meshes(uri)):
                    m=original.copy();m.apply_transform(converted)
                    material=getattr(m.visual,'material',None)
                    if 'CarbonFiber' in name:
                        material=trimesh.visual.material.PBRMaterial(baseColorFactor=[100,110,118,255],metallicFactor=.45,roughnessFactor=.48,
                            baseColorTexture=Image.open(args.source_dir/(MODEL+'meshes/CF.png')) if quality=='detail' else None)
                    elif material is not None:
                        material=material.copy();material.metallicFactor=.45 if 'Metal' in name or 'Body' in name else .12
                        material.roughnessFactor=.38 if 'Metal' in name or 'Body' in name else .6
                    if is_prop:
                        # Split the fixed-pitch source propeller into two teaching pieces.
                        for i in [0,1]:
                            mask=m.triangles_center[:,0]<0
                            half=m.submesh([np.flatnonzero(mask if i==0 else ~mask)],append=True)
                            if i:half.apply_transform(trimesh.transformations.rotation_matrix(np.pi,[0,1,0]))
                            half.apply_translation([0,-.29,0])
                            add(half,f'blade_{leg}_{i}_good',leg)
                            skin, edge = strike_blade(half)
                            damaged = f'blade_{leg}_{i}_damaged'
                            scene.graph.update(frame_from=leg, frame_to=damaged, matrix=np.eye(4))
                            add(skin, damaged+'_skin', damaged, min_faces=210)
                            core = trimesh.visual.material.PBRMaterial(baseColorFactor=[146,151,149,255],
                                metallicFactor=.04, roughnessFactor=.92)
                            add(edge, damaged+'_fracture', damaged, core, min_faces=100)
                    else:
                        parent=leg or 'frame'
                        add(m,f'{visual.get("name")}_{index}_{name}',parent,material)
        data=scene.export(file_type='glb',include_normals=True)
        filename=f'x500-{quality}.glb';(args.output/filename).write_bytes(data)
        results.append({'file':filename,'triangles':faces,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
        print(filename,faces,'triangles',len(data),'bytes',flush=True)
    for source,target in [(MODEL+'LICENSE','LICENSE'),('LICENSE','PX4-LICENSE'),(MODEL+'model.sdf','model.sdf'),('models/x500/model.sdf','x500.sdf')]:
        (args.output/target).write_bytes((args.source_dir/source).read_bytes())
    (args.output/'source.json').write_text(json.dumps({'name':'PX4 X500','repository':REPOSITORY,'commit':COMMIT,
        'license':'BSD-3-Clause','units':UNITS,'generated':results,
        'files':[{'path':p,'url':f'https://raw.githubusercontent.com/PX4/PX4-gazebo-models/{COMMIT}/{p}',
                  'sha256':hashlib.sha256((args.source_dir/p).read_bytes()).hexdigest()} for p in FILES],
        'changes':['SDF visual poses and source DAE/STL geometry converted to Three.js coordinates',
                   'Carbon-fiber texture embedded in detailed GLB; compatible GLB uses plain materials',
                   'Detachable blade halves with a notched, twisted impact tip and exposed fracture surfaces',
                   'Viewer adds training battery/power/screw adapters; not an X500 service procedure']},ensure_ascii=False,indent=2)+'\n')


if __name__=='__main__':main()
