"""Pure-Python FBX binary (v7000-7400, 32-bit offsets) reader/writer.

Kaydara binary FBX container. No third-party deps (stdlib zlib only).

A property is stored as a tuple (type_char:str, value, enc:int|None).
  scalars: Y int16, C bool, I int32, F float32, D float64, L int64
  arrays : f d l i b  (value is a python list; enc 0=raw,1=zlib)
  bytes  : S (string), R (raw)   (value is bytes)
Node record layout (32-bit): u32 EndOffset, u32 NumProps, u32 PropListLen,
u8 NameLen, name, properties, [nested nodes + 13-byte NULL terminator].
"""
import struct, zlib

MAGIC = b"Kaydara FBX Binary  \x00\x1a\x00"  # 23 bytes
NULL_REC = b"\x00" * 13
FOOTER_MAGIC1 = bytes.fromhex("fabcab09d0c8d466b176fb831cf7267e")   # 16 bytes
FOOTER_MAGIC2 = bytes.fromhex("f85a8c6adef5d97eece90ce3758f290b")   # 16 bytes


class Node:
    __slots__ = ("name", "props", "children", "_props_blob", "_size")

    def __init__(self, name=b"", props=None, children=None):
        self.name = name if isinstance(name, bytes) else name.encode("utf-8")
        self.props = props if props is not None else []      # list of (type, value, enc)
        self.children = children if children is not None else []

    def __repr__(self):
        return f"<Node {self.name.decode(errors='replace')!r} props={len(self.props)} kids={len(self.children)}>"

    def find(self, name):
        n = name.encode() if isinstance(name, str) else name
        for c in self.children:
            if c.name == n:
                return c
        return None

    def find_all(self, name):
        n = name.encode() if isinstance(name, str) else name
        return [c for c in self.children if c.name == n]

    def pval(self, i):
        return self.props[i][1]


# ---------------- Reader ----------------
class Reader:
    def __init__(self, data):
        self.d = data
        self.p = 0

    def u8(self):
        v = self.d[self.p]; self.p += 1; return v

    def u32(self):
        v = struct.unpack_from("<I", self.d, self.p)[0]; self.p += 4; return v

    def read_header(self):
        assert self.d[:23] == MAGIC, "not a binary FBX v7x"
        self.p = 23
        self.version = self.u32()
        return self.version

    def read_property(self):
        t = chr(self.d[self.p]); self.p += 1
        d = self.d
        if t == 'Y':
            v = struct.unpack_from("<h", d, self.p)[0]; self.p += 2; return (t, v, None)
        if t == 'C':
            v = bool(d[self.p]); self.p += 1; return (t, v, None)
        if t == 'I':
            v = struct.unpack_from("<i", d, self.p)[0]; self.p += 4; return (t, v, None)
        if t == 'F':
            v = struct.unpack_from("<f", d, self.p)[0]; self.p += 4; return (t, v, None)
        if t == 'D':
            v = struct.unpack_from("<d", d, self.p)[0]; self.p += 8; return (t, v, None)
        if t == 'L':
            v = struct.unpack_from("<q", d, self.p)[0]; self.p += 8; return (t, v, None)
        if t in ('f', 'd', 'l', 'i', 'b'):
            arr_len = self.u32(); enc = self.u32(); comp_len = self.u32()
            raw = d[self.p:self.p + comp_len]; self.p += comp_len
            if enc == 1:
                raw = zlib.decompress(raw)
            fmt = {'f': 'f', 'd': 'd', 'l': 'q', 'i': 'i', 'b': 'b'}[t]
            v = list(struct.unpack("<%d%s" % (arr_len, fmt), raw))
            return (t, v, enc)
        if t in ('S', 'R'):
            ln = self.u32()
            v = d[self.p:self.p + ln]; self.p += ln
            return (t, v, None)
        raise ValueError(f"unknown prop type {t!r} at offset {self.p - 1}")

    def read_node(self):
        end_offset = self.u32()
        num_props = self.u32()
        prop_list_len = self.u32()
        name_len = self.u8()
        if end_offset == 0 and num_props == 0 and prop_list_len == 0 and name_len == 0:
            return None
        name = self.d[self.p:self.p + name_len]; self.p += name_len
        node = Node(name)
        for _ in range(num_props):
            node.props.append(self.read_property())
        if self.p < end_offset:
            while self.p < end_offset:
                child = self.read_node()
                if child is None:
                    break
                node.children.append(child)
        self.p = end_offset
        return node

    def read_all(self):
        self.read_header()
        roots = []
        while self.p + 13 <= len(self.d):
            node = self.read_node()
            if node is None:
                break
            roots.append(node)
        footer = self.d[self.p:]
        return roots, self.version, footer


def parse(data):
    return Reader(data).read_all()


# ---------------- Writer ----------------
def _encode_property(t, v, enc):
    if t == 'Y':
        return b'Y' + struct.pack("<h", v)
    if t == 'C':
        return b'C' + struct.pack("<b", 1 if v else 0)
    if t == 'I':
        return b'I' + struct.pack("<i", v)
    if t == 'F':
        return b'F' + struct.pack("<f", v)
    if t == 'D':
        return b'D' + struct.pack("<d", v)
    if t == 'L':
        return b'L' + struct.pack("<q", v)
    if t in ('f', 'd', 'l', 'i', 'b'):
        fmt = {'f': 'f', 'd': 'd', 'l': 'q', 'i': 'i', 'b': 'b'}[t]
        raw = struct.pack("<%d%s" % (len(v), fmt), *v)
        use_enc = 1 if enc in (1, None) else 0  # default to compressed like most exporters
        if enc == 0:
            use_enc = 0
        if use_enc == 1:
            payload = zlib.compress(raw)
        else:
            payload = raw
        return t.encode() + struct.pack("<III", len(v), use_enc, len(payload)) + payload
    if t in ('S', 'R'):
        b = v if isinstance(v, bytes) else v.encode()
        return t.encode() + struct.pack("<I", len(b)) + b
    raise ValueError(f"cannot encode prop type {t!r}")


def _node_size(node):
    props_blob = b"".join(_encode_property(t, v, e) for (t, v, e) in node.props)
    size = 13 + len(node.name) + len(props_blob)
    if node.children:
        for c in node.children:
            size += _node_size(c)
        size += 13  # null terminator
    node._props_blob = props_blob
    node._size = size
    return size


def _write_node(node, base_offset):
    # base_offset = absolute position where this node starts
    end_offset = base_offset + node._size
    out = struct.pack("<III", end_offset, len(node.props), len(node._props_blob))
    out += struct.pack("<B", len(node.name)) + node.name
    out += node._props_blob
    cur = base_offset + 13 + len(node.name) + len(node._props_blob)
    if node.children:
        for c in node.children:
            out += _write_node(c, cur)
            cur += c._size
        out += NULL_REC
    return out


def _build_footer(body_end_offset, version):
    """Reconstruct the binary FBX footer with correct alignment padding.

    Layout: magic1(16) | pad | version(u32) | zeros(120) | magic2(16).
    Padding rounds the *file* offset up to the next 16-byte boundary; when
    already aligned a full 16-byte pad is written (Blender encode_bin rule).
    """
    off = body_end_offset + len(FOOTER_MAGIC1)
    pad = ((off + 15) & ~15) - off
    if pad == 0:
        pad = 16
    return (FOOTER_MAGIC1 + b"\x00" * pad + struct.pack("<i", version)
            + b"\x00" * 120 + FOOTER_MAGIC2)


def write(roots, version, footer=None):
    header = MAGIC + struct.pack("<I", version)
    body = b""
    cur = len(header)
    for r in roots:
        _node_size(r)
        body += _write_node(r, cur)
        cur += r._size
    # top-level null terminator
    body += NULL_REC
    body_end = len(header) + len(body)
    footer_bytes = _build_footer(body_end, version)
    return header + body + footer_bytes
