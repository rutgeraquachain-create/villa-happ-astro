"""Zet een packshot van een ander merk (wit) op de warme studioachtergrond van Villa Happ.

WAAROM
Merken leveren hun productfoto's op wit. De eigen collectie staat op warm crème met licht van
linksonder (gemeten op hoodie-navy-front: links ~#F9EDD3, rechts ~#EADCC1, boven ~#E3D3B9). Op /shop
en /brands vielen de VANN-flessen daardoor uit de toon. Besluit Geoffrey, 18 september 2026.

HOE
1. Masker door randvulling vanaf de beeldrand, op een vaste tolerantie ten opzichte van wit. Dat is
   de aanpak van tapzuilen_vrijstaand.py (scriptbieb): op een effen lichte achtergrond is dat
   betrouwbaarder dan rembg, dat lichte productranden (rietjes, chroom) wegknipt.
2. Achtergrond: alles wat de vulling bereikt, krijgt het warme verloop vermenigvuldigd met de
   helderheid van het origineel. Zo blijft de bestaande slagschaduw onder doos en fles staan, maar
   dan warm in plaats van grijs.
3. Product: onaangeroerd overgenomen. Geen vermenigvuldiging, dus de flessen houden hun eigen kleur;
   Oatmeal en Himalayan Salt verkleuren anders mee met de achtergrond.

Nieuwe bestandsnaam per verbeterd beeld, nooit hetzelfde pad: /img staat een jaar immutable in de
cache (zie CLAUDE.md, "Vervang de inhoud van een beeld nooit op hetzelfde pad").

    python scripts/merkfoto-achtergrond.py <bron.png> <uit.webp> [tolerantie]

De bron is het originele packshot van het merk (vierkant, wit). De uitvoer is 4:5, zoals elke
productfoto op de site.
"""
import sys

import cv2
import numpy as np
from PIL import Image

# Verloop gemeten op de hoodiefoto's (zie WAAROM). Licht linksonder, donkerder rechtsboven.
LICHT = np.array((249, 237, 212), float)
DONKER = np.array((226, 210, 184), float)


def achtergrond(b: int, h: int) -> np.ndarray:
    yy, xx = np.mgrid[0:h, 0:b].astype(float)
    x, y = xx / b, yy / h
    # 0 = licht, 1 = donker. Diagonaal verloop plus een zacht lichtvlak links van het midden.
    t = np.clip(0.55 * (1 - y) + 0.45 * x, 0, 1)
    vlak = np.exp(-(((x - 0.35) / 0.45) ** 2 + ((y - 0.62) / 0.5) ** 2))
    t = np.clip(t - 0.35 * vlak, 0, 1)
    return LICHT * (1 - t[..., None]) + DONKER * t[..., None]


def masker(rgb: np.ndarray, tol: int) -> np.ndarray:
    """1 = product, 0 = achtergrond. Randvulling vanaf elk licht randpunt."""
    zacht = cv2.GaussianBlur(rgb, (3, 3), 0)
    h, w = zacht.shape[:2]
    vul = np.zeros((h + 2, w + 2), np.uint8)
    vlag = 4 | cv2.FLOODFILL_MASK_ONLY | cv2.FLOODFILL_FIXED_RANGE | (255 << 8)
    stap = 5
    rand = ([(x, 0) for x in range(0, w, stap)] + [(x, h - 1) for x in range(0, w, stap)]
            + [(0, y) for y in range(0, h, stap)] + [(w - 1, y) for y in range(0, h, stap)])
    for x, y in rand:
        if vul[y + 1, x + 1] == 0 and zacht[y, x].mean() > 235:
            cv2.floodFill(zacht, vul, (x, y), 0, (tol,) * 3, (tol,) * 3, vlag)
    product = (vul[1:-1, 1:-1] == 0).astype(np.uint8) * 255
    # Ingesloten wit: de opening in een draaglus of dop bereikt de randvulling niet, en bleef als
    # wit vlakje op de warme achtergrond staan (gezien op alle zes VANN-foto's). Zuiver wit dat
    # minstens 14 px breed én hoog is, telt als achtergrond. Het rietje is smaller en blijft staan.
    wit = ((rgb.min(axis=2) >= 248) & (product > 0)).astype(np.uint8)
    n, lab, stats, _ = cv2.connectedComponentsWithStats(wit)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_WIDTH] >= 14 and stats[i, cv2.CC_STAT_HEIGHT] >= 14:
            product[lab == i] = 0
    # Gaatjes van een paar pixels dicht, losse stofjes weg. Geen "alleen het grootste stuk": de
    # doppen, het rietje en het borsteltje staan los van de fles.
    product = cv2.morphologyEx(product, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    n, lab, stats, _ = cv2.connectedComponentsWithStats(product)
    klein = [i for i in range(1, n) if stats[i, cv2.CC_STAT_AREA] < 60]
    product[np.isin(lab, klein)] = 0
    # Zachte rand van ongeveer één pixel, zodat er geen trapjes ontstaan.
    return cv2.GaussianBlur(product, (0, 0), 0.8).astype(float) / 255


def zet_op_achtergrond(bron: str, uit: str, tol: int = 10) -> None:
    rgb = np.array(Image.open(bron).convert('RGB'))
    h, w = rgb.shape[:2]
    m = masker(rgb, tol)[..., None]
    helder = rgb.astype(float) / 255

    # 4:5 zoals elke productfoto. Eén verloop over het hele doek, en het beeld gebruikt precies zijn
    # eigen strook daaruit: dan loopt de achtergrond boven en onder naadloos door.
    H = round(w * 5 / 4)
    doek = achtergrond(w, H)
    boven = (H - h) // 2
    bg = doek[boven:boven + h]
    # Achtergrond: warm verloop maal het origineel, zodat schaduwen meekomen. Wit (254) wordt ~bg.
    achter = bg * np.clip(helder / (254 / 255), 0, 1)
    doek[boven:boven + h] = m * rgb + (1 - m) * achter
    Image.fromarray(doek.clip(0, 255).astype(np.uint8)).save(uit, 'WEBP', quality=86, method=6)


if __name__ == '__main__':
    tol = int(sys.argv[3]) if len(sys.argv) > 3 else 10
    zet_op_achtergrond(sys.argv[1], sys.argv[2], tol)
