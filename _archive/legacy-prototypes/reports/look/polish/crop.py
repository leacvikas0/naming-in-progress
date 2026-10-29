import sys
from PIL import Image
def crop(src, dst, box, scale=2):
    im = Image.open(src).convert("RGB").crop(box)
    im = im.resize((im.width*scale, im.height*scale), Image.NEAREST)
    im.save(dst)
# canopy against sky + grass silhouettes
crop("reports/look/follow-03-gameplay.png", "reports/look/polish/cmp-before-crop.png", (140,150,640,400))
crop("reports/look/polish/aa-01-gameplay.png", "reports/look/polish/cmp-after-crop.png", (140,150,640,400))
print("ok")
