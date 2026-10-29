from PIL import Image, ImageChops
import statistics
a = Image.open("reports/look/polish/aa-01-gameplay.png").convert("RGB")
b = Image.open("reports/look/polish/aa-02-gameplay.png").convert("RGB")
d = ImageChops.difference(a,b)
px = list(d.getdata())
mean = sum(sum(p) for p in px)/ (len(px)*3)
print("mean abs diff vs previous MSAA render:", round(mean,3))
