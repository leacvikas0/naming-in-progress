from PIL import Image
im = Image.open("reports/look/polish/styles-03.png").convert("RGB")
im.crop((495, 505, 605, 565)).resize((660, 360), Image.NEAREST).save("reports/look/polish/ink-crop2.png")
print("ok")
