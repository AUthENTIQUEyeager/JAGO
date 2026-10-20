"""Génère les icônes PWA (192, 512, maskable, apple-touch) depuis les couleurs de la marque.
Usage : python3 scripts/generate-icons.py   (nécessite Pillow)"""
from PIL import Image, ImageDraw

GREEN, AMBER = (21, 92, 67), (251, 191, 36)

def draw_j(draw: ImageDraw.ImageDraw, size: int, scale: float) -> None:
    """Lettre « J » en trait épais, centrée, occupant `scale` de la taille."""
    s = size * scale
    ox = oy = (size - s) / 2
    w = int(s * 0.17)
    x = ox + s * 0.62
    draw.line([(x, oy + s * 0.08), (x, oy + s * 0.60)], fill=AMBER, width=w)
    r = s * 0.22
    box = [x - 2 * r, oy + s * 0.60 - r, x, oy + s * 0.60 + r]
    draw.arc(box, start=0, end=150, fill=AMBER, width=w)
    for cx, cy in ((x, oy + s * 0.08), (x - 2 * r + w * 0.15, oy + s * 0.60 + r * 0.45)):
        draw.ellipse([cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2], fill=AMBER)

def make(size: int, maskable: bool) -> Image.Image:
    scale4 = 4
    big = size * scale4
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, big, big], fill=GREEN)  # plein cadre : le système découpe lui-même
        draw_j(d, big, 0.56)                        # le motif reste dans la « zone sûre »
    else:
        d.rounded_rectangle([0, 0, big - 1, big - 1], radius=int(big * 0.22), fill=GREEN)
        draw_j(d, big, 0.72)
    return img.resize((size, size), Image.LANCZOS)

if __name__ == "__main__":
    make(192, False).save("public/icon-192.png")
    make(512, False).save("public/icon-512.png")
    make(512, True).save("public/icon-maskable-512.png")
    flat = Image.new("RGB", (180, 180), GREEN)  # iOS applique ses propres coins arrondis
    flat.paste(make(180, True), (0, 0), make(180, True))
    flat.save("public/apple-touch-icon.png")
    print("icônes générées")
