// /api/sitemap — dynamic sitemap.xml for DawnScribe
// Lists all published, non-erotica works (stories + artworks) with lastmod.

const SUPABASE_URL = 'https://cajjyyskpmjnpcxcfeuk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhamp5eXNrcG1qbnBjeGNmZXVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NDUyMDUsImV4cCI6MjA5NTMyMTIwNX0.s93zWwRYymTsoW5BfUhUDli13ArCtk4S-tegAs54A2c';
const SITE_URL = 'https://www.dawnscribe.com';
const PAGE_SIZE = 1000;
const MAX_PAGES = 40; // up to 40k URLs; switch to a sitemap index past that

export default async function handler(req, res) {
  const urls = [
    { loc: SITE_URL + '/', priority: '1.0' },
    { loc: SITE_URL + '/browse.html', priority: '0.9' },
    { loc: SITE_URL + '/rising.html', priority: '0.8' },
    { loc: SITE_URL + '/collab-gallery.html', priority: '0.6' },
    { loc: SITE_URL + '/about.html', priority: '0.3' },
  ];

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    const q = `works?select=id,type,updated_at&is_published=not.is.false&content_rating_erotica=not.is.true&order=updated_at.desc&limit=${PAGE_SIZE}&offset=${offset}`;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${q}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
    });
    if (!r.ok) break;
    const rows = await r.json();
    for (const w of rows) {
      const path = w.type === 'artwork' ? '/artwork.html' : '/story.html';
      urls.push({
        loc: `${SITE_URL}${path}?id=${w.id}`,
        lastmod: w.updated_at ? new Date(w.updated_at).toISOString().slice(0, 10) : null,
        priority: '0.7',
      });
    }
    if (rows.length < PAGE_SIZE) break;
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(u =>
      '  <url><loc>' + u.loc.replace(/&/g, '&amp;') + '</loc>' +
      (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') +
      (u.priority ? '<priority>' + u.priority + '</priority>' : '') +
      '</url>'
    ).join('\n') +
    '\n</urlset>';

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
