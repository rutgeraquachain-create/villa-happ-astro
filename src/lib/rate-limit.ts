/**
 * Villa Happ — Eenvoudige rate limiter voor de API-routes
 *
 * In-memory per serverless-instance: geen harde garantie over meerdere
 * instances heen, maar stopt wel het gangbare misbruik (scripted spam,
 * brute force op één instance) zonder externe dependency. Voor echte
 * volumes later vervangen door Vercel Firewall of Upstash.
 */

interface Bucket { count: number; reset: number }

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now();

  // Opportunistische cleanup zodat de map niet onbegrensd groeit
  if (buckets.size > 5_000) {
    for (const [k, b] of buckets) {
      if (now > b.reset) buckets.delete(k);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || now > bucket.reset) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

/** Client-IP uit de request halen (Vercel zet x-forwarded-for). */
export function clientKey(request: Request, scope: string): string {
  const fwd = request.headers.get('x-forwarded-for');
  const ip = fwd ? fwd.split(',')[0].trim() : 'unknown';
  return `${scope}:${ip}`;
}

/**
 * Het antwoord draagt dezelfde tekst onder twee namen, en dat is geen slordigheid.
 *
 * GEMETEN 12 SEPTEMBER 2026. Dit antwoord gaf alleen `error`, terwijl de
 * formulierpagina's `data.message` uitlezen (zo geeft `fout()` in de routes zijn
 * meldingen terug). Wie op de herinneringspagina tegen de rem liep, kreeg dus
 * niet "wacht even" te zien maar de terugval "Er ging iets mis. Probeer
 * opnieuw." — een tekst die uitnodigt tot precies de herhaling die wordt
 * geweigerd. Het geheel werkte, er was niets rood, en de deelnemer stond stil.
 *
 * `error` blijft erin omdat de beheerroutes en `het-atelier.astro` daarop
 * leunen. Twee namen voor één tekst is hier goedkoper dan tien aanroepplekken
 * omzetten vlak voor een campagne.
 */
export function tooManyRequests(message = 'Te veel verzoeken. Probeer het over een minuut opnieuw.'): Response {
  return new Response(JSON.stringify({ error: message, message, success: false }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': '60' },
  });
}
