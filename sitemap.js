// GET /sitemap.xml  →  rewritten to /api/sitemap by vercel.json
//
// Replaces the previous static 5-URL sitemap. Individual story, artwork and
// chapter pages are the searchable content on a fiction site; without them the
// only indexable surfaces were the homepage and four nav pages.
//
// TWO RULES THIS FILE EXISTS TO ENFORCE:
//
// 1. ADULT WORKS ARE EXCLUDED. The `works` RLS policy gates on
//    (content_rating_erotica = false OR can_view_adult_content()), so an
//    anonymous crawler gets nothing for an adult work. Listing one would both
//    advertise a dead URL and leak an adult title into search results. The
//    filters below mirror the RLS rule deliberately - do not relax them.
//
// 2. IT USES THE PUBLISHABLE KEY AND THE ANON ROLE. Never the service key.
//    The sitemap must contain exactly what a logged-out visitor can reach, and
//    the cleanest way to guarantee that is to fetch it AS a logged-out visitor.
//    If a row is invisible to anon here, it does not belong in the sitemap.

const SUPABASE_URL = 'https://cajjyyskpmjnpcxcfeuk.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ZZjE1u_pQn5YkrMKH4P3KQ_HSGqTjzx';
const SITE = 'https://www.dawnscribe.com';

// Static entries. NOTE: /collab-gallery.html was removed — it requires a
// ?work= id and the bare URL renders "No story specified.", so listing it
// pointed crawlers at an empty page. That page is now noindex too.
const STATIC = [
  { loc: '/',                    priority: '1.0' },
  { loc: '/browse.html',         priority: '0.9' },
  { loc: '/rising.html',         priority: '0.8' },
  { loc: '/about.html',          priority: '0.3' },
];

function xmlEscape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Only emit a valid W3C date; a malformed <lastmod> invalidates the whole entry.
function lastmod(value) {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return '<lastmod>' + d.toISOString().slice(0, 10) + '</lastmod>';
}

async function q(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error('supabase ' + res.status + ' on ' + path);
  return res.json();
}

function urlTag(loc, priority, updated) {
  return '  <url><loc>' + xmlEscape(SITE + loc) + '</loc>' +
         lastmod(updated) +
         '<priority>' + priority + '</priority></url>';
}

// CommonJS on purpose: the repo has no package.json declaring "type":"module",
// so an ESM `export default` would fail to load at runtime on Vercel.
module.exports = async function handler(req, res) {
  const parts = [];

  try {
    // Published, non-adult works. Novels and artwork live on different pages.
    const works = await q(
      'works?select=id,type,updated_at,created_at' +
      '&is_published=eq.true' +
      '&content_rating_erotica=eq.false' +
      '&order=updated_at.desc&limit=5000'
    );

    // Published chapters of those same works. The embedded works(...) filter
    // plus works=not.is.null performs the inner join - a plain embed would
    // return chapters whose parent was filtered out.
    const chapters = await q(
      'chapters?select=id,updated_at,created_at,works!inner(is_published,content_rating_erotica)' +
      '&status=in.(published,one-shot)' +
      '&works.is_published=eq.true' +
      '&works.content_rating_erotica=eq.false' +
      '&order=updated_at.desc&limit=20000'
    );

    for (const w of works) {
      const page = w.type === 'artwork' ? '/artwork.html?id=' : '/story.html?id=';
      parts.push(urlTag(page + w.id, '0.7', w.updated_at || w.created_at));
    }
    for (const c of chapters) {
      parts.push(urlTag('/chapter.html?id=' + c.id, '0.6', c.updated_at || c.created_at));
    }
  } catch (err) {
    // Fail SOFT. A sitemap that 500s teaches crawlers to stop asking; a sitemap
    // with only the static pages is the previous behaviour, which is fine.
    console.error('sitemap: dynamic section failed, serving static only:', err);
  }

  const body =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    STATIC.map(s => urlTag(s.loc, s.priority)).join('\n') +
    (parts.length ? '\n' + parts.join('\n') : '') +
    '\n</urlset>';

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(body);
};
