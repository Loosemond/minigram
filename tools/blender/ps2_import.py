bl_info = {
    "name": "Pokemon Stadium 2 models",
    "author": "ps2tool",
    "version": (1, 4, 0),
    "blender": (4, 2, 0),
    "location": "File > Import > Pokemon Stadium 2 (.glb), View3D > Sidebar > PS2",
    "description": "Import models exported by ps2extract.py with animated eyes/mouths "
                   "and a clip browser",
    "category": "Import-Export",
}

"""Blender add-on for models exported by ps2extract.py.

A plain glTF import already gives the mesh, textures, skeleton and every
animation clip. This add-on additionally
  * wires up the face (eyes / mouth) texture animation: each animated
    material gets its alternative textures, selected by drivers that read a
    custom property on the armature ("ps2_face_<channel>"), and those
    properties are keyframed inside every clip's action;
  * adds a sidebar panel (N panel > "PS2") listing the clips with their
    battle roles, to play them with one click;
  * rebuilds arena materials as live shader nodes from the N64 colour
    combiner recipe the extractor stores ("ps2_combiner"): textures scroll,
    colour tracks animate, vertex shading is exact, and see-through water
    blends over the arena's background colour;
  * gives each arena its own background colour (the colour the game clears
    the screen to) on a box around it that belongs to the arena: seen only
    from inside, by the camera only, so the scene's world and the lighting
    of other models are left alone ("Background" button in the panel);
  * a Browser panel (N panel > PS2): every exported model by name, with
    thumbnails, category filter and search; Import brings it in with all of
    the above. Point it at the extractor's output folder (catalog.json);
    it finds it by itself after the first import from that folder;
  * keeps each model in one piece when it is moved: selecting a model's mesh
    also selects its armature, so G/R/S transform the armature and the mesh
    follows. (Moving the mesh on its own offsets it from its bones and the
    animation then distorts it.)

Install: Edit > Preferences > Add-ons > (v) > Install from Disk... > this file.
Or open it in the Text Editor and press Run Script (registers for the session).
Headless: blender -b --python ps2_import.py -- model.glb [more.glb ...]
"""

import json
import os
import sys

import bpy
import bpy.utils.previews
from bpy.app.handlers import persistent
from bpy.props import BoolProperty, CollectionProperty, EnumProperty, StringProperty
from bpy.types import AddonPreferences, Operator, OperatorFileListElement, Panel
from bpy_extras.io_utils import ImportHelper
from mathutils import Vector

GAME_FPS = 30.0


def _sock(sockets, ident):
    for s in sockets:
        if s.identifier == ident:
            return s
    raise KeyError(ident)


def _idprop_to_py(v):
    return v.to_dict() if hasattr(v, "to_dict") else v


def _set_action(arm, action):
    ad = arm.animation_data or arm.animation_data_create()
    ad.action = action
    if hasattr(ad, "action_slot") and ad.action_slot is None and len(getattr(action, "slots", [])):
        ad.action_slot = action.slots[0]


def _clip_actions(arm):
    """clip name -> action, from the NLA tracks the glTF importer creates."""
    out = {}
    ad = arm.animation_data
    if ad:
        for t in ad.nla_tracks:
            for s in t.strips:
                if s.action:
                    out[t.name] = s.action
        if ad.action and ad.action not in out.values():
            out[ad.action.name.split(".")[0]] = ad.action
    return out


def setup_face_material(mat, face, arm, base_dir):
    nt = mat.node_tree
    src = next((n for n in nt.nodes if n.type == "TEX_IMAGE"), None)
    if src is None:
        return None
    ch, default = int(face["channel"]), int(face["default"])
    prop = "ps2_face_%d" % ch
    col_to = [l.to_socket for l in nt.links if l.from_node == src and l.from_socket.name == "Color"]
    alp_to = [l.to_socket for l in nt.links if l.from_node == src and l.from_socket.name == "Alpha"]
    vec = src.inputs["Vector"].links[0].from_socket if src.inputs["Vector"].is_linked else None
    col, alp = src.outputs["Color"], src.outputs["Alpha"]
    x, y = src.location
    row = 0
    for key, rel in sorted(face["files"].items(), key=lambda kv: int(kv[0])):
        t = int(key)
        if t == default:
            continue
        path = os.path.join(base_dir, rel)
        if not os.path.exists(path):
            continue
        row += 1
        img = bpy.data.images.load(path, check_existing=True)
        img.alpha_mode = src.image.alpha_mode if src.image else "STRAIGHT"
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image, n.extension, n.interpolation = img, src.extension, src.interpolation
        n.location = (x, y - 280 * row)
        n.label = "face tex %d" % t
        n["ps2_rel"] = rel
        if vec is not None:
            nt.links.new(vec, n.inputs["Vector"])
        for kind, prev, out_name in (("RGBA", col, "Color"), ("FLOAT", alp, "Alpha")):
            mx = nt.nodes.new("ShaderNodeMix")
            mx.data_type = kind
            mx.location = (x + 300 + 180 * row, y - (0 if kind == "RGBA" else 200))
            suffix = "Color" if kind == "RGBA" else "Float"
            nt.links.new(prev, _sock(mx.inputs, "A_" + suffix))
            nt.links.new(n.outputs[out_name], _sock(mx.inputs, "B_" + suffix))
            fac = _sock(mx.inputs, "Factor_Float")
            drv = fac.driver_add("default_value").driver
            drv.type = "SCRIPTED"
            var = drv.variables.new()
            var.name, var.type = "v", "SINGLE_PROP"
            var.targets[0].id_type = "OBJECT"
            var.targets[0].id = arm
            var.targets[0].data_path = '["%s"]' % prop
            drv.expression = "v == %d" % t
            if kind == "RGBA":
                col = _sock(mx.outputs, "Result_Color")
            else:
                alp = _sock(mx.outputs, "Result_Float")
    for s in col_to:
        nt.links.new(col, s)
    for s in alp_to:
        nt.links.new(alp, s)
    return ch, default


def key_face_tracks(arm, info, defaults, scene):
    fps = scene.render.fps / scene.render.fps_base
    actions = _clip_actions(arm)
    prefs = bpy.context.preferences.edit
    old_interp = prefs.keyframe_new_interpolation_type
    prefs.keyframe_new_interpolation_type = "CONSTANT"
    keep = arm.animation_data.action if arm.animation_data else None
    try:
        for clip in info.get("clips", []):
            action = actions.get(clip["name"])
            if action is None:
                continue
            action.use_fake_user = True
            _set_action(arm, action)
            face = clip.get("face", {})
            for ch, default in defaults.items():
                prop = "ps2_face_%d" % ch
                vals = face.get(str(ch))
                last = None
                if not vals:
                    vals = [default]
                for f, v in enumerate(vals):
                    v = default if v is None else v
                    if v != last:
                        arm[prop] = v
                        arm.keyframe_insert('["%s"]' % prop, frame=f * fps / GAME_FPS, group="face")
                        last = v
    finally:
        prefs.keyframe_new_interpolation_type = old_interp
        if keep:
            _set_action(arm, keep)


# --------------------------------------------------------------------------
# Live N64 materials (arenas): the colour combiner rebuilt as shader nodes.
# Values are computed in the game's own (gamma) space: textures are loaded as
# Non-Color, vertex colours are converted back with gamma 1/2.2 and the result
# is converted to scene linear with gamma 2.2.

def _mux_cycles(mux):
    c1, a1 = mux[8:12], mux[12:16]
    zc = all((s in (31, 7)) if k == 2 else (s == 31 or s >= 7) for k, s in enumerate(c1))
    za = all(s in (7, 31) for s in a1)
    return 1 if (zc and za) else 2


class _Nodes:
    def __init__(self, nt, x, y):
        self.nt, self.x, self.y, self.col = nt, x, y, 0
        self.cache = {}

    def new(self, kind, **props):
        n = self.nt.nodes.new(kind)
        n.location = (self.x + 180 * (self.col // 12), self.y - 70 * (self.col % 12))
        self.col += 1
        for k, v in props.items():
            setattr(n, k, v)
        n.hide = True
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    def const(self, v):
        key = ("c", v)
        if key not in self.cache:
            n = self.new("ShaderNodeValue")
            n.outputs[0].default_value = v
            self.cache[key] = n.outputs[0]
        return self.cache[key]

    def vec(self, sock):
        """float socket -> (v, v, v)"""
        key = ("v", sock.node.name, sock.identifier)
        if key not in self.cache:
            n = self.new("ShaderNodeCombineXYZ")
            for i in range(3):
                self.link(sock, n.inputs[i])
            self.cache[key] = n.outputs[0]
        return self.cache[key]

    def vmath(self, op, a, b):
        n = self.new("ShaderNodeVectorMath", operation=op)
        self.link(a, n.inputs[0])
        self.link(b, n.inputs[1])
        return n.outputs["Vector"]

    def math(self, op, a, b, clamp=False):
        n = self.new("ShaderNodeMath", operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                self.link(v, n.inputs[i])
        return n.outputs[0]


def _fcurves(idblock):
    ad = idblock.animation_data
    act = ad.action if ad else None
    if act is None:
        return []
    try:
        return list(act.fcurves)
    except AttributeError:  # layered actions only
        out = []
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    out += list(bag.fcurves)
        return out


def _raw(c):
    return [x / 255.0 for x in c]


def build_live_material(mat, spec, base_dir, uv_name, color_attr):
    nt = mat.node_tree
    nodes = nt.nodes
    emit = next((n for n in nodes if n.type == "EMISSION"), None)
    bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
    target = emit.inputs["Color"] if emit else (bsdf.inputs["Base Color"] if bsdf else None)
    base_img = next((n for n in nodes if n.type == "TEX_IMAGE"), None)
    if target is None:
        return False
    x0 = min(n.location.x for n in nodes) - 2400
    B = _Nodes(nt, x0, max(n.location.y for n in nodes))
    uv = B.new("ShaderNodeUVMap")
    uv.uv_map = uv_name

    # ---- textures: own scale, wrap, scroll (and flipbook) per tile
    texc, texa = [], []
    for k, t in enumerate(spec["textures"]):
        if t is None:
            texc.append(None)
            texa.append(None)
            continue
        w, h = t["size"]
        sx, sy = t["sf"][0] / w, t["sf"][1] / h
        mp = B.new("ShaderNodeMapping", vector_type="POINT")
        B.link(uv.outputs["UV"], mp.inputs["Vector"])
        mp.inputs["Scale"].default_value = (sx, sy, 1.0)
        mp.inputs["Location"].default_value = (0.0, 1.0 - sy, 0.0)
        ds, dt = t.get("scroll", (0.0, 0.0))
        for axis, expr in ((0, "%.8g*frame" % (-ds / w) if ds else None),
                           (1, "%.8g+%.8g*frame" % (1.0 - sy, dt / h) if dt else None)):
            if expr:
                drv = mp.inputs["Location"].driver_add("default_value", axis).driver
                drv.type, drv.expression = "SCRIPTED", expr
        vec = mp.outputs["Vector"]
        modes = t.get("wrap", [0, 0])
        if any(m_ & 3 for m_ in modes):  # per-axis clamp / mirror (repeat stays native)
            sep = B.new("ShaderNodeSeparateXYZ")
            B.link(vec, sep.inputs[0])
            comb = B.new("ShaderNodeCombineXYZ")
            for axis in (0, 1):
                v = sep.outputs[axis]
                if modes[axis] & 2:
                    v = B.math("ADD", v, 0.0, clamp=True)
                elif modes[axis] & 1:
                    n = B.new("ShaderNodeMath", operation="PINGPONG")
                    B.link(v, n.inputs[0])
                    n.inputs[1].default_value = 1.0
                    v = n.outputs[0]
                B.link(v, comb.inputs[axis])
            vec = comb.outputs[0]
        frames = t.get("frames")
        path = os.path.join(base_dir, frames[0] if frames else t["file"])
        if not os.path.exists(path):
            return False
        img = bpy.data.images.load(path, check_existing=True)
        img.colorspace_settings.name = "Non-Color"
        img.alpha_mode = "STRAIGHT"
        tn = B.new("ShaderNodeTexImage", interpolation="Linear", extension="REPEAT")
        tn.image = img
        if frames:
            img.source = "SEQUENCE"
            iu = tn.image_user
            iu.frame_duration, iu.frame_start, iu.use_cyclic, iu.use_auto_refresh = len(frames), 1, True, True
            ft = max(1, int(t.get("frame_time", 1)))
            if ft > 1:
                drv = iu.driver_add("frame_offset").driver
                drv.type, drv.expression = "SCRIPTED", "floor(frame/%d)-frame" % ft
        B.link(vec, tn.inputs["Vector"])
        texc.append(tn.outputs["Color"])
        texa.append(tn.outputs["Alpha"])
    if texc[1] is None:  # TEXEL1 without its own tile reads the same texture
        texc[1], texa[1] = texc[0], texa[0]

    # ---- colours (keyframed when the game animates them)
    prim = B.new("ShaderNodeRGB")
    prim.outputs[0].default_value = _raw(spec["prim"][:3]) + [1.0]
    pa = B.new("ShaderNodeValue")
    pa.outputs[0].default_value = spec["prim"][3] / 255.0
    plod = B.new("ShaderNodeValue")
    plod.outputs[0].default_value = spec.get("lod", 255) / 255.0
    env = B.new("ShaderNodeRGB")
    env.outputs[0].default_value = _raw(spec["env"][:3]) + [1.0]
    ea = B.new("ShaderNodeValue")
    ea.outputs[0].default_value = spec["env"][3] / 255.0
    track = spec.get("track")
    if track:
        period = max(1, int(track.get("period", 1)))
        times = list(track["times"])
        pk, ek = track.get("prim"), track.get("env")
        keys = list(zip(times, pk or [None] * len(times), ek or [None] * len(times)))
        if keys[-1][0] < period:
            keys.append((period,) + keys[0][1:])
        for fr, pv, ev in keys:
            if pv:
                prim.outputs[0].default_value = _raw(pv[:3]) + [1.0]
                prim.outputs[0].keyframe_insert("default_value", frame=fr)
                pa.outputs[0].default_value = pv[3] / 255.0
                pa.outputs[0].keyframe_insert("default_value", frame=fr)
                plod.outputs[0].default_value = pv[4] / 255.0
                plod.outputs[0].keyframe_insert("default_value", frame=fr)
            if ev:
                env.outputs[0].default_value = _raw(ev[:3]) + [1.0]
                env.outputs[0].keyframe_insert("default_value", frame=fr)
                ea.outputs[0].default_value = ev[3] / 255.0
                ea.outputs[0].keyframe_insert("default_value", frame=fr)
        for fc in _fcurves(nt):
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"
            if not any(m_.type == "CYCLES" for m_ in fc.modifiers):
                fc.modifiers.new("CYCLES")

    # ---- shade: the vertex colour (scene lighting on lit surfaces)
    if spec.get("lit"):
        shade_c, shade_a = B.vec(B.const(1.0)), B.const(1.0)
    else:
        vc = B.new("ShaderNodeVertexColor")
        vc.layer_name = color_attr
        g = B.new("ShaderNodeGamma")
        B.link(vc.outputs["Color"], g.inputs["Color"])
        g.inputs["Gamma"].default_value = 1 / 2.2
        shade_c, shade_a = g.outputs[0], vc.outputs["Alpha"]

    zero_v, one_v, half_v = B.vec(B.const(0.0)), B.vec(B.const(1.0)), B.vec(B.const(0.5))
    zero, one = B.const(0.0), B.const(1.0)
    mux = spec["mux"]
    comb_c, comb_a = zero_v, zero

    def col(sel, role):
        base = {0: comb_c, 1: texc[0], 2: texc[1], 3: prim.outputs[0], 4: shade_c, 5: env.outputs[0]}
        if sel in base:
            return base[sel]
        if role == "a":
            return one_v if sel == 6 else (half_v if sel == 7 else zero_v)
        if role == "b":
            return half_v if sel == 6 else zero_v
        if role == "c":
            sc = {6: one, 7: comb_a, 8: texa[0], 9: texa[1], 10: pa.outputs[0], 11: shade_a,
                  12: ea.outputs[0], 13: zero, 14: plod.outputs[0]}.get(sel)
            return B.vec(sc) if sc is not None else zero_v
        return one_v if sel == 6 else zero_v

    def alp(sel, role):
        if role == "c":
            return {0: zero, 1: texa[0], 2: texa[1], 3: pa.outputs[0], 4: shade_a, 5: ea.outputs[0],
                    6: plod.outputs[0]}.get(sel, zero)
        return {0: comb_a, 1: texa[0], 2: texa[1], 3: pa.outputs[0], 4: shade_a, 5: ea.outputs[0],
                6: one}.get(sel, zero)

    ncy = _mux_cycles(mux)
    for cy in range(ncy):
        ce, ae = mux[cy * 8:cy * 8 + 4], mux[cy * 8 + 4:cy * 8 + 8]
        c = B.vmath("ADD", B.vmath("MULTIPLY", B.vmath("SUBTRACT", col(ce[0], "a"), col(ce[1], "b")),
                                   col(ce[2], "c")), col(ce[3], "d"))
        a = B.math("ADD", B.math("MULTIPLY", B.math("SUBTRACT", alp(ae[0], "a"), alp(ae[1], "b")),
                                 alp(ae[2], "c")), alp(ae[3], "d"))
        comb_c, comb_a = c, a
    final_a = mux[4:8] if ncy == 1 else mux[12:16]
    if all(x in (7, 31) for x in final_a):  # opaque draws leave alpha at 0: keep texture coverage
        comb_a = one if spec.get("cov") else texa[0]
    out_c = B.vmath("MINIMUM", B.vmath("MAXIMUM", comb_c, zero_v), one_v)
    out_a = B.math("ADD", comb_a, 0.0, clamp=True)
    clear = spec.get("clear")
    if clear:  # translucent over nothing: blend over the arena's background colour
        bg = B.new("ShaderNodeRGB")
        bg.outputs[0].default_value = _raw(clear) + [1.0]
        mix = B.new("ShaderNodeMix", data_type="RGBA")
        B.link(out_a, _sock(mix.inputs, "Factor_Float"))
        B.link(bg.outputs[0], _sock(mix.inputs, "A_Color"))
        B.link(out_c, _sock(mix.inputs, "B_Color"))
        out_c, out_a = _sock(mix.outputs, "Result_Color"), one
    lin = B.new("ShaderNodeGamma")
    B.link(out_c, lin.inputs["Color"])
    lin.inputs["Gamma"].default_value = 2.2
    B.link(lin.outputs[0], target)
    # alpha: replace the importer's texture alpha x vertex alpha
    if base_img is not None:
        for l in list(nt.links):
            if l.from_node == base_img and l.from_socket.name == "Alpha":
                to = l.to_socket
                B.link(out_a, to)
                other = next((i for i in to.node.inputs if i != to and i.is_linked
                              and i.links[0].from_node.type == "VERTEX_COLOR"), None)
                if other is not None:
                    nt.links.remove(other.links[0])
                    other.default_value = 1.0
    mat["ps2_live"] = True
    return True


def setup_live_materials(objs, base_dir):
    done = set()
    n = 0
    for o in objs:
        if o.type != "MESH":
            continue
        me = o.data
        uv_name = me.uv_layers[1].name if len(me.uv_layers) > 1 else None
        color_attr = me.color_attributes[0].name if len(me.color_attributes) else "Color"
        for mat in me.materials:
            if mat is None or mat.name in done or "ps2_combiner" not in mat or uv_name is None:
                continue
            done.add(mat.name)
            spec = mat["ps2_combiner"]
            spec = json.loads(spec) if isinstance(spec, str) else _idprop_to_py(spec)
            if build_live_material(mat, spec, base_dir, uv_name, color_attr):
                n += 1
    return n


def set_world_color(scene, rgb):
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.use_nodes = True
    bg = next((n for n in world.node_tree.nodes if n.type == "BACKGROUND"), None)
    lin = [(c / 255.0) ** 2.2 for c in rgb]
    if bg is not None:
        bg.inputs["Color"].default_value = lin + [1.0]
    world.color = lin


def _backdrop(arm):
    return next((c for c in arm.children if c.get("ps2_backdrop")), None)


def add_backdrop(arm, rgb, margin=0.01):
    """The arena's background (clear) colour on a box around the arena, as
    part of the arena: seen only from inside it, by the camera only (lights,
    shadows and reflections ignore it), invisible in Solid mode, removed and
    hidden together with the arena. The scene's world is left alone."""
    import bmesh
    parts = [c for c in arm.children if c.type == "MESH" and not c.get("ps2_backdrop")]
    inv = arm.matrix_world.inverted()
    pts = [inv @ (c.matrix_world @ Vector(b)) for c in parts for b in c.bound_box]
    if not pts:
        return None
    lo = Vector([min(p[i] for p in pts) for i in range(3)])
    hi = Vector([max(p[i] for p in pts) for i in range(3)])
    pad = max((hi - lo).length * margin, 1e-3)
    lo -= Vector((pad, pad, pad))
    hi += Vector((pad, pad, pad))
    name = "%s_background" % str(arm.get("ps2_model", arm.name))
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((hi.x if i & 1 else lo.x, hi.y if i & 2 else lo.y, hi.z if i & 4 else lo.z))
          for i in range(8)]
    for f in ((0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)):
        bm.faces.new([vs[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.reverse_faces(bm, faces=bm.faces)  # facing inwards
    bm.to_mesh(me)
    bm.free()

    lin = [(c / 255.0) ** 2.2 for c in rgb]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (600, 0)
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = lin + [1.0]
    tr = nt.nodes.new("ShaderNodeBsdfTransparent")
    lp = nt.nodes.new("ShaderNodeLightPath")
    B = _Nodes(nt, -1600, 300)
    # shown only while the viewer is inside the box: viewer = P + incoming * distance
    geo = B.new("ShaderNodeNewGeometry")
    cd = B.new("ShaderNodeCameraData")
    eye = B.new("ShaderNodeVectorMath", operation="SCALE")
    B.link(geo.outputs["Incoming"], eye.inputs[0])
    B.link(cd.outputs["View Distance"], eye.inputs["Scale"])
    eye = B.vmath("ADD", eye.outputs["Vector"], geo.outputs["Position"])
    vt = B.new("ShaderNodeVectorTransform", vector_type="POINT", convert_from="WORLD", convert_to="OBJECT")
    B.link(eye, vt.inputs[0])
    centre, half = B.new("ShaderNodeCombineXYZ"), B.new("ShaderNodeCombineXYZ")
    for i in range(3):
        centre.inputs[i].default_value = (lo[i] + hi[i]) / 2
        half.inputs[i].default_value = (hi[i] - lo[i]) / 2
    d = B.new("ShaderNodeVectorMath", operation="ABSOLUTE")
    B.link(B.vmath("SUBTRACT", vt.outputs[0], centre.outputs[0]), d.inputs[0])
    d = B.vmath("SUBTRACT", d.outputs["Vector"], half.outputs[0])
    sep = B.new("ShaderNodeSeparateXYZ")
    B.link(d, sep.inputs[0])
    outside = B.math("MAXIMUM", B.math("MAXIMUM", sep.outputs[0], sep.outputs[1]), sep.outputs[2])
    inside = B.math("LESS_THAN", outside, 0.0)
    show = nt.nodes.new("ShaderNodeMixShader")
    B.link(inside, show.inputs[0])
    nt.links.new(tr.outputs[0], show.inputs[1])
    nt.links.new(em.outputs[0], show.inputs[2])
    cam = nt.nodes.new("ShaderNodeMixShader")  # only the camera sees it
    nt.links.new(lp.outputs["Is Camera Ray"], cam.inputs[0])
    nt.links.new(tr.outputs[0], cam.inputs[1])
    nt.links.new(show.outputs[0], cam.inputs[2])
    nt.links.new(cam.outputs[0], out.inputs["Surface"])
    for i, n in enumerate((lp, em, tr)):
        n.location = (-100, 250 - 200 * i)
    show.location, cam.location = (200, 100), (400, 0)
    mat.use_backface_culling = True
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "DITHERED"
    else:
        mat.blend_method = "HASHED"
    mat.diffuse_color = lin + [0.0]  # Solid mode: fully transparent
    me.materials.append(mat)

    ob = bpy.data.objects.new(name, me)
    for coll in arm.users_collection:
        coll.objects.link(ob)
    ob.parent = arm
    ob["ps2_backdrop"] = True
    ob.hide_select = True
    ob.color = (1.0, 1.0, 1.0, 0.0)
    for attr in ("visible_diffuse", "visible_glossy", "visible_transmission", "visible_volume_scatter",
                 "visible_shadow"):
        if hasattr(ob, attr):
            setattr(ob, attr, False)
    for attr in ("hide_probe_volume", "hide_probe_sphere", "hide_probe_plane"):
        if hasattr(ob, attr):
            setattr(ob, attr, True)
    return ob


def _remove_objects(names):
    for n in names:
        o = bpy.data.objects.get(n)
        if o is None or o.parent is not None:
            continue
        me = o.data
        mats = [m for m in me.materials if m] if me else []
        bpy.data.objects.remove(o)
        if me is not None and me.users == 0:
            bpy.data.meshes.remove(me)
        for m in mats:
            if m.users == 0:
                bpy.data.materials.remove(m)
    return None


@persistent
def _backdrops_follow_arena(scene, depsgraph):
    """A background box lives and hides with its arena."""
    if not depsgraph.id_type_updated("OBJECT"):
        return
    vl = depsgraph.view_layer
    orphans = []
    for o in scene.objects:
        if not o.get("ps2_backdrop"):
            continue
        if o.parent is None:
            orphans.append(o.name)
            continue
        parts = [c for c in o.parent.children if c.type == "MESH" and c is not o]
        hide = bool(parts) and not any(c.visible_get(view_layer=vl) for c in parts)
        if o.hide_get(view_layer=vl) != hide:
            o.hide_set(hide, view_layer=vl)
    if orphans:  # the arena was deleted: can't delete from inside the handler
        bpy.app.timers.register(lambda: _remove_objects(orphans), first_interval=0.0)


def import_model(context, path, live=True, world=False, backdrop=True):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    arm = next((o for o in new if o.type == "ARMATURE"), None)
    for o in new:  # bone display shape created by the importer
        if o.type == "MESH" and o.parent is None and arm is not None:
            o.hide_set(True)
            o.hide_render = True
    if arm is None:
        return None
    side = os.path.splitext(path)[0] + ".json"
    info = {}
    if os.path.exists(side):
        with open(side) as fh:
            info = json.load(fh)
    if live:
        setup_live_materials(new, os.path.dirname(path))
    arm["ps2_model"] = info.get("display") or info.get("name", os.path.basename(path))
    if info.get("clear_color"):
        arm["ps2_clear"] = list(info["clear_color"])
        if backdrop:
            add_backdrop(arm, info["clear_color"])
        if world:
            set_world_color(context.scene, info["clear_color"])
    lib = _find_library(os.path.dirname(path))
    if lib and not _library_dir(context):
        _set_library_dir(context, lib)
    arm["ps2_dir"] = os.path.dirname(path)
    arm["ps2_shiny_on"] = False
    arm["ps2_clips"] = json.dumps([{k: c.get(k) for k in ("name", "frames", "roles", "moves")}
                                   for c in info.get("clips", [])])
    base_dir = os.path.dirname(path)
    defaults, done = {}, set()
    for o in new:
        if o.type != "MESH":
            continue
        for mat in o.data.materials:
            if mat is None or mat.name in done or "ps2_face" not in mat:
                continue
            done.add(mat.name)
            r = setup_face_material(mat, _idprop_to_py(mat["ps2_face"]), arm, base_dir)
            if r:
                defaults.setdefault(r[0], r[1])
    for ch, d in defaults.items():
        arm["ps2_face_%d" % ch] = d
    if defaults:
        key_face_tracks(arm, info, defaults, context.scene)
    if arm.animation_data:
        for t in arm.animation_data.nla_tracks:
            t.mute = True
    idle = _clip_actions(arm).get(next((c["name"] for c in info.get("clips", [])
                                        if "idle" in (c.get("roles") or [])), ""), None)
    if idle:
        play_clip(context, arm, idle, start=False)
    return arm


def play_clip(context, arm, action, start=True):
    _set_action(arm, action)
    scene = context.scene
    lo, hi = action.frame_range
    scene.frame_start, scene.frame_end = int(lo), max(int(lo) + 1, int(round(hi)))
    scene.frame_set(int(lo))
    if start and not context.screen.is_animation_playing:
        bpy.ops.screen.animation_play()


def set_shiny(arm, on):
    """Swap every texture of the model between its normal and shiny PNG."""
    base = arm.get("ps2_dir", "")
    mats = {m for c in arm.children if c.type == "MESH" for m in c.data.materials if m}
    for mat in mats:
        if not mat.use_nodes:
            continue
        for n in mat.node_tree.nodes:
            if n.type != "TEX_IMAGE" or n.image is None:
                continue
            if "ps2_rel" in n:
                rel = n["ps2_rel"].replace("textures/face/", "textures/shiny/face/")
            elif "ps2_shiny" in mat:
                rel = mat["ps2_shiny"]
            else:
                continue
            if on:
                path = os.path.join(base, rel)
                if not os.path.exists(path):
                    continue
                if "ps2_normal_image" not in n:
                    n["ps2_normal_image"] = n.image.name
                img = bpy.data.images.load(path, check_existing=True)
                img.alpha_mode = n.image.alpha_mode
                n.image = img
            elif "ps2_normal_image" in n:
                img = bpy.data.images.get(n["ps2_normal_image"])
                if img is not None:
                    n.image = img
    arm["ps2_shiny_on"] = bool(on)


def _active_rig(context):
    o = context.active_object
    while o is not None and "ps2_model" not in o:
        o = o.parent
    return o


def _world_x_range(objs):
    xs = []
    for o in objs:
        if o.type == "MESH":
            xs += [(o.matrix_world @ Vector(c)).x for c in o.bound_box]
    return (min(xs), max(xs)) if xs else (0.0, 0.0)


@persistent
def _select_rig_with_mesh(scene, depsgraph):
    """Selecting a model's mesh also selects its armature, so the model moves
    as one piece (Blender transforms the parent and the child follows)."""
    if not getattr(scene, "ps2_move_as_one", False):
        return
    vl = depsgraph.view_layer
    for o in vl.objects.selected:
        rig = o.parent
        if o.type != "MESH" or o.mode != "OBJECT" or rig is None or "ps2_model" not in rig:
            continue
        if not rig.select_get(view_layer=vl) and rig.visible_get(view_layer=vl):
            rig.select_set(True, view_layer=vl)


class PS2_OT_import(Operator, ImportHelper):
    bl_idname = "import_scene.ps2_glb"
    bl_label = "Import Pokemon Stadium 2 (.glb)"
    bl_options = {"REGISTER", "UNDO"}
    filename_ext = ".glb"
    filter_glob: StringProperty(default="*.glb", options={"HIDDEN"})
    files: CollectionProperty(type=OperatorFileListElement, options={"HIDDEN", "SKIP_SAVE"})
    directory: StringProperty(subtype="DIR_PATH")
    line_up: BoolProperty(name="Line up next to other models", default=True)
    game_fps: BoolProperty(name="Game speed (30 fps, real time)", default=True,
                           description="Set the scene to 30 fps so every game frame is a Blender frame, "
                                       "and play in real time (skip frames instead of slowing down "
                                       "when the viewport can't keep up)")
    live: BoolProperty(name="Live arena materials", default=True,
                       description="Rebuild arena materials as N64 colour-combiner shader nodes: "
                                   "scrolling water, animated colours, exact vertex shading")
    backdrop: BoolProperty(name="Arena background", default=True,
                           description="Surround an arena with its background colour, as part of the "
                                       "arena: seen only from inside it, lights nothing, "
                                       "leaves the scene's world alone")
    world: BoolProperty(name="Also as world colour (whole scene)", default=False,
                        description="Also set the scene's world colour to the arena's background colour "
                                    "(changes the background and ambient light of everything)")

    def execute(self, context):
        paths = [os.path.join(self.directory, f.name) for f in self.files if f.name] or [self.filepath]
        if self.game_fps:
            context.scene.render.fps, context.scene.render.fps_base = 30, 1.0
            context.scene.sync_mode = "FRAME_DROP"
        for p in paths:
            others = [c for o in context.scene.objects if "ps2_model" in o for c in o.children]
            arm = import_model(context, p, self.live, self.world, self.backdrop)
            if arm is not None and self.line_up and others:
                context.view_layer.update()
                right = _world_x_range(others)[1]
                lo, hi = _world_x_range(arm.children)
                arm.location.x += right - lo + 0.1 * max(hi - lo, 0.2)
        self.report({"INFO"}, "Imported %d model(s)" % len(paths))
        return {"FINISHED"}


class PS2_OT_play(Operator):
    bl_idname = "ps2.play_clip"
    bl_label = "Play clip"
    bl_options = {"REGISTER", "UNDO"}
    clip: StringProperty()

    def execute(self, context):
        arm = _active_rig(context)
        if arm is None:
            return {"CANCELLED"}
        action = _clip_actions(arm).get(self.clip)
        if action is None:
            self.report({"WARNING"}, "clip %s not found" % self.clip)
            return {"CANCELLED"}
        play_clip(context, arm, action)
        return {"FINISHED"}


class PS2_OT_shiny(Operator):
    bl_idname = "ps2.toggle_shiny"
    bl_label = "Toggle shiny colours"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        arm = _active_rig(context)
        if arm is None:
            return {"CANCELLED"}
        set_shiny(arm, not arm.get("ps2_shiny_on", False))
        return {"FINISHED"}


class PS2_OT_backdrop(Operator):
    bl_idname = "ps2.toggle_backdrop"
    bl_label = "Toggle arena background"
    bl_description = "Show or hide the arena's own background colour (seen from inside the arena only)"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        arm = _active_rig(context)
        if arm is None or "ps2_clear" not in arm:
            return {"CANCELLED"}
        bd = _backdrop(arm)
        if bd is None:
            add_backdrop(arm, list(arm["ps2_clear"]))
        else:
            bd.hide_viewport = bd.hide_render = not bd.hide_viewport
        return {"FINISHED"}


class PS2_PT_clips(Panel):
    bl_label = "Pokemon Stadium 2"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PS2"

    def draw(self, context):
        layout = self.layout
        layout.operator(PS2_OT_import.bl_idname, text="Import models...", icon="IMPORT")
        arm = _active_rig(context)
        if arm is None:
            layout.label(text="Select an imported Pokemon")
            return
        layout.label(text=str(arm["ps2_model"]), icon="ARMATURE_DATA")
        layout.prop(context.scene, "ps2_move_as_one")
        if "ps2_clear" in arm:
            bd = _backdrop(arm)
            on = bd is not None and not bd.hide_viewport
            layout.operator(PS2_OT_backdrop.bl_idname, text="Background: ON" if on else "Background: off",
                            icon="WORLD", depress=on)
            return
        on = bool(arm.get("ps2_shiny_on", False))
        layout.operator(PS2_OT_shiny.bl_idname, text="Shiny: ON" if on else "Shiny: off",
                        icon="SHADING_TEXTURE", depress=on)
        try:
            clips = json.loads(arm.get("ps2_clips", "[]"))
        except ValueError:
            clips = []
        current = arm.animation_data.action.name if arm.animation_data and arm.animation_data.action else ""
        col = layout.column(align=True)
        for c in clips:
            moves = c.get("moves") or []
            label = c["name"]
            if moves:
                label += "  (%s%s)" % (", ".join(str(m) for m in moves[:2]), "..." if len(moves) > 2 else "")
            op = col.operator(PS2_OT_play.bl_idname, text=label,
                              icon="PLAY" if current.startswith(c["name"]) else "ACTION",
                              depress=current.startswith(c["name"]))
            op.clip = c["name"]


# --------------------------------------------------------------------------
# Asset browser: every exported model, by name, with thumbnails
# (out/catalog.json + out/thumbs/, written by ps2extract.py / make_previews.py)

_browser = {"dir": None, "items": [], "categories": [], "enum": [], "previews": None}


def _find_library(start):
    d = os.path.abspath(start)
    for _ in range(4):
        if os.path.exists(os.path.join(d, "catalog.json")):
            return d
        d = os.path.dirname(d)
    return None


def _prefs(context):
    addon = context.preferences.addons.get(__name__)
    return addon.preferences if addon else None


def _library_dir(context):
    p = _prefs(context)
    d = (p.library if p else "") or context.window_manager.ps2_library
    return bpy.path.abspath(d) if d else ""


def _set_library_dir(context, d):
    p = _prefs(context)
    if p is not None:
        p.library = d
    context.window_manager.ps2_library = d


def _catalog(context):
    d = _library_dir(context)
    if d != _browser["dir"]:
        _browser.update(dir=d, items=[], categories=[])
        path = os.path.join(d, "catalog.json") if d else ""
        if path and os.path.exists(path):
            with open(path, encoding="utf-8") as fh:
                cat = json.load(fh)
            _browser["items"] = cat.get("items", [])
            _browser["categories"] = cat.get("categories", [])
    return _browser["items"]


def _preview(rel):
    pc = _browser["previews"]
    if pc is None:
        return 0
    if rel not in pc:
        path = os.path.join(_browser["dir"], rel)
        if not os.path.exists(path):
            return 0
        pc.load(rel, path, "IMAGE")
    return pc[rel].icon_id


def _filtered(context):
    wm = context.window_manager
    cat, words = wm.ps2_category, wm.ps2_search.lower().split()
    out = []
    for it in _catalog(context):
        if cat != "ALL" and it["category"] != cat:
            continue
        hay = (it["name"] + " " + " ".join(it.get("tags", [])) + " " + it["path"]).lower()
        if all(w in hay for w in words):
            out.append(it)
    return out


def _category_items(self, context):
    cats = _browser["categories"] or ["Pokémon", "Objects", "Arenas", "Maps", "Effects"]
    return [("ALL", "All", "Everything")] + [(c, c, "") for c in cats]


def _asset_items(self, context):
    items = []
    for i, it in enumerate(_filtered(context)):
        items.append((it["path"], it["name"], "%s: %s" % (it["category"], ", ".join(it.get("tags", [])[:6])),
                      _preview(it["thumb"]) or 0, i))
    if not items:
        items = [("NONE", "No matches", "", 0, 0)]
    _browser["enum"] = items  # Blender needs these strings kept alive
    return items


def _filters_changed(self, context):
    items = _asset_items(self, context)
    try:
        context.window_manager.ps2_asset = items[0][0]
    except TypeError:
        pass


def _library_changed(self, context):
    _browser["dir"] = None
    _filters_changed(self, context)


class PS2_OT_browser_import(Operator):
    bl_idname = "ps2.browser_import"
    bl_label = "Import"
    bl_description = "Import the selected model (live materials, faces, clips)"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        rel = context.window_manager.ps2_asset
        path = os.path.join(_library_dir(context), rel)
        if rel == "NONE" or not os.path.exists(path):
            self.report({"WARNING"}, "nothing to import")
            return {"CANCELLED"}
        return bpy.ops.import_scene.ps2_glb(directory=os.path.dirname(path) + os.sep,
                                            files=[{"name": os.path.basename(path)}])


class PS2_OT_browser_library(Operator, ImportHelper):
    bl_idname = "ps2.browser_library"
    bl_label = "Choose library folder"
    bl_description = "Pick the extractor's output folder (the one with catalog.json)"
    filename_ext = ""
    filter_glob: StringProperty(default="catalog.json", options={"HIDDEN"})

    def execute(self, context):
        d = _find_library(os.path.dirname(self.filepath) if os.path.isfile(self.filepath) else self.filepath)
        if not d:
            self.report({"WARNING"}, "no catalog.json there (run ps2extract.py first)")
            return {"CANCELLED"}
        _set_library_dir(context, d)
        _library_changed(None, context)
        return {"FINISHED"}


class PS2_PT_browser(Panel):
    bl_label = "Browser"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "PS2"

    def draw(self, context):
        layout = self.layout
        wm = context.window_manager
        items = _catalog(context)
        row = layout.row(align=True)
        d = _library_dir(context)
        row.label(text=os.path.basename(d.rstrip(os.sep)) if d else "No library", icon="ASSET_MANAGER")
        row.operator(PS2_OT_browser_library.bl_idname, text="", icon="FILEBROWSER")
        if not items:
            layout.label(text="Pick the extractor's out folder", icon="INFO")
            return
        row = layout.row(align=True)
        row.prop(wm, "ps2_category", text="")
        row.prop(wm, "ps2_search", text="", icon="VIEWZOOM")
        found = _filtered(context)
        layout.template_icon_view(wm, "ps2_asset", show_labels=True, scale=9.0, scale_popup=5.0)
        it = next((x for x in found if x["path"] == wm.ps2_asset), None)
        if it:
            col = layout.column(align=True)
            col.label(text=it["name"])
            tags = [t for t in it.get("tags", []) if t not in ("Pokémon", "Effect")]
            if it.get("clips"):
                tags.insert(0, "%d clips" % it["clips"])
            if tags:
                col.label(text=", ".join(tags[:4]))
            col.operator(PS2_OT_browser_import.bl_idname, icon="IMPORT")
        layout.label(text="%d of %d models" % (len(found), len(items)))


class PS2_Preferences(AddonPreferences):
    bl_idname = __name__
    library: StringProperty(name="Library folder", subtype="DIR_PATH",
                            description="The extractor's output folder (contains catalog.json)",
                            update=_library_changed)

    def draw(self, context):
        self.layout.prop(self, "library")


def _menu(self, context):
    self.layout.operator(PS2_OT_import.bl_idname, text="Pokemon Stadium 2 (.glb)")


CLASSES = (PS2_OT_import, PS2_OT_play, PS2_OT_shiny, PS2_OT_backdrop, PS2_OT_browser_import,
           PS2_OT_browser_library, PS2_PT_clips, PS2_PT_browser, PS2_Preferences)


def register():
    for c in CLASSES:
        bpy.utils.register_class(c)
    _browser["previews"] = bpy.utils.previews.new()
    wm = bpy.types.WindowManager
    wm.ps2_library = StringProperty(subtype="DIR_PATH", update=_library_changed)
    wm.ps2_category = EnumProperty(name="Category", items=_category_items, update=_filters_changed)
    wm.ps2_search = StringProperty(name="Search", description="Filter by name, move or tag",
                                   update=_filters_changed, options={"TEXTEDIT_UPDATE"})
    wm.ps2_asset = EnumProperty(name="Model", items=_asset_items)
    bpy.types.TOPBAR_MT_file_import.append(_menu)
    bpy.types.Scene.ps2_move_as_one = BoolProperty(
        name="Move model as one piece", default=True,
        description="Selecting a model's mesh also selects its armature, so moving it "
                    "moves the whole model instead of pulling the mesh off its bones")
    bpy.app.handlers.depsgraph_update_post.append(_select_rig_with_mesh)
    bpy.app.handlers.depsgraph_update_post.append(_backdrops_follow_arena)


def unregister():
    for prop in ("ps2_library", "ps2_category", "ps2_search", "ps2_asset"):
        if hasattr(bpy.types.WindowManager, prop):
            delattr(bpy.types.WindowManager, prop)
    if _browser["previews"] is not None:
        bpy.utils.previews.remove(_browser["previews"])
        _browser["previews"] = None
    _browser["dir"] = None
    for h in (_select_rig_with_mesh, _backdrops_follow_arena):
        if h in bpy.app.handlers.depsgraph_update_post:
            bpy.app.handlers.depsgraph_update_post.remove(h)
    del bpy.types.Scene.ps2_move_as_one
    bpy.types.TOPBAR_MT_file_import.remove(_menu)
    for c in reversed(CLASSES):
        bpy.utils.unregister_class(c)


if __name__ == "__main__":
    try:
        register()
    except ValueError:  # already registered (script run twice)
        pass
    args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    glbs = [os.path.abspath(p) for p in args if p.endswith(".glb")]
    if glbs:
        bpy.ops.import_scene.ps2_glb(directory="", files=[{"name": p} for p in glbs])
