# Colours in Blender

Code: `tools/blender/ps2_import.py` (the *Game colours* import option,
`import_model(matte=…)`), `tools/blender_contact_sheet.py` (thumbnails).

The extracted textures hold the ROM's colours unchanged. What made models look
too bright and washed out in Blender was Blender's own defaults, not the
extraction. Two of the three causes are fixed; the third needs data we don't
have yet.

## Is it set up?

- **New imports: yes, automatically.** File ▸ Import ▸ Pokemon Stadium 2
  (.glb) and the browser's **Import** button both have *Game colours* on by
  default (add-on 1.7.0 and later). Untick it in the import options to keep
  the scene's own settings.
- **Thumbnails: yes.** `make_previews.py` renders with the same settings.
- **Scenes imported before 1.7.0: no.** They keep AgX and the specular. Use
  [the quick fix](#quick-fix-for-existing-scenes) below, or re-import.

## What changes the colours

### 1. The view transform (fixed)

Since Blender 4.0 every new scene uses the **AgX** view transform. It is
tuned for photoreal renders and fades saturated colours toward pastel, which
is what reads as "too bright". Measured on Pikachu's body in a flat white
world (EEVEE, Blender 5.2):

| Setting | Colour | Saturation | Brightness |
|---|---|---|---|
| Texture in the ROM | rgb(255, 222, 49) | 80% | 100% |
| AgX (Blender default) | rgb(200, 180, 110) | 44% | 78% |
| Standard | rgb(255, 222, 62) | 75% | 100% |
| Standard, no specular | rgb(254, 221, 49) | 80% | 99% |

*Game colours* sets the scene's view transform to **Standard**, look
**None**. The view transform applies to everything in the scene, including
the unlit (emission) materials of arenas and maps.

### 2. The specular highlight (fixed)

Blender's glTF importer gives every lit material a Principled BSDF with the
default specular (IOR level 0.5), which adds a white sheen at grazing angles
and under the Material Preview HDRI. The N64 has no specular. *Game colours*
sets **Specular IOR Level** to 0 on the imported model's materials. Unlit
materials (vertex-coloured surfaces, such as arena floors) have no specular
to remove.

### 3. The lighting model (not fixed)

On the N64 a lit pixel is the texture colour × the vertex's *shade*, which
the RSP computes as ambient + Σ (N·L × light colour), clamped to 1. The
multiply happens on the display values, and there is no specular. Blender
lights in linear space, so the same light and shadow come out softer and
lighter: shadowed sides are brighter than in the game.

Matching this needs the battle scene's light directions and colours, which
aren't extracted ([open-questions.md](open-questions.md)). With them, the
add-on could rebuild the game's lighting as shader nodes, as it already does
for the arena colour combiners.

## Quick fix for existing scenes

**By hand:** Properties ▸ Render ▸ Color Management ▸ **View Transform:
Standard**, **Look: None**. This fixes most of it. Then, if you want, set
**Specular IOR Level** to 0 on each model's materials.

**As a script:** Scripting workspace ▸ Text Editor ▸ New, paste, **Run
Script**. It changes the view transform and the materials of PS2 models
only (meshes under a rig imported by the add-on); other materials in the file
are left alone.

```python
import bpy
scene = bpy.context.scene
scene.view_settings.view_transform, scene.view_settings.look = "Standard", "None"
for rig in (o for o in bpy.data.objects if "ps2_model" in o):
    for part in (c for c in rig.children if c.type == "MESH"):
        for mat in (m for m in part.data.materials if m and m.node_tree):
            for n in mat.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED":
                    n.inputs["Specular IOR Level"].default_value = 0.0
```

## Thumbnails

`blender_contact_sheet.py` imports with plain glTF, so it applies the same
two settings itself. It also lights models with a neutral white world while
the camera still sees the blue-grey background (a Light Path *Is Camera Ray*
mix): under Standard, a tinted world would tint the model.
