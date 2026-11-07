#!/usr/bin/env python3
"""
Helper module that bridges `VolumetricFlowerSculptor` from `world/tools/build-blender-flowers.py`
directly into `world/tools/build-stone-inscriptions-blender.py`, converting its non-indexed
triangles, sculptural normals, and 6-stop per-vertex botanical color gradients into Blender
Mesh objects with a populated `col_baked` (`BYTE_COLOR`) vertex color layer.
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
):
    """
    Sculpts our full 3-whorl goblet-cupped crimson rose + spiral rosebud heart + green sepal calyx
    from `build_crimson_rose` in `build-blender-flowers.py`.
    """
    c_pt = Vector(center)
    up = Vector(head_axis).normalized()

    # 1. Spiral rosebud heart & green calyx receptacle
    s.add_rose_spiral_core_and_calyx(
        c_pt,
        up,
        radius=0.044 * scale,
        height=0.082 * scale,
        rot=rot + 0.35,
        c_sepal=c_sepal,
        c_throat_deep=c_throat_deep,
        c_core_mid=c_scarlet_mid,
        c_core_rim=c_blush_heart,
        sides=6,
    )

    # 2. Outer 7-petal wide goblet rose whorl
    for p in range(7):
        s.add_goblet_rose_petal(
            bloom_center=c_pt,
            head_axis=up,
            petal_yaw=rot + (p / 7.0) * TAU,
            cup_radius=0.086 * scale,
            cup_height=0.084 * scale,
            width_angle=1.35,
            lip_flare=0.18,
            thickness=0.020 * scale,
            c_inner_throat=c_inner_cup,
            c_outer_belly=c_outer_belly,
            c_mid_wall=c_scarlet_mid,
            c_rim_sun=c_coral_rim,
        )

    # 3. Middle 6-petal cupped whorl
    for p in range(6):
        s.add_goblet_rose_petal(
            bloom_center=c_pt + up * (0.010 * scale),
            head_axis=up,
            petal_yaw=rot + ((p + 0.5) / 6.0) * TAU,
            cup_radius=0.062 * scale,
            cup_height=0.088 * scale,
            width_angle=1.42,
            lip_flare=0.10,
            thickness=0.018 * scale,
            c_inner_throat=c_throat_deep,
            c_outer_belly=c_inner_cup,
            c_mid_wall=c_scarlet_mid,
            c_rim_sun=c_coral_rim,
        )

    # 4. Inner 5-petal upright velvet whorl surrounding the spiral heart
    for p in range(5):
        s.add_goblet_rose_petal(
            bloom_center=c_pt + up * (0.018 * scale),
            head_axis=up,
            petal_yaw=rot + 0.25 + (p / 5.0) * TAU,
            cup_radius=0.042 * scale,
            cup_height=0.086 * scale,
            width_angle=1.48,
            lip_flare=0.04,
            thickness=0.015 * scale,
            c_inner_throat=c_throat_deep,
            c_outer_belly=c_scarlet_mid,
            c_mid_wall=c_coral_rim,
            c_rim_sun=c_blush_heart,
        )


def build_rich_climbing_rose_vine_mesh(name, collection=None):
    """
    Builds the lush climbing ivy & crimson valley rose vines framing the left and right sides
    of the Village Well Keystone plaque (`Option B`), using `VolumetricFlowerSculptor` from
    `build-blender-flowers.py`.
    """
    s = VolumetricFlowerSculptor(name)

    # Exact botanical color stops from `build_crimson_rose` and `build_witcher_briar_arch`
    c_bark_furrow = srgb_hex("#382613")
    c_bark_mid = srgb_hex("#634723")
    c_bark_ridge = srgb_hex("#8f6a37")
    c_bark_knot = srgb_hex("#b5894b")

    c_leaf_base = srgb_hex("#153a1a")
    c_leaf_mid = srgb_hex("#2f7329")
    c_leaf_tip = srgb_hex("#60b340")

    c_leaf2_base = srgb_hex("#112e14")
    c_leaf2_mid = srgb_hex("#245c20")
    c_leaf2_tip = srgb_hex("#4a9432")

    c_throat_deep = srgb_hex("#38060a")
    c_inner_cup = srgb_hex("#6b0d14")
    c_outer_belly = srgb_hex("#a61622")
    c_scarlet_mid = srgb_hex("#d92332")
    c_coral_rim = srgb_hex("#f4525b")
    c_blush_heart = srgb_hex("#ff8c94")

    for side in (-1.0, 1.0):
        # 1. Two intertwined fluted woody climbing vine stems per side
        pts_main = [
            (side * 0.81, -1.565, 0.03),
            (side * 0.76, -1.592, 0.25),
            (side * 0.82, -1.595, 0.49),
            (side * 0.75, -1.595, 0.73),
            (side * 0.66, -1.595, 0.95),
            (side * 0.42, -1.560, 1.13),
        ]
        pts_sec = [
            (side * 0.87, -1.558, 0.06),
            (side * 0.84, -1.585, 0.34),
            (side * 0.75, -1.588, 0.59),
            (side * 0.83, -1.588, 0.85),
            (side * 0.70, -1.575, 1.12),
        ]
        _add_fluted_vine_tube(s, pts_main, 0.024, 0.012, c_bark_furrow, c_bark_mid, c_bark_ridge, c_bark_knot, segs=28, sides=7)
        _add_fluted_vine_tube(s, pts_sec, 0.017, 0.009, c_bark_furrow, c_bark_mid, c_bark_ridge, c_bark_knot, segs=24, sides=6)

        # 2. 22 Keeled, Serrated 3D Botanical Leaves (`add_oriented_serrated_leaf`) per side
        leaf_configs = [
            (side * 0.85, -1.592, 0.08, (side * 0.75, -0.15, 0.65), 0.14, 0.062, 0),
            (side * 0.73, -1.592, 0.13, (-side * 0.72, -0.15, 0.68), 0.13, 0.058, 1),
            (side * 0.89, -1.588, 0.18, (side * 0.88, -0.12, 0.42), 0.13, 0.058, 0),
            (side * 0.86, -1.595, 0.28, (side * 0.78, -0.15, 0.60), 0.15, 0.066, 1),
            (side * 0.71, -1.595, 0.32, (-side * 0.68, -0.15, 0.72), 0.14, 0.062, 0),
            (side * 0.90, -1.590, 0.39, (side * 0.85, -0.15, 0.50), 0.14, 0.062, 1),
            (side * 0.72, -1.595, 0.43, (-side * 0.75, -0.18, 0.62), 0.13, 0.058, 0),
            (side * 0.88, -1.595, 0.55, (side * 0.80, -0.15, 0.58), 0.15, 0.066, 0),
            (side * 0.70, -1.595, 0.58, (-side * 0.70, -0.15, 0.70), 0.14, 0.062, 1),
            (side * 0.89, -1.590, 0.66, (side * 0.85, -0.12, 0.50), 0.13, 0.058, 0),
            (side * 0.69, -1.595, 0.69, (-side * 0.68, -0.15, 0.72), 0.13, 0.058, 1),
            (side * 0.84, -1.595, 0.82, (side * 0.72, -0.15, 0.68), 0.14, 0.062, 1),
            (side * 0.67, -1.595, 0.84, (-side * 0.62, -0.15, 0.76), 0.14, 0.062, 0),
            (side * 0.78, -1.595, 0.92, (side * 0.55, -0.15, 0.82), 0.14, 0.062, 0),
            (side * 0.62, -1.592, 0.98, (-side * 0.72, -0.15, 0.68), 0.14, 0.062, 1),
            (side * 0.54, -1.585, 1.05, (-side * 0.82, -0.15, 0.52), 0.14, 0.060, 0),
            (side * 0.44, -1.575, 1.10, (-side * 0.90, -0.15, 0.35), 0.13, 0.056, 1),
            (side * 0.72, -1.585, 1.06, (side * 0.65, -0.15, 0.72), 0.13, 0.058, 0),
        ]
        for lx, ly, lz, fwd_d, ll, lw, pal_i in leaf_configs:
            cb = c_leaf_base if pal_i == 0 else c_leaf2_base
            cm = c_leaf_mid if pal_i == 0 else c_leaf2_mid
            ct = c_leaf_tip if pal_i == 0 else c_leaf2_tip
            # Radial normal pointing outward from well face (-Y) and slightly up (+Z)
            s.add_oriented_serrated_leaf(
                origin=(lx, ly, lz),
                forward_dir=fwd_d,
                up_dir=(side * 0.12, -0.96, 0.25),
                length=ll,
                width=lw,
                arch_lift=0.028,
                c_base=cb,
                c_mid=cm,
                c_tip=ct,
                u_attach=0.0,
            )

        # 3. 3 Large Multi-Whorl Goblet Crimson Roses + 2 Rosebuds per side (`Option B`!)
        # Placed at y = -1.632 so rose cups sit cleanly in front of the leaves at y = -1.590 (zero leaf poke-through!)
        rose_specs = [
            (side * 0.79, -1.632, 0.21, (side * 0.15, -0.96, 0.22), 1.18, 0.25),
            (side * 0.78, -1.636, 0.48, (side * 0.12, -0.97, 0.20), 1.32, 1.40),
            (side * 0.74, -1.632, 0.76, (side * 0.16, -0.95, 0.25), 1.22, 2.65),
            # Tight rosebuds
            (side * 0.87, -1.628, 0.35, (side * 0.28, -0.92, 0.28), 0.76, 0.85),
            (side * 0.65, -1.628, 0.63, (-side * 0.22, -0.94, 0.26), 0.72, 2.10),
        ]
        for rx, ry, rz, axis_d, r_sc, r_rot in rose_specs:
            # Add a 4-leaf basal rosette right behind each main rose bloom (at ry + 0.038 so it stays behind the cup!)
            if r_sc > 1.0:
                for b_i in range(4):
                    b_ang = r_rot + (b_i / 4.0) * TAU + 0.4
                    f_dir = (math.cos(b_ang), 0.10, math.sin(b_ang))
                    s.add_oriented_serrated_leaf(
                        origin=(rx, ry + 0.038, rz),
                        forward_dir=f_dir,
                        up_dir=axis_d,
                        length=0.115 * r_sc,
                        width=0.052 * r_sc,
                        arch_lift=0.022,
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
                c_sepal=c_throat_deep,
                c_throat_deep=c_throat_deep,
                c_inner_cup=c_inner_cup,
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

    c_leaf_base = srgb_hex("#153a1a")
    c_leaf_mid = srgb_hex("#2f7329")
    c_leaf_tip = srgb_hex("#60b340")

    c_throat_deep = srgb_hex("#38060a")
    c_inner_cup = srgb_hex("#6b0d14")
    c_outer_belly = srgb_hex("#a61622")
    c_scarlet_mid = srgb_hex("#d92332")
    c_coral_rim = srgb_hex("#f4525b")
    c_blush_heart = srgb_hex("#ff8c94")

    # 1. 18 Cupped Fallen Velvet Rose Petals (`add_goblet_rose_petal`) resting along the sunken basin floor & curb
    for i in range(18):
        ang = (i / 18.0) * TAU + (i % 3) * 0.14
        r_p = 1.25 if i % 2 == 0 else (1.66 if i % 3 == 0 else 1.48)
        z_p = 0.483 if i % 2 == 0 else (0.544 if i % 3 == 0 else 0.582)
        px, py = math.cos(ang) * r_p, math.sin(ang) * r_p
        s.add_goblet_rose_petal(
            bloom_center=(px, py, z_p),
            head_axis=(math.cos(ang) * 0.15, math.sin(ang) * 0.15, 0.98),
            petal_yaw=ang + i * 1.1,
            cup_radius=0.068,
            cup_height=0.028,
            width_angle=1.35,
            lip_flare=0.16,
            thickness=0.012,
            c_inner_throat=c_inner_cup,
            c_outer_belly=c_outer_belly,
            c_mid_wall=c_scarlet_mid,
            c_rim_sun=c_coral_rim,
        )

    # 2. Lush Living Crimson Rose Corner Cluster at the upper-right flagstone edge (matching Option C's top-right roses!)
    for rx, ry, rz, r_sc, r_rot in [
        (1.85, 1.55, 0.56, 1.35, 0.4),
        (2.08, 1.42, 0.55, 1.18, 1.7),
        (1.72, 1.74, 0.55, 1.12, 2.9),
    ]:
        for b_i in range(5):
            b_ang = r_rot + (b_i / 5.0) * TAU
            s.add_oriented_serrated_leaf(
                origin=(rx, ry, rz - 0.01),
                forward_dir=(math.cos(b_ang), math.sin(b_ang), 0.15),
                up_dir=(0.0, 0.0, 1.0),
                length=0.16 * r_sc,
                width=0.068 * r_sc,
                arch_lift=0.032,
                c_base=c_leaf_base,
                c_mid=c_leaf_mid,
                c_tip=c_leaf_tip,
                u_attach=0.0,
            )
        _add_full_multiwhorl_crimson_rose(
            s,
            center=(rx, ry, rz),
            head_axis=(-0.15, -0.20, 0.96),
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


def build_stone_relief_rose_ring_mesh(name, radius=1.88, z_height=0.542, collection=None):
    """
    Uses `VolumetricFlowerSculptor` to sculpt the 8 Chiseled Stone Bas-Relief Roses, Stone Leaves,
    and Curved Stone Vine Scrolls on the middle flagstone ring of `Site 2` (matching `Option C`!),
    baked with warm chiseled limestone relief shading (`#4a3928` deep undercut -> `#f4e8cf` sunlit rim).
    """
    s = VolumetricFlowerSculptor(name)

    c_stone_deep = srgb_hex("#4a3928")
    c_stone_shadow = srgb_hex("#6e5b43")
    c_stone_mid = srgb_hex("#9e896d")
    c_stone_warm = srgb_hex("#c4b092")
    c_stone_sun = srgb_hex("#e3d4b8")
    c_stone_rim = srgb_hex("#f5ead2")

    for r_idx in range(8):
        ang = (r_idx / 8.0) * TAU + 0.39
        rx, ry = math.cos(ang) * radius, math.sin(ang) * radius

        # 1. Curved chiseled stone vine scroll flanking the stone rose
        v_pts = []
        for s_i in range(-4, 5):
            a_v = ang + s_i * 0.082
            r_v = radius + math.sin(s_i * 0.95) * 0.055
            v_pts.append((math.cos(a_v) * r_v, math.sin(a_v) * r_v, z_height + 0.006))
        _add_fluted_vine_tube(
            s, v_pts, 0.022, 0.014,
            c_stone_deep, c_stone_mid, c_stone_sun, c_stone_rim,
            segs=18, sides=6,
        )

        # 2. 4 Chiseled stone bas-relief leaves flanking each stone rose along the vine scroll
        for l_off, l_side in [(-0.18, 1.0), (-0.10, -1.0), (0.10, 1.0), (0.18, -1.0)]:
            a_l = ang + l_off
            lx, ly = math.cos(a_l) * radius, math.sin(a_l) * radius
            t_dir = (-math.sin(a_l) * (1.0 if l_off > 0 else -1.0), math.cos(a_l) * (1.0 if l_off > 0 else -1.0), 0.0)
            r_dir = (math.cos(a_l) * l_side * 0.55 + t_dir[0] * 0.75, math.sin(a_l) * l_side * 0.55 + t_dir[1] * 0.75, 0.12)
            s.add_oriented_serrated_leaf(
                origin=(lx, ly, z_height + 0.008),
                forward_dir=r_dir,
                up_dir=(0.0, 0.0, 1.0),
                length=0.16,
                width=0.072,
                arch_lift=0.024,
                c_base=c_stone_shadow,
                c_mid=c_stone_warm,
                c_tip=c_stone_rim,
                u_attach=0.0,
            )

        # 3. Chiseled 3-whorl stone bas-relief rose at `(rx, ry, z_height + 0.012)`
        _add_full_multiwhorl_crimson_rose(
            s,
            center=(rx, ry, z_height + 0.012),
            head_axis=(0.0, 0.0, 1.0),
            scale=1.35,
            rot=ang,
            c_sepal=c_stone_shadow,
            c_throat_deep=c_stone_deep,
            c_inner_cup=c_stone_shadow,
            c_outer_belly=c_stone_mid,
            c_scarlet_mid=c_stone_warm,
            c_coral_rim=c_stone_sun,
            c_blush_heart=c_stone_rim,
        )

    return sculptor_to_blender_baked_mesh_obj(s, name, collection=collection)
