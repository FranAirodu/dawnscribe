/* dobPicker.js — DawnScribe shared date-of-birth picker.
 *
 * Replaces a native <input type="date"> with three dropdowns (Month / Day /
 * Year) so users can jump straight to a year instead of clicking back through
 * the native picker one month at a time.
 *
 * Usage:  DSDob.attach('signup-dob');
 *
 * Contract with existing code:
 *   - The original element KEEPS its id, name and value in `YYYY-MM-DD`, so
 *     every existing reader (document.getElementById(id).value) is unchanged.
 *   - It is switched to type="hidden" so the native picker and native min/max
 *     validation cannot interfere with the dropdowns.
 *   - min / max are read OFF the input, so callers keep owning the bounds.
 *     attach() must therefore run AFTER min/max are set.
 *   - A 'change' event fires on the hidden input whenever the value changes,
 *     for anything listening.
 *
 * Bounds are respected exactly: the year list spans min..max, and month/day
 * lists narrow at the boundary years so an out-of-range date cannot be built.
 */
(function () {
  'use strict';

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];

  var STYLE_ID = 'ds-dob-style';

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '.ds-dob{display:grid;grid-template-columns:1.4fr 0.8fr 1fr;gap:8px;}' +
      '.ds-dob select{width:100%;background:var(--bg3);border:1px solid var(--border);' +
      'border-radius:8px;padding:11px 10px;color:var(--text);font-size:14px;' +
      "font-family:'Lato',sans-serif;outline:none;transition:all 0.2s;cursor:pointer;" +
      '-webkit-appearance:none;appearance:none;' +
      'background-image:url("data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'10\' height=\'6\'%3E%3Cpath d=\'M0 0l5 6 5-6z\' fill=\'%23888\'/%3E%3C/svg%3E");' +
      'background-repeat:no-repeat;background-position:right 12px center;padding-right:30px;}' +
      '.ds-dob select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(var(--accent-rgb),0.1);}' +
      '.ds-dob select:disabled{opacity:0.5;cursor:not-allowed;}' +
      '@media (max-width:380px){.ds-dob{grid-template-columns:1fr 1fr;}' +
      '.ds-dob select[data-part="year"]{grid-column:1 / -1;}}';
    document.head.appendChild(s);
  }

  function parseISO(str) {
    if (!str) return null;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str);
    if (!m) return null;
    return { y: +m[1], m: +m[2], d: +m[3] };
  }

  function daysInMonth(year, month) {
    // month is 1-based. Day 0 of the next month is the last day of this one.
    return new Date(year, month, 0).getDate();
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function fill(sel, options, keep) {
    var prev = keep != null ? keep : (sel.value === '' ? '' : +sel.value);
    sel.textContent = '';
    var ph = document.createElement('option');
    ph.value = '';
    ph.textContent = sel.getAttribute('data-placeholder');
    sel.appendChild(ph);
    var stillValid = false;
    options.forEach(function (o) {
      var op = document.createElement('option');
      op.value = String(o.value);
      op.textContent = o.label;
      sel.appendChild(op);
      if (o.value === prev) stillValid = true;
    });
    sel.value = stillValid ? String(prev) : '';
  }

  function attach(id) {
    var input = document.getElementById(id);
    if (!input || input.getAttribute('data-ds-dob') === '1') return null;

    injectStyle();

    // Read the bounds the page configured, then default them generously.
    var today = new Date();
    var min = parseISO(input.getAttribute('min'));
    var max = parseISO(input.getAttribute('max'));
    if (!min) {
      var o = new Date(); o.setFullYear(o.getFullYear() - 120);
      min = { y: o.getFullYear(), m: o.getMonth() + 1, d: o.getDate() };
    }
    if (!max) {
      max = { y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() };
    }

    var existing = parseISO(input.value);

    // The native picker and native min/max would fight the dropdowns.
    input.type = 'hidden';
    input.setAttribute('data-ds-dob', '1');

    var grid = document.createElement('div');
    grid.className = 'ds-dob';

    function mkSelect(part, label, placeholder) {
      var s = document.createElement('select');
      s.setAttribute('data-part', part);
      s.id = id + '-' + part;
      s.setAttribute('aria-label', label);
      s.setAttribute('data-placeholder', placeholder);
      s.autocomplete = 'bday-' + part;
      grid.appendChild(s);
      return s;
    }

    var selMonth = mkSelect('month', 'Birth month', 'Month');
    var selDay   = mkSelect('day',   'Birth day',   'Day');
    var selYear  = mkSelect('year',  'Birth year',  'Year');

    // Years newest-first: a 20-year-old scrolls a little, not 80 years.
    var years = [];
    for (var y = max.y; y >= min.y; y--) years.push({ value: y, label: String(y) });
    fill(selYear, years, existing ? existing.y : '');

    function rebuildMonths() {
      var yr = selYear.value === '' ? null : +selYear.value;
      var lo = (yr !== null && yr === min.y) ? min.m : 1;
      var hi = (yr !== null && yr === max.y) ? max.m : 12;
      var opts = [];
      for (var m = lo; m <= hi; m++) opts.push({ value: m, label: MONTHS[m - 1] });
      fill(selMonth, opts);
    }

    function rebuildDays() {
      var yr = selYear.value === '' ? null : +selYear.value;
      var mo = selMonth.value === '' ? null : +selMonth.value;
      if (mo === null) { fill(selDay, []); selDay.disabled = true; return; }
      selDay.disabled = false;
      // Leap years need a real year; assume a leap year until one is chosen so
      // Feb 29 stays selectable, then clamp once the year is known.
      var total = daysInMonth(yr === null ? 2000 : yr, mo);
      var lo = (yr !== null && yr === min.y && mo === min.m) ? min.d : 1;
      var hi = (yr !== null && yr === max.y && mo === max.m) ? Math.min(max.d, total) : total;
      var opts = [];
      for (var d = lo; d <= hi; d++) opts.push({ value: d, label: String(d) });
      fill(selDay, opts);
    }

    function sync() {
      var yr = selYear.value, mo = selMonth.value, dy = selDay.value;
      var next = (yr && mo && dy) ? yr + '-' + pad(mo) + '-' + pad(dy) : '';
      if (input.value !== next) {
        input.value = next;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }

    selYear.addEventListener('change', function () {
      rebuildMonths();
      rebuildDays();
      sync();
    });
    selMonth.addEventListener('change', function () { rebuildDays(); sync(); });
    selDay.addEventListener('change', sync);

    rebuildMonths();
    if (existing) selMonth.value = String(existing.m);
    rebuildDays();
    if (existing) selDay.value = String(existing.d);
    sync();

    // Hide the original control (and its icon wrapper, when it has one) and
    // put the dropdowns exactly where it sat.
    var host = (input.closest && input.closest('.input-wrap')) || input;
    if (host.parentNode) host.parentNode.insertBefore(grid, host.nextSibling);
    if (host !== input) host.style.display = 'none';

    return { month: selMonth, day: selDay, year: selYear, ids: [selMonth.id, selDay.id, selYear.id] };
  }

  window.DSDob = { attach: attach };
})();
