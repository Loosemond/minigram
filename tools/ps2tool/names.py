"""Human-readable names for exported assets.

Sources, most reliable first:
  * the ROM's own text: Pokemon species (table 0), moves (table 6) and the
    room decoration names (table 60), matched to objects by appearance;
  * arena order from the gen1recomp Stadium 2 importer research (gym
    leaders, Elite Four, ...); arenas 23-25 are unconfirmed;
  * appearance, for everything the ROM has no name for (minigame props,
    TV screens, ...), checked against which minigame loads each object.
"""
import re

# ------------------------------------------------------------------ arenas
STAGES = {
    0: "Falkner (Violet Gym)", 1: "Bugsy (Azalea Gym)", 2: "Whitney (Goldenrod Gym)",
    3: "Morty (Ecruteak Gym)", 4: "Jasmine (Olivine Gym)", 5: "Chuck (Cianwood Gym)",
    6: "Pryce (Mahogany Gym)", 7: "Clair (Blackthorn Gym)", 8: "Team Rocket",
    9: "Will (Elite Four)", 10: "Koga (Elite Four)", 11: "Bruno (Elite Four)",
    12: "Karen (Elite Four)", 13: "Champion Lance", 14: "Brock (Pewter Gym)",
    15: "Misty (Cerulean Gym)", 16: "Lt. Surge (Vermilion Gym)", 17: "Erika (Celadon Gym)",
    18: "Janine (Fuchsia Gym)", 19: "Sabrina (Saffron Gym)", 20: "Blaine (Cinnabar Gym)",
    21: "Blue (Viridian Gym)", 22: "Red (Mt. Silver)", 23: "Stadium A", 24: "Stadium B",
    25: "Stadium C", 26: "Battle Tower", 27: "Indoor (Academy)", 28: "Free Battle Park",
    29: "Rival",
}
SCENES = {0: "Johto Map", 1: "Johto Map (Mt. Silver)", 2: "Kanto Map"}

# ------------------------------------------------------------------ objects
# object record -> text table 60 entry (room decorations, by appearance)
DECORATIONS = {
    4: 41, 5: 25, 6: 54, 7: 52, 8: 21, 9: 24, 10: 48, 11: 23, 14: 38, 15: 37, 16: 35, 17: 17,
    18: 18, 19: 19, 20: 20, 21: 42, 22: 46, 23: 36, 25: 33, 27: 59, 28: 55, 29: 28, 30: 29,
    31: 31, 32: 15, 33: 16, 34: 40, 35: 45, 37: 30, 38: 60, 39: 44, 40: 53, 41: 58, 42: 22,
    43: 14, 44: 47, 46: 39, 47: 43, 48: 49, 49: 51, 50: 50,
}
_TV = "TV Screen"
OBJECTS = {
    0: "White Boards", 2: "Wooden Pole", 3: "Room Wall", 12: "Potted Plant (bushy)",
    13: "Purple Crystal", 24: "Potted Plant (berries)", 26: "Purple Crystal", 36: "Stand",
    45: "Stand", 51: "Room Wall", 52: "Hitmontop", 53: "Golbat", 54: "Room (miniature)",
    55: "Pinsir", 56: "Power Plant Frame", 57: "Electrode Lamp", 58: "Round Face on a Stick",
    59: "Signpost", 60: "Platform", 62: "Flower Patch", 63: "Blue Rock", 64: "Blue Rock",
    65: "Log", 66: "Log", 67: "Log", 68: "Pillar", 69: "Pillar", 70: "Pillar", 71: "Bird",
    72: "Trophy (egg)", 73: "Trophy (N)", 74: "Trophy (laurel)", 75: "Trophy (small)",
    76: "Round Face", 77: "Checkered Bowl", 78: "Green Field", 79: "Shadow Disc",
    80: "Booth (blue)", 81: "Wooden Ring", 82: "Swinub", 83: "Signpost 4P",
    84: "Signpost 3P", 85: "Signpost 1P", 86: "Signpost 2P", 87: "Signpost COM",
    98: "TV Room (miniature)", 100: "Booth (green)", 101: "Booth (purple)",
    102: "Booth (yellow)", 103: "Swinub", 104: "Dark Obelisk", 107: "Pichu",
    109: "Togepi", 110: "Jynx", 111: "Wooden Ring", 114: "Cleffa", 115: "Hitmontop", 116: "Ramp",
    117: "Circus Backdrop", 118: "Books", 119: "Igglybuff", 121: "Green Arrows", 122: "Scyther",
    123: "Hitmontop", 125: "Rope Ring", 126: "Grass Arc", 128: "Floor Marks", 129: "Mr. Mime",
    132: "Rainbow Arc", 133: "Small Plants", 134: "Grass Arc", 135: "Cacti", 136: "Thin Arc",
    137: "Grass Ring", 138: "Grass Ring", 139: "Grass Pieces", 140: "Grass Arc",
    141: "Mesh Panels", 142: "Furret", 143: "Eevee", 144: "Chansey", 145: "Egg",
    147: "Course Corner", 148: "Course Stage", 149: "Grass Field Ring", 150: "Aipom on a Rope", 151: "Pineco",
    152: "Lid Box", 155: "Debris", 156: _TV + " (Wave Race 64)", 157: _TV + " (Super Mario 64)",
    158: _TV + " (castle)", 159: _TV + " (Super Mario Bros.)", 160: _TV + " (maze)",
    161: _TV + " (Donkey Kong)", 162: _TV + " (flowers)", 163: _TV + " (race track)",
    164: _TV + " (sky)", 165: _TV + " (off)", 167: "White Ring", 169: "Pikachu Nintendo 64",
    170: "GameCube", 171: "Baseball Bat and Glove", 172: "Christmas Tree", 173: "Computer",
    174: "Christmas Stocking", 175: "Diamond Ring", 176: "Grand Piano", 177: "Game Boy Advance",
    178: "Bag of Chips", 179: "Scizor", 180: "Game Boy", 181: "Snorlax", 182: "Trainer Doll",
    183: "Bush", 184: "Candy", 186: "Cleffa (shiny)", 187: "Pole", 188: "Ice Block", 189: "Lab Room",
    190: "Dizzy Stars", 195: "White Ring", 196: "White Ring", 197: "White Ring", 198: "White Ring",
    201: "Pikachu", 202: "Water Plane", 205: "Igglybuff (shiny)", 206: "Omanyte", 208: "Orange",
    209: "Melon", 210: "Bananas", 211: "Strawberry", 212: "Apple", 213: "Grapes", 214: "Lab Room",
    215: "Peach", 216: "Strawberries", 217: "Green Glow Panel", 218: "Mr. Mime", 219: "Grey Panel",
    221: "Rainbow Ring", 222: "Dark Disc", 223: "Girafarig", 224: _TV + " (space)",
    225: _TV + " (house)", 226: _TV + " (pink)",
}
OBJECT_NAME_FIXES = {37: "Yellow Carpet"}  # the ROM text has no space
for _i in range(88, 100):
    OBJECTS.setdefault(_i, "Gift Box")
LAYOUTS = {
    (108, 0): "Donphan", (108, 1): "Donphan (rolling)", (113, 0): "Green Field", (113, 1): "Red Frame",
    (120, 0): "Cross Piece", (120, 1): "Cross Lines", (120, 2): "Hole", (127, 0): "Delibird",
    (127, 1): "Delibird Prop", (142, 0): "Furret", (142, 1): "Furret", (153, 0): "Poké Ball",
    (153, 1): "Great Ball", (153, 2): "Ultra Ball", (153, 3): "Master Ball", (154, 0): "Poké Ball",
    (154, 1): "Ultra Ball", (154, 2): "Master Ball", (154, 3): "Great Ball", (155, 0): "Leaf Pile",
    (155, 1): "Shards", (155, 2): "Chips",
}
for _k in range(3, 7):
    LAYOUTS[(120, _k)] = "Triangle Piece"
# The minigames, in the game's order and with its names (text table 57), and
# the objects each one uses. Read from the code: every minigame's overlay
# (code modules #47-#61, run at 0x86000000-0x86B00000; docs/minigames.md)
# loads its objects through one loader (0x8004DED4) with the object number
# as a constant, and picks the player's character model with constants too
# (Scyther/Pinsir/Scizor, Pichu/Pikachu, ...).
# Added by appearance: the other Hitmontop and fruit models, which no code
# loads by constant.
MINIGAMES = {
    "Gutsy Golbat": [53, 110],
    "Topsy-Turvy": [115, 52, 123],
    "Clear Cut Challenge": [122, 55, 179, 59, 81, 111, 112, 130, 131, 190],
    "Furret's Frolic": [142, 223, 153, 155, 183],
    "Barrier Ball": [129, 218, 120, 141, 146, 154],
    "Pichu's Power Plant": [107, 201, 56, 57, 190],
    "Rampage Rollout": [108, 113],
    "Streaming Stampede": [114, 119, 205, 186, 80, 100, 101, 102, 116, 117, 118],
    "Tumbling Togepi": [109, 206, 60] + list(range(62, 71)) + list(range(132, 141))
                       + [188, 202],
    "Delibird's Delivery": [127, 82, 103, 92, 96, 147, 148, 169, 170, 174, 175, 176, 177, 180, 181, 184],
    "Egg Emergency": [144, 145, 185],
    "Eager Eevee": [143, 149, 150, 151, 203, 204, 207] + list(range(208, 214)) + [215, 216],
}
# ------------------------------------------------------------- image banks
# Image banks (0x1898000) whose use is known, from the code that loads them
# (docs/minigames.md) or, marked so, by appearance. The extractor puts each in
# images/banks/bank_NNN_<name>/.
BANKS = {
    152: "Egg Emergency splash", 227: "Egg Emergency Voltorb", 307: "Eager Eevee effects",
    358: "Mini-game Champion", 360: "countdown", 404: "small digits", 429: "big digits",
    430: "Eager Eevee points", 434: "player badges",
    # the minigames' name banners
    383: "banner Rampage Rollout", 388: "banner Eager Eevee", 395: "banner Gutsy Golbat",
    396: "banner Clear Cut Challenge", 400: "banner Topsy-Turvy", 403: "banner Egg Emergency",
    405: "banner Furret's Frolic", 408: "banner Pichu's Power Plant", 411: "banner Streaming Stampede",
    385: "Rampage Rollout final lap", 386: "Rampage Rollout lap",  # (by appearance)
    389: "Eager Eevee prizes", 390: "Eager Eevee digits", 392: "Eager Eevee rounds",
    393: "Eager Eevee sec box", 394: "Eager Eevee time digits",
    397: "Clear Cut Spinarak", 398: "Clear Cut flash", 399: "Clear Cut cuts",
    # Streaming Stampede (module #59): the Pokemon that go by, a sprite in a few
    # frames each (Diglett and Dugtrio pop up out of the ground), its digits and its words
    201: "Streaming Stampede dot", 202: "Streaming Stampede Voltorb", 203: "Streaming Stampede Magcargo",
    204: "Streaming Stampede Magnemite", 205: "Streaming Stampede Diglett", 206: "Streaming Stampede Doduo",
    207: "Streaming Stampede Dodrio", 208: "Streaming Stampede Dugtrio", 209: "Streaming Stampede Togepi egg",
    210: "Streaming Stampede Psyduck", 211: "Streaming Stampede Electrode", 212: "Streaming Stampede Poke Ball",
    213: "Streaming Stampede Slugma", 214: "Streaming Stampede Xatu", 215: "Streaming Stampede Natu",
    216: "Streaming Stampede Omanyte", 217: "Streaming Stampede Pichu", 218: "Streaming Stampede Pikachu",
    219: "Streaming Stampede Magneton", 220: "Streaming Stampede Togepi",
    415: "Streaming Stampede digits", 416: "Streaming Stampede words",
    # Pichu's Power Plant (module #54): its effects and charge gauges
    224: "Pichu's Power Plant spark", 225: "Pichu's Power Plant lightning",
    409: "Pichu's Power Plant gauge fill", 410: "Pichu's Power Plant gauge frame",
    412: "Streaming Stampede all", 413: "Streaming Stampede names", 414: "Streaming Stampede answer digits",
    # shared by menus and boards (by appearance, and Streaming Stampede's question board)
    51: "buttons", 165: "board rod and chain", 345: "arrows",
}


def bank_folder(i):
    """The extracted folder of image bank i (under images/banks/)."""
    return "bank_%03d" % i + ("_" + slug(BANKS[i]) if i in BANKS else "")


_MINIGAMES_OF = {}
for _g, _ids in MINIGAMES.items():
    for _i in _ids:
        _MINIGAMES_OF.setdefault(_i, []).append(_g)


def minigames_of(i):
    """Minigames (in game order) that use objects-table record i."""
    return _MINIGAMES_OF.get(i, [])


def slug(text):
    t = text.lower().replace("é", "e").replace("'", "").replace(".", "")
    return re.sub(r"[^a-z0-9]+", "_", t).strip("_")


def title(rom_text):
    """'SURF PIKACHU DOLL' -> 'Surf Pikachu Doll' (keeps 'Poké')."""
    words = [w.capitalize() for w in rom_text.replace("POKé", "Poké").split()]
    return " ".join(w if not w.lower().startswith("poké") else "Poké" + w[4:] for w in words)


def stage_name(i):
    return STAGES.get(i, "Arena %d" % i)


def scene_name(i):
    return SCENES.get(i, "Map %d" % i)


def object_name(i, layout=0, layouts=1, rom_texts=None):
    """(display name, tags) of an objects-table record / layout."""
    tags = []
    if (i, layout) in LAYOUTS:
        name = LAYOUTS[(i, layout)]
    elif i in OBJECT_NAME_FIXES:
        name = OBJECT_NAME_FIXES[i]
    elif i in DECORATIONS and rom_texts and len(rom_texts) > 60:
        name = title(rom_texts[60][DECORATIONS[i]])
    else:
        name = OBJECTS.get(i, "Object %03d" % i)
        if layouts > 1:
            name += " %d" % (layout + 1)
    if i in DECORATIONS:
        tags.append("Room decoration")
    tags += ["Minigame: " + g for g in minigames_of(i)]
    if i not in OBJECTS and i not in DECORATIONS and (i, layout) not in LAYOUTS:
        tags.append("unnamed")
    return name, tags


def effect_name(users, effects_map):
    """Up to three moves most specific to a module (moves that load the
    fewest modules first)."""
    moves = [u for u in users if not u.startswith("(")]
    if not moves:
        return "Common" if users else "Unused"
    ranked = sorted(moves, key=lambda m: (len(effects_map.get(m, ())), moves.index(m)))
    return " / ".join(title(m) for m in ranked[:3])
