# The ROM

Put your own dump of Pokémon Stadium 2 here as `ps2_eu.z64`, in `.z64`
(big-endian) byte order. It isn't part of this repository, and `.gitignore`
keeps it out.

| Version | md5 | |
|---|---|---|
| Europe (English), NP3P | `b1271db50d6ef8f6b53cc640c3743e4f` | tested |
| USA | `1561c75d11cedf356a8ddb1a4a5f9d5d` | should work; untested |

`python3 tools/ps2extract.py rom/ps2_eu.z64 text` prints the version and md5
it found.
