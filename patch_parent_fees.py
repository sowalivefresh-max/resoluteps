import re

with open('public/ParentDashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update UI
old_comment_ui = """        <div class="aa-form-group">
          <label class="aa-label">Comment/Note (Optional)</label>
          <input type="text" id="payComment" class="aa-input" placeholder="e.g. Paying for John and Jane, or paying for books">
        </div>"""

new_comment_ui = """        <div class="aa-form-group">
          <label class="aa-label">Payment For (Select all that apply)</label>
          <div id="paymentPurposeList" style="max-height: 150px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; border-radius: 4px; background: #fff;">
             <!-- Checkboxes injected here -->
          </div>
        </div>
        <div class="aa-form-group">
          <label class="aa-label">Comment/Note (Optional)</label>
          <input type="text" id="payComment" class="aa-input" placeholder="e.g. Paying for John and Jane, or paying for books">
        </div>"""

content = content.replace(old_comment_ui, new_comment_ui)

# 2. Update openSubmitPaymentModal
old_open_modal = """    function openSubmitPaymentModal() {
      var sid = document.getElementById('finChildSelect').value;
      if(!sid) return showToast('Please select a child first.', 'warning');
      document.getElementById('payAmount').value = '';
      document.getElementById('payMethod').value = 'Bank Transfer';
      document.getElementById('proofContainer').style.display = 'block';
      document.getElementById('payProofInput').value = '';
      document.getElementById('payProofBase64').value = '';
      document.getElementById('payProofPreview').style.display = 'none';
      document.getElementById('payProofPreview').innerHTML = '';
      openModal('submitPaymentModal');
    }"""

new_open_modal = """    function openSubmitPaymentModal() {
      var sid = document.getElementById('finChildSelect').value;
      if(!sid) return showToast('Please select a child first.', 'warning');
      document.getElementById('payAmount').value = '';
      document.getElementById('payMethod').value = 'Bank Transfer';
      document.getElementById('proofContainer').style.display = 'block';
      document.getElementById('payProofInput').value = '';
      document.getElementById('payProofBase64').value = '';
      document.getElementById('payProofPreview').style.display = 'none';
      document.getElementById('payProofPreview').innerHTML = '';
      if(document.getElementById('payComment')) document.getElementById('payComment').value = '';

      var purposeList = document.getElementById('paymentPurposeList');
      purposeList.innerHTML = '';
      var purposes = [];
      if (window._activeFinBills && window._activeFinBills.length > 0) {
        window._activeFinBills.forEach(function(b) {
           var items = [];
           try { items = typeof b.lineItems === 'string' ? JSON.parse(b.lineItems) : (b.lineItems || []); } catch(e){}
           items.forEach(function(item) {
             if (item.name && !purposes.includes(item.name)) purposes.push(item.name);
           });
           if (items.length === 0) {
             if(b.tuitionFee && !purposes.includes('Tuition')) purposes.push('Tuition');
             if(b.developmentLevy && !purposes.includes('Dev Levy')) purposes.push('Dev Levy');
             if(b.examFee && !purposes.includes('Exam')) purposes.push('Exam');
             if(b.sportsFee && !purposes.includes('Sports')) purposes.push('Sports');
           }
        });
      }
      var defaultPurposes = ['Tuition', 'Development Levy', 'Books', 'Uniforms', 'Transport', 'Excursion', 'Others'];
      defaultPurposes.forEach(function(p) {
        if (!purposes.includes(p)) purposes.push(p);
      });
      purposes.forEach(function(p) {
        purposeList.innerHTML += '<label style="display:block; margin-bottom:5px; cursor:pointer;"><input type="checkbox" class="pay-purpose-cb" value="'+(AA.escapeHTML?AA.escapeHTML(p):p)+'"> '+(AA.escapeHTML?AA.escapeHTML(p):p)+'</label>';
      });

      openModal('submitPaymentModal');
    }"""

content = content.replace(old_open_modal, new_open_modal)

# 3. Update processSubmitPayment
old_process = """      var proof = document.getElementById('payProofBase64').value;
      var comment = document.getElementById('payComment') ? document.getElementById('payComment').value : '';
      
      console.log('Submitting payment for:', sid, amt, method);
      if(!amt || amt <= 0) return showToast('Enter a valid amount', 'error');
      if(method !== 'Cash' && !proof) return showToast('Please upload a proof of payment', 'error');
      if(proof && proof.length > 2500000) return showToast('Image is too large. Please upload a smaller image.', 'error');

      callServer('parentSubmitPaymentData', [AA.token, {
        studentId: sid, term: currentTerm, session: currentSession, 
        amount: amt, method: method, proofOfPayment: proof, comment: comment
      }]"""

new_process = """      var proof = document.getElementById('payProofBase64').value;
      var commentField = document.getElementById('payComment') ? document.getElementById('payComment').value : '';
      
      var selectedPurposes = [];
      document.querySelectorAll('.pay-purpose-cb:checked').forEach(function(cb) {
        selectedPurposes.push(cb.value);
      });
      var purposeStr = selectedPurposes.length > 0 ? "Payment For: " + selectedPurposes.join(', ') : "";
      var finalComment = commentField;
      if (purposeStr) {
        finalComment = purposeStr + (commentField ? " | " + commentField : "");
      }
      
      console.log('Submitting payment for:', sid, amt, method);
      if(!amt || amt <= 0) return showToast('Enter a valid amount', 'error');
      if(method !== 'Cash' && !proof) return showToast('Please upload a proof of payment', 'error');
      if(proof && proof.length > 2500000) return showToast('Image is too large. Please upload a smaller image.', 'error');

      callServer('parentSubmitPaymentData', [AA.token, {
        studentId: sid, term: currentTerm, session: currentSession, 
        amount: amt, method: method, proofOfPayment: proof, comment: finalComment
      }]"""

content = content.replace(old_process, new_process)

with open('public/ParentDashboard.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('Patched ParentDashboard.html')
