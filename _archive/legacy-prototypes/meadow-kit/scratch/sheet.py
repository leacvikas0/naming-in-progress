from PIL import Image, ImageDraw
ids = ["grass","broadLeaf","daisy","buttercup","clover","campanula","lupine","cosmos","phlox","blossomPuff"]
cell = 420
cols = 5
rows = 2
sheet = Image.new("RGB", (cell*cols, cell*rows), (207,224,189))
for i, sid in enumerate(ids):
    im = Image.open(f"scratch/shots/s-{sid}.png").convert("RGB")
    x = (i % cols) * cell
    y = (i // cols) * cell
    sheet.paste(im, (x, y))
    d = ImageDraw.Draw(sheet)
    d.rectangle([x, y, x+cell-1, y+cell-1], outline=(160,170,140))
    d.text((x+10, y+8), sid, fill=(50,60,40))
sheet.save("scratch/shots/sheet-species.png")
print("wrote", sheet.size)
