/* LMS CATALOG LOGIC — Phase 2. Reuses the existing `sb` Supabase client. */
    let lmsAllCourses = [];
    let lmsCurrentFilter = 'all';
    let lmsCatalogLoaded = false;

    async function loadCourseCatalog() {
      try {
        var result = await sb
          .from('courses')
          .select('id, slug, title, description, category, level, duration_label, is_paid, price, currency, thumbnail_url, certificate_available, course_code, status')
          .eq('status', 'published')
          .order('created_at', { ascending: false });

        if (result.error) {
          console.error('SHAOOR LMS: failed to load courses', result.error);
          return;
        }
        lmsAllCourses = result.data || [];
        lmsCatalogLoaded = true;
        renderCourseCatalog();
        // Phase 2 rework: honest empty-state hint on the homepage pathway section too.
        var homeNote = document.getElementById('lmsHomeEmptyNote');
        var homePathways = document.getElementById('lmsHomePathways');
        if (homeNote) { homeNote.style.display = lmsAllCourses.length ? 'none' : 'block'; }
        if (homePathways) { homePathways.style.opacity = lmsAllCourses.length ? '1' : '.5'; }
      } catch (e) {
        console.error('SHAOOR LMS: unexpected error loading courses', e);
      }
    }

    function renderCourseCatalog() {
      var grid = document.getElementById('lmsGrid');
      var empty = document.getElementById('lmsEmpty');
      if (!grid) return;

      var filtered = lmsAllCourses.filter(function (c) {
        if (lmsCurrentFilter === 'all') return true;
        if (lmsCurrentFilter === 'free') return !c.is_paid;
        if (lmsCurrentFilter === 'paid') return !!c.is_paid;
        return c.level === lmsCurrentFilter;
      });

      grid.innerHTML = '';
      if (!filtered.length) {
        empty.style.display = 'block';
        return;
      }
      empty.style.display = 'none';

      filtered.forEach(function (course) {
        var card = document.createElement('div');
        card.className = 'lms-card';

        var priceBadge = course.is_paid
          ? '<span class="lms-badge lms-badge-paid">' + (course.currency || 'PKR') + ' ' + (course.price || 0) + '</span>'
          : '<span class="lms-badge lms-badge-free">FREE</span>';

        var certBadge = course.certificate_available
          ? '<span class="lms-badge" style="background:#eef1f7;color:#3a4a6b;">Certificate</span>'
          : '';

        // Phase 3A: short description on the card — reuses the existing single
        // `description` column (lead paragraph before the first blank line, the
        // same "short + full" convention the admin form already writes), sanitized
        // like every other user-entered field rendered elsewhere in this file.
        var shortDesc = (course.description || '').split('\n\n')[0];

        card.innerHTML =
          '<div class="lms-card-thumb">' +
            (course.thumbnail_url
              ? '<img src="' + sanitize(course.thumbnail_url) + '" alt="' + sanitize(course.title || '') + '" loading="lazy">'
              : '<i class="fas fa-palette"></i>') +
          '</div>' +
          '<div class="lms-card-body">' +
            '<div class="lms-card-title">' + sanitize(course.title || 'Untitled Course') + '</div>' +
            (shortDesc ? '<p class="lms-card-desc">' + sanitize(shortDesc) + '</p>' : '') +
            '<div class="lms-card-meta">' +
              priceBadge + certBadge +
              (course.level ? '<span class="lms-badge" style="background:#f2f2f2;">' + sanitize(course.level) + '</span>' : '') +
              (course.duration_label ? '<span>' + sanitize(course.duration_label) + '</span>' : '') +
            '</div>' +
            '<a href="#course/' + encodeURIComponent(course.slug) + '" class="lms-card-cta" onclick="showCourseDetail(\'' + course.slug.replace(/'/g, "\\'") + '\');return false;">VIEW COURSE</a>' +
          '</div>';
        grid.appendChild(card);
      });
    }

    document.addEventListener('DOMContentLoaded', function () {
      var filterBar = document.getElementById('lmsFilters');
      if (filterBar) {
        filterBar.addEventListener('click', function (e) {
          var btn = e.target.closest('.lms-filter-btn');
          if (!btn) return;
          filterBar.querySelectorAll('.lms-filter-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          lmsCurrentFilter = btn.dataset.filter;
          renderCourseCatalog();
        });
      }
      // Load once the page is ready; sb is initialized elsewhere in this file.
      setTimeout(function () {
        if (!lmsCatalogLoaded && typeof sb !== 'undefined' && sb) {
          loadCourseCatalog();
        }
      }, 300);
    });
