/* ── Load Societies for Admin Panel ── */
  async function loadSocietiesAdmin() {
    const tbody = document.getElementById('societiesBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">Societies لوڈ ہو رہے ہیں…</td></tr>';

    try {
      const { data: societies, error } = await sb
        .from('societies')
        .select('*')
        .order('name');

      if (error) {
        console.error('Societies load error:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ruby);padding:1.5rem;">خرابی: ' + sanitize(error.message) + '</td></tr>';
        return;
      }

      if (!societies || societies.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">کوئی Society نہیں۔</td></tr>';
        return;
      }

      // Fetch President/General Secretary from cabinet_members
      const societyIds = societies.map(s => s.id);
      let cabByS = {};
      if (societyIds.length > 0) {
        const { data: cabRows } = await sb.from('cabinet_members').select('society_id, position, member_id').in('society_id', societyIds);
        (cabRows || []).forEach(c => {
          if (!cabByS[c.society_id]) cabByS[c.society_id] = {};
          cabByS[c.society_id][c.position] = c.member_id;
        });
      }
      const cabMemberIds = [...new Set(Object.values(cabByS).flatMap(o => Object.values(o)).filter(Boolean))];
      let nameMap = {};
      if (cabMemberIds.length > 0) {
        const { data: profs } = await sb.from('profiles').select('id, full_name').in('id', cabMemberIds);
        (profs || []).forEach(p => { nameMap[p.id] = p.full_name; });
      }

      // Chapter names
      const chapterIds = [...new Set(societies.map(s => s.chapter_id).filter(Boolean))];
      let chapterNameMap = {};
      if (chapterIds.length > 0) {
        const { data: chaps } = await sb.from('chapters').select('id, name').in('id', chapterIds);
        (chaps || []).forEach(c => { chapterNameMap[c.id] = c.name; });
      }

      // Count members in each society.
      // FIX: this used to query the society_members junction table, which is never
      // written to anywhere in the app — a real member's society is recorded directly
      // on profiles.society_id (set at signup/approval/edit). That mismatch made the
      // count always show 0 even for societies with real members. Counting from
      // profiles.society_id — the column actually used everywhere else in the admin
      // panel — is the minimal correct fix; no schema change.
      let countMap = {};
      if (societies.length > 0) {
        const { data: members } = await sb.from('profiles').select('society_id').not('society_id', 'is', null);
        (members || []).forEach(m => {
          countMap[m.society_id] = (countMap[m.society_id] || 0) + 1;
        });
      }

      tbody.innerHTML = societies.map(s => {
        const cab = cabByS[s.id] || {};
        const presName = cab.president ? (nameMap[cab.president] || 'Unknown') : '—';
        const secName = cab.general_secretary ? (nameMap[cab.general_secretary] || 'Unknown') : '—';
        const chapterName = s.chapter_id ? (chapterNameMap[s.chapter_id] || '—') : '—';
        const memberCount = countMap[s.id] || 0;
        const statusBg = s.status === 'active' ? 'var(--teal)' : '#9ca3af';
        const statusLabel = s.status === 'active' ? 'فعال' : 'محفوظ شدہ';

        return `<tr>
          <td><strong>${sanitize(s.name)}</strong><br><span style="font-size:.75rem;color:var(--muted);">${sanitize(chapterName)}</span></td>
          <td>${sanitize(presName)}</td>
          <td>${sanitize(secName)}</td>
          <td>${memberCount}</td>
          <td><span class="status-pill" style="background:${statusBg};color:#fff;padding:.3rem .7rem;font-size:.75rem;border-radius:4px;">${statusLabel}</span></td>
          <td style="display:flex;gap:.4rem;flex-wrap:wrap;">
            <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--navy2);" onclick="editSociety('${s.id}')">Edit</button>
            <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--gold);color:var(--navy);" onclick="openDocumentForSociety('${s.id}')"><i class="fas fa-file-signature"></i> Document</button>
            <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--ruby);" onclick="deleteSociety('${s.id}')">حذف</button>
          </td>
        </tr>`;
      }).join('');
    } catch (err) {
      console.error('Societies error:', err);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ruby);padding:1.5rem;">خرابی لوڈ کرتے وقت</td></tr>';
    }
  }

  /* ── Load Chapters for Admin Panel ── */
  async function loadChaptersAdmin() {
    const tbody = document.getElementById('chaptersBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">Chapters لوڈ ہو رہے ہیں…</td></tr>';

    try {
      const { data: chapters, error } = await sb
        .from('chapters')
        .select('*')
        .order('province');

      if (error) {
        console.error('Chapters load error:', error);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ruby);padding:1.5rem;">خرابی: ' + sanitize(error.message) + '</td></tr>';
        return;
      }

      if (!chapters || chapters.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">کوئی Chapter نہیں۔</td></tr>';
        return;
      }

      // Fetch chapter President from cabinet_members
      const chapterIds = chapters.map(c => c.id);
      let cabByC = {};
      if (chapterIds.length > 0) {
        const { data: cabRows } = await sb.from('cabinet_members').select('chapter_id, position, member_id').eq('position', 'president').in('chapter_id', chapterIds);
        (cabRows || []).forEach(c => { cabByC[c.chapter_id] = c.member_id; });
      }
      const headMemberIds = [...new Set(Object.values(cabByC).filter(Boolean))];
      let nameMap = {};
      if (headMemberIds.length > 0) {
        const { data: profs } = await sb.from('profiles').select('id, full_name').in('id', headMemberIds);
        (profs || []).forEach(p => { nameMap[p.id] = p.full_name; });
      }

      // Count members in each chapter.
      // FIX: same root cause as the society count above — chapter_members is never
      // written to; the real relationship is profiles.chapter_id. Switched the source
      // so this count reflects real members instead of always showing 0.
      let countMap = {};
      if (chapters.length > 0) {
        const { data: members } = await sb.from('profiles').select('chapter_id').not('chapter_id', 'is', null);
        (members || []).forEach(m => {
          countMap[m.chapter_id] = (countMap[m.chapter_id] || 0) + 1;
        });
      }

      tbody.innerHTML = chapters.map(c => {
        const headMemberId = cabByC[c.id];
        const headName = headMemberId ? (nameMap[headMemberId] || 'Unknown') : '—';
        const memberCount = countMap[c.id] || 0;
        const statusBg = c.status === 'active' ? 'var(--teal)' : c.status === 'forming' ? '#fbbf24' : '#9ca3af';
        const statusLabel = c.status === 'active' ? 'فعال' : c.status === 'forming' ? 'تشکیل' : 'محفوظ';

        const logoImg = c.logo_url
          ? `<img src="${c.logo_url}" alt="" style="width:28px;height:28px;object-fit:cover;border-radius:6px;border:1px solid var(--border);vertical-align:middle;margin-inline-end:.5rem;" />`
          : `<span style="display:inline-flex;width:28px;height:28px;border-radius:6px;border:1px dashed var(--border);align-items:center;justify-content:center;color:var(--muted);font-size:.7rem;vertical-align:middle;margin-inline-end:.5rem;"><i class="fas fa-image"></i></span>`;
        return `<tr>
          <td>${logoImg}<strong>${sanitize(c.name)}</strong><br><span style="font-size:.75rem;color:var(--muted);text-transform:capitalize;">${sanitize(c.province || '—')}</span></td>
          <td>${sanitize(c.hq_city || '—')}</td>
          <td>${sanitize(headName)}</td>
          <td>${memberCount}</td>
          <td><span class="status-pill" style="background:${statusBg};color:#fff;padding:.3rem .7rem;font-size:.75rem;border-radius:4px;">${statusLabel}</span></td>
          <td style="display:flex;gap:.4rem;flex-wrap:wrap;">
            <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--gold);color:var(--navy);" onclick="openChapterManage('${c.id}', '${sanitize(c.name).replace(/'/g,"\\'")}')">Manage</button>
            <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--navy2);" onclick="editChapter('${c.id}')">Edit</button>
            <button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--ruby);" onclick="deleteChapter('${c.id}')">حذف</button>
          </td>
        </tr>`;
      }).join('');
    } catch (err) {
      console.error('Chapters error:', err);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--ruby);padding:1.5rem;">خرابی لوڈ کرتے وقت</td></tr>';
    }
  }

  /* ── Searchable member picker (name or ID) using <datalist> ── */
  const peopleMaps = {};
  async function populatePeopleDatalist(inputId, listId, currentId) {
    const dl = document.getElementById(listId);
    const inputEl = document.getElementById(inputId);
    if (!dl || !inputEl) return;
    dl.innerHTML = '';
    const { data: profs, error } = await sb.from('profiles').select('id, full_name, member_id').order('full_name');
    if (error || !profs) return;
    const map = {};
    profs.forEach(p => {
      const label = p.full_name + ' (' + p.member_id + ')';
      map[label] = p.id;
      const opt = document.createElement('option');
      opt.value = label;
      dl.appendChild(opt);
    });
    peopleMaps[inputId] = map;
    if (currentId) {
      const match = profs.find(p => p.id === currentId);
      inputEl.value = match ? (match.full_name + ' (' + match.member_id + ')') : '';
    } else {
      inputEl.value = '';
    }
  }
  function resolvePersonId(inputId) {
    const el = document.getElementById(inputId);
    if (!el) return null;
    const val = el.value.trim();
    if (!val) return null;
    const map = peopleMaps[inputId] || {};
    return map[val] || null;
  }

  /* ── Cabinet positions shared helper (Society + Chapter) ── */
  const CABINET_POSITIONS = [
    { key: 'president', field: 'President' },
    { key: 'vice_president', field: 'VicePresident' },
    { key: 'general_secretary', field: 'GeneralSecretary' },
    { key: 'treasurer', field: 'Treasurer' },
    { key: 'media_coordinator', field: 'MediaCoordinator' },
    { key: 'events_coordinator', field: 'EventsCoordinator' },
    { key: 'women_wing_head', field: 'WomenWingHead' },
    { key: 'youth_wing_head', field: 'YouthWingHead' },
    { key: 'membership_coordinator', field: 'MembershipCoordinator' },
    { key: 'public_relations_officer', field: 'PublicRelationsOfficer' }
  ];

  // prefix: 'cab' for society form, 'chCab' for chapter form
  async function populateCabinetFields(prefix, parentType, parentId) {
    let existing = [];
    if (parentId) {
      const col = parentType === 'society' ? 'society_id' : 'chapter_id';
      const { data } = await sb.from('cabinet_members').select('position, member_id').eq(col, parentId);
      existing = data || [];
    }
    for (const pos of CABINET_POSITIONS) {
      const inputId = prefix + pos.field;
      const listId = inputId + 'List';
      const match = existing.find(e => e.position === pos.key);
      await populatePeopleDatalist(inputId, listId, match ? match.member_id : null);
    }
  }

  async function saveCabinetFields(prefix, parentType, parentId) {
    const col = parentType === 'society' ? 'society_id' : 'chapter_id';
    for (const pos of CABINET_POSITIONS) {
      const inputId = prefix + pos.field;
      const memberId = resolvePersonId(inputId);
      // Remove existing row for this position first (handles both set and clear)
      await sb.from('cabinet_members').delete().eq(col, parentId).eq('position', pos.key);
      if (memberId) {
        await sb.from('cabinet_members').insert({ [col]: parentId, position: pos.key, member_id: memberId });
      }
    }
  }

  /* ── SOCIETY: create / edit ── */
  async function populateChapterDropdown(selectedId) {
    const sel = document.getElementById('societyChapter');
    if (!sel) return;
    const { data: chaps, error } = await sb.from('chapters').select('id, name').order('name');
    sel.innerHTML = '<option value="">— کوئی Chapter منتخب نہیں —</option>';
    if (!error && chaps) {
      chaps.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        sel.appendChild(opt);
      });
    }
    sel.value = selectedId || '';
  }

  let societyLogoFile = null;
  function resetSocietyLogoUI(existingUrl) {
    societyLogoFile = null;
    const input = document.getElementById('societyLogoInput');
    if (input) input.value = '';
    document.getElementById('societyLogoStatus').textContent = '';
    const img = document.getElementById('societyLogoPreview');
    const placeholder = document.getElementById('societyLogoPlaceholder');
    if (existingUrl) {
      img.src = existingUrl;
      img.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      img.src = '';
      img.style.display = 'none';
      placeholder.style.display = 'flex';
    }
  }

  async function openCreateSocietyModal() {
    document.getElementById('societyForm').reset();
    document.getElementById('societyEditId').value = '';
    document.getElementById('societyModalTitle').textContent = 'نئی Society';
    resetSocietyLogoUI(null);
    await populateCabinetFields('cab', 'society', null);
    await populateChapterDropdown();
    openModal('societyModal');
  }

  async function editSociety(id) {
    const { data: s, error } = await sb.from('societies').select('*').eq('id', id).single();
    if (error || !s) { showToast('Society نہیں ملی: ' + (error?.message || ''), 'error'); return; }
    document.getElementById('societyForm').reset();
    document.getElementById('societyEditId').value = s.id;
    document.getElementById('societyModalTitle').textContent = 'Society میں ترمیم';
    document.getElementById('societyName').value = s.name || '';
    document.getElementById('societyDescription').value = s.description || '';
    document.getElementById('societyStatus').value = s.status || 'active';
    resetSocietyLogoUI(s.logo_url || null);
    await populateCabinetFields('cab', 'society', s.id);
    await populateChapterDropdown(s.chapter_id);
    openModal('societyModal');
  }

  window.addEventListener('DOMContentLoaded', () => {
    const logoInput = document.getElementById('societyLogoInput');
    if (logoInput) {
      logoInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
          showToast('صرف PNG, JPG, یا WEBP تصویر منتخب کریں', 'error');
          logoInput.value = '';
          return;
        }
        if (file.size > 3 * 1024 * 1024) {
          showToast('تصویر 3MB سے چھوٹی ہونی چاہیے', 'error');
          logoInput.value = '';
          return;
        }
        societyLogoFile = file;
        const img = document.getElementById('societyLogoPreview');
        const placeholder = document.getElementById('societyLogoPlaceholder');
        img.src = URL.createObjectURL(file);
        img.style.display = 'block';
        placeholder.style.display = 'none';
      });
    }
  });

  async function uploadSocietyLogo(societyId) {
    if (!societyLogoFile) return;
    const statusEl = document.getElementById('societyLogoStatus');
    statusEl.textContent = 'اپلوڈ ہو رہا ہے…';

    const ext = societyLogoFile.name.split('.').pop();
    const filePath = `${societyId}/logo.${ext}`;

    const { error: uploadError } = await sb.storage
      .from('society-logos')
      .upload(filePath, societyLogoFile, { upsert: true, cacheControl: '3600' });

    if (uploadError) {
      console.error('Society logo upload failed:', uploadError);
      statusEl.textContent = '';
      showToast('لوگو اپلوڈ ناکام: ' + uploadError.message, 'error');
      return;
    }

    const { data: publicUrlData } = sb.storage.from('society-logos').getPublicUrl(filePath);
    const publicUrl = publicUrlData.publicUrl + '?t=' + Date.now();

    const { error: updateError } = await sb
      .from('societies')
      .update({ logo_url: publicUrl })
      .eq('id', societyId);

    if (updateError) {
      console.error('Society logo_url update failed:', updateError);
      statusEl.textContent = '';
      showToast('Society ریکارڈ اپڈیٹ ناکام: ' + updateError.message, 'error');
      return;
    }

    statusEl.textContent = '';
    societyLogoFile = null;
  }

  window.addEventListener('DOMContentLoaded', () => secureSubmit('societyForm', async frm => {
    const editId = frm.querySelector('#societyEditId').value;
    const name = frm.querySelector('#societyName').value.trim();
    const description = frm.querySelector('#societyDescription').value.trim();
    const chapter_id = frm.querySelector('#societyChapter').value || null;
    const status = frm.querySelector('#societyStatus').value;

    if (!name) { showToast('براہ کرم Society کا نام درج کریں', 'error'); return; }

    const payload = { name, description, chapter_id, status };
    let error, savedId = editId;
    if (editId) {
      ({ error } = await sb.from('societies').update(payload).eq('id', editId));
    } else {
      const res = await sb.from('societies').insert(payload).select('id').single();
      error = res.error;
      if (!error) savedId = res.data.id;
    }

    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }

    await uploadSocietyLogo(savedId);
    await saveCabinetFields('cab', 'society', savedId);

    showToast('✓ Society محفوظ ہو گئی!');
    closeModal('societyModal');
    loadSocietiesAdmin();
    if (typeof loadPublicSocieties === 'function') loadPublicSocieties();
  }));

  async function deleteSociety(id) {
    if (!confirm('کیا یہ Society حذف کرنا چاہتے ہیں؟')) return;
    const { data, error } = await sb.from('societies').delete().eq('id', id).select('id');
    if (error) { showToast('حذف نہیں ہو سکی: ' + error.message, 'error'); return; }
    if (!data || data.length === 0) { showToast('حذف نہیں ہو سکی — اجازت (RLS policy) موجود نہیں یا ریکارڈ پہلے ہی موجود نہیں۔', 'error'); return; }
    showToast('Society حذف کر دی گئی۔');
    loadSocietiesAdmin();
    if (typeof loadPublicSocieties === 'function') loadPublicSocieties();
  }

  /* ── CHAPTER: create / edit ── */
  let chapterLogoFile = null;
  function resetChapterLogoUI(existingUrl) {
    chapterLogoFile = null;
    const input = document.getElementById('chapterLogoInput');
    if (input) input.value = '';
    const statusEl = document.getElementById('chapterLogoStatus');
    if (statusEl) statusEl.textContent = '';
    const img = document.getElementById('chapterLogoPreview');
    const placeholder = document.getElementById('chapterLogoPlaceholder');
    if (existingUrl) {
      img.src = existingUrl;
      img.style.display = 'block';
      placeholder.style.display = 'none';
    } else {
      img.src = '';
      img.style.display = 'none';
      placeholder.style.display = 'flex';
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    const logoInput = document.getElementById('chapterLogoInput');
    if (logoInput) {
      logoInput.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
          showToast('صرف PNG, JPG, یا WEBP تصویر منتخب کریں', 'error');
          logoInput.value = '';
          return;
        }
        if (file.size > 3 * 1024 * 1024) {
          showToast('تصویر 3MB سے چھوٹی ہونی چاہیے', 'error');
          logoInput.value = '';
          return;
        }
        chapterLogoFile = file;
        const img = document.getElementById('chapterLogoPreview');
        const placeholder = document.getElementById('chapterLogoPlaceholder');
        img.src = URL.createObjectURL(file);
        img.style.display = 'block';
        placeholder.style.display = 'none';
      });
    }
  });

  async function uploadChapterLogo(chapterId) {
    if (!chapterLogoFile) return;
    const statusEl = document.getElementById('chapterLogoStatus');
    statusEl.textContent = 'اپلوڈ ہو رہا ہے…';

    const ext = chapterLogoFile.name.split('.').pop();
    // Reuses the existing 'shaoor-uploads' bucket (same one branding/events/courses
    // already use) — no new storage bucket created.
    const filePath = `chapter-logos/${chapterId}/logo.${ext}`;

    const { error: uploadError } = await sb.storage
      .from('shaoor-uploads')
      .upload(filePath, chapterLogoFile, { upsert: true, cacheControl: '3600' });

    if (uploadError) {
      console.error('Chapter logo upload failed:', uploadError);
      statusEl.textContent = '';
      showToast('لوگو اپلوڈ ناکام: ' + uploadError.message, 'error');
      return;
    }

    const { data: publicUrlData } = sb.storage.from('shaoor-uploads').getPublicUrl(filePath);
    const publicUrl = publicUrlData.publicUrl + '?t=' + Date.now();

    const { error: updateError } = await sb
      .from('chapters')
      .update({ logo_url: publicUrl })
      .eq('id', chapterId);

    if (updateError) {
      console.error('Chapter logo_url update failed:', updateError);
      statusEl.textContent = '';
      showToast('Chapter ریکارڈ اپڈیٹ ناکام: ' + updateError.message, 'error');
      return;
    }

    statusEl.textContent = '';
    chapterLogoFile = null;
  }

  async function openCreateChapterModal() {
    document.getElementById('chapterForm').reset();
    document.getElementById('chapterEditId').value = '';
    document.getElementById('chapterModalTitle').textContent = 'نیا Chapter';
    resetChapterLogoUI(null);
    await populateCabinetFields('chCab', 'chapter', null);
    openModal('chapterModal');
  }

  async function editChapter(id) {
    const { data: c, error } = await sb.from('chapters').select('*').eq('id', id).single();
    if (error || !c) { showToast('Chapter نہیں ملا: ' + (error?.message || ''), 'error'); return; }
    document.getElementById('chapterForm').reset();
    document.getElementById('chapterEditId').value = c.id;
    document.getElementById('chapterModalTitle').textContent = 'Chapter میں ترمیم';
    document.getElementById('chapterName').value = c.name || '';
    document.getElementById('chapterProvince').value = c.province || '';
    document.getElementById('chapterHqCity').value = c.hq_city || '';
    document.getElementById('chapterStatus').value = c.status || 'active';
    resetChapterLogoUI(c.logo_url || null);
    await populateCabinetFields('chCab', 'chapter', c.id);
    openModal('chapterModal');
  }

  window.addEventListener('DOMContentLoaded', () => secureSubmit('chapterForm', async frm => {
    const editId = frm.querySelector('#chapterEditId').value;
    const name = frm.querySelector('#chapterName').value.trim();
    const province = frm.querySelector('#chapterProvince').value;
    const hq_city = frm.querySelector('#chapterHqCity').value.trim() || null;
    const status = frm.querySelector('#chapterStatus').value;

    if (!name) { showToast('براہ کرم Chapter کا نام درج کریں', 'error'); return; }
    if (!province) { showToast('براہ کرم صوبہ منتخب کریں', 'error'); return; }

    const payload = { name, province, hq_city, status };
    let error, savedId = editId;
    if (editId) {
      ({ error } = await sb.from('chapters').update(payload).eq('id', editId));
    } else {
      const res = await sb.from('chapters').insert(payload).select('id').single();
      error = res.error;
      if (!error) savedId = res.data.id;
    }

    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }

    await uploadChapterLogo(savedId);
    await saveCabinetFields('chCab', 'chapter', savedId);

    showToast('✓ Chapter محفوظ ہو گیا!');
    closeModal('chapterModal');
    loadChaptersAdmin();
  }));

  async function deleteChapter(id) {
    if (!confirm('کیا یہ Chapter حذف کرنا چاہتے ہیں؟')) return;
    const { data, error } = await sb.from('chapters').delete().eq('id', id).select('id');
    if (error) { showToast('حذف نہیں ہو سکا: ' + error.message, 'error'); return; }
    if (!data || data.length === 0) { showToast('حذف نہیں ہو سکا — اجازت (RLS policy) موجود نہیں یا ریکارڈ پہلے ہی موجود نہیں۔', 'error'); return; }
    showToast('Chapter حذف کر دیا گیا۔');
    loadChaptersAdmin();
  }

  /* ── EVENT: create / edit / delete / list (Admin) ── */
  let eventSelectedImageFile = null;

  async function populateEventDropdowns() {
    const socSel = document.getElementById('eventSocietySelect');
    const chSel = document.getElementById('eventChapterSelect');
    if (!socSel || !chSel) return;

    const { data: socs } = await sb.from('societies').select('id, name').order('name');
    socSel.innerHTML = '<option value="">— تمام Societies —</option>' +
      (socs || []).map(s => `<option value="${sanitize(s.name)}">${sanitize(s.name)}</option>`).join('');

    const { data: chaps } = await sb.from('chapters').select('id, province').order('province');
    chSel.innerHTML = '<option value="">— تمام Chapters —</option>' +
      (chaps || []).map(c => `<option value="${sanitize(c.province)}">${sanitize(c.province)}</option>`).join('');
  }

  function resetEventImageUI() {
    eventSelectedImageFile = null;
    document.getElementById('eventExistingImageUrl').value = '';
    document.getElementById('eventImagePreview').style.display = 'none';
    document.getElementById('eventImagePreview').src = '';
    document.getElementById('eventImagePlaceholder').style.display = 'block';
    document.getElementById('eventImageStatus').textContent = '';
    document.getElementById('eventImageInput').value = '';
  }

  window.openCreateEventModal = async function() {
    document.getElementById('eventForm').reset();
    document.getElementById('eventEditId').value = '';
    document.getElementById('eventModalTitle').textContent = 'نیا Event';
    document.getElementById('eventFormat').value = 'in-person';
    document.getElementById('eventStatus').value = 'upcoming';
    resetEventImageUI();
    await populateEventDropdowns();
    openModal('eventModal');
  };

  window.editEvent = async function(id) {
    const { data: ev, error } = await sb.from('events').select('*').eq('id', id).single();
    if (error || !ev) { showToast('Event نہیں ملا: ' + (error?.message || ''), 'error'); return; }
    document.getElementById('eventForm').reset();
    resetEventImageUI();
    await populateEventDropdowns();
    document.getElementById('eventEditId').value = ev.id;
    document.getElementById('eventModalTitle').textContent = 'Event میں ترمیم';
    document.getElementById('eventTitle').value = ev.title || '';
    document.getElementById('eventDescription').value = ev.description || '';
    document.getElementById('eventSocietySelect').value = ev.society || '';
    document.getElementById('eventChapterSelect').value = ev.chapter || '';
    document.getElementById('eventFormat').value = ev.format || 'in-person';
    document.getElementById('eventDate').value = ev.event_date ? new Date(ev.event_date).toISOString().slice(0,10) : '';
    document.getElementById('eventVenue').value = ev.venue || '';
    document.getElementById('eventStatus').value = ev.status || 'upcoming';
    document.getElementById('eventRegisterUrl').value = ev.register_url || '';
    if (ev.image_url) {
      document.getElementById('eventExistingImageUrl').value = ev.image_url;
      document.getElementById('eventImagePreview').src = ev.image_url;
      document.getElementById('eventImagePreview').style.display = 'block';
      document.getElementById('eventImagePlaceholder').style.display = 'none';
    }
    openModal('eventModal');
  };

  window.addEventListener('DOMContentLoaded', () => {
    const imgInput = document.getElementById('eventImageInput');
    if (imgInput) {
      imgInput.addEventListener('change', () => {
        const file = imgInput.files[0];
        if (!file) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
          showToast('صرف PNG, JPG, یا WEBP تصویر منتخب کریں', 'error');
          imgInput.value = '';
          return;
        }
        if (file.size > 3 * 1024 * 1024) {
          showToast('تصویر 3MB سے چھوٹی ہونی چاہیے', 'error');
          imgInput.value = '';
          return;
        }
        eventSelectedImageFile = file;
        const reader = new FileReader();
        reader.onload = e => {
          document.getElementById('eventImagePreview').src = e.target.result;
          document.getElementById('eventImagePreview').style.display = 'block';
          document.getElementById('eventImagePlaceholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
        document.getElementById('eventImageStatus').textContent = 'نئی تصویر منتخب ہو گئی — محفوظ کرنے پر اپلوڈ ہوگی۔';
      });
    }
  });

  window.addEventListener('DOMContentLoaded', () => secureSubmit('eventForm', async frm => {
    if (!(await requireStaff())) return;
    const editId = frm.querySelector('#eventEditId').value;
    const title = frm.querySelector('#eventTitle').value.trim();
    const description = frm.querySelector('#eventDescription').value.trim() || null;
    const society = frm.querySelector('#eventSocietySelect').value.trim() || null;
    const chapter = frm.querySelector('#eventChapterSelect').value.trim() || null;
    const format = frm.querySelector('#eventFormat').value;
    const event_date = frm.querySelector('#eventDate').value || null;
    const venue = frm.querySelector('#eventVenue').value.trim() || null;
    const status = frm.querySelector('#eventStatus').value;
    const register_url = frm.querySelector('#eventRegisterUrl').value.trim() || null;

    if (!title) { showToast('براہ کرم Event کا عنوان درج کریں', 'error'); return; }
    if (!event_date) { showToast('براہ کرم تاریخ منتخب کریں', 'error'); return; }

    const statusEl = document.getElementById('eventImageStatus');
    let image_url = document.getElementById('eventExistingImageUrl').value || null;

    if (eventSelectedImageFile) {
      if (statusEl) statusEl.textContent = 'تصویر اپلوڈ ہو رہی ہے…';
      const ext = eventSelectedImageFile.name.split('.').pop();
      const filePath = 'events/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
      const { error: uploadError } = await sb.storage.from('shaoor-uploads').upload(filePath, eventSelectedImageFile);
      if (uploadError) {
        showToast('تصویر اپلوڈ ناکام: ' + uploadError.message, 'error');
        if (statusEl) statusEl.textContent = '';
        return;
      }
      const { data: publicUrlData } = sb.storage.from('shaoor-uploads').getPublicUrl(filePath);
      image_url = publicUrlData.publicUrl;
    }

    const payload = { title, description, society, chapter, format, event_date, venue, status, register_url, image_url };
    let error;
    if (editId) {
      ({ error } = await sb.from('events').update(payload).eq('id', editId));
    } else {
      ({ error } = await sb.from('events').insert(payload));
    }

    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }

    eventSelectedImageFile = null;
    showToast('✓ Event محفوظ ہو گیا!');
    closeModal('eventModal');
    loadEventsAdmin();
    if (typeof loadPublicEvents === 'function') loadPublicEvents();
  }));

  window.deleteEvent = async function(id) {
    if (!(await requireStaff())) return;
    if (!confirm('کیا یہ Event حذف کرنا چاہتے ہیں؟')) return;
    const { data, error } = await sb.from('events').delete().eq('id', id).select('id');
    if (error) { showToast('حذف نہیں ہو سکا: ' + error.message, 'error'); return; }
    if (!data || data.length === 0) { showToast('حذف نہیں ہو سکا — اجازت (RLS policy) موجود نہیں یا ریکارڈ پہلے ہی موجود نہیں۔', 'error'); return; }
    showToast('Event حذف کر دیا گیا۔');
    loadEventsAdmin();
    if (typeof loadPublicEvents === 'function') loadPublicEvents();
  };

  window.loadEventsAdmin = async function() {
    const tbody = document.getElementById('eventsAdminBody');
    if (!tbody || !sb) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.5rem;"><i class="fas fa-spinner fa-spin"></i> لوڈ ہو رہا ہے…</td></tr>';

    let data, error;
    try {
      const res = await sb.from('events').select('id, title, society, chapter, event_date, status').order('event_date', { ascending: true });
      data = res.data; error = res.error;
    } catch(e) { error = { message: e.message }; }

    if (error) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--ruby);padding:1.5rem;">لوڈ ناکام: ${sanitize(error.message)}</td></tr>`;
      return;
    }
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.5rem;">کوئی Event نہیں ملا۔</td></tr>';
      return;
    }

    const statusLabel = {
      upcoming: 'Upcoming', open: 'Open', planned: 'Planned',
      completed: 'Completed', cancelled: 'Cancelled'
    };
    const statusClass = {
      upcoming: 'sp-listed', open: 'sp-active', planned: 'sp-pending',
      completed: 'sp-listed', cancelled: 'sp-pending'
    };

    tbody.innerHTML = data.map(ev => {
      const dateStr = ev.event_date ? new Date(ev.event_date).toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }) : '—';
      const st = (ev.status || 'upcoming');
      return `
        <tr>
          <td style="font-weight:600;">${sanitize(ev.title || '—')}</td>
          <td>${sanitize(ev.society || ev.chapter || '—')}</td>
          <td>${dateStr}</td>
          <td><span class="status-pill ${statusClass[st] || 'sp-listed'}">${statusLabel[st] || st}</span></td>
          <td>
            <button onclick="viewEventAttendance('${ev.id}', '${(ev.title||'').replace(/'/g,"\\'")}')" class="btn btn-outline" style="font-size:.75rem;padding:.3rem .7rem;margin-inline-end:.4rem;"><i class="fas fa-clipboard-check"></i> Attendance</button>
            <button onclick="openDocumentForEvent('${ev.id}')" class="btn btn-outline" style="font-size:.75rem;padding:.3rem .7rem;margin-inline-end:.4rem;"><i class="fas fa-file-signature"></i> Invitation</button>
            <button onclick="editEvent('${ev.id}')" class="btn btn-outline" style="font-size:.75rem;padding:.3rem .7rem;margin-inline-end:.4rem;">Edit</button>
            <button onclick="deleteEvent('${ev.id}')" class="btn btn-outline" style="font-size:.75rem;padding:.3rem .7rem;color:var(--ruby);border-color:var(--ruby);">Delete</button>
          </td>
        </tr>`;
    }).join('');
  };

  /* ── Learning Academy: Admin Course CRUD (Phase 11) ── */
  let courseSelectedThumbFile = null;

  function resetCourseThumbUI() {
    courseSelectedThumbFile = null;
    document.getElementById('courseExistingThumbUrl').value = '';
    document.getElementById('courseThumbPreview').style.display = 'none';
    document.getElementById('courseThumbPreview').src = '';
    document.getElementById('courseThumbPlaceholder').style.display = 'block';
    document.getElementById('courseThumbStatus').textContent = '';
    document.getElementById('courseThumbInput').value = '';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const thumbInput = document.getElementById('courseThumbInput');
    if (thumbInput) {
      thumbInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) {
          showToast('تصویر 3MB سے کم ہونی چاہیے', 'error');
          thumbInput.value = '';
          return;
        }
        courseSelectedThumbFile = file;
        const reader = new FileReader();
        reader.onload = (ev) => {
          document.getElementById('courseThumbPreview').src = ev.target.result;
          document.getElementById('courseThumbPreview').style.display = 'block';
          document.getElementById('courseThumbPlaceholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
      });
    }
  });

  function slugifyCourseTitle(title) {
    return (title || '').toString().trim().toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  window.openCreateCourseModal = function() {
    document.getElementById('courseForm').reset();
    document.getElementById('courseEditId').value = '';
    document.getElementById('courseModalTitle').textContent = 'نیا Course';
    document.getElementById('coursePriceGroup').style.display = 'none';
    resetCourseThumbUI();
    openModal('courseModal');
  };

  window.editCourse = async function(id) {
    const { data: c, error } = await sb.from('courses').select('*').eq('id', id).single();
    if (error || !c) { showToast('Course نہیں ملا: ' + (error?.message || ''), 'error'); return; }
    document.getElementById('courseForm').reset();
    resetCourseThumbUI();
    document.getElementById('courseEditId').value = c.id;
    document.getElementById('courseModalTitle').textContent = 'Course میں ترمیم';
    document.getElementById('courseTitle').value = c.title || '';
    document.getElementById('courseSlug').value = c.slug || '';
    document.getElementById('courseShortDesc').value = c.description || '';
    document.getElementById('courseFullDesc').value = '';
    document.getElementById('courseCategory').value = c.category || 'Creative Arts';
    document.getElementById('courseLevel').value = c.level || 'beginner';
    document.getElementById('courseIsPaid').value = c.is_paid ? 'true' : 'false';
    document.getElementById('coursePriceGroup').style.display = c.is_paid ? 'block' : 'none';
    document.getElementById('coursePrice').value = c.price || '';
    document.getElementById('courseCurrency').value = c.currency || 'PKR';
    document.getElementById('courseDuration').value = c.duration_label || '';
    document.getElementById('courseCode').value = c.course_code || '';
    document.getElementById('courseCertificateAvailable').value = c.certificate_available ? 'true' : 'false';
    document.getElementById('courseWhatsappLink').value = c.whatsapp_group_link || '';
    document.getElementById('courseSeoTitle').value = c.seo_title || '';
    document.getElementById('courseSeoDescription').value = c.seo_description || '';
    document.getElementById('courseSeoOgImage').value = c.seo_og_image || '';
    document.getElementById('courseStatus').value = c.status || 'draft';
    if (c.thumbnail_url) {
      document.getElementById('courseExistingThumbUrl').value = c.thumbnail_url;
      document.getElementById('courseThumbPreview').src = c.thumbnail_url;
      document.getElementById('courseThumbPreview').style.display = 'block';
      document.getElementById('courseThumbPlaceholder').style.display = 'none';
    }
    openModal('courseModal');
  };

  window.deleteCourse = async function(id) {
    if (!(await requireStaff())) return;
    if (!confirm('کیا یہ Course حذف کرنا چاہتے ہیں؟')) return;
    const { data, error } = await sb.from('courses').delete().eq('id', id).select('id');
    if (error) { showToast('حذف نہیں ہو سکا: ' + error.message, 'error'); return; }
    if (!data || data.length === 0) { showToast('حذف نہیں ہو سکا — اجازت (RLS policy) موجود نہیں یا ریکارڈ پہلے ہی موجود نہیں۔', 'error'); return; }
    showToast('Course حذف کر دیا گیا۔');
    loadCoursesAdmin();
    if (typeof loadCourseCatalog === 'function') { lmsCatalogLoaded = false; loadCourseCatalog(); }
  };

  window.loadCoursesAdmin = async function() {
    const tbody = document.getElementById('coursesAdminBody');
    if (!tbody || !sb) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;"><i class="fas fa-spinner fa-spin"></i> لوڈ ہو رہا ہے…</td></tr>';

    let data, error;
    try {
      const res = await sb.from('courses').select('id, title, category, level, is_paid, price, currency, status').order('created_at', { ascending: false });
      data = res.data; error = res.error;
    } catch (e) { error = { message: e.message }; }

    if (error) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--ruby);padding:1.5rem;">لوڈ ناکام: ${sanitize(error.message)}</td></tr>`;
      return;
    }
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">کوئی Course نہیں ملا۔ "نیا Course" پر کلک کریں۔</td></tr>';
      return;
    }

    const statusLabel = { draft: 'Draft', published: 'Published' };
    const statusClass = { draft: 'sp-pending', published: 'sp-active' };

    tbody.innerHTML = data.map(c => {
      const priceStr = c.is_paid ? `${c.currency || 'PKR'} ${c.price || 0}` : 'Free';
      const st = c.status || 'draft';
      return `
        <tr>
          <td style="font-weight:600;">${sanitize(c.title || '—')}</td>
          <td>${sanitize(c.category || '—')}</td>
          <td>${sanitize(c.level || '—')}</td>
          <td>${sanitize(priceStr)}</td>
          <td><span class="status-pill ${statusClass[st] || 'sp-pending'}">${statusLabel[st] || st}</span></td>
          <td>
            <button onclick="manageCourseContent('${c.id}', '${(c.title||'').replace(/'/g,"\\'")}')" class="btn btn-outline" style="font-size:.75rem;padding:.3rem .7rem;margin-inline-end:.4rem;"><i class="fas fa-layer-group"></i> Content</button>
            <button onclick="editCourse('${c.id}')" class="btn btn-outline" style="font-size:.75rem;padding:.3rem .7rem;margin-inline-end:.4rem;">Edit</button>
            <button onclick="deleteCourse('${c.id}')" class="btn btn-outline" style="font-size:.75rem;padding:.3rem .7rem;color:var(--ruby);border-color:var(--ruby);">Delete</button>
          </td>
        </tr>`;
    }).join('');
  };

  window.addEventListener('DOMContentLoaded', () => secureSubmit('courseForm', async frm => {
    if (!(await requireStaff())) return;
    const editId = frm.querySelector('#courseEditId').value;
    const title = frm.querySelector('#courseTitle').value.trim();
    let slug = frm.querySelector('#courseSlug').value.trim();
    const shortDescVal = frm.querySelector('#courseShortDesc').value.trim();
    const fullDescVal = frm.querySelector('#courseFullDesc').value.trim();
    // Table has a single `description` column — combine short + full (short first, as a lead paragraph).
    const description = [shortDescVal, fullDescVal].filter(Boolean).join('\n\n') || null;
    const category = frm.querySelector('#courseCategory').value;
    const level = frm.querySelector('#courseLevel').value;
    const is_paid = frm.querySelector('#courseIsPaid').value === 'true';
    const price = is_paid ? (parseFloat(frm.querySelector('#coursePrice').value) || 0) : 0;
    const currency = frm.querySelector('#courseCurrency').value.trim() || 'PKR';
    const duration_label = frm.querySelector('#courseDuration').value.trim() || null;
    const course_code = frm.querySelector('#courseCode').value.trim() || null;
    const certificate_available = frm.querySelector('#courseCertificateAvailable').value === 'true';
    const whatsapp_group_link = frm.querySelector('#courseWhatsappLink').value.trim() || null;
    const status = frm.querySelector('#courseStatus').value;
    // SEO fields (Phase 13 addition) — optional, fall back to core content if left blank
    const seo_title = frm.querySelector('#courseSeoTitle').value.trim() || null;
    const seo_description = frm.querySelector('#courseSeoDescription').value.trim() || null;
    const seo_og_image = frm.querySelector('#courseSeoOgImage').value.trim() || null;

    if (!title) { showToast('براہ کرم Course کا عنوان درج کریں', 'error'); return; }
    if (!slug) slug = slugifyCourseTitle(title);
    if (!slug) { showToast('Slug نہیں بن سکا — عنوان چیک کریں', 'error'); return; }

    const statusEl = document.getElementById('courseThumbStatus');
    let thumbnail_url = document.getElementById('courseExistingThumbUrl').value || null;

    if (courseSelectedThumbFile) {
      if (statusEl) statusEl.textContent = 'تصویر اپلوڈ ہو رہی ہے…';
      const ext = courseSelectedThumbFile.name.split('.').pop();
      const filePath = 'courses/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
      const { error: uploadError } = await sb.storage.from('shaoor-uploads').upload(filePath, courseSelectedThumbFile);
      if (uploadError) {
        showToast('تصویر اپلوڈ ناکام: ' + uploadError.message, 'error');
        if (statusEl) statusEl.textContent = '';
        return;
      }
      const { data: publicUrlData } = sb.storage.from('shaoor-uploads').getPublicUrl(filePath);
      thumbnail_url = publicUrlData.publicUrl;
    }

    const payload = {
      title, slug, description, category, level,
      is_paid, price, currency, duration_label, course_code,
      certificate_available, status, thumbnail_url, whatsapp_group_link,
      seo_title, seo_description, seo_og_image,
      // These columns are NOT NULL in the DB with no admin-facing UI yet — safe defaults for now.
      quiz_frequency: 4, passing_score: 70
    };

    let error;
    if (editId) {
      ({ error } = await sb.from('courses').update(payload).eq('id', editId));
    } else {
      ({ error } = await sb.from('courses').insert(payload));
    }

    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }

    courseSelectedThumbFile = null;
    showToast('✓ Course محفوظ ہو گیا!');
    closeModal('courseModal');
    loadCoursesAdmin();
    if (typeof loadCourseCatalog === 'function') { lmsCatalogLoaded = false; loadCourseCatalog(); }
  }));

  /* ══════════════════════════════════════════════════════════════
     PHASE 11 (مکمل): Admin — Modules / Lessons / Quizzes / Final Assessment
     Reuses the same table/column names already read elsewhere in this
     file (course_modules, course_lessons, quizzes, quiz_questions,
     course_assessments, assessment_questions, assessment_submissions).
     If any column name here doesn't match your live schema, check the
     Supabase error toast — it will name the exact column to fix.
     ══════════════════════════════════════════════════════════════ */

  var lmsAdminCourseId = null, lmsAdminCourseTitle = '';
  var lmsAdminModuleId = null, lmsAdminModuleTitle = '';
  var lmsAdminQuestionTarget = null; // { kind: 'quiz'|'assessment', id, courseId, moduleId }

  /* ---- Course Content (Modules) ---- */
  window.manageCourseContent = function (courseId, courseTitle) {
    lmsAdminCourseId = courseId;
    lmsAdminCourseTitle = courseTitle || '';
    document.getElementById('courseContentTitle').textContent = 'Course Content — ' + lmsAdminCourseTitle;
    openModal('courseContentModal');
    loadModulesAdmin();
    loadFinalAssessmentAdmin();
    loadPendingSubmissionsAdmin();
  };

  window.loadModulesAdmin = async function () {
    var tbody = document.getElementById('modulesAdminBody');
    if (!tbody || !sb || !lmsAdminCourseId) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1rem;"><i class="fas fa-spinner fa-spin"></i> لوڈ ہو رہا ہے…</td></tr>';
    var res = await sb.from('course_modules').select('id, title, module_order, status')
      .eq('course_id', lmsAdminCourseId).order('module_order', { ascending: true });
    if (res.error) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--ruby);padding:1rem;">لوڈ ناکام: ' + sanitize(res.error.message) + '</td></tr>'; return; }
    var modules = res.data || [];
    if (!modules.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1rem;">کوئی Module نہیں — "نیا Module" پر کلک کریں۔</td></tr>'; return; }
    tbody.innerHTML = modules.map(function (m) {
      var st = m.status || 'draft';
      return '<tr>' +
        '<td style="font-weight:600;">' + sanitize(m.title || '—') + '</td>' +
        '<td>' + (m.module_order != null ? m.module_order : '—') + '</td>' +
        '<td><span class="status-pill ' + (st === 'published' ? 'sp-active' : 'sp-pending') + '">' + (st === 'published' ? 'Published' : 'Draft') + '</span></td>' +
        '<td>' +
          '<button onclick="manageModuleContent(\'' + m.id + '\', \'' + String(m.title || '').replace(/'/g, "\\'") + '\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;margin-inline-end:.3rem;"><i class="fas fa-book-open"></i> Lessons &amp; Quiz</button>' +
          '<button onclick="editModule(\'' + m.id + '\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;margin-inline-end:.3rem;">Edit</button>' +
          '<button onclick="deleteModule(\'' + m.id + '\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;color:var(--ruby);border-color:var(--ruby);">Delete</button>' +
        '</td></tr>';
    }).join('');
  };

  window.openCreateModuleModal = function () {
    document.getElementById('moduleForm').reset();
    document.getElementById('moduleEditId').value = '';
    document.getElementById('moduleModalTitle').textContent = 'نیا Module';
    openModal('moduleModal');
  };

  window.editModule = async function (id) {
    var res = await sb.from('course_modules').select('*').eq('id', id).single();
    if (res.error || !res.data) { showToast('Module نہیں ملا: ' + (res.error?.message || ''), 'error'); return; }
    var m = res.data;
    document.getElementById('moduleForm').reset();
    document.getElementById('moduleEditId').value = m.id;
    document.getElementById('moduleModalTitle').textContent = 'Module میں ترمیم';
    document.getElementById('moduleTitleInput').value = m.title || '';
    document.getElementById('moduleOrderInput').value = m.module_order != null ? m.module_order : '';
    document.getElementById('moduleStatusInput').value = m.status || 'draft';
    openModal('moduleModal');
  };

  window.deleteModule = async function (id) {
    if (!(await requireStaff())) return;
    if (!confirm('یہ Module حذف کریں؟ اس کے تمام lessons/quiz بھی متاثر ہو سکتے ہیں۔')) return;
    var res = await sb.from('course_modules').delete().eq('id', id).select('id');
    if (res.error) { showToast('حذف نہیں ہو سکا: ' + res.error.message, 'error'); return; }
    if (!res.data || !res.data.length) { showToast('حذف نہیں ہو سکا — RLS اجازت چیک کریں۔', 'error'); return; }
    showToast('Module حذف کر دیا گیا۔');
    loadModulesAdmin();
  };

  window.addEventListener('DOMContentLoaded', () => secureSubmit('moduleForm', async function (frm) {
    if (!(await requireStaff())) return;
    var editId = frm.querySelector('#moduleEditId').value;
    var title = frm.querySelector('#moduleTitleInput').value.trim();
    var orderVal = frm.querySelector('#moduleOrderInput').value;
    var status = frm.querySelector('#moduleStatusInput').value;
    if (!title) { showToast('براہ کرم Module کا عنوان درج کریں', 'error'); return; }
    var payload = { course_id: lmsAdminCourseId, title: title, module_order: orderVal ? parseInt(orderVal, 10) : 0, status: status };
    var error;
    if (editId) { ({ error } = await sb.from('course_modules').update(payload).eq('id', editId)); }
    else { ({ error } = await sb.from('course_modules').insert(payload)); }
    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }
    showToast('✓ Module محفوظ ہو گیا!');
    closeModal('moduleModal');
    loadModulesAdmin();
  }));

  /* ---- Module Content (Lessons + Quiz) ---- */
  window.manageModuleContent = function (moduleId, moduleTitle) {
    lmsAdminModuleId = moduleId;
    lmsAdminModuleTitle = moduleTitle || '';
    document.getElementById('moduleContentTitle').textContent = 'Lessons & Quiz — ' + lmsAdminModuleTitle;
    openModal('moduleContentModal');
    loadLessonsAdmin();
    loadQuizAdmin();
  };

  window.loadLessonsAdmin = async function () {
    var tbody = document.getElementById('lessonsAdminBody');
    if (!tbody || !lmsAdminModuleId) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1rem;"><i class="fas fa-spinner fa-spin"></i> لوڈ ہو رہا ہے…</td></tr>';
    var res = await sb.from('course_lessons').select('id, title, lesson_order, is_required, is_preview, status')
      .eq('module_id', lmsAdminModuleId).order('lesson_order', { ascending: true });
    if (res.error) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--ruby);padding:1rem;">لوڈ ناکام: ' + sanitize(res.error.message) + '</td></tr>'; return; }
    var lessons = res.data || [];
    if (!lessons.length) { tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1rem;">کوئی Lesson نہیں — "نیا Lesson" پر کلک کریں۔</td></tr>'; return; }
    tbody.innerHTML = lessons.map(function (l) {
      var st = l.status || 'draft';
      return '<tr>' +
        '<td style="font-weight:600;">' + sanitize(l.title || '—') + '</td>' +
        '<td>' + (l.lesson_order != null ? l.lesson_order : '—') + '</td>' +
        '<td>' + (l.is_required ? 'لازمی' : 'اختیاری') + (l.is_preview ? ' · Preview' : '') + '</td>' +
        '<td><span class="status-pill ' + (st === 'published' ? 'sp-active' : 'sp-pending') + '">' + (st === 'published' ? 'Published' : 'Draft') + '</span></td>' +
        '<td>' +
          '<button onclick="editLesson(\'' + l.id + '\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;margin-inline-end:.3rem;">Edit</button>' +
          '<button onclick="deleteLesson(\'' + l.id + '\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;color:var(--ruby);border-color:var(--ruby);">Delete</button>' +
        '</td></tr>';
    }).join('');
  };

  window.openCreateLessonModal = function () {
    document.getElementById('lessonForm').reset();
    document.getElementById('lessonEditId').value = '';
    document.getElementById('lessonModalTitle').textContent = 'نیا Lesson';
    openModal('lessonModal');
  };

  window.editLesson = async function (id) {
    var res = await sb.from('course_lessons').select('*').eq('id', id).single();
    if (res.error || !res.data) { showToast('Lesson نہیں ملا: ' + (res.error?.message || ''), 'error'); return; }
    var l = res.data;
    document.getElementById('lessonForm').reset();
    document.getElementById('lessonEditId').value = l.id;
    document.getElementById('lessonModalTitle').textContent = 'Lesson میں ترمیم';
    document.getElementById('lessonTitleInput').value = l.title || '';
    document.getElementById('lessonDescInput').value = l.description || '';
    document.getElementById('lessonOrderInput').value = l.lesson_order != null ? l.lesson_order : '';
    document.getElementById('lessonYoutubeIdInput').value = l.youtube_video_id || '';
    document.getElementById('lessonYoutubeUrlInput').value = l.youtube_url || '';
    document.getElementById('lessonRequiredInput').value = l.is_required === false ? 'false' : 'true';
    document.getElementById('lessonPreviewInput').value = l.is_preview ? 'true' : 'false';
    document.getElementById('lessonStatusInput').value = l.status || 'draft';
    openModal('lessonModal');
  };

  window.deleteLesson = async function (id) {
    if (!confirm('یہ Lesson حذف کریں؟')) return;
    var res = await sb.from('course_lessons').delete().eq('id', id).select('id');
    if (res.error) { showToast('حذف نہیں ہو سکا: ' + res.error.message, 'error'); return; }
    if (!res.data || !res.data.length) { showToast('حذف نہیں ہو سکا — RLS اجازت چیک کریں۔', 'error'); return; }
    showToast('Lesson حذف کر دیا گیا۔');
    loadLessonsAdmin();
  };

  window.addEventListener('DOMContentLoaded', () => secureSubmit('lessonForm', async function (frm) {
    if (!(await requireStaff())) return;
    var editId = frm.querySelector('#lessonEditId').value;
    var title = frm.querySelector('#lessonTitleInput').value.trim();
    var description = frm.querySelector('#lessonDescInput').value.trim() || null;
    var orderVal = frm.querySelector('#lessonOrderInput').value;
    var youtube_video_id = frm.querySelector('#lessonYoutubeIdInput').value.trim() || null;
    var youtube_url = frm.querySelector('#lessonYoutubeUrlInput').value.trim() || null;
    var is_required = frm.querySelector('#lessonRequiredInput').value === 'true';
    var is_preview = frm.querySelector('#lessonPreviewInput').value === 'true';
    var status = frm.querySelector('#lessonStatusInput').value;
    if (!title) { showToast('براہ کرم Lesson کا عنوان درج کریں', 'error'); return; }
    if (!youtube_video_id && !youtube_url) { showToast('براہ کرم YouTube video ID یا URL درج کریں', 'error'); return; }
    var payload = {
      course_id: lmsAdminCourseId, module_id: lmsAdminModuleId,
      title: title, description: description, lesson_order: orderVal ? parseInt(orderVal, 10) : 0,
      youtube_video_id: youtube_video_id, youtube_url: youtube_url,
      is_required: is_required, is_preview: is_preview, status: status
    };
    var error;
    if (editId) { ({ error } = await sb.from('course_lessons').update(payload).eq('id', editId)); }
    else { ({ error } = await sb.from('course_lessons').insert(payload)); }
    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }
    showToast('✓ Lesson محفوظ ہو گیا!');
    closeModal('lessonModal');
    loadLessonsAdmin();
  }));

  /* ---- Quiz (one per module) ---- */
  window.loadQuizAdmin = async function () {
    var wrap = document.getElementById('moduleQuizWrap');
    if (!wrap || !lmsAdminModuleId) return;
    wrap.innerHTML = '<p style="color:var(--muted);font-size:.85rem;"><i class="fas fa-spinner fa-spin"></i> لوڈ ہو رہا ہے…</p>';
    var res = await sb.from('quizzes').select('id, title, passing_score, attempt_limit, time_limit_minutes, status')
      .eq('module_id', lmsAdminModuleId).maybeSingle();
    if (res.error) { wrap.innerHTML = '<p style="color:var(--ruby);font-size:.85rem;">لوڈ ناکام: ' + sanitize(res.error.message) + '</p>'; return; }
    if (!res.data) {
      wrap.innerHTML = '<p style="color:var(--muted);font-size:.85rem;margin-bottom:.6rem;">اس Module کے لیے ابھی کوئی Quiz نہیں بنایا گیا۔</p>' +
        '<button class="btn btn-gold" style="font-size:.8rem;" onclick="openCreateQuizModal()"><i class="fas fa-plus"></i> Quiz بنائیں</button>';
      return;
    }
    var q = res.data;
    var st = q.status || 'draft';
    wrap.innerHTML =
      '<div style="border:1px solid var(--border);border-radius:10px;padding:.9rem;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;">' +
        '<div><strong>' + sanitize(q.title || 'Module Quiz') + '</strong> <span class="status-pill ' + (st === 'published' ? 'sp-active' : 'sp-pending') + '">' + (st === 'published' ? 'Published' : 'Draft') + '</span></div>' +
        '<div>' +
          '<button onclick="manageQuestions(\'quiz\', \'' + q.id + '\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;margin-inline-end:.3rem;"><i class="fas fa-list-ol"></i> سوالات</button>' +
          '<button onclick="editQuiz(\'' + q.id + '\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;margin-inline-end:.3rem;">Edit</button>' +
          '<button onclick="deleteQuiz(\'' + q.id + '\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;color:var(--ruby);border-color:var(--ruby);">Delete</button>' +
        '</div>' +
      '</div>' +
      '<p style="font-size:.8rem;color:var(--muted);margin-top:.5rem;">Passing: ' + (q.passing_score != null ? q.passing_score : '—') + '% · Attempts: ' + (q.attempt_limit || 'Unlimited') + (q.time_limit_minutes ? ' · Time limit: ' + q.time_limit_minutes + ' min' : '') + '</p>' +
      '</div>';
  };

  window.openCreateQuizModal = function () {
    document.getElementById('quizForm').reset();
    document.getElementById('quizEditId').value = '';
    document.getElementById('quizModalTitle').textContent = 'نیا Quiz';
    openModal('quizModal');
  };

  window.editQuiz = async function (id) {
    var res = await sb.from('quizzes').select('*').eq('id', id).single();
    if (res.error || !res.data) { showToast('Quiz نہیں ملا: ' + (res.error?.message || ''), 'error'); return; }
    var q = res.data;
    document.getElementById('quizForm').reset();
    document.getElementById('quizEditId').value = q.id;
    document.getElementById('quizModalTitle').textContent = 'Quiz میں ترمیم';
    document.getElementById('quizTitleInput').value = q.title || '';
    document.getElementById('quizPassingInput').value = q.passing_score != null ? q.passing_score : 70;
    document.getElementById('quizAttemptLimitInput').value = q.attempt_limit || '';
    document.getElementById('quizTimeLimitInput').value = q.time_limit_minutes || '';
    document.getElementById('quizStatusInput').value = q.status || 'draft';
    openModal('quizModal');
  };

  window.deleteQuiz = async function (id) {
    if (!confirm('یہ Quiz اور اس کے تمام سوالات حذف کریں؟')) return;
    var res = await sb.from('quizzes').delete().eq('id', id).select('id');
    if (res.error) { showToast('حذف نہیں ہو سکا: ' + res.error.message, 'error'); return; }
    if (!res.data || !res.data.length) { showToast('حذف نہیں ہو سکا — RLS اجازت چیک کریں۔', 'error'); return; }
    showToast('Quiz حذف کر دیا گیا۔');
    loadQuizAdmin();
  };

  window.addEventListener('DOMContentLoaded', () => secureSubmit('quizForm', async function (frm) {
    if (!(await requireStaff())) return;
    var editId = frm.querySelector('#quizEditId').value;
    var title = frm.querySelector('#quizTitleInput').value.trim() || 'Module Quiz';
    var passing_score = parseFloat(frm.querySelector('#quizPassingInput').value) || 70;
    var attemptVal = frm.querySelector('#quizAttemptLimitInput').value;
    var timeVal = frm.querySelector('#quizTimeLimitInput').value;
    var status = frm.querySelector('#quizStatusInput').value;
    var payload = {
      course_id: lmsAdminCourseId, module_id: lmsAdminModuleId, title: title,
      passing_score: passing_score, attempt_limit: attemptVal ? parseInt(attemptVal, 10) : null,
      time_limit_minutes: timeVal ? parseInt(timeVal, 10) : null, status: status
    };
    var error;
    if (editId) { ({ error } = await sb.from('quizzes').update(payload).eq('id', editId)); }
    else { ({ error } = await sb.from('quizzes').insert(payload)); }
    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }
    showToast('✓ Quiz محفوظ ہو گیا!');
    closeModal('quizModal');
    loadQuizAdmin();
  }));

  /* ---- Final Assessment (one per course) ---- */
  window.loadFinalAssessmentAdmin = async function () {
    var wrap = document.getElementById('finalAssessmentAdminWrap');
    if (!wrap || !lmsAdminCourseId) return;
    wrap.innerHTML = '<p style="color:var(--muted);font-size:.85rem;"><i class="fas fa-spinner fa-spin"></i> لوڈ ہو رہا ہے…</p>';
    var res = await sb.from('course_assessments').select('id, title, assessment_type, passing_score, attempt_limit, status')
      .eq('course_id', lmsAdminCourseId).maybeSingle();
    if (res.error) { wrap.innerHTML = '<p style="color:var(--ruby);font-size:.85rem;">لوڈ ناکام: ' + sanitize(res.error.message) + '</p>'; return; }
    if (!res.data) {
      wrap.innerHTML = '<p style="color:var(--muted);font-size:.85rem;margin-bottom:.6rem;">اس Course کے لیے ابھی کوئی Final Assessment نہیں بنایا گیا (اختیاری ہے)۔</p>' +
        '<button class="btn btn-gold" style="font-size:.8rem;" onclick="openCreateFinalAssessmentModal()"><i class="fas fa-plus"></i> Final Assessment بنائیں</button>';
      return;
    }
    var a = res.data;
    var st = a.status || 'draft';
    var mcq = a.assessment_type === 'mcq';
    wrap.innerHTML =
      '<div style="border:1px solid var(--border);border-radius:10px;padding:.9rem;">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem;">' +
        '<div><strong>' + sanitize(a.title || 'Final Assessment') + '</strong> <span class="status-pill ' + (st === 'published' ? 'sp-active' : 'sp-pending') + '">' + (st === 'published' ? 'Published' : 'Draft') + '</span></div>' +
        '<div>' +
          (mcq ? '<button onclick="manageQuestions(\'assessment\', \'' + a.id + '\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;margin-inline-end:.3rem;"><i class="fas fa-list-ol"></i> سوالات</button>' : '') +
          '<button onclick="editFinalAssessment(\'' + a.id + '\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;margin-inline-end:.3rem;">Edit</button>' +
          '<button onclick="deleteFinalAssessment(\'' + a.id + '\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;color:var(--ruby);border-color:var(--ruby);">Delete</button>' +
        '</div>' +
      '</div>' +
      '<p style="font-size:.8rem;color:var(--muted);margin-top:.5rem;">قسم: ' + (mcq ? 'MCQ (خودکار)' : 'Written/File (Admin review درکار)') + ' · Passing: ' + (a.passing_score != null ? a.passing_score : '—') + '% · Attempts: ' + (a.attempt_limit || 'Unlimited') + '</p>' +
      '</div>';
  };

  window.openCreateFinalAssessmentModal = function () {
    document.getElementById('finalAssessmentForm').reset();
    document.getElementById('finalAssessmentEditId').value = '';
    document.getElementById('finalAssessmentModalTitle').textContent = 'نیا Final Assessment';
    openModal('finalAssessmentModal');
  };

  window.editFinalAssessment = async function (id) {
    var res = await sb.from('course_assessments').select('*').eq('id', id).single();
    if (res.error || !res.data) { showToast('Assessment نہیں ملا: ' + (res.error?.message || ''), 'error'); return; }
    var a = res.data;
    document.getElementById('finalAssessmentForm').reset();
    document.getElementById('finalAssessmentEditId').value = a.id;
    document.getElementById('finalAssessmentModalTitle').textContent = 'Final Assessment میں ترمیم';
    document.getElementById('faTitleInput').value = a.title || '';
    document.getElementById('faTypeInput').value = a.assessment_type || 'mcq';
    document.getElementById('faPassingInput').value = a.passing_score != null ? a.passing_score : 70;
    document.getElementById('faAttemptLimitInput').value = a.attempt_limit || '';
    document.getElementById('faStatusInput').value = a.status || 'draft';
    openModal('finalAssessmentModal');
  };

  window.deleteFinalAssessment = async function (id) {
    if (!confirm('یہ Final Assessment حذف کریں؟')) return;
    var res = await sb.from('course_assessments').delete().eq('id', id).select('id');
    if (res.error) { showToast('حذف نہیں ہو سکا: ' + res.error.message, 'error'); return; }
    if (!res.data || !res.data.length) { showToast('حذف نہیں ہو سکا — RLS اجازت چیک کریں۔', 'error'); return; }
    showToast('Final Assessment حذف کر دیا گیا۔');
    loadFinalAssessmentAdmin();
  };

  window.addEventListener('DOMContentLoaded', () => secureSubmit('finalAssessmentForm', async function (frm) {
    if (!(await requireStaff())) return;
    var editId = frm.querySelector('#finalAssessmentEditId').value;
    var title = frm.querySelector('#faTitleInput').value.trim() || 'Final Assessment';
    var assessment_type = frm.querySelector('#faTypeInput').value;
    var passing_score = parseFloat(frm.querySelector('#faPassingInput').value) || 70;
    var attemptVal = frm.querySelector('#faAttemptLimitInput').value;
    var status = frm.querySelector('#faStatusInput').value;
    var payload = {
      course_id: lmsAdminCourseId, title: title, assessment_type: assessment_type,
      passing_score: passing_score, attempt_limit: attemptVal ? parseInt(attemptVal, 10) : null, status: status
    };
    var error;
    if (editId) { ({ error } = await sb.from('course_assessments').update(payload).eq('id', editId)); }
    else { ({ error } = await sb.from('course_assessments').insert(payload)); }
    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }
    showToast('✓ Final Assessment محفوظ ہو گیا!');
    closeModal('finalAssessmentModal');
    loadFinalAssessmentAdmin();
  }));

  /* ---- Questions (shared modal for quiz_questions + assessment_questions) ---- */
  window.manageQuestions = function (kind, ownerId) {
    lmsAdminQuestionTarget = { kind: kind, id: ownerId };
    document.getElementById('questionsManagerTitle').textContent = kind === 'quiz' ? 'Quiz کے سوالات' : 'Final Assessment کے سوالات';
    openModal('questionsManagerModal');
    loadQuestionsAdmin();
  };

  window.loadQuestionsAdmin = async function () {
    var tbody = document.getElementById('questionsAdminBody');
    if (!tbody || !lmsAdminQuestionTarget) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1rem;"><i class="fas fa-spinner fa-spin"></i> لوڈ ہو رہا ہے…</td></tr>';
    var table = lmsAdminQuestionTarget.kind === 'quiz' ? 'quiz_questions' : 'assessment_questions';
    var fk = lmsAdminQuestionTarget.kind === 'quiz' ? 'quiz_id' : 'assessment_id';
    var res = await sb.from(table).select('id, question_text, question_type, options, correct_answer, marks, question_order')
      .eq(fk, lmsAdminQuestionTarget.id).order('question_order', { ascending: true });
    if (res.error) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--ruby);padding:1rem;">لوڈ ناکام: ' + sanitize(res.error.message) + '</td></tr>'; return; }
    var qs = res.data || [];
    if (!qs.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1rem;">کوئی سوال نہیں — "نیا سوال" پر کلک کریں۔</td></tr>'; return; }
    tbody.innerHTML = qs.map(function (q) {
      return '<tr>' +
        '<td>' + sanitize(q.question_text || '—') + '</td>' +
        '<td>' + (q.question_type === 'true_false' ? 'True/False' : 'MCQ') + '</td>' +
        '<td>' + (q.marks != null ? q.marks : 1) + '</td>' +
        '<td>' +
          '<button onclick="editQuestion(\'' + q.id + '\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;margin-inline-end:.3rem;">Edit</button>' +
          '<button onclick="deleteQuestion(\'' + q.id + '\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;color:var(--ruby);border-color:var(--ruby);">Delete</button>' +
        '</td></tr>';
    }).join('');
  };

  window.openCreateQuestionModal = function () {
    document.getElementById('questionForm').reset();
    document.getElementById('questionEditId').value = '';
    document.getElementById('questionModalTitle').textContent = 'نیا سوال';
    document.getElementById('questionOptionsGroup').style.display = 'block';
    openModal('questionModal');
  };

  window.editQuestion = async function (id) {
    var table = lmsAdminQuestionTarget.kind === 'quiz' ? 'quiz_questions' : 'assessment_questions';
    var res = await sb.from(table).select('*').eq('id', id).single();
    if (res.error || !res.data) { showToast('سوال نہیں ملا: ' + (res.error?.message || ''), 'error'); return; }
    var q = res.data;
    document.getElementById('questionForm').reset();
    document.getElementById('questionEditId').value = q.id;
    document.getElementById('questionModalTitle').textContent = 'سوال میں ترمیم';
    document.getElementById('questionTextInput').value = q.question_text || '';
    document.getElementById('questionTypeInput').value = q.question_type || 'multiple_choice';
    document.getElementById('questionOptionsGroup').style.display = q.question_type === 'true_false' ? 'none' : 'block';
    document.getElementById('questionOptionsInput').value = Array.isArray(q.options) ? q.options.join('\n') : '';
    document.getElementById('questionCorrectInput').value = q.correct_answer || '';
    document.getElementById('questionMarksInput').value = q.marks != null ? q.marks : 1;
    document.getElementById('questionOrderInput').value = q.question_order != null ? q.question_order : '';
    openModal('questionModal');
  };

  window.deleteQuestion = async function (id) {
    if (!confirm('یہ سوال حذف کریں؟')) return;
    var table = lmsAdminQuestionTarget.kind === 'quiz' ? 'quiz_questions' : 'assessment_questions';
    var res = await sb.from(table).delete().eq('id', id).select('id');
    if (res.error) { showToast('حذف نہیں ہو سکا: ' + res.error.message, 'error'); return; }
    if (!res.data || !res.data.length) { showToast('حذف نہیں ہو سکا — RLS اجازت چیک کریں۔', 'error'); return; }
    showToast('سوال حذف کر دیا گیا۔');
    loadQuestionsAdmin();
  };

  document.getElementById('questionTypeInput')?.addEventListener('change', function () {
    document.getElementById('questionOptionsGroup').style.display = this.value === 'true_false' ? 'none' : 'block';
  });

  window.addEventListener('DOMContentLoaded', () => secureSubmit('questionForm', async function (frm) {
    var editId = frm.querySelector('#questionEditId').value;
    var question_text = frm.querySelector('#questionTextInput').value.trim();
    var question_type = frm.querySelector('#questionTypeInput').value;
    var optionsRaw = frm.querySelector('#questionOptionsInput').value;
    var options = question_type === 'true_false' ? ['True', 'False'] :
      optionsRaw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var correct_answer = frm.querySelector('#questionCorrectInput').value.trim();
    var marks = parseInt(frm.querySelector('#questionMarksInput').value, 10) || 1; // integer column in DB
    var orderVal = frm.querySelector('#questionOrderInput').value;

    if (!question_text) { showToast('سوال کا متن درج کریں', 'error'); return; }
    if (question_type !== 'true_false' && options.length < 2) { showToast('کم از کم دو options درج کریں (ہر لائن پر ایک)', 'error'); return; }
    if (!correct_answer) { showToast('صحیح جواب درج کریں — لفظ بہ لفظ options میں سے ایک جیسا ہونا چاہیے', 'error'); return; }
    if (!options.includes(correct_answer)) { showToast('صحیح جواب بالکل options میں سے کسی ایک جیسا ہونا چاہیے', 'error'); return; }

    var table = lmsAdminQuestionTarget.kind === 'quiz' ? 'quiz_questions' : 'assessment_questions';
    var fk = lmsAdminQuestionTarget.kind === 'quiz' ? 'quiz_id' : 'assessment_id';
    var payload = { question_text: question_text, question_type: question_type, options: options, correct_answer: correct_answer, marks: marks, question_order: orderVal ? parseInt(orderVal, 10) : 0 };
    payload[fk] = lmsAdminQuestionTarget.id;

    // Always .select('id') and check res.data explicitly. Supabase RLS can let a
    // request through with error === null but return zero rows if a WITH CHECK /
    // USING clause quietly filters it out — the old code only checked `error`, so it
    // showed "✓ محفوظ ہو گیا" even when nothing was written. deleteQuestion() above
    // already guards this way; insert/update now does the same.
    var res;
    if (editId) { res = await sb.from(table).update(payload).eq('id', editId).select('id'); }
    else { res = await sb.from(table).insert(payload).select('id'); }
    if (res.error) { showToast('محفوظ نہیں ہو سکا: ' + res.error.message, 'error'); return; }
    if (!res.data || !res.data.length) {
      showToast('سوال محفوظ نہیں ہوا — RLS پالیسی یا owner id چیک کریں (' + table + ')۔', 'error');
      return;
    }
    showToast('✓ سوال محفوظ ہو گیا!');
    closeModal('questionModal');
    loadQuestionsAdmin();
  }));

  /* ---- Final assessment submissions pending manual review (written/file type) ---- */
  window.loadPendingSubmissionsAdmin = async function () {
    var tbody = document.getElementById('pendingSubmissionsBody');
    if (!tbody || !lmsAdminCourseId) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1rem;"><i class="fas fa-spinner fa-spin"></i> لوڈ ہو رہا ہے…</td></tr>';
    var assessRes = await sb.from('course_assessments').select('id').eq('course_id', lmsAdminCourseId).maybeSingle();
    if (assessRes.error || !assessRes.data) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1rem;">اس Course کا کوئی Final Assessment نہیں۔</td></tr>'; return; }
    var res = await sb.from('assessment_submissions')
      .select('id, member_id, submission_type, text_content, file_url, review_status, reviewer_notes, submitted_at')
      .eq('assessment_id', assessRes.data.id).order('submitted_at', { ascending: false });
    if (res.error) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--ruby);padding:1rem;">لوڈ ناکام: ' + sanitize(res.error.message) + '</td></tr>'; return; }
    var subs = res.data || [];
    if (!subs.length) { tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:1rem;">ابھی کوئی submission موصول نہیں ہوئی۔</td></tr>'; return; }
    tbody.innerHTML = subs.map(function (s) {
      var st = s.review_status || 'pending';
      var stLabel = st === 'approved' ? 'Approved' : (st === 'rejected' ? 'Rejected' : 'Pending Review');
      var stClass = st === 'approved' ? 'sp-active' : (st === 'rejected' ? 'sp-pending' : 'sp-pending');
      var contentPreview = s.submission_type === 'file'
        ? '<a href="' + sanitize(s.file_url || '#') + '" target="_blank" rel="noopener">فائل دیکھیں</a>'
        : sanitize((s.text_content || '').slice(0, 140)) + ((s.text_content || '').length > 140 ? '…' : '');
      return '<tr>' +
        '<td style="font-family:monospace;font-size:.75rem;">' + sanitize(String(s.member_id).slice(0, 8)) + '…</td>' +
        '<td style="max-width:260px;">' + contentPreview + '</td>' +
        '<td><span class="status-pill ' + stClass + '">' + stLabel + '</span>' +
          (st === 'rejected' && s.reviewer_notes ? '<div style="font-size:.72rem;color:var(--muted);margin-top:.2rem;">' + sanitize(s.reviewer_notes) + '</div>' : '') +
        '</td>' +
        '<td>' +
          (st === 'pending' ?
            '<button onclick="reviewSubmission(\'' + s.id + '\', \'approved\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;margin-inline-end:.3rem;color:var(--teal);">Approve</button>' +
            '<button onclick="reviewSubmission(\'' + s.id + '\', \'rejected\')" class="btn btn-outline" style="font-size:.72rem;padding:.3rem .6rem;color:var(--ruby);border-color:var(--ruby);">Reject</button>'
            : '<span style="color:var(--muted);font-size:.78rem;">جائزہ مکمل</span>') +
        '</td></tr>';
    }).join('');
  };

  window.reviewSubmission = async function (id, decision) {
    var notes = null;
    if (decision === 'rejected') {
      notes = prompt('یہ submission کیوں مسترد کی جا رہی ہے؟ (طالبعلم کو یہ وجہ نظر آئے گی تاکہ وہ بہتری لا سکے)');
      if (notes === null) return; // admin cancelled the prompt
      notes = notes.trim();
      if (!notes) { showToast('Reject کرنے کے لیے وجہ لکھنا ضروری ہے۔', 'error'); return; }
    } else {
      if (!confirm('یہ submission منظور کریں؟')) return;
    }
    // admin_review_final_submission: sets review_status + passed together, and — on approval —
    // automatically issues the course certificate via the same eligibility check students use,
    // so the member sees it in "My Certificates" without any extra click.
    var res = await sb.rpc('admin_review_final_submission', {
      p_submission_id: id,
      p_decision: decision,
      p_notes: notes
    });
    if (res.error) { showToast('محفوظ نہیں ہو سکا: ' + res.error.message, 'error'); return; }
    if (decision === 'approved') {
      var cert = res.data && res.data.certificate;
      if (cert && cert.certificate_id) {
        showToast('✓ Submission منظور کر دی گئی — Certificate خود بخود جاری ہو گیا (' + cert.certificate_id + ')۔');
      } else {
        showToast('✓ Submission منظور کر دی گئی۔ Certificate ابھی جاری نہیں ہوا — شاید کورس کی کوئی اور شرط (lesson/quiz) ابھی باقی ہے۔');
      }
    } else {
      showToast('Submission مسترد کر دی گئی۔');
    }
    loadPendingSubmissionsAdmin();
  };

  /* ── Admin: Live Classes (Google Meet) management (Phase 14) ── */
  window.openCreateLiveSessionModal = async function() {
    await populateLiveSessionCourseOptions();
    document.getElementById('liveSessionForm').reset();
    document.getElementById('liveSessionEditId').value = '';
    document.getElementById('liveSessionModalTitle').textContent = 'نیا Live Session';
    openModal('liveSessionModal');
  };

  async function populateLiveSessionCourseOptions(selectedId) {
    const sel = document.getElementById('liveSessionCourse');
    if (!sel) return;
    const { data, error } = await sb.from('courses').select('id, title').order('title', { ascending: true });
    if (error) { sel.innerHTML = '<option value="">Courses لوڈ نہیں ہو سکے</option>'; return; }
    sel.innerHTML = (data || []).map(c => `<option value="${c.id}">${sanitize(c.title)}</option>`).join('');
    if (selectedId) sel.value = selectedId;
  }

  window.editLiveSession = async function(id) {
    const { data: s, error } = await sb.from('course_live_sessions').select('*').eq('id', id).single();
    if (error || !s) { showToast('Live Session نہیں ملا: ' + (error?.message || ''), 'error'); return; }
    await populateLiveSessionCourseOptions(s.course_id);
    document.getElementById('liveSessionEditId').value = s.id;
    document.getElementById('liveSessionModalTitle').textContent = 'Live Session میں ترمیم';
    document.getElementById('liveSessionTitle').value = s.title || '';
    document.getElementById('liveSessionMeetLink').value = s.meet_link || '';
    if (s.scheduled_at) {
      const d = new Date(s.scheduled_at);
      const pad = n => String(n).padStart(2, '0');
      document.getElementById('liveSessionScheduledAt').value =
        `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    document.getElementById('liveSessionDuration').value = s.duration_minutes || '';
    document.getElementById('liveSessionStatus').value = s.status || 'upcoming';
    document.getElementById('liveSessionRecordingUrl').value = s.recording_url || '';
    document.getElementById('liveSessionNotes').value = s.notes || '';
    openModal('liveSessionModal');
  };

  window.deleteLiveSession = async function(id) {
    if (!(await requireStaff())) return;
    if (!confirm('کیا یہ Live Session حذف کرنا چاہتے ہیں؟')) return;
    const { data, error } = await sb.from('course_live_sessions').delete().eq('id', id).select('id');
    if (error) { showToast('حذف نہیں ہو سکا: ' + error.message, 'error'); return; }
    if (!data || data.length === 0) { showToast('حذف نہیں ہو سکا — اجازت موجود نہیں۔', 'error'); return; }
    showToast('Live Session حذف کر دیا گیا۔');
    loadLiveSessionsAdmin();
  };

  window.loadLiveSessionsAdmin = async function() {
    const tbody = document.getElementById('liveSessionsAdminBody');
    if (!tbody || !sb) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;"><i class="fas fa-spinner fa-spin"></i> لوڈ ہو رہا ہے…</td></tr>';

    const { data, error } = await sb
      .from('course_live_sessions')
      .select('id, title, scheduled_at, status, recording_url, courses(title)')
      .order('scheduled_at', { ascending: false });

    if (error) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--ruby);padding:1.5rem;">لوڈ ناکام: ${sanitize(error.message)}</td></tr>`;
      return;
    }
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">کوئی Live Session نہیں ملا۔</td></tr>';
      return;
    }

    const statusLabel = { upcoming: 'Upcoming', live: 'Live', ended: 'Ended', cancelled: 'Cancelled' };
    const statusClass = { upcoming: 'sp-pending', live: 'sp-active', ended: 'sp-listed', cancelled: 'sp-listed' };

    tbody.innerHTML = data.map(s => {
      const st = s.status || 'upcoming';
      const when = s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : '—';
      return `
        <tr>
          <td>${sanitize(s.courses ? s.courses.title : '—')}</td>
          <td style="font-weight:600;">${sanitize(s.title || '—')}</td>
          <td>${sanitize(when)}</td>
          <td><span class="status-pill ${statusClass[st] || 'sp-pending'}">${statusLabel[st] || st}</span></td>
          <td>${s.recording_url ? '<i class="fas fa-check" style="color:#1e8e5a;"></i>' : '<span style="color:var(--muted);">—</span>'}</td>
          <td>
            <button onclick="editLiveSession('${s.id}')" class="btn btn-outline" style="font-size:.75rem;padding:.3rem .7rem;margin-inline-end:.4rem;">Edit</button>
            <button onclick="deleteLiveSession('${s.id}')" class="btn btn-outline" style="font-size:.75rem;padding:.3rem .7rem;color:var(--ruby);border-color:var(--ruby);">Delete</button>
          </td>
        </tr>`;
    }).join('');
  };

  window.addEventListener('DOMContentLoaded', () => secureSubmit('liveSessionForm', async frm => {
    if (!(await requireStaff())) return;
    const editId = frm.querySelector('#liveSessionEditId').value;
    const course_id = frm.querySelector('#liveSessionCourse').value;
    const title = frm.querySelector('#liveSessionTitle').value.trim();
    const meet_link = frm.querySelector('#liveSessionMeetLink').value.trim();
    const scheduledLocal = frm.querySelector('#liveSessionScheduledAt').value;
    const duration_minutes = parseInt(frm.querySelector('#liveSessionDuration').value, 10) || null;
    const status = frm.querySelector('#liveSessionStatus').value;
    const recording_url = frm.querySelector('#liveSessionRecordingUrl').value.trim() || null;
    const notes = frm.querySelector('#liveSessionNotes').value.trim() || null;

    if (!course_id) { showToast('براہ کرم Course منتخب کریں', 'error'); return; }
    if (!title) { showToast('براہ کرم عنوان درج کریں', 'error'); return; }
    if (!meet_link) { showToast('براہ کرم Google Meet لنک درج کریں', 'error'); return; }
    if (!scheduledLocal) { showToast('براہ کرم تاریخ و وقت منتخب کریں', 'error'); return; }

    const payload = {
      course_id, title, meet_link,
      scheduled_at: new Date(scheduledLocal).toISOString(),
      duration_minutes, status, recording_url, notes
    };

    let error;
    if (editId) {
      ({ error } = await sb.from('course_live_sessions').update(payload).eq('id', editId));
    } else {
      ({ error } = await sb.from('course_live_sessions').insert(payload));
    }

    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }

    showToast('✓ Live Session محفوظ ہو گیا!');
    closeModal('liveSessionModal');
    loadLiveSessionsAdmin();
  }));

  /* ── Admin: Platform Settings (general WhatsApp group) ── */
  window.loadPlatformSettingsAdmin = async function() {
    const input = document.getElementById('generalWhatsappLink');
    if (!input || !sb) return;
    const { data, error } = await sb.from('platform_settings').select('general_whatsapp_link').eq('id', 1).maybeSingle();
    if (!error && data) input.value = data.general_whatsapp_link || '';
  };

  window.addEventListener('DOMContentLoaded', () => secureSubmit('platformSettingsForm', async frm => {
    const general_whatsapp_link = frm.querySelector('#generalWhatsappLink').value.trim() || null;
    const { error } = await sb.from('platform_settings').update({ general_whatsapp_link }).eq('id', 1);
    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }
    showToast('✓ محفوظ ہو گیا!');
  }));

  /* ── Event Attendance (Admin view) ── */
  window.viewEventAttendance = async function(eventId, eventTitle) {
    let modal = document.getElementById('eventAttendanceModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal';
      modal.id = 'eventAttendanceModal';
      modal.innerHTML = `
        <div class="modal-box" style="max-width:520px;">
          <button class="modal-close" onclick="document.getElementById('eventAttendanceModal').classList.remove('open')"><i class="fas fa-times"></i></button>
          <h3 id="eaModalTitle" style="margin-bottom:.3rem;"><i class="fas fa-clipboard-check" style="color:var(--gold);"></i> Attendance</h3>
          <div id="eaModalCount" style="color:var(--muted);font-size:.85rem;margin-bottom:1rem;"></div>
          <div id="eaModalList" style="display:grid;gap:.5rem;max-height:50vh;overflow-y:auto;"></div>
          <button class="btn btn-outline" style="margin-top:1rem;width:100%;justify-content:center;" onclick="exportEventAttendanceCSV('${eventId}','${(eventTitle||'').replace(/'/g,"\\'")}')"><i class="fas fa-file-csv"></i> CSV Download</button>
        </div>`;
      document.body.appendChild(modal);
    }
    document.getElementById('eaModalTitle').innerHTML = `<i class="fas fa-clipboard-check" style="color:var(--gold);"></i> ${sanitize(eventTitle || 'Event')} — Attendance`;
    document.getElementById('eaModalList').innerHTML = '<div style="text-align:center;color:var(--muted);padding:1rem;"><i class="fas fa-spinner fa-spin"></i> لوڈ ہو رہا ہے…</div>';
    document.getElementById('eaModalCount').textContent = '';
    modal.classList.add('open');
    modal.dataset.eventId = eventId;

    const { data, error } = await sb
      .from('event_attendance')
      .select('marked_at, profiles!event_attendance_member_id_fkey(full_name, member_id)')
      .eq('event_id', eventId)
      .order('marked_at', { ascending: true });

    if (error) {
      document.getElementById('eaModalList').innerHTML = `<div style="color:var(--ruby);text-align:center;padding:1rem;">لوڈ ناکام: ${sanitize(error.message)}</div>`;
      return;
    }
    const rows = data || [];
    document.getElementById('eaModalCount').textContent = `کل حاضری: ${rows.length}`;
    if (rows.length === 0) {
      document.getElementById('eaModalList').innerHTML = '<div style="text-align:center;color:var(--muted);padding:1rem;">ابھی تک کسی نے حاضری نہیں لگائی۔</div>';
      return;
    }
    document.getElementById('eaModalList').innerHTML = rows.map((r, i) => {
      const name = r.profiles?.full_name || '—';
      const mid = r.profiles?.member_id || '—';
      const t = r.marked_at ? new Date(r.marked_at).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:.6rem .8rem;border:1px solid var(--border);border-radius:8px;">
        <div><div style="font-weight:600;">${i+1}. ${sanitize(name)}</div><div style="font-size:.75rem;color:var(--muted);">${sanitize(mid)}</div></div>
        <div style="font-size:.75rem;color:var(--muted);">${t}</div>
      </div>`;
    }).join('');
  };

  window.exportEventAttendanceCSV = async function(eventId, eventTitle) {
    const { data, error } = await sb
      .from('event_attendance')
      .select('marked_at, profiles!event_attendance_member_id_fkey(full_name, member_id)')
      .eq('event_id', eventId)
      .order('marked_at', { ascending: true });
    if (error) { showToast('Export ناکام: ' + error.message, 'error'); return; }
    const rows = data || [];
    let csv = 'Sr,Name,Member ID,Marked At\n';
    rows.forEach((r, i) => {
      const name = (r.profiles?.full_name || '').replace(/"/g,'""');
      const mid = r.profiles?.member_id || '';
      const t = r.marked_at || '';
      csv += `${i+1},"${name}","${mid}","${t}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance_${(eventTitle||'event').replace(/[^a-zA-Z0-9]/g,'_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ════════════ BLOG POSTS: CMS (structured content in blog_posts.content JSON) ════════════ */
  let blogSelectedImageFile = null;
  let blogEditorBlocks = [];
  let blogChartInstances = {};
  const BLOG_PUBLIC_SECTIONS = [
    { href: '#membership', label: 'Membership' },
    { href: '#about', label: 'About' },
    { href: '#societies', label: 'Societies' },
    { href: '#chapters', label: 'Chapters' },
    { href: '#events', label: 'Events' },
    { href: '#courses', label: 'Courses' },
    { href: '#verification', label: 'Verification' },
    { href: '#gallery', label: 'Gallery' },
    { href: '#contact', label: 'Contact' },
    { href: '#blog', label: 'Blog index' }
  ];

  function blogUid() {
    return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function blogArticleUrl(slug) {
    if (!slug) return window.location.pathname + '#blog';
    return window.location.origin + window.location.pathname + '?article=' + encodeURIComponent(slug);
  }
  function blogParseContent(raw) {
    const empty = { v: 1, subtitle: '', language: 'en', tags: [], related_ids: [], seo: {}, blocks: [] };
    if (raw == null || raw === '') return empty;
    if (typeof raw === 'object') return Object.assign(empty, raw, { blocks: raw.blocks || [] });
    const s = String(raw).trim();
    if (!s) return empty;
    if (s.charAt(0) === '{') {
      try {
        const o = JSON.parse(s);
        if (o && typeof o === 'object') return Object.assign(empty, o, { blocks: Array.isArray(o.blocks) ? o.blocks : [] });
      } catch (e) { /* legacy plaintext */ }
    }
    return Object.assign(empty, { blocks: [{ id: blogUid(), type: 'paragraph', text: s }] });
  }
  function blogPlainFromBlocks(blocks) {
    return (blocks || []).map(function (b) {
      if (!b) return '';
      if (b.text) return b.text;
      if (Array.isArray(b.items)) return b.items.join(' ');
      if (b.caption) return b.caption;
      if (b.title) return b.title;
      return '';
    }).join(' ').replace(/\s+/g, ' ').trim();
  }
  function blogReadingMins(post, parsed) {
    const text = ((post && post.excerpt) || '') + ' ' + blogPlainFromBlocks(parsed.blocks);
    const words = text.split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 180) || 1);
  }
  function blogEscape(s) { return sanitize(s == null ? '' : s); }

  function blogRenderTable(b) {
    const rows = Array.isArray(b.rows) ? b.rows : [['']];
    const header = !!b.header;
    let html = '<div class="blog-table-wrap table-wrapper" style="overflow-x:auto;margin:1rem 0;"><table class="blog-article-table" style="width:100%;border-collapse:collapse;font-size:.9rem;">';
    if (b.caption) html += '<caption style="text-align:start;padding:.4rem 0;color:var(--muted);font-size:.82rem;">' + blogEscape(b.caption) + '</caption>';
    rows.forEach(function (row, ri) {
      const cells = Array.isArray(row) ? row : [row];
      const tag = (header && ri === 0) ? 'th' : 'td';
      html += '<tr>';
      cells.forEach(function (c) {
        html += '<' + tag + ' style="border:1px solid var(--border);padding:.45rem .6rem;text-align:start;">' + blogEscape(c) + '</' + tag + '>';
      });
      html += '</tr>';
    });
    html += '</table></div>';
    return html;
  }
  function blogRenderChartPlaceholder(b) {
    const id = 'blogChart_' + (b.id || blogUid());
    const desc = b.description || b.caption || b.title || 'Chart';
    return '<figure class="blog-chart-block" style="margin:1.1rem 0;"><canvas id="' + id + '" height="220" role="img" aria-label="' + blogEscape(desc) + '"></canvas>' +
      (b.caption || b.title ? '<figcaption style="font-size:.8rem;color:var(--muted);margin-top:.4rem;">' + blogEscape(b.caption || b.title) + '</figcaption>' : '') +
      '</figure>';
  }
  function blogMountCharts(root, blocks) {
    if (typeof Chart === 'undefined' || !root) return;
    (blocks || []).forEach(function (b) {
      if (!b || b.type !== 'chart') return;
      const el = root.querySelector('#blogChart_' + b.id);
      if (!el) return;
      if (blogChartInstances[b.id]) { try { blogChartInstances[b.id].destroy(); } catch (e) {} }
      const labels = Array.isArray(b.labels) ? b.labels : [];
      const series = Array.isArray(b.series) && b.series.length ? b.series : [{ label: 'Series', data: [] }];
      const type = ['bar', 'line', 'pie', 'scatter'].indexOf(b.chartType) >= 0 ? b.chartType : 'bar';
      const colors = ['#C8A96B', '#F0C75E', '#142F4A', '#205072', '#4A3B72', '#8A6FBF', '#E8B4A0', '#7FA6C9'];
      const datasets = series.map(function (s, i) {
        const data = type === 'scatter'
          ? (s.data || []).map(function (pt) { return (pt && typeof pt === 'object') ? pt : { x: Number(pt), y: Number(pt) }; })
          : (s.data || []).map(Number);
        return {
          label: s.label || ('Series ' + (i + 1)),
          data: data,
          backgroundColor: type === 'pie' ? colors : colors[i % colors.length],
          borderColor: '#0B1F33',
          borderWidth: type === 'line' ? 2 : 1,
          tension: .35,
          fill: type === 'line'
        };
      });
      blogChartInstances[b.id] = new Chart(el.getContext('2d'), {
        type: type,
        data: { labels: labels, datasets: datasets },
        options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { display: type === 'pie' || series.length > 1 } } }
      });
    });
  }

  function renderBlogBlocks(blocks) {
    return (blocks || []).map(function (b) {
      if (!b || !b.type) return '';
      switch (b.type) {
        case 'h2': return '<h2 style="font-family:var(--ff-display);font-size:1.35rem;margin:1.4rem 0 .6rem;">' + blogEscape(b.text) + '</h2>';
        case 'h3': return '<h3 style="font-family:var(--ff-display);font-size:1.12rem;margin:1.1rem 0 .45rem;">' + blogEscape(b.text) + '</h3>';
        case 'paragraph': return '<p style="line-height:1.75;margin:0 0 .9rem;">' + blogEscape(b.text).replace(/\n/g, '<br>') + '</p>';
        case 'ul':
        case 'ol': {
          const tag = b.type === 'ol' ? 'ol' : 'ul';
          const items = Array.isArray(b.items) ? b.items : String(b.text || '').split('\n');
          return '<' + tag + ' style="margin:0 0 1rem 1.2rem;line-height:1.7;">' + items.map(function (it) { return '<li>' + blogEscape(it) + '</li>'; }).join('') + '</' + tag + '>';
        }
        case 'quote': return '<blockquote style="border-inline-start:3px solid var(--gold);padding:.4rem 0 .4rem 1rem;margin:1rem 0;color:var(--muted);font-style:italic;">' + blogEscape(b.text) + (b.cite ? '<cite style="display:block;margin-top:.4rem;font-size:.82rem;font-style:normal;">' + blogEscape(b.cite) + '</cite>' : '') + '</blockquote>';
        case 'callout': return '<aside class="blog-callout" style="background:var(--cream2);border:1px solid var(--border);border-radius:10px;padding:.85rem 1rem;margin:1rem 0;">' + blogEscape(b.text).replace(/\n/g, '<br>') + '</aside>';
        case 'divider': return '<hr style="border:0;border-top:1px solid var(--border);margin:1.4rem 0;" />';
        case 'image': {
          const src = isSafeHttpUrl(b.src) ? b.src : '';
          if (!src) return '';
          return '<figure style="margin:1.1rem 0;"><img src="' + blogEscape(src) + '" alt="' + blogEscape(b.alt || '') + '" style="width:100%;height:auto;border-radius:10px;" />' +
            (b.caption ? '<figcaption style="font-size:.8rem;color:var(--muted);margin-top:.4rem;">' + blogEscape(b.caption) + '</figcaption>' : '') + '</figure>';
        }
        case 'table': return blogRenderTable(b);
        case 'chart': return blogRenderChartPlaceholder(b);
        case 'embed': {
          const url = isSafeHttpUrl(b.url) ? b.url : '';
          if (!url) return '';
          const yt = (typeof ytEmbedUrl === 'function') ? ytEmbedUrl(url) : null;
          if (yt) return '<div style="margin:1rem 0;aspect-ratio:16/9;"><iframe src="' + blogEscape(yt) + '" style="width:100%;height:100%;border:0;border-radius:10px;" allowfullscreen loading="lazy" title="Video"></iframe></div>';
          return '<p><a href="' + blogEscape(url) + '" target="_blank" rel="noopener">' + blogEscape(b.label || url) + '</a></p>';
        }
        case 'cta': {
          const href = b.href || '#membership';
          const safe = (href.charAt(0) === '#' || isSafeHttpUrl(href) || href.indexOf('?article=') === 0 || href.indexOf(window.location.pathname) === 0) ? href : '#';
          return '<p style="margin:1.2rem 0;"><a class="btn btn-gold" href="' + blogEscape(safe) + '">' + blogEscape(b.label || 'Learn more') + '</a></p>';
        }
        case 'link': {
          const href = b.href || '#';
          const safe = (href.charAt(0) === '#' || href.indexOf('?article=') >= 0 || isSafeHttpUrl(href)) ? href : '#';
          return '<p><a href="' + blogEscape(safe) + '" style="color:var(--gold);font-weight:700;">' + blogEscape(b.label || href) + '</a></p>';
        }
        case 'conclusion': return '<section class="blog-conclusion" style="margin-top:1.6rem;padding-top:1rem;border-top:1px solid var(--border);"><h2 style="font-size:1.15rem;margin-bottom:.5rem;">' + blogEscape(b.heading || 'Conclusion') + '</h2><p style="line-height:1.75;">' + blogEscape(b.text).replace(/\n/g, '<br>') + '</p></section>';
        default: return b.text ? '<p>' + blogEscape(b.text) + '</p>' : '';
      }
    }).join('');
  }

  /* Canonical article renderer — admin preview and public view. */
  function renderBlogArticle(post, relatedPosts) {
    const parsed = blogParseContent(post.content);
    const mins = blogReadingMins(post, parsed);
    const dateStr = post.published_at ? new Date(post.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const lang = parsed.language === 'ur' ? 'ur' : 'en';
    const dir = lang === 'ur' ? 'rtl' : 'ltr';
    const author = post._author_name || '';
    const img = isSafeHttpUrl(post.image_url) ? post.image_url : '';
    const related = (relatedPosts || []).filter(function (r) { return r && r.status === 'published' && r.id !== post.id; });
    let html = '<article class="blog-article" lang="' + lang + '" dir="' + dir + '" style="max-width:760px;margin:0 auto;">';
    html += '<nav class="blog-crumb" style="font-size:.8rem;color:var(--muted);margin-bottom:1rem;"><a href="#blog" onclick="closeArticleView();return true;">Blog</a> / ' + blogEscape(post.category || 'Article') + '</nav>';
    if (post.category) html += '<p class="blog-cat">' + blogEscape(post.category) + '</p>';
    html += '<h1 id="articleViewTitleText" style="font-family:var(--ff-display);font-size:clamp(1.6rem,3vw,2.2rem);line-height:1.25;margin:.2rem 0 .6rem;">' + blogEscape(post.title) + '</h1>';
    if (parsed.subtitle) html += '<p style="font-size:1.05rem;color:var(--muted);margin:0 0 1rem;">' + blogEscape(parsed.subtitle) + '</p>';
    html += '<div class="blog-meta" style="margin-bottom:1.1rem;flex-wrap:wrap;">';
    if (author) html += '<span>' + blogEscape(author) + '</span>';
    if (dateStr) html += '<span><i class="far fa-calendar-alt"></i> ' + dateStr + '</span>';
    html += '<span>' + mins + ' min read</span></div>';
    if (img) html += '<img src="' + blogEscape(img) + '" alt="' + blogEscape(post.title) + '" style="width:100%;height:auto;max-height:420px;object-fit:cover;border-radius:12px;margin-bottom:1.2rem;" />';
    html += '<div class="blog-article-body">' + renderBlogBlocks(parsed.blocks) + '</div>';
    if (related.length) {
      html += '<aside style="margin-top:2rem;padding-top:1rem;border-top:1px solid var(--border);"><h2 style="font-size:1.05rem;margin-bottom:.7rem;">Related</h2><div style="display:grid;gap:.5rem;">';
      related.forEach(function (r) {
        html += '<a href="' + blogEscape(blogArticleUrl(r.slug)) + '" onclick="event.preventDefault();openPublicArticle(\'' + blogEscape(r.slug) + '\');" style="color:var(--navy);font-weight:600;">' + blogEscape(r.title) + '</a>';
      });
      html += '</div></aside>';
    }
    html += '<div style="margin-top:1.4rem;font-size:.85rem;"><a href="' + blogEscape(blogArticleUrl(post.slug)) + '" target="_blank" rel="noopener">Share link</a></div>';
    html += '</article>';
    return { html: html, parsed: parsed };
  }

  function blogApplySeo(post, parsed) {
    const seo = (parsed && parsed.seo) || {};
    const title = seo.title || post.title;
    const desc = seo.description || post.excerpt || '';
    const url = seo.canonical || blogArticleUrl(post.slug);
    const ogTitle = seo.og_title || title;
    const ogDesc = seo.og_description || desc;
    const ogImg = seo.og_image || post.image_url || '';
    document.title = title + ' — SHAOOR';
    var md = document.querySelector('meta[name="description"]');
    if (md) md.setAttribute('content', desc);
    var can = document.querySelector('link[rel="canonical"]');
    if (can) can.setAttribute('href', url);
    var robots = document.querySelector('meta[name="robots"]');
    if (robots) robots.setAttribute('content', seo.noindex ? 'noindex, follow' : 'index, follow');
    function setMeta(sel, attr, val) {
      var el = document.querySelector(sel);
      if (el && val) el.setAttribute(attr, val);
    }
    setMeta('meta[property="og:title"]', 'content', ogTitle);
    setMeta('meta[property="og:description"]', 'content', ogDesc);
    setMeta('meta[property="og:url"]', 'content', url);
    setMeta('meta[name="twitter:title"]', 'content', ogTitle);
    setMeta('meta[name="twitter:description"]', 'content', ogDesc);
    var ld = document.getElementById('blogArticleJsonLd');
    if (!ld) { ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'blogArticleJsonLd'; document.head.appendChild(ld); }
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: desc,
      datePublished: post.published_at || undefined,
      dateModified: post.updated_at || undefined,
      image: ogImg || undefined,
      mainEntityOfPage: url,
      author: { '@type': 'Organization', name: 'SHAOOR | شعور' }
    });
    var bd = document.getElementById('blogBreadcrumbJsonLd');
    if (!bd) { bd = document.createElement('script'); bd.type = 'application/ld+json'; bd.id = 'blogBreadcrumbJsonLd'; document.head.appendChild(bd); }
    bd.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: window.location.origin + window.location.pathname },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: window.location.origin + window.location.pathname + '#blog' },
        { '@type': 'ListItem', position: 3, name: post.title, item: url }
      ]
    });
  }

  async function blogFetchRelated(ids) {
    if (!ids || !ids.length || !sb) return [];
    const { data } = await sb.from('blog_posts').select('id, title, slug, status, excerpt, image_url, published_at').in('id', ids).eq('status', 'published');
    return data || [];
  }
  async function blogFetchAuthor(authorId) {
    if (!authorId || !sb) return '';
    const { data } = await sb.from('profiles').select('full_name').eq('id', authorId).maybeSingle();
    return (data && data.full_name) || '';
  }

  window.closeArticleView = function () {
    closeModal('articleViewModal');
    if (new URLSearchParams(window.location.search).get('article')) {
      history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    }
  };

  window.openPublicArticle = async function (slug, opts) {
    opts = opts || {};
    if (!slug || !sb) return;
    // Public path: database filter on published. Draft preview is staff-only (defense-in-depth;
    // RLS remains the real boundary).
    if (opts.allowDraft) {
      if (!(await requireStaff())) return;
    }
    let q = sb.from('blog_posts').select('id, title, excerpt, content, category, image_url, published_at, updated_at, slug, status, author_id').eq('slug', slug);
    if (!opts.allowDraft) q = q.eq('status', 'published');
    const { data: post, error } = await q.maybeSingle();
    if (error || !post) { showToast('Article not found', 'error'); return; }
    if (post.status !== 'published' && !opts.allowDraft) { showToast('Article not found', 'error'); return; }
    post._author_name = await blogFetchAuthor(post.author_id);
    const parsed = blogParseContent(post.content);
    const related = await blogFetchRelated(parsed.related_ids);
    const painted = renderBlogArticle(post, related);
    const body = document.getElementById('articleViewBody');
    const titleEl = document.getElementById('articleViewTitle');
    if (titleEl) titleEl.textContent = post.title;
    if (body) body.innerHTML = painted.html;
    openModal('articleViewModal');
    blogMountCharts(body, painted.parsed.blocks);
    if (post.status === 'published') blogApplySeo(post, painted.parsed);
    if (!opts.skipUrl) {
      const url = window.location.pathname + '?article=' + encodeURIComponent(slug);
      history.replaceState({ article: slug }, post.title, url);
    }
  };

  window.previewBlogFromEditor = async function () {
    const fake = blogCollectEditorPost();
    fake.status = fake.status || 'draft';
    fake.slug = fake.slug || 'preview';
    fake._author_name = 'Preview';
    const painted = renderBlogArticle(fake, []);
    const body = document.getElementById('articleViewBody');
    const titleEl = document.getElementById('articleViewTitle');
    if (titleEl) titleEl.textContent = 'Preview';
    if (body) body.innerHTML = painted.html;
    openModal('articleViewModal');
    blogMountCharts(body, painted.parsed.blocks);
  };

  function blogDefaultBlock(type) {
    const id = blogUid();
    switch (type) {
      case 'h2': case 'h3': case 'paragraph': case 'quote': case 'callout': return { id: id, type: type, text: '' };
      case 'ul': case 'ol': return { id: id, type: type, items: [''] };
      case 'image': return { id: id, type: 'image', src: '', alt: '', caption: '' };
      case 'table': return { id: id, type: 'table', header: true, caption: '', rows: [['', ''], ['', '']] };
      case 'chart': return { id: id, type: 'chart', chartType: 'bar', title: '', caption: '', labels: ['A', 'B'], series: [{ label: 'Series 1', data: [1, 2] }] };
      case 'embed': return { id: id, type: 'embed', url: '', label: '' };
      case 'cta': return { id: id, type: 'cta', href: '#membership', label: 'Join SHAOOR' };
      case 'link': return { id: id, type: 'link', href: '#blog', label: 'Read more' };
      case 'divider': return { id: id, type: 'divider' };
      case 'conclusion': return { id: id, type: 'conclusion', heading: 'Conclusion', text: '' };
      default: return { id: id, type: 'paragraph', text: '' };
    }
  }

  window.blogAddBlock = function (type) {
    blogSyncEditorFromDom();
    blogEditorBlocks.push(blogDefaultBlock(type));
    blogRenderEditor();
  };
  window.blogRemoveBlock = function (id) {
    blogSyncEditorFromDom();
    blogEditorBlocks = blogEditorBlocks.filter(function (b) { return b.id !== id; });
    blogRenderEditor();
  };
  window.blogMoveBlock = function (id, dir) {
    blogSyncEditorFromDom();
    const i = blogEditorBlocks.findIndex(function (b) { return b.id === id; });
    if (i < 0) return;
    const j = i + dir;
    if (j < 0 || j >= blogEditorBlocks.length) return;
    const t = blogEditorBlocks[i]; blogEditorBlocks[i] = blogEditorBlocks[j]; blogEditorBlocks[j] = t;
    blogRenderEditor();
  };

  function blogSyncEditorFromDom() {
    const host = document.getElementById('blogBlocksEditor');
    if (!host) return;
    blogEditorBlocks.forEach(function (b) {
      const box = host.querySelector('[data-bid="' + b.id + '"]');
      if (!box) return;
      const val = function (name) { const el = box.querySelector('[data-f="' + name + '"]'); return el ? el.value : ''; };
      if (['h2', 'h3', 'paragraph', 'quote', 'callout'].indexOf(b.type) >= 0) b.text = val('text');
      if (b.type === 'quote') b.cite = val('cite');
      if (b.type === 'ul' || b.type === 'ol') b.items = val('text').split('\n');
      if (b.type === 'image') { b.src = val('src'); b.alt = val('alt'); b.caption = val('caption'); }
      if (b.type === 'embed') { b.url = val('url'); b.label = val('label'); }
      if (b.type === 'cta' || b.type === 'link') { b.href = val('href'); b.label = val('label'); }
      if (b.type === 'conclusion') { b.heading = val('heading'); b.text = val('text'); }
      if (b.type === 'table') {
        b.caption = val('caption');
        b.header = box.querySelector('[data-f="header"]') ? box.querySelector('[data-f="header"]').checked : false;
        const grid = box.querySelector('[data-f="grid"]');
        if (grid) b.rows = grid.value.split('\n').map(function (line) { return line.split('|'); });
      }
      if (b.type === 'chart') {
        b.chartType = val('chartType') || 'bar';
        b.title = val('title');
        b.caption = val('caption');
        b.labels = val('labels').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        try { b.series = JSON.parse(val('series') || '[]'); } catch (e) { /* keep */ }
      }
    });
  }

  function blogRenderEditor() {
    const host = document.getElementById('blogBlocksEditor');
    if (!host) return;
    host.innerHTML = blogEditorBlocks.map(function (b) {
      const tools = '<div style="display:flex;gap:.3rem;margin-bottom:.35rem;"><button type="button" class="btn btn-outline" style="padding:.15rem .4rem;font-size:.7rem;" onclick="blogMoveBlock(\'' + b.id + '\',-1)">↑</button><button type="button" class="btn btn-outline" style="padding:.15rem .4rem;font-size:.7rem;" onclick="blogMoveBlock(\'' + b.id + '\',1)">↓</button><button type="button" class="btn btn-outline" style="padding:.15rem .4rem;font-size:.7rem;color:var(--ruby);" onclick="blogRemoveBlock(\'' + b.id + '\')">Remove</button><span style="font-size:.72rem;color:var(--muted);margin-inline-start:.4rem;">' + b.type + '</span></div>';
      let inner = '';
      if (['h2', 'h3', 'paragraph', 'quote', 'callout'].indexOf(b.type) >= 0) {
        inner = '<textarea data-f="text" class="form-input" rows="' + (b.type === 'paragraph' || b.type === 'callout' ? 3 : 2) + '">' + blogEscape(b.text || '') + '</textarea>';
        if (b.type === 'quote') inner += '<input data-f="cite" class="form-input" placeholder="Cite" value="' + blogEscape(b.cite || '') + '" style="margin-top:.35rem;" />';
      } else if (b.type === 'ul' || b.type === 'ol') {
        inner = '<textarea data-f="text" class="form-input" rows="4" placeholder="One item per line">' + blogEscape((b.items || []).join('\n')) + '</textarea>';
      } else if (b.type === 'image') {
        inner = '<input data-f="src" class="form-input" placeholder="Image URL (blog-images)" value="' + blogEscape(b.src || '') + '" /><input data-f="alt" class="form-input" placeholder="Alt text" value="' + blogEscape(b.alt || '') + '" style="margin-top:.35rem;" /><input data-f="caption" class="form-input" placeholder="Caption" value="' + blogEscape(b.caption || '') + '" style="margin-top:.35rem;" /><button type="button" class="btn btn-outline" style="margin-top:.35rem;font-size:.75rem;" onclick="blogUploadBlockImage(\'' + b.id + '\')">Upload to blog-images</button><input type="file" id="blogImgFile_' + b.id + '" accept="image/png,image/jpeg,image/webp" style="display:none;" />';
      } else if (b.type === 'table') {
        const grid = (b.rows || [['']]).map(function (r) { return (Array.isArray(r) ? r : [r]).join('|'); }).join('\n');
        inner = '<input data-f="caption" class="form-input" placeholder="Caption" value="' + blogEscape(b.caption || '') + '" /><label style="display:flex;gap:.4rem;align-items:center;font-size:.8rem;margin:.35rem 0;"><input type="checkbox" data-f="header" ' + (b.header ? 'checked' : '') + ' /> Header row</label><textarea data-f="grid" class="form-input" rows="5" placeholder="cell|cell">' + blogEscape(grid) + '</textarea><p style="font-size:.72rem;color:var(--muted);">Use | between columns, new line = new row.</p>';
      } else if (b.type === 'chart') {
        inner = '<select data-f="chartType" class="form-input"><option value="bar"' + (b.chartType === 'bar' ? ' selected' : '') + '>Bar</option><option value="line"' + (b.chartType === 'line' ? ' selected' : '') + '>Line</option><option value="pie"' + (b.chartType === 'pie' ? ' selected' : '') + '>Pie</option><option value="scatter"' + (b.chartType === 'scatter' ? ' selected' : '') + '>Scatter</option></select>' +
          '<input data-f="title" class="form-input" placeholder="Title" value="' + blogEscape(b.title || '') + '" style="margin-top:.35rem;" />' +
          '<input data-f="caption" class="form-input" placeholder="Caption / accessible description" value="' + blogEscape(b.caption || '') + '" style="margin-top:.35rem;" />' +
          '<input data-f="labels" class="form-input" placeholder="Labels comma-separated" value="' + blogEscape((b.labels || []).join(', ')) + '" style="margin-top:.35rem;" />' +
          '<textarea data-f="series" class="form-input" rows="3" style="margin-top:.35rem;" placeholder=\'[{"label":"Series 1","data":[1,2]}]\'>' + blogEscape(JSON.stringify(b.series || [])) + '</textarea>';
      } else if (b.type === 'embed') {
        inner = '<input data-f="url" class="form-input" placeholder="https://…" value="' + blogEscape(b.url || '') + '" /><input data-f="label" class="form-input" placeholder="Label" value="' + blogEscape(b.label || '') + '" style="margin-top:.35rem;" />';
      } else if (b.type === 'cta' || b.type === 'link') {
        inner = '<input data-f="label" class="form-input" placeholder="Label" value="' + blogEscape(b.label || '') + '" /><input data-f="href" class="form-input" placeholder="#membership or ?article=slug" value="' + blogEscape(b.href || '') + '" style="margin-top:.35rem;" />' +
          (b.type === 'link' ? '<button type="button" class="btn btn-outline" style="margin-top:.35rem;font-size:.75rem;" onclick="blogPickInternalLink(\'' + b.id + '\')">Insert internal link</button>' : '');
      } else if (b.type === 'conclusion') {
        inner = '<input data-f="heading" class="form-input" value="' + blogEscape(b.heading || 'Conclusion') + '" /><textarea data-f="text" class="form-input" rows="3" style="margin-top:.35rem;">' + blogEscape(b.text || '') + '</textarea>';
      } else if (b.type === 'divider') {
        inner = '<p style="color:var(--muted);font-size:.8rem;">Divider</p>';
      }
      return '<div data-bid="' + b.id + '" style="border:1px solid var(--border);border-radius:10px;padding:.65rem;">' + tools + inner + '</div>';
    }).join('');
  }

  window.blogUploadBlockImage = async function (id) {
    const input = document.getElementById('blogImgFile_' + id);
    if (!input) return;
    input.onchange = async function () {
      const file = input.files && input.files[0];
      if (!file) return;
      if (!(await requireStaff())) return;
      const ext = file.name.split('.').pop();
      const filePath = 'blog/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
      const { error } = await sb.storage.from('blog-images').upload(filePath, file);
      if (error) { showToast('Upload failed: ' + error.message, 'error'); return; }
      const { data: publicUrlData } = sb.storage.from('blog-images').getPublicUrl(filePath);
      blogSyncEditorFromDom();
      const b = blogEditorBlocks.find(function (x) { return x.id === id; });
      if (b) b.src = publicUrlData.publicUrl;
      blogRenderEditor();
    };
    input.click();
  };

  window.blogPickInternalLink = async function (blockId) {
    if (!sb) return;
    const [{ data: posts }, { data: courses }, { data: events }] = await Promise.all([
      sb.from('blog_posts').select('id, title, slug, status').eq('status', 'published').order('published_at', { ascending: false }).limit(30),
      sb.from('courses').select('id, title, slug, status').eq('status', 'published').order('title').limit(30),
      sb.from('events').select('id, title, status').order('event_date', { ascending: false }).limit(30)
    ]);
    const choices = [];
    BLOG_PUBLIC_SECTIONS.forEach(function (s) { choices.push(s.label + ' → ' + s.href); });
    (posts || []).forEach(function (p) { choices.push('Article: ' + p.title + ' → ?article=' + p.slug); });
    (courses || []).forEach(function (c) { choices.push('Course: ' + c.title + ' → #courses'); });
    (events || []).forEach(function (e) { choices.push('Event: ' + e.title + ' → #events'); });
    const pick = window.prompt('Internal link (copy the part after →):\n' + choices.slice(0, 40).join('\n'));
    if (!pick) return;
    const href = pick.indexOf('→') >= 0 ? pick.split('→').pop().trim() : pick.trim();
    blogSyncEditorFromDom();
    const b = blogEditorBlocks.find(function (x) { return x.id === blockId; });
    if (b) { b.href = href; if (!b.label) b.label = pick.split('→')[0].trim(); }
    blogRenderEditor();
  };

  async function blogFillRelatedPicker(selectedIds) {
    const host = document.getElementById('blogRelatedPicker');
    if (!host || !sb) return;
    const { data } = await sb.from('blog_posts').select('id, title, status, slug').eq('status', 'published').order('created_at', { ascending: false }).limit(40);
    const sel = selectedIds || [];
    host.innerHTML = (data || []).map(function (p) {
      return '<label style="display:flex;gap:.45rem;align-items:center;font-size:.82rem;padding:.2rem 0;"><input type="checkbox" class="blog-rel" value="' + p.id + '" ' + (sel.indexOf(p.id) >= 0 ? 'checked' : '') + ' /> ' + blogEscape(p.title) + '</label>';
    }).join('') || '<span style="color:var(--muted);font-size:.8rem;">No published posts yet</span>';
  }

  function blogCollectEditorPost() {
    blogSyncEditorFromDom();
    const related = Array.from(document.querySelectorAll('.blog-rel:checked')).map(function (el) { return el.value; });
    const parsed = {
      v: 1,
      subtitle: (document.getElementById('blogSubtitle') || {}).value || '',
      language: (document.getElementById('blogLanguage') || {}).value || 'en',
      tags: String((document.getElementById('blogTags') || {}).value || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
      related_ids: related,
      seo: {
        title: (document.getElementById('blogSeoTitle') || {}).value || '',
        description: (document.getElementById('blogSeoDesc') || {}).value || '',
        canonical: (document.getElementById('blogCanonical') || {}).value || '',
        og_title: (document.getElementById('blogOgTitle') || {}).value || '',
        og_description: (document.getElementById('blogOgDesc') || {}).value || '',
        og_image: (document.getElementById('blogOgImage') || {}).value || '',
        noindex: !!(document.getElementById('blogNoindex') && document.getElementById('blogNoindex').checked)
      },
      blocks: blogEditorBlocks
    };
    return {
      title: (document.getElementById('blogTitle') || {}).value || '',
      excerpt: (document.getElementById('blogExcerpt') || {}).value || '',
      category: (document.getElementById('blogCategory') || {}).value || '',
      status: (document.getElementById('blogStatus') || {}).value || 'draft',
      slug: (document.getElementById('blogSlug') || {}).value || '',
      image_url: (document.getElementById('blogExistingImageUrl') || {}).value || '',
      content: JSON.stringify(parsed)
    };
  }

  function resetBlogImageUI() {
    blogSelectedImageFile = null;
    const u = document.getElementById('blogExistingImageUrl'); if (u) u.value = '';
    const preview = document.getElementById('blogImagePreview');
    const ph = document.getElementById('blogImagePlaceholder');
    const st = document.getElementById('blogImageStatus');
    const inp = document.getElementById('blogImageInput');
    if (preview) { preview.style.display = 'none'; preview.src = ''; }
    if (ph) ph.style.display = 'block';
    if (st) st.textContent = '';
    if (inp) inp.value = '';
  }

  window.openCreateBlogModal = async function () {
    if (!(await requireStaff())) return;
    document.getElementById('blogForm').reset();
    document.getElementById('blogEditId').value = '';
    document.getElementById('blogModalTitle').textContent = 'نئی Post';
    document.getElementById('blogStatus').value = 'draft';
    resetBlogImageUI();
    blogEditorBlocks = [blogDefaultBlock('paragraph')];
    blogRenderEditor();
    await blogFillRelatedPicker([]);
    openModal('blogModal');
  };

  window.editBlogPost = async function (id) {
    if (!(await requireStaff())) return;
    const { data: post, error } = await sb.from('blog_posts').select('*').eq('id', id).single();
    if (error || !post) { showToast('Post نہیں ملی: ' + (error?.message || ''), 'error'); return; }
    document.getElementById('blogForm').reset();
    resetBlogImageUI();
    document.getElementById('blogEditId').value = post.id;
    document.getElementById('blogModalTitle').textContent = 'Post میں ترمیم';
    document.getElementById('blogTitle').value = post.title || '';
    document.getElementById('blogCategory').value = post.category || '';
    document.getElementById('blogExcerpt').value = post.excerpt || '';
    document.getElementById('blogStatus').value = post.status || 'draft';
    document.getElementById('blogSlug').value = post.slug || '';
    const parsed = blogParseContent(post.content);
    document.getElementById('blogSubtitle').value = parsed.subtitle || '';
    document.getElementById('blogLanguage').value = parsed.language || 'en';
    document.getElementById('blogTags').value = (parsed.tags || []).join(', ');
    const seo = parsed.seo || {};
    document.getElementById('blogSeoTitle').value = seo.title || '';
    document.getElementById('blogSeoDesc').value = seo.description || '';
    document.getElementById('blogCanonical').value = seo.canonical || '';
    document.getElementById('blogOgTitle').value = seo.og_title || '';
    document.getElementById('blogOgDesc').value = seo.og_description || '';
    document.getElementById('blogOgImage').value = seo.og_image || '';
    document.getElementById('blogNoindex').checked = !!seo.noindex;
    blogEditorBlocks = (parsed.blocks && parsed.blocks.length) ? parsed.blocks.map(function (b) { return Object.assign({ id: b.id || blogUid() }, b); }) : [blogDefaultBlock('paragraph')];
    blogRenderEditor();
    await blogFillRelatedPicker(parsed.related_ids || []);
    if (post.image_url) {
      document.getElementById('blogExistingImageUrl').value = post.image_url;
      document.getElementById('blogImagePreview').src = post.image_url;
      document.getElementById('blogImagePreview').style.display = 'block';
      document.getElementById('blogImagePlaceholder').style.display = 'none';
    }
    openModal('blogModal');
  };

  window.addEventListener('DOMContentLoaded', () => {
    const imgInput = document.getElementById('blogImageInput');
    if (imgInput) {
      imgInput.addEventListener('change', () => {
        const file = imgInput.files[0];
        if (!file) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
          showToast('صرف PNG, JPG, یا WEBP تصویر منتخب کریں', 'error');
          imgInput.value = '';
          return;
        }
        if (file.size > 3 * 1024 * 1024) {
          showToast('تصویر 3MB سے چھوٹی ہونی چاہیے', 'error');
          imgInput.value = '';
          return;
        }
        blogSelectedImageFile = file;
        const reader = new FileReader();
        reader.onload = e => {
          document.getElementById('blogImagePreview').src = e.target.result;
          document.getElementById('blogImagePreview').style.display = 'block';
          document.getElementById('blogImagePlaceholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
        document.getElementById('blogImageStatus').textContent = 'نئی تصویر منتخب ہو گئی — محفوظ کرنے پر اپلوڈ ہوگی۔';
      });
    }
  });

  function slugify(text) {
    return text.toString().toLowerCase().trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  window.addEventListener('DOMContentLoaded', () => secureSubmit('blogForm', async frm => {
    if (!(await requireStaff())) return;
    const editId = frm.querySelector('#blogEditId').value;
    const collected = blogCollectEditorPost();
    const title = collected.title.trim();
    const category = collected.category.trim() || null;
    const excerpt = collected.excerpt.trim() || null;
    const content = collected.content;
    const status = collected.status;
    let slug = (document.getElementById('blogSlug').value || '').trim();

    if (!title) { showToast('براہ کرم عنوان درج کریں', 'error'); return; }

    const statusEl = document.getElementById('blogImageStatus');
    let image_url = document.getElementById('blogExistingImageUrl').value || null;

    if (blogSelectedImageFile) {
      if (statusEl) statusEl.textContent = 'تصویر اپلوڈ ہو رہی ہے…';
      const ext = blogSelectedImageFile.name.split('.').pop();
      const filePath = 'blog/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
      const { error: uploadError } = await sb.storage.from('blog-images').upload(filePath, blogSelectedImageFile);
      if (uploadError) {
        showToast('تصویر اپلوڈ ناکام: ' + uploadError.message, 'error');
        if (statusEl) statusEl.textContent = '';
        return;
      }
      const { data: publicUrlData } = sb.storage.from('blog-images').getPublicUrl(filePath);
      image_url = publicUrlData.publicUrl;
    }

    const payload = { title, category, excerpt, content, status, image_url };

    let error;
    if (editId) {
      if (slug) payload.slug = slug;
      ({ error } = await sb.from('blog_posts').update(payload).eq('id', editId));
    } else {
      const { data: userData } = await sb.auth.getUser();
      payload.slug = slug || (slugify(title) + '-' + Date.now().toString(36));
      payload.author_id = userData?.user?.id || null;
      if (status === 'published') payload.published_at = new Date().toISOString();
      ({ error } = await sb.from('blog_posts').insert(payload));
    }

    if (editId && status === 'published') {
      await sb.from('blog_posts')
        .update({ published_at: new Date().toISOString() })
        .eq('id', editId)
        .is('published_at', null);
    }

    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }

    showToast('✓ Post محفوظ ہو گئی!');
    closeModal('blogModal');
    loadBlogAdmin();
    if (typeof loadPublicBlog === 'function') loadPublicBlog();
  }));

  window.deleteBlogPost = async function (id) {
    if (!(await requireStaff())) return;
    if (!confirm('کیا یہ Post حذف کرنا چاہتے ہیں؟')) return;
    const { data, error } = await sb.from('blog_posts').delete().eq('id', id).select('id');
    if (error) { showToast('حذف نہیں ہو سکی: ' + error.message, 'error'); return; }
    if (!data || data.length === 0) { showToast('حذف نہیں ہو سکی — اجازت (RLS policy) موجود نہیں یا ریکارڈ پہلے ہی موجود نہیں۔', 'error'); return; }
    showToast('Post حذف کر دی گئی۔');
    loadBlogAdmin();
    if (typeof loadPublicBlog === 'function') loadPublicBlog();
  };

  window.loadBlogAdmin = async function () {
    const tbody = document.getElementById('blogAdminBody');
    if (!tbody || !sb) return;
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;"><i class="fas fa-spinner fa-spin"></i> لوڈ ہو رہا ہے…</td></tr>';

    let data, error;
    try {
      const res = await sb.from('blog_posts').select('id, title, category, image_url, status, published_at, slug').order('created_at', { ascending: false });
      data = res.data; error = res.error;
    } catch (e) { error = { message: e.message }; }

    if (error) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--ruby);padding:1.5rem;">لوڈ ناکام: ${sanitize(error.message)}</td></tr>`;
      return;
    }
    const catSel = document.getElementById('blogAdminCategory');
    if (catSel && !(catSel.dataset.filled)) {
      const cats = Array.from(new Set((data || []).map(function (p) { return p.category; }).filter(Boolean)));
      cats.forEach(function (c) {
        const o = document.createElement('option'); o.value = c; o.textContent = c; catSel.appendChild(o);
      });
      catSel.dataset.filled = '1';
    }
    const q = ((document.getElementById('blogAdminSearch') || {}).value || '').toLowerCase();
    const stF = (document.getElementById('blogAdminStatus') || {}).value || '';
    const catF = (document.getElementById('blogAdminCategory') || {}).value || '';
    data = (data || []).filter(function (p) {
      if (stF && p.status !== stF) return false;
      if (catF && p.category !== catF) return false;
      if (q && !(String(p.title || '') + ' ' + String(p.category || '')).toLowerCase().includes(q)) return false;
      return true;
    });
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:1.5rem;">کوئی Post نہیں ملی۔</td></tr>';
      return;
    }

    const statusLabel = { draft: 'Draft', published: 'Published', archived: 'Archived' };
    const statusClass = { draft: 'sp-pending', published: 'sp-active', archived: 'sp-listed' };

    tbody.innerHTML = data.map(p => {
      const dateStr = p.published_at ? new Date(p.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
      const st = (p.status || 'draft');
      const thumb = p.image_url
        ? `<img src="${sanitize(p.image_url)}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;" />`
        : `<div style="width:50px;height:50px;border-radius:6px;background:var(--cream2);display:flex;align-items:center;justify-content:center;color:var(--muted);"><i class="fas fa-image"></i></div>`;
      return `
        <tr>
          <td>${thumb}</td>
          <td style="font-weight:600;">${sanitize(p.title || '—')}</td>
          <td>${sanitize(p.category || '—')}</td>
          <td><span class="status-pill ${statusClass[st] || 'sp-pending'}">${statusLabel[st] || st}</span></td>
          <td>${dateStr}</td>
          <td>
            <button onclick="editBlogPost('${p.id}')" class="btn btn-outline" style="font-size:.75rem;padding:.3rem .7rem;margin-inline-end:.4rem;">Edit</button>
            <button onclick="openPublicArticle('${sanitize(p.slug || '')}', {allowDraft:true})" class="btn btn-outline" style="font-size:.75rem;padding:.3rem .7rem;margin-inline-end:.4rem;">Preview</button>
            <button onclick="deleteBlogPost('${p.id}')" class="btn btn-outline" style="font-size:.75rem;padding:.3rem .7rem;color:var(--ruby);border-color:var(--ruby);">Delete</button>
          </td>
        </tr>`;
    }).join('');
  };


  let mediaLinkSelectedThumbFile = null;

  function resetMediaLinkThumbUI() {
    mediaLinkSelectedThumbFile = null;
    document.getElementById('mlExistingThumbUrl').value = '';
    document.getElementById('mlThumbPreview').style.display = 'none';
    document.getElementById('mlThumbPreview').src = '';
    document.getElementById('mlThumbPlaceholder').style.display = 'block';
    document.getElementById('mlThumbStatus').textContent = '';
    document.getElementById('mlThumbInput').value = '';
  }

  window.addEventListener('DOMContentLoaded', () => {
    const thumbInput = document.getElementById('mlThumbInput');
    if (thumbInput) {
      thumbInput.addEventListener('change', () => {
        const file = thumbInput.files[0];
        if (!file) return;
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
          showToast('صرف PNG, JPG, یا WEBP تصویر منتخب کریں', 'error');
          thumbInput.value = '';
          return;
        }
        if (file.size > 3 * 1024 * 1024) {
          showToast('تصویر 3MB سے چھوٹی ہونی چاہیے', 'error');
          thumbInput.value = '';
          return;
        }
        mediaLinkSelectedThumbFile = file;
        const reader = new FileReader();
        reader.onload = e => {
          document.getElementById('mlThumbPreview').src = e.target.result;
          document.getElementById('mlThumbPreview').style.display = 'block';
          document.getElementById('mlThumbPlaceholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
        document.getElementById('mlThumbStatus').textContent = 'نئی تھمب نیل منتخب ہو گئی — محفوظ کرنے پر اپلوڈ ہوگی۔';
      });
    }
  });

  window.openCreateMediaLinkModal = function() {
    document.getElementById('mediaLinkForm').reset();
    resetMediaLinkThumbUI();
    document.getElementById('mlEditId').value = '';
    document.getElementById('mediaLinkModalTitle').textContent = 'نیا Media Link';
    document.getElementById('mlStatus').value = 'published';
    document.getElementById('mlOrder').value = '0';
    openModal('mediaLinkModal');
  };

  window.editMediaLink = async function(id) {
    const { data: link, error } = await sb.from('media_links').select('*').eq('id', id).single();
    if (error || !link) { showToast('Link نہیں ملا: ' + (error?.message || ''), 'error'); return; }
    document.getElementById('mediaLinkForm').reset();
    resetMediaLinkThumbUI();
    document.getElementById('mlEditId').value = link.id;
    document.getElementById('mediaLinkModalTitle').textContent = 'Media Link میں ترمیم';
    document.getElementById('mlPlatform').value = link.platform || 'youtube';
    document.getElementById('mlTitle').value = link.title || '';
    document.getElementById('mlUrl').value = link.url || '';
    document.getElementById('mlOrder').value = link.sort_order ?? 0;
    document.getElementById('mlStatus').value = link.status || 'published';
    if (link.thumbnail_url) {
      document.getElementById('mlExistingThumbUrl').value = link.thumbnail_url;
      document.getElementById('mlThumbPreview').src = link.thumbnail_url;
      document.getElementById('mlThumbPreview').style.display = 'block';
      document.getElementById('mlThumbPlaceholder').style.display = 'none';
    }
    openModal('mediaLinkModal');
  };

  window.deleteMediaLink = async function(id) {
    if (!confirm('کیا یہ Media Link حذف کرنا چاہتے ہیں؟')) return;
    const { data, error } = await sb.from('media_links').delete().eq('id', id).select('id');
    if (error) { showToast('حذف نہیں ہو سکا: ' + error.message, 'error'); return; }
    if (!data || data.length === 0) { showToast('حذف نہیں ہو سکا — اجازت (RLS policy) موجود نہیں یا ریکارڈ پہلے ہی موجود نہیں۔', 'error'); return; }
    showToast('Link حذف کر دیا گیا۔');
    loadMediaLinksAdmin();
  };

  window.addEventListener('DOMContentLoaded', () => secureSubmit('mediaLinkForm', async frm => {
    const editId = frm.querySelector('#mlEditId').value;
    const platform = frm.querySelector('#mlPlatform').value;
    const title = frm.querySelector('#mlTitle').value.trim();
    const url = frm.querySelector('#mlUrl').value.trim();
    const sort_order = parseInt(frm.querySelector('#mlOrder').value, 10) || 0;
    const status = frm.querySelector('#mlStatus').value;

    if (!title || !url) { showToast('براہ کرم عنوان اور Link درج کریں', 'error'); return; }

    const thumbStatusEl = document.getElementById('mlThumbStatus');
    let thumbnail_url = document.getElementById('mlExistingThumbUrl').value || null;

    if (mediaLinkSelectedThumbFile) {
      if (thumbStatusEl) thumbStatusEl.textContent = 'تھمب نیل اپلوڈ ہو رہی ہے…';
      const ext = mediaLinkSelectedThumbFile.name.split('.').pop();
      const filePath = 'media-links/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
      const { error: uploadError } = await sb.storage.from('shaoor-uploads').upload(filePath, mediaLinkSelectedThumbFile);
      if (uploadError) {
        showToast('تھمب نیل اپلوڈ ناکام: ' + uploadError.message, 'error');
        if (thumbStatusEl) thumbStatusEl.textContent = '';
        return;
      }
      const { data: publicUrlData } = sb.storage.from('shaoor-uploads').getPublicUrl(filePath);
      thumbnail_url = publicUrlData.publicUrl;
    }

    const payload = { platform, title, url, sort_order, status, thumbnail_url };
    let error;
    if (editId) {
      ({ error } = await sb.from('media_links').update(payload).eq('id', editId));
    } else {
      ({ error } = await sb.from('media_links').insert(payload));
    }

    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }

    showToast('✓ Media Link محفوظ ہو گیا!');
    closeModal('mediaLinkModal');
    loadMediaLinksAdmin();
  }));

  window.loadMediaLinksAdmin = async function() {
    const tbody = document.getElementById('mediaLinksAdminBody');
    if (!tbody || !sb) return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.5rem;"><i class="fas fa-spinner fa-spin"></i> لوڈ ہو رہا ہے…</td></tr>';

    let data, error;
    try {
      const res = await sb.from('media_links').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: false });
      data = res.data; error = res.error;
    } catch(e) { error = { message: e.message }; }

    if (error) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--ruby);padding:1.5rem;">لوڈ ناکام: ${sanitize(error.message)}</td></tr>`;
      return;
    }
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:1.5rem;">کوئی Media Link نہیں ملا۔</td></tr>';
      return;
    }

    const platformIcon = {
      youtube: '<i class="fab fa-youtube" style="color:#FF0000;"></i> YouTube',
      facebook: '<i class="fab fa-facebook" style="color:#1877F2;"></i> Facebook',
      instagram: '<i class="fab fa-instagram" style="color:#C13584;"></i> Instagram',
      tiktok: '<i class="fab fa-tiktok" style="color:#000;"></i> TikTok',
      twitter: '<i class="fab fa-x-twitter" style="color:#000;"></i> Twitter / X',
      linkedin: '<i class="fab fa-linkedin" style="color:#0A66C2;"></i> LinkedIn',
      other: '<i class="fas fa-link"></i> دیگر'
    };
    const statusLabel = { draft: 'Draft', published: 'Published' };
    const statusClass = { draft: 'sp-pending', published: 'sp-active' };

    tbody.innerHTML = data.map(l => {
      const st = (l.status || 'published');
      const thumb = l.thumbnail_url
        ? `<img src="${sanitize(l.thumbnail_url)}" style="width:50px;height:50px;object-fit:cover;border-radius:6px;" />`
        : `<div style="width:50px;height:50px;border-radius:6px;background:var(--cream2);display:flex;align-items:center;justify-content:center;color:var(--muted);"><i class="fas fa-image"></i></div>`;
      return `
        <tr>
          <td>${thumb}</td>
          <td>${platformIcon[l.platform] || sanitize(l.platform || '—')}</td>
          <td style="font-weight:600;">${sanitize(l.title || '—')}</td>
          <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><a href="${sanitize(l.url)}" target="_blank" rel="noopener">${sanitize(l.url || '—')}</a></td>
          <td>${l.sort_order ?? 0}</td>
          <td><span class="status-pill ${statusClass[st] || 'sp-active'}">${statusLabel[st] || st}</span></td>
          <td>
            <button onclick="editMediaLink('${l.id}')" class="btn btn-outline" style="font-size:.75rem;padding:.3rem .7rem;margin-inline-end:.4rem;">Edit</button>
            <button onclick="deleteMediaLink('${l.id}')" class="btn btn-outline" style="font-size:.75rem;padding:.3rem .7rem;color:var(--ruby);border-color:var(--ruby);">Delete</button>
          </td>
        </tr>`;
    }).join('');
  };

  /* ══════════════ CHAPTER MANAGE: societies + cabinet ══════════════ */
  async function openChapterManage(chapterId, chapterName) {
    document.getElementById('cmChapterId').value = chapterId;
    document.getElementById('chapterManageTitle').textContent = 'Chapter Manage — ' + chapterName;
    openModal('chapterManageModal');
    await loadChapterSocieties(chapterId);
    await loadChapterCabinet(chapterId);
  }

  /* -- Societies in this chapter -- */
  async function loadChapterSocieties(chapterId) {
    const list = document.getElementById('cmSocietiesList');
    const addSel = document.getElementById('cmAddSocietySelect');
    const cabinetSocietySel = document.getElementById('cmCabinetSociety');
    list.innerHTML = '<div style="color:var(--muted);font-size:.85rem;">لوڈ ہو رہا ہے…</div>';

    const { data: links, error } = await sb
      .from('chapter_societies')
      .select('id, society_id, societies(name)')
      .eq('chapter_id', chapterId);

    if (error) { list.innerHTML = '<div style="color:var(--ruby);font-size:.85rem;">خرابی: ' + sanitize(error.message) + '</div>'; return; }

    if (!links || links.length === 0) {
      list.innerHTML = '<div style="color:var(--muted);font-size:.85rem;">ابھی کوئی society شامل نہیں۔</div>';
    } else {
      list.innerHTML = links.map(l => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:var(--cream2);padding:.5rem .75rem;border-radius:8px;">
          <span style="font-size:.9rem;">${sanitize(l.societies?.name || 'Unknown')}</span>
          <button class="art-buy" style="padding:.25rem .6rem;font-size:.72rem;background:var(--ruby);" onclick="removeSocietyFromChapter('${l.id}', '${chapterId}')">ہٹائیں</button>
        </div>`).join('');
    }

    // populate "add society" dropdown with societies not yet linked
    const { data: allSocieties } = await sb.from('societies').select('id, name').order('name');
    const linkedIds = new Set((links || []).map(l => l.society_id));
    addSel.innerHTML = '<option value="">-- Society منتخب کریں --</option>';
    cabinetSocietySel.innerHTML = '<option value="">-- Society --</option>';
    (allSocieties || []).forEach(s => {
      if (!linkedIds.has(s.id)) {
        const opt = document.createElement('option');
        opt.value = s.id; opt.textContent = s.name;
        addSel.appendChild(opt);
      }
      // cabinet dropdown should only offer societies already active in this chapter
      if (linkedIds.has(s.id)) {
        const opt2 = document.createElement('option');
        opt2.value = s.id; opt2.textContent = s.name;
        cabinetSocietySel.appendChild(opt2);
      }
    });
  }

  async function addSocietyToChapter() {
    const chapterId = document.getElementById('cmChapterId').value;
    const societyId = document.getElementById('cmAddSocietySelect').value;
    if (!societyId) { showToast('براہ کرم ایک Society منتخب کریں', 'error'); return; }

    const { error } = await sb.from('chapter_societies').insert({ chapter_id: chapterId, society_id: societyId, status: 'active' });
    if (error) { showToast('شامل نہیں ہو سکی: ' + error.message, 'error'); return; }

    showToast('✓ Society شامل کر دی گئی!');
    await loadChapterSocieties(chapterId);
    loadChaptersAdmin();
  }

  async function removeSocietyFromChapter(linkId, chapterId) {
    if (!confirm('کیا اس Society کو اس Chapter سے ہٹانا چاہتے ہیں؟')) return;
    const { error } = await sb.from('chapter_societies').delete().eq('id', linkId);
    if (error) { showToast('ہٹا نہیں سکے: ' + error.message, 'error'); return; }
    showToast('Society ہٹا دی گئی۔');
    await loadChapterSocieties(chapterId);
    await loadChapterCabinet(chapterId);
    loadChaptersAdmin();
  }

  /* -- Cabinet seats -- */
  async function loadChapterCabinet(chapterId) {
    const list = document.getElementById('cmCabinetList');
    list.innerHTML = '<div style="color:var(--muted);font-size:.85rem;">لوڈ ہو رہا ہے…</div>';

    const { data: seats, error } = await sb
      .from('chapter_society_cabinet')
      .select('id, role, status, member_id, society_id, societies(name), profiles(full_name)')
      .eq('chapter_id', chapterId)
      .order('role');

    if (error) { list.innerHTML = '<div style="color:var(--ruby);font-size:.85rem;">خرابی: ' + sanitize(error.message) + '</div>'; return; }

    if (!seats || seats.length === 0) {
      list.innerHTML = '<div style="color:var(--muted);font-size:.85rem;">ابھی کوئی cabinet نشست نہیں۔</div>';
    } else {
      list.innerHTML = seats.map(s => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:var(--cream2);padding:.5rem .75rem;border-radius:8px;">
          <span style="font-size:.85rem;"><strong>${sanitize(s.societies?.name || '—')}</strong> — ${sanitize(s.role)}: ${sanitize(s.profiles?.full_name || 'خالی نشست')}</span>
          <span style="display:flex;gap:.4rem;">
            ${s.member_id ? `<button class="art-buy" style="padding:.25rem .6rem;font-size:.72rem;background:var(--gold);color:var(--navy);" onclick="openDocumentForLeadership('${s.member_id}', '${sanitize(s.role).replace(/'/g, "\\'")}', '${s.society_id || ''}', '${chapterId}')"><i class="fas fa-file-signature"></i></button>` : ''}
            <button class="art-buy" style="padding:.25rem .6rem;font-size:.72rem;background:var(--ruby);" onclick="removeCabinetSeat('${s.id}', '${chapterId}')">ہٹائیں</button>
          </span>
        </div>`).join('');
    }

    await populatePeopleDatalist('cmCabinetMember', 'cmCabinetMemberList');
  }

  async function addCabinetSeat() {
    const chapterId = document.getElementById('cmChapterId').value;
    const societyId = document.getElementById('cmCabinetSociety').value;
    const role = document.getElementById('cmCabinetRole').value.trim();
    const memberId = resolvePersonId('cmCabinetMember');

    if (!societyId) { showToast('پہلے Society منتخب کریں', 'error'); return; }
    if (!role) { showToast('عہدہ درج کریں', 'error'); return; }

    const { error } = await sb.from('chapter_society_cabinet').insert({
      chapter_id: chapterId, society_id: societyId, role, member_id: memberId, status: 'active'
    });
    if (error) { showToast('نشست شامل نہیں ہو سکی: ' + error.message, 'error'); return; }

    showToast('✓ کابینہ نشست شامل ہو گئی!');
    document.getElementById('cmCabinetRole').value = '';
    await loadChapterCabinet(chapterId);
  }

  async function removeCabinetSeat(seatId, chapterId) {
    if (!confirm('کیا یہ نشست ہٹانا چاہتے ہیں؟')) return;
    const { error } = await sb.from('chapter_society_cabinet').delete().eq('id', seatId);
    if (error) { showToast('ہٹا نہیں سکے: ' + error.message, 'error'); return; }
    showToast('نشست ہٹا دی گئی۔');
    await loadChapterCabinet(chapterId);
  }

  /* ── Central Cabinet (Public) ── */
  async function loadCentralCabinetPublic() {
    const grid = document.getElementById('centralCabinetPublicGrid');
    if (!grid) return;
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;color:var(--muted);padding:1.5rem;">لوڈ ہو رہا ہے…</div>';

    const { data: seats, error } = await sb
      .from('cabinet_members')
      .select('position, bio, photo_url, profiles(full_name, avatar_url)')
      .is('chapter_id', null)
      .is('society_id', null)
      .order('position');

    if (error || !seats || seats.length === 0) {
      grid.innerHTML = '<div class="cabinet-empty"><i class="fas fa-users" style="font-size:1.4rem;color:var(--gold);"></i><strong>ابھی کوئی نشست شامل نہیں کی گئی۔</strong><span>Central Cabinet appointments will appear here when published by SHAOOR.</span></div>';
      return;
    }

    grid.innerHTML = seats.map(s => {
      const name = s.profiles ? sanitize(s.profiles.full_name) : '—';
      const photo = s.photo_url || (s.profiles && s.profiles.avatar_url ? s.profiles.avatar_url : '');
      const imgHtml = photo
        ? '<img src="' + sanitize(photo) + '" class="cab-photo" alt="' + name + '" />'
        : '<div class="cab-photo" style="display:flex;align-items:center;justify-content:center;background:var(--cream2);color:var(--muted);"><i class="fas fa-user" style="font-size:1.5rem;"></i></div>';
      return '<div class="cab-card">' +
        imgHtml +
        '<div class="cab-name">' + name + '</div>' +
        '<div class="cab-role">' + sanitize(s.position || '') + '</div>' +
        (s.bio ? '<div class="cab-bio">' + sanitize(s.bio) + '</div>' : '') +
      '</div>';
    }).join('');
  }
  window.addEventListener('DOMContentLoaded', loadCentralCabinetPublic);

  /* ── Public Chapters Section (fully database-driven, no dummy data) ── */
  const CHAPTER_PROVINCES = ['punjab', 'kpk', 'sindh', 'balochistan', 'kashmir', 'gilgit'];

  async function loadPublicChaptersData() {
    const { data: chapters, error } = await sb.from('chapters').select('*');
    if (error) { console.error('chapters load error', error); return; }
    function chapterProvinceKey(value) {
      const raw = String(value || '').trim().toLowerCase();
      if (!raw) return '';
      if (raw === 'punjab') return 'punjab';
      if (raw === 'kpk' || raw === 'khyber pakhtunkhwa' || raw === 'khyber-pakhtunkhwa') return 'kpk';
      if (raw === 'sindh') return 'sindh';
      if (raw === 'balochistan') return 'balochistan';
      if (raw === 'kashmir' || raw === 'azad kashmir' || raw === 'ajk') return 'kashmir';
      if (raw === 'gilgit' || raw === 'gilgit-baltistan' || raw === 'gb') return 'gilgit';
      return raw.replace(/\s+/g, '-');
    }
    for (const prov of CHAPTER_PROVINCES) {
      const chapter = (chapters || []).find(c => chapterProvinceKey(c.province) === prov || chapterProvinceKey(c.name) === prov);
      await renderChapterPanelPublic(prov, chapter);
    }
  }

  async function renderChapterPanelPublic(prov, chapter) {
    const panel = document.getElementById('ch-' + prov);
    if (!panel) return;
    const provNameEl = panel.querySelector('.ch-province');
    const taglineEl = panel.querySelector('.ch-tagline');
    const badgeEl = panel.querySelector('.ch-badge');
    const dslEl = document.getElementById('dsl-' + prov);
    const seatsGridEl = panel.querySelector('.seats-grid');
    const csTitleEl = panel.querySelector('.cs-title');

    if (!chapter) {
      if (taglineEl) taglineEl.textContent = 'یہ Chapter ابھی رجسٹرڈ نہیں۔';
      if (badgeEl) badgeEl.innerHTML = '<i class="fas fa-hourglass-half"></i> Coming Soon';
      if (dslEl) dslEl.innerHTML = '<div class="chapter-empty">No societies are listed for this chapter yet.</div>';
      if (seatsGridEl) seatsGridEl.innerHTML = '<div class="chapter-empty">Cabinet seats will appear here when appointments are published.</div>';
      return;
    }

    if (provNameEl && chapter.name) provNameEl.textContent = chapter.name;
    if (taglineEl) taglineEl.textContent = chapter.hq_city ? ('HQ: ' + chapter.hq_city) : '—';
    if (badgeEl) {
      if (chapter.status === 'active') badgeEl.innerHTML = '<i class="fas fa-check-circle"></i> Active Chapter';
      else if (chapter.status === 'forming') badgeEl.innerHTML = '<i class="fas fa-clock"></i> Forming';
      else badgeEl.innerHTML = '<i class="fas fa-hourglass-half"></i> Coming Soon';
    }

    const { data: links } = await sb.from('chapter_societies').select('society_id, societies(name)').eq('chapter_id', chapter.id);
    if (dslEl) {
      if (!links || links.length === 0) {
        dslEl.innerHTML = '<div class="chapter-empty">No societies are listed for this chapter yet.</div>';
      } else {
        dslEl.innerHTML = links.map(l => '<div class="sic-card"><div class="sic-icon">🎨</div><div class="sic-name">' + sanitize(l.societies?.name || '—') + '</div></div>').join('');
      }
    }

    const { data: seats } = await sb.from('chapter_society_cabinet').select('role, status, societies(name), profiles(full_name)').eq('chapter_id', chapter.id);
    if (seatsGridEl) {
      const active = (seats || []).filter(s => s.status !== 'inactive');
      if (active.length === 0) {
        seatsGridEl.innerHTML = '<div class="chapter-empty">Cabinet seats will appear here when appointments are published.</div>';
      } else {
        seatsGridEl.innerHTML = active.map(s => {
          const filled = !!(s.profiles && s.profiles.full_name);
          const roleLabel = (s.societies?.name ? s.societies.name + ' — ' : '') + (s.role || '');
          return '<div class="seat-item' + (filled ? ' filled' : '') + '"><div class="seat-dot ' + (filled ? 'filled' : 'open') + '"></div><div><div class="seat-role">' + sanitize(roleLabel) + '</div><div class="seat-name">' + (filled ? sanitize(s.profiles.full_name) : 'Open — Apply Now') + '</div></div></div>';
        }).join('');
      }
    }
    if (csTitleEl) csTitleEl.innerHTML = '<i class="fas fa-users"></i> Chapter Cabinet Seats — ' + sanitize(chapter.name || prov);
  }

  window.addEventListener('DOMContentLoaded', loadPublicChaptersData);

  /* ── Central Cabinet (Admin) ── */
  async function loadCentralCabinetAdmin() {
    const body = document.getElementById('centralCabinetBody');
    if (!body) return;
    body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.5rem;">لوڈ ہو رہا ہے…</td></tr>';

    const { data: seats, error } = await sb
      .from('cabinet_members')
      .select('id, position, bio, photo_url, member_id, profiles(full_name, avatar_url)')
      .is('chapter_id', null)
      .is('society_id', null)
      .order('position');

    if (error) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--ruby);">خرابی: ' + sanitize(error.message) + '</td></tr>'; return; }
    if (!seats || seats.length === 0) { body.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:1.5rem;">ابھی کوئی نشست نہیں۔</td></tr>'; return; }

    body.innerHTML = seats.map(s => {
      const name = s.profiles ? sanitize(s.profiles.full_name) : '—';
      const avatar = s.photo_url || (s.profiles && s.profiles.avatar_url ? s.profiles.avatar_url : '');
      const imgHtml = avatar
        ? '<img src="' + sanitize(avatar) + '" style="width:42px;height:42px;border-radius:50%;object-fit:cover;" alt="' + name + '" />'
        : '<div style="width:42px;height:42px;border-radius:50%;background:var(--cream2);"></div>';
      return '<tr>' +
        '<td>' + imgHtml + '</td>' +
        '<td>' + name + '</td>' +
        '<td>' + sanitize(s.position || '') + '</td>' +
        '<td style="max-width:260px;">' + sanitize((s.bio || '').slice(0, 80)) + (s.bio && s.bio.length > 80 ? '…' : '') + '</td>' +
        '<td>' +
          (s.member_id ? '<button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;margin-left:.3rem;background:var(--gold);color:var(--navy);" onclick="openDocumentForCentralCabinet(\'' + s.member_id + '\', \'' + sanitize(s.position || '').replace(/'/g, "\\'") + '\')"><i class="fas fa-file-signature"></i></button>' : '') +
          '<button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;margin-left:.3rem;" onclick="editCentralCabinetSeat(\'' + s.id + '\')"><i class="fas fa-edit"></i></button>' +
          '<button class="art-buy" style="padding:.3rem .7rem;font-size:.75rem;background:var(--ruby);" onclick="deleteCentralCabinetSeat(\'' + s.id + '\')"><i class="fas fa-trash"></i></button>' +
        '</td>' +
      '</tr>';
    }).join('');
  }

  let ccSelectedPhotoFile = null;

  function resetCcPhotoUI() {
    ccSelectedPhotoFile = null;
    document.getElementById('ccExistingPhotoUrl').value = '';
    document.getElementById('ccPhotoPreview').style.display = 'none';
    document.getElementById('ccPhotoPreview').src = '';
    document.getElementById('ccPhotoPlaceholder').style.display = 'block';
    document.getElementById('ccPhotoStatus').textContent = '';
    const inp = document.getElementById('ccPhotoInput');
    if (inp) inp.value = '';
  }

  window.addEventListener('DOMContentLoaded', () => {
    const ccPhotoInput = document.getElementById('ccPhotoInput');
    if (ccPhotoInput) {
      ccPhotoInput.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) {
          showToast('تصویر 3MB سے چھوٹی ہونی چاہیے', 'error');
          ccPhotoInput.value = '';
          return;
        }
        ccSelectedPhotoFile = file;
        const reader = new FileReader();
        reader.onload = e => {
          document.getElementById('ccPhotoPreview').src = e.target.result;
          document.getElementById('ccPhotoPreview').style.display = 'block';
          document.getElementById('ccPhotoPlaceholder').style.display = 'none';
        };
        reader.readAsDataURL(file);
        document.getElementById('ccPhotoStatus').textContent = 'نئی تصویر منتخب ہو گئی — محفوظ کرنے پر اپلوڈ ہوگی۔';
      });
    }
  });

  const CC_PRESET_POSITIONS = ['President','Vice President','General Secretary','Joint Secretary','Finance Secretary','Media Secretary','Membership Secretary','Events Coordinator','Cultural Coordinator','Public Relations Officer'];

  window.addEventListener('DOMContentLoaded', () => {
    const ccRoleSelect = document.getElementById('ccRole');
    if (ccRoleSelect) {
      ccRoleSelect.addEventListener('change', function () {
        const otherInput = document.getElementById('ccRoleOther');
        if (this.value === '__other__') {
          otherInput.style.display = 'block';
          otherInput.required = true;
        } else {
          otherInput.style.display = 'none';
          otherInput.required = false;
          otherInput.value = '';
        }
      });
    }
  });

  async function openCentralCabinetModal() {
    document.getElementById('ccSeatId').value = '';
    document.getElementById('ccRole').value = '';
    document.getElementById('ccRoleOther').value = '';
    document.getElementById('ccRoleOther').style.display = 'none';
    document.getElementById('ccRoleOther').required = false;
    document.getElementById('ccBio').value = '';
    resetCcPhotoUI();
    await populatePeopleDatalist('ccMember', 'ccMemberList', null);
    document.getElementById('centralCabinetTitle').textContent = 'نئی Central Cabinet نشست';
    openModal('centralCabinetModal');
  }

  async function editCentralCabinetSeat(seatId) {
    const { data: seat, error } = await sb
      .from('cabinet_members')
      .select('id, position, bio, member_id, photo_url')
      .eq('id', seatId)
      .single();
    if (error || !seat) { showToast('نشست نہیں ملی۔', 'error'); return; }

    document.getElementById('ccSeatId').value = seat.id;
    const pos = seat.position || '';
    const otherInput = document.getElementById('ccRoleOther');
    if (CC_PRESET_POSITIONS.includes(pos)) {
      document.getElementById('ccRole').value = pos;
      otherInput.style.display = 'none';
      otherInput.required = false;
      otherInput.value = '';
    } else {
      document.getElementById('ccRole').value = '__other__';
      otherInput.style.display = 'block';
      otherInput.required = true;
      otherInput.value = pos;
    }
    document.getElementById('ccBio').value = seat.bio || '';
    resetCcPhotoUI();
    if (seat.photo_url) {
      document.getElementById('ccExistingPhotoUrl').value = seat.photo_url;
      document.getElementById('ccPhotoPreview').src = seat.photo_url;
      document.getElementById('ccPhotoPreview').style.display = 'block';
      document.getElementById('ccPhotoPlaceholder').style.display = 'none';
    }
    await populatePeopleDatalist('ccMember', 'ccMemberList', seat.member_id);
    document.getElementById('centralCabinetTitle').textContent = 'Central Cabinet نشست میں ترمیم';
    openModal('centralCabinetModal');
  }

  document.getElementById('centralCabinetForm')?.addEventListener('submit', async function (e) {
    e.preventDefault();
    const seatId = document.getElementById('ccSeatId').value;
    const memberId = resolvePersonId('ccMember');
    const roleSelectVal = document.getElementById('ccRole').value;
    const position = (roleSelectVal === '__other__' ? document.getElementById('ccRoleOther').value : roleSelectVal).trim();
    const bio = document.getElementById('ccBio').value.trim();

    if (!memberId) { showToast('براہ کرم فہرست میں سے رکن منتخب کریں۔', 'error'); return; }
    if (!position) { showToast('عہدہ درج کریں۔', 'error'); return; }

    const statusEl = document.getElementById('ccPhotoStatus');
    let photo_url = document.getElementById('ccExistingPhotoUrl').value || null;

    if (ccSelectedPhotoFile) {
      if (statusEl) statusEl.textContent = 'تصویر اپلوڈ ہو رہی ہے…';
      const ext = ccSelectedPhotoFile.name.split('.').pop();
      const filePath = 'cabinet/' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
      const { error: uploadError } = await sb.storage.from('shaoor-uploads').upload(filePath, ccSelectedPhotoFile);
      if (uploadError) {
        showToast('تصویر اپلوڈ ناکام: ' + uploadError.message, 'error');
        if (statusEl) statusEl.textContent = '';
        return;
      }
      const { data: publicUrlData } = sb.storage.from('shaoor-uploads').getPublicUrl(filePath);
      photo_url = publicUrlData.publicUrl;
    }

    const payload = { member_id: memberId, position, bio, photo_url, chapter_id: null, society_id: null };
    let error;
    if (seatId) {
      ({ error } = await sb.from('cabinet_members').update(payload).eq('id', seatId));
    } else {
      ({ error } = await sb.from('cabinet_members').insert(payload));
    }
    if (error) { showToast('محفوظ نہیں ہو سکا: ' + error.message, 'error'); return; }

    showToast('Central Cabinet نشست محفوظ ہو گئی۔');
    closeModal('centralCabinetModal');
    resetCcPhotoUI();
    await loadCentralCabinetAdmin();
    if (typeof loadCentralCabinetPublic === 'function') loadCentralCabinetPublic();
  });

  async function deleteCentralCabinetSeat(seatId) {
    if (!confirm('کیا یہ نشست ہٹانا چاہتے ہیں؟')) return;
    const { data, error } = await sb.from('cabinet_members').delete().eq('id', seatId).select('id');
    if (error) { showToast('ہٹا نہیں سکے: ' + error.message, 'error'); return; }
    if (!data || data.length === 0) { showToast('ہٹا نہیں سکے — اجازت (RLS policy) موجود نہیں یا ریکارڈ پہلے ہی موجود نہیں۔', 'error'); return; }
    showToast('نشست ہٹا دی گئی۔');
    await loadCentralCabinetAdmin();
    if (typeof loadCentralCabinetPublic === 'function') loadCentralCabinetPublic();
  }
