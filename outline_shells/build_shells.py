"""Build a shells-only FBX for outline-shader use.

For every Model in the source scene, emit a duplicate Model + duplicate
Geometry (a plain, exact copy of the mesh) named <Model>_Outline. The
resulting file contains ONLY the shells, at the scene root, with no material
assigned (the outline-shader material is applied by the user downstream).
"""
import sys, fbx

SRC = sys.argv[1]
DST = sys.argv[2]
SEP = b"\x00\x01"  # FBX object-name / class separator

data = open(SRC, "rb").read()
roots, version, footer = fbx.parse(data)

objects = next(r for r in roots if r.name == b"Objects")
conns = next(r for r in roots if r.name == b"Connections")

models = objects.find_all("Model")
geoms = objects.find_all("Geometry")
geom_by_id = {g.pval(0): g for g in geoms}

# geometry-id -> model-id  (from OO connections where child is a Geometry)
model_ids = {m.pval(0) for m in models}
geom_to_model = {}
for c in conns.children:
    if c.name != b"C":
        continue
    kind = c.pval(0)
    child_id, parent_id = c.pval(1), c.pval(2)
    if kind == b"OO" and child_id in geom_by_id and parent_id in model_ids:
        geom_to_model[child_id] = parent_id
model_to_geom = {mid: gid for gid, mid in geom_to_model.items()}


def clone(n):
    return fbx.Node(
        n.name,
        [(t, (list(v) if isinstance(v, list) else v), e) for (t, v, e) in n.props],
        [clone(c) for c in n.children],
    )


def base_name(name_bytes):
    return name_bytes.split(SEP, 1)[0]


# fresh, collision-free ids (originals are < 1e9)
next_model_id = 1_000_000_001
next_geom_id = 2_000_000_001

new_objects = fbx.Node(b"Objects")
new_conns = fbx.Node(b"Connections")

summary = []
for m in models:
    orig_mid = m.pval(0)
    gid = model_to_geom.get(orig_mid)
    if gid is None:
        print("  ! model has no geometry, skipping:", base_name(m.pval(1)).decode())
        continue
    g = geom_by_id[gid]
    mbase = base_name(m.pval(1))            # e.g. b"BodyFlat"
    shell_name = mbase + b"_Outline"

    new_mid = next_model_id; next_model_id += 1
    new_gid = next_geom_id; next_geom_id += 1

    nm = clone(m)
    nm.props[0] = ("L", new_mid, None)
    nm.props[1] = ("S", shell_name + SEP + b"Model", None)

    ng = clone(g)
    ng.props[0] = ("L", new_gid, None)
    ng.props[1] = ("S", shell_name + SEP + b"Geometry", None)

    # keep the model first then geometry (order is not significant, but tidy)
    new_objects.children.append(nm)
    new_objects.children.append(ng)

    # connections: Model -> scene root(0); Geometry -> Model
    new_conns.children.append(fbx.Node(b"C", [("S", b"OO", None), ("L", new_mid, None), ("L", 0, None)]))
    new_conns.children.append(fbx.Node(b"C", [("S", b"OO", None), ("L", new_gid, None), ("L", new_mid, None)]))

    verts = len(g.find("Vertices").pval(0)) // 3
    summary.append((shell_name.decode(), verts, new_mid, new_gid))

# assemble output root list: keep scene meta, swap Objects + Connections
out_roots = []
for r in roots:
    if r.name == b"Objects":
        out_roots.append(new_objects)
    elif r.name == b"Connections":
        out_roots.append(new_conns)
    else:
        out_roots.append(r)

out = fbx.write(out_roots, version)
open(DST, "wb").write(out)

print(f"source: {SRC}")
print(f"wrote : {DST}  ({len(out)} bytes)")
print(f"shells: {len(summary)}")
for name, v, mid, gid in summary:
    print(f"  {name:22s} verts={v:4d}  model_id={mid}  geom_id={gid}")
