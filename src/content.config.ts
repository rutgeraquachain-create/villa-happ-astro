import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Journal: de contentmotor van de site. Elk verhaal is een eigen
 * indexeerbare URL met Article-schema; hier komt het organische
 * verkeer van een heritage-merk vandaan.
 */
const journal = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/journal' }),
  schema: z.object({
    title: z.string(),
    description: z.string().max(180),
    date: z.coerce.date(),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    tags: z.array(z.string()).default([]),
  }),
});

/**
 * Mailings: de tekst van elke zending naar de nieuwsbrieflijst.
 *
 * In de repo en niet in een formulier, om drie redenen. De tekst gaat langs een
 * PR voordat hij naar honderden mensen gaat, hij is achteraf terug te vinden bij
 * de versie van de site waar hij naar verwees, en hij is te bekijken op
 * /dev/mail voordat er iets de deur uit is. Prijs: een mailing vraagt een
 * deploy. Dat is bewust: verzenden is onomkeerbaar en mag een drempel hebben.
 *
 * `slug` is de bestandsnaam en zit in de dedupe-sleutel. Hergebruik hem nooit,
 * ook niet na een correctie: dan denkt de outbox dat de mail al verstuurd is.
 */
const mailings = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/mailings' }),
  schema: z.object({
    /** Onderwerpregel. Zichtbaar in de inbox, dus geen plaatshouder. */
    onderwerp: z.string().min(8).max(120),
    /** De regel die naast het onderwerp verschijnt vóór openen. */
    preheader: z.string().min(8).max(140),
    /** Kort label boven de titel, in de mail zelf. */
    label: z.string().max(40),
    titel: z.string().min(3).max(90),
    /** Optionele knop onderaan. Beide velden of geen van beide. */
    knopTekst: z.string().max(40).optional(),
    knopUrl: z.url().optional(),
    /** Zet op false zolang de tekst nog niet af is; dan kan hij niet verstuurd worden. */
    klaar: z.boolean().default(false),
  }),
});

export const collections = { journal, mailings };
