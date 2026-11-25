"""Shrink the exported town.glb without extra libraries.

- vertex colours: float32 RGBA -> normalized uint8 RGBA (4x smaller)
- normals are dropped; the game recomputes them (computeVertexNormals keeps the
  flat/smooth split because Blender already splits vertices on hard edges)

Usage: python tools/blender/pack_glb.py in.glb out.glb
"""
import json
import struct
import sys


def read_glb(path):
    data = open(path, 'rb').read()
    magic, ver, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67
    off = 12
    js, binc = None, b''
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk)
        else:
            binc = chunk
        off += 8 + clen
    return js, binc


COMP = {5126: ('f', 4), 5123: ('H', 2), 5125: ('I', 4), 5121: ('B', 1)}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}


def accessor_bytes(js, binc, ai):
    a = js['accessors'][ai]
    bv = js['bufferViews'][a['bufferView']]
    fmt, size = COMP[a['componentType']]
    n = NCOMP[a['type']]
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', size * n)
    out = []
    for i in range(a['count']):
        out.append(struct.unpack_from('<' + fmt * n, binc, start + i * stride))
    return out


def main(src, dst):
    js, binc = read_glb(src)
    new_bin = bytearray()
    new_views = []
    new_accs = []
    remap = {}

    def add_view(raw, target=None):
        while len(new_bin) % 4:
            new_bin.append(0)
        v = {'buffer': 0, 'byteOffset': len(new_bin), 'byteLength': len(raw)}
        if target:
            v['target'] = target
        new_bin.extend(raw)
        new_views.append(v)
        return len(new_views) - 1

    def copy_accessor(ai, target):
        if ai in remap:
            return remap[ai]
        a = dict(js['accessors'][ai])
        bv = js['bufferViews'][a['bufferView']]
        fmt, size = COMP[a['componentType']]
        n = NCOMP[a['type']]
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        raw = binc[start: start + a['count'] * size * n]
        a['bufferView'] = add_view(raw, target)
        a.pop('byteOffset', None)
        new_accs.append(a)
        remap[ai] = len(new_accs) - 1
        return remap[ai]

    def color_accessor(ai):
        a = js['accessors'][ai]
        vals = accessor_bytes(js, binc, ai)
        if a['componentType'] != 5126:
            scale = float((1 << (8 * COMP[a['componentType']][1])) - 1)
            vals = [tuple(c / scale for c in v) for v in vals]
        raw = bytearray()
        for v in vals:
            rgba = list(v) + [1.0] * (4 - len(v))
            raw.extend(struct.pack('<4B', *[max(0, min(255, round(c * 255))) for c in rgba]))
        na = {'bufferView': add_view(bytes(raw), 34962), 'componentType': 5121, 'normalized': True,
              'count': a['count'], 'type': 'VEC4'}
        new_accs.append(na)
        return len(new_accs) - 1

    for mesh in js['meshes']:
        for prim in mesh['primitives']:
            attrs = {}
            for k, ai in prim['attributes'].items():
                if k == 'NORMAL':
                    continue
                if k.startswith('COLOR_'):
                    attrs[k] = color_accessor(ai)
                else:
                    attrs[k] = copy_accessor(ai, 34962)
            prim['attributes'] = attrs
            if 'indices' in prim:
                prim['indices'] = copy_accessor(prim['indices'], 34963)
    js['accessors'] = new_accs
    js['bufferViews'] = new_views
    while len(new_bin) % 4:
        new_bin.append(0)
    js['buffers'] = [{'byteLength': len(new_bin)}]
    jraw = json.dumps(js, separators=(',', ':')).encode()
    while len(jraw) % 4:
        jraw += b' '
    total = 12 + 8 + len(jraw) + 8 + len(new_bin)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(jraw), 0x4E4F534A))
        f.write(jraw)
        f.write(struct.pack('<II', len(new_bin), 0x004E4942))
        f.write(new_bin)
    print(f'{src}: {len(binc)} -> {len(new_bin)} bytes of geometry')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
