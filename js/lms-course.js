/* LMS COURSE DETAIL — Phase 3 */
    let lmsCurrentCourse = null;
    let lmsPendingEnrollCourseId = null; // set when a signed-out user clicks Enroll, so login/signup can resume it
    // Phase 3B — when set, showCourseDetail() will auto-open the learner's next
    // incomplete lesson once modules/lessons/progress finish loading (Continue Learning fix).
    let lmsAutoResumeLesson = false;

    // My Learning → "Continue Learning" now resumes at the learner's actual next lesson
    // instead of only opening Course Detail, reusing existing lesson_progress/unlock logic.
    function continueLearningToCourse(slug) {
      lmsAutoResumeLesson = true;
      closeModal('memberDash');
      showCourseDetail(slug);
    }

    async function showCourseDetail(slug) {
      document.getElementById('lmsAcademyOverlay').classList.add('active'); // safety: ensure the academy overlay is open
      document.getElementById('lmsCatalogSection').style.display = 'none';
      var detail = document.getElementById('courseDetail');
      detail.classList.add('active');
      detail.scrollIntoView({ behavior: 'smooth' });
      window.location.hash = 'course/' + slug;

      resetCourseDetailView();

      try {
        var courseRes = await sb
          .from('courses')
          .select('*')
          .eq('slug', slug)
          .eq('status', 'published')
          .single();

        if (courseRes.error || !courseRes.data) {
          console.error('SHAOOR LMS: course not found', courseRes.error);
          document.getElementById('cdTitle').textContent = 'Course not found';
          return;
        }
        var course = courseRes.data;
        lmsCurrentCourse = course;

        // Phase 3B — hero thumbnail: reuse existing thumbnail_url, safe fallback to icon
        var cdThumbImg = document.getElementById('cdThumbImg');
        var cdThumbIcon = document.getElementById('cdThumbIcon');
        if (course.thumbnail_url) {
          cdThumbImg.src = course.thumbnail_url;
          cdThumbImg.alt = course.title || 'Course thumbnail';
          cdThumbImg.style.display = 'block';
          if (cdThumbIcon) cdThumbIcon.style.display = 'none';
        } else {
          cdThumbImg.removeAttribute('src');
          cdThumbImg.style.display = 'none';
          if (cdThumbIcon) cdThumbIcon.style.display = '';
        }

        document.getElementById('cdCategory').innerHTML =
          '<i class="fas fa-palette"></i> ' + sanitize(course.category || 'Course');
        document.getElementById('cdTitle').textContent = course.title || 'Untitled Course';
        document.getElementById('cdDescription').textContent = course.description || '';
        document.getElementById('cdLevel').textContent = course.level || '—';
        document.getElementById('cdDuration').textContent = course.duration_label || '—';
        document.getElementById('cdPrice').textContent = course.is_paid
          ? (course.currency || 'PKR') + ' ' + (course.price || 0)
          : 'FREE';
        document.getElementById('cdCertLine').textContent = course.certificate_available
          ? 'Certificate available on completion'
          : 'No certificate for this course';

        applyCourseSeoMeta(course);

        renderListItems('cdOutcomes', course.learning_outcomes, 'fa-check-circle');
        renderListItems('cdRequirements', course.requirements, 'fa-info-circle');

        // Modules + lesson counts (publicly readable per Phase 1 RLS)
        var modulesRes = await sb
          .from('course_modules')
          .select('id, title, module_order, status')
          .eq('course_id', course.id)
          .eq('status', 'published')
          .order('module_order', { ascending: true });

        var modules = (modulesRes.data || []);
        document.getElementById('cdModuleCount').textContent = modules.length;

        // Quizzes attached to modules (Phase 7). Missing table = no quizzes shown, no crash.
        var lmsModuleQuizzes = {};
        try {
          var quizzesRes = await sb
            .from('quizzes')
            .select('id, module_id, title, passing_score, attempt_limit, status')
            .eq('course_id', course.id)
            .eq('status', 'published');
          (quizzesRes.data || []).forEach(function (q) { lmsModuleQuizzes[q.module_id] = q; });
        } catch (e) {
          console.warn('SHAOOR LMS: quizzes table unavailable', e);
        }
        lmsCurrentModuleQuizzes = lmsModuleQuizzes;

        // Final assessment (Phase 9) — course-level, not module-level. Missing table = hidden section.
        lmsCurrentFinalAssessment = null;
        try {
          var finalRes = await sb
            .from('course_assessments')
            .select('id, title, assessment_type, passing_score, attempt_limit, status')
            .eq('course_id', course.id)
            .eq('status', 'published')
            .maybeSingle();
          if (finalRes.data) lmsCurrentFinalAssessment = finalRes.data;
        } catch (e) {
          console.warn('SHAOOR LMS: course_assessments table unavailable', e);
        }

        document.getElementById('lmsLessonPlayer').classList.remove('active');
        document.getElementById('lmsFinalPanel').classList.remove('active');
        lmsCurrentLessonId = null;

        if (modules.length) {
          var lessonsRes = await sb
            .from('course_lessons')
            .select('id, module_id, title, description, lesson_order, is_required, is_preview, youtube_video_id, youtube_url, status')
            .eq('course_id', course.id)
            .eq('status', 'published')
            .order('lesson_order', { ascending: true });

          var lessons = (lessonsRes.data || []);
          document.getElementById('cdLessonCount').textContent = lessons.length;
          // Loads this student's lesson_progress (if any) and renders the curriculum
          // with correct locked/completed states — see PHASE 6 block below.
          await loadLessonProgressAndUnlockState(course, modules, lessons);
        } else {
          document.getElementById('cdLessonCount').textContent = '0';
        }
        renderFinalAssessmentRow(); // Phase 9 — shown/locked based on course completion state
        // Reflect existing enrollment status on the button, if any.
        await refreshEnrollButtonState();

        // Phase 3B — Continue Learning resume: jump straight to the next incomplete,
        // unlocked lesson. Falls back to doing nothing (stays on Course Detail) if no
        // lesson qualifies (e.g. no lessons published, or everything already locked).
        if (lmsAutoResumeLesson) {
          lmsAutoResumeLesson = false;
          try {
            var resumeTarget = (lmsAllLessons || []).find(function (l) {
              return !lmsCompletedLessonIds.has(l.id) && !isLessonLocked(l);
            });
            if (resumeTarget) openLesson(resumeTarget.id);
          } catch (e) {
            console.warn('SHAOOR LMS: Continue Learning resume could not open a lesson', e);
          }
        }
      } catch (e) {
        console.error('SHAOOR LMS: unexpected error loading course detail', e);
        lmsAutoResumeLesson = false;
      }
    }

    async function refreshEnrollButtonState() {
      var btn = document.querySelector('#courseDetail .lms-sidebar-card .btn-gold');
      if (!btn || !lmsCurrentCourse) return;
      try {
        var userRes = await sb.auth.getUser();
        var user = userRes.data ? userRes.data.user : null;
        if (!user) return; // stays as "ENROLL NOW" for guests

        var existing = await sb
          .from('course_enrollments')
          .select('status')
          .eq('course_id', lmsCurrentCourse.id)
          .eq('member_id', user.id)
          .maybeSingle();

        if (existing.data) {
          if (existing.data.status === 'pending') {
            btn.innerHTML = '<i class="fas fa-clock"></i> PENDING APPROVAL';
          } else {
            btn.innerHTML = '<i class="fas fa-play"></i> CONTINUE LEARNING';
          }
        }
      } catch (e) {
        console.error('SHAOOR LMS: could not check enrollment status', e);
      }
    }

    function resetCourseDetailView() {
      lmsCurrentCourse = null;
      var cdThumbImgReset = document.getElementById('cdThumbImg');
      var cdThumbIconReset = document.getElementById('cdThumbIcon');
      if (cdThumbImgReset) { cdThumbImgReset.style.display = 'none'; cdThumbImgReset.removeAttribute('src'); }
      if (cdThumbIconReset) cdThumbIconReset.style.display = '';
      document.getElementById('cdTitle').textContent = 'Loading…';
      document.getElementById('cdDescription').textContent = '';
      document.getElementById('cdMeta').innerHTML = '';
      document.getElementById('cdOutcomes').innerHTML = '';
      document.getElementById('cdRequirements').innerHTML = '';
      document.getElementById('cdModules').innerHTML = '<p style="color:var(--muted);font-size:.85rem;">Loading course content…</p>';
      document.getElementById('cdModuleCount').textContent = '—';
      document.getElementById('cdLessonCount').textContent = '—';
    }

    function renderListItems(elId, items, icon) {
      var el = document.getElementById(elId);
      el.innerHTML = '';
      if (!items || !items.length) {
        el.innerHTML = '<li style="color:var(--muted);">Not specified yet.</li>';
        return;
      }
      items.forEach(function (item) {
        var li = document.createElement('li');
        li.innerHTML = '<i class="fas ' + icon + '"></i> <span>' + item + '</span>';
        el.appendChild(li);
      });
    }

    /* ── PHASE 7: module quiz system ── */
    async function openModuleQuiz(quizId, moduleId) {
      document.getElementById('lmsLessonPlayer').classList.remove('active');
      var panel = document.getElementById('lmsQuizPanel');
      panel.classList.add('active');
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

      document.getElementById('lmsQuizResult').innerHTML = '';
      document.getElementById('lmsQuizQuestions').innerHTML = '<p style="color:var(--muted);font-size:.85rem;">Loading quiz…</p>';
      document.getElementById('lmsQuizSubmitBtn').style.display = '';

      try {
        var quizRes = await sb
          .from('quizzes')
          .select('id, title, passing_score, attempt_limit, time_limit_minutes')
          .eq('id', quizId)
          .single();
        if (quizRes.error || !quizRes.data) {
          document.getElementById('lmsQuizQuestions').innerHTML = '<p>Quiz could not be loaded.</p>';
          return;
        }
        lmsCurrentQuiz = quizRes.data;
        document.getElementById('lmsQuizTitle').textContent = lmsCurrentQuiz.title || 'Module Quiz';
        document.getElementById('lmsQuizMeta').textContent =
          'Passing score: ' + lmsCurrentQuiz.passing_score + '%' +
          (lmsCurrentQuiz.attempt_limit ? ' · Attempts allowed: ' + lmsCurrentQuiz.attempt_limit : '') +
          (lmsCurrentQuiz.time_limit_minutes ? ' · Time limit: ' + lmsCurrentQuiz.time_limit_minutes + ' min' : '');

        // Never select correct_answer here — it must stay server-side until after submission.
        var qRes = await sb
          .from('quiz_questions')
          .select('id, question_text, question_type, options, marks, question_order')
          .eq('quiz_id', quizId)
          .order('question_order', { ascending: true });

        lmsQuizQuestions = qRes.data || [];
        renderQuizQuestions();
      } catch (e) {
        console.error('SHAOOR LMS: could not load quiz', e);
        document.getElementById('lmsQuizQuestions').innerHTML = '<p>Quiz could not be loaded.</p>';
      }
    }

    function renderQuizQuestions() {
      var container = document.getElementById('lmsQuizQuestions');
      if (!lmsQuizQuestions.length) {
        container.innerHTML = '<p style="color:var(--muted);font-size:.85rem;">This quiz has no questions yet.</p>';
        return;
      }
      container.innerHTML = lmsQuizQuestions.map(function (q, idx) {
        var options = Array.isArray(q.options) ? q.options : (q.question_type === 'true_false' ? ['True', 'False'] : []);
        var optionsHtml = options.map(function (opt) {
          return '<label class="lms-quiz-option">' +
            '<input type="radio" name="q_' + q.id + '" value="' + String(opt).replace(/"/g, '&quot;') + '"> ' + opt +
            '</label>';
        }).join('');
        return '<div class="lms-quiz-question" data-question-id="' + q.id + '">' +
          '<h4>' + (idx + 1) + '. ' + q.question_text + '</h4>' + optionsHtml +
          '<div class="lms-quiz-explanation" id="lmsQExplain_' + q.id + '"></div>' +
          '</div>';
      }).join('');
    }

    async function submitQuiz() {
      if (!lmsCurrentQuiz || !lmsQuizQuestions.length) return;
      var answers = lmsQuizQuestions.map(function (q) {
        var checked = document.querySelector('input[name="q_' + q.id + '"]:checked');
        return { question_id: q.id, selected: checked ? checked.value : null };
      });

      if (answers.some(function (a) { return a.selected === null; })) {
        alert('Please answer every question before submitting.');
        return;
      }

      var btn = document.getElementById('lmsQuizSubmitBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…';

      try {
        // Scoring and attempt-limit enforcement happen entirely server-side in this RPC —
        // correct_answer is never sent to or read by the browser before this call resolves.
        var res = await sb.rpc('submit_quiz_attempt', {
          p_quiz_id: lmsCurrentQuiz.id,
          p_answers: answers
        });

        if (res.error) {
          alert(res.error.message || 'Could not submit the quiz. Please contact an administrator if this continues.');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Quiz';
          return;
        }

        var result = res.data;
        showQuizResult(result);
      } catch (e) {
        console.error('SHAOOR LMS: quiz submission failed', e);
        alert('Could not submit the quiz. Please try again.');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit Quiz';
      }
    }

    function showQuizResult(result) {
      var resultBox = document.getElementById('lmsQuizResult');
      var passed = result.passed;
      resultBox.innerHTML =
        '<div class="lms-quiz-result ' + (passed ? 'pass' : 'fail') + '">' +
        '<h3 style="margin:0 0 .3rem;">' + (passed ? 'Passed!' : 'Not Passed') + '</h3>' +
        '<p style="margin:0;">Score: ' + result.score + '% (passing: ' + result.passing_score + '%)</p>' +
        '<p style="margin:.3rem 0 0;font-size:.8rem;">Attempt ' + result.attempt_number + ' of ' + result.attempt_limit + '</p>' +
        '</div>';

      // Reveal correct answers + explanations only now, after submission.
      (result.details || []).forEach(function (d) {
        var qDiv = document.querySelector('.lms-quiz-question[data-question-id="' + d.question_id + '"]');
        if (!qDiv) return;
        qDiv.querySelectorAll('input[type="radio"]').forEach(function (input) {
          input.disabled = true;
          var label = input.closest('.lms-quiz-option');
          if (input.value === d.correct_answer) label.classList.add('correct');
          else if (input.checked && !d.is_correct) label.classList.add('incorrect');
        });
        if (d.explanation) {
          var expBox = document.getElementById('lmsQExplain_' + d.question_id);
          if (expBox) { expBox.textContent = d.explanation; expBox.classList.add('show'); }
        }
      });

      document.getElementById('lmsQuizSubmitBtn').style.display = 'none';

      if (passed) {
        lmsPassedModuleQuizIds.add(lmsCurrentQuiz.id);
        renderModules(lmsCurrentModules, lmsAllLessons); // unlock next module's lessons in the sidebar
        renderFinalAssessmentRow(); // may now be eligible if this was the last module quiz
        maybeShowCertificateButton(); // Phase 10: may now be eligible if there's no final assessment
      }
    }

    function closeQuizPanel() {
      document.getElementById('lmsQuizPanel').classList.remove('active');
      lmsCurrentQuiz = null;
      lmsQuizQuestions = [];
    }

    /* ── PHASE 9: final assessment (course-level, MCQ or written/file submission) ── */

    // All lessons complete + all module quizzes (if any) passed = eligible for the final assessment.
    function isCourseReadyForFinalAssessment() {
      if (!lmsAllLessons.length) return false;
      var allLessonsDone = lmsAllLessons.every(function (l) { return lmsCompletedLessonIds.has(l.id); });
      if (!allLessonsDone) return false;
      var allQuizzesPassed = Object.keys(lmsCurrentModuleQuizzes).every(function (moduleId) {
        return lmsPassedModuleQuizIds.has(lmsCurrentModuleQuizzes[moduleId].id);
      });
      return allQuizzesPassed;
    }

    function renderFinalAssessmentRow() {
      var wrap = document.getElementById('cdFinalAssessmentRow');
      if (!lmsCurrentFinalAssessment) { wrap.style.display = 'none'; wrap.innerHTML = ''; return; }

      var ready = lmsEnrollmentActive && isCourseReadyForFinalAssessment();
      var rowClass = 'lms-lesson-row' + (ready ? '' : ' locked');
      wrap.style.display = '';
      wrap.innerHTML = '<div class="' + rowClass + '" onclick="' +
        (ready ? 'openFinalAssessment();' : 'alert(\'Complete all lessons and module quizzes to unlock the final assessment.\');') + '">' +
        '<span class="lms-lesson-icon"><i class="fas ' + (ready ? 'fa-flag-checkered' : 'fa-lock') + '"></i></span>' +
        '<span class="lms-lesson-title">' + (lmsCurrentFinalAssessment.title || 'Final Assessment') + ' <span class="lms-quiz-badge"><i class="fas fa-award"></i> Final Assessment</span></span>' +
        '<span class="lms-lesson-status">' + (ready ? 'Available' : 'Locked') + '</span>' +
        '</div>';
    }

    async function openFinalAssessment() {
      if (!lmsCurrentFinalAssessment) return;
      var userRes = await sb.auth.getUser();
      var user = userRes.data ? userRes.data.user : null;
      if (!user) { alert('Please sign in to view the final assessment.'); return; }
      document.getElementById('lmsLessonPlayer').classList.remove('active');
      document.getElementById('lmsQuizPanel').classList.remove('active');
      var panel = document.getElementById('lmsFinalPanel');
      panel.classList.add('active');
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

      document.getElementById('lmsFinalTitle').textContent = lmsCurrentFinalAssessment.title || 'Final Assessment';
      document.getElementById('lmsFinalResult').innerHTML = '';
      document.getElementById('lmsFinalSubmitBtn').style.display = '';
      document.getElementById('lmsFinalSubmitBtn').disabled = false;
      document.getElementById('lmsFinalSubmitBtn').innerHTML = '<i class="fas fa-paper-plane"></i> Submit';

      var mcqWrap = document.getElementById('lmsFinalMcqQuestions');
      var submissionWrap = document.getElementById('lmsFinalSubmissionForm');

      if (lmsCurrentFinalAssessment.assessment_type === 'mcq') {
        submissionWrap.style.display = 'none';
        mcqWrap.style.display = '';
        document.getElementById('lmsFinalMeta').textContent =
          'Passing score: ' + lmsCurrentFinalAssessment.passing_score + '%' +
          (lmsCurrentFinalAssessment.attempt_limit ? ' · Attempts allowed: ' + lmsCurrentFinalAssessment.attempt_limit : '');

        mcqWrap.innerHTML = '<p style="color:var(--muted);font-size:.85rem;">Loading assessment…</p>';
        var qRes = await sb
          .from('assessment_questions')
          .select('id, question_text, question_type, options, marks, question_order')
          .eq('assessment_id', lmsCurrentFinalAssessment.id)
          .order('question_order', { ascending: true });
        lmsFinalQuestions = qRes.data || [];
        renderFinalMcqQuestions();
      } else {
        mcqWrap.style.display = 'none';
        mcqWrap.innerHTML = '';
        document.getElementById('lmsFinalMeta').textContent = 'Written / file submission — reviewed by an administrator.';

        // Show the student's own most recent submission status (their own row — allowed by
        // the "own submissions read" RLS policy) before deciding whether to show the form.
        var mySubRes = await sb.from('assessment_submissions')
          .select('id, review_status, reviewer_notes, submitted_at')
          .eq('assessment_id', lmsCurrentFinalAssessment.id)
          .eq('member_id', user.id)
          .order('submitted_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        var mySub = mySubRes.data;

        if (mySub && mySub.review_status === 'approved') {
          submissionWrap.style.display = 'none';
          btn.style.display = 'none';
          document.getElementById('lmsFinalResult').innerHTML =
            '<div class="lms-quiz-result pass">' +
            '<h3 style="margin:0 0 .3rem;">Approved</h3>' +
            '<p style="margin:0;">Your submission has been approved. If this course offers a certificate, you can claim it from the course page.</p>' +
            '</div>';
        } else if (mySub && mySub.review_status === 'pending') {
          submissionWrap.style.display = 'none';
          btn.style.display = 'none';
          document.getElementById('lmsFinalResult').innerHTML =
            '<div class="lms-quiz-result" style="background:#FBF4E4;color:#8a6d1f;">' +
            '<h3 style="margin:0 0 .3rem;">Pending Review</h3>' +
            '<p style="margin:0;">Your submission is waiting for an administrator to review it. Check back here later.</p>' +
            '</div>';
        } else {
          // No submission yet, or the previous one was rejected — show the form.
          // Rejected submissions get a visible reason plus a chance to resubmit.
          submissionWrap.style.display = '';
          document.getElementById('lmsFinalTextContent').value = '';
          document.getElementById('lmsFinalFileUrl').value = '';
          if (mySub && mySub.review_status === 'rejected') {
            document.getElementById('lmsFinalResult').innerHTML =
              '<div class="lms-quiz-result fail">' +
              '<h3 style="margin:0 0 .3rem;">Not Approved — Please Revise</h3>' +
              '<p style="margin:0;">' + (mySub.reviewer_notes ? sanitize(mySub.reviewer_notes) : 'No specific reason was provided. Please contact an administrator for details.') + '</p>' +
              '<p style="margin:.4rem 0 0;font-size:.8rem;">You can submit an improved version below.</p>' +
              '</div>';
          }
        }
      }
    }

    function renderFinalMcqQuestions() {
      var container = document.getElementById('lmsFinalMcqQuestions');
      if (!lmsFinalQuestions.length) {
        container.innerHTML = '<p style="color:var(--muted);font-size:.85rem;">This assessment has no questions yet.</p>';
        return;
      }
      container.innerHTML = lmsFinalQuestions.map(function (q, idx) {
        var options = Array.isArray(q.options) ? q.options : (q.question_type === 'true_false' ? ['True', 'False'] : []);
        var optionsHtml = options.map(function (opt) {
          return '<label class="lms-quiz-option">' +
            '<input type="radio" name="fq_' + q.id + '" value="' + String(opt).replace(/"/g, '&quot;') + '"> ' + opt +
            '</label>';
        }).join('');
        return '<div class="lms-quiz-question" data-question-id="' + q.id + '">' +
          '<h4>' + (idx + 1) + '. ' + q.question_text + '</h4>' + optionsHtml +
          '<div class="lms-quiz-explanation" id="lmsFQExplain_' + q.id + '"></div>' +
          '</div>';
      }).join('');
    }

    async function submitFinalAssessment() {
      if (!lmsCurrentFinalAssessment) return;
      var userRes = await sb.auth.getUser();
      var user = userRes.data ? userRes.data.user : null;
      if (!user) { alert('Please sign in to submit the final assessment.'); return; }

      var btn = document.getElementById('lmsFinalSubmitBtn');

      if (lmsCurrentFinalAssessment.assessment_type === 'mcq') {
        var answers = lmsFinalQuestions.map(function (q) {
          var checked = document.querySelector('input[name="fq_' + q.id + '"]:checked');
          return { question_id: q.id, selected: checked ? checked.value : null };
        });
        if (answers.some(function (a) { return a.selected === null; })) {
          alert('Please answer every question before submitting.');
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…';
        try {
          // Scoring happens entirely server-side — see submit_final_assessment_mcq RPC.
          var res = await sb.rpc('submit_final_assessment_mcq', {
            p_assessment_id: lmsCurrentFinalAssessment.id,
            p_answers: answers
          });
          if (res.error) {
            alert(res.error.message || 'Could not submit. Please contact an administrator if this continues.');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
            return;
          }
          showFinalMcqResult(res.data);
        } catch (e) {
          console.error('SHAOOR LMS: final assessment submission failed', e);
          alert('Could not submit. Please try again.');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
        }
      } else {
        var textContent = document.getElementById('lmsFinalTextContent').value.trim();
        var fileUrl = document.getElementById('lmsFinalFileUrl').value.trim();
        if (!textContent && !fileUrl) {
          alert('Please write a submission or provide a file link.');
          return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting…';
        try {
          var insertRes = await sb.from('assessment_submissions').insert({
            assessment_id: lmsCurrentFinalAssessment.id,
            member_id: user.id,
            submission_type: fileUrl ? 'file' : 'text',
            text_content: textContent || null,
            file_url: fileUrl || null,
            review_status: 'pending'
          });
          if (insertRes.error) {
            alert(insertRes.error.message || 'Could not submit. Please contact an administrator if this continues.');
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
            return;
          }
          document.getElementById('lmsFinalResult').innerHTML =
            '<div class="lms-quiz-result" style="background:#FBF4E4;color:#8a6d1f;">' +
            '<h3 style="margin:0 0 .3rem;">Submitted</h3>' +
            '<p style="margin:0;">Your submission has been sent for admin review. Check My Learning for the result.</p>' +
            '</div>';
          document.getElementById('lmsFinalSubmissionForm').style.display = 'none';
          btn.style.display = 'none';
        } catch (e) {
          console.error('SHAOOR LMS: final assessment submission failed', e);
          alert('Could not submit. Please try again.');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit';
        }
      }
    }

    function showFinalMcqResult(result) {
      var passed = result.passed;
      document.getElementById('lmsFinalResult').innerHTML =
        '<div class="lms-quiz-result ' + (passed ? 'pass' : 'fail') + '">' +
        '<h3 style="margin:0 0 .3rem;">' + (passed ? 'Passed!' : 'Not Passed') + '</h3>' +
        '<p style="margin:0;">Score: ' + result.score + '% (passing: ' + result.passing_score + '%)</p>' +
        '<p style="margin:.3rem 0 0;font-size:.8rem;">Attempt ' + result.attempt_number + ' of ' + result.attempt_limit + '</p>' +
        '</div>';

      (result.details || []).forEach(function (d) {
        var qDiv = document.querySelector('#lmsFinalMcqQuestions .lms-quiz-question[data-question-id="' + d.question_id + '"]');
        if (!qDiv) return;
        qDiv.querySelectorAll('input[type="radio"]').forEach(function (input) {
          input.disabled = true;
          var label = input.closest('.lms-quiz-option');
          if (input.value === d.correct_answer) label.classList.add('correct');
          else if (input.checked && !d.is_correct) label.classList.add('incorrect');
        });
        if (d.explanation) {
          var expBox = document.getElementById('lmsFQExplain_' + d.question_id);
          if (expBox) { expBox.textContent = d.explanation; expBox.classList.add('show'); }
        }
      });

      document.getElementById('lmsFinalSubmitBtn').style.display = 'none';
      if (passed) { maybeShowCertificateButton(); } // Phase 10: MCQ final assessment auto-approves on pass
    }

    function closeFinalPanel() {
      document.getElementById('lmsFinalPanel').classList.remove('active');
    }

    /* ── PHASE 10: certificate button — server RPC re-checks everything, this is just UI hinting ── */
    function maybeShowCertificateButton() {
      var btn = document.getElementById('cdCertBtn');
      if (!btn) return;
      if (!lmsCurrentCourse || !lmsCurrentCourse.certificate_available || !lmsEnrollmentActive) {
        btn.style.display = 'none';
        return;
      }
      if (!isCourseReadyForFinalAssessment()) { btn.style.display = 'none'; return; }
      btn.style.display = '';
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-award"></i> GET CERTIFICATE';
    }

    async function claimCourseCertificate() {
      if (!lmsCurrentCourse) return;
      var btn = document.getElementById('cdCertBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking…';
      try {
        var res = await sb.rpc('issue_course_certificate', { p_course_id: lmsCurrentCourse.id });
        if (res.error) {
          alert(res.error.message || 'Could not issue certificate yet. Make sure every lesson, quiz, and the final assessment (if any) is completed and approved.');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-award"></i> GET CERTIFICATE';
          return;
        }
        alert('🎉 Congratulations! Your certificate has been issued. You can view it under "My Certificates" in your member dashboard.');
        btn.innerHTML = '<i class="fas fa-check"></i> CERTIFICATE ISSUED';
      } catch (e) {
        console.error('SHAOOR LMS: certificate issue failed', e);
        alert('Could not issue certificate. Please try again.');
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-award"></i> GET CERTIFICATE';
      }
    }
    let lmsAllLessons = [];       // flat, ordered list of lessons for the current course
    let lmsCompletedLessonIds = new Set(); // lesson_id set completed by the current user
    let lmsCurrentLessonId = null;
    let lmsEnrollmentActive = false; // true only if user has an active/completed enrollment
    let lmsCurrentModules = [];   // cached module list for the current course, for re-rendering
    let lmsCurrentModuleQuizzes = {}; // module_id -> quiz row
    let lmsCurrentQuiz = null;
    let lmsQuizQuestions = [];
    let lmsPassedModuleQuizIds = new Set(); // quiz_id set the user has already passed
    let lmsCurrentFinalAssessment = null; // {id, title, assessment_type, passing_score, attempt_limit}
    let lmsFinalQuestions = [];
    let lmsCurrentEnrollmentId = null; // this member's course_enrollments.id for the open course — required by lesson_progress (NOT NULL enrollment_id)

    function renderModules(modules, lessons) {
      var container = document.getElementById('cdModules');
      container.innerHTML = '';
      lmsCurrentModules = modules;
      lmsAllLessons = lessons.slice().sort(function (a, b) {
        return (a.lesson_order || 0) - (b.lesson_order || 0);
      });

      modules.forEach(function (mod, idx) {
        var modLessons = lmsAllLessons.filter(function (l) { return l.module_id === mod.id; });
        var div = document.createElement('div');
        div.className = 'lms-module';

        var lessonsHtml = modLessons.map(function (lesson) {
          var isCompleted = lmsCompletedLessonIds.has(lesson.id);
          var isLocked = isLessonLocked(lesson);
          var rowClass = 'lms-lesson-row' + (isCompleted ? ' completed' : '') + (isLocked ? ' locked' : '');
          var icon = isCompleted ? 'fa-check-circle' : (isLocked ? 'fa-lock' : 'fa-play-circle');
          var statusText = isCompleted ? 'Completed' : (isLocked ? 'Locked' : (lesson.is_preview ? 'Preview' : ''));
          return '<div class="' + rowClass + '" data-lesson-id="' + lesson.id + '" onclick="' +
            (isLocked ? 'showLessonLockedNotice();' : 'openLesson(\'' + lesson.id + '\');') + '">' +
            '<span class="lms-lesson-icon"><i class="fas ' + icon + '"></i></span>' +
            '<span class="lms-lesson-title">' + (lesson.title || 'Untitled lesson') + '</span>' +
            '<span class="lms-lesson-status">' + statusText + '</span>' +
            '</div>';
        }).join('');

        var quiz = lmsCurrentModuleQuizzes[mod.id];
        var quizHtml = '';
        if (quiz) {
          var allModLessonsDone = modLessons.length > 0 && modLessons.every(function (l) { return lmsCompletedLessonIds.has(l.id); });
          var quizPassed = lmsPassedModuleQuizIds.has(quiz.id);
          var quizLocked = !allModLessonsDone;
          var qRowClass = 'lms-lesson-row' + (quizPassed ? ' completed' : '') + (quizLocked ? ' locked' : '');
          var qIcon = quizPassed ? 'fa-check-circle' : (quizLocked ? 'fa-lock' : 'fa-clipboard-question');
          var qStatus = quizPassed ? 'Passed' : (quizLocked ? 'Locked' : 'Available');
          quizHtml = '<div class="' + qRowClass + '" onclick="' +
            (quizLocked ? 'alert(\'Complete all lessons in this module to unlock the quiz.\');' : 'openModuleQuiz(\'' + quiz.id + '\',\'' + mod.id + '\');') + '">' +
            '<span class="lms-lesson-icon"><i class="fas ' + qIcon + '"></i></span>' +
            '<span class="lms-lesson-title">' + (quiz.title || 'Module Quiz') + ' <span class="lms-quiz-badge"><i class="fas fa-clipboard-list"></i> Quiz</span></span>' +
            '<span class="lms-lesson-status">' + qStatus + '</span>' +
            '</div>';
        }

        div.innerHTML =
          '<div class="lms-module-title"><span>Module ' + (idx + 1) + ': ' + mod.title + '</span>' +
          '<span style="color:var(--muted);font-weight:400;">' + modLessons.length + ' lessons</span></div>' +
          lessonsHtml + quizHtml;
        container.appendChild(div);
      });
    }

    // Lesson 1 (overall lowest lesson_order) is always unlocked.
    // Every subsequent lesson requires the immediately preceding lesson to be completed.
    // If that lesson was the last lesson of its module AND that module has a quiz,
    // the quiz must also be passed before the first lesson of the next module unlocks.
    // If the user has no active/completed enrollment, everything except is_preview lessons is locked.
    function isLessonLocked(lesson) {
      if (!lmsEnrollmentActive && !lesson.is_preview) return true;
      var pos = lmsAllLessons.findIndex(function (l) { return l.id === lesson.id; });
      if (pos <= 0) return false; // first lesson overall
      var prevLesson = lmsAllLessons[pos - 1];
      if (!lmsCompletedLessonIds.has(prevLesson.id)) return true;

      // Module-boundary quiz gate: if prevLesson was the last lesson of its module,
      // and that module has a published quiz, it must be passed too.
      if (prevLesson.module_id !== lesson.module_id) {
        var prevModuleQuiz = lmsCurrentModuleQuizzes[prevLesson.module_id];
        if (prevModuleQuiz && !lmsPassedModuleQuizIds.has(prevModuleQuiz.id)) return true;
      }
      return false;
    }

    function showLessonLockedNotice() {
      alert('Complete the previous lesson to unlock this lesson.');
    }

    // Loads lesson_progress for the signed-in user + this course, then re-renders the curriculum
    // with correct lock/complete states. Silently no-ops (falls back to "all locked but lesson 1")
    // if lesson_progress does not exist yet or the user is not enrolled.
    async function loadLessonProgressAndUnlockState(course, modules, lessons) {
      lmsCompletedLessonIds = new Set();
      lmsPassedModuleQuizIds = new Set();
      lmsEnrollmentActive = false;
      try {
        var userRes = await sb.auth.getUser();
        var user = userRes.data ? userRes.data.user : null;
        if (!user) { renderModules(modules, lessons); return; }

        var enrollRes = await sb
          .from('course_enrollments')
          .select('id, status')
          .eq('course_id', course.id)
          .eq('member_id', user.id)
          .maybeSingle();

        lmsCurrentEnrollmentId = null;
        if (enrollRes.data && (enrollRes.data.status === 'active' || enrollRes.data.status === 'completed')) {
          lmsEnrollmentActive = true;
          lmsCurrentEnrollmentId = enrollRes.data.id;
        }

        if (lmsEnrollmentActive) {
          var progRes = await sb
            .from('lesson_progress')
            .select('lesson_id, status')
            .eq('course_id', course.id)
            .eq('member_id', user.id);

          if (!progRes.error && progRes.data) {
            progRes.data.forEach(function (row) {
              if (row.status === 'completed') lmsCompletedLessonIds.add(row.lesson_id);
            });
          } else if (progRes.error) {
            // Table likely doesn't exist yet (Phase 6 schema not applied) — degrade gracefully.
            console.warn('SHAOOR LMS: lesson_progress unavailable, showing lesson 1 only', progRes.error);
          }

          // Passed quizzes (Phase 7) — read-only, does not reveal correct answers.
          try {
            var quizIds = Object.keys(lmsCurrentModuleQuizzes).map(function (k) { return lmsCurrentModuleQuizzes[k].id; });
            if (quizIds.length) {
              var attemptsRes = await sb
                .from('quiz_attempts')
                .select('quiz_id, passed')
                .eq('member_id', user.id)
                .in('quiz_id', quizIds);
              (attemptsRes.data || []).forEach(function (a) {
                if (a.passed) lmsPassedModuleQuizIds.add(a.quiz_id);
              });
            }
          } catch (e) {
            console.warn('SHAOOR LMS: quiz_attempts unavailable', e);
          }
        }
      } catch (e) {
        console.error('SHAOOR LMS: could not load lesson progress', e);
      }
      renderModules(modules, lessons);
      renderFinalAssessmentRow();
      maybeShowCertificateButton(); // Phase 10: returning student who already qualifies sees the button right away
    }

    function ytEmbedFromLesson(lesson) {
      if (lesson.youtube_video_id) return 'https://www.youtube.com/embed/' + lesson.youtube_video_id;
      if (lesson.youtube_url && typeof ytEmbedUrl === 'function') return ytEmbedUrl(lesson.youtube_url);
      return null;
    }

    function ytWatchUrlFromLesson(lesson) {
      var raw = lesson.youtube_url || (lesson.youtube_video_id ? 'https://www.youtube.com/watch?v=' + lesson.youtube_video_id : null);
      if (!raw) return null;
      return typeof decodeUrlEntities === 'function' ? decodeUrlEntities(raw) : raw;
    }

    function openLesson(lessonId) {
      var lesson = lmsAllLessons.find(function (l) { return l.id === lessonId; });
      if (!lesson) return;
      if (isLessonLocked(lesson)) { showLessonLockedNotice(); return; }

      lmsCurrentLessonId = lessonId;
      var player = document.getElementById('lmsLessonPlayer');
      player.classList.add('active');
      player.scrollIntoView({ behavior: 'smooth', block: 'start' });

      document.getElementById('lmsPlayerLessonTitle').textContent = lesson.title || 'Lesson';
      document.getElementById('lmsPlayerLessonDesc').textContent = lesson.description || '';

      var embedUrl = ytEmbedFromLesson(lesson);
      var watchUrl = ytWatchUrlFromLesson(lesson);
      var frameWrap = document.getElementById('lmsPlayerFrameWrap');
      var lockedMsg = document.getElementById('lmsPlayerLockedMsg');
      var iframe = document.getElementById('lmsPlayerIframe');
      var fallbackWrap = document.getElementById('lmsPlayerFallbackLink');

      if (embedUrl) {
        frameWrap.style.display = '';
        lockedMsg.style.display = 'none';
        iframe.src = embedUrl;
        // Embedding restrictions (private video, owner disabled embedding, or the
        // page being viewed inside a nested/sandboxed iframe) can make the YouTube
        // player show its own "An error occurred" message with no way for our code
        // to detect that failure from the outside — a cross-origin iframe never
        // reports its internal errors to the parent page. So instead of trying to
        // catch that failure, we always show a direct "watch on YouTube" link as a
        // guaranteed fallback the student can use no matter what.
        if (fallbackWrap && watchUrl) {
          fallbackWrap.style.display = '';
          fallbackWrap.querySelector('a').href = watchUrl;
        } else if (fallbackWrap) {
          fallbackWrap.style.display = 'none';
        }
      } else {
        frameWrap.style.display = 'none';
        iframe.src = '';
        lockedMsg.style.display = '';
        lockedMsg.textContent = 'Video for this lesson has not been added yet.';
        if (fallbackWrap) fallbackWrap.style.display = 'none';
      }

      var isCompleted = lmsCompletedLessonIds.has(lessonId);
      var completeBtn = document.getElementById('lmsMarkCompleteBtn');
      completeBtn.innerHTML = isCompleted
        ? '<i class="fas fa-check-circle"></i> Completed'
        : '<i class="fas fa-check"></i> Mark as Complete';
      completeBtn.disabled = isCompleted;

      var pos = lmsAllLessons.findIndex(function (l) { return l.id === lessonId; });
      document.getElementById('lmsPrevLessonBtn').disabled = (pos <= 0);
      document.getElementById('lmsNextLessonBtn').disabled = (pos >= lmsAllLessons.length - 1) || isLessonLocked(lmsAllLessons[pos + 1] || {});
    }

    function goToAdjacentLesson(direction) {
      var pos = lmsAllLessons.findIndex(function (l) { return l.id === lmsCurrentLessonId; });
      if (pos === -1) return;
      var targetPos = pos + direction;
      if (targetPos < 0 || targetPos >= lmsAllLessons.length) return;
      var target = lmsAllLessons[targetPos];
      if (isLessonLocked(target)) { showLessonLockedNotice(); return; }
      openLesson(target.id);
    }

    // Student manually confirms completion. The system does not verify actual video watch time —
    // this only records that the student marked the lesson complete per SHAOOR LMS rules.
    async function markLessonComplete() {
      if (!lmsCurrentLessonId || !lmsCurrentCourse) return;
      var userRes = await sb.auth.getUser();
      var user = userRes.data ? userRes.data.user : null;
      if (!user) { alert('Please sign in to track your lesson progress.'); return; }

      if (!lmsCurrentEnrollmentId) {
        alert('You need an active enrollment in this course before progress can be tracked. Please enroll first.');
        return;
      }
      var currentLesson = lmsAllLessons.find(function (l) { return l.id === lmsCurrentLessonId; });
      if (!currentLesson || !currentLesson.module_id) {
        alert('Could not determine this lesson\'s module. Please refresh the page and try again.');
        return;
      }

      var btn = document.getElementById('lmsMarkCompleteBtn');
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…';

      try {
        // lesson_progress requires enrollment_id + module_id (both NOT NULL), and its real
        // UNIQUE constraint is (enrollment_id, lesson_id) — not (course_id, lesson_id, member_id).
        var upsertRes = await sb
          .from('lesson_progress')
          .upsert({
            enrollment_id: lmsCurrentEnrollmentId,
            course_id: lmsCurrentCourse.id,
            module_id: currentLesson.module_id,
            lesson_id: lmsCurrentLessonId,
            member_id: user.id,
            status: 'completed',
            completed_at: new Date().toISOString()
          }, { onConflict: 'enrollment_id,lesson_id' });

        if (upsertRes.error) {
          console.error('SHAOOR LMS: could not save lesson progress', upsertRes.error);
          alert('Could not save your progress. The Learning Academy database may still need the lesson_progress table added — please contact an administrator.');
          btn.disabled = false;
          btn.innerHTML = '<i class="fas fa-check"></i> Mark as Complete';
          return;
        }

        lmsCompletedLessonIds.add(lmsCurrentLessonId);
        renderModules(lmsCurrentModules, lmsAllLessons); // refresh lock/complete icons in the sidebar list
        renderFinalAssessmentRow(); // may now be eligible if this was the last lesson
        maybeShowCertificateButton(); // Phase 10: may now be eligible if there's no final assessment
        openLesson(lmsCurrentLessonId); // refresh player button state (Prev/Next/Complete)
      } catch (e) {
        console.error('SHAOOR LMS: unexpected error saving lesson progress', e);
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-check"></i> Mark as Complete';
      }
    }

    function closeCourseDetail() {
      document.getElementById('courseDetail').classList.remove('active');
      document.getElementById('lmsCatalogSection').style.display = '';
      history.pushState('', document.title, window.location.pathname + window.location.search);
      document.getElementById('lmsCatalogSection').scrollIntoView({ behavior: 'smooth' });
      resetCourseSeoMeta();
    }

    /* ── PHASE 2 REWORK: dedicated Learning Academy overlay open/close ── */
    function openLearningAcademy(levelFilter) {
      document.getElementById('lmsAcademyOverlay').classList.add('active');
      document.body.style.overflow = 'hidden';
      // Apply the requested pathway filter (beginner/intermediate/advanced/all) to the existing filter buttons.
      if (levelFilter) {
        document.querySelectorAll('#lmsFilters .lms-filter-btn').forEach(function (b) {
          b.classList.toggle('active', b.getAttribute('data-filter') === levelFilter);
        });
        if (typeof lmsCurrentFilter !== 'undefined') {
          lmsCurrentFilter = levelFilter;
          if (typeof renderCourseCatalog === 'function') renderCourseCatalog();
        }
      }
      document.getElementById('lmsAcademyOverlay').scrollTop = 0;
    }

    function closeLearningAcademy() {
      document.getElementById('lmsAcademyOverlay').classList.remove('active');
      document.body.style.overflow = '';
      // If a course detail was open inside the academy, reset back to the catalog for next time.
      var detail = document.getElementById('courseDetail');
      if (detail.classList.contains('active')) { closeCourseDetail(); }
      document.getElementById('courses').scrollIntoView({ behavior: 'smooth' });
    }

    /* ── SEO meta for course detail pages (Phase 13 addition) ──
       Published courses may set seo_title / seo_description / seo_og_image;
       falls back to the course's own title/description/thumbnail, and never
       touches the tags for unpublished courses (they are excluded by the
       .eq('status','published') filter in showCourseDetail already). */
    var lmsDefaultTitle = document.title;
    var lmsDefaultDescMeta = document.querySelector('meta[name="description"]');
    var lmsDefaultDesc = lmsDefaultDescMeta ? lmsDefaultDescMeta.getAttribute('content') : '';

    function setMetaTag(attr, key, content) {
      if (!content) return;
      var el = document.querySelector('meta[' + attr + '="' + key + '"]');
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    }

    function applyCourseSeoMeta(course) {
      var title = course.seo_title || course.title || lmsDefaultTitle;
      var desc = course.seo_description || course.description || lmsDefaultDesc;
      var image = course.seo_og_image || course.thumbnail_url || '';

      document.title = title;
      setMetaTag('name', 'description', desc);
      setMetaTag('property', 'og:title', title);
      setMetaTag('property', 'og:description', desc);
      if (image) setMetaTag('property', 'og:image', image);
    }

    function resetCourseSeoMeta() {
      document.title = lmsDefaultTitle;
      setMetaTag('name', 'description', lmsDefaultDesc);
      setMetaTag('property', 'og:title', lmsDefaultTitle);
      setMetaTag('property', 'og:description', lmsDefaultDesc);
    }

    async function enrollInCourse() {
      if (!lmsCurrentCourse) return;
      var btn = event ? event.currentTarget : null;

      var userRes = await sb.auth.getUser();
      var user = userRes.data ? userRes.data.user : null;

      if (!user) {
        // Not authenticated — reuse the existing SHAOOR sign-in modal.
        lmsPendingEnrollCourseId = lmsCurrentCourse.id; // resume enrollment automatically after login/signup
        alert('Please sign in or create a SHAOOR account to enroll in this course.');
        closeModal('signupModal');
        openModal('loginModal');
        return;
      }

      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enrolling…'; }

      try {
        // Check for an existing enrollment first (course_id + member_id is unique).
        var existing = await sb
          .from('course_enrollments')
          .select('id, status')
          .eq('course_id', lmsCurrentCourse.id)
          .eq('member_id', user.id)
          .maybeSingle();

        if (existing.data) {
          alert('You are already enrolled in this course. Check "My Learning" in your member portal.');
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-play"></i> CONTINUE LEARNING'; }
          return;
        }

        var isPaid = !!lmsCurrentCourse.is_paid;
        var insertRes = await sb.from('course_enrollments').insert({
          course_id: lmsCurrentCourse.id,
          member_id: user.id,
          status: isPaid ? 'pending' : 'active',
          payment_status: isPaid ? 'pending' : 'not_required',
          progress_percent: 0
        }).select().single();

        if (insertRes.error) {
          console.error('SHAOOR LMS: enrollment failed', insertRes.error);
          alert('Something went wrong while enrolling. Please try again.');
          if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus"></i> ENROLL NOW'; }
          return;
        }

        if (isPaid) {
          alert('Enrollment request received. Your seat will be confirmed once payment is approved by SHAOOR.');
          if (btn) { btn.innerHTML = '<i class="fas fa-clock"></i> PENDING APPROVAL'; }
        } else {
          alert('You are enrolled! You can start learning from "My Learning" in your member portal.');
          if (btn) { btn.innerHTML = '<i class="fas fa-check"></i> ENROLLED'; }
        }
      } catch (e) {
        console.error('SHAOOR LMS: unexpected enrollment error', e);
        alert('Something went wrong while enrolling. Please try again.');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-user-plus"></i> ENROLL NOW'; }
      }
    }
