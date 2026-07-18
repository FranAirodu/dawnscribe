// DawnScribe SEO middleware (Vercel Edge)
// Injects real <title>, meta description, Open Graph / Twitter tags, canonical
// URL, and JSON-LD into story.html, chapter.html, and artwork.html so search
// engines and social scrapers see actual content instead of empty shells.

const SUPABASE_URL = 'https://cajjyyskpmjnpcxcfeuk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhamp5eXNrcG1qbnBjeGNmZXVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3NDUyMDUsImV4cCI6MjA5NTMyMTIwNX0.s93zWwRYymTsoW5BfUhUDli13ArCtk4S-tegAs54A2c';
const SITE_URL = 'https://www.dawnscribe.com';
const DEFAULT_DESC = 'Read on DawnScribe — a home for stories, art, and the people who love them.';

export const config = {
  matcher: ['/story.html', '/chapter.html', '/artwork.html'],
};

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function truncate(s, n) {
  s = String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
}

async function sbGet(path) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function buildMeta(pathname, id) {
  const workCols = 'id,title,synopsis,cover_url,is_published,content_rating_erotica,type,updated_at,author_id,tags_main';

  if (pathname === '/chapter.html') {
    const ch = await sbGet(`chapters?id=eq.${encodeURIComponent(id)}&select=id,title,chapter_number,work_id,status&limit=1`);
    if (!ch || !['published', 'one-shot'].includes(ch.status)) return null;
    const work = await sbGet(`works?id=eq.${encodeURIComponent(ch.work_id)}&select=${workCols}&limit=1`);
    if (!work || work.is_published === false) return null;
    const chLabel = ch.status === 'one-shot' ? '' : `Chapter ${ch.chapter_number}${ch.title ? ': ' + ch.title : ''} — `;
    return {
      title: `${chLabel}${work.title} | DawnScribe`,
      desc: truncate(work.synopsis, 160) || DEFAULT_DESC,
      image: work.cover_url || '',
      url: `${SITE_URL}/chapter.html?id=${encodeURIComponent(id)}`,
      ogType: 'article',
      noindex: work.content_rating_erotica === true,
      jsonld: {
        '@context': 'https://schema.org',
        '@type': 'Chapter',
        name: ch.title || `Chapter ${ch.chapter_number}`,
        position: ch.chapter_number,
        isPartOf: { '@type': 'Book', name: work.title, url: `${SITE_URL}/story.html?id=${work.id}` },
      },
    };
  }

  // story.html and artwork.html both read from works
  const work = await sbGet(`works?id=eq.${encodeURIComponent(id)}&select=${workCols}&limit=1`);
  if (!work || work.is_published === false) return null;
  const isArt = pathname === '/artwork.html';
  return {
    title: `${work.title} | DawnScribe`,
    desc: truncate(work.synopsis, 160) || DEFAULT_DESC,
    image: work.cover_url || '',
    url: `${SITE_URL}${pathname}?id=${encodeURIComponent(id)}`,
    ogType: isArt ? 'website' : 'book',
    noindex: work.content_rating_erotica === true,
    jsonld: {
      '@context': 'https://schema.org',
      '@type': isArt ? 'VisualArtwork' : 'Book',
      name: work.title,
      description: truncate(work.synopsis, 300),
      image: work.cover_url || undefined,
      url: `${SITE_URL}${pathname}?id=${work.id}`,
      dateModified: work.updated_at || undefined,
      keywords: Array.isArray(work.tags_main) ? work.tags_main.join(', ') : undefined,
    },
  };
}

export default async function middleware(request) {
  // Prevent recursion when we fetch our own origin below
  if (request.headers.get('x-ds-prerender')) return;

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id || !/^[0-9a-f-]{16,64}$/i.test(id)) return; // no id → serve static as-is

  let meta;
  try {
    meta = await buildMeta(url.pathname, id);
  } catch (e) {
    return; // any failure → fall through to untouched static page
  }
  if (!meta) return;

  // Fetch the static page from our own deployment
  const pageRes = await fetch(url.origin + url.pathname, {
    headers: { 'x-ds-prerender': '1' },
  });
  if (!pageRes.ok) return;
  let html = await pageRes.text();

  // Replace <title> and any existing og: tags
  html = html.replace(/<title>[^<]*<\/title>/i, `<title>${esc(meta.title)}</title>`);
  const ogMap = {
    'og:title': meta.title,
    'og:description': meta.desc,
    'og:image': meta.image,
    'og:url': meta.url,
    'og:type': meta.ogType,
  };
  for (const [prop, val] of Object.entries(ogMap)) {
    const re = new RegExp(`<meta\\s+property="${prop}"[^>]*>`, 'i');
    const tag = `<meta property="${prop}" content="${esc(val)}"/>`;
    html = re.test(html) ? html.replace(re, tag) : html;
  }

  // Inject description, canonical, twitter card, robots, JSON-LD before </head>
  const inject = [
    `<meta name="description" content="${esc(meta.desc)}"/>`,
    `<link rel="canonical" href="${esc(meta.url)}"/>`,
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}"/>`,
    `<meta name="twitter:title" content="${esc(meta.title)}"/>`,
    `<meta name="twitter:description" content="${esc(meta.desc)}"/>`,
    meta.image ? `<meta name="twitter:image" content="${esc(meta.image)}"/>` : '',
    meta.noindex ? '<meta name="robots" content="noindex"/>' : '',
    `<script type="application/ld+json">${JSON.stringify(meta.jsonld).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n  ');
  html = html.replace(/<\/head>/i, `  ${inject}\n</head>`);

  return new Response(html, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, s-maxage=300, stale-while-revalidate=3600',
    },
  });
}
