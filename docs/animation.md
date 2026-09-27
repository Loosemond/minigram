# Animation

The game runs its animations at **30 frames per second**. Code:
`ps2tool/fragment.py` (`Anim`, `AuxAnim`), `ps2tool/clips.py`,
`ps2extract.py` (`pose_clips`), `ps2tool/gltf.py` (joint composition).

## Skeletal clips

### Header (0x1C bytes)

| Offset | Field |
|---|---|
| +0x00 | u16 flags: bit 2 = wide values, bit 3 = Hermite keys. Seen: bit 0 on looping clips (idle), bit 1 on one-shot clips |
| +0x02 | u16 (*unknown*) |
| +0x04 | u16 start frame |
| +0x06 | u16 loop-start frame |
| +0x08 | u16 channel count |
| +0x0A | u16 frame count |
| +0x0C | pointer → channel table |
| +0x10 | pointer → scale data |
| +0x14 | pointer → rotation data |
| +0x18 | pointer → translation data |

### Channels

A joint's animation channel (s8 at +3 of its geo `0x1D` command) is logical
channel *c*. Its X, Y and Z axes are channel-table entries 3c, 3c+1 and 3c+2.
Each 10-byte entry holds all three transform components for that axis:

```
u8 scale count, u8 rotation count, u8 translation count, u8 interpolation bits,
u16 scale offset, u16 rotation offset, u16 translation offset
```

For each component, a count of 0 keeps the bind pose. Otherwise the meaning
depends on the clip's mode.

**Packed mode** (flags bit 3 clear): one sample per frame. Past the last
sample, the last one holds.

| Component | Count 1 (constant in the offset field) | Count *n* > 1 (samples from index *offset*) |
|---|---|---|
| translation | s16 (wide) or 12-bit signed | bit-packed stream, 12-bit signed (16 if wide) |
| rotation | `offset << 4` as a binary angle | bit-packed 12-bit, `<< 4` → binary angle |
| scale | `offset / 1000` | s16 array, `/ 1000` |

**Hermite mode** (flags bit 3 set): keys start at `data + offset × 2`. Each
key is `time, value, tangent` (3 × s16), or `time, value, in, out`
(4 × s16) when the component's interpolation bit is set (bit 0
translation, bit 1 rotation, bit 2 scale). Times are in frames and tangents
per second. With count < 2 the offset field itself is the value.

| Component | Value unit |
|---|---|
| translation | model units |
| rotation | tenths of a degree |
| scale | hundredths |

Between keys a and b at frame *f*: `x = (f − ta) / 30`, `y = 30 / (tb − ta)`,
then
`value = va(2x³y³ − 3x²y² + 1) + vb(−2x³y³ + 3x²y²) + outa(x³y² − 2x²y + x) + inb(x³y² − x²y)`.

### Rotations and joint composition

Rotation is `R = Rz · Ry · Rx`, with binary angles (65536 = 360°). The game
composes joints as

```
pivot_i = pivot_parent * [ R(r_i) | t_i * acc_parent ]
acc_i   = acc_parent * s_i            (component-wise)
draw_i  = pivot_i * diag(acc_i)
```

Accumulated scale acts along each joint's own axes (Blender calls this
"Aligned" scale inheritance). Plain glTF inheritance would shear under
non-uniform scale (Pikachu's ears), so the exporter writes two nodes per
joint: one for rotation and translation, and a `_scale` child that carries
the accumulated scale and is the skin joint.

## Texture (face) clips

These pick which texture a face channel shows (eyes, mouth, cheek sparks)
on each frame. Pokémon keep them in the model module (descriptor +0x10),
objects likewise.

| Offset | Field |
|---|---|
| +0x00 | u16 flags |
| +0x04 | u16 start frame |
| +0x06 | u16 loop-start frame |
| +0x08 | u16 channel count |
| +0x0A | u16 frame count |
| +0x0C | pointer → channel table: per channel u16 count, u16 offset |
| +0x10 | pointer → data: a u8 texture index per frame at `data + offset + frame` (the last holds) |

## Pokémon pose banks (`0x2D7D000`)

Record N holds species N's skeletal clips, compressed, as an archive (records
can nest archives again). Each leaf is one clip: a u32 at +0 gives its header
offset, and pointers inside are offsets within the clip's own data. The bank
has no clip names. The battle motion table below gives them.

## Battle motion table (`0x1718000`)

Record *species − 1*, `0x1530` bytes = 271 entries of `0x14` bytes:

- entries 0–250: the 251 moves (entry *i* = move *i + 1*)
- entries 251–270: battle contexts. Known: 251 idle, 252 entrance (chosen just
  before the send-out cry), 253 faint, 254 hit, 268 sleep. The rest is
  *unknown*.

Byte 0 of an entry selects the body clip (`0xFF` = none). Byte 1 (s8) selects
the face clip (−1 = none).

**Selector → clip.** The model module holds a table mapping selectors to
pose-bank clips. Find the 4-aligned u32 `(species << 16) | 1`; the byte at +4
is the count, and the pointer at +12 leads to `count` 4-byte entries whose
u16 at +2 is the clip index. When there's no table, selector 0 is clip 0 and
other selectors are `selector − base`, where base = 1 if the highest selector
reaches the clip count, else 0.

The extractor names each clip by its context (`idle`, `entrance`, `faint`,
`hit`, `sleep`) or as `attackN` in order, and lists the moves that use it. A
body clip gets the face clip the table pairs with it when their lengths match.
Otherwise it gets an unused face clip of the same length.

## Object clips

Objects keep their clips inside their own module (descriptor +0x0C and
+0x10). Each skeletal clip is paired with the texture clip of the same length.
Leftover texture clips become bind-pose clips that only animate textures.
