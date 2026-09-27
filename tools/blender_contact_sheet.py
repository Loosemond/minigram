"""Render a contact sheet of many .glb files (bind pose, 3/4 view).

    blender -b --python blender_contact_sheet.py -- out.png cell_px a.glb b.glb ...
"""
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
out, cell, files = argv[0], int(argv[1]), argv[2:]
tmp = os.path.splitext(out)[0] + "_cells"
os.makedirs(tmp, exist_ok=True)
cells = []
for i, glb in enumerate(files):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=glb)
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == "MESH" and o.data.materials and o.visible_get()]
    for o in scene.objects:
        if o.type == "MESH" and o not in meshes:
            o.hide_render = True
    arm = next((o for o in scene.objects if o.type == "ARMATURE"), None)
    if arm and arm.animation_data:
        # show the idle clip (or the first clip): some parts are hidden in bind pose
        tracks = [t for t in arm.animation_data.nla_tracks for _ in t.strips]
        names = sorted({s.action.name for t in arm.animation_data.nla_tracks for s in t.strips if s.action})
        pick = next((n for n in names if "idle" in n), names[0] if names else None)
        if pick:
            act = bpy.data.actions[pick]
            for t in arm.animation_data.nla_tracks:
                t.mute = True
            arm.animation_data.action = act
            if hasattr(arm.animation_data, "action_slot") and arm.animation_data.action_slot is None \
                    and len(getattr(act, "slots", [])):
                arm.animation_data.action_slot = act.slots[0]
            scene.frame_set(int(act.frame_range[0]))
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    pts = []
    for o in meshes:
        ev = o.evaluated_get(deps)
        me = ev.to_mesh()
        pts += [ev.matrix_world @ v.co for v in me.vertices]
        ev.to_mesh_clear()
    if not pts:
        continue
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center, size = (lo + hi) / 2, max((hi - lo).length, 1e-3)
    if os.environ.get("EEVEE"):
        engines = scene.render.bl_rna.properties["engine"].enum_items.keys()
        scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"  # 4.2-4.x / 5.x
        scene.eevee.taa_render_samples = 8
    else:
        scene.render.engine = "BLENDER_WORKBENCH"
    scene.view_settings.view_transform = "Standard"  # the textures' own colours (AgX fades them)
    scene.view_settings.look = "None"
    for o in meshes:  # the N64 has no specular highlight
        for mat in (m for m in o.data.materials if m and m.node_tree):
            for n in mat.node_tree.nodes:
                if n.type == "BSDF_PRINCIPLED" and "Specular IOR Level" in n.inputs:
                    n.inputs["Specular IOR Level"].default_value = 0.0
    scene.display.shading.light = "STUDIO"
    scene.display.shading.color_type = "TEXTURE"
    scene.render.resolution_x = scene.render.resolution_y = cell
    scene.world = bpy.data.worlds.new("w")
    scene.world.color = (0.18, 0.2, 0.24)
    scene.world.use_nodes = True
    wnt = scene.world.node_tree
    bgn = next(n for n in wnt.nodes if n.type == "BACKGROUND")
    bgn.inputs[0].default_value = (0.3, 0.33, 0.4, 1)
    bgn.inputs[1].default_value = 1.2
    # the camera sees the grey-blue background; the model is lit by neutral white,
    # so it shows its texture colours (a tinted world would tint the model)
    lit = wnt.nodes.new("ShaderNodeBackground")
    lit.inputs[0].default_value = (1, 1, 1, 1)
    lit.inputs[1].default_value = 1.0
    lp, mix = wnt.nodes.new("ShaderNodeLightPath"), wnt.nodes.new("ShaderNodeMixShader")
    wnt.links.new(lp.outputs["Is Camera Ray"], mix.inputs[0])
    wnt.links.new(lit.outputs[0], mix.inputs[1])
    wnt.links.new(bgn.outputs[0], mix.inputs[2])
    wout = next(n for n in wnt.nodes if n.type == "OUTPUT_WORLD")
    wnt.links.new(mix.outputs[0], wout.inputs["Surface"])
    cd = bpy.data.cameras.new("cam")
    cd.type = "ORTHO"
    cd.ortho_scale = size * 0.95
    cam = bpy.data.objects.new("cam", cd)
    scene.collection.objects.link(cam)
    scene.camera = cam
    yaw, pitch = math.radians(30), math.radians(float(os.environ.get("PITCH", "12")))
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = center + d * size * 3
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    path = os.path.join(tmp, "%03d.png" % i)
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    cells.append((path, glb))

# compose with Blender's image API (no PIL inside Blender)
cols = max(1, math.ceil(math.sqrt(len(cells))))
rows = math.ceil(len(cells) / cols)
W, H = cols * cell, rows * cell
sheet = [0.0] * (W * H * 4)
for n, (path, _) in enumerate(cells):
    img = bpy.data.images.load(path)
    px = list(img.pixels)
    cx, cy = n % cols, rows - 1 - n // cols
    for y in range(cell):
        row = px[y * cell * 4:(y + 1) * cell * 4]
        start = ((cy * cell + y) * W + cx * cell) * 4
        sheet[start:start + cell * 4] = row
out_img = bpy.data.images.new("sheet", W, H, alpha=True)
out_img.pixels = sheet
out_img.filepath_raw = out
out_img.file_format = "PNG"
out_img.save()
with open(os.path.splitext(out)[0] + ".txt", "w", encoding="utf-8") as fh:
    fh.write("\n".join("%s\t%s" % (cell, name) for cell, name in cells))  # cell png <TAB> glb
print("SHEET", out, cols, rows)
