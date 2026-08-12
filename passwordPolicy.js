/* ─────────────────────────────────────────────────────────────────────────
   DawnScribe — shared password policy (DSPassword)

   Single source of truth for password rules, used by BOTH the signup form
   (auth.html) and the reset-link form (settings.html). Those two used to
   enforce different rules — signup wanted 8 chars + "Fair" strength while
   reset accepted 6 chars and nothing else, which meant a user could
   downgrade past the signup bar via a reset link. Keep the rules here so
   the two doors can never drift apart again.

   IMPORTANT: this is client-side only, so it is a UX guardrail, not a
   security boundary. Anyone can call supabase.auth.signUp() directly and
   bypass all of it. The real enforcement is the password policy configured
   server-side in the Supabase dashboard (Authentication -> Sign In /
   Providers -> Email). Set the minimum length there to 10 to match
   MIN_LENGTH, otherwise a direct API call can still create an 8-char password.

   Leaked-password checking against HaveIBeenPwned is a Supabase Pro
   feature and is NOT available on the free plan, which is why COMMON below
   exists: a short local blocklist of the passwords that credential-stuffing
   lists hit first. It is a small slice of HIBP, not a replacement for it.
   ───────────────────────────────────────────────────────────────────────── */
(function (global) {
  'use strict';

  var MIN_LENGTH = 10;
  var MIN_STRENGTH = 2; // "Fair" on the 0-4 scale below

  // The ~60 passwords that dominate public breach corpora, plus the
  // DawnScribe-specific guesses an attacker would obviously try. Stored
  // lowercase; comparison is case-insensitive because capitalising the first
  // letter of a common password provides no real protection.
  var COMMON = [
    '123456', '123456789', '12345678', '1234567890', '12345', '1234567',
    'password', 'password1', 'password123', 'passw0rd', 'p@ssword',
    'qwerty', 'qwerty123', 'qwertyuiop', 'asdfghjkl', '1q2w3e4r', 'zaq12wsx',
    'iloveyou', 'princess', 'sunshine', 'welcome', 'welcome1', 'admin',
    'administrator', 'letmein', 'monkey', 'dragon', 'football', 'baseball',
    'superman', 'batman', 'trustno1', 'starwars', 'pokemon', 'naruto',
    'michael', 'jennifer', 'jordan', 'shadow', 'master', 'hunter',
    'freedom', 'whatever', 'abc123', 'abcd1234', 'a1b2c3d4', '111111',
    '000000', '654321', '121212', '696969', 'zxcvbnm', 'asdfgh',
    'changeme', 'secret', 'login', 'test123', 'guest', 'default',
    'dawnscribe', 'dawnscribe1', 'dawnscribe123'
  ];

  /**
   * 0-4 strength score.
   *
   * Length is TIERED rather than a single point at 8. A long passphrase is
   * genuinely stronger than a short password with mixed character classes —
   * "correcthorsebatterystaple" beats "Passw0rd" by a wide margin — but flat
   * composition scoring rejected the passphrase and accepted the top-100
   * leaked password. Tiering lets length alone clear the bar, which is what
   * we actually want users reaching for.
   */
  function strength(val) {
    val = String(val == null ? '' : val);
    var s = 0;
    if (val.length >= 10) s++;
    if (val.length >= 14) s++;
    if (val.length >= 18) s++;
    if (/[A-Z]/.test(val)) s++;
    if (/[0-9]/.test(val)) s++;
    if (/[^A-Za-z0-9]/.test(val)) s++;
    return Math.min(4, s);
  }

  /** True when the password is on the local common/leaked blocklist. */
  function isCommon(val) {
    var v = String(val == null ? '' : val).toLowerCase().trim();
    if (!v) return false;
    if (COMMON.indexOf(v) !== -1) return true;
    // Catch the trivial "append a digit or bang" dodge: password1! -> password
    var stripped = v.replace(/[0-9!@#$%^&*_.\-]+$/, '');
    return stripped.length >= 4 && COMMON.indexOf(stripped) !== -1;
  }

  var LEVELS = [
    { width: '0%',   color: 'transparent', label: '' },
    { width: '25%',  color: '#f87171',     label: 'Weak' },
    { width: '50%',  color: '#f59e0b',     label: 'Fair' },
    { width: '75%',  color: '#60a5fa',     label: 'Good' },
    { width: '100%', color: '#34d399',     label: 'Strong' }
  ];

  /**
   * Validate a password (and optionally its confirmation).
   * Returns { ok: true } or { ok: false, error: '<message for the user>' }.
   * Order matters: the blocklist is checked BEFORE strength so someone
   * typing "Password123!" gets told it is a known password rather than
   * being told it is strong enough.
   */
  function validate(pw, confirm) {
    pw = String(pw == null ? '' : pw);

    if (!pw) {
      return { ok: false, error: 'Please enter a password.' };
    }
    if (pw.length < MIN_LENGTH) {
      return { ok: false, error: 'Password must be at least ' + MIN_LENGTH + ' characters.' };
    }
    if (isCommon(pw)) {
      return { ok: false, error: 'That password appears in known data breaches and is one of the first an attacker will try. Please choose something else.' };
    }
    if (arguments.length > 1 && pw !== String(confirm == null ? '' : confirm)) {
      return { ok: false, error: 'Passwords do not match.' };
    }
    if (strength(pw) < MIN_STRENGTH) {
      return { ok: false, error: 'Password is too weak. Make it longer, or add a number, uppercase letter, or symbol.' };
    }
    return { ok: true };
  }

  global.DSPassword = {
    MIN_LENGTH: MIN_LENGTH,
    MIN_STRENGTH: MIN_STRENGTH,
    LEVELS: LEVELS,
    strength: strength,
    isCommon: isCommon,
    validate: validate
  };
})(typeof window !== 'undefined' ? window : this);
