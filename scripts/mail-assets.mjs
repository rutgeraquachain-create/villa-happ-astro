/**
 * Genereert de beelden voor de transactiemails.
 *
 * Waarom dit bestaat: de hele site draait op WebP, en Outlook rendert dat niet.
 * Een productfoto of logo rechtstreeks uit `public/img/` levert bij een
 * Outlook-lezer een kapot icoontje op, en dat is precies de klant die net
 * betaald heeft. De mailbeelden staan daarom apart in `public/img/mail/` als
 * PNG en JPG.
 *
 * Het logo houdt zijn transparantie (PNG). Productfoto's worden vierkant
 * bijgesneden en op de papierkleur geplakt (JPG), zodat ze in een mailclient
 * die achtergronden strip nooit op wit-in-wit uitkomen.
 *
 * Draaien: node scripts/mail-assets.mjs
 * Doe dat opnieuw zodra er een product bij komt, en commit de uitvoer: de
 * build genereert dit niet.
 */

import sharp from 'sharp';
import { mkdir, readdir } from 'node:fs/promises';
import { join, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORTEL = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const BRON = join(WORTEL, 'public', 'img');
const DOEL = join(BRON, 'mail');

/**
 * Papierkleur, gelijk aan `--vh-paper` in src/styles/tokens.css (#F4EEE3) en
 * aan de kaartachtergrond in src/lib/mail-layout.ts. Wijkt dit af, dan zie je
 * een lichte rechthoek rond elke productfoto.
 */
const PAPIER = { r: 0xf4, g: 0xee, b: 0xe3 };

/**
 * Thumbnails zijn 240 px voor een weergave op 120 px. Retina-schermen zijn in
 * mail de norm, en een mailclient schaalt niet netjes terug van groter.
 */
const THUMB = 240;

async function main() {
  await mkdir(DOEL, { recursive: true });

  // Logo: transparantie behouden, dus PNG.
  await sharp(join(BRON, 'brand', 'villa-happ-logo.webp'))
    .resize(256, 256, { fit: 'contain', background: { ...PAPIER, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(join(DOEL, 'logo.png'));
  console.log('logo.png');

  const producten = (await readdir(join(BRON, 'products'))).filter((f) => f.endsWith('.webp'));
  for (const bestand of producten) {
    const naam = basename(bestand, extname(bestand));
    await sharp(join(BRON, 'products', bestand))
      // Midden bijsnijden, niet `attention`. Die strategie kiest het
      // contrastrijkste gebied, en bij een productfoto op een egale ondergrond
      // is dat een willekeurige hoek van het kledingstuk.
      .resize(THUMB, THUMB, { fit: 'cover', position: 'centre' })
      .flatten({ background: PAPIER })
      .jpeg({ quality: 82, progressive: true })
      .toFile(join(DOEL, `${naam}.jpg`));
    console.log(`${naam}.jpg`);
  }

  console.log(`\nKlaar: ${producten.length + 1} bestanden in public/img/mail/`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
