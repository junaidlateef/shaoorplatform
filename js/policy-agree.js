document.getElementById('policyAgree').addEventListener('change', function() {
              const btn = document.getElementById('regFormBtn');
              btn.style.opacity = this.checked ? '1' : '.5';
              btn.style.pointerEvents = this.checked ? 'auto' : 'none';
            });
            function checkPolicy(e) {
              if (!document.getElementById('policyAgree').checked) {
                e.preventDefault();
                showToast('پہلے رازداری پالیسی سے اتفاق کریں', 'error');
                return false;
              }
              return true;
            }
