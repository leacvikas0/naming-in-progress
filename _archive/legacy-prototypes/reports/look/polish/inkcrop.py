from PIL import Image
im = Image.open("reports/look/polish/styles-03.png").convert("RGB")
# bottom-left pane (Ink), crop the right-hand tree cluster and zoom 2x
im.crop((460, 500, 800, 700)).resize((680, 400), Image.NEAREST).save("reports/look/polish/ink-crop.png")
print("ok")
