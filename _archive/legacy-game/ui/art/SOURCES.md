# Pixel art sources

Two kinds of art live in this project. Both end up in `game/ui/gen/`, which is
the only directory the game reads.

## 1. Authored in code (the chrome)

Frames, keycaps, dividers, wells, the pixel font, and the small stat icons are
drawn as ASCII grids in `game/ui/lib/` and compiled by `node game/ui/build-ui.mjs`.
They are deterministic and diffable. Edit the grid, re-run the build.

| File | Contains |
|---|---|
| `lib/font.mjs` | PixelChrome 5x7 stencil uppercase face |
| `lib/frames.mjs` | 9-slice slabs, ornate panels, buttons, troughs, roster bars, dividers, keycaps, wells |
| `lib/icons.mjs` | Stat glyphs (hp, dmg, spd, coin, skull, rune, flask, shield, clock, star) |
| `lib/palette.mjs` | The one palette |

## 2. Imported from generated art (the class sigils)

`game/ui/art/sigil-*.png` are 32x32 class sigils. They began as AI-generated
pixel art (on a flat background) and were snapped onto this project's grid and
palette by `tools/import-sprite.mjs`. They are checked in as the reviewed
artifacts, and `build-ui.mjs` copies them into `gen/`.

### Regenerating a sigil

```bash
# 1. split a 2x2 generated sheet into quadrants
node game/ui/tools/slice-sheet.mjs game/ui/ref/sigil-sheet.png <tmpdir> sigil --split 2x2

# 2. key the background and snap to the 32x32 grid with a 10-colour palette
node game/ui/tools/import-sprite.mjs <tmpdir>/sigil-1.png sigil-knight \
  --grid 32 --colors 10 --pad 2
```

`import-sprite.mjs` will print the detected background colour, the content
bounds, the estimated native block size, and the resulting grid. **Check that
the estimated native grid is at least as large as `--grid`** — if the source art
is only ~36x36 native pixels, importing at 16x16 destroys detail (this happened;
the rogue's daggers vanished). 32x32 is the floor for these sigils.

### Design intent

The sigils depict the *equipment* of the four KayKit characters, not the
characters themselves, so they read as class marks rather than portraits:

| Sigil | Subject | Matches the model's |
|---|---|---|
| knight | Great helm | cream plate, central crest ridge |
| barbarian | Bear-pelt hood | brown bear head worn as a hood |
| rogue | Crossed daggers | dual knives + ginger hair |
| mage | Pointed wizard hat | purple cone, orange band |

Reference screenshots of the live models are in `game/ui/ref/` — regenerate
them by selecting each hero on the title screen and screenshotting the dais.

## Reference images

`game/ui/ref/` holds the source material used for generation. It is not loaded
by the game; it exists so the art can be re-derived and reviewed later.
