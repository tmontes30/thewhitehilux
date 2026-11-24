# Fotos de neumáticos para la tienda a partir de las del proveedor (carpeta Neumaticos/, privada).
# Recorta cuadrado enfocado en el neumático, mejora contraste y nitidez y pone la etiqueta AT / MT con el estilo TWH.
# Uso: python disenos/neumaticos/preparar.py
#   -> web/assets/img/neumaticos/at-01.jpg ... mt-01.jpg ...  (900 x 900)
#   -> disenos/neumaticos/todos-neumas.png y todos-neumas.html (para revisar antes de publicar)
import os, glob
from PIL import Image, ImageDraw, ImageFont, ImageEnhance, ImageFilter, ImageOps

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
SRC = os.path.join(ROOT, 'Neumaticos')
OUT = os.path.join(ROOT, 'web', 'assets', 'img', 'neumaticos')
HERE = os.path.dirname(__file__)
FONTS = os.path.join(ROOT, 'disenos', 'fuentes')
os.makedirs(OUT, exist_ok=True)
SIZE = 900

# (n.º de foto en la carpeta ordenada por nombre, tipo, recorte cuadrado (x, y, lado) en px de la original, nota)
# La 9 no se usa: trae la marca de agua de otra tienda (NEUMACENTER).
FOTOS = [
    (7,  'at', (0, 0, 447), 'RoadX RX Quest AT21'),
    (6,  'at', (0, 330, 1200), 'Sumaxx All Terrain (Jeep)'),
    (2,  'at', (0, 160, 1200), '33x12.50R17LT'),
    (10, 'at', (0, 180, 1200), 'Set de 4'),
    (1,  'at', (0, 70, 900), 'All Terrain (stack)'),
    (11, 'at', (0, 400, 1200), 'Montado en camioneta'),
    (12, 'at', (0, 400, 1200), 'XBRI Brutus T/A (marca a confirmar)'),
    (3,  'mt', (0, 62, 375), 'RoadX MT'),
    (8,  'mt', (0, 64, 387), 'Mud Terrain'),
    (4,  'mt', (0, 120, 1200), 'Set de 4'),
    (5,  'mt', (0, 400, 1200), 'Montado en Ranger'),
]
INK, BG, ORANGE, RED, DRED = (242, 240, 232), (27, 28, 26), (242, 165, 65), (228, 87, 46), (179, 32, 42)

def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name + '.ttf'), size)

def etiqueta(im, tipo):
    """Píldora oscura abajo a la izquierda: 'AT · ALL TERRAIN' con las 3 franjas TWH."""
    big, small = font('Anton-Regular', 58), font('BebasNeue-Regular', 34)
    txt = 'ALL TERRAIN' if tipo == 'at' else 'MUD TERRAIN'
    d0 = ImageDraw.Draw(im)
    wb = d0.textlength(tipo.upper(), font=big)
    ws = d0.textlength(txt, font=small)
    w, h = int(28 + wb + 18 + ws + 28), 86
    x, y = 30, SIZE - h - 30
    capa = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    d.rounded_rectangle((x, y, x + w, y + h), radius=16, fill=BG + (232,))
    d.text((x + 28, y + 8), tipo.upper(), font=big, fill=ORANGE)
    d.text((x + 28 + wb + 18, y + 16), txt, font=small, fill=INK)
    # franjas
    for k, c in enumerate((ORANGE, RED, DRED)):
        yy = y + 56 + k * 7
        d.polygon([(x + 28 + wb + 18, yy), (x + w - 34 - k * 8, yy), (x + w - 38 - k * 8, yy + 4), (x + 28 + wb + 18, yy + 4)], fill=c)
    return Image.alpha_composite(im.convert('RGBA'), capa).convert('RGB')

def preparar(src, box):
    im = ImageOps.exif_transpose(Image.open(src)).convert('RGB')
    x, y, s = box
    s = min(s, im.width - x, im.height - y)
    im = im.crop((x, y, x + s, y + s)).resize((SIZE, SIZE), Image.LANCZOS)
    im = ImageOps.autocontrast(im, cutoff=0.6)
    im = ImageEnhance.Contrast(im).enhance(1.06)
    im = ImageEnhance.Color(im).enhance(1.05)
    return im.filter(ImageFilter.UnsharpMask(radius=2, percent=70 if s >= 800 else 120, threshold=2))

fuentes = sorted(glob.glob(os.path.join(SRC, '*.jpeg')) + glob.glob(os.path.join(SRC, '*.jpg')) + glob.glob(os.path.join(SRC, '*.png')))
cont = {'at': 0, 'mt': 0}
hechas = []
for n, tipo, box, nota in FOTOS:
    cont[tipo] += 1
    nombre = '%s-%02d.jpg' % (tipo, cont[tipo])
    im = etiqueta(preparar(fuentes[n - 1], box), tipo)
    im.save(os.path.join(OUT, nombre), quality=86, optimize=True, progressive=True)
    hechas.append((tipo, nombre, n, nota))
    print('ok', nombre, '<- foto', n, '·', nota)

# ---------- hoja para revisar: todos-neumas ----------
th, pad, lab = 300, 14, 46
for tipo, titulo in (('at', 'AT · All Terrain'), ('mt', 'MT · Mud Terrain')):
    pass
filas = [('at', [h for h in hechas if h[0] == 'at']), ('mt', [h for h in hechas if h[0] == 'mt'])]
cols = max(len(f[1]) for f in filas)
W = pad + cols * (th + pad)
H = sum(70 + th + lab for _ in filas) + pad
hoja = Image.new('RGB', (W, H), (238, 238, 236))
d = ImageDraw.Draw(hoja)
yy = pad
for tipo, lista in filas:
    d.text((pad, yy + 14), 'NEUMÁTICOS ' + ('AT · ALL TERRAIN' if tipo == 'at' else 'MT · MUD TERRAIN') + '  (%d fotos)' % len(lista), font=font('BebasNeue-Regular', 40), fill=BG)
    yy += 70
    for i, (t, nombre, n, nota) in enumerate(lista):
        x = pad + i * (th + pad)
        hoja.paste(Image.open(os.path.join(OUT, nombre)).resize((th, th), Image.LANCZOS), (x, yy))
        d.text((x, yy + th + 6), '%s  (foto %d)' % (nombre, n), font=font('BebasNeue-Regular', 22), fill=BG)
        d.text((x, yy + th + 26), nota, font=font('BebasNeue-Regular', 18), fill=(107, 112, 108))
    yy += th + lab
hoja.save(os.path.join(HERE, 'todos-neumas.png'))
html = ['<!doctype html><meta charset="utf-8"><title>Todos los neumáticos</title><style>body{font-family:Segoe UI,Arial;background:#EEEEEC;margin:20px}h2{margin:24px 0 10px}div.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}figure{margin:0;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)}img{width:100%;display:block}figcaption{padding:8px 10px;font-size:13px}small{color:#6B706C}</style>',
        '<h1>Fotos de neumáticos para revisar</h1><p>Se publican en dos productos: <b>Neumáticos AT</b> y <b>Neumáticos MT</b>. La primera de cada grupo es la portada.</p>']
for tipo, lista in filas:
    html.append('<h2>%s</h2><div class="g">' % ('AT · All Terrain' if tipo == 'at' else 'MT · Mud Terrain'))
    for t, nombre, n, nota in lista:
        html.append('<figure><img src="../../web/assets/img/neumaticos/%s"><figcaption><b>%s</b> · foto %d de la carpeta<br><small>%s</small></figcaption></figure>' % (nombre, nombre, n, nota))
    html.append('</div>')
open(os.path.join(HERE, 'todos-neumas.html'), 'w', encoding='utf-8').write('\n'.join(html))
print('Hoja: disenos/neumaticos/todos-neumas.png y todos-neumas.html')
