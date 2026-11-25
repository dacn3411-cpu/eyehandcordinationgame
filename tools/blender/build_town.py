"""Build the stylized town houses for EYE HAND MISSION in Blender and export a .glb.

Run headless:
    blender -b -P tools/blender/build_town.py -- public/assets/models/town.glb
or with the `bpy` Python module:
    python tools/blender/build_town.py public/assets/models/town.glb

Style: clean chunky shapes with chamfered edges, flat hand-picked colours, and
ambient occlusion baked into vertex colours (Cycles). Every house variant is one
object with three materials (matte vertex-colour, glass, lamp glow), so the game
draws a whole house in three calls.

Coordinates are written in the game's house frame: x runs along the street,
y is up, z points out of the facade (facade plane at z = 0, body behind it).
They are converted to Blender axes when each mesh is finished, and the glTF
exporter converts them back.
"""
import math
import random
import sys

import bpy  # noqa: I001  (bpy must be imported before bmesh/mathutils)
import bmesh
from mathutils import Euler, Matrix, Vector

OUT = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else (sys.argv[1] if len(sys.argv) > 1 else 'town.glb')


def hexc(h):
    """sRGB hex -> linear RGB tuple."""
    def lin(c):
        c = c / 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return tuple(lin(int(h[i:i + 2], 16)) for i in (1, 3, 5))


PAL = {
    'stone': hexc('#CFC6B6'),
    'stoneDark': hexc('#9E968A'),
    'roof': hexc('#6E655C'),       # weathered wooden shingles / slate
    'roofB': hexc('#5A524A'),
    'ridge': hexc('#4A423B'),
    'wood': hexc('#6B4630'),
    'woodDark': hexc('#3E281C'),
    'woodPaint': hexc('#8A3A26'),  # oxblood painted timber
    'ochrePaint': hexc('#D49A3C'),
    'tealPaint': hexc('#2E7F78'),
    'band': hexc('#7E3626'),       # red-brown band under the eaves
    'iron': hexc('#35312F'),
    'interior': hexc('#2E241D'),
    'paper': hexc('#EFE6D2'),
    'leafA': hexc('#4F8A3C'),
    'leafB': hexc('#6FA348'),
    'metal': hexc('#8B9096'),
    'gold': hexc('#C99A3A'),
}
# whitewash / ochre plaster
WALLS = ['#F0E6D2', '#E8CD9C', '#F3ECDD', '#E1BD86', '#EADBBE', '#DDB07A']
SHUTTERS = ['#8A3A26', '#2E7F78', '#8A3A26', '#2E7F78', '#6B4630']

COLORS = {}
TO_BLENDER = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def xform(loc, rot=(0, 0, 0), scale=(1, 1, 1)):
    # three.js 'XYZ' order == mathutils 'ZYX'
    r = Euler(rot, 'ZYX').to_matrix().to_4x4()
    s = Matrix.Diagonal((*scale, 1))
    return Matrix.Translation(loc) @ r @ s


class Builder:
    """Collects geometry per (shader, colour) for one house."""

    def __init__(self):
        self.bm = bmesh.new()
        self.col = self.bm.faces.layers.int.new('cidx')
        self.colors = []  # index -> (rgb, shader)
        self.color_ix = {}

    def cid(self, rgb, shader='matte'):
        key = (tuple(round(c, 5) for c in rgb), shader)
        if key not in self.color_ix:
            self.color_ix[key] = len(self.colors)
            self.colors.append(key)
        return self.color_ix[key]

    def _tag(self, faces, rgb, shader, smooth):
        ci = self.cid(rgb, shader)
        for f in faces:
            f[self.col] = ci
            f.smooth = smooth

    def _merge(self, tmp, m, rgb, shader, smooth):
        tmp.transform(m)
        tmp.verts.ensure_lookup_table()
        vmap = {}
        for v in tmp.verts:
            vmap[v] = self.bm.verts.new(v.co)
        faces = []
        for f in tmp.faces:
            try:
                faces.append(self.bm.faces.new([vmap[v] for v in f.verts]))
            except ValueError:
                pass
        tmp.free()
        self._tag(faces, rgb, shader, smooth)

    def box(self, rgb, c, s, rot=(0, 0, 0), bevel=0.03, shader='matte', cell=0.0):
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=Vector(s), verts=tmp.verts)
        if cell > 0:
            # subdivide big faces so baked vertex AO has enough resolution
            for axis in range(3):
                n = max(0, int(math.ceil(s[axis] / cell)) - 1)
                if n == 0:
                    continue
                edges = [e for e in tmp.edges if abs((e.verts[0].co - e.verts[1].co)[axis]) > 1e-4 and
                         abs((e.verts[0].co - e.verts[1].co).length - abs((e.verts[0].co - e.verts[1].co)[axis])) < 1e-4]
                bmesh.ops.subdivide_edges(tmp, edges=edges, cuts=n, use_grid_fill=True)
        if bevel > 0 and cell == 0:
            bw = min(bevel, min(s) * 0.45)
            bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bw, segments=1, profile=0.5, affect='EDGES')
        self._merge(tmp, xform(c, rot), rgb, shader, False)

    def cyl(self, rgb, c, r, h, seg=10, rot=(0, 0, 0), r2=None, shader='matte', smooth=True, cap=True):
        tmp = bmesh.new()
        bmesh.ops.create_cone(tmp, cap_ends=cap, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=h)
        # Blender cones are along local Z; the game expects Y-up cylinders
        bmesh.ops.rotate(tmp, verts=tmp.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(-math.pi / 2, 4, 'X'))
        self._merge(tmp, xform(c, rot), rgb, shader, smooth)

    def sphere(self, rgb, c, s, seed=0, sub=2, shader='matte', lumpy=0.06):
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=sub, radius=0.5)
        rnd = random.Random(seed)
        ph = [rnd.random() * 6 for _ in range(3)]
        for v in tmp.verts:
            k = 1 + lumpy * math.sin(v.co.x * 9 + ph[0]) * math.cos(v.co.y * 8 + ph[1]) + lumpy * 0.5 * math.sin(v.co.z * 11 + ph[2])
            v.co *= k
        self._merge(tmp, xform(c, (0, 0, 0), s), rgb, shader, True)

    def arch_ring(self, rgb, c, radius, tube, depth, rot=(0, 0, 0), seg=10):
        """Half ring (voussoirs) in the XY plane, opening downward, chunky square section."""
        tmp = bmesh.new()
        rings = []
        for i in range(seg + 1):
            a = math.pi * i / seg
            ca, sa = math.cos(a), math.sin(a)
            ring = []
            for (dr, dz) in ((-tube, -depth / 2), (tube, -depth / 2), (tube, depth / 2), (-tube, depth / 2)):
                ring.append(tmp.verts.new(((radius + dr) * ca, (radius + dr) * sa, dz)))
            rings.append(ring)
        for i in range(seg):
            a, b = rings[i], rings[i + 1]
            for k in range(4):
                tmp.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
        tmp.faces.new(rings[0])
        tmp.faces.new(list(reversed(rings[-1])))
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        self._merge(tmp, xform(c, rot), rgb, 'matte', False)

    def poly(self, rgb, pts, shader='matte'):
        """Flat polygon from game-frame points (counter-clockwise seen from the front)."""
        vs = [self.bm.verts.new(p) for p in pts]
        f = self.bm.faces.new(vs)
        self._tag([f], rgb, shader, False)

    def finish(self, name):
        bm = self.bm
        bm.transform(TO_BLENDER)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        me = bpy.data.meshes.new(name)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        COLORS[name] = [list(c[0]) + [c[1]] for c in self.colors]
        return ob


# --------------------------------------------------------------------------- house parts
# Himalayan-inspired vocabulary (original arrangement): thick dark timber
# window frames with stepped painted lintels, half-open sliding shutters,
# projecting timber bay windows, a red-brown band under deep rafter eaves.
def lintel_stack(B, cx, y, w, z0=0.0):
    """Three stepped timber beams over an opening, painted in alternating colours."""
    cols = (PAL['woodDark'], PAL['woodPaint'], PAL['ochrePaint'])
    for i, col in enumerate(cols):
        B.box(col, (cx, y + 0.07 + i * 0.13, z0 + 0.06 + i * 0.06), (w + 0.18 + i * 0.16, 0.13, 0.12 + i * 0.12), bevel=0.015)
    # small beam ends poking out of the top course
    n = max(3, int((w + 0.5) / 0.22))
    for k in range(n):
        x = cx - (w + 0.5) / 2 + (k + 0.5) * (w + 0.5) / n
        B.box(PAL['woodDark'], (x, y + 0.47, z0 + 0.3), (0.1, 0.1, 0.22), bevel=0.01)


def window(B, rnd, cx, y, h, shutter, bay=False, lite=False):
    w = 1.0
    sc = hexc(SHUTTERS[shutter])
    if bay:
        # projecting timber bay window across a wider span
        bw, bd = 2.4, 0.55
        B.box(PAL['woodDark'], (cx, y - 0.12, bd / 2), (bw + 0.3, 0.16, bd + 0.1), bevel=0.02)
        for k in range(5):
            B.box(PAL['woodDark'], (cx - bw / 2 + k * bw / 4, y - 0.32, bd * 0.55), (0.12, 0.3, 0.12), bevel=0.01)
        B.box(PAL['interior'], (cx, y + h / 2, bd + 0.01), (bw - 0.1, h - 0.1, 0.02), bevel=0)
        for k in range(4):
            px = cx - bw / 2 + (k + 0.5) * bw / 4
            B.box((0.2, 0.28, 0.33), (px, y + h * 0.56, bd + 0.03), (bw / 4 - 0.18, h * 0.6, 0.02), bevel=0, shader='glass')
        for k in range(5):
            B.box(PAL['woodDark'], (cx - bw / 2 + k * bw / 4, y + h / 2, bd + 0.03), (0.12, h, 0.12), bevel=0.015)
        B.box(PAL['woodPaint'], (cx, y + 0.12, bd + 0.05), (bw + 0.1, 0.24, 0.06), bevel=0.01)
        for side in (-1, 1):
            B.box(PAL['woodDark'], (cx + side * (bw / 2 + 0.05), y + h / 2, bd / 2), (0.1, h, bd), bevel=0.015)
        lintel_stack(B, cx, y + h, bw, z0=bd - 0.3)
        return
    # recessed dark opening + thick timber frame
    B.box(PAL['interior'], (cx, y + h / 2, 0.01), (w, h, 0.02), bevel=0)
    B.box((0.2, 0.28, 0.33), (cx, y + h * 0.5, 0.03), (w - 0.12, h - 0.12, 0.02), bevel=0, shader='glass')
    B.box(PAL['woodDark'], (cx - w / 2 - 0.07, y + h / 2, 0.08), (0.14, h + 0.1, 0.16), bevel=0.015)
    B.box(PAL['woodDark'], (cx + w / 2 + 0.07, y + h / 2, 0.08), (0.14, h + 0.1, 0.16), bevel=0.015)
    B.box(PAL['woodDark'], (cx, y - 0.05, 0.12), (w + 0.4, 0.12, 0.24), bevel=0.015)
    lintel_stack(B, cx, y + h, w)
    if not lite:
        # small lattice transom
        for k in range(1, 4):
            B.box(PAL['wood'], (cx - w / 2 + k * w / 4, y + h - 0.18, 0.06), (0.03, 0.3, 0.03), bevel=0)
        B.box(PAL['wood'], (cx, y + h - 0.33, 0.06), (w, 0.04, 0.03), bevel=0)
    # half-open sliding shutter (one panel pushed across, one parked beside)
    slide = 0.25 + rnd.random() * 0.4
    B.box(sc, (cx - w / 2 + slide * w / 2, y + (h - 0.36) / 2, 0.15), (w / 2, h - 0.4, 0.05), bevel=0.012)
    B.box(sc, (cx + w / 2 + w / 4 + 0.12, y + (h - 0.36) / 2, 0.06), (w / 2, h - 0.4, 0.05), bevel=0.012)
    for px in (cx - w / 2 + slide * w / 2, cx + w / 2 + w / 4 + 0.12):
        zz = 0.18 if px < cx else 0.09
        B.box(tuple(c * 0.8 for c in sc), (px, y + (h - 0.36) / 2, zz), (0.05, h - 0.5, 0.02), bevel=0)
    B.box(PAL['woodDark'], (cx + 0.3, y + h - 0.38, 0.18), (w * 1.9, 0.06, 0.06), bevel=0)


def opening(B, rnd, cx, span, top, kind):
    """Wide squared opening with a heavy timber lintel and posts."""
    B.box(PAL['interior'], (cx, top / 2, 0.012), (span, top, 0.02), bevel=0)
    for s in (-1, 1):
        B.box(PAL['woodDark'], (cx + s * (span / 2 + 0.1), top / 2, 0.1), (0.2, top, 0.2), bevel=0.02)
        B.box(PAL['stoneDark'], (cx + s * (span / 2 + 0.1), 0.15, 0.12), (0.3, 0.3, 0.26), bevel=0.02)
    B.box(PAL['woodDark'], (cx, top + 0.12, 0.13), (span + 0.6, 0.24, 0.26), bevel=0.02)
    lintel_stack(B, cx, top + 0.24, span + 0.2)
    if kind == 'shop':
        B.box(PAL['wood'], (cx, 0.5, 0.25), (span - 0.2, 1.0, 0.45), bevel=0.02)
        B.box(PAL['woodDark'], (cx, 1.02, 0.27), (span - 0.1, 0.06, 0.5), bevel=0.01)
        # hanging cloth curtain in the doorway
        B.box(hexc('#B23A2A'), (cx, top - 0.35, 0.05), (span - 0.1, 0.6, 0.02), bevel=0)
        B.box(PAL['paper'], (cx, top - 0.62, 0.06), (span - 0.1, 0.08, 0.02), bevel=0)
    else:
        B.box(PAL['wood'], (cx, top * 0.42, 0.03), (span * 0.5, top * 0.84, 0.03), bevel=0.01)


def door(B, rnd, cx, lamps):
    w, h = 1.3, 2.4
    B.box(PAL['wood'], (cx, h / 2, 0.06), (w, h, 0.08), bevel=0.02)
    for k in range(-2, 3):
        B.box(PAL['woodDark'], (cx + k * w / 5, h / 2, 0.11), (0.03, h - 0.1, 0.02), bevel=0)
    for yy in (0.5, 1.9):
        B.box(PAL['iron'], (cx, yy, 0.12), (w - 0.1, 0.06, 0.02), bevel=0)
    B.sphere(PAL['gold'], (cx + w * 0.3, h * 0.5, 0.15), (0.09, 0.09, 0.05), lumpy=0)
    for s in (-1, 1):
        B.box(PAL['woodPaint'], (cx + s * (w / 2 + 0.1), h / 2, 0.1), (0.2, h + 0.1, 0.2), bevel=0.02)
    lintel_stack(B, cx, h + 0.05, w + 0.2)
    B.box(PAL['stone'], (cx, 0.08, 0.32), (w + 0.8, 0.16, 0.5), bevel=0.04)
    lamps.append((cx + w / 2 + 0.55, h + 0.25))


def lamp(B, x, y):
    ir = PAL['iron']
    B.box(ir, (x, y + 0.27, 0.2), (0.05, 0.05, 0.4), bevel=0)
    B.box(ir, (x, y + 0.2, 0.03), (0.14, 0.24, 0.06), bevel=0.01)
    B.box((1.0, 0.75, 0.35), (x, y - 0.02, 0.38), (0.2, 0.28, 0.2), bevel=0, shader='glow')
    B.box(PAL['woodDark'], (x, y + 0.16, 0.38), (0.3, 0.06, 0.3), bevel=0.01)
    B.box(PAL['woodDark'], (x, y - 0.18, 0.38), (0.24, 0.04, 0.24), bevel=0.01)


def house(name, spec):
    rnd = random.Random(spec['seed'])
    B = Builder()
    L, H, D = spec['len'], spec['height'], spec['depth']
    cx = L / 2
    wall = hexc(WALLS[spec['wall']])
    st, sd = PAL['stone'], PAL['stoneDark']
    lamps = []
    B.box(wall, (cx, H / 2, -D / 2), (L, H, D), cell=0.9)
    # battered stone footing
    B.box(sd, (cx, 0.45, 0.09), (L, 0.9, 0.18), bevel=0.04)
    B.box(st, (cx, 0.92, 0.1), (L, 0.08, 0.2), bevel=0.02)
    floors = []
    y = 4.0
    while y + 3.3 <= H - 1.2:
        floors.append(y)
        y += 3.3
    # timber floor bands with beam ends
    for fy in floors:
        B.box(PAL['woodDark'], (cx, fy - 0.08, 0.08), (L, 0.16, 0.16), bevel=0.02)
        x = 0.2
        while x < L - 0.1:
            B.box(PAL['woodDark'], (x, fy - 0.08, 0.2), (0.12, 0.12, 0.12), bevel=0.01)
            x += 0.45
    # red-brown band under the eaves, framed by dark beams
    B.box(PAL['band'], (cx, H - 0.55, 0.03), (L, 0.9, 0.06), bevel=0.01)
    B.box(PAL['woodDark'], (cx, H - 1.05, 0.08), (L + 0.04, 0.12, 0.16), bevel=0.015)
    x = 0.4
    while x < L - 0.3:
        B.box(PAL['ochrePaint'], (x, H - 0.55, 0.07), (0.22, 0.22, 0.03), rot=(0, 0, math.pi / 4), bevel=0)
        x += 1.1
    # deep eave: rafters repeating over a heavy wall plate
    wd = PAL['woodDark']
    B.box(wd, (cx, H - 0.02, 0.12), (L + 0.1, 0.18, 0.24), bevel=0.02)
    x = 0.15
    while x < L:
        B.box(wd, (x, H + 0.12, 0.6), (0.13, 0.15, 1.3), rot=(0.18, 0, 0), bevel=0.02)
        B.box(PAL['ochrePaint'], (x, H + 0.0, 1.24), (0.14, 0.16, 0.04), rot=(0.18, 0, 0), bevel=0)
        x += 0.32
    B.box(wd, (cx, H + 0.02, 1.3), (L + 0.4, 0.12, 0.12), bevel=0.02)
    # low-pitched shingle roof
    rise, run = D * 0.16, D / 2 + 1.35
    slope = math.atan2(rise, run)
    slen = math.hypot(rise, run)
    ey = H + 0.24
    for back in (False, True):
        zc = 1.35 - run / 2 if not back else -D - 1.35 + run / 2
        rx = (slope if not back else -slope)
        B.box(PAL['roofB'], (cx, ey + rise / 2 - 0.06, zc), (L + 0.6, 0.14, slen), rot=(rx, 0, 0), bevel=0.02)
        if not back:
            # shingle courses as stepped strips
            n = int(slen / 0.35)
            for i in range(n):
                t = (i + 0.5) / n
                zz = 1.35 - t * run
                yy = ey + t * rise + 0.03
                col = PAL['roof'] if i % 2 == 0 else tuple(c * 0.9 for c in PAL['roof'])
                B.box(col, (cx, yy, zz), (L + 0.62, 0.05, 0.36), rot=(rx, 0, 0), bevel=0)
    for gx, sgn in ((0.01, -1), (L - 0.01, 1)):
        pts = [(gx, ey - 0.02, 1.35), (gx, ey + rise + 0.05, -D / 2), (gx, ey - 0.02, -D - 1.35)]
        if sgn > 0:
            pts = list(reversed(pts))
        B.poly(wall, pts)
    B.box(PAL['ridge'], (cx, ey + rise + 0.08, -D / 2), (L + 0.6, 0.18, 0.3), bevel=0.03)
    # small gilded finial on some roofs
    if rnd.random() < 0.4:
        fx = 0.8 + rnd.random() * (L - 1.6)
        B.cyl(PAL['gold'], (fx, ey + rise + 0.45, -D / 2), 0.12, 0.6, seg=8, r2=0.02)
        B.sphere(PAL['gold'], (fx, ey + rise + 0.2, -D / 2), (0.22, 0.22, 0.22), lumpy=0)
    # ground floor bays
    bays = max(1, int(L // 2.9))
    bw = L / bays
    door_bay = rnd.randrange(bays)
    for b in range(bays):
        bx = bw * (b + 0.5)
        if spec['ground'] == 'door' or (spec['ground'] == 'shop' and b == door_bay):
            if b == door_bay:
                door(B, rnd, bx, lamps)
            else:
                window(B, rnd, bx, 1.4, 1.5, spec['shutter'])
        else:
            opening(B, rnd, bx, min(2.2, bw - 0.8), 2.5, 'shop' if spec['ground'] == 'shop' else 'arcade')
    # upper floors: plain windows, one projecting bay window on the first floor
    for fi, fy in enumerate(floors):
        wins = max(1, int(L // 2.6))
        ww = L / wins
        bay_k = rnd.randrange(wins) if spec['balconies'] and fi == 0 else -1
        for k in range(wins):
            wx = ww * (k + 0.5)
            if k == bay_k and ww * 1.0 > 2.0:
                window(B, rnd, wx, fy + 0.55, 1.9, spec['shutter'], bay=True)
            else:
                window(B, rnd, wx, fy + 0.85, 1.4 if fi == len(floors) - 1 else 1.6, spec['shutter'])
    # utility: conduit, junction box and a fan box near one corner
    cx0 = 0.4 + rnd.random() * 0.3
    B.cyl(PAL['metal'], (cx0, 1.9, 0.05), 0.035, 3.0, seg=6)
    B.cyl(PAL['metal'], (cx0 + 0.9, 3.4, 0.05), 0.035, 1.8, seg=6, rot=(0, 0, math.pi / 2))
    B.box(tuple(c * 0.9 for c in PAL['metal']), (cx0, 1.0, 0.08), (0.3, 0.4, 0.14), bevel=0.02)
    # downpipe
    B.cyl(PAL['iron'], (L - 0.1, H / 2, 0.16), 0.07, H, seg=8)
    # climbing creeper
    if rnd.random() < 0.5:
        ix = 0.7 + rnd.random() * (L - 1.4)
        top = H * (0.3 + rnd.random() * 0.3)
        stem = hexc('#4E3F2A')
        yy, k, px = 0.2, 0, ix
        while yy < top:
            nx = ix + math.sin(yy * 1.1 + spec['seed']) * 0.3
            seg = 0.45
            ang = math.atan2(nx - px, seg)
            B.cyl(stem, ((px + nx) / 2, yy + seg / 2, 0.05), 0.035, seg * 1.05, seg=5, rot=(0, 0, -ang))
            side = 1 if k % 2 else -1
            sc = 0.42 - 0.18 * (yy / top)
            B.sphere(PAL['leafA'] if k % 3 else PAL['leafB'], (nx + side * 0.16, yy + seg * 0.6, 0.09), (sc, sc * 0.75, 0.14), seed=k + spec['seed'])
            px, yy, k = nx, yy + seg, k + 1
    # exposed end walls
    for end in spec.get('ends', []):
        ex = 0.0 if end == 'start' else L
        sgn = -1 if end == 'start' else 1
        endB = EndWall(B, ex, -D / 2, sgn)
        endB.box(sd, (0, 0.45, 0.09), (D, 0.9, 0.18), bevel=0.04)
        endB.box(PAL['band'], (0, H - 0.55, 0.03), (D, 0.9, 0.06), bevel=0.01)
        for fy in floors:
            endB.box(PAL['woodDark'], (0, fy - 0.08, 0.08), (D, 0.16, 0.16), bevel=0.02)
        cols = [-D / 4, D / 4] if D > 5 else [0]
        window(endB, rnd, 0, 1.4, 1.4, spec['shutter'], lite=True)
        for fy in floors:
            for wx in cols:
                window(endB, rnd, wx, fy + 0.85, 1.5, spec['shutter'])
    for (lx, ly) in lamps:
        lamp(B, lx, ly)
    if spec['ground'] != 'door':
        lamp(B, 0.6, 3.0)
    return B.finish(name)


class EndWall:
    """Adapter that writes into a builder through an extra frame (an end wall facing +-x)."""

    def __init__(self, B, ox, oz, sgn):
        self.B = B
        self.m = Matrix.Translation((ox, 0, oz)) @ Euler((0, sgn * math.pi / 2, 0), 'ZYX').to_matrix().to_4x4()
        self.ry = sgn * math.pi / 2

    def _c(self, c):
        return tuple(self.m @ Vector(c))

    def box(self, rgb, c, s, rot=(0, 0, 0), **kw):
        self.B.box(rgb, self._c(c), s, rot=(rot[0], rot[1] + self.ry, rot[2]), **kw)

    def cyl(self, rgb, c, *a, **kw):
        self.B.cyl(rgb, self._c(c), *a, **kw)

    def sphere(self, rgb, c, s, **kw):
        self.B.sphere(rgb, self._c(c), s, **kw)


def tower(name):
    """Tapered watch tower: battered whitewash walls, red band, layered eaves, gilded finial."""
    B = Builder()
    wall = hexc(WALLS[0])
    H = 19.0
    tiers = 6
    for i in range(tiers):
        y0 = H * i / tiers
        w = 6.0 - i * 0.35
        B.box(wall, (0, y0 + H / tiers / 2, 0), (w, H / tiers + 0.02, w), cell=1.2)
    # small windows on each face
    for f in range(4):
        a = f * math.pi / 2
        for i, y in enumerate((4.5, 8.5, 12.5)):
            w = 6.0 - (y / H * tiers) * 0.35
            m = Matrix.Translation((math.sin(a) * (w / 2 + 0.01), 0, math.cos(a) * (w / 2 + 0.01))) @ Euler((0, a, 0), 'ZYX').to_matrix().to_4x4()
            for dx in ((-1.0, 1.0) if i else (0.0,)):
                c = m @ Vector((dx, y, 0.0))
                B.box(PAL['interior'], tuple(c), (0.6, 0.9, 0.08), rot=(0, a, 0), bevel=0)
                c2 = m @ Vector((dx, y + 0.55, 0.06))
                B.box(PAL['woodPaint'], tuple(c2), (0.9, 0.18, 0.14), rot=(0, a, 0), bevel=0.01)
    # red band and layered eave
    top_w = 6.0 - tiers * 0.35
    B.box(PAL['band'], (0, H + 0.6, 0), (top_w + 0.06, 1.2, top_w + 0.06), bevel=0.02)
    for k, (yy, ww) in enumerate(((H + 1.3, top_w + 2.2), (H + 2.6, top_w + 1.0))):
        B.box(PAL['woodDark'], (0, yy, 0), (ww, 0.24, ww), bevel=0.04)
        B.cyl(PAL['roof'], (0, yy + 0.55, 0), ww * 0.72, 0.9, seg=4, r2=ww * 0.42, rot=(0, math.pi / 4, 0), smooth=False)
    B.box(wall, (0, H + 2.0, 0), (top_w - 1.0, 1.1, top_w - 1.0), bevel=0.03)
    B.cyl(PAL['gold'], (0, H + 3.8, 0), 0.32, 1.2, seg=10, r2=0.05)
    B.sphere(PAL['gold'], (0, H + 3.3, 0), (0.55, 0.45, 0.55), lumpy=0)
    return B.finish(name)


# --------------------------------------------------------------------------- variants
VARIANTS = {
    'east_0': dict(len=7.6, height=12.6, depth=7, wall=0, shutter=0, ground='arcade', balconies=True, seed=101),
    'east_1': dict(len=6.2, height=10.0, depth=6.5, wall=1, shutter=1, ground='shop', balconies=False, laundry=True, seed=102),
    'east_2': dict(len=7.4, height=12.0, depth=7, wall=2, shutter=4, ground='shop', balconies=True, seed=103),
    'east_3': dict(len=6.2, height=10.6, depth=6.5, wall=3, shutter=2, ground='door', balconies=True, seed=104, ends=['end']),
    'west_0': dict(len=7.2, height=11.0, depth=6, wall=1, shutter=0, ground='door', balconies=True, laundry=True, seed=201, ends=['start']),
    'west_1': dict(len=6.8, height=12.4, depth=6, wall=5, shutter=3, ground='shop', balconies=True, seed=202),
    'west_2': dict(len=6.0, height=9.6, depth=6, wall=3, shutter=1, ground='door', balconies=False, seed=203),
    'far_0': dict(len=7.0, height=10.5, depth=6, wall=4, shutter=4, ground='shop', balconies=True, seed=301),
    'far_1': dict(len=6.5, height=12.0, depth=6, wall=2, shutter=0, ground='door', balconies=True, seed=302),
}


def bake_and_finish(ob, ground):
    """Bake AO into a colour attribute, multiply in the base colours and collapse to 3 materials."""
    me = ob.data
    for o in bpy.context.scene.objects:
        o.select_set(False)
        o.hide_render = o not in (ob, ground)
    ao = me.color_attributes.new('AO', 'FLOAT_COLOR', 'CORNER')
    me.color_attributes.active_color = ao
    # bake needs a material on the object
    if not me.materials:
        me.materials.append(bpy.data.materials.get('bake_tmp') or bpy.data.materials.new('bake_tmp'))
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
    colors = COLORS[ob.name]
    cidx = me.attributes['cidx'].data
    out = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    aod = ao.data
    od = out.data
    zmin = min(v.co.z for v in me.vertices)
    zmax = max(v.co.z for v in me.vertices)
    for poly in me.polygons:
        r, g, b, shader = colors[cidx[poly.index].value]
        for li in poly.loop_indices:
            a = aod[li].color[0]
            if shader != 'matte':
                a = 1.0
            # soft painted falloff: slightly darker and cooler toward the ground
            hz = (me.vertices[me.loops[li].vertex_index].co.z - zmin) / max(1e-3, zmax - zmin)
            grad = 0.9 + 0.12 * min(1.0, hz * 1.5)
            k = (0.35 + 0.65 * a ** 1.4) * grad
            od[li].color = (r * k, g * k * (0.985 + 0.015 * a), b * k * (0.97 + 0.03 * (1 - a)), 1.0)
    me.color_attributes.remove(me.color_attributes['AO'])
    me.color_attributes.active_color = me.color_attributes['Col']
    me.color_attributes.render_color_index = me.color_attributes.active_color_index
    # collapse to three materials
    me.materials.clear()
    for nm in ('town_matte', 'town_glass', 'town_glow'):
        me.materials.append(MATS[nm])
    slot = {'matte': 0, 'glass': 1, 'glow': 2}
    for poly in me.polygons:
        poly.material_index = slot[colors[cidx[poly.index].value][3]]
    me.attributes.remove(me.attributes['cidx'])


def make_mat(name, rough, metal=0.0, emit=None):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    attr = nt.nodes.new('ShaderNodeVertexColor')
    attr.layer_name = 'Col'
    nt.links.new(attr.outputs['Color'], bsdf.inputs['Base Color'])
    if emit:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1)
        bsdf.inputs['Emission Strength'].default_value = 2.0
    return m


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 48
    world = bpy.data.worlds.new('w')
    sc.world = world
    world.light_settings.distance = 1.6
    global MATS
    MATS = {
        'town_matte': make_mat('town_matte', 0.88),
        'town_glass': make_mat('town_glass', 0.12, 0.5),
        'town_glow': make_mat('town_glow', 0.4, 0, emit=(1.0, 0.72, 0.36)),
    }
    gme = bpy.data.meshes.new('ground')
    bmg = bmesh.new()
    bmesh.ops.create_grid(bmg, x_segments=1, y_segments=1, size=40)
    bmg.to_mesh(gme)
    ground = bpy.data.objects.new('ground', gme)
    sc.collection.objects.link(ground)
    objs = []
    for name, spec in VARIANTS.items():
        ob = house(name, spec)
        objs.append(ob)
    objs.append(tower('bell_tower'))
    for ob in objs:
        ob.location = (0, 0, 0)
        bake_and_finish(ob, ground)
        print('baked', ob.name, len(ob.data.vertices), 'verts')
    bpy.data.objects.remove(ground)
    for o in sc.objects:
        o.hide_render = False
    bpy.ops.export_scene.gltf(
        filepath=OUT,
        export_format='GLB',
        use_selection=False,
        export_vertex_color='ACTIVE',
        export_all_vertex_colors=False,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_texcoords=False,
        export_materials='EXPORT',
    )
    print('exported', OUT)


if __name__ == '__main__':
    main()
