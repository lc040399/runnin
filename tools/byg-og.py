# Genererer assets/og.png (delebilledet, 1200x630). Kør: python3 tools/byg-og.py "5.900+"
# Kræver /tmp/InterTight.ttf (hentes fra github.com/google/fonts ved behov).
import sys
from PIL import Image, ImageDraw, ImageFont

ANTAL = sys.argv[1] if len(sys.argv) > 1 else "5.900+"
W, H = 1200, 630
PAPIR, INK, MUTED, CARAMEL = "#F5F3EE", "#38240D", "#7E6A50", "#C05800"
TYPE_FARVER = ["#2563EB", "#16A34A", "#C05800", "#7C3AED", "#38240D"]

img = Image.new("RGB", (W, H), PAPIR)
d = ImageDraw.Draw(img)

def font(px, vægt=700):
    f = ImageFont.truetype("/tmp/InterTight.ttf", px)
    try: f.set_variation_by_axes([vægt])
    except Exception: pass
    return f

for i in range(140):
    h = (i * 2654435761) % 2**32
    x, y = h % 1200, (h >> 12) % 630
    if 60 < x < 1140 and 40 < y < 590:
        r = 3 if (h >> 22) % 3 else 4
        d.ellipse([x-r, y-r, x+r, y+r], fill=(56, 36, 13, 20))
img = Image.blend(img, Image.new("RGB", (W, H), PAPIR), 0.82)
d = ImageDraw.Draw(img)

mark = Image.open("assets/mark.png").convert("RGBA")
mark.thumbnail((92, 92))
img.paste(mark, (84, 76), mark)

d.text((196, 84), "R U N N I N", font=font(38, 800), fill=INK)
d.text((80, 236), "Hele verdens løb.", font=font(96, 800), fill=INK)
d.text((80, 348), "Ét kort.", font=font(96, 800), fill=CARAMEL)
d.text((84, 496), f"{ANTAL} løb · Norden i dybden · live på løbsdagen · gratis", font=font(30, 500), fill=MUTED)

x = 84
for c in TYPE_FARVER:
    d.ellipse([x, 556, x+18, 574], fill=c, outline="#ffffff", width=2)
    x += 30

img.save("assets/og.png", optimize=True)
print("assets/og.png opdateret:", ANTAL, "løb")
