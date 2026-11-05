"""
world/tools/build-blender-flowers.py

Headless Blender 5.2.1 LTS (`bmesh` + `mathutils`) 3D Volumetric Flower & Briar Sculptor & Baker.
Models true closed-volume, goblet-cupped 3D flower clusters (`crimsonRose`, `bellflower`, `daisy`,
`lupine`, `cosmos`) AND the Divine Verdict 3D botanical VFX assets (`witcherBriarArch`,
`crimsonFlowerSlump`) with:
- Deep goblet-cupped 2-tier curved 3D petals (rounded chalice lower belly + upright cupped mid-wall + rolled top rim)
- Sculpted 3D spiral rosebud hearts & green/burgundy sepal receptacles
- 3-strand helically braided dark woody wild-rose briar arch (`witcherBriarArch`) with thorny barbs,
  14 serrated compound leaves (forest-green `#16381c` & autumn-burgundy `#4e1620`), 6 tight crimson
  rosebuds, 5 lush spherical-goblet blood-roses (`#4a040e -> #b81428 -> #e11d48`), and explicit
  per-vertex `uv = [uCurveT, vPartKind]` for curve-extruded shader growth
- Quiet, low-profile cobblestone cushion (`crimsonFlowerSlump`, `r ~ 0.95m`, `h = 0.005..0.145m`) of
  9 fallen velvet blood-roses, 12 dark forest-green/burgundy basal leaves, and 24 loose cupped
  crimson petals resting flat on the ground (zero concrete rubble, zero glowing rings)
- True 3D spherical-goblet & petal-cushion vertex normals (zero paper-flat face normals!)
- Baked 3D cavity/whorl ambient occlusion in Linear-RGB vertex colors
- Renders a Blender 5.2 `bx_review` contact sheet (`silhouette`, `matcap`, `normals`) for visual QA
- Exports `world/assets/flowers/blender-flower-data.js` for zero-overhead Three.js instancing.
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Vector

SKILL_SCRIPTS = r"C:\Users\silen\.gemini\antigravity-acp\t3-home\config\skills\scenario-blender-expert\scripts"
if os.path.isdir(SKILL_SCRIPTS) and SKILL_SCRIPTS not in sys.path:
    sys.path.append(SKILL_SCRIPTS)

import bx_review  # noqa: E402

TAU = math.pi * 2.0


def _c_to_lin(c):
    return c / 12.92 if c <= 0.04045 else math.pow((c + 0.055) / 1.055, 2.4)


def srgb_hex(hex_str):
    h = hex_str.lstrip("#")
    r = int(h[0:2], 16) / 255.0
    g = int(h[2:4], 16) / 255.0
    b = int(h[4:6], 16) / 255.0
    return (_c_to_lin(r), _c_to_lin(g), _c_to_lin(b))


def lerp_col(c0, c1, t):
    return (
        c0[0] + (c1[0] - c0[0]) * t,
        c0[1] + (c1[1] - c0[1]) * t,
        c0[2] + (c1[2] - c0[2]) * t,
    )


def smoothstep_py(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / max(1e-6, e1 - e0)))
    return t * t * (3.0 - 2.0 * t)


class VolumetricFlowerSculptor:
    """
    Accumulates non-indexed 3D triangles with explicit per-vertex sculptural normals,
    baked cavity/whorl vertex colors, and optional `[uCurveT, vPartKind]` UV pairs,
    plus builds a matching Blender Mesh datablock with custom split normals for `bx_review`.
    """

    def __init__(self, name, include_uv=False):
        self.name = name
        self.include_uv = include_uv
        self.pos = []
        self.nrm = []
        self.col = []
        self.uv = []
        self.anc = []
        self._default_uv = (0.0, 0.0)
        self._default_anc = (0.0, 0.0, 0.0)

    @property
    def tri_count(self):
        return len(self.pos) // 9

    def set_default_uv(self, u_curve_t, v_part_kind):
        self._default_uv = (round(float(u_curve_t), 4), round(float(v_part_kind), 4))

    def set_default_anc(self, pt):
        if hasattr(pt, "x"):
            self._default_anc = (round(float(pt.x), 5), round(float(pt.y), 5), round(float(pt.z), 5))
        else:
            self._default_anc = (round(float(pt[0]), 5), round(float(pt[1]), 5), round(float(pt[2]), 5))

    def add_tri(
        self,
        p0,
        p1,
        p2,
        c0,
        c1,
        c2,
        n0,
        n1,
        n2,
        uv0=None,
        uv1=None,
        uv2=None,
        anc0=None,
        anc1=None,
        anc2=None,
    ):
        for p in (p0, p1, p2):
            self.pos.extend((round(float(p.x), 5), round(float(p.y), 5), round(float(p.z), 5)))
        for c in (c0, c1, c2):
            self.col.extend((round(float(c[0]), 4), round(float(c[1]), 4), round(float(c[2]), 4)))
        for n in (n0, n1, n2):
            nn = n.normalized() if n.length > 1e-6 else Vector((0.0, 1.0, 0.0))
            self.nrm.extend((round(float(nn.x), 4), round(float(nn.y), 4), round(float(nn.z), 4)))
        for uv_pair in (uv0, uv1, uv2):
            u_val, v_val = uv_pair if uv_pair is not None else self._default_uv
            self.uv.extend((round(float(u_val), 4), round(float(v_val), 4)))
        for a_pt in (anc0, anc1, anc2):
            if a_pt is not None:
                if hasattr(a_pt, "x"):
                    self.anc.extend((round(float(a_pt.x), 5), round(float(a_pt.y), 5), round(float(a_pt.z), 5)))
                else:
                    self.anc.extend((round(float(a_pt[0]), 5), round(float(a_pt[1]), 5), round(float(a_pt[2]), 5)))
            else:
                self.anc.extend(self._default_anc)

    def add_quad(
        self,
        p0,
        p1,
        p2,
        p3,
        c0,
        c1,
        c2,
        c3,
        n0,
        n1,
        n2,
        n3,
        uv0=None,
        uv1=None,
        uv2=None,
        uv3=None,
        anc0=None,
        anc1=None,
        anc2=None,
        anc3=None,
    ):
        self.add_tri(p0, p1, p2, c0, c1, c2, n0, n1, n2, uv0, uv1, uv2, anc0, anc1, anc2)
        self.add_tri(p0, p2, p3, c0, c2, c3, n0, n2, n3, uv0, uv2, uv3, anc0, anc2, anc3)

    def add_curved_stem(self, p0, p1, p2, r0, r1, r2, c_bot, c_mid, c_top, sides=4):
        pts = [Vector(p0), Vector(p1), Vector(p2)]
        rads = [r0, r1, r2]
        cols = [c_bot, c_mid, c_top]
        rings = []
        for s in range(3):
            p = pts[s]
            nxt = pts[s + 1] if s < 2 else pts[s]
            prv = pts[s - 1] if s > 0 else pts[s]
            tang = nxt - prv
            tang.y = max(0.05, tang.y)
            tang.normalize()
            right = Vector((-tang.z, 0.0, tang.x))
            if right.length < 1e-5:
                right = Vector((1.0, 0.0, 0.0))
            right.normalize()
            fwd = tang.cross(right).normalized()

            ring_pts = []
            ring_nrms = []
            r = rads[s]
            for k in range(sides):
                ang = (k / sides) * TAU
                ca, sa = math.cos(ang), math.sin(ang)
                radial = (right * ca + fwd * sa).normalized()
                pt = Vector((
                    p.x + radial.x * r,
                    max(0.0, p.y + radial.y * r),
                    p.z + radial.z * r,
                ))
                nrm = Vector((radial.x, max(0.25, radial.y + 0.35), radial.z)).normalized()
                ring_pts.append(pt)
                ring_nrms.append(nrm)
            rings.append((ring_pts, ring_nrms, cols[s]))

        for s in range(2):
            pts_a, nrms_a, col_a = rings[s]
            pts_b, nrms_b, col_b = rings[s + 1]
            for k in range(sides):
                nk = (k + 1) % sides
                self.add_quad(
                    pts_a[k], pts_a[nk], pts_b[nk], pts_b[k],
                    col_a, col_a, col_b, col_b,
                    nrms_a[k], nrms_a[nk], nrms_b[nk], nrms_b[k],
                )

    def add_rounded_3d_leaf(
        self,
        x0,
        y0,
        z0,
        yaw,
        length,
        width,
        arch_h,
        tip_y,
        c_base,
        c_mid,
        c_tip,
        u_attach=None,
        v_kind=0.5,
    ):
        dx, dz = math.cos(yaw), math.sin(yaw)
        px, pz = -dz, dx
        root = Vector((x0, max(0.004, y0), z0))
        mid_c = Vector((x0 + dx * length * 0.42, max(0.006, y0 + arch_h + width * 0.30), z0 + dz * length * 0.42))
        mid_l = Vector((x0 + dx * length * 0.38 - px * width, max(0.005, y0 + arch_h * 0.72), z0 + dz * length * 0.38 - pz * width))
        mid_r = Vector((x0 + dx * length * 0.38 + px * width, max(0.005, y0 + arch_h * 0.72), z0 + dz * length * 0.38 + pz * width))
        fore_l = Vector((x0 + dx * length * 0.76 - px * width * 0.62, max(0.006, y0 + arch_h * 0.68 + tip_y * 0.35), z0 + dz * length * 0.76 - pz * width * 0.62))
        fore_r = Vector((x0 + dx * length * 0.76 + px * width * 0.62, max(0.006, y0 + arch_h * 0.68 + tip_y * 0.35), z0 + dz * length * 0.76 + pz * width * 0.62))
        tip = Vector((x0 + dx * length, max(0.006, y0 + tip_y), z0 + dz * length))

        n_root = Vector((-dx * 0.25, 0.90, -dz * 0.25)).normalized()
        n_mid = Vector((0.0, 1.0, 0.0))
        n_ml = Vector((-px * 0.68, 0.70, -pz * 0.68)).normalized()
        n_mr = Vector((px * 0.68, 0.70, pz * 0.68)).normalized()
        n_fl = Vector((dx * 0.32 - px * 0.55, 0.76, dz * 0.32 - pz * 0.55)).normalized()
        n_fr = Vector((dx * 0.32 + px * 0.55, 0.76, dz * 0.32 + pz * 0.55)).normalized()
        n_tip = Vector((dx * 0.52, 0.82, dz * 0.52)).normalized()

        c_keel = lerp_col(c_mid, c_tip, 0.45)
        c_fore = lerp_col(c_mid, c_tip, 0.75)

        if u_attach is not None:
            uv_root = (min(1.0, u_attach), v_kind)
            uv_mid = (min(1.0, u_attach + 0.03), v_kind)
            uv_fore = (min(1.0, u_attach + 0.055), v_kind)
            uv_tip = (min(1.0, u_attach + 0.075), v_kind)
        else:
            uv_root = uv_mid = uv_fore = uv_tip = None

        self.add_tri(root, mid_r, mid_c, c_base, c_mid, c_keel, n_root, n_mr, n_mid, uv_root, uv_mid, uv_mid)
        self.add_tri(root, mid_c, mid_l, c_base, c_keel, c_mid, n_root, n_mid, n_ml, uv_root, uv_mid, uv_mid)
        self.add_tri(mid_c, mid_r, fore_r, c_keel, c_mid, c_fore, n_mid, n_mr, n_fr, uv_mid, uv_mid, uv_fore)
        self.add_tri(mid_l, mid_c, fore_l, c_mid, c_keel, c_fore, n_ml, n_mid, n_fl, uv_mid, uv_mid, uv_fore)
        self.add_tri(mid_c, fore_r, tip, c_keel, c_fore, c_tip, n_mid, n_fr, n_tip, uv_mid, uv_fore, uv_tip)
        self.add_tri(fore_l, mid_c, tip, c_fore, c_keel, c_tip, n_fl, n_mid, n_tip, uv_fore, uv_mid, uv_tip)

    def add_oriented_serrated_leaf(
        self,
        origin,
        forward_dir,
        up_dir,
        length,
        width,
        arch_lift,
        c_base,
        c_mid,
        c_tip,
        u_attach,
        v_kind=0.5,
    ):
        o = Vector(origin)
        fwd = Vector(forward_dir).normalized()
        up = Vector(up_dir).normalized()
        side = fwd.cross(up)
        if side.length < 1e-5:
            side = Vector((1.0, 0.0, 0.0))
        side.normalize()
        up = side.cross(fwd).normalized()

        root = o
        mid_c = o + fwd * (length * 0.42) + up * (arch_lift + width * 0.28)
        mid_l = o + fwd * (length * 0.36) - side * width + up * (arch_lift * 0.55)
        mid_r = o + fwd * (length * 0.36) + side * width + up * (arch_lift * 0.55)
        fore_l = o + fwd * (length * 0.74) - side * (width * 0.68) + up * (arch_lift * 0.45)
        fore_r = o + fwd * (length * 0.74) + side * (width * 0.68) + up * (arch_lift * 0.45)
        tip = o + fwd * length - up * (arch_lift * 0.15)

        n_root = (up * 0.88 - fwd * 0.25).normalized()
        n_mid = up
        n_ml = (up * 0.72 - side * 0.62).normalized()
        n_mr = (up * 0.72 + side * 0.62).normalized()
        n_fl = (up * 0.75 - side * 0.52 + fwd * 0.25).normalized()
        n_fr = (up * 0.75 + side * 0.52 + fwd * 0.25).normalized()
        n_tip = (up * 0.80 + fwd * 0.45).normalized()

        c_keel = lerp_col(c_mid, c_tip, 0.45)
        c_fore = lerp_col(c_mid, c_tip, 0.78)

        uv_root = (min(1.0, u_attach), v_kind)
        uv_mid = (min(1.0, u_attach + 0.03), v_kind)
        uv_fore = (min(1.0, u_attach + 0.055), v_kind)
        uv_tip = (min(1.0, u_attach + 0.075), v_kind)

        self.add_tri(root, mid_r, mid_c, c_base, c_mid, c_keel, n_root, n_mr, n_mid, uv_root, uv_mid, uv_mid)
        self.add_tri(root, mid_c, mid_l, c_base, c_keel, c_mid, n_root, n_mid, n_ml, uv_root, uv_mid, uv_mid)
        self.add_tri(mid_c, mid_r, fore_r, c_keel, c_mid, c_fore, n_mid, n_mr, n_fr, uv_mid, uv_mid, uv_fore)
        self.add_tri(mid_l, mid_c, fore_l, c_mid, c_keel, c_fore, n_ml, n_mid, n_fl, uv_mid, uv_mid, uv_fore)
        self.add_tri(mid_c, fore_r, tip, c_keel, c_fore, c_tip, n_mid, n_fr, n_tip, uv_mid, uv_fore, uv_tip)
        self.add_tri(fore_l, mid_c, tip, c_fore, c_keel, c_tip, n_fl, n_mid, n_tip, uv_fore, uv_mid, uv_tip)

    def add_goblet_rose_petal(
        self,
        bloom_center,
        head_axis,
        petal_yaw,
        cup_radius,
        cup_height,
        width_angle,
        lip_flare,
        thickness,
        c_inner_throat,
        c_outer_belly,
        c_mid_wall,
        c_rim_sun,
        u_attach=None,
        v_kind=1.0,
    ):
        c_pt = Vector(bloom_center)
        up = Vector(head_axis).normalized()
        ref = Vector((1.0, 0.0, 0.0)) if abs(up.y) > 0.9 else Vector((0.0, 1.0, 0.0))
        t_right = up.cross(ref).normalized()
        t_fwd = t_right.cross(up).normalized()

        def radial_vec(ang):
            return (t_right * math.cos(ang) + t_fwd * math.sin(ang)).normalized()

        r_center = radial_vec(petal_yaw)
        r_left = radial_vec(petal_yaw - width_angle * 0.52)
        r_right = radial_vec(petal_yaw + width_angle * 0.52)

        v_base = c_pt - up * (cup_height * 0.38) + r_center * (cup_radius * 0.18)
        v_out_belly = c_pt + r_center * (cup_radius * 1.08 + thickness) + up * (cup_height * 0.08)
        v_in_throat = c_pt + r_center * (cup_radius * 0.68 - thickness * 0.4) + up * (cup_height * 0.14)
        v_wing_l = c_pt + r_left * (cup_radius * 0.98) + up * (cup_height * 0.56)
        v_wing_r = c_pt + r_right * (cup_radius * 0.98) + up * (cup_height * 0.56)
        v_lip_top = c_pt + r_center * (cup_radius * (1.02 + lip_flare)) + up * (cup_height * 0.78)

        n_base = (-up * 0.75 + r_center * 0.45).normalized()
        n_in_throat = (-r_center * 0.72 - up * 0.42).normalized()
        n_out_belly = (r_center * 0.92 - up * 0.18).normalized()
        n_wing_l = (r_left * 0.75 + up * 0.58).normalized()
        n_wing_r = (r_right * 0.75 + up * 0.58).normalized()
        n_lip_top = (up * 0.88 + r_center * 0.42).normalized()

        if u_attach is not None:
            uv_base = (min(1.0, u_attach), v_kind)
            uv_mid = (min(1.0, u_attach + 0.035), v_kind)
            uv_wing = (min(1.0, u_attach + 0.060), v_kind)
            uv_lip = (min(1.0, u_attach + 0.080), v_kind)
        else:
            uv_base = uv_mid = uv_wing = uv_lip = None

        self.add_tri(v_base, v_in_throat, v_wing_l, c_inner_throat, c_inner_throat, c_mid_wall, n_base, n_in_throat, n_wing_l, uv_base, uv_mid, uv_wing)
        self.add_tri(v_base, v_wing_r, v_in_throat, c_inner_throat, c_mid_wall, c_inner_throat, n_base, n_wing_r, n_in_throat, uv_base, uv_wing, uv_mid)
        self.add_tri(v_in_throat, v_lip_top, v_wing_l, c_inner_throat, c_rim_sun, c_mid_wall, n_in_throat, n_lip_top, n_wing_l, uv_mid, uv_lip, uv_wing)
        self.add_tri(v_in_throat, v_wing_r, v_lip_top, c_inner_throat, c_mid_wall, c_rim_sun, n_in_throat, n_wing_r, n_lip_top, uv_mid, uv_wing, uv_lip)

        self.add_tri(v_base, v_wing_l, v_out_belly, c_outer_belly, c_mid_wall, c_outer_belly, n_base, n_wing_l, n_out_belly, uv_base, uv_wing, uv_mid)
        self.add_tri(v_base, v_out_belly, v_wing_r, c_outer_belly, c_outer_belly, c_mid_wall, n_base, n_out_belly, n_wing_r, uv_base, uv_mid, uv_wing)
        self.add_tri(v_out_belly, v_wing_l, v_lip_top, c_outer_belly, c_mid_wall, c_rim_sun, n_out_belly, n_wing_l, n_lip_top, uv_mid, uv_wing, uv_lip)
        self.add_tri(v_out_belly, v_lip_top, v_wing_r, c_outer_belly, c_rim_sun, c_mid_wall, n_out_belly, n_lip_top, n_wing_r, uv_mid, uv_lip, uv_wing)

    def add_closed_cushion_petal(
        self,
        center,
        head_axis,
        petal_yaw,
        pitch,
        length,
        width,
        thickness,
        curl,
        c_inner_cup,
        c_outer_belly,
        c_mid,
        c_rim_sun,
    ):
        c_pt = Vector(center)
        up = Vector(head_axis).normalized()
        ref = Vector((1.0, 0.0, 0.0)) if abs(up.y) > 0.9 else Vector((0.0, 1.0, 0.0))
        t_right = up.cross(ref).normalized()
        t_fwd = t_right.cross(up).normalized()

        cy, sy = math.cos(petal_yaw), math.sin(petal_yaw)
        rad_dir = (t_right * cy + t_fwd * sy).normalized()
        lat_dir = (t_fwd * cy - t_right * sy).normalized()

        cp, sp = math.cos(pitch), math.sin(pitch)
        p_long = (rad_dir * cp + up * sp).normalized()
        p_out = (rad_dir * sp - up * cp).normalized()

        def pt(along, lat, out_off):
            v = c_pt + p_long * along + lat_dir * lat + p_out * out_off
            return Vector((v.x, max(0.01, v.y), v.z))

        v_base = pt(0.0, 0.0, 0.0)
        v_in_c = pt(length * 0.46, 0.0, -thickness * 0.52)
        v_out_c = pt(length * 0.44, 0.0, thickness * 1.25)
        v_wing_l = pt(length * 0.58, -width * 0.86, -thickness * 0.14)
        v_wing_r = pt(length * 0.58, width * 0.86, -thickness * 0.14)
        v_tip = pt(length * 1.0, 0.0, curl)

        n_base = (-p_long * 0.5 - up * 0.5).normalized()
        n_in_c = (-p_out * 0.75 - up * 0.35).normalized()
        n_out_c = (p_out * 0.88 + up * 0.25).normalized()
        n_wing_l = (up * 0.72 - lat_dir * 0.48 + p_out * 0.30).normalized()
        n_wing_r = (up * 0.72 + lat_dir * 0.48 + p_out * 0.30).normalized()
        n_tip = (up * 0.82 + p_long * 0.42 + p_out * 0.32).normalized()

        self.add_tri(v_base, v_in_c, v_wing_l, c_inner_cup, c_inner_cup, c_mid, n_base, n_in_c, n_wing_l)
        self.add_tri(v_base, v_wing_r, v_in_c, c_inner_cup, c_mid, c_inner_cup, n_base, n_wing_r, n_in_c)
        self.add_tri(v_in_c, v_tip, v_wing_l, c_inner_cup, c_rim_sun, c_mid, n_in_c, n_tip, n_wing_l)
        self.add_tri(v_in_c, v_wing_r, v_tip, c_inner_cup, c_mid, c_rim_sun, n_in_c, n_wing_r, n_tip)

        self.add_tri(v_base, v_wing_l, v_out_c, c_inner_cup, c_mid, c_outer_belly, n_base, n_wing_l, n_out_c)
        self.add_tri(v_base, v_out_c, v_wing_r, c_inner_cup, c_outer_belly, c_mid, n_base, n_out_c, n_wing_r)
        self.add_tri(v_out_c, v_wing_l, v_tip, c_outer_belly, c_mid, c_rim_sun, n_out_c, n_wing_l, n_tip)
        self.add_tri(v_out_c, v_tip, v_wing_r, c_outer_belly, c_rim_sun, c_mid, n_out_c, n_tip, n_wing_r)

    def add_rose_spiral_core_and_calyx(
        self,
        center,
        head_axis,
        radius,
        height,
        rot,
        c_sepal,
        c_throat_deep,
        c_core_mid,
        c_core_rim,
        sides=5,
        u_attach=None,
        v_kind=1.0,
    ):
        c_pt = Vector(center)
        up = Vector(head_axis).normalized()
        ref = Vector((1.0, 0.0, 0.0)) if abs(up.y) > 0.9 else Vector((0.0, 1.0, 0.0))
        t_right = up.cross(ref).normalized()
        t_fwd = t_right.cross(up).normalized()

        calyx_bot = c_pt - up * (height * 0.58)
        n_bot = -up

        mid_ring = []
        mid_nrms = []
        top_ring = []
        top_nrms = []

        for i in range(sides):
            a0 = rot + (i / sides) * TAU
            a1 = rot + (i / sides) * TAU + 0.45
            d0 = t_right * math.cos(a0) + t_fwd * math.sin(a0)
            d1 = t_right * math.cos(a1) + t_fwd * math.sin(a1)

            p_mid = c_pt + d0 * (radius * 0.98) - up * (height * 0.14)
            p_top = c_pt + d1 * (radius * 0.72) + up * (height * 0.74)
            mid_ring.append(p_mid)
            mid_nrms.append((d0 * 0.85 - up * 0.35).normalized())
            top_ring.append(p_top)
            top_nrms.append((up * 0.82 + d1 * 0.42).normalized())

        throat_pt = c_pt + up * (height * 0.18)
        n_throat = (-up * 0.75 + t_right * 0.2).normalized()

        if u_attach is not None:
            uv_bot = (min(1.0, u_attach), v_kind)
            uv_mid = (min(1.0, u_attach + 0.03), v_kind)
            uv_top = (min(1.0, u_attach + 0.065), v_kind)
        else:
            uv_bot = uv_mid = uv_top = None

        for i in range(sides):
            ni = (i + 1) % sides
            self.add_tri(
                calyx_bot, mid_ring[ni], mid_ring[i],
                c_sepal, c_sepal, c_sepal,
                n_bot, mid_nrms[ni], mid_nrms[i],
                uv_bot, uv_mid, uv_mid,
            )
            self.add_tri(
                mid_ring[i], mid_ring[ni], top_ring[i],
                c_core_mid, c_core_mid, c_core_rim,
                mid_nrms[i], mid_nrms[ni], top_nrms[i],
                uv_mid, uv_mid, uv_top,
            )
            self.add_tri(
                top_ring[i], top_ring[ni], throat_pt,
                c_core_rim, c_core_rim, c_throat_deep,
                top_nrms[i], top_nrms[ni], n_throat,
                uv_top, uv_top, uv_mid,
            )

    def add_3d_domed_center(self, center, head_axis, radius, dome_h, c_base_ao, c_rim, c_top):
        c_pt = Vector(center)
        up = Vector(head_axis).normalized()
        ref = Vector((1.0, 0.0, 0.0)) if abs(up.y) > 0.9 else Vector((0.0, 1.0, 0.0))
        t_right = up.cross(ref).normalized()
        t_fwd = t_right.cross(up).normalized()

        apex = c_pt + up * dome_h
        bot = c_pt - up * (dome_h * 0.48)
        n_apex = up
        n_bot = -up

        sides = 6
        ring = []
        nrms = []
        for i in range(sides):
            a = (i / sides) * TAU
            d = t_right * math.cos(a) + t_fwd * math.sin(a)
            ring.append(c_pt + d * radius + up * (dome_h * 0.18))
            nrms.append((d * 0.72 + up * 0.58).normalized())

        for i in range(sides):
            ni = (i + 1) % sides
            self.add_tri(ring[i], ring[ni], apex, c_rim, c_rim, c_top, nrms[i], nrms[ni], n_apex)
            self.add_tri(bot, ring[ni], ring[i], c_base_ao, c_rim, c_rim, n_bot, nrms[ni], nrms[i])

    def to_blender_object(self, offset_x=0.0, offset_y=0.0):
        """Creates a Blender Mesh object with welded vertices & custom normals for `bx_review`."""
        bm = bmesh.new()
        n_verts = len(self.pos) // 3
        loop_normals = []
        for i in range(0, n_verts, 3):
            vs = []
            for k in range(3):
                idx = (i + k) * 3
                tx, ty, tz = self.pos[idx], self.pos[idx + 1], self.pos[idx + 2]
                nx, ny, nz = self.nrm[idx], self.nrm[idx + 1], self.nrm[idx + 2]
                v = bm.verts.new((tx + offset_x, -tz + offset_y, ty))
                vs.append(v)
                loop_normals.append(Vector((nx, -nz, ny)).normalized())
            try:
                bm.faces.new(vs)
            except ValueError:
                pass
        bm.normal_update()
        me = bpy.data.meshes.new(self.name)
        bm.to_mesh(me)
        bm.free()
        for poly in me.polygons:
            poly.use_smooth = True
        if len(loop_normals) == len(me.loops):
            me.normals_split_custom_set(loop_normals)
        ob = bpy.data.objects.new(self.name, me)
        bpy.context.scene.collection.objects.link(ob)
        return ob


def build_crimson_rose():
    s = VolumetricFlowerSculptor("crimsonRose")
    c_leaf_base = srgb_hex("#163d1c")
    c_leaf_mid = srgb_hex("#32782c")
    c_leaf_tip = srgb_hex("#64b844")
    c_stem_bot = srgb_hex("#1b4620")
    c_stem_mid = srgb_hex("#387c30")
    c_stem_top = srgb_hex("#56a240")

    c_throat_deep = srgb_hex("#380806")
    c_inner_cup = srgb_hex("#68120e")
    c_outer_belly = srgb_hex("#a42018")
    c_scarlet_mid = srgb_hex("#d83224")
    c_coral_rim = srgb_hex("#f4644e")
    c_blush_heart = srgb_hex("#ff9c88")

    for i in range(6):
        a = i * (TAU / 6.0) + (i % 2) * 0.16
        length = 0.145 + (i % 3) * 0.018
        width = 0.058 + (i % 2) * 0.012
        s.add_rounded_3d_leaf(
            math.cos(a) * 0.022, 0.008, math.sin(a) * 0.022,
            a, length, width,
            0.055 + (i % 2) * 0.016, 0.024,
            c_leaf_base, c_leaf_mid, c_leaf_tip,
        )

    rose_stems = [
        {"x0": 0.01, "z0": 0.01, "x2": 0.03, "y2": 0.46, "z2": 0.04, "tilt": (0.08, 0.98, 0.12), "scale": 1.16, "rot": 0.2},
        {"x0": -0.03, "z0": 0.02, "x2": -0.13, "y2": 0.39, "z2": 0.08, "tilt": (-0.28, 0.94, 0.18), "scale": 1.04, "rot": 1.4},
        {"x0": 0.03, "z0": -0.02, "x2": 0.14, "y2": 0.35, "z2": -0.10, "tilt": (0.30, 0.93, -0.22), "scale": 0.98, "rot": 2.7},
        {"x0": 0.02, "z0": 0.03, "x2": 0.11, "y2": 0.28, "z2": 0.12, "tilt": (0.24, 0.90, 0.30), "scale": 0.92, "rot": 3.9},
        {"x0": -0.02, "z0": -0.03, "x2": -0.11, "y2": 0.31, "z2": -0.11, "tilt": (-0.24, 0.92, -0.24), "scale": 0.94, "rot": 5.1},
    ]

    for idx, rs in enumerate(rose_stems):
        x1 = (rs["x0"] + rs["x2"]) * 0.52
        y1 = rs["y2"] * 0.54
        z1 = (rs["z0"] + rs["z2"]) * 0.52
        s.add_curved_stem(
            (rs["x0"], 0.0, rs["z0"]),
            (x1, y1, z1),
            (rs["x2"], rs["y2"], rs["z2"]),
            0.018, 0.015, 0.013,
            c_stem_bot, c_stem_mid, c_stem_top, 4,
        )

        if idx < 3:
            leaf_yaw = idx * 2.15 + 0.55
            s.add_rounded_3d_leaf(
                x1, y1, z1,
                leaf_yaw, 0.105 * rs["scale"], 0.044 * rs["scale"],
                0.036, 0.015,
                c_leaf_base, c_leaf_mid, c_leaf_tip,
            )

        center = Vector((rs["x2"], rs["y2"], rs["z2"]))
        up = Vector(rs["tilt"]).normalized()
        sc = rs["scale"]

        s.add_rose_spiral_core_and_calyx(
            center,
            up,
            radius=0.046 * sc,
            height=0.088 * sc,
            rot=rs["rot"] + 0.35,
            c_sepal=c_stem_mid,
            c_throat_deep=c_throat_deep,
            c_core_mid=c_scarlet_mid,
            c_core_rim=c_blush_heart,
        )

        for p in range(5):
            s.add_goblet_rose_petal(
                bloom_center=center,
                head_axis=up,
                petal_yaw=rs["rot"] + (p / 5.0) * TAU,
                cup_radius=0.078 * sc,
                cup_height=0.092 * sc,
                width_angle=1.42,
                lip_flare=0.14,
                thickness=0.022 * sc,
                c_inner_throat=c_inner_cup,
                c_outer_belly=c_outer_belly,
                c_mid_wall=c_scarlet_mid,
                c_rim_sun=c_coral_rim,
            )

        for p in range(5):
            s.add_goblet_rose_petal(
                bloom_center=center + up * (0.010 * sc),
                head_axis=up,
                petal_yaw=rs["rot"] + ((p + 0.5) / 5.0) * TAU,
                cup_radius=0.056 * sc,
                cup_height=0.096 * sc,
                width_angle=1.48,
                lip_flare=0.06,
                thickness=0.018 * sc,
                c_inner_throat=c_throat_deep,
                c_outer_belly=c_scarlet_mid,
                c_mid_wall=c_coral_rim,
                c_rim_sun=c_blush_heart,
            )

    assert s.tri_count <= 620, f"crimsonRose tri_count={s.tri_count} > 620"
    return s


def build_daisy():
    s = VolumetricFlowerSculptor("daisy")
    c_leaf_base = srgb_hex("#1e4e20")
    c_leaf_mid = srgb_hex("#449234")
    c_leaf_tip = srgb_hex("#78cc4e")
    c_stem_bot = srgb_hex("#245a24")
    c_stem_mid = srgb_hex("#4e9c3a")
    c_stem_top = srgb_hex("#7ec852")

    c_cup_sage = srgb_hex("#b8ccb0")
    c_belly_cream = srgb_hex("#dce8d6")
    c_petal_ivory = srgb_hex("#f6faf2")
    c_petal_sun = srgb_hex("#ffffff")
    c_disk_ao = srgb_hex("#b45309")
    c_disk_rim = srgb_hex("#f59e0b")
    c_disk_top = srgb_hex("#fde047")

    for i in range(6):
        a = i * (TAU / 6.0) + (i % 3) * 0.15
        s.add_rounded_3d_leaf(
            math.cos(a) * 0.02, 0.006, math.sin(a) * 0.02,
            a, 0.15 + (i % 3) * 0.02, 0.052, 0.052, 0.022,
            c_leaf_base, c_leaf_mid, c_leaf_tip,
        )

    blooms = [
        {"x": 0.02, "y": 0.45, "z": 0.03, "axis": (0.10, 0.98, 0.14), "scale": 1.10, "rot": 0.1},
        {"x": -0.13, "y": 0.39, "z": 0.08, "axis": (-0.28, 0.93, 0.20), "scale": 0.98, "rot": 0.8},
        {"x": 0.14, "y": 0.35, "z": -0.09, "axis": (0.30, 0.92, -0.22), "scale": 0.92, "rot": 1.7},
        {"x": -0.09, "y": 0.29, "z": -0.12, "axis": (-0.24, 0.91, -0.30), "scale": 0.85, "rot": 2.5},
    ]

    for bl in blooms:
        s.add_curved_stem(
            (0.0, 0.0, 0.0),
            (bl["x"] * 0.52, bl["y"] * 0.55, bl["z"] * 0.52),
            (bl["x"], bl["y"], bl["z"]),
            0.015, 0.012, 0.010,
            c_stem_bot, c_stem_mid, c_stem_top, 4,
        )
        center = (bl["x"], bl["y"], bl["z"])
        sc = bl["scale"]
        for p in range(6):
            s.add_closed_cushion_petal(
                center=center,
                head_axis=bl["axis"],
                petal_yaw=bl["rot"] + (p / 6.0) * TAU,
                pitch=0.18 + (p % 2) * 0.10,
                length=0.114 * sc,
                width=0.052 * sc,
                thickness=0.024 * sc,
                curl=0.018 * sc,
                c_inner_cup=c_cup_sage,
                c_outer_belly=c_belly_cream,
                c_mid=c_petal_ivory,
                c_rim_sun=c_petal_sun,
            )
        s.add_3d_domed_center(center, bl["axis"], 0.046 * sc, 0.036 * sc, c_disk_ao, c_disk_rim, c_disk_top)

    assert s.tri_count <= 480, f"daisy tri_count={s.tri_count} > 480"
    return s


def build_bellflower():
    s = VolumetricFlowerSculptor("bellflower")
    c_leaf_base = srgb_hex("#1e4e20")
    c_leaf_mid = srgb_hex("#449234")
    c_leaf_tip = srgb_hex("#76c84e")
    c_stem_bot = srgb_hex("#245824")
    c_stem_mid = srgb_hex("#509c3a")
    c_stem_top = srgb_hex("#80ca52")

    c_cup_deep = srgb_hex("#311078")
    c_belly_indigo = srgb_hex("#5b21b6")
    c_cup_mid = srgb_hex("#8b5cf6")
    c_cup_rim = srgb_hex("#ddd6fe")
    c_gold_ao = srgb_hex("#b45309")
    c_gold_rim = srgb_hex("#f59e0b")
    c_gold_top = srgb_hex("#fef08a")

    for i in range(6):
        a = i * (TAU / 6.0) + (i % 2) * 0.18
        s.add_rounded_3d_leaf(
            math.cos(a) * 0.02, 0.006, math.sin(a) * 0.02,
            a, 0.15 + (i % 3) * 0.02, 0.052, 0.058, 0.024,
            c_leaf_base, c_leaf_mid, c_leaf_tip,
        )

    stems = [
        {"a": 0.15, "h": 0.49, "reach": 0.15, "scale": 1.10},
        {"a": 1.65, "h": 0.43, "reach": 0.17, "scale": 1.00},
        {"a": 3.15, "h": 0.38, "reach": 0.14, "scale": 0.92},
        {"a": 4.75, "h": 0.44, "reach": 0.16, "scale": 0.96},
    ]

    for st in stems:
        dx, dz = math.cos(st["a"]), math.sin(st["a"])
        x1, y1, z1 = dx * st["reach"] * 0.45, st["h"] * 0.68, dz * st["reach"] * 0.45
        x2, y2, z2 = dx * st["reach"], st["h"] * 0.92, dz * st["reach"]
        s.add_curved_stem(
            (0.0, 0.0, 0.0), (x1, y1, z1), (x2, y2, z2),
            0.015, 0.012, 0.010,
            c_stem_bot, c_stem_mid, c_stem_top, 4,
        )
        bell_center = (x2, y2, z2)
        nod_axis = (dx * 0.45, -0.88, dz * 0.45)
        sc = st["scale"]
        for p in range(5):
            s.add_goblet_rose_petal(
                bloom_center=bell_center,
                head_axis=nod_axis,
                petal_yaw=st["a"] + (p / 5.0) * TAU,
                cup_radius=0.060 * sc,
                cup_height=0.098 * sc,
                width_angle=1.42,
                lip_flare=0.22,
                thickness=0.020 * sc,
                c_inner_throat=c_cup_deep,
                c_outer_belly=c_belly_indigo,
                c_mid_wall=c_cup_mid,
                c_rim_sun=c_cup_rim,
            )
        s.add_3d_domed_center(
            (x2 + dx * 0.02, y2 - 0.042 * sc, z2 + dz * 0.02),
            nod_axis, 0.025 * sc, 0.028 * sc,
            c_gold_ao, c_gold_rim, c_gold_top,
        )

    assert s.tri_count <= 460, f"bellflower tri_count={s.tri_count} > 460"
    return s


def build_lupine():
    s = VolumetricFlowerSculptor("lupine")
    c_leaf_base = srgb_hex("#1c4c20")
    c_leaf_mid = srgb_hex("#428e34")
    c_leaf_tip = srgb_hex("#72c44a")
    c_stem_bot = srgb_hex("#245824")
    c_stem_mid = srgb_hex("#4e983a")
    c_stem_top = srgb_hex("#78c450")

    c_bot_cup = srgb_hex("#3b0764")
    c_bot_belly = srgb_hex("#6d28d9")
    c_bot_mid = srgb_hex("#9333ea")
    c_bot_rim = srgb_hex("#c084fc")

    c_top_cup = srgb_hex("#6b21a8")
    c_top_belly = srgb_hex("#a855f7")
    c_top_mid = srgb_hex("#e879f9")
    c_top_rim = srgb_hex("#fdf4ff")

    for i in range(6):
        a = i * (TAU / 6.0) + (i % 2) * 0.15
        s.add_rounded_3d_leaf(
            math.cos(a) * 0.025, 0.008, math.sin(a) * 0.025,
            a, 0.16 + (i % 3) * 0.02, 0.052, 0.062, 0.024,
            c_leaf_base, c_leaf_mid, c_leaf_tip,
        )

    spikes = [
        {"x0": 0.00, "z0": 0.00, "xTop": 0.03, "yTop": 0.56, "zTop": 0.02, "florets": 14, "scale": 1.12, "seed": 1},
        {"x0": -0.04, "z0": 0.02, "xTop": -0.14, "yTop": 0.44, "zTop": 0.09, "florets": 11, "scale": 0.96, "seed": 2},
        {"x0": 0.04, "z0": -0.02, "xTop": 0.13, "yTop": 0.38, "zTop": -0.10, "florets": 10, "scale": 0.88, "seed": 3},
    ]

    for sp in spikes:
        sc = sp["scale"]
        s.add_curved_stem(
            (sp["x0"], 0.0, sp["z0"]),
            ((sp["x0"] + sp["xTop"]) * 0.5, sp["yTop"] * 0.48, (sp["z0"] + sp["zTop"]) * 0.5),
            (sp["xTop"], sp["yTop"], sp["zTop"]),
            0.019 * sc, 0.015 * sc, 0.009 * sc,
            c_stem_bot, c_stem_mid, c_stem_top, 4,
        )
        dx = sp["xTop"] - sp["x0"]
        dy = sp["yTop"]
        dz = sp["zTop"] - sp["z0"]
        axis = (dx, dy, dz)
        florets = sp["florets"]
        for f in range(florets):
            t = f / max(1, florets - 1)
            h_frac = 0.26 + t * 0.72
            fx = sp["x0"] + dx * h_frac
            fy = dy * h_frac
            fz = sp["z0"] + dz * h_frac
            taper = (1.0 - t * 0.46) * sc
            yaw = f * 2.3999632 + sp["seed"] * 1.3

            s.add_closed_cushion_petal(
                center=(fx, fy, fz),
                head_axis=axis,
                petal_yaw=yaw,
                pitch=0.45 + t * 0.45,
                length=0.088 * taper,
                width=0.060 * taper,
                thickness=0.026 * taper,
                curl=0.016 * taper,
                c_inner_cup=lerp_col(c_bot_cup, c_top_cup, t),
                c_outer_belly=lerp_col(c_bot_belly, c_top_belly, t),
                c_mid=lerp_col(c_bot_mid, c_top_mid, t),
                c_rim_sun=lerp_col(c_bot_rim, c_top_rim, t),
            )

    assert s.tri_count <= 520, f"lupine tri_count={s.tri_count} > 520"
    return s


def build_cosmos():
    s = VolumetricFlowerSculptor("cosmos")
    c_leaf_base = srgb_hex("#1e4e20")
    c_leaf_mid = srgb_hex("#469236")
    c_leaf_tip = srgb_hex("#78ca50")
    c_stem_bot = srgb_hex("#245824")
    c_stem_mid = srgb_hex("#529e3c")
    c_stem_top = srgb_hex("#82cc56")

    c_cup_crimson = srgb_hex("#831843")
    c_belly_rose = srgb_hex("#db2777")
    c_mid_pink = srgb_hex("#f472b6")
    c_rim_blush = srgb_hex("#fdf2f8")
    c_disk_ao = srgb_hex("#b45309")
    c_disk_rim = srgb_hex("#f59e0b")
    c_disk_top = srgb_hex("#fde047")

    for i in range(6):
        a = i * (TAU / 6.0) + 0.2
        s.add_rounded_3d_leaf(
            math.cos(a) * 0.02, 0.006, math.sin(a) * 0.02,
            a, 0.15 + (i % 2) * 0.02, 0.048, 0.055, 0.022,
            c_leaf_base, c_leaf_mid, c_leaf_tip,
        )

    blooms = [
        {"x": 0.02, "y": 0.48, "z": 0.02, "axis": (0.12, 0.97, 0.12), "scale": 1.10, "rot": 0.0},
        {"x": -0.14, "y": 0.41, "z": 0.09, "axis": (-0.30, 0.92, 0.22), "scale": 0.98, "rot": 0.5},
        {"x": 0.15, "y": 0.37, "z": -0.10, "axis": (0.32, 0.91, -0.24), "scale": 0.92, "rot": 1.1},
        {"x": -0.10, "y": 0.31, "z": -0.13, "axis": (-0.26, 0.90, -0.32), "scale": 0.86, "rot": 1.8},
    ]

    for bl in blooms:
        s.add_curved_stem(
            (0.0, 0.0, 0.0),
            (bl["x"] * 0.52, bl["y"] * 0.55, bl["z"] * 0.52),
            (bl["x"], bl["y"], bl["z"]),
            0.014, 0.011, 0.009,
            c_stem_bot, c_stem_mid, c_stem_top, 4,
        )
        center = (bl["x"], bl["y"], bl["z"])
        sc = bl["scale"]
        for p in range(6):
            s.add_goblet_rose_petal(
                bloom_center=center,
                head_axis=bl["axis"],
                petal_yaw=bl["rot"] + (p / 6.0) * TAU,
                cup_radius=0.092 * sc,
                cup_height=0.058 * sc,
                width_angle=1.18,
                lip_flare=0.18,
                thickness=0.020 * sc,
                c_inner_throat=c_cup_crimson,
                c_outer_belly=c_belly_rose,
                c_mid_wall=c_mid_pink,
                c_rim_sun=c_rim_blush,
            )
        s.add_3d_domed_center(center, bl["axis"], 0.040 * sc, 0.030 * sc, c_disk_ao, c_disk_rim, c_disk_top)

    assert s.tri_count <= 480, f"cosmos tri_count={s.tri_count} > 480"
    return s


def _eval_briar_net_strand_spine(strand_kind, u):
    """
    Evaluates a lush, deeply coiling, sinuous dark-romantic vine & root loop C(u) for u in [0, 1]
    matching the reference image `1000373056.png`:
      - Ground-Coiling Base (`u = 0.00..0.22`): instead of shooting straight up like a fence post,
        the vine coils horizontally along the cobblestones (`y = 0.025..0.16m`) with wide S-loops!
      - Big Sweeping Horizontal & Diagonal S-Loops (`u = 0.22..0.78`): winds horizontally and diagonally
        across `x in [-0.95m, +0.95m]` in broad, rounded C-coils (`loop_y` undulates smoothly as it climbs).
      - Overarching Braided Crown (`u = 0.78..1.00`): arches over the top (`y -> 1.88m, z -> 2.08m`) with
        curling thorn-whip tips!
    """
    t = max(0.0, min(1.0, float(u)))

    # Smooth S-curve rise that stays low & coiling on the ground for t < 0.18, then sweeps up into a dome arch
    ground_ease = smoothstep_py(0.06, 0.88, t)
    theta = ground_ease * (math.pi * 0.66)

    base_y = 0.024 + 1.86 * math.sin(theta)
    base_z = 0.16 * math.sin(t * math.pi * 0.9) + 1.48 * (1.0 - math.cos(theta))

    if strand_kind == 0:
        # Strand 0: Thick Gnarled Primary Coiling Vine — sweeps wide left-to-right-to-left in a big rounded S-coil
        x = -0.82 * math.cos(t * math.pi * 1.65 - 0.25) + 0.22 * math.sin(t * math.pi * 3.1)
        y_loop = 0.16 * math.sin(t * math.pi * 2.6 - 0.4) * smoothstep_py(0.12, 0.35, t)
        z_loop = -0.16 * math.sin(t * math.pi * 1.8)
        return Vector((x, max(0.018, base_y + y_loop), base_z + z_loop))

    if strand_kind == 1:
        # Strand 1: Thick Counter-Coiling Primary Vine — sweeps right-to-left-to-right, interlocking with Strand 0
        x = 0.82 * math.cos(t * math.pi * 1.65 - 0.15) - 0.24 * math.sin(t * math.pi * 3.1)
        y_loop = -0.15 * math.sin(t * math.pi * 2.6 - 0.2) * smoothstep_py(0.12, 0.35, t)
        z_loop = 0.14 * math.sin(t * math.pi * 2.0)
        return Vector((x, max(0.018, base_y * 0.97 + y_loop), base_z * 0.98 + z_loop))

    if strand_kind == 2:
        # Strand 2: Wide Left-Flank C-Looping Bough (forms the big rounded side-coils seen in 1000373056.png!)
        env = math.sin(t * math.pi * 0.95)
        x = -0.96 * math.sin(t * math.pi * 1.35 + 0.2) - 0.18 * env
        y_loop = 0.24 * math.sin(t * math.pi * 2.2) * env
        z_loop = -0.18 * math.sin(t * math.pi * 1.4)
        return Vector((x, max(0.016, base_y * 0.92 + y_loop), base_z * 0.92 + z_loop))

    if strand_kind == 3:
        # Strand 3: Wide Right-Flank Counter-Looping Bough
        env = math.sin(t * math.pi * 0.95)
        x = 0.94 * math.sin(t * math.pi * 1.35 + 0.35) + 0.18 * env
        y_loop = -0.22 * math.sin(t * math.pi * 2.2) * env
        z_loop = -0.16 * math.sin(t * math.pi * 1.5)
        return Vector((x, max(0.016, base_y * 0.90 + y_loop), base_z * 0.94 + z_loop))

    if strand_kind == 4:
        # Strand 4: Secondary Spiraling Vine A — makes 2.4 sinuous loops across the dome
        x = 0.72 * math.sin(t * math.pi * 2.6 + 0.5)
        y_curl = 0.14 * math.cos(t * math.pi * 3.2) + 0.14 * math.pow(max(0.0, (t - 0.75) / 0.25), 1.8)
        z_curl = 0.12 * math.sin(t * math.pi * 2.8)
        return Vector((x, max(0.014, base_y * 0.96 + y_curl), base_z * 0.95 + z_curl))

    # Strand 5: Secondary Counter-Spiraling Vine B
    x = -0.72 * math.sin(t * math.pi * 2.6 - 0.4)
    y_curl = -0.14 * math.cos(t * math.pi * 3.0) + 0.12 * math.pow(max(0.0, (t - 0.78) / 0.22), 1.8)
    z_curl = -0.12 * math.cos(t * math.pi * 2.6)
    return Vector((x, max(0.014, base_y * 0.94 + y_curl), base_z * 0.96 + z_curl))


def _eval_briar_net_strand_frame(strand_kind, u):
    eps = 0.008
    p = _eval_briar_net_strand_spine(strand_kind, u)
    pa = _eval_briar_net_strand_spine(strand_kind, max(0.0, u - eps))
    pb = _eval_briar_net_strand_spine(strand_kind, min(1.0, u + eps))
    tang = (pb - pa).normalized()
    ref = Vector((0.0, 1.0, 0.0)) if abs(tang.y) < 0.92 else Vector((1.0, 0.0, 0.0))
    right = tang.cross(ref).normalized()
    up = right.cross(tang).normalized()
    return p, tang, right, up


def _add_crimson_star_lily(s, attach_pt, bloom_center, head_axis, scale, rot, u_attach):
    """
    Sculpts a large, dramatic 6-petal open Crimson-Scarlet Star Lily (`v_kind = 0.85`)
    with 6 reflexed pointed crimson tepals and 6 bright golden-amber stamens (`#f59e0b -> #fef08a`)
    matching the prominent star-lilies in `1000373056.png`.
    """
    s.set_default_anc(attach_pt)
    c_pt = Vector(bloom_center)
    up = Vector(head_axis).normalized()
    ref = Vector((1.0, 0.0, 0.0)) if abs(up.y) > 0.9 else Vector((0.0, 1.0, 0.0))
    t_right = up.cross(ref).normalized()
    t_fwd = t_right.cross(up).normalized()

    c_throat = srgb_hex("#2b0106")
    c_mid_vein = srgb_hex("#7a0414")
    c_scarlet = srgb_hex("#cf0e26")
    c_rim_hot = srgb_hex("#f5243e")
    c_stamen_base = srgb_hex("#d97706")
    c_stamen_gold = srgb_hex("#fde047")

    uv_base = (min(1.0, u_attach), 0.85) if u_attach is not None else (0.0, 0.85)
    uv_mid = (min(1.0, (u_attach or 0.0) + 0.03), 0.85)
    uv_tip = (min(1.0, (u_attach or 0.0) + 0.06), 0.85)

    # 6 Reflexed Star-Lily Tepals (6 * 6 = 36 tris)
    for p in range(6):
        ang = rot + (p / 6.0) * TAU
        r_dir = (t_right * math.cos(ang) + t_fwd * math.sin(ang)).normalized()
        l_dir = (t_fwd * math.cos(ang) - t_right * math.sin(ang)).normalized()

        length = (0.21 if p % 2 == 0 else 0.19) * scale
        width = (0.064 if p % 2 == 0 else 0.056) * scale

        v_root = c_pt + r_dir * (0.012 * scale)
        v_mid_c = c_pt + r_dir * (length * 0.46) + up * (0.052 * scale)
        v_mid_l = c_pt + r_dir * (length * 0.42) - l_dir * width + up * (0.036 * scale)
        v_mid_r = c_pt + r_dir * (length * 0.42) + l_dir * width + up * (0.036 * scale)
        v_fore_l = c_pt + r_dir * (length * 0.78) - l_dir * (width * 0.55) + up * (0.022 * scale)
        v_fore_r = c_pt + r_dir * (length * 0.78) + l_dir * (width * 0.55) + up * (0.022 * scale)
        v_tip = c_pt + r_dir * length - up * (0.018 * scale)

        n_root = up
        n_mid = (up * 0.82 + r_dir * 0.35).normalized()
        n_ml = (up * 0.72 - l_dir * 0.48 + r_dir * 0.25).normalized()
        n_mr = (up * 0.72 + l_dir * 0.48 + r_dir * 0.25).normalized()
        n_tip = (up * 0.55 + r_dir * 0.75).normalized()

        s.add_tri(v_root, v_mid_r, v_mid_c, c_throat, c_scarlet, c_mid_vein, n_root, n_mr, n_mid, uv_base, uv_mid, uv_mid)
        s.add_tri(v_root, v_mid_c, v_mid_l, c_throat, c_mid_vein, c_scarlet, n_root, n_mid, n_ml, uv_base, uv_mid, uv_mid)
        s.add_tri(v_mid_c, v_mid_r, v_fore_r, c_mid_vein, c_scarlet, c_rim_hot, n_mid, n_mr, n_mr, uv_mid, uv_mid, uv_tip)
        s.add_tri(v_mid_l, v_mid_c, v_fore_l, c_scarlet, c_mid_vein, c_rim_hot, n_ml, n_mid, n_ml, uv_mid, uv_mid, uv_tip)
        s.add_tri(v_mid_c, v_fore_r, v_tip, c_mid_vein, c_rim_hot, c_rim_hot, n_mid, n_mr, n_tip, uv_mid, uv_tip, uv_tip)
        s.add_tri(v_fore_l, v_mid_c, v_tip, c_rim_hot, c_mid_vein, c_rim_hot, n_ml, n_mid, n_tip, uv_tip, uv_mid, uv_tip)

    # 5 Prominent Golden-Amber Stamens jutting from the lily center (`5 * 2 = 10` tris, `v_kind = 0.88` for golden stamen highlight)
    uv_stamen = (min(1.0, (u_attach or 0.0) + 0.02), 0.88)
    for st in range(5):
        s_ang = rot + 0.3 + (st / 5.0) * TAU
        s_dir = (t_right * math.cos(s_ang) + t_fwd * math.sin(s_ang)).normalized()
        s_ortho = (t_fwd * math.cos(s_ang) - t_right * math.sin(s_ang)).normalized() * (0.012 * scale)
        p_base1 = c_pt + s_dir * (0.008 * scale) - s_ortho
        p_base2 = c_pt + s_dir * (0.008 * scale) + s_ortho
        p_anther = c_pt + s_dir * (0.058 * scale) + up * (0.095 * scale)
        p_anther_l = p_anther - s_ortho * 1.4 - up * (0.014 * scale)
        p_anther_r = p_anther + s_ortho * 1.4 - up * (0.014 * scale)
        n_st = (up * 0.8 + s_dir * 0.6).normalized()
        s.add_tri(p_base1, p_base2, p_anther, c_stamen_base, c_stamen_base, c_stamen_gold, n_st, n_st, up, uv_stamen, uv_stamen, uv_stamen)
        s.add_tri(p_anther_l, p_anther_r, p_anther + up * (0.016 * scale), c_stamen_gold, c_stamen_gold, c_stamen_gold, n_st, n_st, up, uv_stamen, uv_stamen, uv_stamen)


def _add_blush_flower_cluster(s, attach_pt, head_axis, yaw, scale, u_attach):
    """
    Sculpts a cohesive, romantic Blush-Rose & Coral-Crimson 3-Bloom Cluster (`v_kind = 0.92`)
    nestled directly along the coiling vine (3 cupped 5-petal blossoms with ruby throats and
    coral-blush tips, matching the lush pink-crimson clusters in `1000373056.png` without noisy confetti).
    """
    s.set_default_anc(attach_pt)
    origin = Vector(attach_pt)
    up = Vector(head_axis).normalized()
    ref = Vector((1.0, 0.0, 0.0)) if abs(up.y) > 0.9 else Vector((0.0, 1.0, 0.0))
    t_right = up.cross(ref).normalized()
    t_fwd = t_right.cross(up).normalized()

    c_throat = srgb_hex("#5e0412")
    c_ruby = srgb_hex("#bd0d28")
    c_coral = srgb_hex("#f43f5e")
    c_blush = srgb_hex("#fda4af")
    uv_cl = (min(1.0, u_attach), 0.92)

    sub_offsets = [
        (0.0, 0.038 * scale, 0.0, 1.05 * scale, 0.0),
        (0.055 * scale, 0.022 * scale, 0.032 * scale, 0.88 * scale, 1.1),
        (-0.052 * scale, 0.020 * scale, -0.028 * scale, 0.85 * scale, 2.3),
    ]
    for ox, oy, oz, b_sc, b_rot in sub_offsets:
        b_center = origin + t_right * ox + up * oy + t_fwd * oz
        for p in range(5):
            p_ang = yaw + b_rot + (p / 5.0) * TAU
            r_dir = (t_right * math.cos(p_ang) + t_fwd * math.sin(p_ang)).normalized()
            l_dir = (t_fwd * math.cos(p_ang) - t_right * math.sin(p_ang)).normalized()

            p_len = 0.078 * b_sc
            p_wid = 0.044 * b_sc
            v_base = b_center
            v_wl = b_center + r_dir * (p_len * 0.58) - l_dir * p_wid + up * (0.022 * b_sc)
            v_wr = b_center + r_dir * (p_len * 0.58) + l_dir * p_wid + up * (0.022 * b_sc)
            v_tip = b_center + r_dir * p_len + up * (0.012 * b_sc)
            n_p = (up * 0.78 + r_dir * 0.55).normalized()

            s.add_tri(v_base, v_wr, v_wl, c_throat, c_ruby, c_coral, up, n_p, n_p, uv_cl, uv_cl, uv_cl)
            s.add_tri(v_wl, v_wr, v_tip, c_coral, c_ruby, c_blush, n_p, n_p, n_p, uv_cl, uv_cl, uv_cl)


def build_witcher_briar_arch():
    """
    Dark-Romantic Coiling Vine, Crimson-Vein Bark, Star-Lily & Blush-Rose Briar Module (`~2,200` tris):
    Matches the reference image `1000373056.png`:
    - 6 smooth, round, deeply coiling multi-gauge vine strands (`segs = 26, 22, 20, 18, 16, 16`, `sides = 8, 7, 6, 6, 5, 5`)
      with helical cord-grooves, olive-walnut bark ridges, and crimson-red sap veins in the crevices (`vPartKind = 0.0`)
    - Explicit per-vertex `anc` (`aSpineAnchor`) so growing vine tips taper to a sharp conical point along the curved spline
      and every flower/lily/cluster blooms smoothly outward from its stem attachment point!
    - 14 curved amber-ivory-tipped rose thorns (`vPartKind = 0.08`)
    - 5 large lush multi-layered velvet crimson roses (`vPartKind = 1.0`)
    - 3 large open 6-petal crimson-scarlet star-lilies with golden-amber stamens (`vPartKind = 0.85` / `0.88`)
    - 4 cohesive 3-bloom blush-rose & coral-crimson flower clusters nestled along the coils (`vPartKind = 0.92`)
    - 8 dark moss-olive & burgundy-green serrated compound leaves (`vPartKind = 0.5`)
    """
    s = VolumetricFlowerSculptor("witcherBriarArch", include_uv=True)

    # Olive-walnut bark ridges + visceral crimson-red sap veins in the helical crevices (matching 1000373056.png!)
    c_bark_sap_vein = srgb_hex("#b80c22")    # Visceral crimson-red sap vein in bark groove
    c_bark_furrow = srgb_hex("#3d2b16")      # Deep mossy dark-walnut crevice
    c_bark_mid = srgb_hex("#694d27")         # Rich olive-walnut woody vine body
    c_bark_ridge = srgb_hex("#96713b")       # Sunlit bronze-olive cord ridge
    c_bark_knot = srgb_hex("#bd9252")        # Warm golden-olive bark highlight

    c_thorn_base = srgb_hex("#5c0e18")       # Dark crimson-brown thorn base
    c_thorn_tip = srgb_hex("#ebd0a8")        # Sharp pale amber-ivory thorn point (1000373056.png!)

    c_fg_base = srgb_hex("#142b14")
    c_fg_mid = srgb_hex("#244a22")
    c_fg_tip = srgb_hex("#3b6e32")

    c_bg_base = srgb_hex("#2e1818")
    c_bg_mid = srgb_hex("#4a2820")
    c_bg_tip = srgb_hex("#693b2c")

    c_rose_throat = srgb_hex("#2a0106")
    c_rose_deep = srgb_hex("#58020f")
    c_rose_belly = srgb_hex("#8f0618")
    c_rose_mid = srgb_hex("#c20a22")
    c_rose_rim = srgb_hex("#e8122e")
    c_rose_highlight = srgb_hex("#ff2e4c")

    # 1. 6 Smooth, Round, Coiling Multi-Gauge Vine Strands (`vPartKind = 0.0`, zero sub-pixel hairlines!)
    strand_specs = [
        # Strand 0: Thick gnarled primary coiling bough (plump 8-sided round tube, deep helical cord ridges)
        {"kind": 0, "segs": 26, "sides": 8, "u_min": 0.00, "u_max": 1.00, "r_root": 0.084, "r_tip": 0.032, "flute": 0.16},
        # Strand 1: Thick counter-coiling primary bough
        {"kind": 1, "segs": 22, "sides": 7, "u_min": 0.00, "u_max": 0.98, "r_root": 0.068, "r_tip": 0.026, "flute": 0.15},
        # Strand 2: Wide left-flank looping C-coil vine
        {"kind": 2, "segs": 20, "sides": 6, "u_min": 0.02, "u_max": 0.96, "r_root": 0.052, "r_tip": 0.022, "flute": 0.13},
        # Strand 3: Wide right-flank counter-looping C-coil vine
        {"kind": 3, "segs": 18, "sides": 6, "u_min": 0.02, "u_max": 0.96, "r_root": 0.046, "r_tip": 0.020, "flute": 0.12},
        # Strand 4: Secondary spiraling vine A (solid readable gauge, curls around thick coils)
        {"kind": 4, "segs": 16, "sides": 5, "u_min": 0.04, "u_max": 0.96, "r_root": 0.038, "r_tip": 0.016, "flute": 0.10},
        # Strand 5: Secondary counter-spiraling vine B
        {"kind": 5, "segs": 16, "sides": 5, "u_min": 0.06, "u_max": 0.95, "r_root": 0.035, "r_tip": 0.015, "flute": 0.10},
    ]

    for b_idx, bs in enumerate(strand_specs):
        segs = bs["segs"]
        sides = bs["sides"]
        kind = bs["kind"]
        u_min = bs["u_min"]
        u_max = bs["u_max"]
        rings = []
        for step in range(segs + 1):
            frac = step / segs
            u = u_min + frac * (u_max - u_min)
            center, tang, right, up = _eval_briar_net_strand_frame(kind, u)

            root_flare = 1.0 + 0.42 * math.pow(max(0.0, 1.0 - u / 0.20), 2.0) if kind <= 1 else 1.0
            knot_swell = 1.0 + 0.09 * math.sin(step * 1.4 + b_idx * 1.7)
            natural_tip_taper = 1.0 - 0.65 * math.pow(max(0.0, (frac - 0.86) / 0.14), 1.6)
            base_rad = (bs["r_root"] * (1.0 - frac * 0.62) + bs["r_tip"] * (frac * 0.62)) * root_flare * knot_swell * natural_tip_taper

            pts_ring = []
            nrms_ring = []
            cols_ring = []
            for k in range(sides):
                ang = (k / sides) * TAU + step * 0.34 + b_idx * 0.85
                ridge_wave = math.cos(k * 2.0 + step * 0.52)
                rad = base_rad * (1.0 + bs["flute"] * ridge_wave)
                radial = (right * math.cos(ang) + up * math.sin(ang)).normalized()
                pt = center + radial * rad
                pt.y = max(0.004, pt.y)
                nrm = (radial * 0.92 + up * 0.18).normalized()

                # Mostly olive-walnut & bronze-olive bark cords, with 1 crimson sap vein groove per circumference!
                if k == 0:
                    c_v = lerp_col(c_bark_sap_vein, c_bark_furrow, 0.28)
                elif k % 2 == 0:
                    c_v = lerp_col(c_bark_mid, c_bark_ridge, 0.45 + 0.55 * frac)
                    if step % 2 == 1 and kind <= 2:
                        c_v = lerp_col(c_v, c_bark_knot, 0.45)
                else:
                    c_v = lerp_col(c_bark_furrow, c_bark_mid, 0.42 + 0.48 * frac)

                pts_ring.append(pt)
                nrms_ring.append(nrm)
                cols_ring.append(c_v)
            rings.append((pts_ring, nrms_ring, cols_ring, u, center))

        for step in range(segs):
            pts_a, nrms_a, cols_a, u_a, anc_a = rings[step]
            pts_b, nrms_b, cols_b, u_b, anc_b = rings[step + 1]
            uv_a = (u_a, 0.0)
            uv_b = (u_b, 0.0)
            for k in range(sides):
                nk = (k + 1) % sides
                s.add_quad(
                    pts_a[k], pts_a[nk], pts_b[nk], pts_b[k],
                    cols_a[k], cols_a[nk], cols_b[nk], cols_b[k],
                    nrms_a[k], nrms_a[nk], nrms_b[nk], nrms_b[k],
                    uv_a, uv_a, uv_b, uv_b,
                    anc_a, anc_a, anc_b, anc_b,
                )

    # 2. 14 Prominent Curved Amber-Ivory-Tipped Rose Thorns (`14 * 3 = 42` tris, `vPartKind = 0.08`)
    for th_idx in range(14):
        u_th = 0.12 + (th_idx / 13.0) * 0.84
        kind = th_idx % 4
        center, tang, right, up = _eval_briar_net_strand_frame(kind, u_th)
        s.set_default_anc(center)
        th_ang = th_idx * 2.15 + 0.35
        out_dir = (right * math.cos(th_ang) + up * math.sin(th_ang)).normalized()
        if out_dir.y < -0.2:
            out_dir = -out_dir
        thorn_base = center + out_dir * (0.048 if kind <= 1 else 0.032)
        thorn_tip = thorn_base + (out_dir * 0.80 + tang * 0.42).normalized() * (0.130 if kind <= 1 else 0.096)
        b_ortho1 = tang * 0.028
        b_ortho2 = out_dir.cross(tang).normalized() * 0.025

        v0 = thorn_base - b_ortho1
        v1 = thorn_base + b_ortho1 * 0.5 + b_ortho2
        v2 = thorn_base + b_ortho1 * 0.5 - b_ortho2
        uv_base = (u_th, 0.08)
        uv_tip = (min(1.0, u_th + 0.025), 0.08)

        s.add_tri(v0, v1, thorn_tip, c_thorn_base, c_bark_ridge, c_thorn_tip, (out_dir + b_ortho2).normalized(), (out_dir + b_ortho2).normalized(), out_dir, uv_base, uv_base, uv_tip)
        s.add_tri(v1, v2, thorn_tip, c_bark_ridge, c_thorn_base, c_thorn_tip, (out_dir + tang).normalized(), (out_dir + tang).normalized(), out_dir, uv_base, uv_base, uv_tip)
        s.add_tri(v2, v0, thorn_tip, c_thorn_base, c_bark_ridge, c_thorn_tip, (out_dir - b_ortho2).normalized(), (out_dir - b_ortho2).normalized(), out_dir, uv_base, uv_base, uv_tip)

    # 3. 8 Dark Moss-Olive & Burgundy-Green Serrated Leaves (`8 * 6 = 48` tris, `vPartKind = 0.5`)
    for lf_idx in range(8):
        u_lf = 0.12 + (lf_idx / 7.0) * 0.80
        kind = lf_idx % 4
        center, tang, right, up = _eval_briar_net_strand_frame(kind, u_lf)
        s.set_default_anc(center)
        side_sign = 1.0 if (lf_idx % 2 == 0) else -1.0
        roll_ang = side_sign * (0.68 + (lf_idx % 3) * 0.22)
        leaf_fwd = (right * math.sin(roll_ang) + tang * 0.36 + up * (0.32 * math.cos(roll_ang))).normalized()
        leaf_up = (up * 0.84 + right * (0.32 * side_sign)).normalized()
        leaf_origin = center + leaf_fwd * 0.022

        is_burgundy = (lf_idx % 2 == 1)
        sc_lf = 1.12 - 0.14 * u_lf
        s.add_oriented_serrated_leaf(
            origin=leaf_origin,
            forward_dir=leaf_fwd,
            up_dir=leaf_up,
            length=0.20 * sc_lf,
            width=0.092 * sc_lf,
            arch_lift=0.044 * sc_lf,
            c_base=c_bg_base if is_burgundy else c_fg_base,
            c_mid=c_bg_mid if is_burgundy else c_fg_mid,
            c_tip=c_bg_tip if is_burgundy else c_fg_tip,
            u_attach=u_lf,
            v_kind=0.5,
        )

    # 4. 1 Large Open 6-Petal Crimson-Scarlet Star Lily with Golden-Amber Stamens (`1 * 46 = 46` tris, `vPartKind = 0.85/0.88`)
    #    (With 36 instances and shader selection, ~10 dramatic Star-Lilies grace the outer coils just like 1000373056.png!)
    lily_stations = [
        {"kind": 2, "u": 0.30, "scale": 1.54, "side": -0.68, "up_bias": 0.76, "rot": 0.4},
    ]
    for ls in lily_stations:
        center, tang, right, up = _eval_briar_net_strand_frame(ls["kind"], ls["u"])
        head_axis = (up * ls["up_bias"] + right * ls["side"] + tang * 0.20).normalized()
        bloom_center = center + head_axis * (0.058 * ls["scale"])
        _add_crimson_star_lily(s, center, bloom_center, head_axis, ls["scale"], ls["rot"], ls["u"])

    # 5. 4 Cohesive 3-Bloom Blush-Rose & Coral-Crimson Flower Clusters nestled along the coils (`4 * 30 = 120` tris, `vPartKind = 0.92`)
    cluster_stations = [
        {"kind": 0, "u": 0.20, "yaw": 0.5, "sc": 1.18, "side": -0.55},
        {"kind": 1, "u": 0.42, "yaw": 1.9, "sc": 1.15, "side": 0.58},
        {"kind": 2, "u": 0.64, "yaw": 3.4, "sc": 1.12, "side": -0.52},
        {"kind": 1, "u": 0.82, "yaw": 4.8, "sc": 1.08, "side": 0.48},
    ]
    for cs in cluster_stations:
        center, tang, right, up = _eval_briar_net_strand_frame(cs["kind"], cs["u"])
        head_axis = (up * 0.80 + right * cs["side"] + tang * 0.18).normalized()
        _add_blush_flower_cluster(s, center, head_axis, cs["yaw"], cs["sc"], cs["u"])

    # 6. 6 Lush Spherical-Goblet Velvet Crimson Roses anchored across the coiling vines (`6 * 68 = 408` tris, `vPartKind = 1.0`)
    rose_stations = [
        {"kind": 0, "u": 0.12, "scale": 1.58, "side": 0.58, "up_bias": 0.82, "rot": 0.2},
        {"kind": 1, "u": 0.28, "scale": 1.50, "side": -0.62, "up_bias": 0.80, "rot": 1.5},
        {"kind": 3, "u": 0.46, "scale": 1.46, "side": 0.56, "up_bias": 0.84, "rot": 2.8},
        {"kind": 2, "u": 0.58, "scale": 1.44, "side": -0.58, "up_bias": 0.82, "rot": 3.5},
        {"kind": 1, "u": 0.72, "scale": 1.40, "side": -0.52, "up_bias": 0.86, "rot": 4.1},
        {"kind": 0, "u": 0.88, "scale": 1.36, "side": 0.46, "up_bias": 0.88, "rot": 5.4},
    ]

    for r_idx, rs in enumerate(rose_stations):
        u_r = rs["u"]
        sc = rs["scale"]
        center, tang, right, up = _eval_briar_net_strand_frame(rs["kind"], u_r)
        s.set_default_anc(center)
        head_axis = (up * rs["up_bias"] + right * rs["side"] + tang * 0.18).normalized()
        bloom_center = center + head_axis * (0.048 * sc)

        s.add_rose_spiral_core_and_calyx(
            center=bloom_center,
            head_axis=head_axis,
            radius=0.058 * sc,
            height=0.098 * sc,
            rot=rs["rot"] + 0.35,
            c_sepal=c_fg_mid,
            c_throat_deep=c_rose_throat,
            c_core_mid=c_rose_mid,
            c_core_rim=c_rose_highlight,
            sides=4,
            u_attach=u_r,
            v_kind=1.0,
        )

        for p in range(4):
            s.add_goblet_rose_petal(
                bloom_center=bloom_center,
                head_axis=head_axis,
                petal_yaw=rs["rot"] + (p / 4.0) * TAU,
                cup_radius=0.102 * sc,
                cup_height=0.108 * sc,
                width_angle=1.84,
                lip_flare=0.20,
                thickness=0.028 * sc,
                c_inner_throat=c_rose_deep,
                c_outer_belly=c_rose_belly,
                c_mid_wall=c_rose_mid,
                c_rim_sun=c_rose_rim,
                u_attach=u_r,
                v_kind=1.0,
            )

        for p in range(3):
            s.add_goblet_rose_petal(
                bloom_center=bloom_center + head_axis * (0.012 * sc),
                head_axis=head_axis,
                petal_yaw=rs["rot"] + 0.45 + (p / 3.0) * TAU,
                cup_radius=0.072 * sc,
                cup_height=0.110 * sc,
                width_angle=2.24,
                lip_flare=0.10,
                thickness=0.024 * sc,
                c_inner_throat=c_rose_throat,
                c_outer_belly=c_rose_mid,
                c_mid_wall=c_rose_rim,
                c_rim_sun=c_rose_highlight,
                u_attach=u_r,
                v_kind=1.0,
            )

    assert 1200 <= s.tri_count <= 3200, f"witcherBriarArch tri_count={s.tri_count} not in 1200..3200"
    assert len(s.uv) == s.tri_count * 3 * 2, "witcherBriarArch UV length mismatch"
    assert len(s.anc) == s.tri_count * 3 * 3, "witcherBriarArch ANC length mismatch"
    return s


def build_crimson_flower_slump():
    """
    Lush Cobblestone Crimson Rose, Star-Lily & Petal Slump (`crimsonFlowerSlump`, `400..960` tris, `r ~ 1.35m`, `h = 0.005..0.155m`):
    - 12 lush fallen velvet blood-roses (`#2e0107 -> #58020f -> #b80822 -> #de0c2c`)
    - 48 rounded, cupped fallen crimson rose petals & dark-crimson sap-pool petals across the cobblestones (`r = 0.08..1.32m`)
    - 100% pure ruby blood-crimson palette (`R >> G, B > G`) so every petal and rose bloom stays vivid blood-crimson in Frame 41 B&W Smite!
    """
    s = VolumetricFlowerSculptor("crimsonFlowerSlump", include_uv=False)

    c_rose_throat = srgb_hex("#2e0107")
    c_rose_deep = srgb_hex("#58020f")
    c_rose_belly = srgb_hex("#8c0519")
    c_rose_mid = srgb_hex("#b80822")
    c_rose_rim = srgb_hex("#de0c2c")
    c_rose_highlight = srgb_hex("#f21638")

    # 1. 12 Lush Fallen Velvet Blood-Roses nestled across the mound & outer wreath (`12 * 33 = 396` tris)
    fallen_roses = [
        {"x": 0.00, "y": 0.068, "z": 0.00, "tilt": (0.10, 0.98, 0.12), "sc": 1.28, "rot": 0.1},
        {"x": 0.24, "y": 0.058, "z": 0.10, "tilt": (0.36, 0.90, 0.20), "sc": 1.18, "rot": 1.1},
        {"x": -0.22, "y": 0.060, "z": 0.12, "tilt": (-0.34, 0.91, 0.22), "sc": 1.20, "rot": 2.3},
        {"x": 0.08, "y": 0.056, "z": -0.24, "tilt": (0.16, 0.89, -0.40), "sc": 1.16, "rot": 3.4},
        {"x": -0.18, "y": 0.054, "z": -0.21, "tilt": (-0.30, 0.90, -0.28), "sc": 1.12, "rot": 4.5},
        {"x": 0.44, "y": 0.048, "z": -0.08, "tilt": (0.46, 0.86, -0.14), "sc": 1.08, "rot": 5.2},
        {"x": -0.42, "y": 0.050, "z": -0.05, "tilt": (-0.44, 0.87, 0.10), "sc": 1.06, "rot": 0.8},
        {"x": 0.20, "y": 0.048, "z": 0.38, "tilt": (0.22, 0.87, 0.42), "sc": 1.06, "rot": 1.9},
        {"x": -0.19, "y": 0.046, "z": 0.39, "tilt": (-0.25, 0.86, 0.42), "sc": 1.04, "rot": 3.8},
        {"x": 0.72, "y": 0.042, "z": 0.22, "tilt": (0.48, 0.85, 0.22), "sc": 1.02, "rot": 2.7},
        {"x": -0.74, "y": 0.042, "z": 0.18, "tilt": (-0.48, 0.85, 0.18), "sc": 1.02, "rot": 4.9},
        {"x": 0.04, "y": 0.044, "z": 0.68, "tilt": (0.08, 0.86, 0.48), "sc": 1.04, "rot": 1.4},
    ]

    for fr in fallen_roses:
        center = Vector((fr["x"], fr["y"], fr["z"]))
        up = Vector(fr["tilt"]).normalized()
        sc = fr["sc"]

        s.add_rose_spiral_core_and_calyx(
            center=center,
            head_axis=up,
            radius=0.060 * sc,
            height=0.064 * sc,
            rot=fr["rot"],
            c_sepal=c_rose_deep,
            c_throat_deep=c_rose_throat,
            c_core_mid=c_rose_mid,
            c_core_rim=c_rose_highlight,
            sides=3,
        )

        for p in range(3):
            s.add_goblet_rose_petal(
                bloom_center=center,
                head_axis=up,
                petal_yaw=fr["rot"] + (p / 3.0) * TAU,
                cup_radius=0.104 * sc,
                cup_height=0.068 * sc,
                width_angle=2.26,
                lip_flare=0.22,
                thickness=0.024 * sc,
                c_inner_throat=c_rose_deep,
                c_outer_belly=c_rose_belly,
                c_mid_wall=c_rose_mid,
                c_rim_sun=c_rose_rim,
            )

    # 2. 48 Rounded Cupped Fallen Crimson Rose Petals & Ground Sap-Pool Petals (`48 * 8 = 384` tris, total = 780)
    for p_idx in range(48):
        gold_ang = p_idx * 2.3999632 + 0.35
        ring_t = p_idx / 47.0
        rad = 0.06 + math.pow(ring_t, 0.82) * 1.22
        px = math.cos(gold_ang) * rad
        pz = math.sin(gold_ang) * rad
        py = 0.010 + (1.0 - ring_t) * 0.022 + (p_idx % 3) * 0.003
        petal_yaw = gold_ang + ((p_idx % 5) - 2) * 0.55
        p_len = 0.15 + (p_idx % 4) * 0.032
        p_wid = 0.12 + (p_idx % 3) * 0.026

        s.add_closed_cushion_petal(
            center=(px, py, pz),
            head_axis=(0.0, 1.0, 0.0),
            petal_yaw=petal_yaw,
            pitch=0.06 + (p_idx % 3) * 0.04,
            length=p_len,
            width=p_wid,
            thickness=0.018,
            curl=0.014,
            c_inner_cup=c_rose_throat if (p_idx % 4 == 0) else c_rose_deep,
            c_outer_belly=c_rose_belly,
            c_mid=c_rose_mid,
            c_rim_sun=c_rose_rim if (p_idx % 3 != 0) else c_rose_highlight,
        )

    for idx in range(1, len(s.pos), 3):
        s.pos[idx] = round(max(0.005, min(0.155, s.pos[idx])), 5)

    assert 400 <= s.tri_count <= 960, f"crimsonFlowerSlump tri_count={s.tri_count} not in 400..960"
    return s


def main():
    for ob in bpy.data.objects[:]:
        bpy.data.objects.remove(ob, do_unlink=True)

    sculptors = [
        build_crimson_rose(),
        build_daisy(),
        build_bellflower(),
        build_lupine(),
        build_cosmos(),
        build_witcher_briar_arch(),
        build_crimson_flower_slump(),
    ]

    briar_ob = sculptors[5].to_blender_object(offset_x=-1.25, offset_y=0.0)
    slump_ob = sculptors[6].to_blender_object(offset_x=1.35, offset_y=0.0)
    bpy.context.view_layer.update()

    review_dir = r"C:\Users\silen\projects\kilo-3d-kit\world\shots\blender-flowers-review"
    os.makedirs(review_dir, exist_ok=True)
    sheet_path = bx_review.review(
        [briar_ob, slump_ob],
        review_dir,
        views=("front", "threequarter", "top", "low"),
        modes=("silhouette", "matcap", "normals"),
        res=450,
    )

    out_js_path = r"C:\Users\silen\projects\kilo-3d-kit\world\assets\flowers\blender-flower-data.js"
    lines = [
        "// Auto-generated by headless Blender 5.2.1 LTS (`world/tools/build-blender-flowers.py`)",
        "// Contains closed-volume 3D goblet-cupped petals, spiral rosebud hearts, spherical normals, baked cavity AO, briar arch UVs & spine anchors.",
        "export const BLENDER_VOLUMETRIC_FLOWERS = {",
    ]
    summary = {}
    for sc in sculptors:
        summary[sc.name] = sc.tri_count
        lines.append(f"  {sc.name}: {{")
        lines.append(f"    triangles: {sc.tri_count},")
        lines.append(f"    pos: new Float32Array({json.dumps(sc.pos, separators=(',', ':'))}),")
        lines.append(f"    nrm: new Float32Array({json.dumps(sc.nrm, separators=(',', ':'))}),")
        lines.append(f"    col: new Float32Array({json.dumps(sc.col, separators=(',', ':'))}),")
        if sc.include_uv:
            lines.append(f"    uv: new Float32Array({json.dumps(sc.uv, separators=(',', ':'))}),")
            lines.append(f"    anc: new Float32Array({json.dumps(sc.anc, separators=(',', ':'))}),")
        lines.append("  },")
    lines.append("};\n")
    lines.append("// Backward-compatible meadow flower aliases\n")
    lines.append("BLENDER_VOLUMETRIC_FLOWERS.sakuraCluster = BLENDER_VOLUMETRIC_FLOWERS.cosmos;\n")
    lines.append("BLENDER_VOLUMETRIC_FLOWERS.dandelionPuff = BLENDER_VOLUMETRIC_FLOWERS.lupine;\n")
    lines.append("BLENDER_VOLUMETRIC_FLOWERS.wildDaisy = BLENDER_VOLUMETRIC_FLOWERS.daisy;\n")
    lines.append("BLENDER_VOLUMETRIC_FLOWERS.bluebellSprig = BLENDER_VOLUMETRIC_FLOWERS.bellflower;\n")
    lines.append("BLENDER_VOLUMETRIC_FLOWERS.buttercupCrown = BLENDER_VOLUMETRIC_FLOWERS.crimsonRose;\n")

    with open(out_js_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    print("RESULT " + json.dumps({"ok": True, "review_sheet": sheet_path, "out_js": out_js_path, "triangles": summary}))


if __name__ == "__main__":
    main()
