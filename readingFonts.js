/* ── DAWNSCRIBE READING FONTS ──────────────────────────────────────
   Shared font definitions for chapter reading experience.
   Used by: settings.html (reader preference), chapters.html (author
   default), chapter.html (applies author default + reader override).

   Each entry: { label, css, category }
   - label: display name shown in pickers
   - css: font-family value to apply
   - category: grouping for picker UI (sans, serif, display, mono, system)

   List is alphabetized by label for picker display.
──────────────────────────────────────────────────────────────────── */

window.READING_FONTS = {
  baskerville: { label: 'Baskerville',      css: "'Libre Baskerville',serif",    category: 'serif' },
  bitter:      { label: 'Bitter',           css: "'Bitter',serif",               category: 'display' },
  calibri:     { label: 'Calibri',          css: "Calibri,'Carlito',sans-serif", category: 'system' },
  caslon:      { label: 'Caslon',           css: "'Libre Caslon Text',serif",    category: 'serif' },
  cinzel:      { label: 'Cinzel',           css: "'Cinzel',serif",               category: 'display' },
  cormorant:   { label: 'Cormorant Garamond', css: "'Cormorant Garamond',serif", category: 'display' },
  crimson:     { label: 'Crimson Pro',      css: "'Crimson Pro',serif",          category: 'serif' },
  garamond:    { label: 'EB Garamond',      css: "'EB Garamond',serif",          category: 'serif' },
  georgia:     { label: 'Georgia',          css: "Georgia,serif",                category: 'serif' },
  inter:       { label: 'Inter',            css: "'Inter',sans-serif",           category: 'sans' },
  jetbrains:   { label: 'JetBrains Mono',   css: "'JetBrains Mono',monospace",   category: 'mono' },
  lato:        { label: 'Lato',             css: "'Lato',sans-serif",            category: 'sans' },
  liberation:  { label: 'Liberation Serif', css: "'Liberation Serif','Times New Roman',serif", category: 'system' },
  literata:    { label: 'Literata',         css: "'Literata',serif",             category: 'serif' },
  lora:        { label: 'Lora',             css: "'Lora',serif",                 category: 'serif' },
  minion:      { label: 'Minion Pro',       css: "'Minion Pro','Adobe Garamond Pro',Georgia,serif", category: 'system' },
  mono:        { label: 'System Mono',      css: "monospace",                    category: 'mono' },
  montserrat:  { label: 'Montserrat',       css: "'Montserrat',sans-serif",      category: 'sans' },
  bebasneue:   { label: 'Bebas Neue',       css: "'Bebas Neue',sans-serif",       category: 'display' },
  merriweather:{ label: 'Merriweather',     css: "'Merriweather',serif",         category: 'serif' },
  nunito:      { label: 'Nunito',           css: "'Nunito',sans-serif",          category: 'sans' },
  playfair:    { label: 'Playfair Display', css: "'Playfair Display',serif",     category: 'display' },
  poppins:     { label: 'Poppins',          css: "'Poppins',sans-serif",         category: 'sans' },
  ptserif:     { label: 'PT Serif',         css: "'PT Serif',serif",             category: 'serif' },
  'source-serif': { label: 'Source Serif',  css: "'Source Serif 4',serif",       category: 'serif' },
  spectral:    { label: 'Spectral',         css: "'Spectral',serif",             category: 'display' },
  timesnewroman: { label: 'Times New Roman', css: "'Times New Roman',Times,serif", category: 'system' },
  verdana:     { label: 'Verdana',          css: "Verdana,sans-serif",           category: 'system' },
  vollkorn:    { label: 'Vollkorn',         css: "'Vollkorn',serif",             category: 'serif' },
  worksans:    { label: 'Work Sans',        css: "'Work Sans',sans-serif",       category: 'sans' }
};

/* Google Fonts <link> URL covering web fonts above (system fonts like
   Times New Roman, Calibri, Verdana, Liberation Serif, Minion Pro use
   OS-installed fonts and need no Google Fonts entry).
   Include this in <head> on any page that renders chapter content with
   author-selected fonts (chapter.html) or offers the font picker
   (settings.html, chapters.html). */
window.READING_FONTS_GOOGLE_URL =
  'https://fonts.googleapis.com/css2?' +
  'family=Bebas+Neue' +
  '&family=Bitter:wght@400;600' +
  '&family=Cinzel:wght@600;700' +
  '&family=Cormorant+Garamond:wght@400;500;600' +
  '&family=Crimson+Pro:wght@300;400;600' +
  '&family=EB+Garamond:wght@400;500;600' +
  '&family=Inter:wght@300;400;700' +
  '&family=JetBrains+Mono:wght@400;500' +
  '&family=Lato:wght@300;400;700' +
  '&family=Libre+Baskerville:wght@400;700' +
  '&family=Libre+Caslon+Text:wght@400;700' +
  '&family=Literata:wght@400;500;600' +
  '&family=Lora:wght@400;500;700' +
  '&family=Merriweather:wght@300;400;700' +
  '&family=Montserrat:wght@300;400;700' +
  '&family=Nunito:wght@300;400;700' +
  '&family=Playfair+Display:wght@400;600;700' +
  '&family=Poppins:wght@300;400;700' +
  '&family=PT+Serif:wght@400;700' +
  '&family=Source+Serif+4:wght@300;400;600' +
  '&family=Spectral:wght@300;400;600' +
  '&family=Vollkorn:wght@400;600' +
  '&family=Work+Sans:wght@300;400;700' +
  '&display=swap';
