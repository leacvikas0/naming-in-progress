#!/usr/bin/env python3
"""
Helper module that bridges `VolumetricFlowerSculptor` from `world/tools/build-blender-flowers.py`
directly into `world/tools/build-stone-inscriptions-blender.py`, converting its non-indexed
triangles, sculptural normals, and 6-stop per-vertex botanical color gradients into Blender
Mesh objects with a populated `col_baked` (`FLOAT_COLOR`) vertex color layer.
"""

import os
import math
import importlib.util
import bpy
import bmesh
from mathutils import Vector

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
FLOWERS_PY = os.path.join(THIS_DIR, "build-blender-flowers.py")

_spec = importlib.util.spec_from_file_location("build_blender_flowers_mod", FLOWERS_PY)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)

VolumetricFlowerSculptor = _mod.VolumetricFlowerSculptor
srgb_hex = _mod.srgb_hex
lerp_col = _mod.lerp_col
TAU = math.pi * 2.0


def sculptor_to_blender_baked_mesh_obj(sculptor, name, collection=None):
    """
    Converts a `VolumetricFlowerSculptor` (authored directly in Blender X, Y, Z coordinates)
    into a Blender Mesh object with custom split normals and a `col_baked` vertex color layer.
    """
    bm = bmesh.new()
    n_verts = len(sculptor.pos) // 3
    loop_normals = []
    loop_colors = []

    for i in range(0, n_verts, 3):
        vs = []
        tri_cols = []
        tri_nrms = []
        for k in range(3):
            idx = (i + k) * 3
            px, py, pz = sculptor.pos[idx], sculptor.pos[idx + 1], sculptor.pos[idx + 2]
            nx, ny, nz = sculptor.nrm[idx], sculptor.nrm[idx + 1], sculptor.nrm[idx + 2]
            cr, cg, cb = sculptor.col[idx], sculptor.col[idx + 1], sculptor.col[idx + 2]
            v = bm.verts.new((px, py, pz))
            vs.append(v)
            tri_nrms.append(Vector((nx, ny, nz)).normalized())
            tri_cols.append((cr, cg, cb, 1.0))
        try:
            bm.faces.new(vs)
            loop_normals.extend(tri_nrms)
            loop_colors.extend(tri_cols)
        except ValueError:
            pass

    bm.normal_update()
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    for poly in mesh.polygons:
        poly.use_smooth = True

    if len(loop_normals) == len(mesh.loops):
        mesh.normals_split_custom_set(loop_normals)

    baked_attr = mesh.color_attributes.new(name="col_baked", type='FLOAT_COLOR', domain='CORNER')
    for idx, rgba in enumerate(loop_colors):
        if idx < len(baked_attr.data):
            baked_attr.data[idx].color = rgba

    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    obj["role_tag"] = "prebaked_botanical"
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def _add_fluted_vine_tube(
    s,
    ctrl_pts,
    r_root,
    r_tip,
    c_furrow,
    c_mid,
    c_ridge,
    c_knot,
    segs=28,
    sides=7,
):
    """
    Sculpts a smooth, fluted, multi-cord woody vine along `ctrl_pts` using Catmull-Rom / piecewise
    smooth interpolation in Blender (X, Y, Z) space, matching `build_witcher_briar_arch`.
    """
    pts = [Vector(p) for p in ctrl_pts]
    n_ctrl = len(pts)

    def eval_curve(u):
        t_scaled = u * (n_ctrl - 1)
        idx = min(n_ctrl - 2, max(0, int(t_scaled)))
        f = t_scaled - idx
        p0 = pts[max(0, idx - 1)]
        p1 = pts[idx]
        p2 = pts[min(n_ctrl - 1, idx + 1)]
        p3 = pts[min(n_ctrl - 1, idx + 2)]
        f2 = f * f
        f3 = f2 * f
        return 0.5 * (
            (2.0 * p1)
            + (-p0 + p2) * f
            + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * f2
            + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * f3
        )

    rings = []
    for step in range(segs + 1):
        u = step / segs
        center = eval_curve(u)
        pa = eval_curve(max(0.0, u - 0.01))
        pb = eval_curve(min(1.0, u + 0.01))
        tang = (pb - pa).normalized()
        ref = Vector((0.0, 1.0, 0.0)) if abs(tang.y) < 0.9 else Vector((1.0, 0.0, 0.0))
        right = tang.cross(ref).normalized()
        up = right.cross(tang).normalized()

        swell = 1.0 + 0.08 * math.sin(step * 1.3)
        base_r = (r_root * (1.0 - u * 0.45) + r_tip * (u * 0.45)) * swell

        pts_ring, nrms_ring, cols_ring = [], [], []
        for k in range(sides):
            ang = (k / sides) * TAU + step * 0.28
            flute = 1.0 + 0.14 * math.cos(k * 2.0 + step * 0.45)
            radial = (right * math.cos(ang) + up * math.sin(ang)).normalized()
            pt = center + radial * (base_r * flute)
            nrm = (radial * 0.90 - Vector((0.0, 1.0, 0.0)) * 0.20).normalized()
            c_v = lerp_col(c_mid, c_ridge, 0.55) if k % 2 == 0 else lerp_col(c_furrow, c_mid, 0.45)
            if step % 3 == 0 and k % 2 == 0:
                c_v = lerp_col(c_v, c_knot, 0.40)
            pts_ring.append(pt)
            nrms_ring.append(nrm)
            cols_ring.append(c_v)
        rings.append((pts_ring, nrms_ring, cols_ring))

    for step in range(segs):
        pa, na, ca = rings[step]
        pb, nb, cb = rings[step + 1]
        for k in range(sides):
            nk = (k + 1) % sides
            s.add_quad(
                pa[k], pa[nk], pb[nk], pb[k],
                ca[k], ca[nk], cb[nk], cb[k],
                na[k], na[nk], nb[nk], nb[k],
            )


def _add_full_multiwhorl_crimson_rose(
    s,
    center,
    head_axis,
    scale,
    rot,
    c_sepal,
    c_throat_deep,
    c_inner_cup,
    c_outer_belly,
    c_scarlet_mid,
    c_coral_rim,
    c_blush_heart,
    z_flatten=1.0,
):
    """
    Sculpts our full 3-whorl goblet-cupped crimson rose + spiral rosebud heart + green sepal calyx
    from `build_crimson_rose` in `build-blender-flowers.py`.
    Uses rounded, overlapping goblet petals (`lip_flare=0.08`, 8 outer / 7 middle / 5 inner)
    so blooms look plush and botanical rather than spiky.
    """
    c_pt = Vector(center)
    up = Vector(head_axis).normalized()
    h_sc = scale * z_flatten

    # 1. Spiral rosebud heart & green calyx receptacle
    s.add_rose_spiral_core_and_calyx(
        c_pt,
        up,
        radius=0.042 * scale,
        height=0.076 * h_sc,
        rot=rot + 0.35,
        c_sepal=c_sepal,
        c_throat_deep=c_throat_deep,
        c_core_mid=c_scarlet_mid,
        c_core_rim=c_blush_heart,
        sides=6,
    )

    # 2. Outer 8-petal wide rounded goblet rose whorl
    for p in range(8):
        s.add_goblet_rose_petal(
            bloom_center=c_pt,
            head_axis=up,
            petal_yaw=rot + (p / 8.0) * TAU,
            cup_radius=0.082 * scale,
            cup_height=0.076 * h_sc,
            width_angle=1.45,
            lip_flare=0.08,
            thickness=0.018 * scale,
            c_inner_throat=c_inner_cup,
            c_outer_belly=c_outer_belly,
            c_mid_wall=c_scarlet_mid,
            c_rim_sun=c_coral_rim,
        )

    # 3. Middle 7-petal cupped whorl
    for p in range(7):
        s.add_goblet_rose_petal(
            bloom_center=c_pt + up * (0.008 * h_sc),
            head_axis=up,
            petal_yaw=rot + ((p + 0.5) / 7.0) * TAU,
            cup_radius=0.060 * scale,
            cup_height=0.078 * h_sc,
            width_angle=1.48,
            lip_flare=0.05,
            thickness=0.016 * scale,
            c_inner_throat=c_throat_deep,
            c_outer_belly=c_inner_cup,
            c_mid_wall=c_scarlet_mid,
            c_rim_sun=c_coral_rim,
        )

    # 4. Inner 5-petal upright velvet whorl surrounding the spiral heart
    for p in range(5):
        s.add_goblet_rose_petal(
            bloom_center=c_pt + up * (0.015 * h_sc),
            head_axis=up,
            petal_yaw=rot + 0.25 + (p / 5.0) * TAU,
            cup_radius=0.040 * scale,
            cup_height=0.076 * h_sc,
            width_angle=1.52,
            lip_flare=0.02,
            thickness=0.014 * scale,
            c_inner_throat=c_throat_deep,
            c_outer_belly=c_scarlet_mid,
            c_mid_wall=c_coral_rim,
            c_rim_sun=c_blush_heart,
        )


def _add_tight_crimson_rosebud(
    s,
    center,
    head_axis,
    scale,
    rot,
    c_sepal,
    c_throat_deep,
    c_outer_belly,
    c_scarlet_mid,
    c_coral_rim,
    c_blush_heart,
):
    """
    Sculpts a pointed, spiral crimson rosebud with clasping green calyx sepals (matching Option B!).
    """
    c_pt = Vector(center)
    up = Vector(head_axis).normalized()
    s.add_rose_spiral_core_and_calyx(
        c_pt,
        up,
        radius=0.034 * scale,
        height=0.084 * scale,
        rot=rot,
        c_sepal=c_sepal,
        c_throat_deep=c_throat_deep,
        c_core_mid=c_scarlet_mid,
        c_core_rim=c_blush_heart,
        sides=6,
    )
    for p in range(4):
        s.add_goblet_rose_petal(
            bloom_center=c_pt + up * (0.005 * scale),
            head_axis=up,
            petal_yaw=rot + (p / 4.0) * TAU,
            cup_radius=0.034 * scale,
            cup_height=0.072 * scale,
            width_angle=1.48,
            lip_flare=0.01,
            thickness=0.012 * scale,
            c_inner_throat=c_throat_deep,
            c_outer_belly=c_outer_belly,
            c_mid_wall=c_scarlet_mid,
            c_rim_sun=c_coral_rim,
        )


def build_rich_climbing_rose_vine_mesh(name, collection=None):
    """
    Builds the lush climbing ivy & crimson valley rose vines framing the left and right sides
    of the Village Well Keystone plaque (`Option B`), using `VolumetricFlowerSculptor` from
    `build-blender-flowers.py`.
    """
    s = VolumetricFlowerSculptor(name)

    c_bark_furrow = srgb_hex("#45311c")
    c_bark_mid = srgb_hex("#6e5030")
    c_bark_ridge = srgb_hex("#967145")
    c_bark_knot = srgb_hex("#b88e58")

    c_leaf_base = srgb_hex("#1d4520")
    c_leaf_mid = srgb_hex("#38732c")
    c_leaf_tip = srgb_hex("#6ca844")

    c_leaf2_base = srgb_hex("#163819")
    c_leaf2_mid = srgb_hex("#2d6124")
    c_leaf2_tip = srgb_hex("#579439")

    c_leaf3_base = srgb_hex("#244f22")
    c_leaf3_mid = srgb_hex("#498534")
    c_leaf3_tip = srgb_hex("#82bd52")

    c_throat_deep = srgb_hex("#3d070c")
    c_inner_cup = srgb_hex("#730e17")
    c_outer_belly = srgb_hex("#ad1724")
    c_scarlet_mid = srgb_hex("#db2535")
    c_coral_rim = srgb_hex("#f4505b")
    c_blush_heart = srgb_hex("#ff8a93")

    palettes = [
        (c_leaf_base, c_leaf_mid, c_leaf_tip),
        (c_leaf2_base, c_leaf2_mid, c_leaf2_tip),
        (c_leaf3_base, c_leaf3_mid, c_leaf3_tip),
    ]

    for side in (-1.0, 1.0):
        # 1. Three intertwined fluted woody climbing vine stems per side (hugging well stones & coping rim)
        pts_main = [
            (side * 0.82, -1.568, 0.02),
            (side * 0.77, -1.594, 0.22),
            (side * 0.83, -1.598, 0.46),
            (side * 0.75, -1.598, 0.70),
            (side * 0.69, -1.615, 0.91),
            (side * 0.52, -1.635, 1.04),
        ]
        pts_sec = [
            (side * 0.88, -1.562, 0.04),
            (side * 0.85, -1.588, 0.30),
            (side * 0.76, -1.592, 0.56),
            (side * 0.84, -1.592, 0.80),
            (side * 0.78, -1.632, 0.99),
            (side * 0.64, -1.632, 1.05),
        ]
        pts_top_trail = [
            (side * 0.72, -1.618, 0.90),
            (side * 0.84, -1.635, 0.98),
            (side * 0.98, -1.632, 1.03),
            (side * 1.12, -1.622, 0.98),
        ]
        _add_fluted_vine_tube(s, pts_main, 0.022, 0.011, c_bark_furrow, c_bark_mid, c_bark_ridge, c_bark_knot, segs=28, sides=7)
        _add_fluted_vine_tube(s, pts_sec, 0.016, 0.008, c_bark_furrow, c_bark_mid, c_bark_ridge, c_bark_knot, segs=24, sides=6)
        _add_fluted_vine_tube(s, pts_top_trail, 0.012, 0.006, c_bark_furrow, c_bark_mid, c_bark_ridge, c_bark_knot, segs=16, sides=5)

        # 2. Dense, natural trifoliate/clustered ivy & rose leaves hugging the front wall & coping face
        stem_nodes = [
            (side * 0.82, -1.592, 0.07, 0.96),
            (side * 0.75, -1.596, 0.13, 1.02),
            (side * 0.86, -1.594, 0.20, 0.94),
            (side * 0.73, -1.598, 0.27, 1.04),
            (side * 0.85, -1.596, 0.34, 0.98),
            (side * 0.72, -1.598, 0.41, 1.00),
            (side * 0.86, -1.596, 0.49, 1.02),
            (side * 0.73, -1.598, 0.56, 0.96),
            (side * 0.85, -1.596, 0.64, 1.00),
            (side * 0.72, -1.598, 0.71, 1.02),
            (side * 0.83, -1.596, 0.79, 0.96),
            (side * 0.71, -1.602, 0.85, 0.94),
            (side * 0.69, -1.614, 0.90, 0.92),
            # Upper coping stone front face leaves
            (side * 0.78, -1.638, 0.96, 0.90),
            (side * 0.64, -1.638, 1.01, 0.88),
            (side * 0.52, -1.638, 1.03, 0.84),
            (side * 0.92, -1.636, 0.99, 0.86),
            (side * 1.04, -1.632, 0.97, 0.82),
        ]
        for n_i, (nx, ny, nz, sc_l) in enumerate(stem_nodes):
            base_yaw = (-0.50 if n_i % 2 == 0 else 0.50) * side
            sub_angles = [base_yaw - 0.46, base_yaw, base_yaw + 0.46]
            for s_idx, ang_off in enumerate(sub_angles):
                cb, cm, ct = palettes[(n_i + s_idx) % 3]
                fx = math.sin(ang_off) * 0.85 + side * (0.20 if s_idx == 0 else -0.16)
                fz = math.cos(ang_off) * 0.72 + (0.22 if nz < 0.92 else -0.10)
                fy = -0.12
                ll = (0.102 if s_idx == 1 else 0.086) * sc_l
                lw = (0.050 if s_idx == 1 else 0.042) * sc_l
                up_d = (side * 0.12, -0.96, 0.22)
                s.add_oriented_serrated_leaf(
                    origin=(nx + (s_idx - 1) * 0.016 * side, ny - s_idx * 0.003, nz + (s_idx - 1) * 0.012),
                    forward_dir=(fx, fy, fz),
                    up_dir=up_d,
                    length=ll,
                    width=lw,
                    arch_lift=0.014 * sc_l,
                    c_base=cb,
                    c_mid=cm,
                    c_tip=ct,
                    u_attach=0.0,
                )

        # 3. Multi-Whorl Goblet Crimson Roses + Pointed Spiral Rosebuds (matching Option B layout!)
        if side < 0:
            rose_specs = [
                (side * 0.79, -1.628, 0.20, (side * 0.14, -0.96, 0.22), 1.04, 0.25, False),
                (side * 0.78, -1.632, 0.46, (side * 0.12, -0.97, 0.20), 1.12, 1.40, False),
                (side * 0.73, -1.632, 0.77, (side * 0.15, -0.95, 0.25), 1.06, 2.65, False),
                (side * 0.86, -1.618, 0.63, (side * 0.25, -0.92, 0.28), 0.84, 0.85, True),
                (side * 0.67, -1.618, 0.33, (-side * 0.20, -0.94, 0.26), 0.80, 2.10, True),
            ]
        else:
            rose_specs = [
                (side * 0.80, -1.630, 0.35, (side * 0.14, -0.96, 0.22), 1.10, 0.65, False),
                (side * 0.76, -1.632, 0.60, (side * 0.12, -0.97, 0.20), 1.06, 1.95, False),
                (side * 0.72, -1.624, 0.81, (side * 0.18, -0.94, 0.28), 0.86, 2.85, True),
                (side * 0.88, -1.618, 0.48, (side * 0.28, -0.92, 0.26), 0.82, 1.15, True),
                (side * 0.78, -1.618, 0.18, (-side * 0.18, -0.94, 0.24), 0.78, 2.40, True),
            ]

        for rx, ry, rz, axis_d, r_sc, r_rot, is_bud in rose_specs:
            if not is_bud:
                for b_i in range(4):
                    b_ang = r_rot + (b_i / 4.0) * TAU + 0.4
                    f_dir = (math.cos(b_ang), 0.06, math.sin(b_ang))
                    s.add_oriented_serrated_leaf(
                        origin=(rx, ry + 0.030, rz),
                        forward_dir=f_dir,
                        up_dir=axis_d,
                        length=0.095 * r_sc,
                        width=0.045 * r_sc,
                        arch_lift=0.014,
                        c_base=c_leaf_base,
                        c_mid=c_leaf_mid,
                        c_tip=c_leaf_tip,
                        u_attach=0.0,
                    )
                _add_full_multiwhorl_crimson_rose(
                    s,
                    center=(rx, ry, rz),
                    head_axis=axis_d,
                    scale=r_sc,
                    rot=r_rot,
                    c_sepal=c_leaf2_mid,
                    c_throat_deep=c_throat_deep,
                    c_inner_cup=c_inner_cup,
                    c_outer_belly=c_outer_belly,
                    c_scarlet_mid=c_scarlet_mid,
                    c_coral_rim=c_coral_rim,
                    c_blush_heart=c_blush_heart,
                )
            else:
                _add_tight_crimson_rosebud(
                    s,
                    center=(rx, ry, rz),
                    head_axis=axis_d,
                    scale=r_sc,
                    rot=r_rot,
                    c_sepal=c_leaf_mid,
                    c_throat_deep=c_throat_deep,
                    c_outer_belly=c_outer_belly,
                    c_scarlet_mid=c_scarlet_mid,
                    c_coral_rim=c_coral_rim,
                    c_blush_heart=c_blush_heart,
                )

    return sculptor_to_blender_baked_mesh_obj(s, name, collection=collection)


def build_fallen_rose_petals_and_blooms_mesh(name, collection=None):
    """
    Uses `VolumetricFlowerSculptor` (`add_goblet_rose_petal` + `_add_full_multiwhorl_crimson_rose`)
    to place cupped fallen crimson rose petals along the sunken basin rim of `Site 2` and a lush
    living crimson rose bush cluster at the upper-right flagstone corner (matching `Option C`!).
    """
    s = VolumetricFlowerSculptor(name)

    c_leaf_base = srgb_hex("#1d4520")
    c_leaf_mid = srgb_hex("#38732c")
    c_leaf_tip = srgb_hex("#6ca844")

    c_throat_deep = srgb_hex("#3d070c")
    c_inner_cup = srgb_hex("#730e17")
    c_outer_belly = srgb_hex("#ad1724")
    c_scarlet_mid = srgb_hex("#db2535")
    c_coral_rim = srgb_hex("#f4505b")
    c_blush_heart = srgb_hex("#ff8a93")

    # 1. 18 Cupped Fallen Velvet Rose Petals (`add_goblet_rose_petal`) resting along the sunken basin floor & curb
    for i in range(18):
        ang = (i / 18.0) * TAU + (i % 3) * 0.14
        r_p = 1.24 if i % 2 == 0 else (1.68 if i % 3 == 0 else 1.48)
        z_p = 0.483 if i % 2 == 0 else (0.544 if i % 3 == 0 else 0.586)
        px, py = math.cos(ang) * r_p, math.sin(ang) * r_p
        s.add_goblet_rose_petal(
            bloom_center=(px, py, z_p),
            head_axis=(math.cos(ang) * 0.12, math.sin(ang) * 0.12, 0.98),
            petal_yaw=ang + i * 1.1,
            cup_radius=0.064,
            cup_height=0.024,
            width_angle=1.35,
            lip_flare=0.16,
            thickness=0.011,
            c_inner_throat=c_inner_cup,
            c_outer_belly=c_outer_belly,
            c_mid_wall=c_scarlet_mid,
            c_rim_sun=c_coral_rim,
        )

    # 2. Lush Living Crimson Rose Corner Cluster at the upper-right flagstone edge (matching Option C's top-right roses!)
    for rx, ry, rz, r_sc, r_rot in [
        (1.92, 1.62, 0.55, 1.25, 0.4),
        (2.14, 1.48, 0.54, 1.10, 1.7),
        (1.78, 1.80, 0.54, 1.05, 2.9),
    ]:
        for b_i in range(5):
            b_ang = r_rot + (b_i / 5.0) * TAU
            s.add_oriented_serrated_leaf(
                origin=(rx, ry, rz - 0.01),
                forward_dir=(math.cos(b_ang), math.sin(b_ang), 0.15),
                up_dir=(0.0, 0.0, 1.0),
                length=0.15 * r_sc,
                width=0.064 * r_sc,
                arch_lift=0.028,
                c_base=c_leaf_base,
                c_mid=c_leaf_mid,
                c_tip=c_leaf_tip,
                u_attach=0.0,
            )
        _add_full_multiwhorl_crimson_rose(
            s,
            center=(rx, ry, rz),
            head_axis=(-0.12, -0.18, 0.97),
            scale=r_sc,
            rot=r_rot,
            c_sepal=c_leaf_mid,
            c_throat_deep=c_throat_deep,
            c_inner_cup=c_inner_cup,
            c_outer_belly=c_outer_belly,
            c_scarlet_mid=c_scarlet_mid,
            c_coral_rim=c_coral_rim,
            c_blush_heart=c_blush_heart,
        )

    return sculptor_to_blender_baked_mesh_obj(s, name, collection=collection)


def build_stone_relief_rose_ring_mesh(name, radius=1.90, z_height=0.540, collection=None):
    """
    Uses `VolumetricFlowerSculptor` to sculpt the 8 Chiseled Stone Bas-Relief Roses, Stone Leaves,
    and Curved Stone Vine Scrolls on the middle flagstone ring of `Site 2` (matching `Option C`!),
    with raised, connected vine stems and high-contrast chiseled stone relief (`#4e3e2c` -> `#faf3e4`).
    """
    s = VolumetricFlowerSculptor(name)

    c_stone_deep = srgb_hex("#4e3e2c")
    c_stone_shadow = srgb_hex("#7a6750")
    c_stone_mid = srgb_hex("#ad9a7e")
    c_stone_warm = srgb_hex("#d1c2a6")
    c_stone_sun = srgb_hex("#e8dcc4")
    c_stone_rim = srgb_hex("#faf3e4")

    for r_idx in range(8):
        ang = (r_idx / 8.0) * TAU + 0.39
        rx, ry = math.cos(ang) * radius, math.sin(ang) * radius

        # 1. Prominent Curved Chiseled Stone Vine Scroll (`z_height + 0.015`) flanking the stone rose
        v_pts = []
        for s_i in range(-4, 5):
            a_v = ang + s_i * 0.084
            r_v = radius + math.sin(s_i * 0.90) * 0.054
            v_pts.append((math.cos(a_v) * r_v, math.sin(a_v) * r_v, z_height + 0.015))
        _add_fluted_vine_tube(
            s, v_pts, 0.026, 0.017,
            c_stone_deep, c_stone_mid, c_stone_sun, c_stone_rim,
            segs=20, sides=6,
        )

        # 2. 4 Chiseled stone bas-relief leaves attached directly to the vine scroll (`s_i = -3, -1.5, +1.5, +3`)
        for s_f, l_side in [(-2.8, 1.0), (-1.4, -1.0), (1.4, 1.0), (2.8, -1.0)]:
            a_l = ang + s_f * 0.084
            r_l = radius + math.sin(s_f * 0.90) * 0.054
            lx, ly = math.cos(a_l) * r_l, math.sin(a_l) * r_l
            t_dir = (-math.sin(a_l) * (1.0 if s_f > 0 else -1.0), math.cos(a_l) * (1.0 if s_f > 0 else -1.0), 0.0)
            r_dir = (math.cos(a_l) * l_side * 0.62 + t_dir[0] * 0.68, math.sin(a_l) * l_side * 0.62 + t_dir[1] * 0.68, 0.06)
            s.add_oriented_serrated_leaf(
                origin=(lx, ly, z_height + 0.014),
                forward_dir=r_dir,
                up_dir=(0.0, 0.0, 1.0),
                length=0.165,
                width=0.078,
                arch_lift=0.018,
                c_base=c_stone_deep,
                c_mid=c_stone_warm,
                c_tip=c_stone_rim,
                u_attach=0.0,
            )

        # 3. Chiseled 3-whorl stone bas-relief rose (`z_flatten=0.60` for bold carved relief!)
        _add_full_multiwhorl_crimson_rose(
            s,
            center=(rx, ry, z_height + 0.012),
            head_axis=(0.0, 0.0, 1.0),
            scale=1.35,
            rot=ang,
            c_sepal=c_stone_deep,
            c_throat_deep=c_stone_deep,
            c_inner_cup=c_stone_shadow,
            c_outer_belly=c_stone_mid,
            c_scarlet_mid=c_stone_warm,
            c_coral_rim=c_stone_sun,
            c_blush_heart=c_stone_rim,
            z_flatten=0.60,
        )

    return sculptor_to_blender_baked_mesh_obj(s, name, collection=collection)
