"""Render preview images of exported .glb files with Blender (headless).

    blender -b --python blender_preview.py -- model.glb out.png [clip_name] [frame] [--grid]

Imports the glb, optionally poses it at a frame of a clip, frames the camera
on the model and renders with Workbench (texture colours). With --grid it
renders a 4-view contact sheet: front, side, back, 3/4.
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
flags = [a for a in argv if a.startswith("--")]
argv = [a for a in argv if not a.startswith("--")]
glb, out = argv[0], argv[1]
clip = argv[2] if len(argv) > 2 else None
frame = float(argv[3]) if len(argv) > 3 else 0.0

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
scene = bpy.context.scene

arm = next((o for o in scene.objects if o.type == "ARMATURE"), None)
meshes = [o for o in scene.objects if o.type == "MESH" and o.data.materials and o.visible_get()]
for o in scene.objects:
    if o.type == "MESH" and o not in meshes:
        o.hide_render = True
if arm and clip:
    act = next((a for a in bpy.data.actions if a.name.startswith(clip)), None)
    if act:
        arm.animation_data_create()
        arm.animation_data.action = act
        lo, hi = act.frame_range
        scene.frame_set(int(lo + frame * scene.render.fps / 30.0))
elif arm and arm.animation_data:
    arm.animation_data.action = None
    for pb in arm.pose.bones:
        pass
bpy.context.view_layer.update()

# bounds of the evaluated (posed) meshes
deps = bpy.context.evaluated_depsgraph_get()
pts = []
for o in meshes:
    ev = o.evaluated_get(deps)
    me = ev.to_mesh()
    pts += [ev.matrix_world @ v.co for v in me.vertices]
    ev.to_mesh_clear()
lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
center = (lo + hi) / 2
size = max((hi - lo).length, 1e-3)
print("BOUNDS", tuple(round(c, 3) for c in lo), tuple(round(c, 3) for c in hi))

if "--eevee" in flags:
    for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
        try:
            scene.render.engine = eng
            break
        except TypeError:
            pass
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.0
    sun.rotation_euler = (0.8, 0.2, 0.6)
    scene.collection.objects.link(sun)
else:
    scene.render.engine = "BLENDER_WORKBENCH"
shading = scene.display.shading
shading.light = "STUDIO"
shading.color_type = "TEXTURE"
shading.show_backface_culling = False
scene.render.resolution_x = scene.render.resolution_y = 512
scene.render.film_transparent = False
world = bpy.data.worlds.new("w")
scene.world = world
world.color = (0.18, 0.2, 0.24)
world.use_nodes = True
bg = next(n for n in world.node_tree.nodes if n.type == "BACKGROUND")
bg.inputs[0].default_value = (0.35, 0.38, 0.45, 1)
bg.inputs[1].default_value = 1.0

cam_data = bpy.data.cameras.new("cam")
cam_data.type = "ORTHO"
cam_data.ortho_scale = size * 1.05
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam


def shoot(yaw_deg, path, pitch_deg=10):
    yaw, pitch = math.radians(yaw_deg), math.radians(pitch_deg)
    # glTF +Z (model front) becomes Blender -Y
    d = Vector((math.sin(yaw) * math.cos(pitch), -math.cos(yaw) * math.cos(pitch), math.sin(pitch)))
    cam.location = center + d * size * 3
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


if "--grid" in flags:
    import os
    base, ext = os.path.splitext(out)
    for yaw in (0, 90, 180, 35):
        shoot(yaw, "%s_%03d%s" % (base, yaw, ext))
else:
    shoot(30, out)
