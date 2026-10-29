# Side-by-side: spellbook reference frame vs the in-game screenshot.
# Temporary evidence helper: keep or delete before handoff.
import pathlib

from PIL import Image, ImageDraw

OUT = pathlib.Path(__file__).resolve().parent
REF = pathlib.Path(r"C:\Users\silen\Downloads\VFX-godot\reference")

# (slug, sheet, (col, row) of the reference frame, game shot, label)
SPELLS = [
    ("frost", REF / "frost-lance" / "plates" / "ice__sheet__hero.png", (2, 1), OUT / "shot-peak-field.png", "Frost Lance"),
    ("storm", REF / "storm-lance" / "plates" / "thunder__sheet__hero.png", (0, 1), OUT / "shot-storm-bolt.png", "Storm Lance"),
    ("glacier", REF / "glacial-crown" / "plates" / "glacier__sheet__hero.png", (2, 1), OUT / "shot-glacial-crown.png", "Glacial Crown"),
]

H = 450
GAP = 12
HEADER = 34


def main():
    for slug, sheet_path, (col, row), game_path, label in SPELLS:
        if not sheet_path.exists() or not game_path.exists():
            print("skip", slug, "missing", sheet_path.exists(), game_path.exists())
            continue
        sheet = Image.open(sheet_path).convert("RGB")
        tw = sheet.width // 5
        th = sheet.height // 3
        ref = sheet.crop((col * tw, row * th, (col + 1) * tw, (row + 1) * th))
        ref = ref.resize((round(ref.width * H / ref.height), H), Image.LANCZOS)
        game = Image.open(game_path).convert("RGB")
        game = game.resize((round(game.width * H / game.height), H), Image.LANCZOS)

        w = ref.width + GAP + game.width
        canvas = Image.new("RGB", (w, H + HEADER), (18, 20, 24))
        canvas.paste(ref, (0, HEADER))
        canvas.paste(game, (ref.width + GAP, HEADER))

        draw = ImageDraw.Draw(canvas)
        draw.text((8, 9), f"{label} — spellbook reference (left) vs game (right)", fill=(235, 238, 242))

        out = OUT / f"compare-{slug}.png"
        canvas.save(out)
        print("wrote", out.name, canvas.size)


if __name__ == "__main__":
    main()
