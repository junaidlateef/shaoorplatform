/* ── THEME ── */
  const html2 = document.documentElement;
  const themeBtn  = document.getElementById('themeBtn');
  const themeIcon = document.getElementById('themeIcon');
  const saved = localStorage.getItem('shaoor-theme');
  const dark  = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme:dark)').matches);
  if (dark) { html2.setAttribute('data-theme','dark'); themeIcon.className = 'fas fa-sun'; }

  themeBtn.addEventListener('click', () => {
    const isDark = html2.getAttribute('data-theme') === 'dark';
    html2.setAttribute('data-theme', isDark ? 'light' : 'dark');
    themeIcon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
    localStorage.setItem('shaoor-theme', isDark ? 'light' : 'dark');
  });

  /* ── NAVBAR SCROLL ── */
  window.addEventListener('scroll', () => {
    document.getElementById('navbar').classList.toggle('scrolled', window.scrollY > 20);
  });

  /* ── MOBILE NAV ── */
  const mobileNav = document.getElementById('mobileNav');
  const overlay   = document.getElementById('overlay');
  const hamburger = document.getElementById('hamburger');

  function openMobileNav() {
    mobileNav.classList.add('open');
    overlay.classList.add('show');
    hamburger.setAttribute('aria-expanded','true');
    document.body.style.overflow = 'hidden';
  }
  function closeMobileNav() {
    mobileNav.classList.remove('open');
    overlay.classList.remove('show');
    hamburger.setAttribute('aria-expanded','false');
    document.body.style.overflow = '';
  }
  hamburger.addEventListener('click', () =>
    mobileNav.classList.contains('open') ? closeMobileNav() : openMobileNav()
  );
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeMobileNav(); closeAllModals(); }
  });

  /* ── MODALS ── */
  function openModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('open');
    document.body.style.overflow = '';
  }
  function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => m.classList.remove('open'));
    document.body.style.overflow = '';
  }
  document.querySelectorAll('.modal').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
  });

  /* ════════════════════════════════════════
     SHAOOR SECURITY LAYER
     XSS Protection | Input Sanitization
     Rate Limiting | CSRF Token
  ════════════════════════════════════════ */

  // ── CSRF Token (simulate for frontend protection) ──
  const CSRF_TOKEN = (() => {
    let t = sessionStorage.getItem('shaoor_csrf');
    if (!t) {
      t = Array.from(crypto.getRandomValues(new Uint8Array(24)))
              .map(b => b.toString(16).padStart(2,'0')).join('');
      sessionStorage.setItem('shaoor_csrf', t);
    }
    return t;
  })();

  // Staff roles accepted by Admin Login. Frontend checks are defense-in-depth only;
  // database RLS remains the real authorization boundary.
  const STAFF_ROLES = ['founder', 'admin', 'general_secretary', 'treasurer', 'media_coordinator', 'verification_officer'];
  async function requireStaff() {
    try {
      const { data: userData } = await sb.auth.getUser();
      const uid = userData && userData.user && userData.user.id;
      if (!uid) { showToast('Admin access required', 'error'); return null; }
      const { data: profile } = await sb.from('profiles').select('id, role, status, full_name').eq('id', uid).maybeSingle();
      if (!profile || STAFF_ROLES.indexOf(profile.role) === -1 || profile.status !== 'active') {
        showToast('Admin access required', 'error');
        return null;
      }
      return profile;
    } catch (e) {
      showToast('Admin access required', 'error');
      return null;
    }
  }
  function isSafeHttpUrl(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const u = new URL(url, window.location.origin);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch (e) { return false; }
  }
  function safeCssUrl(url) {
    if (!isSafeHttpUrl(url) && !(typeof url === 'string' && url.indexOf('data:image/') === 0)) return '';
    return String(url).replace(/['"\\]/g, '');
  }

  // ── XSS — Sanitize any input before use ──
  function sanitize(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  }

  // ── Rate Limiter ──
  const rateLimiter = (() => {
    const map = {};
    return {
      check(key, maxAttempts = 5, windowMs = 60000) {
        const now = Date.now();
        if (!map[key]) map[key] = { count: 0, start: now };
        if (now - map[key].start > windowMs) {
          map[key] = { count: 0, start: now };
        }
        map[key].count++;
        if (map[key].count > maxAttempts) {
          const wait = Math.ceil((windowMs - (now - map[key].start)) / 1000);
          return { allowed: false, wait };
        }
        return { allowed: true };
      }
    };
  })();

  // ── Validate email format ──
  function isValidEmail(email) {
    return /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/.test(email.trim());
  }

  // ── Validate Pakistani phone ──
  function isValidPhone(phone) {
    return /^(\+92|0)(3[0-9]{2})[0-9]{7}$/.test(phone.replace(/\s/g,''));
  }

  // ── Honeypot check (anti-bot hidden field) ──
  function checkHoneypot(formEl) {
    const hp = formEl.querySelector('[name="website_url"]');
    return hp && hp.value !== '';  // true = bot
  }

  // ── Secure form handler ──
  // Admin content-management forms (adding lessons/quizzes/questions/etc. one after
  // another is normal, legitimate, rapid usage) get a much looser rate limit than
  // public-facing forms (login/signup/contact — the actual bot/abuse targets). The old
  // single hardcoded 3-per-2min limit applied to ALL forms was silently blocking admins
  // mid-session when adding several questions in a row, with only a toast (easy to miss)
  // as evidence — no data-loss dialog, no console error.
  const ADMIN_FORM_RATE_LIMIT = { max: 30, windowMs: 120000 };
  const ADMIN_FORM_IDS = ['questionForm', 'quizForm', 'finalAssessmentForm', 'lessonForm', 'moduleForm', 'courseForm', 'liveSessionForm', 'blogForm', 'mediaLinkForm', 'eventForm', 'societyForm', 'chapterForm'];
  function secureSubmit(formId, onSuccess) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();

      // Rate limit per form
      const isAdminForm = ADMIN_FORM_IDS.includes(formId);
      const rl = isAdminForm
        ? rateLimiter.check('form_' + formId, ADMIN_FORM_RATE_LIMIT.max, ADMIN_FORM_RATE_LIMIT.windowMs)
        : rateLimiter.check('form_' + formId, 3, 120000);
      if (!rl.allowed) {
        showToast(`بہت زیادہ کوشش — ${rl.wait} سیکنڈ انتظار کریں`, 'error');
        return;
      }

      // Honeypot check
      if (checkHoneypot(form)) return; // silently drop bot

      // Sanitize all inputs EXCEPT passwords — passwords must never be rewritten,
      // or they will silently stop matching what the user actually typed.
      const inputs = form.querySelectorAll('input, textarea, select');
      let valid = true;
      inputs.forEach(inp => {
        if (inp.name === 'website_url') return;
        if (inp.type === 'password') return;
        if (inp.type === 'file') return; // file inputs' value cannot be reassigned — attempting to throws and silently blocks submission
        // URLs must never be HTML-escaped: sanitize() turns '/' into '&#x2F;', which
        // corrupted every saved link (https:&#x2F;&#x2F;youtube.com&#x2F;... instead of
        // https://youtube.com/...) and made them all 404. URL fields are safe to store
        // as-is — they go into href="" / iframe src="" attributes, never rendered as
        // raw HTML text, so there is no XSS risk here.
        if (inp.type === 'url') return;
        inp.value = sanitize(inp.value);

        // Required-field check — forms now use novalidate, so this replaces native
        // browser validation (which some sandboxed/preview iframes render invisibly,
        // making the form look like it silently does nothing on submit).
        if (inp.hasAttribute('required') && inp.type !== 'file' && !inp.value.trim()) {
          inp.style.borderColor = 'var(--ruby)';
          valid = false;
        }

        // Email validation
        if (inp.type === 'email' && inp.value && !isValidEmail(inp.value)) {
          inp.style.borderColor = 'var(--ruby)';
          valid = false;
          showToast('درست ای میل درج کریں', 'error');
        } else if (inp.value.trim() || !inp.hasAttribute('required')) {
          inp.style.borderColor = '';
        }
      });
      if (!valid) showToast('براہ کرم تمام لازمی خانے (*) پُر کریں', 'error');

      if (valid) {
        // Any error thrown inside onSuccess — sync or from a rejected async/await
        // chain — used to vanish silently (no toast, no console noise a user would
        // notice, modal just sits there). That is the "بالکل کچھ نہیں ہوتا" symptom.
        // Now it always surfaces.
        try {
          const result = onSuccess(form);
          if (result && typeof result.catch === 'function') {
            result.catch(err => {
              console.error('[secureSubmit:' + formId + ']', err);
              showToast('خرابی: ' + (err?.message || String(err)), 'error');
            });
          }
        } catch (err) {
          console.error('[secureSubmit:' + formId + ']', err);
          showToast('خرابی: ' + (err?.message || String(err)), 'error');
        }
      }
    });
  }

  // ── Enhanced toast with type ──
  function showToast(msg, type = 'success') {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.style.borderLeftColor = type === 'error' ? 'var(--ruby)' : 'var(--gold)';
    t.classList.add('show');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.remove('show'), 3800);
  }

  // ── Apply secure handlers to all forms ──
  // Social sign-in / sign-up (Facebook, Google). This ONLY works once the provider is enabled
  // in Supabase Dashboard → Authentication → Providers, with that provider's own App ID/Secret
  // and the Supabase callback URL registered on Facebook/Google's side. Until then it will
  // return an error like "Unsupported provider" — that is expected, not a bug in this code.
  window.socialAuth = async function (provider) {
    // Marker read on the return leg (see the OAuth-return handler further below) so the
    // member lands back inside their portal instead of a signed-in but empty homepage.
    try { sessionStorage.setItem('shaoor_oauth_pending', provider); } catch (e) {}
    const { error } = await sb.auth.signInWithOAuth({
      provider: provider,
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) {
      try { sessionStorage.removeItem('shaoor_oauth_pending'); } catch (e) {}
      alert('Could not start ' + provider + ' sign-in: ' + error.message +
        (error.message && error.message.toLowerCase().includes('provider') ? '\n\n(This provider may not be enabled yet in the Supabase dashboard.)' : ''));
    }
    // On success the browser is redirected to the provider, then back here — no further
    // code runs in this call. Profile completion (phone, society, etc.) after a social
    // sign-in should be handled the next time the member opens their dashboard.
  };

  secureSubmit('loginForm', async frm => {
    const email = frm.querySelector('#lEmail').value.trim();
    const password = frm.querySelector('#lPass').value;
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
      showToast('غلط ای میل یا پاس ورڈ', 'error');
      return;
    }
    closeModal('loginModal');
    if (lmsPendingEnrollCourseId) {
      lmsPendingEnrollCourseId = null;
      await enrollInCourse(); // resume the enrollment they were trying to do before signing in
    } else {
      await openMemberDashboard(data.user.id);
    }
  });

  async function openMemberDashboard(userId) {
    const { data: profileRow, error } = await sb
      .from('profiles')
      .select('full_name, member_id, role, status, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    const { data: userData } = await sb.auth.getUser();
    const email = userData?.user?.email || '';

    let profile = profileRow;

    /* Social sign-in (Google/Facebook) can return an authenticated user who has no
       profiles row yet — .single() used to throw here and the dashboard never opened.
       We now create that row once from the provider's own metadata, using ONLY
       columns that already exist. If the insert is blocked (RLS), we still open the
       dashboard read-only instead of leaving the member on a blank screen. */
    if (error || !profile) {
      const meta = (userData && userData.user && userData.user.user_metadata) || {};
      const fallbackName   = meta.full_name || meta.name || (email ? email.split('@')[0] : 'Member');
      const fallbackAvatar = meta.avatar_url || meta.picture || null;
      try {
        const { data: created } = await sb.from('profiles')
          .insert({ id: userId, full_name: fallbackName, role: 'member', status: 'pending', avatar_url: fallbackAvatar })
          .select('full_name, member_id, role, status, avatar_url')
          .single();
        if (created) profile = created;
      } catch (e) { console.warn('SHAOOR: profile self-heal skipped:', e && e.message); }
      if (!profile) {
        console.error('Profile load failed:', error);
        profile = { full_name: fallbackName, member_id: null, role: 'member', status: 'pending', avatar_url: fallbackAvatar };
        showToast('پروفائل مکمل نہیں — بنیادی معلومات دکھائی جا رہی ہیں۔', 'error');
      }
    }

    /* Google/Facebook photo: only used when the profile has no avatar of its own.
       The member can still change it any time from the existing avatarInput uploader. */
    if (!profile.avatar_url) {
      const meta2 = (userData && userData.user && userData.user.user_metadata) || {};
      const providerPic = meta2.avatar_url || meta2.picture || null;
      if (providerPic) {
        profile.avatar_url = providerPic;
        try { await sb.from('profiles').update({ avatar_url: providerPic }).eq('id', userId); } catch (e) {}
      }
    }

    document.getElementById('dashMemberName').textContent = profile.full_name || 'Member';
    document.getElementById('mdName').textContent = profile.full_name || '—';
    document.getElementById('mdMemberId').textContent = profile.member_id || '—';
    document.getElementById('mdEmail').textContent = email || '—';
    document.getElementById('mdRole').textContent = profile.role || '—';
    const mdStatusEl = document.getElementById('mdStatus');
    mdStatusEl.textContent = profile.status || '—';
    mdStatusEl.classList.remove('is-active','is-pending','is-inactive','is-suspended');
    if (profile.status) mdStatusEl.classList.add('is-' + String(profile.status).toLowerCase());

    /* Show avatar if one is already set */
    const avatarImg = document.getElementById('mdAvatarImg');
    const avatarPlaceholder = document.getElementById('mdAvatarPlaceholder');
    if (profile.avatar_url) {
      avatarImg.src = profile.avatar_url;
      avatarImg.style.display = 'block';
      avatarPlaceholder.style.display = 'none';
    } else {
      avatarImg.style.display = 'none';
      avatarPlaceholder.style.display = 'flex';
    }

    document.getElementById('memberDash').classList.add('open');
    document.body.style.overflow = 'hidden';
    showToast('خوش آمدید، ' + (profile.full_name || 'Member') + '!');

    loadMyCertificates(userId);
    loadMyDocuments(userId);
    loadMyLearning(userId);
    loadMyEventsAttendance(userId);
    loadMembershipPanel(userId);
    applyMemberLang();
  }
  window.openMemberDashboard = openMemberDashboard;

  /* Membership Status / Tier / Society boxes already existed in the dashboard markup
     (mdMembershipStatus / mdMembershipTier / mdMemberSociety) but were never filled,
     because the only code that filled them wrapped window.openMemberDashboard — which
     did not exist at that point. The logic now lives here and is called directly. */
  async function loadMembershipPanel(userId) {
    try {
      const statusEl = document.getElementById('mdMembershipStatus');
      const tierEl   = document.getElementById('mdMembershipTier');
      const socEl    = document.getElementById('mdMemberSociety');
      if (!statusEl && !tierEl && !socEl) return;

      const { data: p } = await sb
        .from('profiles')
        .select('membership_type, society_id, chapter_id, status')
        .eq('id', userId)
        .maybeSingle();
      if (!p) return;

      let societyName = '', chapterName = '';
      if (p.society_id) {
        const { data: soc } = await sb.from('societies').select('name').eq('id', p.society_id).maybeSingle();
        societyName = soc ? soc.name : '';
      }
      if (p.chapter_id) {
        const { data: chap } = await sb.from('chapters').select('name').eq('id', p.chapter_id).maybeSingle();
        chapterName = chap ? chap.name : '';
      }

      if (tierEl) tierEl.textContent = p.membership_type || '—';
      if (socEl)  socEl.textContent  = (societyName + (chapterName ? ' · ' + chapterName : '')) || '—';
      if (statusEl) {
        statusEl.textContent = p.status || '—';
        const st = (p.status || '').toLowerCase();
        statusEl.className = '';
        if (st === 'active' || st === 'approved') {
          statusEl.style.cssText = 'color:#2d8a70;background:rgba(45,138,112,.10);padding:.2rem .6rem;border-radius:999px;font-weight:700;font-size:.82rem;';
        } else if (st === 'pending') {
          statusEl.style.cssText = 'color:#9B6800;background:rgba(155,104,0,.10);padding:.2rem .6rem;border-radius:999px;font-weight:700;font-size:.82rem;';
        } else {
          statusEl.style.cssText = 'color:var(--muted);font-size:.88rem;';
        }
      }
    } catch (e) { console.warn('Membership panel load failed:', e && e.message); }
  }

  /* ── Events / Self Attendance ── */
  async function loadMyEventsAttendance(userId) {
    const wrap = document.getElementById('myEventsAttendanceList');
    if (!wrap) return;
    try {
      const [{ data: events, error: evErr }, { data: myAttendance, error: attErr }] = await Promise.all([
        sb.from('events').select('id, title, event_date').order('event_date', { ascending: false }).limit(20),
        sb.from('event_attendance').select('event_id').eq('member_id', userId)
      ]);
      if (evErr) throw evErr;
      const markedIds = new Set((myAttendance || []).map(a => a.event_id));
      const list = events || [];
      if (list.length === 0) {
        wrap.innerHTML = '<div style="color:var(--muted);font-size:.9rem;text-align:center;padding:1rem;">فی الحال کوئی پروگرام موجود نہیں۔</div>';
        return;
      }
      wrap.innerHTML = list.map(ev => {
        const isMarked = markedIds.has(ev.id);
        const dateStr = ev.event_date ? new Date(ev.event_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
        return `<div style="display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.85rem 1rem;border:1px solid var(--border);border-radius:10px;">
          <div>
            <div style="font-weight:600;">${(ev.title || '').replace(/</g,'&lt;')}</div>
            <div style="font-size:.78rem;color:var(--muted);">${dateStr}</div>
          </div>
          ${isMarked
            ? '<span style="color:#15803d;font-weight:600;font-size:.85rem;white-space:nowrap;"><i class="fas fa-check-circle"></i> حاضر</span>'
            : `<button class="btn btn-gold" style="padding:.4rem .9rem;font-size:.8rem;white-space:nowrap;" onclick="markMyAttendance('${ev.id}', this)">Present</button>`}
        </div>`;
      }).join('');
    } catch (err) {
      console.error('Events attendance load error:', err);
      wrap.innerHTML = '<div style="color:var(--muted);font-size:.9rem;text-align:center;padding:1rem;">لوڈ نہیں ہو سکا۔</div>';
    }
  }

  window.markMyAttendance = async function(eventId, btnEl) {
    const { data: userData } = await sb.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return;
    if (btnEl) { btnEl.disabled = true; btnEl.textContent = '...'; }
    const { error } = await sb.from('event_attendance').insert({ event_id: eventId, member_id: userId });
    if (error) {
      showToast('حاضری لگانا ناکام: ' + error.message, 'error');
      if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Present'; }
      return;
    }
    showToast('حاضری کامیابی سے لگ گئی۔');
    if (btnEl) {
      const wrap = btnEl.parentElement;
      wrap.innerHTML = '<span style="color:#15803d;font-weight:600;font-size:.85rem;white-space:nowrap;"><i class="fas fa-check-circle"></i> حاضر</span>';
    }
  };

  /* ── Avatar upload ── */
  const avatarInput = document.getElementById('avatarInput');
  if (avatarInput) {
    avatarInput.addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;

      const statusEl = document.getElementById('avatarStatus');

      // Validate type and size (max 3MB)
      const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        showToast('صرف PNG, JPG, یا WEBP تصویر منتخب کریں', 'error');
        return;
      }
      if (file.size > 3 * 1024 * 1024) {
        showToast('تصویر 3MB سے چھوٹی ہونی چاہیے', 'error');
        return;
      }

      const { data: userData } = await sb.auth.getUser();
      const userId = userData?.user?.id;
      if (!userId) return;

      statusEl.textContent = 'اپلوڈ ہو رہا ہے…';

      const ext = file.name.split('.').pop();
      const filePath = `${userId}/avatar.${ext}`;

      const { error: uploadError } = await sb.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true, cacheControl: '3600' });

      if (uploadError) {
        console.error('Avatar upload failed:', uploadError);
        statusEl.textContent = '';
        showToast('اپلوڈ ناکام: ' + uploadError.message, 'error');
        return;
      }

      const { data: publicUrlData } = sb.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl + '?t=' + Date.now(); // cache-bust

      const { error: updateError } = await sb
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

      if (updateError) {
        console.error('Profile update failed:', updateError);
        statusEl.textContent = '';
        showToast('پروفائل اپڈیٹ ناکام: ' + updateError.message, 'error');
        return;
      }

      document.getElementById('mdAvatarImg').src = publicUrl;
      document.getElementById('mdAvatarImg').style.display = 'block';
      document.getElementById('mdAvatarPlaceholder').style.display = 'none';
      statusEl.textContent = '';
      showToast('پروفائل تصویر کامیابی سے اپڈیٹ ہو گئی!');
    });
  }

  async function memberLogout() {
    await sb.auth.signOut();
    document.getElementById('memberDash').classList.remove('open');
    document.body.style.overflow = '';
    showToast('Logged out successfully');
  }

  /* ── Member interface language switcher (EN / Urdu) ──
     Frontend-only localization, scoped entirely to #memberDash. No backend/database
     translation table, no new columns — this only swaps displayed text in the browser.
     Never touches actual record values (names, member IDs, cert/doc numbers, emails,
     URLs) — those are always rendered as-is from the database regardless of language. */
  var MEMBER_I18N = {
    en: {
      welcome: 'Welcome, ', logout: 'Logout',
      my_profile: 'My Profile', change_photo: 'Change Photo',
      full_name: 'Full Name', member_id: 'SHAOOR Member ID', email: 'Email',
      role: 'Role', account_status: 'Account Status',
      membership_heading: 'Membership Details',
      membership_status: 'Membership Status', membership_tier: 'Membership Tier',
      society_chapter: 'Society / Chapter',
      view_id_card: 'View Digital ID Card',
      my_certificates: 'My Certificates', my_documents: 'My Documents',
      my_learning: 'My Learning', events_attendance: 'Events — Attendance',
      view: 'View', download: 'Download', loading: 'Loading…',
      no_docs: 'No documents available yet.', no_certs: 'No certificates issued yet.'
    },
    ur: {
      welcome: 'خوش آمدید، ', logout: 'لاگ آؤٹ',
      my_profile: 'میری پروفائل', change_photo: 'تصویر تبدیل کریں',
      full_name: 'پورا نام', member_id: 'شعور ممبر آئی ڈی', email: 'ای میل',
      role: 'عہدہ', account_status: 'اکاؤنٹ کی حیثیت',
      membership_heading: 'رکنیت کی تفصیل',
      membership_status: 'رکنیت کی حیثیت', membership_tier: 'رکنیت کا درجہ',
      society_chapter: 'سوسائٹی / چیپٹر',
      view_id_card: 'ڈیجیٹل آئی ڈی کارڈ دیکھیں',
      my_certificates: 'میرے سرٹیفکیٹس', my_documents: 'میری دستاویزات',
      my_learning: 'میری تعلیم', events_attendance: 'پروگرام — حاضری',
      view: 'دیکھیں', download: 'ڈاؤن لوڈ', loading: 'لوڈ ہو رہا ہے…',
      no_docs: 'ابھی کوئی دستاویز جاری نہیں ہوئی۔', no_certs: 'ابھی کوئی سرٹیفکیٹ جاری نہیں ہوا۔'
    }
  };

  function currentMemberLang() {
    try { return localStorage.getItem('shaoor_member_lang') === 'ur' ? 'ur' : 'en'; }
    catch (e) { return 'en'; }
  }

  // Used by dynamically-rendered lists (documents/certificates) so their buttons and
  // empty-states follow the active language too, not just the static markup.
  function t(key) {
    var lang = currentMemberLang();
    return (MEMBER_I18N[lang] && MEMBER_I18N[lang][key]) || (MEMBER_I18N.en[key] || key);
  }

  function applyMemberLang() {
    var lang = currentMemberLang();
    var dict = MEMBER_I18N[lang];
    var dash = document.getElementById('memberDash');
    if (!dash) return;
    dash.setAttribute('dir', lang === 'ur' ? 'rtl' : 'ltr');
    dash.setAttribute('lang', lang === 'ur' ? 'ur' : 'en');
    dash.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (key === 'welcome') {
        // Keep the member's real name (a <strong> child) untouched — only the
        // surrounding greeting text is translated.
        var strong = el.querySelector('strong');
        el.textContent = dict.welcome || key;
        if (strong) el.appendChild(strong);
      } else if (dict[key]) {
        el.textContent = dict[key];
      }
    });
    var btnEn = document.getElementById('langBtnEn');
    var btnUr = document.getElementById('langBtnUr');
    if (btnEn) { btnEn.classList.toggle('active', lang === 'en'); btnEn.setAttribute('aria-pressed', lang === 'en' ? 'true' : 'false'); }
    if (btnUr) { btnUr.classList.toggle('active', lang === 'ur'); btnUr.setAttribute('aria-pressed', lang === 'ur' ? 'true' : 'false'); }
    // Re-render the dynamic lists so their in-language strings (View/Download/empty
    // states) refresh immediately, without re-fetching from Supabase.
    if (window._lastMyDocsUserId) loadMyDocuments(window._lastMyDocsUserId);
    if (window._lastMyCertsUserId) loadMyCertificates(window._lastMyCertsUserId);
  }

  window.setMemberLang = function (lang) {
    try { localStorage.setItem('shaoor_member_lang', lang === 'ur' ? 'ur' : 'en'); } catch (e) {}
    applyMemberLang();
  };

  /* ── Shared renderer: populates the ID card modal for a given profile row, applies the
     active default card_templates design (front/back), and opens the modal.
     Used by both the logged-in member's "My ID Card" action AND the public ?verify=MEMBER_ID
     flow, so a public visitor sees the same card design a member would. ── */
  /* Applies a card_templates.config JSON block to the rendered card. Every key is optional and
     falls back to the existing hardcoded look, so old templates (config = null) keep working. */
  function applyCardConfig(cardBox, cfg, brand) {
    cfg = cfg || {};
    const front = cfg.front || {};
    // Canonical contract is fields.{name,qr,...} + front.*. Live v2 rows also store
    // identity.*.hidden; applying those hidden flags would blank the production card
    // (current renderer previously ignored them). Keep identity.hidden as unused v2
    // dialect. Language/orientation/front/fields from either editor or live still apply.
    const fields = cfg.fields || {};

    // Size / orientation (screen preview only — see paperPageCss-based print/PDF for physical size)
    if (cfg.width) cardBox.style.maxWidth = cfg.width + 'px';
    if (cfg.orientation === 'landscape') cardBox.style.aspectRatio = '1.586/1';
    if (cfg.orientation === 'portrait') cardBox.style.aspectRatio = '1/1.586';

    if (front.bgColor) cardBox.style.background = front.bgColor;
    if (front.borderColor) cardBox.style.border = '2px solid ' + front.borderColor;
    if (front.textColor) cardBox.style.color = front.textColor;
    if (front.fontFamily) cardBox.style.fontFamily = front.fontFamily;

    // Logo — sourced from brand.logo_url, never a template-uploaded/hardcoded image
    const logoEl = document.getElementById('idLogoImg');
    const orgNameEl = document.getElementById('idOrgName');
    const watermarkLogoEl = document.getElementById('idWatermarkLogo');
    const watermarkIconEl = document.getElementById('idWatermarkIcon');
    if (brand && brand.logo_url) {
      logoEl.src = brand.logo_url;
      logoEl.style.display = '';
      if (front.logoSize) { logoEl.style.width = front.logoSize + 'px'; logoEl.style.height = front.logoSize + 'px'; }
      orgNameEl.style.display = 'none';
      // Decorative right-side watermark mirrors the same real logo asset — no new image is added.
      if (watermarkLogoEl) { watermarkLogoEl.src = brand.logo_url; watermarkLogoEl.style.display = ''; }
      if (watermarkIconEl) watermarkIconEl.style.display = 'none';
    } else {
      logoEl.style.display = 'none';
      orgNameEl.style.display = '';
      orgNameEl.textContent = (brand && brand.organization_name) || 'SHAOOR';
      // No logo asset configured yet — fall back to the generic book icon already in the markup.
      if (watermarkLogoEl) watermarkLogoEl.style.display = 'none';
      if (watermarkIconEl) watermarkIconEl.style.display = '';
    }

    // Seal — only rendered if the template explicitly enables it, sourced from brand.seal_url
    const sealEl = document.getElementById('idSealImg');
    if (front.sealEnabled && brand && brand.seal_url) {
      sealEl.src = brand.seal_url;
      sealEl.style.display = '';
      if (front.sealSize) { sealEl.style.width = front.sealSize + 'px'; sealEl.style.height = front.sealSize + 'px'; }
    } else {
      sealEl.style.display = 'none';
    }

    // Member photo controls
    const avatarImg = document.getElementById('idAvatarImg');
    const avatarPh = document.getElementById('idAvatarPlaceholder');
    const photoSize = front.photoSize || 80;
    [avatarImg, avatarPh].forEach(el => { el.style.width = photoSize + 'px'; el.style.height = photoSize + 'px'; });
    if (front.photoRadius != null) { avatarImg.style.borderRadius = front.photoRadius; avatarPh.style.borderRadius = front.photoRadius; }
    if (front.photoFit) avatarImg.style.objectFit = front.photoFit;

    // Per-field visibility + font size (name, role, society, chapter, province,
    // membershipType, status). 'idMemberId' is intentionally no longer in the DOM — the
    // right-side idMemberIdPanel is the single visible Member ID — so getElementById can
    // legitimately return null here; guard against that.
    ['idName', 'idMemberId', 'idRole', 'idSociety', 'idChapter', 'idProvince', 'idMembershipType', 'idStatus'].forEach(id => {
      const key = id.replace('id', '');
      const fkey = key.charAt(0).toLowerCase() + key.slice(1);
      const el = document.getElementById(id);
      if (!el) return;
      const conf = fields[fkey];
      if (!conf) return;
      if (conf.hidden) { el.style.display = 'none'; return; }
      el.style.display = '';
      if (conf.fontSize) el.style.fontSize = conf.fontSize + 'px';
      if (conf.align) el.style.textAlign = conf.align;
    });

    // QR size (position is handled by DOM order for now — a template with qr.hidden simply omits it)
    const qrContainer = document.getElementById('idQrCode');
    if (fields.qr && fields.qr.hidden) {
      qrContainer.style.display = 'none';
    } else {
      qrContainer.style.display = '';
      if (fields.qr && fields.qr.size) qrContainer.style.width = qrContainer.style.height = fields.qr.size + 'px';
    }

    // Language / RTL — reuses the app-wide .lang-ur class + Noto Nastaliq Urdu font, same as certificates
    if (cfg.language === 'ur') {
      cardBox.classList.add('lang-ur');
      cardBox.style.fontFamily = 'var(--ff-urdu)';
    } else {
      cardBox.classList.remove('lang-ur');
    }
    // Member ID / QR verification URL must stay LTR-safe even inside an RTL card — applies to
    // the single visible right-side Member ID panel.
    const idMemberIdPanelDirEl = document.getElementById('idMemberIdPanel');
    if (idMemberIdPanelDirEl) {
      idMemberIdPanelDirEl.style.direction = 'ltr';
      idMemberIdPanelDirEl.style.unicodeBidi = 'embed';
    }

    // Founder signature — sourced from the EXISTING brand_settings.founder_signature_url /
    // founder_name (same fields used by certificates). Never invented; hidden gracefully if unset.
    const founderSigEl = document.getElementById('idFounderSigImg');
    const founderNameEl = document.getElementById('idFounderName');
    if (brand && brand.founder_signature_url) {
      founderSigEl.src = brand.founder_signature_url;
      founderSigEl.style.display = '';
    } else if (founderSigEl) {
      founderSigEl.style.display = 'none';
    }
    if (founderNameEl) founderNameEl.textContent = (brand && brand.founder_name) || '';
  }

  /* Shared renderer: populates the ID card modal for a given profile row, applies the
     active default card_templates design (front/back) and its config JSON, and opens the modal.
     Used by both the logged-in member's "My ID Card" action AND the public ?verify=MEMBER_ID
     flow, admin preview, print and PDF — this is the single canonical card renderer; do not
     duplicate this logic elsewhere. */
  var _cardRenderToken = 0;
  async function renderIdCard(profile, templateOverride) {
    const myCardToken = ++_cardRenderToken;
    document.getElementById('idName').textContent = profile.full_name || '—';
    // profiles.member_id is shown in exactly one place now — the dedicated right-side panel.
    // (The center-column Member ID row was removed per the latest visual correction.)
    const idMemberIdPanelEl = document.getElementById('idMemberIdPanel');
    if (idMemberIdPanelEl) idMemberIdPanelEl.textContent = profile.member_id || '—';
    document.getElementById('idRole').textContent = profile.role || '';
    document.getElementById('idSociety').textContent = profile.societies ? ('Society: ' + profile.societies.name) : '';
    document.getElementById('idChapter').textContent = profile.chapters ? ('Chapter: ' + profile.chapters.name) : '';
    document.getElementById('idProvince').textContent = profile.province ? ('Province: ' + profile.province) : '';
    // Membership Type — existing profiles.membership_type column, gracefully hidden if empty
    document.getElementById('idMembershipType').textContent = profile.membership_type ? ('Membership: ' + profile.membership_type) : '';
    // Status badge — existing profiles.status column, colour reflects active/inactive
    const idStatusEl = document.getElementById('idStatus');
    if (profile.status) {
      idStatusEl.textContent = profile.status;
      // High-contrast badge colors on the cream card body — dark text on a tinted background,
      // never low-opacity white-on-light.
      if (profile.status === 'active') {
        idStatusEl.style.background = 'rgba(45,138,112,.16)';
        idStatusEl.style.color = '#1F6B54';
      } else {
        idStatusEl.style.background = 'rgba(11,31,51,.10)';
        idStatusEl.style.color = 'var(--navy)';
      }
      idStatusEl.style.display = 'inline-flex';
    } else {
      idStatusEl.style.display = 'none';
    }

    const idAvatarImg = document.getElementById('idAvatarImg');
    const idAvatarPlaceholder = document.getElementById('idAvatarPlaceholder');
    if (profile.avatar_url) {
      idAvatarImg.src = profile.avatar_url;
      idAvatarImg.style.display = 'block';
      idAvatarPlaceholder.style.display = 'none';
    } else {
      idAvatarImg.style.display = 'none';
      idAvatarPlaceholder.style.display = 'flex';
    }

    // Build the verification URL and render a fresh QR code — unchanged existing verification flow
    const verifyUrl = window.location.origin + window.location.pathname + '?verify=' + encodeURIComponent(profile.member_id);
    const qrContainer = document.getElementById('idQrCode');
    qrContainer.innerHTML = ''; // clear any previous QR
    new QRCode(qrContainer, {
      text: verifyUrl,
      width: 56,
      height: 56,
      colorDark: '#0d1b3d',
      colorLight: '#ffffff'
    });

    // Load the template (either a specific one for admin preview, or the active default) + Branding
    const cardBox = document.getElementById('idCardFront');
    const [{ data: cardTpl }, { data: brand }] = await Promise.all([
      templateOverride ? Promise.resolve({ data: templateOverride }) :
        sb.from('card_templates').select('*').eq('is_default', true).eq('is_active', true).limit(1).maybeSingle(),
      sb.from('brand_settings').select('*').limit(1).maybeSingle()
    ]);
    if (myCardToken !== _cardRenderToken) return;
    window._lastRenderedCardTpl = cardTpl || null;
    let flipBtn = document.getElementById('idCardFlipBtn');
    if (cardTpl && cardBox) {
      if (cardTpl.front_design_url && (isSafeHttpUrl(cardTpl.front_design_url) || String(cardTpl.front_design_url).indexOf('data:image/') === 0)) {
        cardBox.style.backgroundImage = "url('" + safeCssUrl(cardTpl.front_design_url) + "')";
        cardBox.style.backgroundSize = 'cover';
        cardBox.style.backgroundPosition = 'center';
      } else {
        cardBox.style.backgroundImage = '';
      }
      if (cardTpl.back_design_url) {
        if (!flipBtn) {
          flipBtn = document.createElement('button');
          flipBtn.id = 'idCardFlipBtn';
          flipBtn.type = 'button';
          flipBtn.className = 'btn btn-outline';
          flipBtn.style.cssText = 'margin-top:.75rem;width:100%;justify-content:center;';
          flipBtn.textContent = 'Flip to Back';
          flipBtn.onclick = function () {
            const showingBack = cardBox.dataset.side === 'back';
            cardBox.dataset.side = showingBack ? 'front' : 'back';
            cardBox.style.backgroundImage = "url('" + (showingBack ? cardTpl.front_design_url : cardTpl.back_design_url) + "')";
            flipBtn.textContent = showingBack ? 'Flip to Back' : 'Flip to Front';
          };
          cardBox.parentElement.appendChild(flipBtn);
        }
        flipBtn.style.display = 'block';
      } else if (flipBtn) {
        flipBtn.style.display = 'none';
      }
      // config is a new nullable JSONB column — old templates without it fall back to current look
      applyCardConfig(cardBox, cardTpl.config, brand);
    } else {
      if (flipBtn) flipBtn.style.display = 'none';
      applyCardConfig(cardBox, null, brand);
    }

    openModal('idCardModal');
  }

  /* Dedicated card print/PDF surface — a standard CR80 card (85.6mm x 54mm), NOT the A4/Letter
     paperPageCss() used for certificates/documents. Clones the already-rendered #idCardFront
     (and back face, if a back design is set) so print/PDF always match the on-screen preview
     exactly, per the single-canonical-renderer requirement. */
  function buildCardPrintHtml() {
    const front = document.getElementById('idCardFront');
    if (!front) return null;
    const tpl = window._lastRenderedCardTpl;
    const landscape = !(tpl && tpl.config && tpl.config.orientation === 'portrait');
    const w = landscape ? '85.6mm' : '54mm';
    const h = landscape ? '54mm' : '85.6mm';
    const pageCss = '@page{size:' + w + ' ' + h + ';margin:0;}' +
      'html,body{margin:0;padding:0;}' +
      '.card-print-face{width:' + w + ';height:' + h + ';page-break-after:always;overflow:hidden;box-sizing:border-box;}' +
      '.card-print-face:last-child{page-break-after:auto;}' +
      '.card-print-face > div{width:100%;height:100%;box-sizing:border-box;}';
    let html = '<div class="card-print-face">' + front.outerHTML + '</div>';
    if (tpl && tpl.back_design_url) {
      const backHtml = '<div style="width:100%;height:100%;background-image:url(' + JSON.stringify(tpl.back_design_url) + ');background-size:cover;background-position:center;"></div>';
      html += '<div class="card-print-face">' + backHtml + '</div>';
    }
    return { html, pageCss };
  }

  function printIdCard() {
    const built = buildCardPrintHtml();
    if (!built) { showToast('کارڈ دستیاب نہیں', 'error'); return; }
    const popup = window.open('', '_blank', 'width=500,height=400');
    if (!popup) { showToast('براوزر نے نئی ونڈو بلاک کر دی ہے۔', 'error'); return; }
    popup.document.open();
    popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>SHAOOR Membership Card</title><style>' + built.pageCss + '</style></head><body>' + built.html + '<' + 'script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)});<' + '/script></body></html>');
    popup.document.close();
  }
  // downloadCardAsPDF() reuses the exact same popup-window print-to-PDF technique as
  // downloadCertificateAsPDF()/printGeneratedDocument() (the user picks "Save as PDF" in the
  // browser's print dialog) rather than introducing a new PDF library.
  const downloadCardAsPDF = printIdCard;

  async function openDigitalId() {
    const { data: userData } = await sb.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return;

    const { data: profile, error } = await sb
      .from('profiles')
      .select('full_name, member_id, role, status, avatar_url, province, membership_type, societies!profiles_society_id_fkey(name), chapters!profiles_chapter_id_fkey(name)')
      .eq('id', userId)
      .single();

    if (error || !profile) {
      showToast('ID کارڈ لوڈ نہیں ہو سکا', 'error');
      return;
    }

    await renderIdCard(profile);
  }

  // Admin → Members → "Card" action. Reuses the exact same canonical renderIdCard()
  // that openDigitalId() (member's own view) and the public verification flow use —
  // no second card renderer, no duplicate markup/logic. Only the lookup differs: by
  // member id (admin browsing the table) instead of the logged-in user's own id.
  async function openMemberCardAdmin(memberId) {
    if (!memberId) return;
    if (!(await requireStaff())) return;

    const { data: profile, error } = await sb
      .from('profiles')
      .select('full_name, member_id, role, status, avatar_url, province, membership_type, societies!profiles_society_id_fkey(name), chapters!profiles_chapter_id_fkey(name)')
      .eq('id', memberId)
      .single();

    if (error || !profile) {
      showToast('ID کارڈ لوڈ نہیں ہو سکا', 'error');
      return;
    }

    await renderIdCard(profile);
  }

  /* ══════════════ CERTIFICATES ══════════════ */

  /* Renders a QR code into a container for any verification URL */
  function renderCertQR(containerId, verifyUrl) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';
    new QRCode(el, { text: verifyUrl, width: 130, height: 130, colorDark: '#0d1b3d', colorLight: '#ffffff' });
  }

  function certStatusColor(status) {
    if (status === 'active') return { bg: 'var(--teal)', label: 'Active / فعال' };
    if (status === 'revoked') return { bg: 'var(--ruby)', label: 'Revoked / منسوخ' };
    return { bg: '#a16207', label: 'Expired / میعاد ختم' };
  }

  /* ── Admin: load all certificates into the admin table ── */
  /* ── Branding Assets ── */
  let brandLogoFile = null, brandSealFile = null, brandSigFile = null, brandPresSigFile = null, brandSocSigFile = null, brandChapSigFile = null, brandCourseSigFile = null, brandFounderPhotoFile = null, brandAboutImageFile = null;
  let brandingRowId = null;

  function setBrandPreview(prefix, url) {
    const img = document.getElementById(prefix + 'Preview');
    const placeholder = document.getElementById(prefix + 'Placeholder');
    if (url) {
      img.src = url;
      img.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      img.src = '';
      img.style.display = 'none';
      placeholder.style.display = 'flex';
    }
  }

  async function loadBrandingAdmin() {
    const { data, error } = await sb.from('brand_settings').select('*').limit(1).maybeSingle();
    if (error) { console.error('Branding load failed:', error); showToast('Branding لوڈ نہیں ہو سکی', 'error'); return; }
    if (!data) return; // no row yet — form stays at defaults, save will need an insert (handled below)

    brandingRowId = data.id;
    document.getElementById('brandOrgName').value = data.organization_name || '';
    document.getElementById('brandOfficialEmail').value = data.official_email || '';
    document.getElementById('brandOfficialPhone').value = data.official_phone || '';
    document.getElementById('brandFounderName').value = data.founder_name || '';
    document.getElementById('brandDefaultAuthority').value = data.default_authority || '';
    document.getElementById('brandFounderTitle').value = data.founder_title || '';
    document.getElementById('brandFounderQuote').value = data.founder_quote || '';
    document.getElementById('brandFounderBio').value = data.founder_bio || '';
    document.getElementById('brandAboutIntro').value = data.about_intro || '';
    document.getElementById('brandAboutPara1').value = data.about_para1 || '';
    document.getElementById('brandAboutPara2').value = data.about_para2 || '';

    const primary = data.primary_color || '#0d1b3d';
    const accent = data.accent_color || '#c99723';
    const bg = data.background_color || '#f8f6f0';
    document.getElementById('brandPrimaryColor').value = primary;
    document.getElementById('brandPrimaryColorHex').value = primary;
    document.getElementById('brandAccentColor').value = accent;
    document.getElementById('brandAccentColorHex').value = accent;
    document.getElementById('brandBackgroundColor').value = bg;
    document.getElementById('brandBackgroundColorHex').value = bg;

    setBrandPreview('brandLogo', data.logo_url);
    setBrandPreview('brandSeal', data.seal_url);
    setBrandPreview('brandSig', data.founder_signature_url);
    setBrandPreview('brandPresSig', data.president_signature_url);
    setBrandPreview('brandSocSig', data.society_signature_url);
    setBrandPreview('brandChapSig', data.chapter_signature_url);
    setBrandPreview('brandCourseSig', data.course_admin_signature_url);
    setBrandPreview('brandFounderPhoto', data.founder_photo_url);
    setBrandPreview('brandAboutImage', data.about_image_url);
    window._brandCache = data;
    renderBrandOrgLogos();

    const note = document.getElementById('brandingSavedNote');
    note.textContent = data.updated_at ? ('آخری بار محفوظ: ' + new Date(data.updated_at).toLocaleString()) : '';
  }

  async function renderBrandOrgLogos() {
    const host = document.getElementById('brandOrgLogos');
    if (!host || !sb) return;
    const [{ data: societies }, { data: chapters }] = await Promise.all([
      sb.from('societies').select('id, name, logo_url').order('name'),
      sb.from('chapters').select('id, name, logo_url').order('name')
    ]);
    const card = (kind, row) => {
      const has = !!(row.logo_url);
      const img = has
        ? `<img src="${sanitize(row.logo_url)}" alt="" />`
        : `<div class="empty"><i class="fas fa-image"></i></div>`;
      const status = has ? 'Logo on file' : 'No logo yet';
      return `<div class="brand-org-card">${img}<div><div style="font-weight:700;font-size:.82rem;">${sanitize(row.name || '')}</div><div style="font-size:.7rem;color:var(--muted);">${kind} · ${status}</div></div></div>`;
    };
    const soc = (societies || []).map(s => card('Society', s)).join('');
    const chap = (chapters || []).map(c => card('Chapter', c)).join('');
    host.innerHTML = (soc + chap) || '<div style="font-size:.8rem;color:var(--muted);">No societies or chapters yet.</div>';
  }

  window.addEventListener('DOMContentLoaded', () => {
    // Sync color-picker <-> hex text field, both directions
    [['brandPrimaryColor', 'brandPrimaryColorHex'],
     ['brandAccentColor', 'brandAccentColorHex'],
     ['brandBackgroundColor', 'brandBackgroundColorHex']].forEach(([pickerId, hexId]) => {
      const picker = document.getElementById(pickerId);
      const hex = document.getElementById(hexId);
      if (!picker || !hex) return;
      picker.addEventListener('input', () => { hex.value = picker.value; });
      hex.addEventListener('change', () => {
        const v = hex.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(v)) picker.value = v;
        else showToast('رنگ کا فارمیٹ درست نہیں (مثال: #0d1b3d)', 'error');
      });
    });

    const fileMap = [
      ['brandLogoInput', 'brandLogo', f => brandLogoFile = f],
      ['brandSealInput', 'brandSeal', f => brandSealFile = f],
      ['brandSigInput', 'brandSig', f => brandSigFile = f],
      ['brandPresSigInput', 'brandPresSig', f => brandPresSigFile = f],
      ['brandSocSigInput', 'brandSocSig', f => brandSocSigFile = f],
      ['brandChapSigInput', 'brandChapSig', f => brandChapSigFile = f],
      ['brandCourseSigInput', 'brandCourseSig', f => brandCourseSigFile = f],
      ['brandFounderPhotoInput', 'brandFounderPhoto', f => brandFounderPhotoFile = f],
      ['brandAboutImageInput', 'brandAboutImage', f => brandAboutImageFile = f],
    ];
    fileMap.forEach(([inputId, prefix, setFile]) => {
      const input = document.getElementById(inputId);
      if (!input) return;
      input.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
          showToast('صرف PNG, JPG, یا WEBP تصویر منتخب کریں', 'error');
          input.value = '';
          return;
        }
        if (file.size > 3 * 1024 * 1024) {
          showToast('تصویر 3MB سے چھوٹی ہونی چاہیے', 'error');
          input.value = '';
          return;
        }
        setFile(file);
        setBrandPreview(prefix, URL.createObjectURL(file));
      });
    });
  });

  async function uploadBrandAsset(file, folder) {
    if (!file) return null;
    const ext = file.name.split('.').pop();
    const filePath = `branding/${folder}/${Date.now()}.${ext}`;
    const { error: uploadError } = await sb.storage.from('shaoor-uploads').upload(filePath, file, { upsert: true, cacheControl: '3600' });
    if (uploadError) { throw uploadError; }
    const { data: publicUrlData } = sb.storage.from('shaoor-uploads').getPublicUrl(filePath);
    return publicUrlData.publicUrl + '?t=' + Date.now();
  }

  window.addEventListener('DOMContentLoaded', () => secureSubmit('brandingForm', async frm => {
    const payload = {
      organization_name: frm.querySelector('#brandOrgName').value.trim() || null,
      official_email: frm.querySelector('#brandOfficialEmail').value.trim() || null,
      official_phone: frm.querySelector('#brandOfficialPhone').value.trim() || null,
      founder_name: frm.querySelector('#brandFounderName').value.trim() || null,
      default_authority: frm.querySelector('#brandDefaultAuthority').value.trim() || null,
      founder_title: frm.querySelector('#brandFounderTitle').value.trim() || null,
      founder_quote: frm.querySelector('#brandFounderQuote').value.trim() || null,
      founder_bio: frm.querySelector('#brandFounderBio').value.trim() || null,
      about_intro: frm.querySelector('#brandAboutIntro').value.trim() || null,
      about_para1: frm.querySelector('#brandAboutPara1').value.trim() || null,
      about_para2: frm.querySelector('#brandAboutPara2').value.trim() || null,
      primary_color: frm.querySelector('#brandPrimaryColorHex').value.trim() || null,
      accent_color: frm.querySelector('#brandAccentColorHex').value.trim() || null,
      background_color: frm.querySelector('#brandBackgroundColorHex').value.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { data: { user } } = await sb.auth.getUser();
    if (user) payload.updated_by = user.id;

    try {
      if (brandLogoFile) payload.logo_url = await uploadBrandAsset(brandLogoFile, 'logo');
      if (brandSealFile) payload.seal_url = await uploadBrandAsset(brandSealFile, 'seal');
      if (brandSigFile) payload.founder_signature_url = await uploadBrandAsset(brandSigFile, 'signature');
      if (brandPresSigFile) payload.president_signature_url = await uploadBrandAsset(brandPresSigFile, 'signature-president');
      if (brandSocSigFile) payload.society_signature_url = await uploadBrandAsset(brandSocSigFile, 'signature-society');
      if (brandChapSigFile) payload.chapter_signature_url = await uploadBrandAsset(brandChapSigFile, 'signature-chapter');
      if (brandCourseSigFile) payload.course_admin_signature_url = await uploadBrandAsset(brandCourseSigFile, 'signature-course');
      if (brandFounderPhotoFile) payload.founder_photo_url = await uploadBrandAsset(brandFounderPhotoFile, 'founder-photo');
      if (brandAboutImageFile) payload.about_image_url = await uploadBrandAsset(brandAboutImageFile, 'about-image');
    } catch (err) {
      console.error('Branding asset upload failed:', err);
      showToast('اپلوڈ ناکام: ' + err.message, 'error');
      return;
    }

    let error;
    if (brandingRowId !== null) {
      ({ error } = await sb.from('brand_settings').update(payload).eq('id', brandingRowId));
    } else {
      ({ error } = await sb.from('brand_settings').insert(payload));
    }

    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }

    brandLogoFile = null; brandSealFile = null; brandSigFile = null; brandPresSigFile = null; brandSocSigFile = null; brandChapSigFile = null; brandCourseSigFile = null; brandFounderPhotoFile = null; brandAboutImageFile = null;
    showToast('Branding محفوظ ہو گئی');
    await loadBrandingAdmin();
  }));

  async function loadCertificatesAdmin() {
    if (!(await requireStaff())) return;
    const tbody = document.getElementById('certificatesBody');
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.5rem;">Loading certificates…</td></tr>';

    const { data: certs, error } = await sb
      .from('certificates')
      .select('id, certificate_id, member_id, certificate_title, certificate_type, issue_date, status')
      .order('created_at', { ascending: false });

    if (error) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--ruby);padding:1.5rem;">Failed to load: ' + sanitize(error.message) + '</td></tr>';
      return;
    }

    if (!certs || certs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.5rem;">No certificates issued yet.</td></tr>';
      return;
    }

    /* Fetch member names for display (map member_id UUID -> name) */
    const memberIds = [...new Set(certs.map(c => c.member_id))];
    const { data: profs } = await sb.from('profiles').select('id, full_name, member_id').in('id', memberIds);
    const nameMap = {};
    (profs || []).forEach(p => { nameMap[p.id] = p.full_name + ' (' + p.member_id + ')'; });

    tbody.innerHTML = certs.map(c => {
      const sc = certStatusColor(c.status);
      const memberLabel = nameMap[c.member_id] || c.member_id;
      return `<tr>
        <td>${sanitize(c.certificate_id)}</td>
        <td>${sanitize(memberLabel)}</td>
        <td>${sanitize(c.certificate_title)}</td>
        <td style="text-transform:capitalize;">${sanitize(c.certificate_type)}</td>
        <td>${sanitize(c.issue_date)}</td>
        <td><span class="status-pill" style="background:${sc.bg};color:#fff;">${sc.label}</span></td>
        <td style="display:flex;gap:.4rem;flex-wrap:wrap;">
          <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;" onclick="viewCertificate(${c.id})">View</button>
          ${c.status === 'active'
            ? `<button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--ruby);" onclick="revokeCertificate(${c.id})">Revoke</button>`
            : ''}
        </td>
      </tr>`;
    }).join('');
  }

  /* ── Load Societies for Admin Panel ── */

  /* ── Load Applications for Admin Panel ── */
  async function loadApplicationsAdmin() {
    const tbody = document.getElementById('applicationsBody');
    if (!tbody) return; // Panel doesn't exist yet
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:1.5rem;"><span class="su-spinner" style="width:16px;height:16px;border-width:2px;vertical-align:middle;margin-inline-end:.5rem;"></span><span style="color:var(--muted);">درخواستیں لوڈ ہو رہی ہیں…</span></td></tr>';

    // Fetch pending applications first, then rejected/approved
    const { data: apps, error } = await sb
      .from('applications')
      .select('id, email, full_name, phone, society_interest, status, applied_at, motivation_text')
      .order('status', { ascending: false })
      .order('applied_at', { ascending: false });

    if (error) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ruby);padding:1.5rem;">Load fail: ' + sanitize(error.message) + '</td></tr>';
      return;
    }

    if (!apps || apps.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">کوئی درخواست نہیں۔</td></tr>';
      return;
    }

    tbody.innerHTML = apps.map(app => {
      const statusBg = app.status === 'pending' ? '#fbbf24' 
                     : app.status === 'approved' ? 'var(--teal)'
                     : '#ef4444';
      const statusLabel = app.status === 'pending' ? 'زیرِ التوا'
                        : app.status === 'approved' ? 'منظور' 
                        : 'مسترد';
      const appliedDate = new Date(app.applied_at).toLocaleDateString('ur-PK');
      
      return `<tr>
        <td><strong>${sanitize(app.full_name)}</strong></td>
        <td>${sanitize(app.email)}</td>
        <td>${sanitize(app.phone)}</td>
        <td>${sanitize(app.society_interest)}</td>
        <td>${appliedDate}</td>
        <td style="display:flex;gap:.4rem;flex-wrap:wrap;">
          <span class="status-pill" style="background:${statusBg};color:#fff;padding:.3rem .7rem;font-size:.75rem;border-radius:4px;">${statusLabel}</span>
          ${app.status === 'pending' ? `
            <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--teal);" onclick="approveApplication('${app.id}')">منظور کریں</button>
            <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--ruby);" onclick="rejectApplication('${app.id}')">مسترد کریں</button>
          ` : ''}
          <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--navy2);" onclick="viewApplication('${app.id}')">دیکھیں</button>
          <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--ruby);" onclick="deleteApplication('${app.id}')"><i class="fas fa-trash"></i> حذف</button>
        </td>
      </tr>`;
    }).join('');
  }

  /* ── Delete Application (permanent) ── */
  async function deleteApplication(appId) {
    if (!(await requireStaff())) return;
    if (!confirm('کیا آپ یہ درخواست ہمیشہ کے لیے ڈیلیٹ کرنا چاہتے ہیں؟ یہ عمل واپس نہیں ہو سکتا۔')) return;
    const { data, error } = await sb.from('applications').delete().eq('id', appId).select('id');
    if (error) {
      showToast('ڈیلیٹ ناکام: ' + error.message, 'error');
      return;
    }
    if (!data || data.length === 0) {
      showToast('ڈیلیٹ ناکام — ڈیٹا بیس میں اجازت (RLS Policy) موجود نہیں، اس لیے ریکارڈ حذف نہیں ہوا۔', 'error');
      return;
    }
    showToast('درخواست مستقل طور پر حذف کر دی گئی۔');
    loadApplicationsAdmin();
  }

  /* ── Approve Application ── */
  async function approveApplication(appId) {
    if (!(await requireStaff())) return;
    const { data: app, error: fetchError } = await sb
      .from('applications')
      .select('email, full_name, phone')
      .eq('id', appId)
      .single();

    if (fetchError || !app) {
      showToast('درخواست تلاش نہیں ہوئی', 'error');
      return;
    }

    // Update application status
    const { error: updateError } = await sb
      .from('applications')
      .update({ status: 'approved', reviewed_at: new Date().toISOString() })
      .eq('id', appId);

    if (updateError) {
      showToast('خرابی: ' + updateError.message, 'error');
      return;
    }

    // Now try to create or link a member profile if it doesn't exist
    // (This is optional — they can sign up normally too)
    showToast('✅ درخواست منظور کر دی گئی!');
    loadApplicationsAdmin();
  }

  /* ── Reject Application ── */
  async function rejectApplication(appId) {
    if (!(await requireStaff())) return;
    if (!confirm('کیا یہ درخواست مسترد کرنا چاہتے ہیں?')) return;

    const { error } = await sb
      .from('applications')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', appId);

    if (error) {
      showToast('خرابی: ' + error.message, 'error');
      return;
    }

    showToast('درخواست مسترد کر دی گئی۔');
    loadApplicationsAdmin();
  }

  /* ── View Application Details ── */
  function viewApplication(appId) {
    showToast('تفصیلات کو modal میں دکھانے کی سہولت جلد آئے گی۔');
    // TODO: Create a modal to show full application details
  }

  /* ── Admin: populate the member dropdown in the Issue Certificate modal ── */
  async function populateCertMemberSelect() {
    const sel = document.getElementById('certMemberSelect');
    sel.innerHTML = '<option value="">-- Choose Member --</option>';
    const { data: profs, error } = await sb.from('profiles').select('id, full_name, member_id').order('full_name');
    if (error || !profs) return;
    profs.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.full_name + ' (' + p.member_id + ')';
      sel.appendChild(opt);
    });
  }

  /* ── Admin: populate the certificate-template dropdown in the Issue Certificate modal ── */
  async function populateCertTemplateSelect() {
    const sel = document.getElementById('certTemplateSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Default Design --</option>';
    const { data: templates, error } = await sb.from('certificate_templates').select('id, name, is_active').eq('is_active', true).order('name');
    if (error || !templates) return;
    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      sel.appendChild(opt);
    });
  }

  /* ── Admin: populate the linked-course dropdown in the Issue Certificate modal ── */
  async function populateCertCourseSelect() {
    const sel = document.getElementById('certCourseSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- None --</option>';
    const { data: courses, error } = await sb.from('courses').select('id, title').order('title');
    if (error || !courses) return;
    courses.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.title;
      sel.appendChild(opt);
    });
  }

  /* ── Admin: populate Society/Chapter dropdowns in the Issue Certificate modal
     (same existing societies/chapters tables already used by the document-generation
     dropdowns — no new relationship, just reused here). ── */
  async function populateCertSocietySelect() {
    const sel = document.getElementById('certSocietySelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- None --</option>';
    const { data: socs, error } = await sb.from('societies').select('id, name').order('name');
    if (error || !socs) return;
    socs.forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; sel.appendChild(o); });
  }

  async function populateCertChapterSelect() {
    const sel = document.getElementById('certChapterSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- None --</option>';
    const { data: chaps, error } = await sb.from('chapters').select('id, name').order('name');
    if (error || !chaps) return;
    chaps.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; sel.appendChild(o); });
  }

  function openIssueCertificateModal() {
    document.getElementById('issueCertificateForm').reset();
    document.getElementById('certIssueDate').value = new Date().toISOString().split('T')[0];
    populateCertMemberSelect();
    populateCertTemplateSelect();
    populateCertCourseSelect();
    populateCertSocietySelect();
    populateCertChapterSelect();
    openModal('issueCertificateModal');
  }

  secureSubmit('issueCertificateForm', async frm => {
    if (!(await requireStaff())) return;
    const member_id = frm.querySelector('#certMemberSelect').value;
    const certificate_title = frm.querySelector('#certTitle').value.trim();
    const certificate_type = frm.querySelector('#certType').value;
    const issue_date = frm.querySelector('#certIssueDate').value;
    const expiry_date = frm.querySelector('#certExpiryDate').value || null;
    const template_id = frm.querySelector('#certTemplateSelect').value || null;
    const course_id = frm.querySelector('#certCourseSelect').value || null;
    const completion_date = frm.querySelector('#certCompletionDate').value || null;
    const grade = frm.querySelector('#certGrade').value.trim() || null;
    const duration = frm.querySelector('#certDuration').value.trim() || null;
    const notes = frm.querySelector('#certNotes').value.trim() || null;
    const program_name = frm.querySelector('#certProgramName').value.trim() || null;
    const society_id = frm.querySelector('#certSocietySelect').value || null;
    const chapter_id = frm.querySelector('#certChapterSelect').value || null;
    const certificate_body = frm.querySelector('#certBody').value.trim() || null;

    if (!member_id) { showToast('براہ کرم ایک ممبر منتخب کریں', 'error'); return; }

    const { error } = await sb.from('certificates').insert({
      member_id, certificate_title, certificate_type, issue_date, expiry_date, notes, status: 'active',
      template_id, course_id, completion_date, grade, duration,
      program_name, society_id, chapter_id, certificate_body
    });

    if (error) {
      showToast('سرٹیفکیٹ جاری نہیں ہو سکا: ' + error.message, 'error');
      return;
    }

    showToast('✓ سرٹیفکیٹ کامیابی سے جاری ہو گیا!');
    closeModal('issueCertificateModal');
    loadCertificatesAdmin();
  });

  /* ── Admin: revoke a certificate ── */
  async function revokeCertificate(id) {
    if (!(await requireStaff())) return;
    if (!confirm('کیا آپ واقعی یہ سرٹیفکیٹ منسوخ کرنا چاہتے ہیں؟')) return;
    const { error } = await sb.from('certificates').update({ status: 'revoked' }).eq('id', id);
    if (error) { showToast('منسوخ نہیں ہو سکا: ' + error.message, 'error'); return; }
    showToast('سرٹیفکیٹ منسوخ کر دیا گیا۔');
    loadCertificatesAdmin();
  }

  /* ── Admin: Course Enrollments management (Learning Academy) ── */
  function enrollStatusColor(status) {
    switch (status) {
      case 'active': return { bg: 'var(--teal)', label: 'Active' };
      case 'completed': return { bg: 'var(--gold, #c9a44c)', label: 'Completed' };
      case 'pending': return { bg: '#f59e0b', label: 'Pending' };
      case 'cancelled': return { bg: '#6b7280', label: 'Cancelled' };
      case 'suspended': return { bg: 'var(--ruby, #ef4444)', label: 'Suspended' };
      default: return { bg: '#6b7280', label: status || '—' };
    }
  }

  async function loadEnrollmentsAdmin() {
    const tbody = document.getElementById('enrollmentsAdminBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">Enrollments لوڈ ہو رہے ہیں…</td></tr>';

    const filterStatus = document.getElementById('enrollFilterStatus')?.value || '';

    let query = sb
      .from('course_enrollments')
      .select('id, member_id, course_id, status, payment_status, enrolled_at, courses(title), profiles(full_name, member_id)')
      .order('enrolled_at', { ascending: false });
    if (filterStatus) query = query.eq('status', filterStatus);

    const { data: rows, error } = await query;

    if (error) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ruby);padding:1.5rem;">Failed to load: ' + sanitize(error.message) + '</td></tr>';
      return;
    }

    if (!rows || rows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">No enrollments found.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (r) {
      const sc = enrollStatusColor(r.status);
      const memberLabel = r.profiles ? (r.profiles.full_name + ' (' + r.profiles.member_id + ')') : r.member_id;
      const courseLabel = r.courses ? r.courses.title : r.course_id;
      const enrolledOn = r.enrolled_at ? new Date(r.enrolled_at).toLocaleDateString() : '—';
      var actions = '<button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;" onclick="viewEnrollment(\'' + r.id + '\')">View</button>';
      if (r.status === 'pending') {
        actions += ' <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--teal);" onclick="approveEnrollment(\'' + r.id + '\')">Approve</button>';
      }
      if (r.status === 'active' || r.status === 'pending') {
        actions += ' <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:#6b7280;" onclick="suspendEnrollment(\'' + r.id + '\')">Suspend</button>';
      }
      actions += ' <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--ruby);" onclick="deleteEnrollment(\'' + r.id + '\')"><i class="fas fa-trash"></i></button>';
      return '<tr>' +
        '<td>' + sanitize(memberLabel) + '</td>' +
        '<td>' + sanitize(courseLabel) + '</td>' +
        '<td><span class="status-pill" style="background:' + sc.bg + ';color:#fff;">' + sc.label + '</span></td>' +
        '<td style="text-transform:capitalize;">' + sanitize(r.payment_status || '—') + '</td>' +
        '<td>' + enrolledOn + '</td>' +
        '<td style="display:flex;gap:.4rem;flex-wrap:wrap;">' + actions + '</td>' +
        '</tr>';
    }).join('');
  }

  function viewEnrollment(id) {
    // Simple detail view for now — full modal can be added later if needed.
    sb.from('course_enrollments')
      .select('id, status, payment_status, progress_percent, enrolled_at, courses(title), profiles(full_name, member_id)')
      .eq('id', id)
      .single()
      .then(function (res) {
        if (res.error || !res.data) { showToast('Could not load enrollment', 'error'); return; }
        var e = res.data;
        alert(
          'Member: ' + (e.profiles ? e.profiles.full_name + ' (' + e.profiles.member_id + ')' : '—') + '\n' +
          'Course: ' + (e.courses ? e.courses.title : '—') + '\n' +
          'Status: ' + e.status + '\n' +
          'Payment: ' + (e.payment_status || '—') + '\n' +
          'Progress: ' + (e.progress_percent || 0) + '%\n' +
          'Enrolled: ' + new Date(e.enrolled_at).toLocaleString()
        );
      });
  }

  async function approveEnrollment(id) {
    if (!(await requireStaff())) return;
    const { error } = await sb.from('course_enrollments').update({ status: 'active', payment_status: 'paid' }).eq('id', id);
    if (error) { showToast('منظوری ناکام: ' + error.message, 'error'); return; }
    showToast('✓ Enrollment approved');
    loadEnrollmentsAdmin();
  }

  async function suspendEnrollment(id) {
    if (!(await requireStaff())) return;
    if (!confirm('Suspend this enrollment? The student will lose access until reactivated.')) return;
    const { error } = await sb.from('course_enrollments').update({ status: 'suspended' }).eq('id', id);
    if (error) { showToast('ناکام: ' + error.message, 'error'); return; }
    showToast('Enrollment suspended');
    loadEnrollmentsAdmin();
  }

  async function deleteEnrollment(id) {
    if (!(await requireStaff())) return;
    if (!confirm('Permanently delete this enrollment? This cannot be undone — the student will need to re-enroll.')) return;
    const { data, error } = await sb.from('course_enrollments').delete().eq('id', id).select('id');
    if (error) { showToast('حذف ناکام: ' + error.message, 'error'); return; }
    if (!data || data.length === 0) { showToast('حذف ناکام — RLS permission missing', 'error'); return; }
    showToast('Enrollment deleted');
    loadEnrollmentsAdmin();
  }


  /* ── Download / Save certificate as PDF ── */
  function downloadCertificateAsPDF() {
    const area = document.getElementById('certificatePrintArea');
    if (!area) { showToast('سرٹیفکیٹ دستیاب نہیں', 'error'); return; }
    const title = (document.getElementById('vcTitle')?.textContent || 'SHAOOR Certificate').trim();
    const popup = window.open('', '_blank', 'width=1100,height=800');
    if (!popup) { showToast('براوزر نے نئی ونڈو بلاک کر دی ہے۔', 'error'); return; }
    const styles = Array.from(document.querySelectorAll('style')).map(el => el.textContent).join('\n');
    const safeTitle = title.replace(/[<>]/g,'');
    // Real print dimensions come from the template that was actually applied to this
    // certificate (see applyCertificateTemplate), defaulting to A4/landscape when unset —
    // never a hard-coded certificate size.
    const cfg = window._lastCertTemplateConfig || {};
    // Margin comes from the @page rule itself — no extra body padding/wrapper on top of it,
    // since that extra size was pushing the certificate past one physical page.
    const pageCss = paperPageCss(cfg.paper_size || 'a4', cfg.orientation || 'landscape', 10);
    popup.document.open();
    popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>'+safeTitle+'</title><style>'+pageCss+'</style><style>'+styles+'</style><style>html,body{margin:0!important;padding:0!important;background:#fff!important}#certificatePrintArea{position:relative!important;left:auto!important;top:auto!important;margin:0!important;box-sizing:border-box!important}</style></head><body>'+area.outerHTML+'<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)});<\/script></body></html>');
    popup.document.close();
  }

  const CERT_FIELD_IDS = { title: 'vcTitle', member: 'vcMember', body: 'vcBody', meta: 'vcMeta', qr: 'vcQrCode', signatures: 'vcSignatures', logo: 'vcLogo', seal: 'vcSeal', society_logo: 'vcSocietyLogo', chapter_logo: 'vcChapterLogo' };
  const CERT_PREVIEW_FIELD_IDS = { title: 'ctplPvTitle', member: 'ctplPvMember', body: 'ctplPvBody', meta: 'ctplPvMeta', qr: 'ctplPvQr', signatures: 'ctplPvSig', logo: 'ctplPvLogo', seal: 'ctplPvSeal', society_logo: 'ctplPvSocietyLogo', chapter_logo: 'ctplPvChapterLogo' };

  // ── Shared paper-size architecture, used by BOTH document print/Word export and certificate
  // PDF export. Standard sizes are real mm dimensions, so @page renders true A4/Legal/Letter —
  // not just a browser-preview illusion. 'custom' has no physical @page meaning; callers fall
  // back to A4 for the actual print page in that case (screen-only sizing is a separate concern).
  const PAPER_SIZES = { a4: { w: 210, h: 297 }, legal: { w: 216, h: 356 }, letter: { w: 216, h: 279 } };
  function paperPageCss(size, orientation, marginMm) {
    const dims = PAPER_SIZES[size] || PAPER_SIZES.a4;
    let w = dims.w, h = dims.h;
    if (orientation === 'landscape') { const t = w; w = h; h = t; }
    return '@page{size:' + w + 'mm ' + h + 'mm;margin:' + (marginMm == null ? 18 : marginMm) + 'mm;}';
  }
  // Config keys an admin can control from the Template Editor. Kept as the single list both the
  // structured editor controls and the JSON textarea serialize against.
  const CERT_FIELD_KEYS = ['title', 'member', 'body', 'meta', 'qr', 'signatures', 'logo', 'seal', 'society_logo', 'chapter_logo'];
  const CERT_FIELD_LABELS = { title: 'Title', member: 'Member / Recipient Name', body: 'Certificate Statement', meta: 'Metadata', qr: 'QR Code', signatures: 'Signature Area', logo: 'SHAOOR Logo', seal: 'Official Seal', society_logo: 'Society Logo', chapter_logo: 'Chapter Logo' };

  // Generalized so the same layout logic drives both the real certificate (idMap=CERT_FIELD_IDS)
  // and the Template Editor's live preview (idMap=CERT_PREVIEW_FIELD_IDS) — no duplicated logic.
  function applyCertFieldLayout(fields, idMap) {
    idMap = idMap || CERT_FIELD_IDS;
    Object.entries(idMap).forEach(([key, elId]) => {
      const el = document.getElementById(elId);
      if (!el) return;
      // Capture the original inline style once so templates never permanently clobber the default layout
      if (el.dataset.baseStyle === undefined) el.dataset.baseStyle = el.getAttribute('style') || '';
      el.setAttribute('style', el.dataset.baseStyle);

      const f = fields && fields[key];
      if (!f) return;
      if (f.top || f.left || f.right || f.bottom) {
        el.style.position = 'absolute';
        if (f.top) el.style.top = f.top;
        if (f.left) el.style.left = f.left;
        if (f.right) el.style.right = f.right;
        if (f.bottom) el.style.bottom = f.bottom;
        if (f.left && !f.right) el.style.transform = 'translateX(-50%)';
      }
      if (f.fontSize) el.style.fontSize = f.fontSize;
      if (f.fontFamily) el.style.fontFamily = f.fontFamily;
      if (f.color) el.style.color = f.color;
      if (f.align) el.style.textAlign = f.align;
      // width/height are only meaningful for image fields (logo/seal) but harmless elsewhere
      if (f.width) el.style.width = f.width;
      if (f.height) el.style.height = f.height;
    });
  }

  /* ── View a single certificate (from admin table or member list) with QR ── */
  /* ── Apply a certificate_templates.config onto the print area, and render signature blocks ── */
  // areaId/idMap let this same function drive both the real certificate (defaults) and the
  // Template Editor's live preview (pass 'ctplPreview' + CERT_PREVIEW_FIELD_IDS).
  function normalizeCertificateConfig(config) {
    if (!config || typeof config !== 'object') return config || {};
    const out = Object.assign({}, config);
    const branding = config.branding || {};
    const content = config.content || {};
    const signatures = config.signatures || {};
    if (!out.orientation) out.orientation = config.layout || config.orientation || 'landscape';
    if (!out.paper_size && config.page_size) out.paper_size = String(config.page_size).toLowerCase();
    if (!out.background_color) out.background_color = branding.background_color || null;
    if (!out.text_color) out.text_color = branding.primary_color || null;
    if (!out.accent_color) out.accent_color = branding.accent_color || null;
    if (!out.background_url) out.background_url = branding.background_url || null;
    out._content = content;
    out._signatures = signatures;
    out._brandingFlags = branding;
    return out;
  }

  function setCertImg(el, url) {
    if (!el) return;
    if (url) { el.src = url; el.style.display = ''; }
    else { el.removeAttribute('src'); el.style.display = 'none'; }
  }

  function applyCertificateTemplate(config, brand, areaId, idMap, orgLogos) {
    config = normalizeCertificateConfig(config);
    orgLogos = orgLogos || {};
    areaId = areaId || 'certificatePrintArea';
    idMap = idMap || CERT_FIELD_IDS;
    const area = document.getElementById(areaId);
    if (!area) return;
    // Remember the config that was actually applied to the real certificate, so the PDF/print
    // export can use the same paper size/orientation. Never set for the editor's preview area.
    if (areaId === 'certificatePrintArea') window._lastCertTemplateConfig = config || {};

    // Reset background image from any previous template before applying this one.
    area.style.backgroundImage = '';
    if (config) {
      const branding = config.branding || {};
      // Background: an image (existing background_url column) takes precedence over the
      // background color, but both remain independently stored/controllable.
      const bgUrl = config.background_url || branding.background_url;
      const bgColor = config.background_color || branding.background_color;
      const textColor = config.text_color || branding.primary_color;
      const accentColor = config.accent_color || branding.accent_color;
      if (bgUrl && (isSafeHttpUrl(bgUrl) || String(bgUrl).indexOf('data:image/') === 0)) {
        area.style.backgroundImage = 'url("' + safeCssUrl(bgUrl) + '")';
        area.style.backgroundSize = 'cover';
        area.style.backgroundPosition = 'center';
      } else if (bgColor) {
        area.style.background = bgColor;
      }
      if (textColor) area.style.color = textColor;
      if (accentColor) area.style.setProperty('--gold', accentColor);
    }
    // Certificate size/orientation — driven by the SAME PAPER_SIZES mm table and swap logic
    // as paperPageCss(), so the on-screen shape and the printed @page always agree exactly.
    // 'custom' paper_size keeps the legacy pixel/CSS-length width field; anything else (or no
    // config at all) defaults to real A4 landscape, matching the Template Editor's own default.
    const paperSize = (config && (config.paper_size || (config.page_size && String(config.page_size).toLowerCase()))) || 'a4';
    const orientation = (config && config.orientation) || (config && config.layout) || 'landscape';
    if (paperSize === 'custom' && config && config.width) {
      area.style.width = /^\d+$/.test(String(config.width)) ? config.width + 'px' : config.width;
      area.style.aspectRatio = '';
    } else {
      const dims = PAPER_SIZES[paperSize] || PAPER_SIZES.a4;
      let w = dims.w, h = dims.h;
      if (orientation === 'landscape') { const t = w; w = h; h = t; }
      area.style.aspectRatio = w + ' / ' + h;
      // Only the real certificate is sized to true mm (the Template Editor's preview keeps its
      // own small fixed CSS width and just adopts the matching aspect ratio).
      if (areaId === 'certificatePrintArea') area.style.width = w + 'mm';
    }
    if (areaId === 'certificatePrintArea') { area.style.maxWidth = '100%'; area.style.height = 'auto'; }
    // Keep the actual browser print page (@page) in sync with this certificate's own
    // paper size/orientation — without this, a direct in-page print falls back to the
    // browser's default page shape, which mismatches landscape content and is what was
    // forcing the certificate onto a second printed page.
    if (areaId === 'certificatePrintArea') {
      const pageStyleEl = document.getElementById('certPageSizeStyle');
      if (pageStyleEl) pageStyleEl.textContent = '@media print{' + paperPageCss(paperSize, orientation, 10) + '}';
    }
    // Language — existing templates saved before this field existed have no config.language,
    // so they safely default to English/LTR (same fallback pattern as the Document system).
    const isUrCert = config && config.language === 'ur';
    area.setAttribute('dir', isUrCert ? 'rtl' : 'ltr');
    area.style.fontFamily = isUrCert ? 'var(--ff-urdu)' : '';
    area.style.lineHeight = isUrCert ? '2' : '';
    // Reset/apply per-field layout every time so switching between differently-templated
    // certificates never leaves stale absolute positioning behind.
    applyCertFieldLayout(config && config.fields, idMap);

    const brandingFlags = (config && config._brandingFlags) || {};
    const showLogo = brandingFlags.show_logo !== false;
    const showSeal = brandingFlags.show_seal !== false;
    // Logo — sourced from brand.logo_url (never a template-uploaded image); the template only
    // controls its size/position via config.fields.logo.
    setCertImg(document.getElementById(idMap.logo), showLogo && brand && brand.logo_url ? brand.logo_url : null);
    setCertImg(document.getElementById(idMap.society_logo), orgLogos.society_logo_url || null);
    setCertImg(document.getElementById(idMap.chapter_logo), orgLogos.chapter_logo_url || null);
    const urduEl = areaId === 'certificatePrintArea' ? document.getElementById('vcUrduMark') : document.getElementById('ctplPvUrdu');
    if (urduEl) urduEl.style.display = '';

    let sigHolder = document.getElementById(idMap.signatures);
    if (!sigHolder && areaId === 'certificatePrintArea') {
      // Fallback only — the real certificate markup already defines #vcSignatures.
      sigHolder = document.createElement('div');
      sigHolder.id = idMap.signatures;
      area.appendChild(sigHolder);
    }
    if (sigHolder && areaId === 'certificatePrintArea') { sigHolder.innerHTML = ''; sigHolder.style.cssText = 'display:flex;justify-content:space-between;gap:1.1rem;flex-wrap:wrap;width:100%;'; }

    // Official seal — a distinct authentication mark, kept in its own field (never merged into
    // signatures, never substituting the logo). Sourced from brand.seal_url; the template only
    // controls its size/position via config.fields.seal.
    setCertImg(document.getElementById(idMap.seal), showSeal && brand && brand.seal_url ? brand.seal_url : null);

    if (!brand || !sigHolder) return;
    const labels = Object.assign({}, brand.signature_labels || {});
    const sigFlags = (config && config._signatures) || {};
    if (sigFlags.founder_label) labels.founder = sigFlags.founder_label;
    if (sigFlags.president_label) labels.president = sigFlags.president_label;
    if (sigFlags.society_label) labels.society = sigFlags.society_label;
    if (sigFlags.chapter_label) labels.chapter = sigFlags.chapter_label;
    const flagMap = {
      founder: sigFlags.show_founder_signature,
      president: sigFlags.show_president_signature,
      society: sigFlags.show_society_signature,
      chapter: sigFlags.show_chapter_signature,
      course_admin: sigFlags.show_course_admin_signature
    };
    const order = (brand.signature_order && brand.signature_order.length) ? brand.signature_order
      : ['founder', 'president', 'society', 'chapter', 'course_admin'];
    const urlMap = {
      founder: brand.founder_signature_url,
      president: brand.president_signature_url,
      society: brand.society_signature_url,
      chapter: brand.chapter_signature_url,
      course_admin: brand.course_admin_signature_url
    };
    const defaultLabels = { founder: 'Founder', president: 'President', society: 'Society', chapter: 'Chapter', course_admin: 'Course Administrator' };
    const nameMap = {
      founder: brand.founder_name || '',
      president: '',
      society: orgLogos.society_name || '',
      chapter: orgLogos.chapter_name || '',
      course_admin: ''
    };
    const LEFT_KEYS = ['founder', 'president'];
    if (areaId === 'certificatePrintArea' || areaId === 'ctplPreview') sigHolder.innerHTML = '';
    const leftWrap = document.createElement('div');
    leftWrap.className = 'cert-sig-group cert-sig-left';
    leftWrap.style.cssText = 'display:flex;gap:1.1rem;flex-wrap:wrap;';
    const rightWrap = document.createElement('div');
    rightWrap.className = 'cert-sig-group cert-sig-right';
    rightWrap.style.cssText = 'display:flex;gap:1.1rem;flex-wrap:wrap;';
    sigHolder.appendChild(leftWrap);
    sigHolder.appendChild(rightWrap);
    order.forEach(key => {
      const url = urlMap[key];
      if (!url) return;
      if (flagMap[key] === false) return;
      const label = labels[key] || defaultLabels[key] || (key.charAt(0).toUpperCase() + key.slice(1));
      const name = nameMap[key] || '';
      const block = document.createElement('div');
      block.className = 'cert-sig-block';
      block.innerHTML = '<img src="' + url + '" alt="" /><div>' + sanitize(name || label) + '</div>' +
        (name ? '<div>' + sanitize(label) + '</div>' : '');
      (LEFT_KEYS.indexOf(key) !== -1 ? leftWrap : rightWrap).appendChild(block);
    });
  }

  /* ── Shared renderer: populates the certificate view/print area for a given certificate row
     and its member profile, applies its template + signatures, and opens the modal.
     Used by both the admin "view certificate" action AND the public ?verify_cert= flow,
     so a public visitor sees the same templated design an admin would.
     `token` is the caller's active-request token (see _certRenderToken below) — if a newer
     certificate view has started by the time our async work finishes, we discard our result
     instead of overwriting whatever the newer view already rendered. ── */
  // Professional default certificate statement, used only when certificates.certificate_body
  // is empty. Kept language-aware (English/Urdu) so it always matches the template's own
  // language/direction rather than mixing scripts on one certificate.
  function defaultCertificateBody(c, isUrCert) {
    if (isUrCert) {
      return 'مندرجہ بالا شخص نے ' + (c.program_name || c.certificate_type || 'اس پروگرام') +
        ' کامیابی سے مکمل کیا اور مقررہ معیار پر پورا اترے، جس پر یہ سرٹیفکیٹ جاری کیا جاتا ہے۔';
    }
    return 'has successfully completed the requirements of ' + (c.program_name || c.certificate_type || 'this program') +
      ' and is hereby awarded this certificate in recognition of that achievement.';
  }

  async function renderCertificateView(c, prof, token) {
    if (token !== _certRenderToken) return; // a newer certificate view has already started

    // Resolve template + brand + the actual Society/Chapter/Course names first, so every
    // field (including the language-aware body statement) is populated in one consistent pass.
    const [{ data: brand }, tmplRes, socRes, chapRes, courseRes] = await Promise.all([
      sb.from('brand_settings').select('*').limit(1).maybeSingle(),
      c.template_id ? sb.from('certificate_templates').select('config').eq('id', c.template_id).maybeSingle() : Promise.resolve({ data: null }),
      c.society_id ? sb.from('societies').select('name, logo_url').eq('id', c.society_id).maybeSingle() : Promise.resolve({ data: null }),
      c.chapter_id ? sb.from('chapters').select('name, logo_url').eq('id', c.chapter_id).maybeSingle() : Promise.resolve({ data: null }),
      c.course_id ? sb.from('courses').select('title').eq('id', c.course_id).maybeSingle() : Promise.resolve({ data: null })
    ]);
    if (token !== _certRenderToken) return; // stale by the time everything resolved — discard
    const templateConfig = tmplRes && tmplRes.data ? tmplRes.data.config : null;
    const norm = normalizeCertificateConfig(templateConfig);
    const content = norm._content || {};
    const isUrCert = !!(templateConfig && templateConfig.language === 'ur');
    const memberName = prof ? prof.full_name : '';
    const memberId = prof ? (prof.member_id || '') : '';
    const courseTitle = (courseRes && courseRes.data && courseRes.data.title) || c.program_name || '';
    const orgLogos = {
      society_logo_url: socRes && socRes.data && socRes.data.logo_url,
      chapter_logo_url: chapRes && chapRes.data && chapRes.data.logo_url,
      society_name: socRes && socRes.data && socRes.data.name,
      chapter_name: chapRes && chapRes.data && chapRes.data.name
    };

    const titleText = (content.show_certificate_title === false)
      ? ''
      : (c.certificate_title || content.certificate_title || '');
    document.getElementById('vcTitle').textContent = titleText || '—';
    const presented = document.getElementById('vcPresentedLabel');
    if (presented) presented.textContent = isUrCert ? 'یہ تصدیق کی جاتی ہے کہ' : 'This is to certify that';
    const kicker = document.getElementById('vcKicker');
    if (kicker) kicker.textContent = isUrCert ? 'سرکاری سرٹیفکیٹ' : 'Official Certificate';
    const issuedLabel = document.getElementById('vcIssuedLabel');
    if (issuedLabel) issuedLabel.textContent = content.issue_date_label || (isUrCert ? 'تاریخ اجراء' : 'Issued Date');
    const certNoLabel = document.getElementById('vcCertNoLabel');
    if (certNoLabel) certNoLabel.textContent = content.certificate_id_label || (isUrCert ? 'سرٹیفکیٹ نمبر' : 'Certificate No.');
    const idEl = document.getElementById('vcId');
    idEl.textContent = content.show_certificate_id === false ? '' : (c.certificate_id || '—');
    if (content.show_certificate_id === false && certNoLabel) certNoLabel.style.display = 'none';
    else if (certNoLabel) certNoLabel.style.display = '';

    const memberEl = document.getElementById('vcMember');
    if (content.show_recipient_name === false) {
      memberEl.textContent = '';
      memberEl.style.display = 'none';
    } else {
      memberEl.style.display = '';
      memberEl.textContent = memberName ? (memberName + (memberId ? ' · ' + memberId : '')) : '—';
    }

    let bodyText = (c.certificate_body && c.certificate_body.trim()) || '';
    if (!bodyText && content.body_text && content.body_text.indexOf('{{member_name}}') === -1) {
      bodyText = content.body_text
        .replaceAll('{{program_name}}', c.program_name || courseTitle || '')
        .replaceAll('{{course_name}}', courseTitle || '');
    }
    document.getElementById('vcBody').textContent = bodyText || defaultCertificateBody(c, isUrCert);

    const orgBits = [];
    if (orgLogos.society_name) orgBits.push(orgLogos.society_name);
    if (orgLogos.chapter_name) orgBits.push(orgLogos.chapter_name);
    const courseRowEl = document.getElementById('vcCourseRow');
    const showCourse = content.show_course_name !== false;
    courseRowEl.textContent = showCourse
      ? [courseTitle, orgBits.join(isUrCert ? ' — ' : ' · ')].filter(Boolean).join(isUrCert ? ' · ' : ' · ')
      : orgBits.join(isUrCert ? ' — ' : ' · ');

    let metaText = '';
    if (content.show_grade !== false && c.grade) metaText += (isUrCert ? 'گریڈ: ' : 'Grade: ') + c.grade;
    if (content.show_duration !== false && c.duration) metaText += (metaText ? ' · ' : '') + (isUrCert ? 'دورانیہ: ' : 'Duration: ') + c.duration;
    if (c.completion_date) metaText += (metaText ? ' · ' : '') + (isUrCert ? 'تکمیل: ' : 'Completed: ') + c.completion_date;
    document.getElementById('vcMeta').textContent = metaText;
    const issueEl = document.getElementById('vcIssueDate');
    if (content.show_issue_date === false) {
      issueEl.textContent = '';
      if (issuedLabel) issuedLabel.style.display = 'none';
    } else {
      if (issuedLabel) issuedLabel.style.display = '';
      issueEl.textContent = c.issue_date || '';
    }
    document.getElementById('vcExpiryDate').textContent = (content.show_expiry_date !== false && c.expiry_date)
      ? ((content.expiry_date_label || (isUrCert ? 'میعاد' : 'Expires')) + ': ' + c.expiry_date)
      : '';

    const sc = certStatusColor(c.status);
    const badge = document.getElementById('vcStatusBadge');
    badge.textContent = sc.label;
    badge.style.background = sc.bg;
    badge.style.color = '#fff';

    const verifyUrl = c.qr_code_data || (window.location.origin + window.location.pathname + '?verify_cert=' + encodeURIComponent(c.certificate_id));
    const qrHost = document.getElementById('vcQrCode');
    if (content.show_qr_code === false) {
      if (qrHost) qrHost.innerHTML = '';
    } else {
      renderCertQR('vcQrCode', verifyUrl);
    }

    applyCertificateTemplate(templateConfig, brand, 'certificatePrintArea', CERT_FIELD_IDS, orgLogos);

    openModal('viewCertificateModal');
  }

  var _certRenderToken = 0;
  async function viewCertificate(id) {
    const myToken = ++_certRenderToken;
    const { data: c, error } = await sb
      .from('certificates')
      .select('certificate_id, member_id, certificate_title, certificate_type, issue_date, expiry_date, status, qr_code_data, template_id, course_id, completion_date, grade, duration, program_name, society_id, chapter_id, certificate_body')
      .eq('id', id)
      .single();

    if (myToken !== _certRenderToken) return; // a newer certificate view started while this was loading
    if (error || !c) { showToast('سرٹیفکیٹ لوڈ نہیں ہو سکا', 'error'); return; }

    const { data: prof, error: profError } = await sb.from('profiles').select('full_name, member_id').eq('id', c.member_id).single();
    if (profError) console.error('[Certificate] profile fetch failed for member_id', c.member_id, profError);
    if (myToken !== _certRenderToken) return; // stale — a newer view has since started
    await renderCertificateView(c, prof, myToken);
  }

  /* ══════════════════════════════════════════════════════════════════════
     PHASE 1 — OFFICIAL DOCUMENT SYSTEM (Notes / Appointments / Removal /
     Termination / Invitations), built on the new `generated_documents`
     table. Shares the SHAOOR/Society/Chapter branding already stored in
     brand_settings + chapters.logo_url — the same source certificates use —
     and reuses the exact popup-print-to-PDF pattern already proven by
     downloadCertificateAsPDF(), so behaviour stays consistent across the app.
     ══════════════════════════════════════════════════════════════════════ */

  const DOC_TYPE_LABELS = {
    note: 'Official Note',
    appointment: 'Appointment Letter',
    removal: 'Removal / Termination Letter',
    invitation: 'Invitation Letter'
  };

  // Which optional field-groups are relevant per document type — keeps the form
  // from asking for irrelevant information (per the branding-hierarchy / "don't force
  // fields where they don't belong" rule in the Phase 1 spec).
  const DOC_TYPE_FIELD_GROUPS = {
    note: ['docRecipientGroup'],
    appointment: ['docRecipientGroup', 'docDesignationGroup', 'docEffectiveDateGroup'],
    removal: ['docRecipientGroup', 'docDesignationGroup', 'docEffectiveDateGroup'],
    invitation: ['docRecipientGroup', 'docEventNameGroup', 'docEventDateGroup', 'docEventTimeGroup', 'docVenueGroup']
  };
  const ALL_DOC_OPTIONAL_GROUPS = ['docRecipientGroup', 'docDesignationGroup', 'docEffectiveDateGroup', 'docEventNameGroup', 'docEventDateGroup', 'docEventTimeGroup', 'docVenueGroup'];

  function onDocumentTypeChange() {
    const type = document.getElementById('docType').value;
    const visible = DOC_TYPE_FIELD_GROUPS[type] || [];
    ALL_DOC_OPTIONAL_GROUPS.forEach(gid => {
      const el = document.getElementById(gid);
      if (el) el.style.display = visible.includes(gid) ? '' : 'none';
    });
  }

  var _docDropdownsPopulated = false;
  async function populateDocumentDropdowns() {
    const memberSel = document.getElementById('docMemberSelect');
    const socSel = document.getElementById('docSocietySelect');
    const chapSel = document.getElementById('docChapterSelect');
    if (memberSel) {
      const prev = memberSel.value;
      memberSel.innerHTML = '<option value="">\u2014 No specific member \u2014</option>';
      const { data: members } = await sb.from('profiles').select('id, full_name, member_id').order('full_name');
      (members || []).forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id; opt.textContent = m.full_name + (m.member_id ? ' (' + m.member_id + ')' : '');
        memberSel.appendChild(opt);
      });
      if (prev) memberSel.value = prev;
    }
    if (socSel) {
      const prevS = socSel.value;
      socSel.innerHTML = '<option value="">\u2014 No specific society \u2014</option>';
      const { data: socs } = await sb.from('societies').select('id, name').order('name');
      (socs || []).forEach(s => { const o = document.createElement('option'); o.value = s.id; o.textContent = s.name; socSel.appendChild(o); });
      if (prevS) socSel.value = prevS;
    }
    if (chapSel) {
      const prevC = chapSel.value;
      chapSel.innerHTML = '<option value="">\u2014 No specific chapter \u2014</option>';
      const { data: chaps } = await sb.from('chapters').select('id, name').order('name');
      (chaps || []).forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = c.name; chapSel.appendChild(o); });
      if (prevC) chapSel.value = prevC;
    }
    // Designation datalist — sourced from real, existing cabinet_members.position values only
    // (never invented labels), so the field behaves like a dropdown of actual designations
    // in use while still allowing a free-text one-off if genuinely needed.
    const desigList = document.getElementById('docDesignationOptions');
    if (desigList) {
      const { data: cabRows } = await sb.from('cabinet_members').select('position');
      const uniquePositions = [...new Set((cabRows || []).map(r => r.position).filter(Boolean))];
      desigList.innerHTML = uniquePositions.map(p => `<option value="${sanitize(p)}"></option>`).join('');
    }
    _docDropdownsPopulated = true;
  }

  // When a member is picked from the dropdown, auto-fill the Recipient name from their
  // real profile — the admin can still overwrite it, but it's never left to be retyped.
  function onDocMemberSelected() {
    const sel = document.getElementById('docMemberSelect');
    const recipientField = document.getElementById('docRecipient');
    if (!sel || !recipientField || !sel.value) return;
    const label = sel.options[sel.selectedIndex].textContent || '';
    // label is "Full Name (MEMBER-ID)" — strip the trailing "(...)" to get just the name
    recipientField.value = label.replace(/\s*\([^)]*\)\s*$/, '').trim();
  }

  // Context-aware entry point for the ONE existing Generated Documents modal.
  // `ctx` is optional and every key is optional — this is what lets Society /
  // Society Member / Leadership / Central Cabinet / Event entry points reuse
  // the exact same modal, dropdowns, DOC_TYPE_FIELD_GROUPS, numbering and save
  // logic instead of a second document system. Called with no args (the plain
  // "New Document" button) it behaves exactly as before.
  async function openGeneratedDocumentModal(ctx) {
    ctx = ctx || {};
    await populateDocumentDropdowns();
    document.getElementById('documentForm').reset();
    document.getElementById('docId').value = '';
    document.getElementById('docType').value = ctx.docType || 'note';
    onDocumentTypeChange();

    const socSel = document.getElementById('docSocietySelect');
    if (socSel && ctx.societyId) socSel.value = ctx.societyId;
    const chapSel = document.getElementById('docChapterSelect');
    if (chapSel && ctx.chapterId) chapSel.value = ctx.chapterId;

    const memberSel = document.getElementById('docMemberSelect');
    if (memberSel && ctx.memberId) {
      memberSel.value = ctx.memberId;
      // Only follow through if the member actually exists in the dropdown
      // (guards against a stale/removed profile id being passed in).
      if (memberSel.value === ctx.memberId) onDocMemberSelected();
    }
    // Recipient name as plain text fallback — used when there is a real name
    // (e.g. from an Event's stored data) but no matching profile id to select.
    const recipientField = document.getElementById('docRecipient');
    if (recipientField && ctx.recipientName && !ctx.memberId) recipientField.value = ctx.recipientName;

    const desigField = document.getElementById('docDesignation');
    if (desigField && ctx.designation) desigField.value = ctx.designation;

    const evNameField = document.getElementById('docEventName');
    if (evNameField && ctx.eventName) evNameField.value = ctx.eventName;
    const evDateField = document.getElementById('docEventDate');
    if (evDateField && ctx.eventDate) evDateField.value = ctx.eventDate;
    const evTimeField = document.getElementById('docEventTime');
    if (evTimeField && ctx.eventTime) evTimeField.value = ctx.eventTime;
    const venueField = document.getElementById('docVenue');
    if (venueField && ctx.venue) venueField.value = ctx.venue;

    openModal('documentModal');
  }

  /* ── Organizational entry points — each is a thin wrapper that gathers real,
     already-existing context and hands it to the ONE openGeneratedDocumentModal()
     above. No new modal, no new document system. ── */

  // Society row (Organization panel) — prefills society, defaults to Note.
  function openDocumentForSociety(societyId) {
    openGeneratedDocumentModal({ societyId, docType: 'note' });
  }

  // Society Member row (All Members panel) — uses the same _membersCache the
  // table itself was rendered from, so no extra query is needed.
  function openDocumentForMember(memberId) {
    const m = (_membersCache || []).find(x => x.id === memberId);
    openGeneratedDocumentModal({
      memberId,
      societyId: m ? m.society_id : undefined,
      chapterId: m ? m.chapter_id : undefined,
      docType: 'note'
    });
  }

  /* Admin → Members → Documents.
     ROOT CAUSE of "a form appears instead of the document": the Members table's
     Document button called openDocumentForMember() directly, which opens the blank
     CREATION modal. This function instead lists that member's ACTUAL issued rows
     from generated_documents, and View/Download reuse the very same
     viewGeneratedDocument()/downloadRowDocument() functions the Official Documents
     screen already uses — so the real, populated document is rendered and printed.
     The creation form is still reachable, but only via an explicit "New Document". */
  async function openMemberDocumentsAdmin(memberId) {
    const listEl = document.getElementById('memberDocsList');
    const whoEl  = document.getElementById('memberDocsWho');
    const newBtn = document.getElementById('memberDocsNewBtn');
    if (!listEl) { openDocumentForMember(memberId); return; } // defensive fallback only
    const m = (_membersCache || []).find(x => x.id === memberId);
    if (whoEl) whoEl.textContent = (m ? (m.full_name || '—') : '—') + (m && m.member_id ? ' · ' + m.member_id : '');
    if (newBtn) newBtn.onclick = function () { closeModal('memberDocsModal'); openDocumentForMember(memberId); };
    listEl.innerHTML = '<div style="color:var(--muted);font-size:.9rem;text-align:center;padding:1rem;">لوڈ ہو رہا ہے…</div>';
    openModal('memberDocsModal');

    const { data: docs, error } = await sb
      .from('generated_documents')
      .select('id, document_number, document_type, title, status, created_at')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });

    if (error) {
      listEl.innerHTML = '<div style="color:var(--ruby);font-size:.9rem;text-align:center;padding:1rem;">لوڈ نہیں ہو سکا: ' + sanitize(error.message) + '</div>';
      return;
    }
    if (!docs || docs.length === 0) {
      listEl.innerHTML = '<div style="color:var(--muted);font-size:.9rem;text-align:center;padding:1rem;">اس ممبر کے لیے ابھی کوئی دستاویز جاری نہیں ہوئی۔</div>';
      return;
    }
    listEl.innerHTML = docs.map(d => {
      const statusBg = d.status === 'issued' ? 'var(--teal)' : d.status === 'draft' ? '#9ca3af' : 'var(--muted)';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:.9rem 1rem;border:1px solid var(--border);border-radius:10px;flex-wrap:wrap;gap:.5rem;">
        <div>
          <div style="font-weight:600;">${sanitize(d.title || '—')}</div>
          <div style="font-size:.78rem;color:var(--muted);">${sanitize(d.document_type || '—')} · ${sanitize(d.document_number || '—')} · ${sanitize((d.created_at || '').slice(0,10))}</div>
        </div>
        <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;">
          <span class="status-pill" style="background:${statusBg};color:#fff;font-size:.72rem;">${sanitize(d.status || '—')}</span>
          <button class="btn btn-outline" style="padding:.35rem .8rem;font-size:.78rem;" onclick="closeModal('memberDocsModal');viewGeneratedDocument('${d.id}')">View</button>
          <button class="btn btn-outline" style="padding:.35rem .8rem;font-size:.78rem;" onclick="downloadRowDocument('${d.id}')">Download</button>
          <button class="btn btn-outline" style="padding:.35rem .8rem;font-size:.78rem;" onclick="closeModal('memberDocsModal');editGeneratedDocument('${d.id}')">Edit</button>
        </div>
      </div>`;
    }).join('');
  }
  window.openMemberDocumentsAdmin = openMemberDocumentsAdmin;

  // Society/Chapter leadership seat (Chapter Manage modal → cabinet list) —
  // prefills member, society, chapter and designation (=seat role); defaults
  // to Appointment since that is the primary leadership document type.
  function openDocumentForLeadership(memberId, role, societyId, chapterId) {
    openGeneratedDocumentModal({
      memberId, designation: role || '', societyId, chapterId,
      docType: 'appointment'
    });
  }

  // Central Cabinet seat — organization-wide, no society/chapter context.
  function openDocumentForCentralCabinet(memberId, position) {
    openGeneratedDocumentModal({ memberId, designation: position || '', docType: 'appointment' });
  }

  // Event row — prefills the Invitation fields already stored on the event.
  // events.society/chapter are free-text (not FK columns — see Phase-1 known-issue
  // notes), so society_id is only set when the text exactly matches an existing
  // society name; otherwise it's left for the admin to pick, rather than guessing.
  async function openDocumentForEvent(eventId) {
    const { data: ev, error } = await sb.from('events').select('title, event_date, venue, society').eq('id', eventId).single();
    if (error || !ev) { showToast('Event لوڈ نہیں ہو سکا', 'error'); return; }
    let societyId;
    if (ev.society) {
      const { data: match } = await sb.from('societies').select('id').eq('name', ev.society).maybeSingle();
      if (match) societyId = match.id;
    }
    openGeneratedDocumentModal({
      docType: 'invitation',
      eventName: ev.title || '',
      eventDate: ev.event_date || '',
      venue: ev.venue || '',
      societyId
    });
  }

  async function editGeneratedDocument(id) {
    if (!(await requireStaff())) return;
    await populateDocumentDropdowns();
    const { data: d, error } = await sb.from('generated_documents').select('*').eq('id', id).single();
    if (error || !d) { showToast('دستاویز لوڈ نہیں ہو سکی', 'error'); return; }
    document.getElementById('docId').value = d.id;
    document.getElementById('docType').value = d.document_type;
    onDocumentTypeChange();
    document.getElementById('docMemberSelect').value = d.member_id || '';
    document.getElementById('docSocietySelect').value = d.society_id || '';
    document.getElementById('docChapterSelect').value = d.chapter_id || '';
    document.getElementById('docTitle').value = d.title || '';
    document.getElementById('docLanguage').value = (d.extra && d.extra.language) || 'en';
    document.getElementById('docRecipient').value = d.recipient || '';
    document.getElementById('docDesignation').value = d.designation || '';
    document.getElementById('docEffectiveDate').value = d.effective_date || '';
    document.getElementById('docEventName').value = d.event_name || '';
    document.getElementById('docEventDate').value = d.event_date || '';
    document.getElementById('docEventTime').value = d.event_time || '';
    document.getElementById('docVenue').value = d.venue || '';
    document.getElementById('docSubject').value = d.subject || '';
    document.getElementById('docBody').value = d.body || '';
    document.getElementById('docAuthority').value = d.authority || '';
    const sigKeys = (d.extra && d.extra.signature_keys) || [];
    Array.from(document.getElementById('docSignatureKeys').options).forEach(o => { o.selected = sigKeys.includes(o.value); });
    const ex = d.extra || {};
    document.getElementById('docPaperSize').value = ex.paper_size || 'a4';
    document.getElementById('docOrientation').value = ex.orientation || 'portrait';
    document.getElementById('docLogoWidth').value = ex.logo_width || '';
    document.getElementById('docLogoAlign').value = ex.logo_align || 'left';
    document.getElementById('docHeaderSpacing').value = (ex.header_spacing != null) ? ex.header_spacing : '';
    document.getElementById('docSealWidth').value = ex.seal_width || '';
    openModal('documentModal');
  }

  async function deleteGeneratedDocument(id) {
    if (!(await requireStaff())) return;
    if (!confirm('کیا آپ واقعی یہ دستاویز حذف کرنا چاہتے ہیں؟')) return;
    const { error } = await sb.from('generated_documents').delete().eq('id', id);
    if (error) { showToast('حذف نہیں ہو سکا: ' + error.message, 'error'); return; }
    showToast('دستاویز حذف کر دی گئی۔');
    loadGeneratedDocumentsAdmin();
  }

  window.addEventListener('DOMContentLoaded', () => secureSubmit('documentForm', async frm => {
    if (!(await requireStaff())) return;
    const id = frm.querySelector('#docId').value || null;
    const document_type = frm.querySelector('#docType').value;
    const signatureKeys = Array.from(frm.querySelector('#docSignatureKeys').selectedOptions).map(o => o.value);
    const payload = {
      document_type,
      member_id: frm.querySelector('#docMemberSelect').value || null,
      society_id: frm.querySelector('#docSocietySelect').value || null,
      chapter_id: frm.querySelector('#docChapterSelect').value || null,
      title: frm.querySelector('#docTitle').value.trim(),
      recipient: frm.querySelector('#docRecipient').value.trim() || null,
      designation: frm.querySelector('#docDesignation').value.trim() || null,
      effective_date: frm.querySelector('#docEffectiveDate').value || null,
      event_name: frm.querySelector('#docEventName').value.trim() || null,
      event_date: frm.querySelector('#docEventDate').value || null,
      event_time: frm.querySelector('#docEventTime').value || null,
      venue: frm.querySelector('#docVenue').value.trim() || null,
      subject: frm.querySelector('#docSubject').value.trim() || null,
      body: frm.querySelector('#docBody').value.trim(),
      authority: frm.querySelector('#docAuthority').value.trim() || null,
      extra: {
        signature_keys: signatureKeys,
        language: frm.querySelector('#docLanguage').value || 'en',
        paper_size: frm.querySelector('#docPaperSize').value || 'a4',
        orientation: frm.querySelector('#docOrientation').value || 'portrait',
        logo_width: frm.querySelector('#docLogoWidth').value.trim() || null,
        logo_align: frm.querySelector('#docLogoAlign').value || 'left',
        header_spacing: frm.querySelector('#docHeaderSpacing').value.trim() || null,
        seal_width: frm.querySelector('#docSealWidth').value.trim() || null
      }
    };

    let error;
    if (id) {
      // Editing an existing document must never touch its status — the form has no
      // status control, so silently resetting it here would clobber a document that
      // was already 'revoked' or 'archived' back to an active-looking state.
      ({ error } = await sb.from('generated_documents').update(payload).eq('id', id));
    } else {
      // document_number is generated server-side (generate_document_number RPC) so numbering
      // stays sequential and collision-free even with concurrent admins — never assigned client-side.
      const { data: numData, error: numErr } = await sb.rpc('generate_document_number', { doc_type: document_type });
      if (numErr) { showToast('Document number تیار نہیں ہو سکا: ' + numErr.message, 'error'); return; }
      payload.document_number = numData;
      // DB check constraint (generated_documents_status_check) only allows
      // draft / issued / revoked / archived — a freshly created document is 'issued'.
      payload.status = 'issued';
      ({ error } = await sb.from('generated_documents').insert(payload));
    }
    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }
    showToast('✓ دستاویز محفوظ ہو گئی');
    closeModal('documentModal');
    loadGeneratedDocumentsAdmin();
  }));

  function documentStatusColor(status) {
    switch (status) {
      case 'revoked': return { bg: 'var(--ruby)', label: 'Revoked' };
      case 'draft': return { bg: 'var(--muted)', label: 'Draft' };
      case 'archived': return { bg: 'var(--navy)', label: 'Archived' };
      case 'issued': return { bg: 'var(--teal)', label: 'Issued' };
      default: return { bg: 'var(--teal)', label: sanitize(status || 'Issued') };
    }
  }

  var _generatedDocumentsCache = [];

  async function loadGeneratedDocumentsAdmin() {
    const tbody = document.getElementById('generatedDocumentsBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.5rem;">Loading documents…</td></tr>';

    const { data, error } = await sb
      .from('generated_documents')
      .select('id, document_number, document_type, title, recipient, status, created_at, societies(name), chapters(name)')
      .order('created_at', { ascending: false });

    if (error) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--ruby);padding:1.5rem;">Failed to load: ' + sanitize(error.message) + '</td></tr>';
      _generatedDocumentsCache = [];
      return;
    }
    _generatedDocumentsCache = data || [];
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.5rem;">ابھی کوئی دستاویز نہیں بنائی گئی۔</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(d => {
      const sc = documentStatusColor(d.status);
      const societyChapter = [(d.societies ? d.societies.name : null), (d.chapters ? d.chapters.name : null)].filter(Boolean).join(' · ') || '—';
      return `<tr>
        <td>${sanitize(d.document_number || '—')}</td>
        <td>${sanitize(DOC_TYPE_LABELS[d.document_type] || d.document_type)}</td>
        <td>${sanitize(d.title || '—')}${d.recipient ? '<br><span style="font-size:.72rem;color:var(--muted);">' + sanitize(d.recipient) + '</span>' : ''}</td>
        <td>${sanitize(societyChapter)}</td>
        <td>${sanitize((d.created_at || '').slice(0, 10))}</td>
        <td><span class="status-pill" style="background:${sc.bg};color:#fff;">${sc.label}</span></td>
        <td style="display:flex;gap:.4rem;flex-wrap:wrap;">
          <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;" onclick="viewGeneratedDocument('${d.id}')">View</button>
          <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--navy);" onclick="editGeneratedDocument('${d.id}')">Edit</button>
          <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--teal);" onclick="downloadRowDocument('${d.id}')"><i class="fas fa-download"></i> Download</button>
          <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--ruby);" onclick="deleteGeneratedDocument('${d.id}')">Delete</button>
        </td>
      </tr>`;
    }).join('');
  }

  /* ── Shared branding building blocks — reused by every document type, so a fix or
     style change here fixes it everywhere at once, per the "shared renderer" requirement.
     `extra` (generated_documents.extra, already used for signature_keys) now also carries
     admin-controlled logo/seal size, logo alignment, and header spacing — the header
     structure and brand.logo_url/seal_url sourcing themselves are unchanged. ── */
  function renderDocumentHeader(brand, society, chapter, docTitle, docNumber, docDate, extra, lang) {
    extra = extra || {};
    lang = lang || 'en';
    const isUr = lang === 'ur';
    const logoWidth = extra.logo_width || 130;
    const logoAlign = extra.logo_align || 'left';
    const spacing = (extra.header_spacing != null && extra.header_spacing !== '') ? extra.header_spacing : 13;
    const justify = logoAlign === 'center' ? 'center' : (logoAlign === 'right' ? 'flex-end' : 'flex-start');
    const orgLogo = brand && brand.logo_url
      ? `<img src="${brand.logo_url}" style="max-width:${logoWidth}px;max-height:${Math.round(logoWidth * 0.75)}px;object-fit:contain;" />`
      : '';
    const urduMark = `<div style="font-family:var(--ff-urdu);font-size:1.35rem;font-weight:700;color:var(--navy);line-height:1.2;">شعور</div>`;
    const socLogo = (society && society.logo_url)
      ? `<img src="${society.logo_url}" style="height:44px;max-width:96px;object-fit:contain;" alt="" />`
      : '';
    const chapLogo = (chapter && chapter.logo_url)
      ? `<img src="${chapter.logo_url}" style="height:44px;max-width:96px;object-fit:contain;" alt="" />`
      : '';
    const rightLogo = `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:.25rem;">${urduMark}<div style="display:flex;gap:.4rem;align-items:center;justify-content:flex-end;">${socLogo}${chapLogo}</div></div>`;
    // Only the actual uploaded SHAOOR logo carries the brand mark here — the previously
    // duplicated "شعور" text line that sat beneath the organization name has been removed
    // per the "clean header, one visual identity" requirement. The organization name/title
    // itself is genuine document heading content and stays.
    const subtitle = isUr
      ? 'پیشہ ورانہ فنون و ثقافت کی تنظیم'
      : 'Professional Arts &amp; Culture Organization';
    const refLabel = isUr ? 'حوالہ نمبر' : 'Ref';
    const dateLabel = isUr ? 'تاریخ' : 'Date';
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid var(--navy);padding-bottom:${spacing}px;margin-bottom:${spacing * 1.5}px;">
        <div style="width:190px;display:flex;align-items:center;justify-content:${justify};">${orgLogo}</div>
        <div style="text-align:center;flex:1;">
          <div style="font-family:Georgia,serif;font-weight:700;font-size:1.4rem;letter-spacing:.06em;color:var(--navy);">${sanitize((brand && brand.organization_name) || 'SHAOOR')}</div>
          <div style="font-size:.72rem;color:#555;letter-spacing:.04em;${isUr ? "font-family:var(--ff-urdu);font-size:.85rem;line-height:1.9;" : ""}">${isUr ? sanitize(subtitle) : subtitle}</div>
        </div>
        <div style="width:190px;display:flex;align-items:center;justify-content:flex-end;">${rightLogo}</div>
      </div>
      <div style="text-align:center;margin-bottom:1.2rem;">
        <div style="font-family:${isUr ? 'var(--ff-urdu)' : 'Georgia,serif'};font-weight:700;font-size:${isUr ? '1.35rem' : '1.15rem'};text-transform:${isUr ? 'none' : 'uppercase'};letter-spacing:.05em;line-height:${isUr ? '2' : '1.4'};">${sanitize(docTitle)}</div>
        <div style="font-size:.75rem;color:#666;margin-top:.2rem;" dir="ltr">${sanitize(refLabel)}: ${sanitize(docNumber || '—')} &nbsp;·&nbsp; ${sanitize(dateLabel)}: ${sanitize(docDate || '—')}</div>
      </div>`;
  }

  function renderDocumentSignatures(brand, selectedKeys, authorityLabel, extra, lang) {
    extra = extra || {};
    lang = lang || 'en';
    const isUr = lang === 'ur';
    const sealCaption = isUr ? 'سرکاری مہر' : 'Official Seal';
    const sealWidth = extra.seal_width || 80;
    if (!brand || !selectedKeys || !selectedKeys.length) {
      // Even with no signatures selected, the seal (a separate authentication mark) may
      // still need to render on its own.
      if (!brand || !brand.seal_url) return '';
      return `<div style="display:flex;justify-content:center;align-items:flex-end;margin-top:2.5rem;">
        <div style="text-align:center;">
          <img src="${brand.seal_url}" style="height:${sealWidth}px;width:${sealWidth}px;object-fit:contain;display:block;margin:0 auto .3rem;" alt="Official Seal" />
          <div style="font-size:.68rem;color:#666;border-top:1px solid #999;padding-top:.2rem;min-width:100px;${isUr ? 'font-family:var(--ff-urdu);' : ''}">${sanitize(sealCaption)}</div>
        </div>
      </div>`;
    }
    const labels = brand.signature_labels || {};
    const urlMap = {
      founder: brand.founder_signature_url, president: brand.president_signature_url,
      society: brand.society_signature_url, chapter: brand.chapter_signature_url
    };
    const nameFor = { founder: brand.founder_name || '', president: '', society: (window._docSocietyName || ''), chapter: (window._docChapterName || '') };
    const blocks = selectedKeys.filter(k => urlMap[k]).map(k => {
      const label = labels[k] || (k.charAt(0).toUpperCase() + k.slice(1));
      const shownName = nameFor[k] || '';
      const caption = shownName
        ? `${sanitize(shownName)}<br>${sanitize(authorityLabel || label)}`
        : sanitize(authorityLabel || label);
      return `<div style="text-align:center;">
        <img src="${urlMap[k]}" style="height:44px;object-fit:contain;display:block;margin:0 auto .3rem;" />
        <div style="font-size:.72rem;border-top:1px solid #999;padding-top:.2rem;min-width:120px;${isUr ? 'font-family:var(--ff-urdu);font-size:.85rem;' : ''}">${caption}</div>
      </div>`;
    }).join('');
    // Official seal — a separate authentication mark, not a signature. Rendered alongside
    // the signature blocks (never merged into any of them) so it stays independently
    // visible in preview, print, and download output. Gracefully omitted when unset.
    const sealBlock = (brand && brand.seal_url)
      ? `<div style="text-align:center;">
          <img src="${brand.seal_url}" style="height:${sealWidth}px;width:${sealWidth}px;object-fit:contain;display:block;margin:0 auto .3rem;" alt="Official Seal" />
          <div style="font-size:.68rem;color:#666;border-top:1px solid #999;padding-top:.2rem;min-width:100px;${isUr ? 'font-family:var(--ff-urdu);' : ''}">${sanitize(sealCaption)}</div>
        </div>`
      : '';
    if (!blocks && !sealBlock) return '';
    return `<div style="display:flex;justify-content:center;align-items:flex-end;gap:2.5rem;margin-top:2.5rem;flex-wrap:wrap;">${blocks}${sealBlock}</div>`;
  }

  function renderDocumentFooter(brand, docNumber, lang) {
    lang = lang || 'en';
    const isUr = lang === 'ur';
    const contact = [brand && brand.official_email, brand && brand.official_phone].filter(Boolean).join(' · ');
    const verifyUrl = docNumber
      ? window.location.origin + window.location.pathname + '?verify_doc=' + encodeURIComponent(docNumber)
      : '';
    const verifyTitle = isUr ? 'تصدیقِ اصلیت' : 'VERIFY AUTHENTICITY';
    const docIdLabel = isUr ? 'دستاویز نمبر' : 'Document ID';
    const verifyBlock = docNumber
      ? `<div style="margin-top:1rem;padding-top:.8rem;border-top:1px dashed #ccc;font-size:.72rem;color:#555;${isUr ? 'font-family:var(--ff-urdu);font-size:.85rem;' : ''}">
          <strong>${sanitize(verifyTitle)}</strong><br>
          <span dir="ltr" style="unicode-bidi:isolate;">${sanitize(docIdLabel)}: ${sanitize(docNumber)}<br>
          ${sanitize(verifyUrl)}</span>
        </div>`
      : '';
    const orgLine = (brand && brand.organization_name) ? sanitize(contact || `${brand.organization_name}${isUr ? '' : ' — Professional Arts & Culture Organization'}`) : sanitize(contact || 'SHAOOR — Professional Arts & Culture Organization');
    return `<div style="margin-top:2.5rem;border-top:1px solid #ccc;padding-top:.6rem;font-size:.68rem;color:#777;text-align:center;">
      ${orgLine}
      ${verifyBlock}
    </div>`;
  }

  // Builds the body HTML for each document type using only real, stored data —
  // never invented text — per the "do not invent information" rule.
  function renderDocumentBody(d, lang) {
    lang = lang || 'en';
    const isUr = lang === 'ur';
    const L = isUr ? {
      recipient: 'مستفید', designation: 'عہدہ', effective: 'تاریخ نفاذ',
      event: 'تقریب/پروگرام', date: 'تاریخ', time: 'وقت', venue: 'مقام', subject: 'موضوع'
    } : {
      recipient: 'Recipient', designation: 'Designation', effective: 'Effective Date',
      event: 'Event/Program', date: 'Date', time: 'Time', venue: 'Venue', subject: 'Subject'
    };
    const p = (label, val) => val ? `<div style="margin-bottom:.5rem;"><strong>${sanitize(label)}:</strong> ${sanitize(val)}</div>` : '';
    let meta = '';
    if (d.document_type === 'appointment' || d.document_type === 'removal') {
      meta = p(L.recipient, d.recipient) + p(L.designation, d.designation) + p(L.effective, d.effective_date);
    } else if (d.document_type === 'invitation') {
      meta = p(L.recipient, d.recipient) + p(L.event, d.event_name) + p(L.date, d.event_date) + p(L.time, d.event_time) + p(L.venue, d.venue);
    } else {
      meta = p(L.recipient, d.recipient);
    }
    const subject = d.subject ? `<div style="margin-bottom:1rem;"><strong>${sanitize(L.subject)}:</strong> ${sanitize(d.subject)}</div>` : '';
    const bodyText = sanitize(d.body || '').replace(/\n/g, '<br>');
    const bodyFont = isUr ? "font-family:var(--ff-urdu);line-height:2.1;font-size:1.05rem;" : "line-height:1.7;font-size:.92rem;";
    return `<div style="${bodyFont}" dir="${isUr ? 'rtl' : 'ltr'}">${meta}${subject}<div style="margin-top:.8rem;white-space:pre-wrap;">${bodyText}</div></div>`;
  }

  /* `token` is the caller's active-request token (see _docRenderToken below) — if a newer
     document view/download has started by the time our async work finishes, we discard our
     result instead of overwriting whatever the newer request already rendered. Returns
     true if the write happened, false if it was discarded as stale. */
  async function renderGeneratedDocumentView(d, token) {
    const [{ data: brand }, societyRes, chapterRes] = await Promise.all([
      sb.from('brand_settings').select('*').limit(1).maybeSingle(),
      d.society_id ? sb.from('societies').select('name, logo_url').eq('id', d.society_id).maybeSingle() : Promise.resolve({ data: null }),
      d.chapter_id ? sb.from('chapters').select('name, logo_url').eq('id', d.chapter_id).maybeSingle() : Promise.resolve({ data: null })
    ]);
    if (token !== _docRenderToken) return false; // a newer document view/download has since started
    const society = societyRes.data;
    const chapter = chapterRes.data;
    window._docSocietyName = society && society.name;
    window._docChapterName = chapter && chapter.name;
    const sigKeys = (d.extra && d.extra.signature_keys) || [];
    // Existing documents saved before this language field existed have no extra.language —
    // they must keep rendering exactly as before, so default safely to English.
    const lang = (d.extra && d.extra.language) || 'en';
    const isUr = lang === 'ur';
    // Cached so printGeneratedDocument/downloadGeneratedDocumentWord can size the real
    // print page (@page) to whatever paper size/orientation this document was saved with.
    window._lastDocExtra = d.extra || {};

    const html = renderDocumentHeader(brand, society, chapter, d.title, d.document_number, (d.created_at || '').slice(0, 10), d.extra, lang) +
      renderDocumentBody(d, lang) +
      renderDocumentSignatures(brand, sigKeys, d.authority, d.extra, lang) +
      renderDocumentFooter(brand, d.document_number, lang);

    const area = document.getElementById('documentPrintArea');
    area.innerHTML = html;
    // Language-aware layout: Urdu flips the whole document to RTL composition with
    // Nastaleeq typography; English keeps the existing LTR institutional layout untouched.
    area.setAttribute('dir', isUr ? 'rtl' : 'ltr');
    area.style.fontFamily = isUr ? "var(--ff-urdu)" : "Georgia,serif";
    return true;
  }

  var _docRenderToken = 0;
  var _currentViewedDocId = null;
  async function viewGeneratedDocument(id) {
    const myToken = ++_docRenderToken;
    const { data: d, error } = await sb.from('generated_documents').select('*').eq('id', id).single();
    if (myToken !== _docRenderToken) return; // a newer document view/download started while this loaded
    if (error || !d) { showToast('دستاویز لوڈ نہیں ہو سکی', 'error'); return; }
    _currentViewedDocId = id;
    const rendered = await renderGeneratedDocumentView(d, myToken);
    if (!rendered || myToken !== _docRenderToken) return; // stale — don't pop the modal for a superseded view
    openModal('viewDocumentModal');
  }

  // One-click download straight from the table row — no need to open View first.
  // Renders the document into the (hidden) print area, then triggers the same
  // popup-print-to-PDF flow the View modal's button uses.
  async function downloadRowDocument(id) {
    const myToken = ++_docRenderToken;
    const { data: d, error } = await sb.from('generated_documents').select('*').eq('id', id).single();
    if (myToken !== _docRenderToken) return; // superseded by a newer view/download click
    if (error || !d) { showToast('دستاویز لوڈ نہیں ہو سکی', 'error'); return; }
    const rendered = await renderGeneratedDocumentView(d, myToken);
    if (!rendered || myToken !== _docRenderToken) return; // stale — don't print a superseded render
    printGeneratedDocument();
  }

  // Same popup-window print/PDF technique as downloadCertificateAsPDF() — kept
  // identical so behaviour (and browser compatibility) stays consistent app-wide.
  function printGeneratedDocument() {
    const area = document.getElementById('documentPrintArea');
    if (!area || !area.innerHTML.trim()) { showToast('دستاویز دستیاب نہیں', 'error'); return; }
    const popup = window.open('', '_blank', 'width=1000,height=1200');
    if (!popup) { showToast('براوزر نے نئی ونڈو بلاک کر دی ہے۔', 'error'); return; }
    const extra = window._lastDocExtra || {};
    const pageCss = paperPageCss(extra.paper_size || 'a4', extra.orientation || 'portrait', 18);
    popup.document.open();
    popup.document.write('<!doctype html><html><head><meta charset="utf-8"><title>SHAOOR Document</title><style>'+pageCss+'body{background:#fff;font-family:Georgia,serif;}</style></head><body>' + area.outerHTML + '<' + 'script>window.addEventListener("load",function(){setTimeout(function(){window.print()},400)});<' + '/script></body></html>');
    popup.document.close();
  }

  // A real, openable .doc file — uses the Word-compatible-HTML technique (same content the
  // print view uses, wrapped in a minimal Word XML namespace declaration), not a fake
  // renamed .txt file. Opens correctly in Microsoft Word and Google Docs.
  function downloadGeneratedDocumentWord() {
    const area = document.getElementById('documentPrintArea');
    if (!area || !area.innerHTML.trim()) { showToast('دستاویز دستیاب نہیں', 'error'); return; }
    const extra = window._lastDocExtra || {};
    const pageCss = paperPageCss(extra.paper_size || 'a4', extra.orientation || 'portrait', 20);
    const htmlDoc = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"><title>SHAOOR Document</title>' +
      '<style>body{font-family:Georgia,serif;} '+pageCss+'</style></head>' +
      '<body>' + area.innerHTML + '</body></html>';
    const blob = new Blob(['\ufeff', htmlDoc], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const docNumPart = (document.getElementById('vcId') && document.getElementById('vcId').textContent) || 'SHAOOR-Document';
    a.href = url; a.download = 'SHAOOR-Document-' + new Date().toISOString().slice(0, 10) + '.doc';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /* ══════════ Certificate & Card Template Management (Admin) ══════════ */

  async function loadCertTemplatesAdmin() {
    const body = document.getElementById('certTemplatesBody');
    if (!body) return;
    const { data, error } = await sb.from('certificate_templates').select('*').order('name');
    if (error || !data || !data.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">No certificate templates yet.</td></tr>';
      return;
    }
    body.innerHTML = data.map(t => `
      <tr>
        <td data-label="Preview">${t.background_url ? `<img class="tpl-swatch" src="${sanitize(t.background_url)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'tpl-swatch',innerHTML:'<i class=\\'fas fa-certificate\\'></i>'}))" />` : `<div class="tpl-swatch"><i class="fas fa-certificate"></i></div>`}</td>
        <td data-label="Name">${sanitize(t.name)}</td>
        <td data-label="Description">${sanitize(t.description || '—')}</td>
        <td data-label="Default">${t.is_default ? '<span class="badge badge-active">Default</span>' : '—'}</td>
        <td data-label="Active">${t.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge">Inactive</span>'}</td>
        <td data-label="Actions" class="tpl-actions-cell">
          <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;" onclick="editCertTemplateById('${t.id}')">Edit</button>
          <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--ruby);" onclick="deleteCertTemplate('${t.id}')">Delete</button>
        </td>
      </tr>`).join('');
  }

  async function loadCardTemplatesAdmin() {
    const body = document.getElementById('cardTemplatesBody');
    if (!body) return;
    const { data, error } = await sb.from('card_templates').select('*').order('name');
    if (error || !data || !data.length) {
      body.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">No card templates yet.</td></tr>';
      return;
    }
    body.innerHTML = data.map(t => `
      <tr>
        <td data-label="Preview">${t.front_design_url ? `<img class="tpl-swatch" src="${sanitize(t.front_design_url)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'tpl-swatch',innerHTML:'<i class=\\'fas fa-id-card\\'></i>'}))" />` : `<div class="tpl-swatch"><i class="fas fa-id-card"></i></div>`}</td>
        <td data-label="Name">${sanitize(t.name)}</td>
        <td data-label="Description">${sanitize(t.description || '—')}</td>
        <td data-label="Default">${t.is_default ? '<span class="badge badge-active">Default</span>' : '—'}</td>
        <td data-label="Active">${t.is_active ? '<span class="badge badge-active">Active</span>' : '<span class="badge">Inactive</span>'}</td>
        <td data-label="Actions" class="tpl-actions-cell">
          <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;" onclick="editCardTemplateById('${t.id}')">Edit</button>
          <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--teal);" onclick="previewCardTemplateById('${t.id}')">Preview</button>
          <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--ruby);" onclick="deleteCardTemplate('${t.id}')">Delete</button>
        </td>
      </tr>`).join('');
  }

  /* ── Structured per-field controls (title/member/meta/qr/signatures/logo/seal) ──
     These are a friendlier layer over config.fields: every change here re-serializes
     into #ctplFieldsJson (the actual value saved), and #ctplFieldsJson can still be
     hand-edited directly — both stay in sync. ── */
  const CERT_FONT_OPTIONS = ["", "Georgia,serif", "'Playfair Display',serif", "Inter,system-ui,sans-serif", "Arial,sans-serif", "'Times New Roman',serif", "Manrope,sans-serif"];

  function buildCtplFieldControls() {
    const host = document.getElementById('ctplFieldControls');
    if (!host || host.dataset.built) return;
    host.dataset.built = '1';
    host.innerHTML = CERT_FIELD_KEYS.map(key => {
      const isImg = key === 'logo' || key === 'seal';
      const fontRow = (key === 'signatures') ? '' : `
        <div style="flex:1;"><label>Font Size</label><input type="text" class="form-input ctpl-f" data-key="${key}" data-prop="fontSize" placeholder="1rem" /></div>
        <div style="flex:1;"><label>Font Family</label><select class="form-input ctpl-f" data-key="${key}" data-prop="fontFamily">${CERT_FONT_OPTIONS.map(f => `<option value="${f}">${f || 'Default'}</option>`).join('')}</select></div>
        <div style="flex:1;"><label>Align</label><select class="form-input ctpl-f" data-key="${key}" data-prop="align"><option value="">Default</option><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div>
        <div style="flex:1;"><label>Color</label><input type="text" class="form-input ctpl-f" data-key="${key}" data-prop="color" placeholder="#ffffff" /></div>`;
      const sizeRow = isImg ? `
        <div style="flex:1;"><label>Width</label><input type="text" class="form-input ctpl-f" data-key="${key}" data-prop="width" placeholder="e.g. 60px" /></div>
        <div style="flex:1;"><label>Height</label><input type="text" class="form-input ctpl-f" data-key="${key}" data-prop="height" placeholder="e.g. 60px" /></div>` : '';
      return `<div style="border:1px solid var(--line,#e2e2e2);border-radius:10px;padding:.6rem .8rem;margin-bottom:.6rem;">
        <div style="font-size:.8rem;font-weight:700;margin-bottom:.4rem;">${CERT_FIELD_LABELS[key]}</div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.4rem;">
          <div style="flex:1;"><label>Top</label><input type="text" class="form-input ctpl-f" data-key="${key}" data-prop="top" placeholder="e.g. 20%" /></div>
          <div style="flex:1;"><label>Left</label><input type="text" class="form-input ctpl-f" data-key="${key}" data-prop="left" placeholder="e.g. 50%" /></div>
          <div style="flex:1;"><label>Right</label><input type="text" class="form-input ctpl-f" data-key="${key}" data-prop="right" placeholder="" /></div>
          <div style="flex:1;"><label>Bottom</label><input type="text" class="form-input ctpl-f" data-key="${key}" data-prop="bottom" placeholder="" /></div>
          ${sizeRow}
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;">${fontRow}</div>
      </div>`;
    }).join('');
    host.querySelectorAll('.ctpl-f').forEach(inp => inp.addEventListener('input', onCtplFieldControlChange));
  }

  function ctplFieldsFromControls() {
    const fields = {};
    document.querySelectorAll('#ctplFieldControls .ctpl-f').forEach(inp => {
      const key = inp.dataset.key, prop = inp.dataset.prop, val = inp.value.trim();
      if (!val) return;
      if (!fields[key]) fields[key] = {};
      fields[key][prop] = val;
    });
    return fields;
  }

  function populateCtplFieldControls(fields) {
    buildCtplFieldControls();
    document.querySelectorAll('#ctplFieldControls .ctpl-f').forEach(inp => {
      const f = fields && fields[inp.dataset.key];
      inp.value = (f && f[inp.dataset.prop]) || '';
    });
  }

  function onCtplFieldControlChange() {
    document.getElementById('ctplFieldsJson').value = JSON.stringify(ctplFieldsFromControls(), null, 2);
    renderCtplPreview();
  }

  // The JSON textarea is hand-editable too; re-sync the structured controls from it on blur.
  function onCtplFieldsJsonBlur() {
    const raw = document.getElementById('ctplFieldsJson').value.trim();
    if (!raw) { populateCtplFieldControls({}); renderCtplPreview(); return; }
    try { populateCtplFieldControls(JSON.parse(raw)); }
    catch (e) { showToast('Field Layout JSON is invalid: ' + e.message, 'error'); return; }
    renderCtplPreview();
  }

  function ctplCurrentConfig() {
    const fieldsRaw = document.getElementById('ctplFieldsJson').value.trim();
    let fields = {};
    try { fields = fieldsRaw ? JSON.parse(fieldsRaw) : {}; } catch (e) { /* keep last-good preview */ }
    return {
      background_color: document.getElementById('ctplBgColor').value.trim() || null,
      text_color: document.getElementById('ctplTextColor').value.trim() || null,
      accent_color: document.getElementById('ctplAccentColor').value.trim() || null,
      background_url: document.getElementById('ctplBackgroundUrl').value.trim() || null,
      paper_size: document.getElementById('ctplPaperSize').value || 'a4',
      orientation: document.getElementById('ctplOrientation').value || 'landscape',
      width: document.getElementById('ctplPaperSize').value === 'custom' ? (document.getElementById('ctplWidth').value.trim() || null) : null,
      language: document.getElementById('ctplLanguage').value || 'en',
      fields
    };
  }

  // Renders the exact same config through the exact same renderer used for real certificates,
  // just targeted at the editor's own preview element/ids — so what the admin sees here is what
  // will actually render on save (see EDITOR CONTROL → CONFIG → PREVIEW pipeline).
  function renderCtplPreview() {
    const preview = document.getElementById('ctplPreview');
    if (!preview) return;
    const config = ctplCurrentConfig();
    const brand = window._brandCache || {};
    preview.style.width = '340px';
    preview.style.aspectRatio = '';
    applyCertificateTemplate(config, brand, 'ctplPreview', CERT_PREVIEW_FIELD_IDS, {
      society_logo_url: window._brandOrgPreview && window._brandOrgPreview.society_logo_url,
      chapter_logo_url: window._brandOrgPreview && window._brandOrgPreview.chapter_logo_url,
      society_name: window._brandOrgPreview && window._brandOrgPreview.society_name,
      chapter_name: window._brandOrgPreview && window._brandOrgPreview.chapter_name
    });
  }

  function wireCtplColorPickers() {
    [['ctplBgColorPicker', 'ctplBgColor'], ['ctplTextColorPicker', 'ctplTextColor'], ['ctplAccentColorPicker', 'ctplAccentColor']].forEach(([pick, text]) => {
      const p = document.getElementById(pick), t = document.getElementById(text);
      if (!p || !t || p.dataset.wired) return;
      p.dataset.wired = '1';
      p.addEventListener('input', () => { t.value = p.value; renderCtplPreview(); });
      t.addEventListener('input', () => { if (/^#[0-9a-fA-F]{6}$/.test(t.value.trim())) p.value = t.value.trim(); renderCtplPreview(); });
    });
    ['ctplBackgroundUrl', 'ctplWidth', 'ctplOrientation', 'ctplPaperSize', 'ctplLanguage'].forEach(id => {
      const el = document.getElementById(id);
      if (el && !el.dataset.wired) { el.dataset.wired = '1'; el.addEventListener('input', renderCtplPreview); el.addEventListener('change', renderCtplPreview); }
    });
    const paperSel = document.getElementById('ctplPaperSize');
    if (paperSel && !paperSel.dataset.wiredWidthToggle) {
      paperSel.dataset.wiredWidthToggle = '1';
      const toggle = () => { document.getElementById('ctplWidthGroup').style.display = paperSel.value === 'custom' ? '' : 'none'; };
      paperSel.addEventListener('change', toggle);
      toggle();
    }
    const fieldsJson = document.getElementById('ctplFieldsJson');
    if (fieldsJson && !fieldsJson.dataset.wired) { fieldsJson.dataset.wired = '1'; fieldsJson.addEventListener('blur', onCtplFieldsJsonBlur); }
    const bgFile = document.getElementById('ctplBackgroundFile');
    if (bgFile && !bgFile.dataset.wired) {
      bgFile.dataset.wired = '1';
      bgFile.addEventListener('change', () => {
        const f = bgFile.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => { document.getElementById('ctplPreview').style.backgroundImage = 'url("' + reader.result + '")'; document.getElementById('ctplPreview').style.backgroundSize = 'cover'; document.getElementById('ctplPreview').style.backgroundPosition = 'center'; };
        reader.readAsDataURL(f);
      });
    }
  }

  async function openCertTemplateModal() {
    document.getElementById('certTemplateForm').reset();
    document.getElementById('ctplId').value = '';
    window._editingCertTemplateConfig = null;
    document.getElementById('ctplPaperSize').value = 'a4';
    document.getElementById('ctplOrientation').value = 'landscape';
    document.getElementById('ctplLanguage').value = 'en';
    buildCtplFieldControls();
    populateCtplFieldControls({});
    document.getElementById('ctplFieldsJson').value = '';
    wireCtplColorPickers();
    if (!window._brandCache) { const { data } = await sb.from('brand_settings').select('*').limit(1).maybeSingle(); window._brandCache = data || {}; }
    if (!window._brandOrgPreview) {
      const [{ data: s }, { data: ch }] = await Promise.all([
        sb.from('societies').select('name, logo_url').not('logo_url', 'is', null).limit(1),
        sb.from('chapters').select('name, logo_url').not('logo_url', 'is', null).limit(1)
      ]);
      window._brandOrgPreview = {
        society_logo_url: s && s[0] && s[0].logo_url,
        society_name: s && s[0] && s[0].name,
        chapter_logo_url: ch && ch[0] && ch[0].logo_url,
        chapter_name: ch && ch[0] && ch[0].name
      };
    }
    renderCtplPreview();
    openModal('certTemplateModal');
  }

  async function editCertTemplateById(id) {
    if (!id) return;
    const { data: t, error } = await sb.from('certificate_templates').select('*').eq('id', id).maybeSingle();
    if (error || !t) { showToast('Template load failed', 'error'); return; }
    return editCertTemplate(t);
  }
  async function editCertTemplate(t) {
    document.getElementById('ctplId').value = t.id;
    document.getElementById('ctplName').value = t.name || '';
    document.getElementById('ctplDescription').value = t.description || '';
    document.getElementById('ctplBackgroundUrl').value = t.background_url || '';
    const cfg = t.config || {};
    document.getElementById('ctplBgColor').value = cfg.background_color || '';
    document.getElementById('ctplTextColor').value = cfg.text_color || '';
    document.getElementById('ctplAccentColor').value = cfg.accent_color || '';
    document.getElementById('ctplPaperSize').value = cfg.paper_size || 'a4';
    document.getElementById('ctplOrientation').value = cfg.orientation || 'landscape';
    document.getElementById('ctplWidth').value = cfg.width || '';
    document.getElementById('ctplLanguage').value = cfg.language || 'en';
    window._editingCertTemplateConfig = cfg;
    if (cfg.paper_size || cfg.page_size) document.getElementById('ctplPaperSize').value = cfg.paper_size || String(cfg.page_size).toLowerCase();
    if (cfg.orientation || cfg.layout) document.getElementById('ctplOrientation').value = cfg.orientation || cfg.layout;
    if (cfg.branding) {
      if (!document.getElementById('ctplBgColor').value && cfg.branding.background_color) document.getElementById('ctplBgColor').value = cfg.branding.background_color;
      if (!document.getElementById('ctplTextColor').value && cfg.branding.primary_color) document.getElementById('ctplTextColor').value = cfg.branding.primary_color;
      if (!document.getElementById('ctplAccentColor').value && cfg.branding.accent_color) document.getElementById('ctplAccentColor').value = cfg.branding.accent_color;
    }
    document.getElementById('ctplFieldsJson').value = cfg.fields ? JSON.stringify(cfg.fields, null, 2) : '';
    document.getElementById('ctplIsDefault').checked = !!t.is_default;
    document.getElementById('ctplIsActive').checked = !!t.is_active;
    buildCtplFieldControls();
    populateCtplFieldControls(cfg.fields || {});
    wireCtplColorPickers();
    document.getElementById('ctplWidthGroup').style.display = document.getElementById('ctplPaperSize').value === 'custom' ? '' : 'none';
    if (!window._brandCache) { const { data } = await sb.from('brand_settings').select('*').limit(1).maybeSingle(); window._brandCache = data || {}; }
    if (!window._brandOrgPreview) {
      const [{ data: s }, { data: ch }] = await Promise.all([
        sb.from('societies').select('name, logo_url').not('logo_url', 'is', null).limit(1),
        sb.from('chapters').select('name, logo_url').not('logo_url', 'is', null).limit(1)
      ]);
      window._brandOrgPreview = {
        society_logo_url: s && s[0] && s[0].logo_url,
        society_name: s && s[0] && s[0].name,
        chapter_logo_url: ch && ch[0] && ch[0].logo_url,
        chapter_name: ch && ch[0] && ch[0].name
      };
    }
    renderCtplPreview();
    openModal('certTemplateModal');
  }

  async function deleteCertTemplate(id) {
    if (!(await requireStaff())) return;
    if (!confirm('Delete this certificate template?')) return;
    const { error } = await sb.from('certificate_templates').delete().eq('id', id);
    if (error) { showToast('Delete failed: ' + error.message, 'error'); return; }
    showToast('Template deleted');
    loadCertTemplatesAdmin();
  }

  secureSubmit('certTemplateForm', async frm => {
    if (!(await requireStaff())) return;
    const id = frm.querySelector('#ctplId').value || null;
    const name = frm.querySelector('#ctplName').value.trim();
    const description = frm.querySelector('#ctplDescription').value.trim() || null;
    let background_url = frm.querySelector('#ctplBackgroundUrl').value.trim() || null;
    const bgFile = frm.querySelector('#ctplBackgroundFile').files[0];
    if (bgFile) {
      try { background_url = await uploadBrandAsset(bgFile, 'certificate-templates'); }
      catch (e) { showToast('Background upload failed: ' + e.message, 'error'); return; }
    }
    const is_default = frm.querySelector('#ctplIsDefault').checked;
    const is_active = frm.querySelector('#ctplIsActive').checked;
    const fieldsRaw = frm.querySelector('#ctplFieldsJson').value.trim();
    let fields = null;
    if (fieldsRaw) {
      try { fields = JSON.parse(fieldsRaw); }
      catch (e) { showToast('Field Layout JSON is invalid: ' + e.message, 'error'); return; }
    }
    const width = frm.querySelector('#ctplPaperSize').value === 'custom' ? (frm.querySelector('#ctplWidth').value.trim() || null) : null;
    const orientation = frm.querySelector('#ctplOrientation').value || 'landscape';
    const paper_size = frm.querySelector('#ctplPaperSize').value || 'a4';
    const editorConfig = {
      background_color: frm.querySelector('#ctplBgColor').value.trim() || null,
      text_color: frm.querySelector('#ctplTextColor').value.trim() || null,
      accent_color: frm.querySelector('#ctplAccentColor').value.trim() || null,
      paper_size,
      orientation,
      width: width || undefined,
      language: frm.querySelector('#ctplLanguage').value || 'en',
      fields: fields || undefined
    };
    let config = editorConfig;
    if (id && window._editingCertTemplateConfig && typeof window._editingCertTemplateConfig === 'object') {
      config = Object.assign({}, window._editingCertTemplateConfig, editorConfig);
      if (config.branding) {
        config.branding = Object.assign({}, config.branding, {
          accent_color: editorConfig.accent_color || config.branding.accent_color,
          primary_color: editorConfig.text_color || config.branding.primary_color,
          background_color: editorConfig.background_color || config.branding.background_color
        });
      }
      if (editorConfig.orientation) { config.layout = editorConfig.orientation; config.orientation = editorConfig.orientation; }
      if (editorConfig.paper_size) { config.page_size = String(editorConfig.paper_size).toUpperCase(); config.paper_size = editorConfig.paper_size; }
    }
    const payload = { name, description, background_url, is_default, is_active, config };

    let error;
    if (id) {
      ({ error } = await sb.from('certificate_templates').update(payload).eq('id', id));
    } else {
      ({ error } = await sb.from('certificate_templates').insert(payload));
    }
    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    showToast('Certificate template saved');
    closeModal('certTemplateModal');
    loadCertTemplatesAdmin();
  });

  // Admin preview — reuses renderIdCard() (the single canonical renderer) with the ADMIN'S OWN
  // real profile data and the given template, so admin-preview / print / PDF can never drift
  // from the actual member-facing card, and no fake/fabricated member data is ever shown.
  async function previewCardTemplateById(id) {
    if (!id) return;
    const { data: t, error } = await sb.from('card_templates').select('*').eq('id', id).maybeSingle();
    if (error || !t) { showToast('Template load failed', 'error'); return; }
    return previewCardTemplate(t);
  }
  async function editCardTemplateById(id) {
    if (!id) return;
    const { data: t, error } = await sb.from('card_templates').select('*').eq('id', id).maybeSingle();
    if (error || !t) { showToast('Template load failed', 'error'); return; }
    return editCardTemplate(t);
  }
  async function previewCardTemplate(t) {
    const { data: userData } = await sb.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) { showToast('پہلے لاگ ان کریں', 'error'); return; }
    const { data: profile, error } = await sb
      .from('profiles')
      .select('full_name, member_id, role, status, avatar_url, province, membership_type, societies!profiles_society_id_fkey(name), chapters!profiles_chapter_id_fkey(name)')
      .eq('id', userId)
      .single();
    if (error || !profile) { showToast('پروفائل لوڈ نہیں ہو سکی', 'error'); return; }
    await renderIdCard(profile, t);
  }

  function openCardTemplateModal() {
    document.getElementById('cardTemplateForm').reset();
    document.getElementById('crtplId').value = '';
    openModal('cardTemplateModal');
  }

  function editCardTemplate(t) {
    document.getElementById('crtplId').value = t.id;
    document.getElementById('crtplName').value = t.name || '';
    document.getElementById('crtplDescription').value = t.description || '';
    document.getElementById('crtplFrontUrl').value = t.front_design_url || '';
    document.getElementById('crtplBackUrl').value = t.back_design_url || '';
    document.getElementById('crtplIsDefault').checked = !!t.is_default;
    document.getElementById('crtplIsActive').checked = !!t.is_active;
    // config is a new nullable JSONB column — safe to read with defaults for pre-existing rows
    const cfg = t.config || {};
    const front = cfg.front || {};
    document.getElementById('crtplOrientation').value = cfg.orientation || '';
    document.getElementById('crtplLanguage').value = cfg.language || 'en';
    document.getElementById('crtplBgColor').value = front.bgColor || '';
    document.getElementById('crtplBorderColor').value = front.borderColor || '';
    document.getElementById('crtplTextColor').value = front.textColor || '';
    document.getElementById('crtplLogoSize').value = front.logoSize || '';
    document.getElementById('crtplPhotoSize').value = front.photoSize || '';
    document.getElementById('crtplQrSize').value = (cfg.fields && cfg.fields.qr && cfg.fields.qr.size) || '';
    document.getElementById('crtplSealEnabled').checked = !!front.sealEnabled;
    openModal('cardTemplateModal');
  }

  async function deleteCardTemplate(id) {
    if (!(await requireStaff())) return;
    if (!confirm('Delete this card template?')) return;
    const { error } = await sb.from('card_templates').delete().eq('id', id);
    if (error) { showToast('Delete failed: ' + error.message, 'error'); return; }
    showToast('Template deleted');
    loadCardTemplatesAdmin();
  }

  secureSubmit('cardTemplateForm', async frm => {
    if (!(await requireStaff())) return;
    const id = frm.querySelector('#crtplId').value || null;
    const name = frm.querySelector('#crtplName').value.trim();
    const description = frm.querySelector('#crtplDescription').value.trim() || null;
    let front_design_url = frm.querySelector('#crtplFrontUrl').value.trim() || null;
    let back_design_url = frm.querySelector('#crtplBackUrl').value.trim() || null;
    const frontFile = frm.querySelector('#crtplFrontFile').files[0];
    const backFile = frm.querySelector('#crtplBackFile').files[0];
    if (frontFile) {
      try { front_design_url = await uploadBrandAsset(frontFile, 'card-templates'); }
      catch (e) { showToast('Front image upload failed: ' + e.message, 'error'); return; }
    }
    if (backFile) {
      try { back_design_url = await uploadBrandAsset(backFile, 'card-templates'); }
      catch (e) { showToast('Back image upload failed: ' + e.message, 'error'); return; }
    }
    const is_default = frm.querySelector('#crtplIsDefault').checked;
    const is_active = frm.querySelector('#crtplIsActive').checked;

    // Build the structured config JSON. Empty/blank inputs are omitted so unset values fall
    // back to the existing hardcoded look in applyCardConfig() rather than overwriting it.
    const num = v => (v === '' || v == null) ? undefined : Number(v);
    const str = v => (v === '' || v == null) ? undefined : v;
    const config = {
      version: 1,
      language: frm.querySelector('#crtplLanguage').value || 'en',
      orientation: str(frm.querySelector('#crtplOrientation').value),
      front: {
        bgColor: str(frm.querySelector('#crtplBgColor').value.trim()),
        borderColor: str(frm.querySelector('#crtplBorderColor').value.trim()),
        textColor: str(frm.querySelector('#crtplTextColor').value.trim()),
        logoSize: num(frm.querySelector('#crtplLogoSize').value),
        photoSize: num(frm.querySelector('#crtplPhotoSize').value),
        sealEnabled: frm.querySelector('#crtplSealEnabled').checked
      },
      fields: {
        qr: { size: num(frm.querySelector('#crtplQrSize').value) }
      }
    };
    const payload = { name, description, front_design_url, back_design_url, is_default, is_active, config };

    let error;
    if (id) {
      ({ error } = await sb.from('card_templates').update(payload).eq('id', id));
    } else {
      ({ error } = await sb.from('card_templates').insert(payload));
    }
    if (error) { showToast('Save failed: ' + error.message, 'error'); return; }
    showToast('Card template saved');
    closeModal('cardTemplateModal');
    loadCardTemplatesAdmin();
  });

  /* ── Member: load "My Certificates" list in Member Dashboard ── */
  async function loadMyCertificates(userId) {
    const container = document.getElementById('myCertificatesList');
    if (!container) return;
    window._lastMyCertsUserId = userId;

    const { data: certs, error } = await sb
      .from('certificates')
      .select('id, certificate_id, certificate_title, certificate_type, issue_date, status')
      .eq('member_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      container.innerHTML = '<div style="color:var(--ruby);font-size:.9rem;text-align:center;">لوڈ نہیں ہو سکا</div>';
      return;
    }

    if (!certs || certs.length === 0) {
      container.innerHTML = `<div style="color:var(--muted);font-size:.9rem;text-align:center;padding:1rem;">${t('no_certs')}</div>`;
      return;
    }

    container.innerHTML = certs.map(c => {
      const sc = certStatusColor(c.status);
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:.9rem 1rem;border:1px solid var(--border);border-radius:10px;flex-wrap:wrap;gap:.5rem;">
        <div>
          <div style="font-weight:600;">${sanitize(c.certificate_title)}</div>
          <div style="font-size:.78rem;color:var(--muted);">${sanitize(c.certificate_id)} · ${sanitize(c.issue_date)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:.6rem;">
          <span class="status-pill" style="background:${sc.bg};color:#fff;font-size:.72rem;">${sc.label}</span>
          <button class="btn btn-outline" style="padding:.35rem .8rem;font-size:.78rem;" onclick="viewCertificate(${c.id})">${t('view')}</button>
        </div>
      </div>`;
    }).join('');
  }

  /* ── Member: load "My Documents" list in Member Dashboard.
     Reuses the existing generated_documents.member_id column (already
     populated by the admin "Issue Document" form) — no schema change,
     no new table, no new renderer. View/Download/Print reuse the exact
     same functions the admin Official Documents screen already uses. ── */
  async function loadMyDocuments(userId) {
    const container = document.getElementById('myDocumentsList');
    if (!container) return;
    window._lastMyDocsUserId = userId;

    const { data: docs, error } = await sb
      .from('generated_documents')
      .select('id, document_number, document_type, title, status, created_at, societies(name), chapters(name)')
      .eq('member_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      container.innerHTML = '<div style="color:var(--ruby);font-size:.9rem;text-align:center;">لوڈ نہیں ہو سکا</div>';
      console.error('SHAOOR: could not load member documents', error);
      return;
    }

    if (!docs || docs.length === 0) {
      container.innerHTML = `<div style="color:var(--muted);font-size:.9rem;text-align:center;padding:1rem;">${t('no_docs')}</div>`;
      return;
    }

    container.innerHTML = docs.map(d => {
      const statusBg = d.status === 'issued' ? 'var(--teal)' : d.status === 'draft' ? '#9ca3af' : 'var(--muted)';
      const societyChapter = [(d.societies ? d.societies.name : null), (d.chapters ? d.chapters.name : null)].filter(Boolean).join(' · ') || '—';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:.9rem 1rem;border:1px solid var(--border);border-radius:10px;flex-wrap:wrap;gap:.5rem;">
        <div>
          <div style="font-weight:600;">${sanitize(d.title || '—')}</div>
          <div style="font-size:.78rem;color:var(--muted);">${sanitize(d.document_type || '—')} · ${sanitize(d.document_number || '—')} · ${sanitize((d.created_at || '').slice(0, 10))}${societyChapter !== '—' ? ' · ' + sanitize(societyChapter) : ''}</div>
        </div>
        <div style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;">
          <span class="status-pill" style="background:${statusBg};color:#fff;font-size:.72rem;">${sanitize(d.status || '—')}</span>
          <button class="btn btn-outline" style="padding:.35rem .8rem;font-size:.78rem;" onclick="viewGeneratedDocument('${d.id}')">${t('view')}</button>
          <button class="btn btn-outline" style="padding:.35rem .8rem;font-size:.78rem;" onclick="downloadRowDocument('${d.id}')">${t('download')}</button>
        </div>
      </div>`;
    }).join('');
  }

  /* ── Member: load "My Learning" list in Member Dashboard (Phase 8) ── */
  async function loadMyLearning(userId) {
    const container = document.getElementById('myLearningList');
    if (!container) return;

    const { data: enrollments, error } = await sb
      .from('course_enrollments')
      .select('id, course_id, status, payment_status, enrolled_at, courses(id, title, slug, level, duration_label, whatsapp_group_link)')
      .eq('member_id', userId)
      .order('enrolled_at', { ascending: false });

    if (error) {
      container.innerHTML = '<div style="color:var(--ruby);font-size:.9rem;text-align:center;">لوڈ نہیں ہو سکا</div>';
      console.error('SHAOOR LMS: could not load enrollments for My Learning', error);
      return;
    }

    if (!enrollments || enrollments.length === 0) {
      container.innerHTML = '<div style="color:var(--muted);font-size:.9rem;text-align:center;padding:1rem;">ابھی آپ نے کسی کورس میں داخلہ نہیں لیا۔</div>';
      return;
    }

    // Real progress: completed lesson count per course from lesson_progress,
    // divided by that course's total published lesson count. No fabricated numbers —
    // if either table/query is unavailable, that course simply shows 0%.
    var courseIds = enrollments.map(function (e) { return e.course_id; }).filter(Boolean);
    var completedCountByCourse = {};
    var totalLessonCountByCourse = {};

    try {
      var lessonCountRes = await sb
        .from('course_lessons')
        .select('id, course_id')
        .in('course_id', courseIds)
        .eq('status', 'published');
      (lessonCountRes.data || []).forEach(function (l) {
        totalLessonCountByCourse[l.course_id] = (totalLessonCountByCourse[l.course_id] || 0) + 1;
      });
    } catch (e) {
      console.warn('SHAOOR LMS: could not load lesson counts for My Learning', e);
    }

    try {
      var progressRes = await sb
        .from('lesson_progress')
        .select('course_id, status')
        .eq('member_id', userId)
        .eq('status', 'completed')
        .in('course_id', courseIds);
      (progressRes.data || []).forEach(function (p) {
        completedCountByCourse[p.course_id] = (completedCountByCourse[p.course_id] || 0) + 1;
      });
    } catch (e) {
      console.warn('SHAOOR LMS: lesson_progress unavailable for My Learning', e);
    }

    // Live classes (Google Meet) for actively enrolled courses — RLS already restricts
    // rows to sessions belonging to courses the member is actively enrolled in.
    var liveSessionsByCourse = {};
    try {
      var liveRes = await sb
        .from('course_live_sessions')
        .select('id, course_id, title, meet_link, scheduled_at, status, recording_url')
        .in('course_id', courseIds)
        .order('scheduled_at', { ascending: true });
      (liveRes.data || []).forEach(function (s) {
        if (!liveSessionsByCourse[s.course_id]) liveSessionsByCourse[s.course_id] = [];
        liveSessionsByCourse[s.course_id].push(s);
      });
    } catch (e) {
      console.warn('SHAOOR LMS: could not load live sessions for My Learning', e);
    }

    // Platform-wide general WhatsApp group (shown once, above the course list).
    var generalWhatsappLink = null;
    try {
      var settingsRes = await sb.from('platform_settings').select('general_whatsapp_link').eq('id', 1).maybeSingle();
      generalWhatsappLink = settingsRes.data ? settingsRes.data.general_whatsapp_link : null;
    } catch (e) {
      console.warn('SHAOOR LMS: could not load platform settings for My Learning', e);
    }

    var generalWhatsappHtml = generalWhatsappLink
      ? '<div style="padding:.8rem 1rem;border:1px solid var(--border);border-radius:10px;margin-bottom:.9rem;background:#e9fbf1;display:flex;align-items:center;justify-content:space-between;gap:.6rem;flex-wrap:wrap;">' +
        '<span style="font-size:.85rem;"><i class="fab fa-whatsapp" style="color:#1e8e5a;"></i> Learning Academy کے عمومی WhatsApp Group میں شامل ہوں</span>' +
        '<a href="' + generalWhatsappLink + '" target="_blank" rel="noopener" class="btn btn-outline" style="padding:.35rem .8rem;font-size:.78rem;">Join Group</a>' +
        '</div>'
      : '';

    container.innerHTML = generalWhatsappHtml + enrollments.map(function (e) {
      var course = e.courses || {};
      var total = totalLessonCountByCourse[e.course_id] || 0;
      var completed = completedCountByCourse[e.course_id] || 0;
      var pct = total > 0 ? Math.round((completed / total) * 100) : 0;

      var statusLabel, statusColor;
      if (e.status === 'pending') { statusLabel = 'PENDING APPROVAL'; statusColor = 'var(--gold)'; }
      else if (e.status === 'completed') { statusLabel = 'COMPLETED'; statusColor = '#1e8e5a'; }
      else if (e.status === 'cancelled' || e.status === 'suspended') { statusLabel = e.status.toUpperCase(); statusColor = '#b3392c'; }
      else { statusLabel = 'ACTIVE'; statusColor = 'var(--navy)'; }

      var actionLabel = (e.status === 'pending') ? 'View Course' : 'Continue Learning';

      // Live classes: show the next upcoming/live session, and list any past sessions with a recording.
      var sessions = liveSessionsByCourse[e.course_id] || [];
      var upcoming = sessions.filter(function (s) { return s.status === 'upcoming' || s.status === 'live'; })[0];
      var pastWithRecording = sessions.filter(function (s) { return s.status === 'ended' && s.recording_url; });

      var liveHtml = '';
      if (upcoming) {
        var whenStr = upcoming.scheduled_at ? new Date(upcoming.scheduled_at).toLocaleString() : '—';
        var isLive = upcoming.status === 'live';
        liveHtml += '<div style="margin-top:.7rem;padding:.6rem .8rem;border-radius:8px;background:' + (isLive ? '#fff4e5' : '#eef4ff') + ';font-size:.8rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;">' +
          '<span><i class="fas fa-video" style="color:' + (isLive ? '#c98a1e' : '#2b5cad') + ';"></i> ' + sanitize(upcoming.title) + (isLive ? ' — ابھی جاری ہے' : ' — ' + whenStr) + '</span>' +
          '<a href="' + upcoming.meet_link + '" target="_blank" rel="noopener" class="btn btn-gold" style="padding:.3rem .7rem;font-size:.75rem;">' + (isLive ? 'Join Now' : 'Meet Link') + '</a>' +
          '</div>';
      }
      if (pastWithRecording.length) {
        liveHtml += pastWithRecording.map(function (s) {
          return '<div style="margin-top:.5rem;padding:.6rem .8rem;border-radius:8px;background:#f5f5f5;font-size:.8rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;">' +
            '<span><i class="fas fa-play-circle" style="color:var(--muted);"></i> ' + sanitize(s.title) + ' — ریکارڈنگ دستیاب</span>' +
            '<a href="' + s.recording_url + '" target="_blank" rel="noopener" class="btn btn-outline" style="padding:.3rem .7rem;font-size:.75rem;">Watch Recording</a>' +
            '</div>';
        }).join('');
      }

      var courseWhatsappHtml = course.whatsapp_group_link
        ? '<div style="margin-top:.5rem;font-size:.78rem;"><i class="fab fa-whatsapp" style="color:#1e8e5a;"></i> <a href="' + course.whatsapp_group_link + '" target="_blank" rel="noopener">اس کورس کے WhatsApp Group میں شامل ہوں</a></div>'
        : '';

      return '<div style="padding:.9rem 1rem;border:1px solid var(--border);border-radius:10px;">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:.5rem;">' +
        '<div>' +
        '<div style="font-weight:600;">' + sanitize(course.title || 'Untitled Course') + '</div>' +
        '<div style="font-size:.78rem;color:var(--muted);">' + sanitize(course.level || '—') + (course.duration_label ? ' · ' + sanitize(course.duration_label) : '') + '</div>' +
        '</div>' +
        '<span class="status-pill" style="background:' + statusColor + ';color:#fff;font-size:.72rem;">' + statusLabel + '</span>' +
        '</div>' +
        (total > 0
          ? '<div style="margin-top:.6rem;background:#eee;border-radius:6px;height:8px;overflow:hidden;">' +
            '<div style="width:' + pct + '%;background:var(--gold);height:100%;"></div>' +
            '</div><div style="font-size:.72rem;color:var(--muted);margin-top:.3rem;">' + pct + '% complete (' + completed + '/' + total + ' lessons)</div>'
          : '') +
        liveHtml +
        courseWhatsappHtml +
        '<button class="btn btn-outline" style="margin-top:.7rem;padding:.35rem .8rem;font-size:.78rem;" onclick="' +
          (e.status === 'pending'
            ? "closeModal('memberDash');showCourseDetail('" + (course.slug || '') + "');"
            : "continueLearningToCourse('" + (course.slug || '') + "');") +
        '">' + actionLabel + '</button>' +
        '</div>';
    }).join('');
  }

  /* ── Public verification: if URL has ?verify=MEMBER_ID, look it up and show result ── */
  (async () => {
    const params = new URLSearchParams(window.location.search);
    const verifyId = params.get('verify');
    if (!verifyId) return;

    const { data: profile, error } = await sb
      .from('profiles')
      .select('full_name, member_id, role, status, avatar_url, province, membership_type, societies!profiles_society_id_fkey(name), chapters!profiles_chapter_id_fkey(name)')
      .eq('member_id', verifyId)
      .single();

    if (error || !profile) {
      showToast('یہ Member ID موجود نہیں: ' + verifyId, 'error');
      return;
    }

    if (profile.status === 'active') {
      showToast('✓ تصدیق شدہ: ' + profile.full_name + ' (' + profile.member_id + ')');
    } else {
      showToast('⚠ یہ اکاؤنٹ فعال نہیں (status: ' + profile.status + ')', 'error');
    }

    // Show the actual ID card (with its default template applied) to the public visitor,
    // not just a status toast — reuses the same renderer the member's own "My ID Card" uses.
    await renderIdCard(profile);
  })();

  /* ── Public verification: if URL has ?verify_cert=CERTIFICATE_ID, look it up and show result ── */
  (async () => {
    const params = new URLSearchParams(window.location.search);
    const certId = params.get('verify_cert');
    if (!certId) return;

    const { data: c, error } = await sb.rpc('verify_certificate_id', { p_certificate_id: certId });

    if (error || !c) {
      showToast('یہ سرٹیفکیٹ موجود نہیں: ' + certId, 'error');
      return;
    }

    const prof = c.member_name ? { full_name: c.member_name } : null;

    if (c.status === 'active') {
      showToast('✓ سرٹیفکیٹ تصدیق شدہ' + (prof ? ' — ' + prof.full_name : ''));
    } else if (c.status === 'revoked') {
      showToast('⚠ یہ سرٹیفکیٹ منسوخ کر دیا گیا ہے', 'error');
    } else {
      showToast('⚠ اس سرٹیفکیٹ کی میعاد ختم ہو چکی ہے', 'error');
    }
  })();

  /* ── Public verification: if URL has ?verify_doc=DOCUMENT_NUMBER, look it up and show result.
     Phase 3C: official documents are now verifiable the same way certificates already are.
     Only non-sensitive fields are exposed (no storage paths, no internal IDs, no private
     member data beyond the recipient's name) — matches the certificate verification pattern. ── */
  (async () => {
    const params = new URLSearchParams(window.location.search);
    const docNumber = params.get('verify_doc');
    if (!docNumber) return;

    const { data: d, error } = await sb
      .from('generated_documents')
      .select('document_number, document_type, title, status, created_at, member_id, recipient, subject, body, designation, effective_date, event_name, event_date, event_time, venue, society_id, chapter_id, authority, extra')
      .eq('document_number', docNumber)
      .single();

    if (error || !d) {
      showToast('یہ دستاویز موجود نہیں: ' + docNumber, 'error');
      return;
    }

    const { data: prof } = await sb.from('profiles').select('full_name, member_id').eq('id', d.member_id).single();

    if (d.status === 'issued') {
      showToast('✓ دستاویز تصدیق شدہ' + (prof ? ' — ' + prof.full_name : ''));
    } else if (d.status === 'revoked') {
      showToast('⚠ یہ دستاویز منسوخ کر دی گئی ہے', 'error');
    } else {
      showToast('⚠ یہ دستاویز فی الحال جاری کردہ نہیں (status: ' + d.status + ')', 'error');
    }

    // Show the actual generated document (with official branding applied) to the public
    // visitor — reuses the same renderer the admin/member "view" actions already use.
    const verifyDocToken = ++_docRenderToken;
    await renderGeneratedDocumentView(d, verifyDocToken);
    openModal('viewDocumentModal');
  })();

  /* If a member's session is already active on page load, show their dashboard automatically.
     Also handles the Google/Facebook return leg: after the provider redirect the user is
     signed in but may not have a profiles row yet, so .single() used to come back empty and
     nothing opened. maybeSingle() + the OAuth marker fix that, without touching auth itself. */
  (async () => {
    const { data } = await sb.auth.getSession();
    if (!data || !data.session) return;

    let oauthPending = null;
    try { oauthPending = sessionStorage.getItem('shaoor_oauth_pending'); } catch (e) {}
    try { sessionStorage.removeItem('shaoor_oauth_pending'); } catch (e) {}

    const { data: profile } = await sb
      .from('profiles')
      .select('role')
      .eq('id', data.session.user.id)
      .maybeSingle();

    if (profile && STAFF_ROLES.indexOf(profile.role) !== -1) {
      const { data: staffProf } = await sb.from('profiles').select('full_name, role, status').eq('id', data.session.user.id).maybeSingle();
      if (staffProf && staffProf.status === 'active') {
        document.getElementById('adminDash').classList.add('open');
        document.getElementById('dashAdminName').textContent = staffProf.full_name || staffProf.role;
        loadMembersAdmin();
        loadDashTopStats();
      }
    } else if (profile && profile.role === 'member') {
      openMemberDashboard(data.session.user.id);
    } else if (!profile && oauthPending) {
      // Fresh social signup — openMemberDashboard() creates the missing profile row itself.
      openMemberDashboard(data.session.user.id);
    }
  })();

  window.addEventListener('DOMContentLoaded', async () => {
    const socSel = document.getElementById('sSociety');
    const chapSel = document.getElementById('sChapter');
    if (socSel) {
      const { data: socs } = await sb.from('societies').select('id, name').order('name');
      (socs || []).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        socSel.appendChild(opt);
      });
    }
    if (chapSel) {
      const { data: chaps } = await sb.from('chapters').select('id, name').order('name');
      (chaps || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        chapSel.appendChild(opt);
      });
    }
  });

  /* ── Signup avatar preview ── */
  const sAvatarInput = document.getElementById('sAvatar');
  if (sAvatarInput) {
    sAvatarInput.addEventListener('change', e => {
      const file = e.target.files[0];
      const preview = document.getElementById('sAvatarPreview');
      const statusEl = document.getElementById('sAvatarStatus');
      statusEl.textContent = '';
      if (!file) { preview.style.display = 'none'; return; }

      const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        statusEl.textContent = 'صرف PNG, JPG, یا WEBP تصویر منتخب کریں';
        e.target.value = '';
        preview.style.display = 'none';
        return;
      }
      if (file.size > 3 * 1024 * 1024) {
        statusEl.textContent = 'تصویر 3MB سے چھوٹی ہونی چاہیے';
        e.target.value = '';
        preview.style.display = 'none';
        return;
      }

      const reader = new FileReader();
      reader.onload = ev => {
        preview.src = ev.target.result;
        preview.style.display = 'block';
      };
      reader.readAsDataURL(file);
    });
  }

  secureSubmit('signupForm', async frm => {
    const full_name = frm.querySelector('#sName').value.trim();
    const email = frm.querySelector('#sEmail').value.trim();
    const phone = frm.querySelector('#sPhone').value.trim();
    const password = frm.querySelector('#sPass').value;
    const society_id = frm.querySelector('#sSociety').value || null;
    const chapter_id = frm.querySelector('#sChapter').value || null;
    const province = frm.querySelector('#sProvince').value.trim() || null;
    const avatarFileCheck = frm.querySelector('#sAvatar')?.files?.[0];
    const err = document.getElementById('signupError');

    if (!isValidPhone(phone)) {
      document.getElementById('signupErrMsg').textContent = 'Please enter a valid Pakistani phone number (e.g. +92 300 1234567).';
      err.style.display = 'flex'; err.style.alignItems = 'center'; err.style.gap = '.5rem';
      return;
    }

    if (!avatarFileCheck) {
      document.getElementById('signupErrMsg').textContent = 'Profile picture is required.';
      err.style.display = 'flex'; err.style.alignItems = 'center'; err.style.gap = '.5rem';
      return;
    }

    /* Password policy: at least one lowercase, one uppercase, one digit, one special char */
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasDigit = /[0-9]/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|<>?,./`~]/.test(password);

    if (password.length < 8 || !hasLower || !hasUpper || !hasDigit || !hasSpecial) {
      document.getElementById('signupErrMsg').textContent =
        'Password must be at least 8 characters and include lowercase, uppercase, a number, and a special character.';
      err.style.display = 'flex'; err.style.alignItems = 'center'; err.style.gap = '.5rem';
      return;
    }

    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { data: { full_name, phone } }
    });

    if (error) {
      document.getElementById('signupErrMsg').textContent = error.message;
      err.style.display = 'flex'; err.style.alignItems = 'center'; err.style.gap = '.5rem';
      return;
    }

    err.style.display = 'none';

    if (data.user) {
      try {
        await sb.from('profiles').update({ phone, society_id, chapter_id, province }).eq('id', data.user.id);
      } catch (e) { /* best effort — RLS may block until email confirmed/logged in */ }
    }

    const avatarFile = frm.querySelector('#sAvatar')?.files?.[0];
    if (data.user && data.session && avatarFile) {
      const statusEl = document.getElementById('sAvatarStatus');
      statusEl.textContent = 'تصویر اپلوڈ ہو رہی ہے…';

      const ext = avatarFile.name.split('.').pop();
      const filePath = `${data.user.id}/avatar.${ext}`;

      const { error: uploadError } = await sb.storage
        .from('avatars')
        .upload(filePath, avatarFile, { upsert: true, cacheControl: '3600' });

      if (uploadError) {
        console.error('Signup avatar upload failed:', uploadError);
        statusEl.textContent = '';
        showToast('تصویر اپلوڈ نہیں ہو سکی، بعد میں dashboard سے لگائیں', 'error');
      } else {
        const { data: publicUrlData } = sb.storage.from('avatars').getPublicUrl(filePath);
        const publicUrl = publicUrlData.publicUrl + '?t=' + Date.now();
        try {
          await sb.from('profiles').update({ avatar_url: publicUrl }).eq('id', data.user.id);
        } catch (e) { console.error('Avatar profile update failed:', e); }
        statusEl.textContent = '';
      }
    }

    if (data.session) {
      closeModal('signupModal');
      if (lmsPendingEnrollCourseId) {
        lmsPendingEnrollCourseId = null;
        await enrollInCourse(); // resume the enrollment they were trying to do before signing up
      } else {
        await openMemberDashboard(data.user.id);
      }
    } else {
      showToast('اکاؤنٹ بن گیا! اپنا ای میل چیک کر کے تصدیق کریں۔');
      closeModal('signupModal');
    }
  });

  secureSubmit('forgotForm', async frm => {
    const em = frm.querySelector('input[type="email"]');
    if (!em || !isValidEmail(em.value)) {
      showToast('درست ای میل درج کریں', 'error');
      return;
    }
    const { error } = await sb.auth.resetPasswordForEmail(em.value.trim());
    if (error) {
      showToast('لنک بھیجنے میں مسئلہ: ' + error.message, 'error');
      return;
    }
    showToast('پاس ورڈ ری سیٹ لنک بھیج دیا گیا!');
    closeModal('forgotModal');
  });

  // ── Apply for Membership Handler ──
  document.getElementById('applyForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const form = e.target;
    const formData = new FormData(form);
    
    // Get form values
    const full_name = formData.get('full_name')?.trim();
    const email = formData.get('email')?.trim().toLowerCase();
    const phone = formData.get('phone')?.trim();
    const society_interest = formData.get('society_interest')?.trim();
    const motivation_text = formData.get('motivation_text')?.trim() || '';
    
    // Validate
    if (!full_name || !email || !phone || !society_interest) {
      showToast('تمام ضروری فیلڈ بھریں', 'error');
      return;
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('صحیح email لکھیں', 'error');
      return;
    }
    
    // Show loading
    const btn = form.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> درخواست بھیجی جا رہی ہے...';
    
    try {
      // Insert into applications table
      const { data, error } = await sb
        .from('applications')
        .insert([{
          full_name,
          email,
          phone,
          society_interest,
          motivation_text,
          status: 'pending'
        }]);
      
      if (error) {
        if (error.message.includes('duplicate')) {
          showToast('یہ email پہلے سے apply کر چکا ہے', 'error');
        } else {
          showToast('Error: ' + error.message, 'error');
        }
      } else {
        showToast('✅ درخواست موصول! ۳–۵ دنوں میں رابطہ کریں گے۔');
        form.reset();
        closeModal('applyModal');
      }
    } catch (err) {
      showToast('کوئی مسئلہ پیش آیا۔ دوبارہ کوشش کریں۔', 'error');
      console.error('Apply error:', err);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  });

  secureSubmit('contactForm', () => {
    showToast('پیغام بھیج دیا گیا! جلد جواب ملے گا۔');
    document.getElementById('contactForm').reset();
  });

  // ── Block right-click inspect on production ──
  // (Light deterrent only — does not replace server-side security)
  document.addEventListener('contextmenu', e => {
    if (e.target.tagName === 'IMG') e.preventDefault();
  });

  // ── Signup flow opener ──
  function openSignupFlow() {
    openModal('signupModal');
  }

  // ── Verify functions secured ──
  async function verifyId() {
    const raw = document.getElementById('verId').value;
    const v   = sanitize(raw.trim());
    const r   = document.getElementById('verResult');

    const rl = rateLimiter.check('verify_id', 10, 60000);
    if (!rl.allowed) {
      showToast('بہت زیادہ کوشش', 'error'); return;
    }

    if (!v) { showToast('ID درج کریں', 'error'); return; }

    r.className = 'ver-result';
    r.style.display = 'block';
    r.innerHTML = '<div class="ver-loading"><i class="fas fa-spinner fa-spin"></i> Verifying…</div>';

    if (!/^SHR-MBR-\d{4}-\d{6}$/.test(v)) {
      r.className = 'ver-result ver-invalid';
      r.innerHTML = `<div style="display:flex;align-items:center;gap:.75rem;"><i class="fas fa-exclamation-circle" style="font-size:1.5rem;color:var(--ruby);"></i><div><strong>غلط فارمیٹ</strong><br><span style="font-size:.88rem;color:var(--muted);">فارمیٹ: SHR-MBR-YYYY-XXXXXX</span></div></div>`;
      r.style.display = 'block';
      return;
    }

    const { data: profile, error } = await sb.rpc('verify_member_id', { p_member_id: v });

    if (error || !profile) {
      r.className = 'ver-result ver-invalid';
      r.innerHTML = `<div style="display:flex;align-items:center;gap:.75rem;"><i class="fas fa-exclamation-circle" style="font-size:1.5rem;color:var(--ruby);"></i><div><strong>غلط ID</strong><br><span style="font-size:.88rem;color:var(--muted);">یہ ID ہمارے ریکارڈ میں نہیں ملی۔</span></div></div>`;
      r.style.display = 'block';
      return;
    }

    const societyName = profile.society_name || '—';
    const isActive = profile.status === 'active';

    r.className = 'ver-result ver-valid';
    r.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:.75rem;margin-bottom:.5rem;">
        <i class="fas fa-check-circle" style="font-size:1.5rem;color:var(--teal);flex-shrink:0;"></i>
        <div><strong>درست SHAOOR رکن</strong><br><span style="font-size:.88rem;color:var(--muted);">یہ ID SHAOOR کے ریکارڈ میں موجود ہے۔</span></div>
      </div>
      <div class="ver-grid">
        <div class="ver-field"><div class="lbl">رکن کا نام</div><div class="val">${sanitize(profile.full_name || '—')}</div></div>
        <div class="ver-field"><div class="lbl">ID نمبر</div><div class="val">${sanitize(profile.member_id)}</div></div>
        <div class="ver-field"><div class="lbl">سوسائٹی</div><div class="val">${sanitize(societyName)}</div></div>
        <div class="ver-field"><div class="lbl">حیثیت</div><div class="val" style="color:${isActive ? 'var(--teal)' : 'var(--ruby)'};">${isActive ? '● فعال' : '● غیر فعال'}</div></div>
      </div>`;
    r.style.display = 'block';
  }

  async function verifyCert() {
    const raw = document.getElementById('certiId').value;
    const v   = sanitize(raw.trim());
    const r   = document.getElementById('certiResult');

    const rl = rateLimiter.check('verify_cert', 10, 60000);
    if (!rl.allowed) { showToast('بہت زیادہ کوشش', 'error'); return; }

    if (!v) { showToast('سرٹیفکیٹ ID درج کریں', 'error'); return; }

    r.className = 'ver-result';
    r.style.display = 'block';
    r.innerHTML = '<div class="ver-loading"><i class="fas fa-spinner fa-spin"></i> Verifying…</div>';

    if (!/^CERT-\d{4}-\d{6}$/.test(v)) {
      r.className = 'ver-result ver-invalid';
      r.innerHTML = `<div style="display:flex;align-items:center;gap:.75rem;"><i class="fas fa-exclamation-circle" style="font-size:1.5rem;color:var(--ruby);"></i><div><strong>غلط فارمیٹ</strong><br><span style="font-size:.88rem;color:var(--muted);">فارمیٹ: CERT-YYYY-XXXXXX</span></div></div>`;
      r.style.display = 'block';
      return;
    }

    const { data: c, error } = await sb.rpc('verify_certificate_id', { p_certificate_id: v });

    if (error || !c) {
      r.className = 'ver-result ver-invalid';
      r.innerHTML = `<div style="display:flex;align-items:center;gap:.75rem;"><i class="fas fa-exclamation-circle" style="font-size:1.5rem;color:var(--ruby);"></i><div><strong>سرٹیفکیٹ نہیں ملا</strong><br><span style="font-size:.88rem;color:var(--muted);">یہ ID ہمارے ریکارڈ میں نہیں۔</span></div></div>`;
      r.style.display = 'block';
      return;
    }

    const memberName = c.member_name || '';

    if (c.status === 'active') {
      r.className = 'ver-result ver-valid';
      r.innerHTML = `<div style="display:flex;align-items:center;gap:.75rem;"><i class="fas fa-check-circle" style="font-size:1.5rem;color:var(--teal);"></i><div><strong>درست سرٹیفکیٹ</strong><br><span style="font-size:.88rem;color:var(--muted);">${sanitize(c.certificate_title || '')}${memberName ? ' — ' + sanitize(memberName) : ''}</span></div></div>`;
    } else if (c.status === 'revoked') {
      r.className = 'ver-result ver-invalid';
      r.innerHTML = `<div style="display:flex;align-items:center;gap:.75rem;"><i class="fas fa-exclamation-circle" style="font-size:1.5rem;color:var(--ruby);"></i><div><strong>منسوخ شدہ سرٹیفکیٹ</strong><br><span style="font-size:.88rem;color:var(--muted);">یہ سرٹیفکیٹ منسوخ کر دیا گیا ہے۔</span></div></div>`;
    } else {
      r.className = 'ver-result ver-invalid';
      r.innerHTML = `<div style="display:flex;align-items:center;gap:.75rem;"><i class="fas fa-exclamation-circle" style="font-size:1.5rem;color:var(--ruby);"></i><div><strong>غیر فعال سرٹیفکیٹ</strong><br><span style="font-size:.88rem;color:var(--muted);">اس سرٹیفکیٹ کی میعاد ختم ہو چکی ہے۔</span></div></div>`;
    }
    r.style.display = 'block';
  }

  document.getElementById('verId')?.addEventListener('keydown',   e => e.key==='Enter' && verifyId());
  document.getElementById('certiId')?.addEventListener('keydown', e => e.key==='Enter' && verifyCert());

  /* "Verify Document" card — reuses the existing public ?verify_doc= flow (see the
     verify_doc IIFE further down) instead of duplicating any lookup/render logic here.
     Navigating to the same page with ?verify_doc=<number> re-runs that IIFE, which
     queries generated_documents, shows the status toast, and opens viewDocumentModal
     via renderGeneratedDocumentView() — identical to following a direct verify_doc link. */
  function verifyDocumentNumber() {
    const raw = document.getElementById('docNumberInput').value;
    const v = sanitize(raw.trim());
    const r = document.getElementById('docNumberResult');

    const rl = rateLimiter.check('verify_doc', 10, 60000);
    if (!rl.allowed) { showToast('بہت زیادہ کوشش', 'error'); return; }

    if (!v) {
      r.className = 'ver-result ver-invalid';
      r.innerHTML = `<div style="display:flex;align-items:center;gap:.75rem;"><i class="fas fa-exclamation-circle" style="font-size:1.5rem;color:var(--ruby);"></i><div><strong>دستاویز نمبر درج کریں</strong></div></div>`;
      r.style.display = 'block';
      return;
    }

    r.className = 'ver-result';
    r.style.display = 'block';
    r.innerHTML = '<div class="ver-loading"><i class="fas fa-spinner fa-spin"></i> Verifying…</div>';
    window.location.href = window.location.pathname + '?verify_doc=' + encodeURIComponent(v);
  }

  document.getElementById('docNumberInput')?.addEventListener('keydown', e => e.key==='Enter' && verifyDocumentNumber());


  /* ── HERO WORD CYCLING — رنگوں کے نام ── */
  const urduWords = ['ARTS', 'IDEAS', 'CULTURE', 'HERITAGE', 'CREATIVITY'];
  const engWords  = ['بدلتا', 'جوڑتا', 'محفوظ کرتا', 'سکھاتا', 'پروان چڑھتا'];
  let wi = 0;
  const wc = document.getElementById('wordCycle');
  const ec = document.getElementById('engCycle');

  function cycleWord() {
    if (!wc) return;
    wc.style.transition = 'opacity .3s ease, transform .3s ease';
    if (ec) ec.style.transition = 'opacity .3s ease';
    wc.style.opacity = '0';
    wc.style.transform = 'translateY(-14px)';
    if (ec) ec.style.opacity = '0';

    setTimeout(() => {
      wi = (wi + 1) % urduWords.length;
      wc.textContent = urduWords[wi];
      if (ec) ec.textContent = engWords[wi];
      wc.style.transform = 'translateY(12px)';
      requestAnimationFrame(() => {
        setTimeout(() => {
          wc.style.opacity = '1';
          wc.style.transform = 'translateY(0)';
          if (ec) ec.style.opacity = '1';
        }, 30);
      });
    }, 320);
  }
  setInterval(cycleWord, 2600);


  /* ── CHAPTER TABS ── */
  function switchChapter(id, btn) {
    document.querySelectorAll('.chapter-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.ptab').forEach(b => b.classList.remove('active'));
    document.getElementById('ch-' + id).classList.add('active');
    btn.classList.add('active');
  }


  /* ══════════════ MEMBERS (Admin) ══════════════ */

  function memberStatusPill(status) {
    if (status === 'active') return '<span class="status-pill sp-active">Active</span>';
    if (status === 'pending') return '<span class="status-pill sp-pending">Pending</span>';
    if (status === 'suspended') return '<span class="status-pill" style="background:#fee2e2;color:#991b1b;">Suspended</span>';
    return '<span class="status-pill" style="background:#f3e8ff;color:#6b21a8;">' + sanitize(status || '—') + '</span>';
  }

  /* ── Members Export: holds the last successfully loaded (server-filtered) member set,
     kept in sync with loadMembersAdmin() so Export always reflects the active filters. ── */
  var _membersCache = [];
  var _membersFilterDropdownsPopulated = false;

  async function populateMemberFilterDropdowns() {
    if (_membersFilterDropdownsPopulated) return;
    const socSel = document.getElementById('memberFilterSociety');
    const chapSel = document.getElementById('memberFilterChapter');
    if (socSel) {
      const { data: socs } = await sb.from('societies').select('id, name').order('name');
      (socs || []).forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id; opt.textContent = s.name;
        socSel.appendChild(opt);
      });
    }
    if (chapSel) {
      const { data: chaps } = await sb.from('chapters').select('id, name').order('name');
      (chaps || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id; opt.textContent = c.name;
        chapSel.appendChild(opt);
      });
    }
    _membersFilterDropdownsPopulated = true;
  }

  async function loadMembersAdmin() {
    if (!(await requireStaff())) return;
    const tbody = document.getElementById('membersBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">Loading members…</td></tr>';

    await populateMemberFilterDropdowns();

    const statusFilter = document.getElementById('memberFilterStatus') ? document.getElementById('memberFilterStatus').value : '';
    const societyFilter = document.getElementById('memberFilterSociety') ? document.getElementById('memberFilterSociety').value : '';
    const chapterFilter = document.getElementById('memberFilterChapter') ? document.getElementById('memberFilterChapter').value : '';

    let query = sb
      .from('profiles')
      .select('id, member_id, full_name, phone, role, status, province, membership_type, created_at, society_id, chapter_id, societies!profiles_society_id_fkey(name), chapters!profiles_chapter_id_fkey(name)')
      .order('member_id', { ascending: true });

    if (statusFilter) query = query.eq('status', statusFilter);
    if (societyFilter) query = query.eq('society_id', societyFilter);
    if (chapterFilter) query = query.eq('chapter_id', chapterFilter);

    const { data: members, error } = await query;

    if (error) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ruby);padding:1.5rem;">Failed to load: ' + sanitize(error.message) + '</td></tr>';
      _membersCache = [];
      return;
    }

    _membersCache = members || [];

    if (!members || members.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6"><div class="admin-empty"><strong>No records yet</strong>No members match the current filters.</div></td></tr>';
      return;
    }

    tbody.innerHTML = members.map(m => {
      const actions = [];
      actions.push(`<button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;" onclick="viewMember('${m.id}')">View</button>`);
      actions.push(`<button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--teal);" onclick="openMemberCardAdmin('${m.id}')"><i class="fas fa-id-badge"></i> Card</button>`);
      actions.push(`<button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--navy);" onclick="openEditMember('${m.id}')">Edit</button>`);
      actions.push(`<button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--gold);color:var(--navy);" onclick="openMemberDocumentsAdmin('${m.id}')"><i class="fas fa-folder-open"></i> Documents</button>`);
      if (m.status !== 'active') {
        actions.push(`<button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--teal);" onclick="setMemberStatus('${m.id}','active')">Approve</button>`);
      }
      if (m.status !== 'suspended') {
        actions.push(`<button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--ruby);" onclick="setMemberStatus('${m.id}','suspended')">Suspend</button>`);
      }
      if (m.status === 'suspended') {
        actions.push(`<button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:#7f1d1d;" onclick="deleteMemberPermanently('${m.id}','${(m.full_name||'').replace(/'/g,"\\'")}','${(m.phone||'').replace(/'/g,"\\'")}')"><i class="fas fa-trash"></i> Permanent Delete</button>`);
      }
      const societyName = m.societies ? m.societies.name : '—';
      const chapterName = m.chapters ? m.chapters.name : '—';
      return `<tr>
        <td>${sanitize(m.member_id || '—')}</td>
        <td>${sanitize(m.full_name || '—')}<br><span style="font-size:.72rem;color:var(--muted);">${sanitize(societyName)} · ${sanitize(chapterName)} · ${sanitize(m.province || '—')}</span></td>
        <td>${sanitize(m.phone || '—')}</td>
        <td style="text-transform:capitalize;">${sanitize(m.role || '—')}</td>
        <td>${memberStatusPill(m.status)}</td>
        <td style="display:flex;gap:.4rem;flex-wrap:wrap;">${actions.join('')}</td>
      </tr>`;
    }).join('');
  }

  async function setMemberStatus(id, newStatus) {
    if (!(await requireStaff())) return;
    const label = newStatus === 'active' ? 'approve' : 'suspend';
    if (!confirm('کیا آپ واقعی اس ممبر کو ' + (newStatus === 'active' ? 'approve' : 'suspend') + ' کرنا چاہتے ہیں؟')) return;

    const { error } = await sb.from('profiles').update({ status: newStatus }).eq('id', id);
    if (error) {
      showToast('اپڈیٹ ناکام: ' + error.message, 'error');
      return;
    }
    showToast('ممبر کا status اپڈیٹ ہو گیا۔');
    loadMembersAdmin();
  }

  /* ── Permanently Delete a Suspended Member (profile + matching application) ── */
  async function deleteMemberPermanently(id, fullName, phone) {
    if (!(await requireStaff())) return;
    if (!confirm('یہ ممبر SUSPENDED ہے اور شرائط پوری نہیں کرتا۔ کیا آپ اسے مستقل طور پر ڈیٹا فائل سے ڈیلیٹ کرنا چاہتے ہیں؟ یہ عمل واپس نہیں ہو سکتا۔')) return;
    if (!confirm('آخری تصدیق: پروفائل اور متعلقہ درخواست دونوں ہمیشہ کے لیے حذف ہو جائیں گی۔ جاری رکھیں؟')) return;

    // Try to remove any matching pending/old application record by name+phone (best-effort, no direct FK link exists)
    if (fullName) {
      try {
        let q = sb.from('applications').delete().eq('full_name', fullName);
        if (phone) q = q.eq('phone', phone);
        await q;
      } catch (e) { /* non-fatal */ }
    }

    const { data, error } = await sb.from('profiles').delete().eq('id', id).select('id');
    if (error) {
      showToast('ڈیلیٹ ناکام: ' + error.message, 'error');
      return;
    }
    if (!data || data.length === 0) {
      showToast('ڈیلیٹ ناکام — ڈیٹا بیس میں اجازت (RLS Policy) موجود نہیں، اس لیے پروفائل حذف نہیں ہوا۔', 'error');
      return;
    }
    showToast('ممبر اور متعلقہ ریکارڈ مستقل طور پر حذف کر دیے گئے۔');
    loadMembersAdmin();
  }

  async function openEditMember(id) {
    if (!(await requireStaff())) return;
    const { data: m, error } = await sb
      .from('profiles')
      .select('id, society_id, chapter_id, province')
      .eq('id', id)
      .single();

    if (error || !m) { showToast('ممبر کی تفصیل لوڈ نہیں ہو سکی', 'error'); return; }

    document.getElementById('editMemberId').value = m.id;
    document.getElementById('editMemberProvince').value = m.province || '';

    const socSel = document.getElementById('editMemberSociety');
    const { data: socs } = await sb.from('societies').select('id, name').order('name');
    socSel.innerHTML = '<option value="">— کوئی Society منتخب نہیں —</option>';
    (socs || []).forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      socSel.appendChild(opt);
    });
    socSel.value = m.society_id || '';

    const chapSel = document.getElementById('editMemberChapter');
    const { data: chaps } = await sb.from('chapters').select('id, name').order('name');
    chapSel.innerHTML = '<option value="">— کوئی Chapter منتخب نہیں —</option>';
    (chaps || []).forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      chapSel.appendChild(opt);
    });
    chapSel.value = m.chapter_id || '';

    openModal('editMemberModal');
  }

  window.addEventListener('DOMContentLoaded', () => secureSubmit('editMemberForm', async frm => {
    if (!(await requireStaff())) return;
    const id = frm.querySelector('#editMemberId').value;
    const society_id = frm.querySelector('#editMemberSociety').value || null;
    const chapter_id = frm.querySelector('#editMemberChapter').value || null;
    const province = frm.querySelector('#editMemberProvince').value.trim() || null;

    const { error } = await sb.from('profiles').update({ society_id, chapter_id, province }).eq('id', id);
    if (error) {
      showToast('اپڈیٹ ناکام: ' + error.message, 'error');
      return;
    }
    showToast('ممبر کی تفصیلات محفوظ ہو گئیں۔');
    closeModal('editMemberModal');
    loadMembersAdmin();
  }));

  async function viewMember(id) {
    const { data: m, error } = await sb
      .from('profiles')
      .select('member_id, full_name, phone, bio, role, status, province, avatar_url, societies!profiles_society_id_fkey(name), chapters!profiles_chapter_id_fkey(name)')
      .eq('id', id)
      .single();

    if (error || !m) { showToast('ممبر کی تفصیل لوڈ نہیں ہو سکی', 'error'); return; }

    const societyName = m.societies ? m.societies.name : '—';
    const chapterName = m.chapters ? m.chapters.name : '—';

    document.getElementById('vmName').textContent = m.full_name || '—';
    document.getElementById('vmMemberId').textContent = m.member_id || '—';
    document.getElementById('vmRole').textContent = m.role || '—';
    document.getElementById('vmPhone').textContent = m.phone || '—';
    document.getElementById('vmSociety').textContent = societyName;
    document.getElementById('vmChapter').textContent = chapterName;
    document.getElementById('vmProvince').textContent = m.province || '—';
    document.getElementById('vmBio').textContent = m.bio || '—';
    document.getElementById('vmStatusPill').innerHTML = memberStatusPill(m.status);

    const avatarImg = document.getElementById('vmAvatarImg');
    const avatarPlaceholder = document.getElementById('vmAvatarPlaceholder');
    if (m.avatar_url) {
      avatarImg.src = m.avatar_url;
      avatarImg.style.display = 'block';
      avatarPlaceholder.style.display = 'none';
    } else {
      avatarImg.style.display = 'none';
      avatarPlaceholder.style.display = 'flex';
    }

    openModal('viewMemberModal');
  }

  /* ── Member search now filters the real table ── */
  function searchMembers(q) {
    const s = sanitize(q).toLowerCase();
    document.querySelectorAll('#membersBody tr').forEach(row => {
      row.style.display = row.textContent.toLowerCase().includes(s) ? '' : 'none';
    });
  }

  /* ── Members Export: real, working CSV export.
     Exports whatever is currently loaded in _membersCache (i.e. respects the
     Status/Society/Chapter dropdown filters) AND further respects the live search box text,
     the same way the on-screen table is filtered — so "what you see is what you export".
     Only fields that actually exist on profiles are included; fields the schema does not
     currently store (email, WhatsApp, membership start/expiry date, a separate membership
     code) are intentionally left out rather than faked — see the Phase 1 report. ── */
  function exportMembersCSV() {
    if (!_membersCache || _membersCache.length === 0) {
      showToast('کوئی ممبرز موجود نہیں جنہیں ایکسپورٹ کیا جا سکے', 'error');
      return;
    }

    const searchInput = document.getElementById('memberSearchInput');
    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : '';

    let rows = _membersCache;
    if (searchTerm) {
      rows = rows.filter(m => {
        const hay = [
          m.member_id, m.full_name, m.phone, m.role, m.status, m.province, m.membership_type,
          m.societies ? m.societies.name : '', m.chapters ? m.chapters.name : ''
        ].join(' ').toLowerCase();
        return hay.includes(searchTerm);
      });
    }

    if (rows.length === 0) {
      showToast('موجودہ فلٹرز کے مطابق کوئی ممبر نہیں ملا', 'error');
      return;
    }

    const headers = ['Member ID', 'Full Name', 'Phone', 'Role', 'Status', 'Society', 'Chapter', 'Province', 'Membership Type', 'Joined'];
    const csvEscape = v => {
      const s = (v === null || v === undefined) ? '' : String(v);
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const lines = [headers.map(csvEscape).join(',')];
    rows.forEach(m => {
      lines.push([
        m.member_id || '', m.full_name || '', m.phone || '', m.role || '', m.status || '',
        m.societies ? m.societies.name : '', m.chapters ? m.chapters.name : '', m.province || '',
        m.membership_type || '', m.created_at ? String(m.created_at).slice(0, 10) : ''
      ].map(csvEscape).join(','));
    });

    // Professional, dynamic filename reflecting the active filters — never hardcoded.
    const statusFilter = document.getElementById('memberFilterStatus') ? document.getElementById('memberFilterStatus').value : '';
    const societySel = document.getElementById('memberFilterSociety');
    const chapterSel = document.getElementById('memberFilterChapter');
    const societyLabel = (societySel && societySel.value) ? societySel.options[societySel.selectedIndex].textContent.trim().replace(/[^a-zA-Z0-9]+/g, '-') : '';
    const chapterLabel = (chapterSel && chapterSel.value) ? chapterSel.options[chapterSel.selectedIndex].textContent.trim().replace(/[^a-zA-Z0-9]+/g, '-') : '';
    const todayStr = new Date().toISOString().slice(0, 10);

    let nameParts = ['SHAOOR-Members'];
    if (statusFilter) nameParts.push(statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1));
    if (societyLabel) nameParts.push('Society-' + societyLabel);
    if (chapterLabel) nameParts.push('Chapter-' + chapterLabel);
    nameParts.push(todayStr);
    const filename = nameParts.join('-') + '.csv';

    const csvContent = '\uFEFF' + lines.join('\r\n'); // BOM so Urdu/Arabic text opens correctly in Excel
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✓ ' + rows.length + ' ممبرز ایکسپورٹ ہو گئے: ' + filename);
  }

  /* ── ADMIN ── */
  function switchLoginTab(which) {
    var m = document.getElementById('loginTabMember');
    var a = document.getElementById('loginTabAdmin');
    if (!m || !a) return;
    if (which === 'member') {
      m.style.background = 'var(--gold)'; m.style.borderColor = 'var(--gold)'; m.style.color = '#1a1200';
      a.style.background = 'transparent'; a.style.borderColor = 'var(--border)'; a.style.color = 'var(--text)';
    } else if (which === 'admin') {
      a.style.background = 'var(--gold)'; a.style.borderColor = 'var(--gold)'; a.style.color = '#1a1200';
      m.style.background = 'transparent'; m.style.borderColor = 'var(--border)'; m.style.color = 'var(--text)';
    }
  }
  function openAdmin() {
    document.getElementById('adminPage').classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('adminUser').focus(), 300);
  }
  function closeAdmin() {
    document.getElementById('adminPage').classList.remove('open');
    document.getElementById('adminDash').classList.remove('open');
    document.body.style.overflow = '';
  }
  async function adminLogout() {
    await sb.auth.signOut();
    document.getElementById('adminDash').classList.remove('open');
    document.getElementById('adminPage').classList.remove('open');
    document.body.style.overflow = '';
    document.getElementById('adminLoginForm').reset();
    showToast('Logged out successfully');
  }
  function toggleAdminPass() {
    const inp = document.getElementById('adminPass');
    const eye = document.getElementById('passEye').querySelector('i');
    if (inp.type === 'password') {
      inp.type = 'text'; eye.className = 'fas fa-eye-slash';
    } else {
      inp.type = 'password'; eye.className = 'fas fa-eye';
    }
  }
  window.togglePwField = function(inputId, btnEl) {
    const inp = document.getElementById(inputId);
    const eye = btnEl.querySelector('i');
    if (inp.type === 'password') {
      inp.type = 'text'; eye.className = 'fas fa-eye-slash';
    } else {
      inp.type = 'password'; eye.className = 'fas fa-eye';
    }
  };
  function switchDashTab(id, btn) {
    document.querySelectorAll('.dash-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.dtab,.admin-nav-btn').forEach(b => b.classList.remove('active'));
    const panel = document.getElementById('dp-' + id);
    if (panel) panel.classList.add('active');
    btn.classList.add('active');
    if (id === 'certificates') loadCertificatesAdmin();
    if (id === 'members') loadMembersAdmin();
    if (id === 'applications') loadApplicationsAdmin();
    if (id === 'organization') { loadSocietiesAdmin(); loadChaptersAdmin(); loadCentralCabinetAdmin(); }
    if (id === 'gallery') loadGalleryAdmin();
    if (id === 'media') loadMediaLinksAdmin();
    if (id === 'events') loadEventsAdmin();
    if (id === 'learning') { loadCoursesAdmin(); loadEnrollmentsAdmin(); loadLiveSessionsAdmin(); loadPlatformSettingsAdmin(); }
    if (id === 'analytics') loadAnalyticsAdmin();
  }

  /* ===== Analytics ===== */
  let anCharts = {};
  function anRenderChart(canvasId, emptyId, type, labels, data, colors) {
    const canvas = document.getElementById(canvasId);
    const emptyEl = document.getElementById(emptyId);
    if (anCharts[canvasId]) { anCharts[canvasId].destroy(); anCharts[canvasId] = null; }
    if (!labels.length || data.every(v => !v)) {
      canvas.style.display = 'none';
      if (emptyEl) emptyEl.style.display = 'block';
      return;
    }
    canvas.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    anCharts[canvasId] = new Chart(canvas.getContext('2d'), {
      type,
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: colors || ['#C8A96B','#F0C75E','#142F4A','#205072','#4A3B72','#8A6FBF','#E8B4A0','#7FA6C9'],
          borderColor: '#0B1F33',
          borderWidth: type === 'line' ? 2 : 1,
          tension: .35,
          fill: type === 'line'
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: type === 'doughnut' || type === 'pie', labels: { color: 'var(--text)' } } },
        scales: (type === 'bar' || type === 'line') ? {
          x: { ticks: { color: '#7a8399' }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: '#7a8399', precision: 0 }, grid: { color: 'rgba(122,131,153,.15)' } }
        } : undefined
      }
    });
  }

  async function loadDashTopStats() {
    try {
      const [
        { count: totalMembers },
        { count: pendingApps },
        { count: totalArtworks },
        { data: chapters }
      ] = await Promise.all([
        sb.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        sb.from('applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('gallery').select('id', { count: 'exact', head: true }),
        sb.from('chapters').select('id')
      ]);
      document.getElementById('dsTotalMembers').textContent = totalMembers ?? 0;
      document.getElementById('dsPendingApplications').textContent = pendingApps ?? 0;
      document.getElementById('dsArtworksListed').textContent = totalArtworks ?? 0;
      document.getElementById('dsActiveChapters').textContent = (chapters || []).length;
    } catch (err) {
      console.error('Dashboard top stats load error:', err);
    }
  }

  async function loadAnalyticsAdmin() {
    try {
      const [
        { count: totalMembers },
        { count: pendingApps },
        { data: societies },
        { data: chapters },
        { count: totalEvents },
        { count: totalCertificates },
        { count: totalBlogPosts },
        { data: allProfiles }
      ] = await Promise.all([
        sb.from('profiles').select('id', { count: 'exact', head: true }),
        sb.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        sb.from('societies').select('id, name'),
        sb.from('chapters').select('id, name, province'),
        sb.from('events').select('id', { count: 'exact', head: true }),
        sb.from('certificates').select('id', { count: 'exact', head: true }),
        sb.from('blog_posts').select('id', { count: 'exact', head: true }),
        sb.from('profiles').select('society_id, chapter_id, province, status, created_at')
      ]);

      document.getElementById('anTotalMembers').textContent = totalMembers ?? 0;
      document.getElementById('anPendingApplications').textContent = pendingApps ?? 0;
      document.getElementById('anTotalSocieties').textContent = (societies || []).length;
      document.getElementById('anTotalChapters').textContent = (chapters || []).length;
      document.getElementById('anTotalEvents').textContent = totalEvents ?? 0;
      document.getElementById('anTotalCertificates').textContent = totalCertificates ?? 0;
      document.getElementById('anTotalBlogPosts').textContent = totalBlogPosts ?? 0;

      const profs = allProfiles || [];

      /* Members by Society */
      const socMap = {}; (societies || []).forEach(s => socMap[s.id] = s.name);
      const socCounts = {};
      profs.forEach(p => { if (p.society_id) { const n = socMap[p.society_id] || 'نامعلوم'; socCounts[n] = (socCounts[n] || 0) + 1; } });
      anRenderChart('anChartSocieties', 'anChartSocietiesEmpty', 'bar', Object.keys(socCounts), Object.values(socCounts));

      /* Members by Chapter/Province */
      const provCounts = {};
      profs.forEach(p => { if (p.province) { provCounts[p.province] = (provCounts[p.province] || 0) + 1; } });
      anRenderChart('anChartChapters', 'anChartChaptersEmpty', 'bar', Object.keys(provCounts), Object.values(provCounts));

      /* Membership Status Breakdown */
      const statusCounts = {};
      profs.forEach(p => { const s = p.status || 'نامعلوم'; statusCounts[s] = (statusCounts[s] || 0) + 1; });
      anRenderChart('anChartStatus', 'anChartStatusEmpty', 'doughnut', Object.keys(statusCounts), Object.values(statusCounts));

      /* New Signups — Last 6 Months */
      const months = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({ key: d.getFullYear() + '-' + d.getMonth(), label: d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }) });
      }
      const monthCounts = Object.fromEntries(months.map(m => [m.key, 0]));
      profs.forEach(p => {
        if (!p.created_at) return;
        const d = new Date(p.created_at);
        const key = d.getFullYear() + '-' + d.getMonth();
        if (key in monthCounts) monthCounts[key]++;
      });
      anRenderChart('anChartSignups', 'anChartSignupsEmpty', 'line', months.map(m => m.label), months.map(m => monthCounts[m.key]), ['#C8A96B']);

    } catch (err) {
      console.error('Analytics load error:', err);
    }
  }

  /* Admin form */
  const adminLoginForm = document.getElementById('adminLoginForm');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', async e => {
      e.preventDefault();
      const rl = rateLimiter.check('admin_login', 5, 300000);
      const err = document.getElementById('adminError');
      if (!rl.allowed) {
        document.getElementById('adminErrMsg').textContent = 'Too many attempts. Wait ' + rl.wait + ' seconds.';
        err.style.display = 'flex'; err.style.alignItems = 'center'; err.style.gap = '.5rem';
        return;
      }
      const email = document.getElementById('adminUser').value.trim();
      const password = document.getElementById('adminPass').value;

      /* REAL SUPABASE AUTH — replaces old hardcoded credentials */
      const { data, error } = await sb.auth.signInWithPassword({ email, password });

      if (error) {
        document.getElementById('adminErrMsg').textContent = 'Invalid email or password.';
        err.style.display = 'flex'; err.style.alignItems = 'center'; err.style.gap = '.5rem';
        document.getElementById('adminPass').value = '';
        document.getElementById('adminPass').focus();
        return;
      }

      /* Fetch this user's profile to check their role */
      const { data: profile, error: profileError } = await sb
        .from('profiles')
        .select('full_name, role, status')
        .eq('id', data.user.id)
        .single();

      if (profileError || !profile || STAFF_ROLES.indexOf(profile.role) === -1 || profile.status !== 'active') {
        await sb.auth.signOut();
        document.getElementById('adminErrMsg').textContent = 'This account does not have admin access.';
        err.style.display = 'flex'; err.style.alignItems = 'center'; err.style.gap = '.5rem';
        return;
      }

      document.getElementById('adminPage').classList.remove('open');
      document.getElementById('adminDash').classList.add('open');
      document.getElementById('dashAdminName').textContent = profile.full_name || profile.role;
      err.style.display = 'none';
      initReveal();
      loadMembersAdmin();
      loadDashTopStats();
    });
  }

  /* ── SCROLL REVEAL ── */
  function initReveal() {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          en.target.classList.add('visible');
          obs.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.reveal,.reveal-left,.reveal-right').forEach(el => obs.observe(el));
  }
  document.addEventListener('DOMContentLoaded', initReveal);

  /* ── Public About + Founder content loader ── */
  window.addEventListener('DOMContentLoaded', async () => {
    try {
      const { data, error } = await sb.from('brand_settings').select('founder_name, founder_title, founder_bio, founder_quote, founder_photo_url, about_image_url, about_intro, about_para1, about_para2').limit(1).maybeSingle();
      if (error || !data) return;
      const setText = (id, val) => { if (val) { const el = document.getElementById(id); if (el) el.textContent = val; } };
      setText('founderName', data.founder_name);
      setText('founderTitle', data.founder_title);
      if (data.founder_quote) { const q = document.getElementById('founderQuote'); if (q) q.textContent = '"' + data.founder_quote + '"'; }
      setText('founderBio', data.founder_bio);
      setText('aboutIntro', data.about_intro);
      setText('aboutPara1', data.about_para1);
      setText('aboutPara2', data.about_para2);
      if (data.founder_photo_url) {
        const founderImg = document.getElementById('founderImg');
        const founderPh = document.getElementById('founderImgPlaceholder');
        if (founderImg) { founderImg.src = data.founder_photo_url; founderImg.style.display = ''; }
        if (founderPh) founderPh.style.display = 'none';
      }
      if (data.about_image_url) {
        const aboutImg = document.getElementById('aboutImg');
        const aboutPh = document.getElementById('aboutImgPlaceholder');
        if (aboutImg) { aboutImg.src = data.about_image_url; aboutImg.style.display = ''; }
        if (aboutPh) aboutPh.style.display = 'none';
      }
    } catch (e) { console.error('[Public Content] load error:', e); }
  });
  initReveal();

  /* ── FOOTER STATS COUNTER ANIMATION ── */
  function animateCounter(el, target, suffix='') {
    target = Number.isFinite(target) ? target : 0;
    let current = 0;
    const step = Math.ceil(Math.max(target, 1) / 60);
    const timer = setInterval(() => {
      current += step;
      if (current >= target) { current = target; clearInterval(timer); }
      el.textContent = current + suffix;
    }, 25);
  }
  function heroStatsObserve() {
    const statNums = document.querySelectorAll('.stat-num');
    const heroObs = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (en.isIntersecting) {
          const txt = en.target.textContent;
          const num = parseInt(txt, 10);
          const suf = txt.replace(/[0-9]/g,'');
          animateCounter(en.target, isNaN(num) ? 0 : num, suf);
          heroObs.unobserve(en.target);
        }
      });
    }, { threshold: 0.5 });
    statNums.forEach(el => heroObs.observe(el));
  }

  /* Populate the real hero stats (Societies / Chapters / Upcoming Events / Active Members)
     — these were previously left as placeholder "—" text with no data source, which is why
     the counters showed "NaN" once the scroll-triggered animation tried to parse them. */
  async function loadHeroStats() {
    try {
      const nowIso = new Date().toISOString();
      const [
        { count: societiesCount },
        { count: chaptersCount },
        { count: upcomingEventsCount },
        { count: activeMembersCount }
      ] = await Promise.all([
        sb.from('societies').select('id', { count: 'exact', head: true }),
        sb.from('chapters').select('id', { count: 'exact', head: true }),
        sb.from('events').select('id', { count: 'exact', head: true }).gte('event_date', nowIso),
        sb.from('profiles').select('id', { count: 'exact', head: true }).eq('status', 'active')
      ]);

      const setStat = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = String(val ?? 0); };
      setStat('heroStatSocieties', societiesCount);
      setStat('heroStatChapters', chaptersCount);
      setStat('heroStatEvents', upcomingEventsCount);
      setStat('heroStatMembers', activeMembersCount);

      const wrap = document.getElementById('heroStatsWrap');
      if (wrap) wrap.style.display = '';

      heroStatsObserve();
    } catch (e) {
      console.error('[Hero Stats] load error:', e);
    }
  }
  // loadHeroStats(); // hero stats box removed from homepage per request

  /* ── PUBLIC GALLERY (SHAOOR's own events/exhibitions/workshops/webinars) ── */
  let lightboxPhotos = [];
  let lightboxIndex = 0;
  let lightboxItemsCache = [];
  let galleryActiveCategory = 'all';

  function filterGallery(cat, btn) {
    galleryActiveCategory = cat;
    document.querySelectorAll('#galleryFilters .gf-tab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderGalleryGrid();
  }

  window.loadPublicGallery = async function loadPublicGallery() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;

    // Show loading skeleton
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--muted);">
        <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;margin-bottom:.5rem;display:block;"></i>
        <span style="font-size:.88rem;">Gallery لوڈ ہو رہی ہے…</span>
      </div>`;

    if (!sb) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:2rem;">سرور سے رابطہ نہیں ہو سکا۔</p>';
      return;
    }

    let items, error;
    try {
      const res = await sb
        .from('gallery')
        .select('id, title, event_date, description, image_url, category')
        .order('event_date', { ascending: false });
      items = res.data;
      error = res.error;
    } catch(fetchErr) {
      error = { message: fetchErr.message || 'Network error' };
    }

    if (error) {
      const errMsg = error?.message || error?.details || error?.hint || JSON.stringify(error);
      console.error('Gallery load failed:', errMsg);
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:3rem 1rem;">
          <div style="background:var(--cream2);border:1px solid var(--border);border-radius:10px;padding:2rem;max-width:480px;margin:0 auto;">
            <i class="fas fa-images" style="font-size:2rem;color:var(--muted);margin-bottom:.75rem;display:block;"></i>
            <p style="color:var(--ink);font-weight:600;margin-bottom:.35rem;">Gallery لوڈ نہیں ہو سکی</p>
            <p style="color:var(--muted);font-size:.84rem;margin-bottom:.75rem;">براہ کرم انٹرنیٹ کنیکشن چیک کریں یا صفحہ دوبارہ لوڈ کریں۔</p>
            <button onclick="loadPublicGallery()" class="btn btn-outline" style="font-size:.82rem;">
              <i class="fas fa-redo"></i> دوبارہ کوشش کریں
            </button>
          </div>
        </div>`;
      return;
    }

    if (!items || items.length === 0) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:2rem;">ابھی کوئی تصاویر شامل نہیں کی گئیں۔</p>';
      return;
    }

    lightboxItemsCache = items;

    // Get photo counts for all gallery items in one query
    let allPhotos = [];
    try {
      const photosRes = await sb
        .from('gallery_photos')
        .select('gallery_id')
        .in('gallery_id', items.map(i => i.id));
      allPhotos = photosRes.data || [];
    } catch(e) {
      console.warn('gallery_photos fetch failed:', e.message);
    }
    const counts = {};
    allPhotos.forEach(p => { counts[p.gallery_id] = (counts[p.gallery_id] || 0) + 1; });
    galleryPhotoCountsCache = counts;

    renderGalleryGrid();
  }
  let galleryPhotoCountsCache = {};

  function renderGalleryGrid() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;
    const counts = galleryPhotoCountsCache;
    const items = galleryActiveCategory === 'all'
      ? lightboxItemsCache
      : lightboxItemsCache.filter(i => (i.category || 'event') === galleryActiveCategory);

    if (items.length === 0) {
      grid.innerHTML = '<div class="gallery-empty"><i class="fas fa-images" style="font-size:1.4rem;color:var(--gold);display:block;margin-bottom:.5rem;"></i>اس قسم میں ابھی کوئی تصاویر شامل نہیں۔</div>';
      return;
    }

    grid.innerHTML = items.map(item => {
      const img = (typeof usablePublicImage === 'function' ? usablePublicImage(item.image_url) : (item.image_url || ''));
      const cat = sanitize(item.category || 'event');
      const dateStr = item.event_date ? new Date(item.event_date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '';
      const head = img
        ? `<div class="gallery-head" style="background-image:url('${sanitize(img)}');background-size:cover;background-position:center;position:relative;">`
        : `<div class="gallery-head" style="position:relative;display:flex;align-items:center;justify-content:center;color:var(--muted);"><i class="fas fa-image"></i>`;
      return `
      <article class="gallery-item reveal" style="cursor:pointer;" onclick="openLightbox('${item.id}')">
        ${head}
          <span class="gallery-cat">${cat}</span>
          ${counts[item.id] > 1 ? `<span style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,.65);color:#fff;font-size:.7rem;padding:.2rem .5rem;border-radius:999px;"><i class="fas fa-images"></i> ${counts[item.id]}</span>` : ''}
        </div>
        <div class="gallery-caption">
          <strong>${sanitize(item.title)}</strong>
          <span>${dateStr}${item.description ? ' · ' + sanitize(item.description) : ''}</span>
        </div>
      </article>`;
    }).join('');

    initReveal();
  }
  loadPublicGallery();

  /* ── PUBLIC MEDIA LINKS (YouTube / Facebook) ── */
  // Repairs URLs that were corrupted by the old sanitize() bug, which HTML-escaped
  // forward slashes ('/' -> '&#x2F;') before saving them — turning every stored
  // YouTube/Facebook/media link into something like "https:&#x2F;&#x2F;youtube.com&#x2F;...".
  // Decoding entities here means old, already-broken database rows work again
  // immediately, with no need to re-enter every link by hand.
  function decodeUrlEntities(str) {
    if (!str) return str;
    const div = document.createElement('div');
    div.innerHTML = str;
    return div.textContent || div.innerText || str;
  }
  function ytEmbedUrl(url) {
    try {
      const u = new URL(decodeUrlEntities(url));
      let id = '';
      if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
      else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/embed/')[1];
      else if (u.pathname.startsWith('/shorts/')) id = u.pathname.split('/shorts/')[1];
      else id = u.searchParams.get('v') || '';
      id = (id || '').split('&')[0].split('?')[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    } catch(e) { return null; }
  }
  function fbEmbedUrl(url) {
    let normalized = decodeUrlEntities(url);
    try {
      const u = new URL(normalized);
      // Facebook blocks iframe-embedding from web.facebook.com / m.facebook.com / mobile.facebook.com (X-Frame-Options).
      // Only www.facebook.com works inside the embed plugin.
      if (/(^|\.)facebook\.com$/.test(u.hostname) && u.hostname !== 'www.facebook.com') {
        u.hostname = 'www.facebook.com';
        normalized = u.toString();
      }
    } catch(e) { /* leave as-is if URL parsing fails */ }
    return `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(normalized)}&show_text=true&width=500`;
  }

  // Shared by loadPublicMediaLinks below — hoisted to module scope so the onerror
  // fallback handler (mediaLinkThumbError) can also reach it.
  const MEDIA_PLATFORM_META = {
    youtube:   { label: 'YouTube',    icon: '<i class="fab fa-youtube" style="color:#FF0000;"></i>' },
    facebook:  { label: 'Facebook',   icon: '<i class="fab fa-facebook" style="color:#1877F2;"></i>' },
    instagram: { label: 'Instagram',  icon: '<i class="fab fa-instagram" style="color:#C13584;"></i>' },
    tiktok:    { label: 'TikTok',     icon: '<i class="fab fa-tiktok" style="color:#000;"></i>' },
    twitter:   { label: 'Twitter/X',  icon: '<i class="fab fa-x-twitter" style="color:#000;"></i>' },
    linkedin:  { label: 'LinkedIn',   icon: '<i class="fab fa-linkedin" style="color:#0A66C2;"></i>' },
    other:     { label: 'Link',       icon: '<i class="fas fa-link"></i>' }
  };
  function mediaLinkThumbFallbackBlock(platform) {
    const meta = MEDIA_PLATFORM_META[platform] || MEDIA_PLATFORM_META.other;
    return `<div style="width:100%;aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;background:var(--cream2);border-radius:12px 12px 0 0;color:var(--muted);font-size:2rem;">${meta.icon}</div>`;
  }
  // A missing, deleted, or broken admin-uploaded thumbnail must never show a broken-image
  // icon — swap it for the same generic platform-icon placeholder used when no thumbnail
  // was ever provided at all.
  window.mediaLinkThumbError = function(imgEl, platform) {
    const wrap = imgEl.closest('.ml-thumb-wrap') || imgEl.parentElement;
    if (wrap) wrap.outerHTML = mediaLinkThumbFallbackBlock(platform);
  };

  window.loadPublicMediaLinks = async function loadPublicMediaLinks() {
    const grid = document.getElementById('mediaLinksGrid');
    if (!grid) return;
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:2rem;color:var(--muted);">
        <i class="fas fa-spinner fa-spin" style="font-size:1.5rem;margin-bottom:.5rem;display:block;"></i>
        <span style="font-size:.88rem;">Media لوڈ ہو رہا ہے…</span>
      </div>`;
    if (!sb) { grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:2rem;">سرور سے رابطہ نہیں ہو سکا۔</p>'; return; }

    let items, error;
    try {
      const res = await sb.from('media_links').select('id, platform, title, url, status, thumbnail_url')
        .eq('status', 'published')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });
      items = res.data; error = res.error;
    } catch(e) { error = { message: e.message }; }

    if (error) {
      grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:2rem;">Media لوڈ نہیں ہو سکا۔</p>`;
      console.error('Media links load failed:', error.message);
      return;
    }
    if (!items || items.length === 0) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:2rem;">ابھی کوئی میڈیا لنک شامل نہیں کیا گیا۔</p>';
      return;
    }

    const platformMeta = MEDIA_PLATFORM_META;
    grid.innerHTML = items.map(item => {
      const meta = platformMeta[item.platform] || platformMeta.other;
      // Only YouTube and Facebook have an actual embeddable iframe URL builder.
      // Every other platform (Instagram, TikTok, X, LinkedIn, etc.) does not support
      // simple public iframe embedding at all, so for those we show the admin-provided
      // thumbnail when available, or the existing icon-card fallback otherwise. YouTube/
      // Facebook keep their live iframe unchanged regardless of whether a thumbnail exists.
      const thumbUrl = item.thumbnail_url && isSafeHttpUrl(item.thumbnail_url) ? item.thumbnail_url : null;
      // Prefer a stored thumbnail over Facebook's plugin iframe (which often renders
      // "This Facebook post is no longer available"). YouTube still uses its live embed
      // unless no embed URL can be built.
      const embed = item.platform === 'youtube' ? ytEmbedUrl(item.url)
                  : (item.platform === 'facebook' && !thumbUrl) ? fbEmbedUrl(item.url)
                  : null;
      const icon = meta.icon;
      const frame = embed
        ? `<iframe src="${embed}" style="width:100%;aspect-ratio:16/9;border:0;border-radius:12px 12px 0 0;" loading="lazy" allowfullscreen></iframe>`
        : (thumbUrl
            ? `<div class="ml-thumb-wrap" style="width:100%;aspect-ratio:16/9;border-radius:12px 12px 0 0;overflow:hidden;">
                 <img src="${sanitize(thumbUrl)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="mediaLinkThumbError(this,'${item.platform}')" />
               </div>`
            : mediaLinkThumbFallbackBlock(item.platform));
      // Decode first (repairs old rows saved with &#x2F; instead of /), then only
      // escape double-quotes for safe attribute embedding — sanitize() would just
      // re-corrupt the slashes all over again.
      const safeUrl = decodeUrlEntities(item.url).replace(/"/g, '&quot;');
      // Facebook's plugin, and a private/embed-disabled YouTube video, can both refuse
      // to render inside the iframe with no way for us to detect that failure from the
      // parent page (cross-origin iframes don't report their internal errors back).
      // So every card also gets a guaranteed, always-visible direct link — this is the
      // one fallback that works regardless of embedding restrictions.
      return `
        <article class="gallery-item ml-card reveal">
          ${frame}
          <div class="gallery-caption">
            <div class="ml-meta"><span class="ml-badge">${icon} ${sanitize(meta.label || item.platform || '')}</span></div>
            <strong>${sanitize(item.title)}</strong>
            <span><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--gold);font-weight:700;">${embed ? 'اگر یہاں نظر نہ آئے تو براہِ راست' : 'براہِ راست'} ${meta.label} پر دیکھیں <i class="fas fa-external-link-alt"></i></a></span>
          </div>
        </article>`;
    }).join('');

    initReveal();
  };
  loadPublicMediaLinks();

  async function openLightbox(galleryId) {
    const item = lightboxItemsCache.find(i => i.id === galleryId);
    if (!item) return;

    const { data: photos } = await sb
      .from('gallery_photos')
      .select('image_url')
      .eq('gallery_id', galleryId)
      .order('sort_order', { ascending: true });

    lightboxPhotos = (photos && photos.length > 0) ? photos.map(p => p.image_url) : [item.image_url];
    lightboxIndex = 0;

    document.getElementById('lightboxTitle').textContent = item.title;
    document.getElementById('lightboxDesc').textContent = item.description || '';
    updateLightboxImage();
    openModal('galleryLightbox');
  }

  function updateLightboxImage() {
    document.getElementById('lightboxImg').src = lightboxPhotos[lightboxIndex];
    document.getElementById('lightboxCounter').textContent = (lightboxIndex + 1) + ' / ' + lightboxPhotos.length;
  }

  function lightboxNav(dir) {
    lightboxIndex = (lightboxIndex + dir + lightboxPhotos.length) % lightboxPhotos.length;
    updateLightboxImage();
  }

  /* ── ADMIN: GALLERY MANAGEMENT ── */
  let galleryItemsCache = [];

  async function loadGalleryAdmin() {
    const panel = document.getElementById('dp-gallery');
    if (!panel) return;
    const tbody = document.getElementById('galleryAdminBody');
    if (!tbody) return;

    const { data: items, error } = await sb
      .from('gallery')
      .select('id, title, event_date, description, image_url, category')
      .order('event_date', { ascending: false });

    if (error || !items) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1.5rem;">لوڈ نہیں ہو سکا</td></tr>';
      return;
    }

    galleryItemsCache = items;

    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1.5rem;">کوئی entry موجود نہیں</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(it => `
      <tr>
        <td><img src="${it.image_url}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;" /></td>
        <td>${sanitize(it.title)}</td>
        <td>${new Date(it.event_date).toLocaleDateString('en-GB')}</td>
        <td>
          <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;" onclick="editGalleryItem('${it.id}')"><i class="fas fa-edit"></i> Edit</button>
          <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;" onclick="deleteGalleryItem('${it.id}')"><i class="fas fa-trash"></i> Delete</button>
        </td>
      </tr>
    `).join('');
  }

  /* Show previews of the newly chosen images before upload */
  function previewGalleryImage(input) {
    const wrap = document.getElementById('gImagePreviewWrap');
    wrap.innerHTML = '';
    Array.from(input.files).forEach(file => {
      const reader = new FileReader();
      reader.onload = e => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.style.cssText = 'width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #eee;';
        wrap.appendChild(img);
      };
      reader.readAsDataURL(file);
    });
  }

  /* Populate the form with an existing item's data for editing */
  function editGalleryItem(id) {
    const item = galleryItemsCache.find(it => it.id === id);
    if (!item) return;

    document.getElementById('gEditId').value = item.id;
    document.getElementById('gTitle').value = item.title;
    document.getElementById('gDate').value = item.event_date;
    document.getElementById('gDesc').value = item.description || '';
    document.getElementById('gCategory').value = item.category || 'event';
    document.getElementById('gImage').removeAttribute('required');
    document.getElementById('gImageHint').textContent = 'نئی تصاویر منتخب کریں تو موجودہ تصاویر کے ساتھ شامل ہو جائیں گی';
    const wrap = document.getElementById('gImagePreviewWrap');
    wrap.innerHTML = '';
    const img = document.createElement('img');
    img.src = item.image_url;
    img.style.cssText = 'width:80px;height:80px;object-fit:cover;border-radius:8px;border:1px solid #eee;';
    wrap.appendChild(img);
    document.getElementById('gFormTitle').textContent = 'Entry میں ترمیم کریں';
    document.getElementById('gSubmitBtn').innerHTML = '<i class="fas fa-save"></i> تبدیلی محفوظ کریں';
    document.getElementById('gCancelBtn').style.display = 'block';

    document.getElementById('dp-gallery').scrollIntoView({ behavior: 'smooth' });
  }

  function cancelGalleryEdit() {
    document.getElementById('gEditId').value = '';
    document.getElementById('gTitle').value = '';
    document.getElementById('gDate').value = '';
    document.getElementById('gDesc').value = '';
    document.getElementById('gCategory').value = 'event';
    document.getElementById('gImage').value = '';
    document.getElementById('gImage').setAttribute('required', 'required');
    document.getElementById('gImageHint').textContent = '';
    document.getElementById('gImagePreviewWrap').innerHTML = '';
    document.getElementById('gFormTitle').textContent = 'نئی Entry شامل کریں';
    document.getElementById('gSubmitBtn').innerHTML = '<i class="fas fa-plus"></i> Gallery میں شامل کریں';
    document.getElementById('gCancelBtn').style.display = 'none';
  }

  /* Handles BOTH adding a new item and saving edits to an existing one */
  async function saveGalleryItem(e) {
    e.preventDefault();
    const editId = document.getElementById('gEditId').value;
    const titleEl = document.getElementById('gTitle');
    const dateEl = document.getElementById('gDate');
    const descEl = document.getElementById('gDesc');
    const categoryEl = document.getElementById('gCategory');
    const fileEl = document.getElementById('gImage');

    const title = titleEl.value.trim();
    const event_date = dateEl.value;
    const description = descEl.value.trim();
    const category = categoryEl ? categoryEl.value : 'event';
    const files = Array.from(fileEl.files);

    if (!title || !event_date || (!editId && files.length === 0)) {
      showToast('عنوان، تاریخ، اور کم از کم ایک تصویر ضروری ہے', 'error');
      return;
    }
    for (const file of files) {
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        showToast('صرف PNG, JPG, یا WEBP تصاویر منتخب کریں', 'error');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        showToast('ہر تصویر 5MB سے چھوٹی ہونی چاہیے', 'error');
        return;
      }
    }

    // Upload every selected file, collect their public URLs
    const uploadedUrls = [];
    for (const file of files) {
      const ext = file.name.split('.').pop();
      const filePath = Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
      const { error: uploadError } = await sb.storage.from('gallery-images').upload(filePath, file);
      if (uploadError) {
        showToast('اپلوڈ ناکام: ' + uploadError.message, 'error');
        return;
      }
      const { data: publicUrlData } = sb.storage.from('gallery-images').getPublicUrl(filePath);
      uploadedUrls.push(publicUrlData.publicUrl);
    }

    let galleryId = editId;

    if (editId) {
      const payload = { title, event_date, description, category };
      if (uploadedUrls.length > 0) payload.image_url = uploadedUrls[0]; // keep cover in sync with first new photo
      const { error } = await sb.from('gallery').update(payload).eq('id', editId);
      if (error) {
        showToast('اپڈیٹ ناکام: ' + error.message, 'error');
        return;
      }
      showToast('Entry اپڈیٹ ہو گئی!');
    } else {
      const { data: userData } = await sb.auth.getUser();
      const { data: inserted, error } = await sb.from('gallery').insert({
        title, event_date, description, category,
        image_url: uploadedUrls[0],
        created_by: userData?.user?.id
      }).select('id').single();
      if (error) {
        showToast('محفوظ کرنے میں ناکامی: ' + error.message, 'error');
        return;
      }
      galleryId = inserted.id;
      showToast('Gallery میں شامل ہو گیا!');
    }

    // Insert all uploaded photos into gallery_photos (appends when editing)
    if (uploadedUrls.length > 0 && galleryId) {
      const rows = uploadedUrls.map((url, i) => ({ gallery_id: galleryId, image_url: url, sort_order: i }));
      const { error: photosError } = await sb.from('gallery_photos').insert(rows);
      if (photosError) console.error('gallery_photos insert failed:', photosError);
    }

    cancelGalleryEdit();
    loadGalleryAdmin();
    loadPublicGallery();
  }

  async function deleteGalleryItem(id) {
    const { data, error } = await sb.from('gallery').delete().eq('id', id).select('id');
    if (error) {
      showToast('حذف کرنے میں ناکامی: ' + error.message, 'error');
      return;
    }
    if (!data || data.length === 0) { showToast('حذف نہیں ہو سکا — اجازت (RLS policy) موجود نہیں یا ریکارڈ پہلے ہی موجود نہیں۔', 'error'); return; }
    showToast('حذف ہو گیا');
    loadGalleryAdmin();
    loadPublicGallery();
  }

  console.log('🎨 SHAOOR Platform — Secured & Ready!');

  /* ═══════════════════════════════════════════════════════════
     SHAOOR V6 — DYNAMIC EVENTS, BLOG, SOCIETY MGMT, MEM STATUS
  ═══════════════════════════════════════════════════════════ */

  /* ── PUBLIC EVENTS — Supabase ── */
  let allEventsCache = [];

  window.loadPublicEvents = async function() {
    const tbody = document.getElementById('eventsTableBody');
    if (!tbody) return;
    if (!sb) {
      tbody.innerHTML = '<div class="events-state">سرور سے رابطہ نہیں ہو سکا۔</div>';
      return;
    }

    tbody.innerHTML = '<div class="events-state"><i class="fas fa-spinner fa-spin" style="font-size:1.3rem;display:block;margin-bottom:.5rem;"></i>Events لوڈ ہو رہے ہیں…</div>';

    let data, error;
    try {
      const res = await sb
        .from('events')
        .select('id, title, society, chapter, format, event_date, venue, status, register_url, description, image_url')
        .order('event_date', { ascending: true });
      data = res.data;
      error = res.error;
    } catch(e) {
      error = { message: e.message };
    }

    if (error) {
      const msg = error?.message || JSON.stringify(error);
      console.error('Events load failed:', msg);
      tbody.innerHTML = `
        <div class="events-state">
          <div style="color:var(--muted);font-size:.88rem;margin-bottom:.75rem;">Events لوڈ نہیں ہو سکے: ${sanitize(msg)}</div>
          <button onclick="loadPublicEvents()" class="btn btn-outline" style="font-size:.82rem;">
            <i class="fas fa-redo"></i> دوبارہ کوشش کریں
          </button>
        </div>`;
      return;
    }

    if (!data || data.length === 0) {
      allEventsCache = [];
      document.getElementById('eventsEmptyState').style.display = 'block';
      tbody.innerHTML = '';
      return;
    }

    document.getElementById('eventsEmptyState').style.display = 'none';
    allEventsCache = data;
    renderEventsTable(data);
  };

  function usablePublicImage(url) {
    if (typeof isSafeHttpUrl !== 'function' || !isSafeHttpUrl(url)) return '';
    try {
      const path = new URL(url).pathname.replace(/\/+$/, '');
      if (/\/object\/public\/[^/]+$/.test(path)) return '';
      return url;
    } catch (e) { return ''; }
  }

  function renderEventsTable(events) {
    const tbody = document.getElementById('eventsTableBody');
    const empty = document.getElementById('eventsEmptyState');
    if (!tbody) return;

    if (!events || events.length === 0) {
      tbody.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    const statusMap = {
      'upcoming':  { label: 'Upcoming',  cls: 'badge-blue' },
      'open':      { label: 'Open Now',  cls: 'badge-green' },
      'planned':   { label: 'Planned',   cls: 'badge-yellow' },
      'completed': { label: 'Completed', cls: 'badge-gray' },
      'cancelled': { label: 'Cancelled', cls: 'badge-red' },
    };
    const formatIcon = {
      'online':    '<i class="fas fa-wifi"></i>',
      'in-person': '<i class="fas fa-map-marker-alt"></i>',
      'hybrid':    '<i class="fas fa-layer-group"></i>',
      'virtual':   '<i class="fas fa-video"></i>',
      'submission':'<i class="fas fa-paper-plane"></i>',
    };

    tbody.innerHTML = events.map(ev => {
      const st = statusMap[ev.status] || { label: ev.status || '—', cls: 'badge-blue' };
      const icon = formatIcon[(ev.format || '').toLowerCase()] || '<i class="fas fa-calendar"></i>';
      const dateStr = ev.event_date ? new Date(ev.event_date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
      const safeReg = (typeof isSafeHttpUrl === 'function' && isSafeHttpUrl(ev.register_url)) ? ev.register_url : '';
      const actionBtn = safeReg
        ? `<a href="${sanitize(safeReg)}" target="_blank" rel="noopener noreferrer" class="btn btn-gold" style="padding:.4rem .9rem;font-size:.78rem;"><i class="fas fa-external-link-alt"></i> Register</a>`
        : `<span class="ev-action-idle">Registration not open</span>`;
      const imgUrl = usablePublicImage(ev.image_url);
      const imgCell = imgUrl
        ? `<img src="${sanitize(imgUrl)}" alt="${sanitize(ev.title || '')}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ev-card-media-fallback',innerHTML:'<i class=\'fas fa-image\'></i>'}))" />`
        : `<i class="fas fa-image"></i>`;
      const place = [ev.society, ev.chapter].filter(Boolean).join(' · ') || 'SHAOOR';
      const venue = ev.venue || ((ev.format || '').toLowerCase() === 'online' ? 'Online' : '');
      return `
        <article class="ev-card reveal" data-status="${sanitize((ev.status||'').toLowerCase())}">
          <div class="ev-card-media">${imgCell}</div>
          <div class="ev-card-body">
            <div class="ev-card-meta">
              <span class="badge ${st.cls}">${sanitize(st.label)}</span>
              <span class="ev-chip">${icon} ${sanitize(ev.format || '—')}</span>
            </div>
            <h3 class="ev-card-title">${sanitize(ev.title || '—')}</h3>
            <div class="ev-card-date">${dateStr}</div>
            ${ev.description ? `<p class="ev-card-desc">${sanitize(ev.description)}</p>` : ''}
            <div class="ev-card-meta">
              <span class="ev-chip"><i class="fas fa-map-pin"></i> ${sanitize(place)}</span>
              ${venue ? `<span class="ev-chip"><i class="fas fa-map-marker-alt"></i> ${sanitize(venue)}</span>` : ''}
            </div>
            <div class="ev-card-foot">${actionBtn}</div>
          </div>
        </article>`;
    }).join('');
    if (typeof initReveal === 'function') initReveal();
  }

  window.filterEvents = function(filter, btn) {
    // Update active tab
    document.querySelectorAll('#evFilterBar .dtab').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const filtered = filter === 'all'
      ? allEventsCache
      : allEventsCache.filter(ev => (ev.status || '').toLowerCase() === filter);
    renderEventsTable(filtered);
  };

  // Auto-load on page ready
  loadPublicEvents();

  /* ── PUBLIC SOCIETIES SHOWCASE — render live from `societies` table ── */
  window.loadPublicSocieties = async function() {
    const grid = document.getElementById('socGrid');
    if (!grid || !sb) return;
    try {
      const { data: socs, error } = await sb
        .from('societies')
        .select('name, description, status, logo_url')
        .order('name');

      if (error) { console.error('Public societies load error:', error); return; }

      if (!socs || socs.length === 0) {
        grid.innerHTML = '<p class="chapter-empty" style="grid-column:1/-1;text-align:center;">فی الحال کوئی Society شامل نہیں۔</p>';
        return;
      }

      grid.innerHTML = socs.map(s => {
        const isComingSoon = (s.status || '').toLowerCase() === 'archived';
        const hasDesc = !!(s.description && String(s.description).trim());
        const desc = hasDesc
          ? sanitize(s.description)
          : 'Profile coming soon';
        const footer = isComingSoon
          ? `<span class="soc-coming"><i class="fas fa-clock"></i> Launching Soon</span>`
          : `<a href="#contact" class="soc-link">Explore <i class="fas fa-arrow-right"></i></a>`;
        const logo = usablePublicImage(s.logo_url);
        const thumbSafe = logo
          ? `<div class="soc-thumb"><img src="${sanitize(logo)}" alt="${sanitize(s.name)}" loading="lazy" /></div>`
          : `<div class="soc-thumb-placeholder"><i class="fas fa-palette" style="font-size:2.5rem;color:rgba(201,151,43,.35);"></i></div>`;

        return `
        <div class="soc-card reveal" ${isComingSoon ? 'style="opacity:.7;"' : ''}>
          ${thumbSafe}
          <div class="soc-body">
            <h3 class="soc-name">${sanitize(s.name)}</h3>
            <p class="soc-desc${hasDesc ? '' : ' soc-desc-empty'}">${desc}</p>
            ${footer}
          </div>
        </div>`;
      }).join('');
      if (typeof initReveal === 'function') initReveal();
    } catch (e) {
      console.error('loadPublicSocieties error:', e);
    }
  };
  loadPublicSocieties();

  /* ── PUBLIC CHAPTERS — inject live Societies into each chapter panel ── */
  window.loadChapterSocieties = async function() {
    if (!sb) return;
    try {
      const { data: chaps, error: chErr } = await sb.from('chapters').select('id, province');
      if (chErr || !chaps) return;

      // FIXED (Bug 1): read from the chapter_societies JUNCTION table (joined to societies),
      // matching exactly what the admin "Manage" modal writes to (addSocietyToChapter()).
      // Previously this queried societies.chapter_id directly, which the admin modal never sets.
      const { data: links, error: lErr } = await sb
        .from('chapter_societies')
        .select('chapter_id, status, societies(name)')
        .eq('status', 'active');
      if (lErr || !links) return;

      // province -> chapter id map
      const provinceToChapterId = {};
      chaps.forEach(c => { if (c.province) provinceToChapterId[c.province] = c.id; });

      document.querySelectorAll('.chapter-panel[data-chapter-province]').forEach(panel => {
        const province = panel.getAttribute('data-chapter-province');
        const chapterId = provinceToChapterId[province];
        if (!chapterId) return;

        const liveLinks = links.filter(l => l.chapter_id === chapterId && l.societies);
        if (liveLinks.length === 0) return;

        let container = panel.querySelector('.societies-in-chapter');
        if (!container) return;

        const liveHtml = liveLinks.map(l => `
          <div class="sic-card">
            <div class="sic-icon">✨</div>
            <div class="sic-name">${sanitize(l.societies.name)}</div>
            <div class="sic-seats">فعال</div>
          </div>`).join('');

        container.insertAdjacentHTML('beforeend', liveHtml);
      });
    } catch (e) {
      console.error('loadChapterSocieties error:', e);
    }
  };
  /* Disabled auto-run: loadPublicChaptersData already fills .societies-in-chapter.
     A second injector was appending duplicate society cards. */


  /* ── PUBLIC BLOG — Supabase ── */
  window.loadPublicBlog = async function() {
    const grid = document.getElementById('blogGrid');
    if (!grid) return;
    if (!sb) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:2rem;">سرور سے رابطہ نہیں ہو سکا۔</p>';
      return;
    }

    let data, error;
    try {
      const res = await sb
        .from('blog_posts')
        .select('id, title, excerpt, category, image_url, published_at, slug, author_id, content')
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(24);
      data = res.data;
      error = res.error;
    } catch(e) { error = { message: e.message }; }

    if (error) {
      const msg = error?.message || JSON.stringify(error);
      console.warn('Blog load failed:', msg);
      grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--ruby);padding:2rem;font-size:.88rem;">Blog لوڈ نہیں ہو سکا: ${sanitize(msg)}</p>`;
      return;
    }

    if (!data || data.length === 0) {
      grid.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:2rem;font-size:.88rem;">ابھی کوئی article شائع نہیں ہوا۔</p>';
      return;
    }

    const catSel = document.getElementById('blogPublicCategory');
    if (catSel && !catSel.dataset.filled) {
      const cats = Array.from(new Set(data.map(function (p) { return p.category; }).filter(Boolean)));
      cats.forEach(function (c) { const o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o); });
      catSel.dataset.filled = '1';
    }
    const q = ((document.getElementById('blogPublicSearch') || {}).value || '').toLowerCase();
    const catF = (document.getElementById('blogPublicCategory') || {}).value || '';
    let list = data.filter(function (post) {
      if (catF && post.category !== catF) return false;
      if (q && !(String(post.title||'')+' '+String(post.excerpt||'')+' '+String(post.category||'')).toLowerCase().includes(q)) return false;
      return true;
    });

    const featuredWrap = document.getElementById('blogFeaturedWrap');
    if (featuredWrap) {
      const feat = list[0];
      if (feat && !q && !catF) {
        const parsed = blogParseContent(feat.content);
        const mins = blogReadingMins(feat, parsed);
        const dateStr = feat.published_at ? new Date(feat.published_at).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : '';
        const thumb = feat.image_url ? `<img src="${sanitize(feat.image_url)}" alt="${sanitize(feat.title)}" style="width:100%;height:220px;object-fit:cover;border-radius:12px;" />` : '';
        featuredWrap.innerHTML = `<article class="blog-card reveal" style="margin-bottom:1.5rem;cursor:pointer;" onclick="openPublicArticle('${sanitize(feat.slug||'')}')">${thumb}<div class="blog-body"><p class="blog-cat">${sanitize(feat.category||'Update')}</p><h3 class="blog-title" style="font-size:1.25rem;">${sanitize(feat.title)}</h3><p class="blog-excerpt">${sanitize(feat.excerpt||'')}</p><div class="blog-meta">${dateStr?`<span>${dateStr}</span>`:''}<span>${mins} min read</span></div></div></article>`;
        list = list.slice(1, 7);
      } else {
        featuredWrap.innerHTML = '';
        list = list.slice(0, 6);
      }
    } else {
      list = list.slice(0, 6);
    }

    grid.innerHTML = list.map(post => {
      const parsed = blogParseContent(post.content);
      const mins = blogReadingMins(post, parsed);
      const dateStr = post.published_at ? new Date(post.published_at).toLocaleDateString('en-GB', { day:'numeric', month:'long', year:'numeric' }) : '';
      const thumb = post.image_url
        ? `<img src="${sanitize(post.image_url)}" alt="${sanitize(post.title)}" style="width:100%;height:100%;object-fit:cover;" loading="lazy">`
        : `<i class="fas fa-newspaper" style="font-size:2rem;color:rgba(255,255,255,.35);"></i>`;
      return `
        <article class="blog-card reveal" style="cursor:pointer;" onclick="openPublicArticle('${sanitize(post.slug||'')}')">
          <div class="blog-thumb">${thumb}</div>
          <div class="blog-body">
            <p class="blog-cat">${sanitize(post.category || 'Update')}</p>
            <h3 class="blog-title">${sanitize(post.title)}</h3>
            <p class="blog-excerpt">${sanitize(post.excerpt || '')}</p>
            <div class="blog-meta">${dateStr ? `<span><i class="far fa-calendar-alt"></i> ${dateStr}</span>` : ''}<span>${mins} min read</span></div>
          </div>
        </article>`;
    }).join('');
    initReveal();
  };


  window.setContactSubject = function(subject) {
    var sel = document.getElementById('cSubject');
    if (sel) {
      var found = false;
      for (var i = 0; i < sel.options.length; i++) {
        if (sel.options[i].value === subject || sel.options[i].text === subject) { sel.selectedIndex = i; found = true; break; }
      }
      if (!found) {
        var opt = document.createElement('option');
        opt.value = subject; opt.textContent = subject; sel.appendChild(opt); sel.value = subject;
      }
    }
  };

  window.loadPublicFaq = async function() {
    const list = document.getElementById('faqList');
    if (!list) return;
    if (!sb) {
      list.innerHTML = '<div class="faq-empty">سرور سے رابطہ نہیں ہو سکا۔</div>';
      return;
    }
    try {
      const { data, error } = await sb.from('faq').select('question, answer').order('created_at', { ascending: true });
      if (error) {
        list.innerHTML = '<div class="faq-empty">سوالات لوڈ نہیں ہو سکے۔ <a href="#contact">Contact</a> استعمال کریں۔</div>';
        return;
      }
      if (!data || data.length === 0) {
        list.innerHTML = '<div class="faq-empty">ابھی کوئی سوال شائع نہیں ہوا۔</div>';
        return;
      }
      list.innerHTML = data.map(function (row) {
        return '<details class="faq-item"><summary>' + sanitize(row.question || '') + '</summary><div class="faq-a">' + sanitize(row.answer || '') + '</div></details>';
      }).join('');
    } catch (e) {
      list.innerHTML = '<div class="faq-empty">سوالات لوڈ نہیں ہو سکے۔</div>';
    }
  };
  loadPublicFaq();

  loadPublicBlog();

  (function blogArticleRoute() {
    try {
      const params = new URLSearchParams(window.location.search);
      const slug = params.get('article');
      if (slug) openPublicArticle(slug, { skipUrl: true });
    } catch (e) {}
  })();


  /* ── CHATBOT: answers ONLY from the real Supabase 'faq' table ── */
  function toggleChat(force) {
    const win = document.getElementById('chatWin');
    if (!win) return;
    const shouldOpen = typeof force === 'boolean' ? force : !win.classList.contains('open');
    win.classList.toggle('open', shouldOpen);
    if (shouldOpen) {
      const field = document.getElementById('chatField');
      if (field) field.focus();
    }
  }
  window.toggleChat = toggleChat;

  function appendChatMsg(text, who) {
    const msgs = document.getElementById('chatMsgs');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = 'msg ' + (who === 'user' ? 'msg-usr' : 'msg-bot');
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function sendChatMessage() {
    const field = document.getElementById('chatField');
    if (!field) return;
    const question = field.value.trim();
    if (!question) return;
    field.value = '';
    appendChatMsg(question, 'user');

    if (!sb) {
      appendChatMsg('سرور سے رابطہ نہیں ہو سکا۔ براہ کرم WhatsApp پر رابطہ کریں۔', 'bot');
      return;
    }

    appendChatMsg('...', 'bot');
    const msgs = document.getElementById('chatMsgs');
    const loadingEl = msgs ? msgs.lastElementChild : null;

    try {
      // Match the question against real FAQ entries only — never invent an answer.
      const { data, error } = await sb
        .from('faq')
        .select('question, answer')
        .textSearch('question', question.split(/\s+/).filter(Boolean).join(' | '), { type: 'websearch', config: 'english' })
        .limit(1);

      if (loadingEl) loadingEl.remove();

      if (error) {
        console.warn('FAQ lookup failed:', error.message || error);
        appendChatMsg('معذرت، اس وقت جواب نہیں لایا جا سکا۔ WhatsApp پر رابطہ کریں۔', 'bot');
        return;
      }

      if (data && data.length > 0 && data[0].answer) {
        appendChatMsg(data[0].answer, 'bot');
      } else {
        appendChatMsg('معذرت، اس سوال کا verified جواب ابھی موجود نہیں۔ براہ کرم WhatsApp پر ہم سے رابطہ کریں۔', 'bot');
      }
    } catch (e) {
      if (loadingEl) loadingEl.remove();
      console.warn('FAQ lookup error:', e.message || e);
      appendChatMsg('معذرت، اس وقت جواب نہیں لایا جا سکا۔ WhatsApp پر رابطہ کریں۔', 'bot');
    }
  }
  window.sendChatMessage = sendChatMessage;


  /* ── MEMBERSHIP STATUS in Member Dashboard ──
     NOTE: this wrapper used to be dead code — it captured window.openMemberDashboard
     before that global existed, so it never ran and the three membership boxes stayed
     empty. The population logic now lives inside openMemberDashboard() itself
     (loadMembershipPanel). The wrapper is kept only so any external/inline caller of
     window.openMemberDashboard still behaves, and is harmless/idempotent. */
  const _origOpenMemberDash = window.openMemberDashboard;
  window.openMemberDashboard = async function(userId) {
    // Call original
    if (typeof _origOpenMemberDash === 'function') {
      await _origOpenMemberDash(userId);
    }
    // Now load extra: membership status + society
    try {
      const { data: appData } = await sb
        .from('profiles')
        .select('membership_type, society_id, chapter_id, status, created_at')
        .eq('id', userId)
        .single();

      let societyName = '', chapterName = '';
      if (appData && appData.society_id) {
        const { data: soc } = await sb.from('societies').select('name').eq('id', appData.society_id).single();
        societyName = soc ? soc.name : '';
      }
      if (appData && appData.chapter_id) {
        const { data: chap } = await sb.from('chapters').select('name').eq('id', appData.chapter_id).single();
        chapterName = chap ? chap.name : '';
      }

      if (appData) {
        const statusEl = document.getElementById('mdMembershipStatus');
        const tierEl   = document.getElementById('mdMembershipTier');
        const socEl    = document.getElementById('mdMemberSociety');
        if (statusEl) statusEl.textContent = appData.status || '—';
        if (tierEl)   tierEl.textContent   = appData.membership_type || '—';
        if (socEl)    socEl.textContent    = (societyName || '') + (chapterName ? ' · ' + chapterName : '') || '—';

        // Status badge color
        if (statusEl) {
          const st = (appData.status || '').toLowerCase();
          statusEl.className = '';
          if (st === 'active' || st === 'approved') {
            statusEl.style.cssText = 'color:#2d8a70;background:rgba(45,138,112,.10);padding:.2rem .6rem;border-radius:999px;font-weight:700;font-size:.82rem;';
          } else if (st === 'pending') {
            statusEl.style.cssText = 'color:#9B6800;background:rgba(155,104,0,.10);padding:.2rem .6rem;border-radius:999px;font-weight:700;font-size:.82rem;';
          } else {
            statusEl.style.cssText = 'color:var(--muted);font-size:.88rem;';
          }
        }
      }
    } catch(e) {
      console.warn('Membership status load failed:', e.message);
    }
  };


  /* ═══════════════════════════════════════════ END V6 ADDITIONS ═══ */
