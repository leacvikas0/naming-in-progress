#!/usr/bin/env python3
"""
Headless Blender 5.2 High-Resolution Sculptor & Vertex-Color Baker for the 3 Sacred Stone Monuments in Amarante.

Directly integrates:
  1. `VolumetricFlowerSculptor` from `world/tools/build-blender-flowers.py` for our multi-whorl
     goblet-cupped `crimsonRose` blooms (`add_rose_spiral_core_and_calyx` + 3 whorls of
     `add_goblet_rose_petal`), `add_oriented_serrated_leaf`, and fluted multi-strand woody
     briar vines with 6-stop per-vertex botanical color gradients.
  2. `bx_sculpt.py` (`S.Clay` SDF + `S.sd_halfspace` + `S.Sculptor.plane_cut`) from `scenario-blender-expert`
     to sculpt a single unified, angular, hand-hewn rock monolith for `Site 3` (zero separate potato-balls!).
  3. Uniform quad-grid recessed tablets (`bmesh.ops.create_grid`) and clean facet-normal bevel baking
     (zero N-gon diagonal fan streaks, zero jagged sawtooth vertex-color artifacts).
  4. Clean un-mangled Garamond (`resolution_u = 12, bevel_depth = 0`) with a 3-layer V-chiseled
     depth stack (dark incised upper shadow + deep chiseled umber core + sunlit cream lower lip).
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

import bx_sculpt as S
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


def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / max(1e-6, e1 - e0)))
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


def create_tagged_mesh_obj(name, bm, role_tag, collection=None, smooth=False):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for poly in mesh.polygons:
        poly.use_smooth = smooth
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj["role_tag"] = role_tag
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def build_grid_tablet_obj(name, width, height, center_xyz, rot_euler, x_segs, y_segs, role_tag, collection=None):
    """
    Builds a pure, regular `(x_segs x y_segs)` quad grid for a reading tablet face so vertex-baked
    recess AO and stone mottling have ZERO diagonal fan-triangle streaks!
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
        cdata.resolution_u = 12
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
# CLEAN GRID-BASED VOUSSOIR MASONRY BLOCK & MOSS CARPET
# ==============================================================================

def build_highres_moss_carpet(name, cushions_xyz_r, seed=1, collection=None):
    bm = bmesh.new()
    for idx, (cx, cy, cz, rx, ry, rz) in enumerate(cushions_xyz_r):
        m_bm = bmesh.new()
        bmesh.ops.create_icosphere(m_bm, subdivisions=3, radius=1.0)
        s_vec = Vector((seed * 1.7 + idx * 2.3, idx * 4.1, seed * 3.3))
        for v in m_bm.verts:
            nv = noise.noise_vector(v.co * 2.4 + s_vec)
            bump = 1.0 + 0.18 * nv.z
            v.co.x = v.co.x * rx * bump
            v.co.y = v.co.y * ry * bump
            z_local = v.co.z if v.co.z > -0.15 else -0.15 + (v.co.z + 0.15) * 0.20
            v.co.z = z_local * rz * bump
        bmesh.ops.translate(m_bm, vec=(cx, cy, cz), verts=m_bm.verts)
        tmp = bpy.data.meshes.new("_tmp_moss")
        m_bm.to_mesh(tmp)
        m_bm.free()
        bm.from_mesh(tmp)
        bpy.data.meshes.remove(tmp)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    return create_tagged_mesh_obj(name, bm, "moss", collection, smooth=True)


def build_wedge_voussoir_block(
    name,
    r_inner,
    r_outer,
    angle_start,
    angle_end,
    z_bottom,
    z_top,
    role_tag="rock",
    bevel_width=0.026,
    noise_amp=0.008,
    seed=1,
    arc_steps=6,
    rad_steps=3,
    collection=None,
):
    """
    Builds a chiseled wedge voussoir stone block by beveling the 12 outer cube edges first
    and verifying outward face orientation against the block centroid so ZERO blocks ever invert!
    """
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=0.065, offset_type='OFFSET', segments=2, profile=0.7, affect='EDGES')

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

        nv = noise.noise_vector(Vector((px, py, pz)) * 2.4 + seed_vec)
        v.co.x = px + nv.x * noise_amp
        v.co.y = py + nv.y * noise_amp
        v.co.z = pz + (nv.z * noise_amp * 0.5 if w > 0.5 else 0.0)

    bm.normal_update()
    # Explicitly verify outward face normals using the block's true centroid (never trust recalc_face_normals on curved wedges!)
    mid_ang = 0.5 * (angle_start + angle_end)
    mid_rad = 0.5 * (r_inner + r_outer)
    mid_z = 0.5 * (z_bottom + z_top)
    center_pt = Vector((math.cos(mid_ang) * mid_rad, math.sin(mid_ang) * mid_rad, mid_z))
    inv_faces = [f for f in bm.faces if f.normal.dot(f.calc_center_median() - center_pt) < 0.0]
    if inv_faces:
        bmesh.ops.reverse_faces(bm, faces=inv_faces)
    bm.normal_update()

    return create_tagged_mesh_obj(name, bm, role_tag, collection, smooth=False)


# ==============================================================================
# MONUMENT 3: UNIFIED WEATHERED MONOLITH STELE (`site3-wall-<variant>.glb` — Matching Option A!)
# ==============================================================================

def build_site3_wall_monument(poem_data, col):
    objs = []

    # 1. Single Unified Hand-Hewn Monolith Stele sculpted with `bx_sculpt.Clay` SDF + Angular Rock Planes
    clay = S.Clay(lo=(-2.65, -0.55, -0.05), hi=(2.65, 0.55, 2.85), voxel=0.036)

    base_plinth = S.sd_round_box((0.0, -0.05, 0.24), (2.38, 0.36, 0.24), 0.04)
    stele_body = S.sd_round_box((0.0, 0.02, 1.44), (2.18, 0.28, 1.26), 0.05)

    plane_clips = [
        ((-2.02, 0.0, 2.30), (-0.76, -0.14, 0.63)),
        ((2.00, 0.0, 2.28), (0.75, -0.12, 0.65)),
        ((-2.14, 0.0, 1.45), (-0.96, -0.18, 0.18)),
        ((2.12, 0.0, 1.45), (0.95, -0.16, 0.20)),
        ((-2.10, 0.0, 0.75), (-0.92, -0.22, -0.32)),
        ((2.08, 0.0, 0.75), (0.91, -0.20, -0.34)),
        ((0.0, 0.0, 2.66), (0.03, -0.15, 0.98)),
        ((-1.15, 0.0, 2.62), (-0.28, -0.16, 0.94)),
        ((1.15, 0.0, 2.60), (0.30, -0.16, 0.94)),
    ]
    for pt, nrm in plane_clips:
        stele_body = stele_body.clip(S.sd_halfspace(pt, nrm), 0.03)

    clay.add(base_plinth)
    clay.add(stele_body, blend=0.05)

    outer_recess = S.sd_round_box((0.0, -0.27, 1.44), (1.68, 0.08, 0.88), 0.03)
    inner_recess = S.sd_round_box((0.0, -0.23, 1.44), (1.58, 0.08, 0.80), 0.02)
    clay.sub(outer_recess, blend=0.03)
    clay.sub(inner_recess, blend=0.02)

    monolith = clay.to_object("Site3_MonolithStele", collection=col, smooth=False, symmetric=False)
    monolith["role_tag"] = "monolith_site3"

    sc = S.Sculptor(monolith, symmetry_x=False)
    for pt, nrm, rad in [
        ((-1.92, -0.22, 2.18), (-0.58, -0.62, 0.52), 0.52),
        ((1.92, -0.22, 2.16), (0.56, -0.64, 0.52), 0.52),
        ((-1.98, -0.24, 1.42), (-0.68, -0.68, 0.12), 0.48),
        ((1.98, -0.24, 1.44), (0.66, -0.70, 0.14), 0.48),
        ((-1.94, -0.24, 0.82), (-0.62, -0.68, -0.35), 0.48),
        ((1.94, -0.24, 0.84), (0.60, -0.70, -0.32), 0.48),
        ((-1.35, -0.30, 0.34), (-0.22, -0.72, 0.65), 0.46),
        ((0.0, -0.32, 0.32), (0.04, -0.70, 0.71), 0.50),
        ((1.35, -0.30, 0.34), (0.24, -0.72, 0.65), 0.46),
    ]:
        sc.plane_cut(pt, nrm, radius=rad, offset=-0.018)
    sc.commit(remember_mask=False)

    # Smooth OpenVDB voxel stair-steps in BMesh and recompute true vertex normals via `bm.normal_update()`!
    bm_m = bmesh.new()
    bm_m.from_mesh(monolith.data)
    for _ in range(3):
        bmesh.ops.smooth_vert(bm_m, verts=bm_m.verts[:], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    for v in bm_m.verts:
        x, y, z = v.co.x, v.co.y, v.co.z
        in_tablet = (abs(x) < 1.56) and (0.62 < z < 2.24) and (y < -0.10)
        if not in_tablet:
            p = Vector((x * 1.15, y * 1.15, z * 1.35)) + Vector((4.2, 8.1, 2.7))
            nv = noise.noise_vector(p)
            v.co.x += nv.x * 0.045
            v.co.y += nv.y * 0.032
            v.co.z += nv.z * 0.040
    bm_m.normal_update()
    bm_m.to_mesh(monolith.data)
    bm_m.free()
    for poly in monolith.data.polygons:
        poly.use_smooth = True
    monolith.data.update()
    objs.append(monolith)

    # 2. Pure Regular `(36 x 22)` Quad-Grid Recessed Tablet Face (`y = -0.188`)
    objs.append(
        build_grid_tablet_obj(
            "Site3_TabletFace",
            width=3.16,
            height=1.64,
            center_xyz=(0.0, -0.188, 1.43),
            rot_euler=(math.pi * 0.5, 0.0, 0.0),
            x_segs=36,
            y_segs=22,
            role_tag="tablet_site3",
            collection=col,
        )
    )

    # 3. Natural Asymmetric Ghibli Moss Patches nestled in the Top Rock Crevices (matching Option A, zero sausage chain!)
    moss_cushions = [
        # Left upper shoulder patch
        (-2.02, -0.18, 2.26, 0.22, 0.16, 0.06),
        (-1.82, -0.20, 2.40, 0.28, 0.18, 0.07),
        (-1.58, -0.19, 2.52, 0.24, 0.16, 0.06),
        (-1.32, -0.18, 2.58, 0.18, 0.14, 0.05),
        # Small center-left crevice tuft
        (-0.52, -0.17, 2.63, 0.20, 0.15, 0.05),
        (-0.32, -0.17, 2.64, 0.15, 0.13, 0.045),
        # Right upper shoulder patch
        (1.18, -0.18, 2.60, 0.19, 0.15, 0.05),
        (1.44, -0.19, 2.54, 0.26, 0.17, 0.065),
        (1.72, -0.20, 2.42, 0.28, 0.18, 0.07),
        (1.96, -0.18, 2.28, 0.22, 0.16, 0.06),
    ]
    objs.append(build_highres_moss_carpet("Site3_MossCrown", moss_cushions, seed=309, collection=col))

    # 4. Crisp Un-Mangled 8-Line Garamond Poem (`y = -0.192`)
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
# MONUMENT 1: CURVED WELL MASONRY, HOLLOW CHAMFERED MOLDING & `VolumetricFlowerSculptor` ROSES (`Option B`!)
# ==============================================================================

def build_site1_well_monument(poem_data, col):
    objs = []

    # 1. Radial Cobblestone Apron around the Well (`r = 1.54 .. 3.48m, z = 0.0 .. 0.06m`)
    bm_bed = bmesh.new()
    bmesh.ops.create_cone(
        bm_bed, cap_ends=True, cap_tris=False, segments=48,
        radius1=3.50, radius2=3.48, depth=0.04, matrix=Matrix.Translation((0.0, 0.0, 0.02))
    )
    objs.append(create_tagged_mesh_obj("Site1_ApronMortarBed", bm_bed, "mortar", col))

    for ring_idx, (r0, r1, count, z_top) in enumerate([
        (1.58, 2.48, 20, 0.058),
        (2.50, 3.44, 28, 0.052),
    ]):
        step_ang = TAU / count
        for i in range(count):
            a0 = i * step_ang + (0.08 if ring_idx == 1 else 0.0)
            a1 = (i + 1) * step_ang + (0.08 if ring_idx == 1 else 0.0) - 0.024
            objs.append(
                build_wedge_voussoir_block(
                    f"Site1_ApronStone_{ring_idx}_{i}", r0, r1, a0, a1, 0.005, z_top,
                    role_tag="rock" if (i + ring_idx) % 2 == 0 else "rock_alt",
                    bevel_width=0.020, noise_amp=0.006, seed=100 + ring_idx * 40 + i, collection=col
                )
            )

    # 2. Circular Well Mortar Core Cylinder (`r = 1.49m, z = 0.0 .. 0.96m`)
    bm_core = bmesh.new()
    bmesh.ops.create_cone(
        bm_core, cap_ends=True, cap_tris=False, segments=48,
        radius1=1.49, radius2=1.48, depth=0.96, matrix=Matrix.Translation((0.0, 0.0, 0.48))
    )
    objs.append(create_tagged_mesh_obj("Site1_WellMortarCore", bm_core, "mortar", col))

    # 3. 3 Courses of Hand-Chiseled Well Wall Voussoir Blocks (`z = 0.03 .. 0.89m`)
    for c_idx, (z0, z1) in enumerate([(0.03, 0.29), (0.32, 0.58), (0.61, 0.88)]):
        n_blocks = 16
        step_a = TAU / n_blocks
        phase = (c_idx % 2) * (step_a * 0.5)
        for i in range(n_blocks):
            a0 = i * step_a + phase
            a1 = (i + 1) * step_a + phase - 0.036
            objs.append(
                build_wedge_voussoir_block(
                    f"Site1_WellCourse_{c_idx}_{i}", 1.18, 1.535, a0, a1, z0, z1,
                    role_tag="rock" if (i + c_idx) % 2 == 0 else "rock_alt",
                    bevel_width=0.028, noise_amp=0.009, seed=200 + c_idx * 20 + i, collection=col
                )
            )

    bm_rim_sh = bmesh.new()
    bmesh.ops.create_cone(
        bm_rim_sh, cap_ends=True, cap_tris=False, segments=48,
        radius1=1.55, radius2=1.57, depth=0.04, matrix=Matrix.Translation((0.0, 0.0, 0.90))
    )
    objs.append(create_tagged_mesh_obj("Site1_UnderRimShadow", bm_rim_sh, "bezel_shadow", col))

    # 4. Overhanging 12-Block Hand-Hewn Well Coping Rim (`r = 1.14 .. 1.64m, z = 0.92 .. 1.12m`)
    n_rim = 12
    rim_step = TAU / n_rim
    for i in range(n_rim):
        a0 = i * rim_step - rim_step * 0.5
        a1 = (i + 1) * rim_step - rim_step * 0.5 - 0.032
        objs.append(
            build_wedge_voussoir_block(
                f"Site1_WellRim_{i}", 1.14, 1.64, a0, a1, 0.92, 1.12,
                role_tag="highlight" if i % 2 == 0 else "rock",
                bevel_width=0.032, noise_amp=0.010, seed=260 + i, collection=col
            )
        )

    # 5. Hollow Raised Chamfered Stone Molding Frame + Regular Quad-Grid Recessed Keystone Tablet
    curved_parts = []

    curved_parts.append(
        build_grid_tablet_obj(
            "Site1_KeystoneTablet",
            width=1.42,
            height=0.70,
            center_xyz=(0.0, -1.568, 0.47),
            rot_euler=(math.pi * 0.5, 0.0, 0.0),
            x_segs=32,
            y_segs=18,
            role_tag="tablet_site1",
            collection=col,
        )
    )

    for m_name, mx, my, mz, sx, sy, sz, r_tag in [
        ("Site1_FrameTop", 0.0, -1.582, 0.835, 1.54, 0.055, 0.065, "highlight"),
        ("Site1_FrameTopShadow", 0.0, -1.572, 0.792, 1.42, 0.045, 0.028, "bezel_shadow"),
        ("Site1_FrameBot", 0.0, -1.582, 0.105, 1.54, 0.055, 0.065, "highlight"),
        ("Site1_FrameBotShadow", 0.0, -1.572, 0.068, 1.56, 0.045, 0.025, "bezel_shadow"),
        ("Site1_FrameLeft", -0.735, -1.582, 0.47, 0.075, 0.055, 0.72, "rock"),
        ("Site1_FrameRight", 0.735, -1.582, 0.47, 0.075, 0.055, 0.72, "rock"),
        ("Site1_FilletTop", 0.0, -1.568, 0.775, 1.36, 0.032, 0.022, "rock_alt"),
        ("Site1_FilletBot", 0.0, -1.568, 0.165, 1.36, 0.032, 0.022, "highlight"),
        ("Site1_FilletLeft", -0.675, -1.568, 0.47, 0.024, 0.032, 0.62, "bezel_shadow"),
        ("Site1_FilletRight", 0.675, -1.568, 0.47, 0.024, 0.032, 0.62, "highlight"),
    ]:
        bm_f = bmesh.new()
        bmesh.ops.create_cube(bm_f, size=1.0)
        bmesh.ops.scale(bm_f, vec=(sx, sy, sz), verts=bm_f.verts)
        bmesh.ops.subdivide_edges(bm_f, edges=bm_f.edges[:], cuts=4, use_grid_fill=True)
        bmesh.ops.bevel(bm_f, geom=bm_f.edges[:], offset=0.008, offset_type='OFFSET', segments=1, profile=0.7, affect='EDGES')
        bmesh.ops.translate(bm_f, vec=(mx, my, mz), verts=bm_f.verts)
        bmesh.ops.recalc_face_normals(bm_f, faces=bm_f.faces)
        curved_parts.append(create_tagged_mesh_obj(m_name, bm_f, r_tag, col, smooth=False))

    # 6. OUR REAL `VolumetricFlowerSculptor` Multi-Whorl Goblet Crimson Roses, Spiral Rosebud Hearts,
    #    Fluted Briar Vines & Serrated Compound Leaves!
    roses_vine_obj = build_rich_climbing_rose_vine_mesh("Site1_VolumetricRosesAndVines", collection=col)
    curved_parts.append(roses_vine_obj)

    # 7. Crisp Un-Mangled 8-Line Garamond Poem (`y = -1.572m`)
    poem_objs = build_crisp_carved_poem_meshes(
        prefix="Site1_Poem",
        lines=poem_data["lines"],
        origin_xyz=(0.0, -1.572, 0.47),
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

    # 1. Stepped Outer Sanctuary Tiers (`R = 4.50m`, `z = 0.0 .. 0.48m`)
    for tier_idx, (r_bot, r_top, z0, z1, n_seg) in enumerate([
        (4.50, 4.40, 0.00, 0.18, 28),
        (3.85, 3.75, 0.17, 0.35, 24),
    ]):
        bm_step = bmesh.new()
        bmesh.ops.create_cone(
            bm_step, cap_ends=True, cap_tris=False, segments=48,
            radius1=r_bot - 0.04, radius2=r_top - 0.04, depth=z1 - z0,
            matrix=Matrix.Translation((0.0, 0.0, (z0 + z1) * 0.5))
        )
        objs.append(create_tagged_mesh_obj(f"Site2_TierCore_{tier_idx}", bm_step, "mortar", col))

        step_a = TAU / n_seg
        for i in range(n_seg):
            a0 = i * step_a + tier_idx * 0.12
            a1 = (i + 1) * step_a + tier_idx * 0.12 - 0.026
            objs.append(
                build_wedge_voussoir_block(
                    f"Site2_TierBlock_{tier_idx}_{i}", r_top - 0.55, r_top, a0, a1, z0, z1,
                    role_tag="rock" if (i + tier_idx) % 2 == 0 else "rock_alt",
                    bevel_width=0.026, noise_amp=0.008, seed=500 + tier_idx * 40 + i, collection=col
                )
            )

    # 2. Upper Mortar Bed (`R = 3.25m, z = 0.34 .. 0.47m`)
    bm_topbed = bmesh.new()
    bmesh.ops.create_cone(
        bm_topbed, cap_ends=True, cap_tris=False, segments=64,
        radius1=3.25, radius2=3.20, depth=0.13, matrix=Matrix.Translation((0.0, 0.0, 0.405))
    )
    objs.append(create_tagged_mesh_obj("Site2_TopMortarBed", bm_topbed, "mortar", col))

    # 3. Outer Ring of 20 Weathered Radial Flagstones (`r = 2.18 .. 3.20m, z = 0.35 .. 0.52m`)
    n_outer = 20
    outer_step = TAU / n_outer
    for i in range(n_outer):
        a0 = i * outer_step
        a1 = (i + 1) * outer_step - 0.028
        objs.append(
            build_wedge_voussoir_block(
                f"Site2_OuterFlagstone_{i}", 2.18, 3.20, a0, a1, 0.35, 0.52,
                role_tag="rock" if i % 2 == 0 else "rock_alt",
                bevel_width=0.028, noise_amp=0.008, seed=600 + i, collection=col
            )
        )

    # 4. Middle Ring of 16 Carved Flagstones (`r = 1.64 .. 2.15m, z = 0.36 .. 0.54m`)
    n_mid = 16
    mid_step = TAU / n_mid
    for i in range(n_mid):
        a0 = i * mid_step + 0.06
        a1 = (i + 1) * mid_step + 0.06 - 0.028
        objs.append(
            build_wedge_voussoir_block(
                f"Site2_MidFlagstone_{i}", 1.64, 2.15, a0, a1, 0.36, 0.54,
                role_tag="rock_alt" if i % 2 == 0 else "rock",
                bevel_width=0.028, noise_amp=0.008, seed=630 + i, collection=col
            )
        )

    # Sculpted Stone Bas-Relief Roses & Vine Scrolls on the Middle Flagstone Ring (`VolumetricFlowerSculptor` in stone relief!)
    objs.append(build_stone_relief_rose_ring_mesh("Site2_StoneReliefRoseRing", radius=1.88, z_height=0.542, collection=col))

    # 5. Raised Stepped 18-Block Stone Basin Curb Ring (`r = 1.34 .. 1.62m, z = 0.36 .. 0.58m`)
    n_curb = 18
    curb_step = TAU / n_curb
    for i in range(n_curb):
        a0 = i * curb_step + 0.09
        a1 = (i + 1) * curb_step + 0.09 - 0.026
        objs.append(
            build_wedge_voussoir_block(
                f"Site2_BasinCurb_{i}", 1.34, 1.62, a0, a1, 0.36, 0.58,
                role_tag="highlight" if i % 2 == 0 else "rock",
                bevel_width=0.028, noise_amp=0.008, seed=650 + i, collection=col
            )
        )

    bm_curb_sh = bmesh.new()
    bmesh.ops.create_cone(
        bm_curb_sh, cap_ends=False, cap_tris=False, segments=64,
        radius1=1.34, radius2=1.35, depth=0.08, matrix=Matrix.Translation((0.0, 0.0, 0.50))
    )
    bmesh.ops.solidify(bm_curb_sh, geom=bm_curb_sh.faces[:], thickness=0.035)
    bmesh.ops.recalc_face_normals(bm_curb_sh, faces=bm_curb_sh.faces)
    objs.append(create_tagged_mesh_obj("Site2_CurbShadowWall", bm_curb_sh, "bezel_shadow", col))

    # 6. Regular Grid Sunken Central Monolithic Limestone Basin Floor (`R = 1.35m, z = 0.480m`)
    bm_disc = bmesh.new()
    bmesh.ops.create_grid(bm_disc, x_segments=32, y_segments=32, size=1.36)
    for v in bm_disc.verts:
        r = math.hypot(v.co.x, v.co.y)
        if r > 1.35:
            v.co.x *= 1.35 / r
            v.co.y *= 1.35 / r
        v.co.z = 0.480
    bmesh.ops.recalc_face_normals(bm_disc, faces=bm_disc.faces)
    objs.append(create_tagged_mesh_obj("Site2_SunkenBasinDisc", bm_disc, "tablet_site2", col, smooth=True))

    # 7. High-Res Crevice Moss Tufts & `VolumetricFlowerSculptor` Fallen Cupped Crimson Petals + Corner Blooms
    moss_crevices = []
    for k in range(36):
        ang = (k / 36.0) * TAU + (k % 3) * 0.04
        r_m = 1.63 if k % 2 == 0 else (1.33 if k % 3 == 0 else 2.16)
        z_m = 0.54 if k % 2 == 0 else (0.485 if k % 3 == 0 else 0.525)
        moss_crevices.append((math.cos(ang) * r_m, math.sin(ang) * r_m, z_m, 0.095, 0.075, 0.040))
    objs.append(build_highres_moss_carpet("Site2_CreviceMoss", moss_crevices, seed=709, collection=col))

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
    Computes rich, weathered Ghibli sandstone/limestone tones, recess frame AO,
    clean facet-normal bevel highlights/shadows (ZERO sawtooth N-gon artifacts!),
    moss gradients, and V-cut letter tones directly into `col_baked`.
    """
    mesh = obj.data
    if "col_baked" in mesh.color_attributes:
        return

    role = obj.get("role_tag", "rock")
    baked_attr = mesh.color_attributes.new(name="col_baked", type='FLOAT_COLOR', domain='CORNER')

    c_poem_core = srgb_hex("#2b1c10")      # Deep chiseled umber letter core
    c_poem_shadow = srgb_hex("#160d06")    # Dark incised upper-left V-cut shadow
    c_poem_lip = srgb_hex("#f7ebd0")       # Bright sunlit cream bottom-right catchlight lip

    c_tab_center = srgb_hex("#d4c3a6")     # Warm weathered sandstone tablet center
    c_tab_sun = srgb_hex("#e0d0b5")        # Warm sunlit upper-center tablet glow
    c_tab_edge_ao = srgb_hex("#8f7c62")    # Rich warm taupe recess frame AO around tablet perimeter
    c_tab_crack = srgb_hex("#705e48")      # Subtle hairline stone fracture vein

    c_rock_sun = srgb_hex("#e6d8be")       # Sunlit top/chamfer rock plane
    c_rock_mid = srgb_hex("#c9b698")       # Primary weathered limestone face
    c_rock_alt = srgb_hex("#b8a385")       # Secondary warm sandstone block
    c_rock_side = srgb_hex("#947f63")      # Angled side rock facet
    c_rock_under = srgb_hex("#594734")     # Downward overhang / recess bezel shadow
    c_rock_ridge = srgb_hex("#f5e9d0")     # Crisp chiseled top-bevel highlight
    c_mortar = srgb_hex("#3d2f21")         # Deep mortar joint shadow

    c_moss_deep = srgb_hex("#1c3d12")      # Deep forest moss crevice shadow
    c_moss_mid = srgb_hex("#3e7824")       # Rich Ghibli cushion moss green
    c_moss_tip = srgb_hex("#78ba3f")       # Sunlit olive-chartreuse moss crown

    sun_dir = Vector((-0.38, -0.45, 0.81)).normalized()

    verts = mesh.vertices
    for poly in mesh.polygons:
        p_norm = poly.normal
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
            elif role == "moss":
                n_m = noise.noise(co * 4.5 + Vector((2.1, 5.3, 8.7)))
                up_t = smoothstep(-0.15, 0.75, n.z + n_m * 0.22)
                col = lerp_col(c_moss_deep, c_moss_mid, smoothstep(0.0, 0.55, up_t))
                col = lerp_col(col, c_moss_tip, smoothstep(0.48, 0.95, up_t))
            elif role.startswith("tablet"):
                m1 = noise.noise(co * 1.6 + Vector((1.3, 4.7, 2.9)))
                m2 = noise.noise(co * 5.2 + Vector((7.1, 2.3, 6.1)))
                col = lerp_col(c_tab_center, c_tab_sun, 0.5 + m1 * 0.35 + m2 * 0.15)
                if role == "tablet_site3":
                    dx = abs(co.x) / 1.56
                    dz = abs(co.z - 1.43) / 0.80
                    edge_d = max(dx, dz)
                    top_ao = smoothstep(1.88, 2.22, co.z) * 0.62
                    frame_ao = max(smoothstep(0.75, 1.00, edge_d) * 0.68, top_ao)
                elif role == "tablet_site1":
                    dx = abs(co.x) / 0.68
                    dz = abs(co.z - 0.47) / 0.33
                    edge_d = max(dx, dz)
                    top_ao = smoothstep(0.66, 0.79, co.z) * 0.65
                    frame_ao = max(smoothstep(0.74, 1.00, edge_d) * 0.68, top_ao)
                else:  # tablet_site2
                    r_d = math.hypot(co.x, co.y) / 1.34
                    frame_ao = smoothstep(0.76, 1.00, r_d) * 0.72
                col = lerp_col(col, c_tab_edge_ao, frame_ao)
                v_crack = abs(noise.noise(co * 2.4 + Vector((m1 * 0.8, m2 * 0.8, 3.1))))
                if v_crack < 0.024:
                    col = lerp_col(col, c_tab_crack, (1.0 - v_crack / 0.024) * 0.42)
            elif role == "mortar":
                col = c_mortar
            elif role == "bezel_shadow":
                m1 = noise.noise(co * 2.5)
                col = lerp_col(c_rock_under, c_rock_side, 0.25 + m1 * 0.15)
            else:
                # Clean facet-normal shading on rock monolith & grid voussoir blocks
                base_c = c_rock_sun if role == "highlight" else (c_rock_alt if role == "rock_alt" else c_rock_mid)
                ndl = n.dot(sun_dir)
                top_f = smoothstep(0.32, 0.80, n.z)
                side_f = min(1.0, abs(n.x) * 0.58 + max(0.0, -ndl) * 0.38)
                under_f = smoothstep(-0.10, -0.62, n.z)

                is_upper_chamfer = (
                    smoothstep(0.25, 0.65, p_norm.z) * smoothstep(0.92, 0.55, p_norm.z)
                    if not poly.use_smooth
                    else 0.0
                )

                col = lerp_col(base_c, c_rock_side, side_f * 0.65)
                col = lerp_col(col, c_rock_sun, top_f * 0.78)
                col = lerp_col(col, c_rock_ridge, is_upper_chamfer * 0.55)
                col = lerp_col(col, c_rock_under, under_f * 0.75)

                m1 = noise.noise(co * 2.1 + Vector((3.7, 1.9, 5.4)))
                col = (
                    max(0.0, min(1.0, col[0] * (0.94 + m1 * 0.12))),
                    max(0.0, min(1.0, col[1] * (0.94 + m1 * 0.12))),
                    max(0.0, min(1.0, col[2] * (0.94 + m1 * 0.12))),
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
