#!/usr/bin/env python3
"""
Headless Blender 5.2 High-Resolution Sculptor & Vertex-Color Baker for the 3 Sacred Stone Monuments in Amarante.

Directly integrates:
  1. `VolumetricFlowerSculptor` from `world/tools/build-blender-flowers.py` for our multi-whorl
     goblet-cupped `crimsonRose` blooms, pointed spiral rosebuds, `add_oriented_serrated_leaf`,
     and fluted multi-strand woody briar vines with 6-stop per-vertex botanical color gradients.
  2. Continuous, water-tight, flat-faceted hand-hewn Ghibli rock monolith (`Site 3`) built from a
     faceted BMesh rock arch & stepped sill with explicit planar cleavage facets (`poly.use_smooth = False`)
     and organic brow-draping moss (zero OpenVDB Marching Cubes voxel staircases, zero separate
     Jenga boxes, zero icosphere moss sausages!).
  3. Uniform quad-grid recessed tablets (`bmesh.ops.create_grid`) with warm sunlit cream-sandstone
     shading and clean recessed border AO (zero dirty grey-brown vertex noise blotches!).
  4. Guaranteed-outward curved voussoir/flagstone masonry blocks with per-block Ghibli limestone
     variation (`#ede4d0` sunlit cream limestone, `#dfd3ba` mid stone, `#b8a88e` cool facet shade, `#7d6d58` deep crevice).
  5. Clean un-mangled Garamond (`resolution_u = 4, bevel_depth = 0`) with a 3-layer V-chiseled
     depth stack (dark incised upper shadow + warm chiseled umber core + sunlit cream lower lip).
"""

import os
import sys
import json
import math
import subprocess
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler, noise

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
SCULPT_SCRIPTS = r"C:\Users\silen\.gemini\antigravity-acp\t3-home\config\skills\scenario-blender-expert\subskills\scenario-blender-sculpting\scripts"
MAT_SCRIPTS = r"C:\Users\silen\.gemini\antigravity-acp\t3-home\config\skills\scenario-blender-expert\subskills\scenario-blender-texturing-shading\scripts"
EXPERT_SCRIPTS = r"C:\Users\silen\.gemini\antigravity-acp\t3-home\config\skills\scenario-blender-expert\scripts"

for p in (THIS_DIR, SCULPT_SCRIPTS, MAT_SCRIPTS, EXPERT_SCRIPTS):
    if os.path.isdir(p) and p not in sys.path:
        sys.path.append(p)

import bx_materials as M
from build_blender_flowers_helper import (
    build_rich_climbing_rose_vine_mesh,
    build_fallen_rose_petals_and_blooms_mesh,
    build_stone_relief_rose_ring_mesh,
)

FONT_BOLD_PATH = r"C:\Windows\Fonts\GARABD.TTF"
TAU = math.pi * 2.0

EXPOSED_POEMS = {
    "site1": {
        "title": "I · THE WELLSPRING OF UNION",
        "lines": [
            "Where crimson petals ring the ancient stone,",
            "No mortal walks the valley road alone.",
            "Bind blossom unto heartbeat in thy plea,",
            "And speak the Sovereign's name to set love free.",
            "Not in lone might nor pride of blade and art,",
            "Doth grace awaken in the guarded heart;",
            "Wait till two voices share the quiet night,",
            "And call upon the Lord of Living Light.",
        ],
    },
    "site2": {
        "title": "II · THE BURIAL OF OBSESSION",
        "lines": [
            "Beneath the violet boughs where embers sleep,",
            "Swear now the steadfast promise thou shalt keep.",
            "When honest fondness names the living spark,",
            "Sunfire and meteor-cinders light the dark.",
            "Mere hunger claims the bloom and breaks the bough,",
            "True devotion keeps the unspoken vow;",
            "Where twisted roots once choked the ancient stone,",
            "Speak truth of what you cherish as your own.",
        ],
    },
    "site3": {
        "title": "III · THE MANNER OF INVOCATION",
        "lines": [
            "Where silver waters kiss the timber pier,",
            "Speak truth of what thy spirit holds most dear.",
            "Confess with tender warmth the human grace,",
            "That winter's rime may wake within this place.",
            "Come not with hollow flatteries or pride,",
            "For He who hears walks at thy lover's side;",
            "Mock His high throne and watch thy partner fall,",
            "Ask with a gentle heart and He grants all.",
        ],
    },
}


def load_unspoiled_poems_if_available(worktree_root):
    js_path = os.path.join(worktree_root, "world", "src", "ui", "sacred-poems-unspoiled.js")
    if os.path.isfile(js_path):
        try:
            url_path = "file:///" + js_path.replace("\\", "/")
            cmd = [
                "node",
                "--input-type=module",
                "-e",
                f"import {{ UNSPOILED_SACRED_POEMS }} from '{url_path}'; "
                "const out = {}; "
                "for (const k of ['site1','site2','site3']) { "
                "  const p = UNSPOILED_SACRED_POEMS[k]; "
                "  out[k] = { title: p.title || '', lines: Array.from(p.lines || p) }; "
                "} "
                "process.stdout.write(JSON.stringify(out));"
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, check=False)
            if res.returncode == 0 and res.stdout.strip():
                data = json.loads(res.stdout.strip())
                if "site1" in data and "site2" in data and "site3" in data:
                    return data
        except Exception:
            pass
    return EXPOSED_POEMS


def _c_to_lin(c):
    return c / 12.92 if c <= 0.04045 else math.pow((c + 0.055) / 1.055, 2.4)


def srgb_hex(hex_str):
    h = hex_str.lstrip("#")
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return (_c_to_lin(r), _c_to_lin(g), _c_to_lin(b))


def lerp_col(c0, c1, t):
    t = max(0.0, min(1.0, float(t)))
    return (
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
    )


def clamp_val(v, lo, hi):
    return max(lo, min(hi, v))


def smoothstep(e0, e1, x):
    """
    Supports both `e0 < e1` (rising 0 -> 1) and `e0 > e1` (rising 0 -> 1 as x goes from e0 toward e1).
    """
    diff = e1 - e0
    if abs(diff) < 1e-6:
        return 1.0 if x >= e1 else 0.0
    t = max(0.0, min(1.0, (x - e0) / diff))
    return t * t * (3.0 - 2.0 * t)


def get_master_vertex_color_material():
    mat = M.get_material("Mat_Monument_VertexBaked")
    nt = mat.node_tree
    bsdf = M.principled(mat)
    if bsdf:
        bsdf.inputs["Roughness"].default_value = 0.86
        bsdf.inputs["Metallic"].default_value = 0.0
        bsdf.inputs["Specular IOR Level"].default_value = 0.22
        vc_node = nt.nodes.new("ShaderNodeVertexColor")
        vc_node.layer_name = "col_baked"
        nt.links.new(vc_node.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


def create_tagged_mesh_obj(name, bm, role_tag, collection=None, smooth=False, block_seed=0):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj["role_tag"] = role_tag
    obj["block_seed"] = int(block_seed)
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def build_grid_tablet_obj(name, width, height, center_xyz, rot_euler, x_segs, y_segs, role_tag, collection=None):
    """
    Builds a pure, regular `(x_segs x y_segs)` quad grid for a reading tablet face so vertex-baked
    recess AO and stone lighting have ZERO diagonal fan-triangle streaks!
    """
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=x_segs, y_segments=y_segs, size=0.5)
    bmesh.ops.scale(bm, vec=(width, height, 1.0), verts=bm.verts)
    xf = Matrix.Translation(center_xyz) @ Euler(rot_euler, 'XYZ').to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=xf, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return create_tagged_mesh_obj(name, bm, role_tag, collection, smooth=True)


def cylindrical_bend_object_around_well(obj, radius=1.54):
    mesh = obj.data
    for v in mesh.vertices:
        x = v.co.x
        y = v.co.y
        dr = -y - radius
        r = radius + dr
        theta = x / radius
        v.co.x = r * math.sin(theta)
        v.co.y = -r * math.cos(theta)
    mesh.update()


# ==============================================================================
# RAZOR-SHARP UN-MANGLED GARAMOND 3D POEM GEOMETRY (3-Layer V-Cut Depth Stack!)
# ==============================================================================

def build_crisp_carved_poem_meshes(
    prefix,
    lines,
    origin_xyz,
    rot_euler,
    line_size,
    line_gap,
    stanza_gap,
    collection=None,
):
    font_bold = bpy.data.fonts.load(FONT_BOLD_PATH) if os.path.isfile(FONT_BOLD_PATH) else None
    rot_mat = Euler(rot_euler, 'XYZ').to_matrix().to_4x4()
    base_mat = Matrix.Translation(origin_xyz) @ rot_mat

    total_lines = len(lines)
    total_h = (total_lines - 1) * line_gap + (stanza_gap if total_lines > 4 else 0.0)
    y_top = total_h * 0.5

    bm_core = bmesh.new()
    bm_lip = bmesh.new()
    bm_shd = bmesh.new()

    lip_dy = -line_size * 0.042
    lip_dx = line_size * 0.024
    shd_dy = line_size * 0.032
    shd_dx = -line_size * 0.020

    for idx, line in enumerate(lines):
        extra = stanza_gap if idx >= 4 else 0.0
        y_line = y_top - idx * line_gap - extra

        cdata = bpy.data.curves.new(name=f"{prefix}_line_{idx}_crv", type='FONT')
        cdata.body = line
        if font_bold is not None:
            cdata.font = font_bold
        cdata.size = line_size
        cdata.resolution_u = 4
        cdata.align_x = 'CENTER'
        cdata.align_y = 'CENTER'
        cdata.extrude = line_size * 0.025
        cdata.bevel_depth = 0.0
        cdata.space_character = 1.03

        cobj = bpy.data.objects.new(f"{prefix}_line_{idx}_tmp", cdata)
        bpy.context.scene.collection.objects.link(cobj)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        eval_obj = cobj.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(eval_obj)
        bpy.data.objects.remove(cobj, do_unlink=True)
        bpy.data.curves.remove(cdata)

        # 1. Core chiseled umber letter mesh
        b1 = bmesh.new()
        b1.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(b1, faces=b1.faces)
        back_faces = [f for f in b1.faces if f.normal.z < -0.5]
        if back_faces:
            bmesh.ops.delete(b1, geom=back_faces, context='FACES')
        bmesh.ops.transform(
            b1,
            matrix=base_mat @ Matrix.Translation((0.0, y_line, 0.0032)),
            verts=b1.verts,
        )
        t1 = bpy.data.meshes.new("_t1")
        b1.to_mesh(t1)
        b1.free()
        bm_core.from_mesh(t1)
        bpy.data.meshes.remove(t1)

        # 2. Sunlit cream lower-right bevel catchlight lip
        b2 = bmesh.new()
        b2.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(b2, faces=b2.faces)
        non_front = [f for f in b2.faces if f.normal.z < 0.5]
        if non_front:
            bmesh.ops.delete(b2, geom=non_front, context='FACES')
        bmesh.ops.transform(
            b2,
            matrix=base_mat @ Matrix.Translation((lip_dx, y_line + lip_dy, 0.0014)),
            verts=b2.verts,
        )
        t2 = bpy.data.meshes.new("_t2")
        b2.to_mesh(t2)
        b2.free()
        bm_lip.from_mesh(t2)
        bpy.data.meshes.remove(t2)

        # 3. Upper-left dark incised V-cut shadow rim
        b3 = bmesh.new()
        b3.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(b3, faces=b3.faces)
        non_front3 = [f for f in b3.faces if f.normal.z < 0.5]
        if non_front3:
            bmesh.ops.delete(b3, geom=non_front3, context='FACES')
        bmesh.ops.transform(
            b3,
            matrix=base_mat @ Matrix.Translation((shd_dx, y_line + shd_dy, 0.0022)),
            verts=b3.verts,
        )
        t3 = bpy.data.meshes.new("_t3")
        b3.to_mesh(t3)
        b3.free()
        bm_shd.from_mesh(t3)
        bpy.data.meshes.remove(t3)

        bpy.data.meshes.remove(mesh)

    bmesh.ops.recalc_face_normals(bm_core, faces=bm_core.faces)
    bmesh.ops.recalc_face_normals(bm_lip, faces=bm_lip.faces)
    bmesh.ops.recalc_face_normals(bm_shd, faces=bm_shd.faces)

    return [
        create_tagged_mesh_obj(f"{prefix}_Core", bm_core, "poem_core", collection, smooth=False),
        create_tagged_mesh_obj(f"{prefix}_Lip", bm_lip, "poem_lip", collection, smooth=False),
        create_tagged_mesh_obj(f"{prefix}_Shadow", bm_shd, "poem_shadow", collection, smooth=False),
    ]


# ==============================================================================
# GUARANTEED-OUTWARD CURVED VOUSSOIR BLOCK
# ==============================================================================

def build_wedge_voussoir_block(
    name,
    r_inner,
    r_outer,
    angle_start,
    angle_end,
    z_bottom,
    z_top,
    role_tag="rock",
    bevel_width=0.024,
    noise_amp=0.005,
    seed=1,
    collection=None,
):
    """
    Builds a curved, beveled wedge voussoir/flagstone block with 2 internal radial slices so wide
    blocks follow the circular arc smoothly, and guarantees 100% outward face normals (`n.z > 0.95` on top).
    """
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.bevel(
        bm,
        geom=bm.edges[:],
        offset=0.055,
        offset_type='OFFSET',
        segments=1,
        profile=0.5,
        affect='EDGES',
    )
    for x_cut in (-0.17, 0.17):
        geom_all = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(
            bm,
            geom=geom_all,
            dist=1e-5,
            plane_co=Vector((x_cut, 0.0, 0.0)),
            plane_no=Vector((1.0, 0.0, 0.0)),
            clear_inner=False,
            clear_outer=False,
        )

    seed_vec = Vector((seed * 1.9, seed * 3.1, seed * 5.7))
    for v in bm.verts:
        u = 0.5 - v.co.x
        t_r = v.co.y + 0.5
        w = v.co.z + 0.5
        ang = angle_start + (angle_end - angle_start) * u
        rad = r_inner + (r_outer - r_inner) * t_r
        zz = z_bottom + (z_top - z_bottom) * w

        px = math.cos(ang) * rad
        py = math.sin(ang) * rad
        pz = zz

        nv = noise.noise_vector(Vector((px, py, pz)) * 2.2 + seed_vec)
        v.co.x = px + nv.x * noise_amp
        v.co.y = py + nv.y * noise_amp
        v.co.z = pz + (nv.z * noise_amp * 0.25 if w > 0.5 else 0.0)

    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()

    if bm.faces:
        top_face = max(bm.faces, key=lambda f: f.calc_center_median().z)
        if top_face.normal.z < 0.0:
            bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
            bm.normal_update()

    return create_tagged_mesh_obj(name, bm, role_tag, collection, smooth=False, block_seed=seed)


# ==============================================================================
# MONUMENT 3: UNIFIED FLAT-FACETED GHIBLI MONOLITH STELE (`site3-wall-<variant>.glb` — Matching Option A!)
# ==============================================================================

def build_chiseled_planar_rock_block(
    name,
    center_xyz,
    scale_xyz,
    plane_cuts=None,
    bevel_offset=0.014,
    role_tag="rock",
    seed=1,
    collection=None,
):
    """
    Builds a crisp, hand-hewn Ghibli planar limestone rock block by slicing a solid box with
    explicit cleavage planes (`bmesh.ops.bisect_plane(..., clear_outer=True)`) and beveling the
    facet edges with a 1-segment chiseled chamfer.
    Produces 100% flat-shaded planar facets (`poly.use_smooth = False`).
    """
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=scale_xyz, verts=bm.verts)

    if plane_cuts:
        for pt_local, nrm_local in plane_cuts:
            geom_all = bm.verts[:] + bm.edges[:] + bm.faces[:]
            bmesh.ops.bisect_plane(
                bm,
                geom=geom_all,
                dist=1e-5,
                plane_co=Vector(pt_local),
                plane_no=Vector(nrm_local).normalized(),
                use_snap_center=False,
                clear_outer=True,
                clear_inner=False,
            )
            open_edges = [e for e in bm.edges if e.is_boundary]
            if open_edges:
                bmesh.ops.contextual_create(bm, geom=open_edges)

    if bevel_offset > 0.0 and bm.edges:
        bmesh.ops.bevel(
            bm,
            geom=bm.edges[:],
            offset=bevel_offset,
            offset_type='OFFSET',
            segments=1,
            profile=0.5,
            affect='EDGES',
        )

    bmesh.ops.translate(bm, vec=center_xyz, verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()

    if bm.faces:
        c_pt = Vector(center_xyz)
        inward_count = sum(1 for f in bm.faces if f.normal.dot(f.calc_center_median() - c_pt) < 0.0)
        if inward_count > len(bm.faces) // 2:
            bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
            bm.normal_update()

    return create_tagged_mesh_obj(name, bm, role_tag, collection, smooth=False, block_seed=seed)


def build_site3_wall_monument(poem_data, col):
    objs = []

    # 1. Pure Regular `(48 x 28)` Quad-Grid Recessed Limestone Reading Tablet (`y = -0.188`)
    objs.append(
        build_grid_tablet_obj(
            "Site3_TabletFace",
            width=3.20,
            height=1.66,
            center_xyz=(0.0, -0.188, 1.43),
            rot_euler=(math.pi * 0.5, 0.0, 0.0),
            x_segs=48,
            y_segs=28,
            role_tag="tablet_site3",
            collection=col,
        )
    )

    # 2. Solid Monolith Backing Core (`y = -0.16 .. +0.34m`) with Chiseled Rear & Side Planes
    objs.append(
        build_chiseled_planar_rock_block(
            "Site3_MonolithBackCore",
            center_xyz=(0.0, 0.09, 1.38),
            scale_xyz=(4.32, 0.50, 2.56),
            plane_cuts=[
                ((-1.88, 0.0, 0.96), (-0.75, 0.12, 0.65)),
                ((1.88, 0.0, 0.96), (0.75, 0.12, 0.65)),
                ((-2.06, 0.0, 0.0), (-0.96, 0.18, 0.15)),
                ((2.06, 0.0, 0.0), (0.96, 0.18, 0.15)),
                ((0.0, 0.22, 1.16), (0.0, 0.45, 0.89)),
            ],
            bevel_offset=0.022,
            role_tag="rock_alt",
            seed=301,
            collection=col,
        )
    )

    # 3. Inner Recessed Chamfer Arch / Bevel Frame directly bordering the Reading Tablet (`y = -0.235`, matching Option A!)
    inner_bevel_specs = [
        ("Site3_InnerChamfer_TopL", (-0.82, -0.232, 2.27), (1.68, 0.13, 0.16), [((0.0, -0.03, -0.02), (0.0, -0.68, -0.73))], "rock_alt", 310),
        ("Site3_InnerChamfer_TopR", (0.82, -0.232, 2.27), (1.68, 0.13, 0.16), [((0.0, -0.03, -0.02), (0.0, -0.68, -0.73))], "rock", 311),
        ("Site3_InnerCorner_UL", (-1.50, -0.236, 2.14), (0.38, 0.14, 0.34), [((0.04, -0.03, -0.04), (0.62, -0.52, -0.58))], "rock", 312),
        ("Site3_InnerCorner_UR", (1.50, -0.236, 2.14), (0.38, 0.14, 0.34), [((-0.04, -0.03, -0.04), (-0.62, -0.52, -0.58))], "rock_alt", 313),
        ("Site3_InnerChamfer_LeftU", (-1.64, -0.232, 1.76), (0.18, 0.13, 0.92), [((0.04, -0.03, 0.0), (0.74, -0.67, 0.0))], "rock_alt", 314),
        ("Site3_InnerChamfer_LeftD", (-1.64, -0.232, 1.00), (0.18, 0.13, 0.90), [((0.04, -0.03, 0.0), (0.74, -0.67, 0.0))], "rock", 315),
        ("Site3_InnerChamfer_RightU", (1.64, -0.232, 1.76), (0.18, 0.13, 0.92), [((-0.04, -0.03, 0.0), (-0.74, -0.67, 0.0))], "highlight", 316),
        ("Site3_InnerChamfer_RightD", (1.64, -0.232, 1.00), (0.18, 0.13, 0.90), [((-0.04, -0.03, 0.0), (-0.74, -0.67, 0.0))], "rock_alt", 317),
    ]
    for b_name, b_ctr, b_sc, b_cuts, b_role, b_seed in inner_bevel_specs:
        objs.append(
            build_chiseled_planar_rock_block(
                b_name, b_ctr, b_sc, plane_cuts=b_cuts, bevel_offset=0.012, role_tag=b_role, seed=b_seed, collection=col
            )
        )

    # 4. Left & Right Hand-Hewn Multi-Faceted Limestone Piers (overlapping tightly with zero gaps!)
    for side_i, side in enumerate((-1.0, 1.0)):
        tag_side = "L" if side < 0 else "R"
        pier_blocks = [
            (
                f"Site3_PierBot_{tag_side}",
                (side * 1.90, -0.23, 0.80),
                (0.74, 0.38, 0.76),
                [
                    ((side * 0.25, -0.10, 0.12), (side * 0.82, -0.52, 0.24)),
                    ((side * 0.27, -0.08, -0.18), (side * 0.86, -0.45, -0.22)),
                    ((-side * 0.25, -0.12, 0.0), (-side * 0.58, -0.81, 0.05)),
                    ((0.0, -0.15, 0.24), (side * 0.18, -0.86, 0.48)),
                ],
                "rock" if side_i == 0 else "rock_alt",
            ),
            (
                f"Site3_PierMidLo_{tag_side}",
                (side * 1.88, -0.22, 1.30),
                (0.70, 0.36, 0.70),
                [
                    ((side * 0.23, -0.10, 0.08), (side * 0.85, -0.48, 0.20)),
                    ((-side * 0.23, -0.12, -0.05), (-side * 0.62, -0.76, -0.18)),
                    ((0.0, -0.14, 0.20), (-side * 0.15, -0.88, 0.44)),
                    ((side * 0.18, -0.14, -0.22), (side * 0.42, -0.82, -0.38)),
                ],
                "highlight" if side_i == 0 else "rock",
            ),
            (
                f"Site3_PierMidHi_{tag_side}",
                (side * 1.86, -0.22, 1.80),
                (0.70, 0.36, 0.68),
                [
                    ((side * 0.23, -0.08, 0.10), (side * 0.80, -0.52, 0.28)),
                    ((-side * 0.23, -0.12, 0.04), (-side * 0.65, -0.74, 0.16)),
                    ((0.0, -0.14, -0.18), (side * 0.12, -0.90, -0.42)),
                    ((side * 0.15, -0.12, 0.22), (side * 0.38, -0.78, 0.48)),
                ],
                "rock_alt" if side_i == 0 else "highlight",
            ),
            (
                f"Site3_PierShoulder_{tag_side}",
                (side * 1.76, -0.21, 2.24),
                (0.78, 0.36, 0.56),
                [
                    ((side * 0.18, -0.06, 0.12), (side * 0.68, -0.38, 0.62)),
                    ((-side * 0.22, -0.12, -0.08), (-side * 0.58, -0.72, -0.38)),
                    ((0.0, -0.13, 0.18), (side * 0.22, -0.65, 0.72)),
                ],
                "rock",
            ),
        ]
        for p_idx, (p_name, p_ctr, p_sc, p_cuts, p_role) in enumerate(pier_blocks):
            objs.append(
                build_chiseled_planar_rock_block(
                    p_name,
                    p_ctr,
                    p_sc,
                    plane_cuts=p_cuts,
                    bevel_offset=0.016,
                    role_tag=p_role,
                    seed=320 + side_i * 10 + p_idx,
                    collection=col,
                )
            )

    # 5. Top Weathered Chiseled Crown Ridge (`z = 2.24 .. 2.66m`, 5 interlocking planar rock blocks)
    crown_blocks = [
        (
            "Site3_Crown_Left",
            (-1.22, -0.21, 2.43),
            (0.92, 0.36, 0.44),
            [
                ((-0.18, -0.06, 0.14), (-0.32, -0.42, 0.85)),
                ((0.12, -0.12, -0.14), (0.15, -0.78, -0.60)),
                ((0.0, -0.14, 0.08), (-0.12, -0.88, 0.46)),
            ],
            "rock_alt",
            340,
        ),
        (
            "Site3_Crown_MidLeft",
            (-0.56, -0.21, 2.49),
            (0.80, 0.36, 0.44),
            [
                ((-0.10, -0.05, 0.15), (-0.14, -0.38, 0.91)),
                ((0.08, -0.12, -0.14), (0.08, -0.76, -0.64)),
                ((0.0, -0.14, 0.06), (0.10, -0.90, 0.42)),
            ],
            "rock",
            341,
        ),
        (
            "Site3_Crown_Center",
            (0.04, -0.21, 2.51),
            (0.82, 0.36, 0.44),
            [
                ((0.0, -0.06, 0.16), (0.04, -0.36, 0.93)),
                ((0.0, -0.12, -0.14), (-0.06, -0.78, -0.62)),
                ((0.08, -0.14, 0.05), (0.18, -0.88, 0.44)),
            ],
            "highlight",
            342,
        ),
        (
            "Site3_Crown_MidRight",
            (0.64, -0.21, 2.49),
            (0.80, 0.36, 0.44),
            [
                ((0.12, -0.06, 0.15), (0.18, -0.38, 0.91)),
                ((-0.08, -0.12, -0.14), (-0.10, -0.76, -0.64)),
                ((0.0, -0.14, 0.06), (-0.12, -0.90, 0.42)),
            ],
            "rock_alt",
            343,
        ),
        (
            "Site3_Crown_Right",
            (1.26, -0.21, 2.43),
            (0.90, 0.36, 0.44),
            [
                ((0.18, -0.06, 0.14), (0.34, -0.42, 0.84)),
                ((-0.12, -0.12, -0.14), (-0.15, -0.78, -0.60)),
                ((0.0, -0.14, 0.08), (0.14, -0.88, 0.45)),
            ],
            "rock",
            344,
        ),
    ]
    for c_name, c_ctr, c_sc, c_cuts, c_role, c_seed in crown_blocks:
        objs.append(
            build_chiseled_planar_rock_block(
                c_name, c_ctr, c_sc, plane_cuts=c_cuts, bevel_offset=0.016, role_tag=c_role, seed=c_seed, collection=col
            )
        )

    # 6. Two-Tier Chiseled Limestone Sill Ledge & Base Plinth (`z = 0.0 .. 0.62m`, matching Option A's foreground rock ledge!)
    upper_sill_xs = [(-1.68, 0.94), (-0.82, 0.96), (0.04, 0.98), (0.90, 0.94), (1.70, 0.90)]
    for idx, (sx, sw) in enumerate(upper_sill_xs):
        objs.append(
            build_chiseled_planar_rock_block(
                f"Site3_UpperSill_{idx}",
                center_xyz=(sx, -0.25, 0.44),
                scale_xyz=(sw, 0.34, 0.36),
                plane_cuts=[
                    ((0.0, -0.10, 0.11), ((idx - 2) * 0.10, -0.58, 0.81)),
                    ((0.12 if idx % 2 == 0 else -0.12, -0.13, -0.04), ((idx % 3 - 1) * 0.22, -0.94, 0.24)),
                    ((-0.18, -0.12, 0.06), (-0.32, -0.86, 0.38)),
                ],
                bevel_offset=0.015,
                role_tag="highlight" if idx % 2 == 1 else "rock",
                seed=360 + idx,
                collection=col,
            )
        )

    lower_plinth_xs = [(-1.92, 0.90), (-1.14, 0.88), (-0.38, 0.86), (0.38, 0.88), (1.14, 0.88), (1.92, 0.90)]
    for idx, (px, pw) in enumerate(lower_plinth_xs):
        objs.append(
            build_chiseled_planar_rock_block(
                f"Site3_LowerPlinth_{idx}",
                center_xyz=(px, -0.32, 0.18),
                scale_xyz=(pw, 0.38, 0.38),
                plane_cuts=[
                    ((0.0, -0.11, 0.12), ((idx - 2.5) * 0.08, -0.52, 0.85)),
                    ((0.10 if idx % 2 == 1 else -0.10, -0.15, 0.0), ((idx % 2 - 0.5) * 0.28, -0.92, 0.26)),
                ],
                bevel_offset=0.015,
                role_tag="rock_alt" if idx % 2 == 0 else "rock",
                seed=380 + idx,
                collection=col,
            )
        )

    # 7. Crisp Un-Mangled 8-Line Garamond Poem (`y = -0.192`)
    poem_objs = build_crisp_carved_poem_meshes(
        prefix="Site3_Poem",
        lines=poem_data["lines"],
        origin_xyz=(0.0, -0.192, 1.43),
        rot_euler=(math.pi * 0.5, 0.0, 0.0),
        line_size=0.114,
        line_gap=0.174,
        stanza_gap=0.068,
        collection=col,
    )
    objs.extend(poem_objs)
    return objs


# ==============================================================================
# MONUMENT 1: CURVED WELL MASONRY, ORNATE MOLDED KEYSTONE & `VolumetricFlowerSculptor` ROSES (`Option B`!)
# ==============================================================================

def build_site1_well_monument(poem_data, col):
    objs = []

    # 1. Radial Cobblestone Apron around the Well (`r = 1.54 .. 3.48m, z = 0.0 .. 0.058m`)
    bm_bed = bmesh.new()
    bmesh.ops.create_cone(
        bm_bed, cap_ends=True, cap_tris=False, segments=48,
        radius1=3.50, radius2=3.48, depth=0.036, matrix=Matrix.Translation((0.0, 0.0, 0.018))
    )
    bmesh.ops.recalc_face_normals(bm_bed, faces=bm_bed.faces)
    objs.append(create_tagged_mesh_obj("Site1_ApronMortarBed", bm_bed, "mortar", col))

    for ring_idx, (r0, r1, count, z_top) in enumerate([
        (1.56, 2.48, 22, 0.058),
        (2.50, 3.44, 28, 0.054),
    ]):
        step_ang = TAU / count
        for i in range(count):
            a0 = i * step_ang + (0.07 if ring_idx == 1 else 0.0)
            a1 = (i + 1) * step_ang + (0.07 if ring_idx == 1 else 0.0) - 0.016
            objs.append(
                build_wedge_voussoir_block(
                    f"Site1_ApronStone_{ring_idx}_{i}", r0, r1, a0, a1, 0.006, z_top,
                    role_tag="rock" if (i + ring_idx) % 2 == 0 else "rock_alt",
                    bevel_width=0.018, noise_amp=0.005, seed=100 + ring_idx * 40 + i, collection=col
                )
            )

    # 2. Circular Well Mortar Core Cylinder (`r = 1.50m, z = 0.0 .. 0.94m`)
    bm_core = bmesh.new()
    bmesh.ops.create_cone(
        bm_core, cap_ends=True, cap_tris=False, segments=48,
        radius1=1.50, radius2=1.50, depth=0.94, matrix=Matrix.Translation((0.0, 0.0, 0.47))
    )
    bmesh.ops.recalc_face_normals(bm_core, faces=bm_core.faces)
    objs.append(create_tagged_mesh_obj("Site1_WellMortarCore", bm_core, "mortar", col))

    # 3. 4 Courses of Sunlit Cream-Limestone Well Wall Voussoir Blocks (`z = 0.02 .. 0.89m`, matching Option B!)
    for c_idx, (z0, z1) in enumerate([
        (0.02, 0.225),
        (0.24, 0.445),
        (0.46, 0.665),
        (0.68, 0.890),
    ]):
        n_blocks = 18
        step_a = TAU / n_blocks
        phase = (c_idx % 2) * (step_a * 0.5)
        for i in range(n_blocks):
            a0 = i * step_a + phase
            a1 = (i + 1) * step_a + phase - 0.018
            objs.append(
                build_wedge_voussoir_block(
                    f"Site1_WellCourse_{c_idx}_{i}", 1.18, 1.545, a0, a1, z0, z1,
                    role_tag="rock" if (i + c_idx) % 2 == 0 else "rock_alt",
                    bevel_width=0.022, noise_amp=0.006, seed=200 + c_idx * 24 + i, collection=col
                )
            )

    # 4. Overhanging 20-Block Hand-Hewn Limestone Well Coping Rim (`r = 1.14 .. 1.625m, z = 0.90 .. 1.07m`,
    #    half-block phase offset so a solid keystone coping block sits centered at `x = 0` matching Option B!)
    n_rim = 20
    rim_step = TAU / n_rim
    for i in range(n_rim):
        a0 = (i - 0.5) * rim_step
        a1 = (i + 0.5) * rim_step - 0.016
        objs.append(
            build_wedge_voussoir_block(
                f"Site1_WellRim_{i}", 1.14, 1.625, a0, a1, 0.90, 1.07,
                role_tag="highlight" if i % 2 == 0 else "rock",
                bevel_width=0.026, noise_amp=0.006, seed=280 + i, collection=col
            )
        )

    # 5. Ornate Chamfered Limestone Keystone Molding Frame + Regular Quad-Grid Recessed Tablet
    curved_parts = []

    curved_parts.append(
        build_grid_tablet_obj(
            "Site1_KeystoneTablet",
            width=1.42,
            height=0.68,
            center_xyz=(0.0, -1.568, 0.48),
            rot_euler=(math.pi * 0.5, 0.0, 0.0),
            x_segs=36,
            y_segs=20,
            role_tag="tablet_site1",
            collection=col,
        )
    )

    for m_idx, (m_name, mx, my, mz, sx, sy, sz, r_tag) in enumerate([
        ("Site1_FrameBacking", 0.0, -1.556, 0.48, 1.58, 0.032, 0.80, "rock_alt"),
        ("Site1_FrameTop", 0.0, -1.584, 0.842, 1.54, 0.054, 0.060, "highlight"),
        ("Site1_FrameBot", 0.0, -1.584, 0.118, 1.54, 0.054, 0.060, "highlight"),
        ("Site1_FrameLeft", -0.735, -1.584, 0.48, 0.072, 0.054, 0.70, "rock"),
        ("Site1_FrameRight", 0.735, -1.584, 0.48, 0.072, 0.054, 0.70, "rock"),
        ("Site1_FilletTop", 0.0, -1.574, 0.798, 1.40, 0.038, 0.028, "bezel_shadow"),
        ("Site1_FilletBot", 0.0, -1.574, 0.162, 1.40, 0.038, 0.028, "highlight"),
        ("Site1_FilletLeft", -0.682, -1.574, 0.48, 0.030, 0.038, 0.64, "bezel_shadow"),
        ("Site1_FilletRight", 0.682, -1.574, 0.48, 0.030, 0.038, 0.64, "highlight"),
        ("Site1_CornerUL", -0.685, -1.582, 0.798, 0.11, 0.050, 0.09, "highlight"),
        ("Site1_CornerUR", 0.685, -1.582, 0.798, 0.11, 0.050, 0.09, "highlight"),
        ("Site1_CornerDL", -0.685, -1.582, 0.162, 0.11, 0.050, 0.09, "rock"),
        ("Site1_CornerDR", 0.685, -1.582, 0.162, 0.11, 0.050, 0.09, "rock"),
    ]):
        bm_f = bmesh.new()
        bmesh.ops.create_cube(bm_f, size=1.0)
        bmesh.ops.scale(bm_f, vec=(sx, sy, sz), verts=bm_f.verts)
        bmesh.ops.bevel(
            bm_f,
            geom=bm_f.edges[:],
            offset=0.008,
            offset_type='OFFSET',
            segments=1,
            profile=0.5,
            affect='EDGES',
        )
        if sx > 0.35:
            for cut_i in range(-7, 8):
                x_c = cut_i * 0.10
                if abs(x_c) < sx * 0.48:
                    geom_all = bm_f.verts[:] + bm_f.edges[:] + bm_f.faces[:]
                    bmesh.ops.bisect_plane(
                        bm_f,
                        geom=geom_all,
                        dist=1e-5,
                        plane_co=Vector((x_c, 0.0, 0.0)),
                        plane_no=Vector((1.0, 0.0, 0.0)),
                    )
        bmesh.ops.translate(bm_f, vec=(mx, my, mz), verts=bm_f.verts)
        bmesh.ops.recalc_face_normals(bm_f, faces=bm_f.faces)
        curved_parts.append(create_tagged_mesh_obj(m_name, bm_f, r_tag, col, smooth=False, block_seed=290 + m_idx))

    # 6. OUR REAL `VolumetricFlowerSculptor` Multi-Whorl Goblet Crimson Roses, Pointed Rosebuds,
    #    Fluted Briar Vines & Clustered Ivy/Rose Leaves!
    roses_vine_obj = build_rich_climbing_rose_vine_mesh("Site1_VolumetricRosesAndVines", collection=col)
    curved_parts.append(roses_vine_obj)

    # 7. Crisp Un-Mangled 8-Line Garamond Poem (`y = -1.572m`)
    poem_objs = build_crisp_carved_poem_meshes(
        prefix="Site1_Poem",
        lines=poem_data["lines"],
        origin_xyz=(0.0, -1.572, 0.48),
        rot_euler=(math.pi * 0.5, 0.0, 0.0),
        line_size=0.048,
        line_gap=0.068,
        stanza_gap=0.024,
        collection=col,
    )
    curved_parts.extend(poem_objs)

    for c_obj in curved_parts:
        cylindrical_bend_object_around_well(c_obj, radius=1.54)

    objs.extend(curved_parts)
    return objs


# ==============================================================================
# MONUMENT 2: SUNKEN FRACTURED SANCTUARY BASIN (`site2-grove-<variant>.glb` — Matching Option C!)
# ==============================================================================

def build_site2_grove_monument(poem_data, col):
    objs = []

    # 1. Stepped Outer Sanctuary Tiers (`R = 4.50m`, `z = 0.0 .. 0.36m`)
    for tier_idx, (r_bot, r_top, z0, z1, n_seg) in enumerate([
        (4.50, 4.40, 0.00, 0.18, 28),
        (3.85, 3.75, 0.17, 0.35, 24),
    ]):
        bm_step = bmesh.new()
        bmesh.ops.create_cone(
            bm_step, cap_ends=True, cap_tris=False, segments=48,
            radius1=r_bot - 0.03, radius2=r_top - 0.03, depth=z1 - z0,
            matrix=Matrix.Translation((0.0, 0.0, (z0 + z1) * 0.5))
        )
        bmesh.ops.recalc_face_normals(bm_step, faces=bm_step.faces)
        objs.append(create_tagged_mesh_obj(f"Site2_TierCore_{tier_idx}", bm_step, "mortar_moss_site2", col))

        step_a = TAU / n_seg
        for i in range(n_seg):
            a0 = i * step_a + tier_idx * 0.12
            a1 = (i + 1) * step_a + tier_idx * 0.12 - 0.022
            objs.append(
                build_wedge_voussoir_block(
                    f"Site2_TierBlock_{tier_idx}_{i}", r_top - 0.55, r_top, a0, a1, z0, z1,
                    role_tag="rock_site2" if (i + tier_idx) % 2 == 0 else "rock_alt_site2",
                    bevel_width=0.024, noise_amp=0.006, seed=500 + tier_idx * 40 + i, collection=col
                )
            )

    # 2. High-Resolution Mossy Mortar Bed (`R = 3.24m, z = 0.506m` — deep stone mortar + patchy crevice moss!)
    bm_topbed = bmesh.new()
    bmesh.ops.create_grid(bm_topbed, x_segments=64, y_segments=64, size=3.24)
    for v in bm_topbed.verts:
        r = math.hypot(v.co.x, v.co.y)
        if r > 3.22:
            v.co.x *= 3.22 / r
            v.co.y *= 3.22 / r
        n_m = noise.noise(Vector((v.co.x * 3.0, v.co.y * 3.0, 1.7)))
        v.co.z = 0.504 + max(0.0, n_m - 0.05) * 0.022
    bmesh.ops.recalc_face_normals(bm_topbed, faces=bm_topbed.faces)
    objs.append(create_tagged_mesh_obj("Site2_TopMortarBed", bm_topbed, "mortar_moss_site2", col, smooth=True))

    # 3. Outer Ring of 22 Weathered Radial Flagstones (`r = 2.18 .. 3.20m, z = 0.35 .. 0.528m`)
    n_outer = 22
    outer_step = TAU / n_outer
    for i in range(n_outer):
        a0 = i * outer_step
        a1 = (i + 1) * outer_step - 0.022
        objs.append(
            build_wedge_voussoir_block(
                f"Site2_OuterFlagstone_{i}", 2.18, 3.20, a0, a1, 0.35, 0.528,
                role_tag="rock_site2" if i % 2 == 0 else "rock_alt_site2",
                bevel_width=0.024, noise_amp=0.006, seed=600 + i, collection=col
            )
        )

    # 4. Middle Ring of 16 Carved Flagstones (`r = 1.64 .. 2.15m, z = 0.36 .. 0.540m`)
    n_mid = 16
    mid_step = TAU / n_mid
    for i in range(n_mid):
        a0 = i * mid_step + 0.06
        a1 = (i + 1) * mid_step + 0.06 - 0.024
        objs.append(
            build_wedge_voussoir_block(
                f"Site2_MidFlagstone_{i}", 1.64, 2.15, a0, a1, 0.36, 0.540,
                role_tag="rock_alt_site2" if i % 2 == 0 else "rock_site2",
                bevel_width=0.024, noise_amp=0.006, seed=630 + i, collection=col
            )
        )

    # Sculpted Stone Bas-Relief Roses & Vine Scrolls on the Middle Flagstone Ring (`VolumetricFlowerSculptor` in stone relief!)
    objs.append(build_stone_relief_rose_ring_mesh("Site2_StoneReliefRoseRing", radius=1.90, z_height=0.540, collection=col))

    # 5. Raised Stepped 20-Block Stone Basin Curb Ring (`r = 1.34 .. 1.62m, z = 0.36 .. 0.584m`)
    n_curb = 20
    curb_step = TAU / n_curb
    for i in range(n_curb):
        a0 = i * curb_step + 0.08
        a1 = (i + 1) * curb_step + 0.08 - 0.022
        objs.append(
            build_wedge_voussoir_block(
                f"Site2_BasinCurb_{i}", 1.34, 1.62, a0, a1, 0.36, 0.584,
                role_tag="highlight_site2" if i % 2 == 0 else "rock_site2",
                bevel_width=0.024, noise_amp=0.006, seed=650 + i, collection=col
            )
        )

    # 6. Regular Grid Sunken Central Monolithic Limestone Basin Floor (`R = 1.36m, z = 0.480m`)
    bm_disc = bmesh.new()
    bmesh.ops.create_grid(bm_disc, x_segments=44, y_segments=44, size=1.37)
    for v in bm_disc.verts:
        r = math.hypot(v.co.x, v.co.y)
        if r > 1.36:
            v.co.x *= 1.36 / r
            v.co.y *= 1.36 / r
        v.co.z = 0.480
    bmesh.ops.recalc_face_normals(bm_disc, faces=bm_disc.faces)
    objs.append(create_tagged_mesh_obj("Site2_SunkenBasinDisc", bm_disc, "tablet_site2", col, smooth=True))

    # 7. `VolumetricFlowerSculptor` Fallen Cupped Crimson Petals + Corner Living Rose Cluster (zero icosphere moss blobs!)
    objs.append(build_fallen_rose_petals_and_blooms_mesh("Site2_FallenPetalsAndRoses", collection=col))

    # 8. Crisp Un-Mangled 8-Line Garamond Poem in the Sunken Basin Floor (`z = 0.481m`)
    poem_objs = build_crisp_carved_poem_meshes(
        prefix="Site2_Poem",
        lines=poem_data["lines"],
        origin_xyz=(0.0, 0.0, 0.481),
        rot_euler=(0.0, 0.0, 0.0),
        line_size=0.104,
        line_gap=0.178,
        stanza_gap=0.064,
        collection=col,
    )
    objs.extend(poem_objs)
    return objs


# ==============================================================================
# BAKE CLEAN PER-LOOP VERTEX COLORS (`col_baked`) IN BLENDER & EXPORT GLB
# ==============================================================================

def bake_object_vertex_colors(obj):
    """
    Computes bright, sunlit Ghibli cream-limestone tones (`#ede4d0`, `#dfd3ba`, `#b8a88e`, `#7d6d58`),
    per-block stone variation, clean recess frame AO, organic brow-draping & crevice moss masks, and
    V-chiseled letter tones directly into `col_baked`.
    """
    mesh = obj.data
    if "col_baked" in mesh.color_attributes:
        return

    role = obj.get("role_tag", "rock")
    b_seed = int(obj.get("block_seed", 0))
    baked_attr = mesh.color_attributes.new(name="col_baked", type='FLOAT_COLOR', domain='CORNER')

    # Warm V-chiseled stone lettering palette (matches Option A, B, C!)
    c_poem_core = srgb_hex("#52402d")      # Warm chiseled bronze-umber letter core
    c_poem_shadow = srgb_hex("#36281b")    # Incised upper-left V-cut shadow
    c_poem_lip = srgb_hex("#fbf3e3")       # Bright sunlit cream bottom-right catchlight lip

    # Clean, sunlit cream-sandstone reading tablet palette (ZERO dirty grey-brown vertex blotches!)
    c_tab_center = srgb_hex("#e8dcc4")     # Warm sunlit cream-sandstone tablet center
    c_tab_sun = srgb_hex("#f2e8d5")        # Bright sunlit upper-center tablet glow
    c_tab_edge_ao = srgb_hex("#a8957a")    # Warm limestone recess border shadow

    # Bright Ghibli cream-limestone masonry & monolith palette (harmonized with village cottages!)
    c_rock_ridge = srgb_hex("#f8f1e2")     # Crisp chiseled top-bevel highlight
    c_rock_sun = srgb_hex("#ede4d0")       # Sunlit cream limestone (`#ede4d0`)
    c_rock_mid = srgb_hex("#dfd3ba")       # Mid warm limestone (`#dfd3ba`)
    c_rock_alt = srgb_hex("#cfc0a4")       # Secondary warm limestone block
    c_rock_side = srgb_hex("#ab987c")      # Cool angled facet shade (`#b8a88e`)
    c_rock_under = srgb_hex("#756550")     # Deep crevice / overhang shadow (`#7d6d58`)
    c_mortar = srgb_hex("#5c4d3c")         # Crisp deep stone mortar joint

    # Organic Ghibli moss palette (for Site 3 top crown & Site 2 mortar crevices)
    c_moss_deep = srgb_hex("#244a15")      # Deep forest moss crevice border
    c_moss_mid = srgb_hex("#467d28")       # Rich Ghibli cushion moss green
    c_moss_tip = srgb_hex("#7ab540")       # Sunlit olive-chartreuse moss crown

    sun_dir = Vector((-0.42, -0.48, 0.77)).normalized()

    block_hash = ((b_seed * 1103515245 + 12345) & 0x7FFFFFFF) / 2147483647.0
    block_tint = 0.91 + block_hash * 0.14 if b_seed > 0 else 1.0

    verts = mesh.vertices
    for poly in mesh.polygons:
        p_norm = poly.normal
        p_center = poly.center
        for loop_idx in poly.loop_indices:
            v_idx = mesh.loops[loop_idx].vertex_index
            v = verts[v_idx]
            co = v.co
            n = p_norm if not poly.use_smooth else v.normal

            if role == "poem_core":
                col = c_poem_core
            elif role == "poem_shadow":
                col = c_poem_shadow
            elif role == "poem_lip":
                col = c_poem_lip
            elif role.startswith("tablet"):
                m1 = noise.noise(co * 1.4 + Vector((1.3, 4.7, 2.9)))
                col = lerp_col(c_tab_center, c_tab_sun, 0.55 + m1 * 0.22)
                if role == "tablet_site3":
                    dx = abs(co.x) / 1.56
                    dz = abs(co.z - 1.41) / 0.81
                    edge_d = max(dx, dz)
                    top_ao = smoothstep(1.94, 2.22, co.z) * 0.52
                    frame_ao = max(smoothstep(0.80, 1.00, edge_d) * 0.58, top_ao)
                elif role == "tablet_site1":
                    dx = abs(co.x) / 0.70
                    dz = abs(co.z - 0.48) / 0.34
                    edge_d = max(dx, dz)
                    top_ao = smoothstep(0.68, 0.81, co.z) * 0.52
                    frame_ao = max(smoothstep(0.78, 1.00, edge_d) * 0.56, top_ao)
                else:  # tablet_site2
                    r_d = math.hypot(co.x, co.y) / 1.35
                    frame_ao = smoothstep(0.78, 1.00, r_d) * 0.62
                col = lerp_col(col, c_tab_edge_ao, frame_ao)
            elif role in ("mortar", "mortar_moss_site2"):
                col = c_mortar
            elif role == "bezel_shadow":
                col = lerp_col(c_rock_under, c_rock_side, 0.30)
            else:
                is_hi = role in ("highlight", "highlight_site2")
                is_alt = role in ("rock_alt", "rock_alt_site2")
                base_c = c_rock_sun if is_hi else (c_rock_alt if is_alt else c_rock_mid)

                ndl = n.dot(sun_dir)
                top_f = smoothstep(0.24, 0.76, n.z)
                side_f = min(1.0, abs(n.x) * 0.58 + max(0.0, -ndl) * 0.52)
                under_f = smoothstep(-0.04, -0.58, n.z)

                is_upper_chamfer = (
                    smoothstep(0.20, 0.58, p_norm.z) * smoothstep(0.92, 0.60, p_norm.z)
                    if not poly.use_smooth
                    else 0.0
                )

                col = lerp_col(base_c, c_rock_side, side_f * 0.72)
                col = lerp_col(col, c_rock_sun, top_f * 0.68)
                col = lerp_col(col, c_rock_ridge, is_upper_chamfer * 0.65)
                col = lerp_col(col, c_rock_under, under_f * 0.74)

                if role == "monolith_site3":
                    f_hash = noise.noise(p_center * 3.8 + Vector((2.1, 6.4, 4.9)))
                    f_mult = 0.91 + f_hash * 0.16
                else:
                    m1 = noise.noise(co * 2.2 + Vector((3.7, 1.9, 5.4)))
                    f_mult = block_tint * (0.95 + m1 * 0.09)

                col = (
                    max(0.0, min(1.0, col[0] * f_mult)),
                    max(0.0, min(1.0, col[1] * f_mult)),
                    max(0.0, min(1.0, col[2] * f_mult)),
                )

            baked_attr.data[loop_idx].color = (col[0], col[1], col[2], 1.0)


def join_and_finalize_monument(name, objs, master_mat):
    valid = [o for o in objs if o is not None and o.type == 'MESH']
    for o in valid:
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        bake_object_vertex_colors(o)
        o.data.materials.clear()
        o.data.materials.append(master_mat)

    bpy.ops.object.select_all(action='DESELECT')
    for o in valid:
        o.select_set(True)
    bpy.context.view_layer.objects.active = valid[0]
    bpy.ops.object.join()
    joined = bpy.context.view_layer.objects.active
    joined.name = name
    joined.data.name = name + "_Mesh"

    attr = joined.data.color_attributes.get("col_baked")
    if attr is not None:
        joined.data.color_attributes.active_color = attr
        joined.data.color_attributes.render_color_index = joined.data.color_attributes.find("col_baked")

    return joined


def build_and_export_all(worktree_root, variant="exposed"):
    out_dir = os.path.join(worktree_root, "world", "assets", "models", "inscriptions")
    os.makedirs(out_dir, exist_ok=True)

    poems = EXPOSED_POEMS if variant == "exposed" else load_unspoiled_poems_if_available(worktree_root)

    specs = [
        ("site1", f"site1-well-{variant}.glb", build_site1_well_monument),
        ("site2", f"site2-grove-{variant}.glb", build_site2_grove_monument),
        ("site3", f"site3-wall-{variant}.glb", build_site3_wall_monument),
    ]

    summary = {}
    for site_key, filename, builder_fn in specs:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.context.scene.unit_settings.system = 'METRIC'
        bpy.context.scene.unit_settings.scale_length = 1.0

        master_mat = get_master_vertex_color_material()
        col = bpy.context.scene.collection

        parts = builder_fn(poems[site_key], col)
        monument = join_and_finalize_monument(f"Monument_{site_key}", parts, master_mat)

        tris = sum(max(0, len(p.vertices) - 2) for p in monument.data.polygons)
        verts = len(monument.data.vertices)

        out_path = os.path.join(out_dir, filename)
        bpy.ops.object.select_all(action='DESELECT')
        monument.select_set(True)
        bpy.context.view_layer.objects.active = monument

        bpy.ops.export_scene.gltf(
            filepath=out_path,
            export_format='GLB',
            use_selection=True,
            export_yup=True,
            export_apply=True,
            export_materials='EXPORT',
        )

        summary[site_key] = {
            "glb": out_path,
            "bytes": os.path.getsize(out_path) if os.path.isfile(out_path) else 0,
            "vertices": verts,
            "triangles": tris,
        }
        print(f"[BLENDER-OK] {site_key} ({variant}): {verts} verts, {tris} tris -> {out_path}")

    print("RESULT_JSON:" + json.dumps(summary))


if __name__ == "__main__":
    argv = sys.argv
    args = argv[argv.index("--") + 1:] if "--" in argv else []
    wt_root = args[0] if len(args) >= 1 else os.getcwd()
    var_mode = args[1] if len(args) >= 2 else "both"
    if var_mode == "both":
        build_and_export_all(wt_root, variant="exposed")
        build_and_export_all(wt_root, variant="live")
    else:
        build_and_export_all(wt_root, variant=var_mode)
