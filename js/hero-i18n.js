/* ── Hero language bridge (EN / اردو) — self-contained, hero-only ──
     Independent from Member Dashboard's MEMBER_I18N / shaoor_member_lang
     (see the member-dashboard script). Different localStorage key,
     different function/variable names, different element IDs — no
     interference either direction. Does not touch #memberDash. */
  var SHAOOR_HERO_I18N = {
    en: {
      badge: "Pakistan's Creative Arts Platform",
      titleHTML: 'WHERE ARTS<br><span class="gold-shimmer">TRANSFORM SOCIETY</span>',
      sub: "Ideas • Culture • Creativity • Community — across Pakistan.",
      cta1: "EXPLORE",
      cta2: "ENROLL",
      cta3: "JOIN SHAOOR"
    },
    ur: {
      badge: "پاکستان کا تخلیقی فن پلیٹ فارم",
      titleHTML: 'فنونِ لطیفہ<br><span class="gold-shimmer">سماج کی تبدیلی کا ذریعہ</span>',
      sub: "خیالات • ثقافت • تخلیقی صلاحیت • برادری — پورے پاکستان میں۔",
      cta1: "دیکھیں",
      cta2: "داخلہ لیں",
      cta3: "شعور میں شامل ہوں"
    }
  };

  function shaoorCurrentHeroLang() {
    try { return localStorage.getItem('shaoor_hero_lang') === 'ur' ? 'ur' : 'en'; }
    catch (e) { return 'en'; }
  }

  function shaoorSetHeroLang(lang) {
    lang = (lang === 'ur') ? 'ur' : 'en';
    var t = SHAOOR_HERO_I18N[lang];
    var copy = document.getElementById('heroCopy');
    var badge = document.getElementById('heroBadgeText');
    var title = document.getElementById('heroTitle');
    var sub = document.getElementById('heroSub');
    var cta1 = document.getElementById('heroCta1');
    var cta2 = document.getElementById('heroCta2');
    var cta3 = document.getElementById('heroCta3');
    var enBtn = document.getElementById('heroLangEnBtn');
    var urBtn = document.getElementById('heroLangUrBtn');

    if (badge) badge.textContent = t.badge;
    if (title) title.innerHTML = t.titleHTML;
    if (sub) sub.textContent = t.sub;
    if (cta1) cta1.textContent = t.cta1;
    if (cta2) cta2.textContent = t.cta2;
    if (cta3) cta3.textContent = t.cta3;

    if (copy) {
      copy.setAttribute('dir', lang === 'ur' ? 'rtl' : 'ltr');
      copy.setAttribute('lang', lang === 'ur' ? 'ur' : 'en');
      copy.classList.remove('hero-lang-swap');
      void copy.offsetWidth;
      copy.classList.add('hero-lang-swap');
    }
    // Apply the existing .lang-ur rule (Noto Nastaliq Urdu font) directly to
    // each text element — their own font-family is set with !important
    // elsewhere, so the class must be on the element itself, not just the
    // parent, for the font swap to actually take effect.
    [title, sub, badge, cta1, cta2, cta3].forEach(function (el) {
      if (!el) return;
      el.classList.toggle('lang-ur', lang === 'ur');
    });

    if (enBtn) { enBtn.classList.toggle('active', lang === 'en'); enBtn.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false'); }
    if (urBtn) { urBtn.classList.toggle('active', lang === 'ur'); urBtn.setAttribute('aria-pressed', lang === 'ur' ? 'true' : 'false'); }
    document.documentElement.setAttribute('lang', lang === 'ur' ? 'ur' : 'en');
    document.documentElement.setAttribute('dir', lang === 'ur' ? 'rtl' : 'ltr');
    document.querySelectorAll('[data-i18n-en]').forEach(function (el) {
      var en = el.getAttribute('data-i18n-en');
      var ur = el.getAttribute('data-i18n-ur') || en;
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') el.placeholder = (lang === 'ur' ? ur : en);
      else el.textContent = (lang === 'ur' ? ur : en);
    });
    if (typeof window.renderPublicFaq === 'function') window.renderPublicFaq();
    if (typeof window.renderPublicPayments === 'function') window.renderPublicPayments();
    document.querySelectorAll('.public-lang-btn').forEach(function (btn) {
      var on = btn.getAttribute('data-lang') === lang;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });

    try { localStorage.setItem('shaoor_hero_lang', lang); } catch (e) {}
  }

  (function () {
    var saved = shaoorCurrentHeroLang();
    if (saved === 'ur') { shaoorSetHeroLang('ur'); }
  })();
