# kilo-3d-kit

Local, human-made, CC0 3D library for game agents. Open this folder in Kilo Code.

## Art bible

One style family: **Kenney low-poly + KayKit adventurers**.

Do not mix in:

- 3dassets.dev / AI-generated catalogues
- random Sketchfab
- photoreal Poly Haven into a Kenney scene

## Where files live

| Path | What |
|---|---|
| `library/` | One folder per pack (Kenney + KayKit, many styles) |
| `scripts/packs.json` | Pack list + styles. Add a pack here, then `npm run fetch` |
| `catalog/index.json` | Searchable manifest (`style`, `pack`, `kind`) |
| `reports/rig-inspect.json` | Bones / skins / clips found |

## Agent rules

1. Search `catalog/index.json` first. Pull from `library/`, never the open web, unless the kit has no match.
2. Props (Kenney) are **static**. Do not auto-rig crates and walls.
3. Characters: use **KayKit** files that already have `skins` + `animations`. Play clips. Do not rebuild the skeleton.
4. License is CC0. Keep `CREDITS.md` if you add a pack.
5. Triangle budget: prop < 2k, character < 20k unless the catalog says otherwise.
6. Gap-fill only from: Kenney.nl kits, KayKit, Quaternius CC0. Never 3dassets.dev.

## Commands

```bash
npm run setup    # fetch + index + inspect rigs
npm run view     # http://localhost:4173
```
