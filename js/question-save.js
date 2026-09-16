// Direct, self-contained save path — completely separate from secureSubmit /
        // form 'submit' event / rate limiter. type="button" (not "submit") means no
        // native form submission and no HTML5 required-field validation can ever
        // block this. Every step reports its own visible status right on the modal,
        // so nothing can fail silently again.
        window.saveQuestionDirect = async function () {
          var statusEl = document.getElementById('questionSaveStatus');
          var btn = document.getElementById('questionSaveBtn');
          statusEl.style.color = 'var(--muted)';
          statusEl.textContent = 'محفوظ ہو رہا ہے…';
          btn.disabled = true;

          try {
            if (!lmsAdminQuestionTarget || !lmsAdminQuestionTarget.id) {
              statusEl.style.color = 'var(--ruby)';
              statusEl.textContent = 'خرابی: کوئی quiz/assessment منتخب نہیں (lmsAdminQuestionTarget خالی ہے)۔';
              return;
            }

            var editId = document.getElementById('questionEditId').value;
            var question_text = document.getElementById('questionTextInput').value.trim();
            var question_type = document.getElementById('questionTypeInput').value;
            var optionsRaw = document.getElementById('questionOptionsInput').value;
            var options = question_type === 'true_false' ? ['True', 'False'] :
              optionsRaw.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
            var correct_answer = document.getElementById('questionCorrectInput').value.trim();
            var marksRaw = document.getElementById('questionMarksInput').value;
            var marks = parseInt(marksRaw, 10) || 1;
            var orderVal = document.getElementById('questionOrderInput').value;

            if (!question_text) { statusEl.style.color = 'var(--ruby)'; statusEl.textContent = 'سوال کا متن درج کریں۔'; return; }
            if (question_type !== 'true_false' && options.length < 2) { statusEl.style.color = 'var(--ruby)'; statusEl.textContent = 'کم از کم دو options درج کریں۔'; return; }
            if (!correct_answer) { statusEl.style.color = 'var(--ruby)'; statusEl.textContent = 'صحیح جواب درج کریں۔'; return; }
            if (!options.includes(correct_answer)) { statusEl.style.color = 'var(--ruby)'; statusEl.textContent = 'صحیح جواب لفظ بہ لفظ options میں سے ایک جیسا ہونا چاہیے۔ Options: ' + options.join(' | '); return; }

            var table = lmsAdminQuestionTarget.kind === 'quiz' ? 'quiz_questions' : 'assessment_questions';
            var fk = lmsAdminQuestionTarget.kind === 'quiz' ? 'quiz_id' : 'assessment_id';
            var payload = { question_text: question_text, question_type: question_type, options: options, correct_answer: correct_answer, marks: marks, question_order: orderVal ? parseInt(orderVal, 10) : 0 };
            payload[fk] = lmsAdminQuestionTarget.id;

            if (!sb) { statusEl.style.color = 'var(--ruby)'; statusEl.textContent = 'خرابی: Supabase client (sb) موجود نہیں۔'; return; }

            var res;
            if (editId) { res = await sb.from(table).update(payload).eq('id', editId).select('id'); }
            else { res = await sb.from(table).insert(payload).select('id'); }

            if (res.error) {
              statusEl.style.color = 'var(--ruby)';
              statusEl.textContent = 'Supabase error: ' + res.error.message + (res.error.details ? ' | ' + res.error.details : '') + (res.error.hint ? ' | hint: ' + res.error.hint : '');
              return;
            }
            if (!res.data || !res.data.length) {
              statusEl.style.color = 'var(--ruby)';
              statusEl.textContent = 'کوئی error نہیں آیا مگر کوئی row بھی واپس نہیں آئی — RLS پالیسی (' + table + ') insert/select کو خاموشی سے روک رہی ہے۔';
              return;
            }

            statusEl.style.color = 'var(--teal)';
            statusEl.textContent = '✓ سوال محفوظ ہو گیا! (id: ' + res.data[0].id + ')';
            if (typeof showToast === 'function') showToast('✓ سوال محفوظ ہو گیا!');
            if (typeof loadQuestionsAdmin === 'function') loadQuestionsAdmin();
            setTimeout(function () { if (typeof closeModal === 'function') closeModal('questionModal'); }, 600);
          } catch (e) {
            statusEl.style.color = 'var(--ruby)';
            statusEl.textContent = 'JS Exception: ' + e.message;
            console.error('[saveQuestionDirect]', e);
          } finally {
            btn.disabled = false;
          }
        };
