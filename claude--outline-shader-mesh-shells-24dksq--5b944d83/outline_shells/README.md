# Outline-Shader Shell Meshes

Duplicate "shell" meshes generated from `source/MP_Tes_r_2.fbx` for use with an
outline shader material (inverted-hull technique).

## Deliverable

`MP_Tes_r_2_Outline_Shells.fbx` — a **shells-only** FBX (binary, v7400)
containing one duplicate object per model in the source scene:

| Shell object       | Verts | Source model    |
|--------------------|------:|-----------------|
| `BodyFlat_Outline`        |   8 | BodyFlat        |
| `CrossRounded_Outline`    | 268 | CrossRounded    |
| `EndRounded_Outline`      | 300 | EndRounded      |
| `LRounded_Outline`        | 300 | LRounded        |
| `Solo_Outline`            | 288 | Solo            |
| `StraightRounded_Outline` | 174 | StraightRounded |
| `TRounded_Outline`        | 193 | TRounded        |

Each shell is a **plain, exact duplicate** of the source mesh — same vertices,
polygons, normals, and UV layers (verified as a byte-faithful deep copy). No
material is assigned in the file; apply your outline shader material to these
objects downstream. Because the geometry is unmodified, the shader is expected
to do the normal-extrusion (inverted hull) at render time.

The shells sit at the scene root with identity transforms, matching the source
models' placement, so a shell overlays its original 1:1.

## Regenerating

Pure Python 3, standard library only (no Blender / FBX SDK required):

```bash
python3 build_shells.py source/MP_Tes_r_2.fbx MP_Tes_r_2_Outline_Shells.fbx
```

- `fbx.py` — minimal binary-FBX (v7000–7400) reader/writer. Round-trips the
  source files structurally and reconstructs the file footer byte-exact.
- `build_shells.py` — clones each Model + its Geometry, renames to
  `<Model>_Outline`, assigns fresh non-colliding object ids, and rewrites a
  shells-only scene (Model→root and Geometry→Model connections only).

## Notes / options not applied

The shells are unmodified copies. If your pipeline instead needs a
**pre-inflated** shell (vertices baked-pushed along normals) or a
**flipped-normal** shell (back-face-culling outlines), those are small
additions to `build_shells.py` — ask and they can be regenerated.
