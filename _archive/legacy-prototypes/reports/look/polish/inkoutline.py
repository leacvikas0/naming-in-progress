from PIL import Image
im = Image.open("reports/look/polish/styles-04.png").convert("RGB")
# Ink pane = bottom-left quadrant. Crop tree line and zoom.
im.crop((80, 500, 640, 660)).resize((1120, 320), Image.LANCZOS).save("reports/look/polish/ink-outline.png")
print("ok")
