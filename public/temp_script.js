
    var globalUsers = [];
    var globalStudents = [];
    var globalClasses = [];
    var globalSubjects = [];
    var currentTerm = '';
    var currentSession = '';
    var institutionType = 'both'; // 'both' | 'primary' | 'secondary'
    
    document.addEventListener('DOMContentLoaded', function() {
      initTabs('admin-tabs');
      AA.init();
      function initDashboard() {
        if (!AA.user || !AA.settings || !AA.settings.current_term) return setTimeout(initDashboard, 100);
        
        if (AA.user.role === 'developer') {
          document.getElementById('dev-controls').style.display = 'block';
        }
        
        if (AA.settings.subscription_expiry) {
          var expiry = new Date(AA.settings.subscription_expiry);
          if (!isNaN(expiry.getTime())) {
            var daysLeft = Math.ceil((expiry.getTime() - new Date().getTime()) / (1000 * 3600 * 24));
            var banner = document.getElementById('subscription-countdown-banner');
            if (daysLeft <= 0) {
              banner.style.display = 'flex';
              banner.style.backgroundColor = '#f8d7da';
              banner.style.color = '#721c24';
              banner.innerHTML = '<i class="fa fa-exclamation-triangle"></i> SUBSCRIPTION OVERDUE: The school portal is locked.';
            } else if (daysLeft <= 14) {
              banner.style.display = 'flex';
              banner.style.backgroundColor = '#fff3cd';
              banner.style.color = '#856404';
              banner.innerHTML = '<i class="fa fa-clock"></i> SUBSCRIPTION RENEWAL: ' + daysLeft + ' days remaining until portal lock.';
            }
          }
        }

        if (AA.user.role === 'admin_assistant') {
          document.getElementById('nav-finance').style.display = 'none';
          document.getElementById('nav-approvals').style.display = 'none';
        }
        loadDashboard();
        refreshGlobalData();
      }
      initDashboard();
    });

    function refreshGlobalData() {
      var cid = AA.getActiveCampusId();
      callServer('adminGetUsers', [AA.token, null, cid], function(u){ globalUsers = u; populateTeacherDropdowns(); populateCampusDropdowns(); });
      callServer('adminGetClasses', [AA.token, null, cid], function(c){ globalClasses = c; populateClassDropdowns(); });
      callServer('adminGetSubjects', [AA.token, null, cid], function(s){ globalSubjects = s; });
      callServer('adminGetStudents', [AA.token, null, cid], function(st){ globalStudents = st; });
    }

    function populateTeacherDropdowns() {
      var teachers = globalUsers.filter(function(u) {
        if (!(u.role === 'teacher' || u.role === 'primary_teacher') || !(u.id || u.iD)) return false;
        if (institutionType === 'primary') return u.role === 'primary_teacher' || u.section === 'primary' || u.section === 'both';
        if (false) return u.role === 'teacher' || u.section === 'high' || u.section === 'both';
        return true;
      });
      var options = '<option value="">Select Teacher</option>';
      teachers.forEach(function(t){ options += '<option value="'+(t.id || t.iD)+'">'+t.fullName+'</option>'; });
      document.getElementById('classTeacherSelect').innerHTML = options;
      document.getElementById('subjectTeacherSelect').innerHTML = options;
    }

    // Normalize section value to canonical form: 'high', 'primary', or 'both'
    function normalizeSection(sec) {
      var s = String(sec || '').toLowerCase().trim();
      
      if (s === 'primary' || s === 'primaryschool' || s === 'primary school') return 'primary';
      return s; // 'both' or ''
    }

    function populateClassDropdowns() {
      var filteredClasses = globalClasses.filter(function(c) {
        var sec = normalizeSection(c.section);
        if (institutionType === 'primary') return sec === 'primary' || !sec;
        if (false) return sec === 'high' || !sec;
        return true;
      });
      filteredClasses.sort(function(a, b) { return (a.className || '').localeCompare(b.className || '', undefined, {numeric: true, sensitivity: 'base'}); });
      var options = '<option value="">Select Class</option>';
      filteredClasses.forEach(function(c){ options += '<option value="'+c.className+'">'+c.className+'</option>'; });
      document.getElementById('studentClassSelect').innerHTML = options;
      document.getElementById('subjectClassSelect').innerHTML = '<option value="">All Classes</option>' + options;
    }

    function loadDashboard() {
      callServer('adminGetStats', [AA.token], function(res) {
        document.getElementById('stat-users').textContent = res.users;
        document.getElementById('stat-students').textContent = res.students;
        document.getElementById('stat-classes').textContent = res.classes;
        document.getElementById('stat-subjects').textContent = res.subjects;
      }, null, true);
      
      callServer('adminGetSettings', [AA.token], function(res) {
        var s = (res && res.data !== undefined) ? res.data : (res || {});
        currentTerm = s.current_term || '';
        currentSession = s.current_session || '';
        document.getElementById('currentTermText').textContent = currentTerm + ' ' + currentSession;
        if (s.school_name) document.getElementById('sb-school-name').textContent = s.school_name;

        // --- Plan badge ---
        var planNames = { basic: 'Basic Plan', standard: 'Standard Plan', deluxe: 'Deluxe Plan' };
        var planColors = { basic: 'rgba(100,180,255,0.15);color:#60a5fa;border-color:rgba(100,180,255,0.35)', standard: 'rgba(100,220,150,0.15);color:#4ade80;border-color:rgba(100,220,150,0.35)', deluxe: 'rgba(240,165,0,0.15);color:#f0a500;border-color:rgba(240,165,0,0.3)' };
        var activePlan = (s.subscription_plan || 'basic').toLowerCase();
        var badge = document.getElementById('sb-plan-badge');
        if (badge) {
          badge.textContent = planNames[activePlan] || 'Basic Plan';
          var pc = planColors[activePlan] || planColors.basic;
          badge.style.cssText = 'display:inline-block;margin-top:5px;padding:2px 10px;border-radius:20px;font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;background:' + pc.split(';color:')[0] + ';color:' + pc.split(';color:')[1].split(';')[0] + ';border:1px solid ' + pc.split('border-color:')[1] + ';';
        }

        // Enable subscription plan select for developers only
        var planSelect = document.querySelector('select[name="subscription_plan"]');
        if (planSelect) {
          if (AA.user.role === 'developer') {
            planSelect.disabled = false;
            planSelect.title = '';
            var lockNote = planSelect.nextElementSibling;
            if (lockNote && lockNote.tagName === 'SMALL') lockNote.style.display = 'none';
          } else {
            planSelect.disabled = true;
            planSelect.title = 'Managed by portal administrator';
          }
        }

        // --- Institution type filter ---
        institutionType = 'primary';
        applyInstitutionFilter(institutionType);
      });
    }

    /**
     * Applies institution-type filtering across the admin UI:
     * - Hides/shows section selectors in forms
     * - Filters class, student, subject dropdowns
     * - Hides irrelevant roles from user creation form
     */
    function applyInstitutionFilter(type) {
      var isPrimaryOnly = (type === 'primary');
      var isSecondaryOnly = (type === 'secondary');
      var isSingleSection = isPrimaryOnly || isSecondaryOnly;

      // Roles available per section type
      var primaryRoles   = ['primary_teacher', 'headteacher', 'parent', 'admin', 'admin_assistant', 'accounts', 'nurse', 'developer'];
      var secondaryRoles = ['teacher', 'principal', 'vp', 'parent', 'admin', 'admin_assistant', 'accounts', 'nurse', 'developer'];
      var bothRoles      = ['teacher', 'primary_teacher', 'principal', 'vp', 'headteacher', 'accounts', 'nurse', 'parent', 'admin', 'admin_assistant', 'external', 'developer'];

      var allowedRoles = isSingleSection ? (isPrimaryOnly ? primaryRoles : secondaryRoles) : bothRoles;

      // SECURITY: Only developers can see the developer role option in the UI
      if (AA && AA.user && AA.user.role !== 'developer') {
        allowedRoles = allowedRoles.filter(function(r) { return r !== 'developer'; });
      }

      // Filter the role select in user creation modal
      var roleSelect = document.querySelector('#userForm select[name="role"]');
      if (roleSelect) {
        Array.from(roleSelect.options).forEach(function(opt) {
          opt.style.display = (allowedRoles.indexOf(opt.value) !== -1 || opt.value === '') ? '' : 'none';
        });
        // If current selection is now hidden, reset to first valid option
        if (allowedRoles.indexOf(roleSelect.value) === -1) {
          roleSelect.value = allowedRoles[0] || 'teacher';
        }
      }

      // Section selects in forms: lock and auto-populate when single-section
      var sectionSelects = document.querySelectorAll('select[name="section"]');
      sectionSelects.forEach(function(sel) {
        if (isSingleSection) {
          var lockVal = isPrimaryOnly ? 'primary' : 'high';
          // Hide options that don't belong to this institution type
          Array.from(sel.options).forEach(function(opt) {
            if (opt.value === 'both' || opt.value === (isPrimaryOnly ? 'high' : 'primary')) {
              opt.style.display = 'none';
              opt.hidden = true;
              opt.disabled = true;
            } else {
              opt.style.display = '';
              opt.hidden = false;
              opt.disabled = false;
            }
          });
          sel.value = lockVal;
          sel.disabled = true;
          sel.title = 'Locked by Institution Type setting';
        } else {
          // Dual-section: restore all options and enable
          Array.from(sel.options).forEach(function(opt) { 
            opt.style.display = ''; 
            opt.hidden = false;
            opt.disabled = false;
          });
          sel.disabled = false;
          sel.title = '';
        }
      });
    }

    // --- USERS ---
    function loadUsers() {
      callServer('adminGetUsers', [AA.token], function(data) {
        globalUsers = data;
        populateTeacherDropdowns();
        
        var staffData = data.filter(function(r) { return r.role !== 'parent' && r.role !== 'student'; });
        var parentData = data.filter(function(r) { return r.role === 'parent'; });
        var studentData = data.filter(function(r) { return r.role === 'student'; });
        
        var cols = [
          { key: 'fullName' },
          { key: 'email', render: function(r){ return AA.escapeHTML(r.email || r.username || ''); } }, // For students, email might be username
          { key: 'role', render: function(r){ return AA.formatRole(r.role); } },
          { key: 'section', render: function(r){ var sec = normalizeSection(r.section); return sec === 'high' ? 'High' : (sec==='primary'?'Primary':'Both'); } },
          { key: 'status', render: function(r){ return formatStatus(r.status); } }
        ];
        
        var renderActions = function(r) {
          var uid = r.id || r.iD;
          // Do not show Impersonate button for the current admin user to avoid self-impersonation looping
          var impersonateBtn = (String(uid) !== String(AA.user.id || AA.user.iD)) 
            ? '<button class="aa-btn aa-btn-info aa-btn-xs" title="Impersonate (Login As)" onclick="impersonateUser(\''+uid+'\')"><i class="fa fa-user-secret"></i></button> '
            : '';
            
          return impersonateBtn +
                 '<button class="aa-btn aa-btn-outline aa-btn-xs" title="Edit" onclick="editUser(\''+uid+'\')"><i class="fa fa-edit"></i></button> ' +
                 '<button class="aa-btn aa-btn-warning aa-btn-xs" title="Reset Pwd" onclick="adminResetPassword(\''+uid+'\')"><i class="fa fa-key"></i></button> ' +
                 '<button class="aa-btn aa-btn-danger aa-btn-xs" title="Delete" onclick="deleteUser(\''+uid+'\')"><i class="fa fa-trash"></i></button>';
        };
        
        buildTable('staffTable', cols, staffData, renderActions);
        buildTable('parentsTable', cols, parentData, renderActions);
        buildTable('studentsPortalTable', cols, studentData, renderActions);
      }, null, true);
    }
    
    function impersonateUser(id) {
      // Open tab immediately to prevent popup blockers
      var newTab = window.open('about:blank', '_blank');
      if (newTab) {
        newTab.document.write('<div style="font-family:sans-serif;padding:50px;text-align:center;color:#1e3a5f;"><h2>Securely switching accounts...</h2><p>Please wait.</p></div>');
      } else {
        showToast('Popup blocked! Please allow popups for this site.', 'warning');
      }
      
      callServer('adminImpersonateUser', [AA.token, id], function(res) {
        if (res.success && res.token && res.role) {
          var dashboardMap = {
            developer: 'AdminDashboard.html', admin: 'AdminDashboard.html', admin_assistant: 'AdminAssistantDashboard.html',
            principal: 'PrincipalDashboard.html', vp: 'VPDashboard.html',
            headteacher: 'HeadTeacherDashboard.html', teacher: 'TeacherDashboard.html',
            primary_teacher: 'PrimaryTeacherDashboard.html', accounts: 'AccountsDashboard.html',
            parent: 'ParentDashboard.html', student: 'StudentDashboard.html', storekeeper: 'StorekeeperDashboard.html',
            nurse: 'NurseDashboard.html'
          };
          var dashboard = dashboardMap[res.role] || 'Login.html';
          var redirectUrl = dashboard + '?token=' + encodeURIComponent(res.token);

          if (newTab) {
            newTab.location.href = redirectUrl;
          } else {
            window.open(redirectUrl, '_blank');
          }
        } else {
          if (newTab) newTab.close();
          showToast(res.message || 'Failed to impersonate user.', 'error');
        }
      }, null, false); // Don't show the spinner in this tab
    }
    function editUser(id) {
      var u = globalUsers.find(function(x) { return String(x.id||x.iD) === String(id); });
      if(!u) return;
      document.getElementById('userId').value = id;
      setFormData('userForm', u);
      document.getElementById('userSigPreview').innerHTML = u.signature ? '<img src="'+u.signature+'" style="width:100%;height:100%;object-fit:contain;">' : '<i class="fa fa-signature text-muted"></i>';
      openModal('userModal');
      applyInstitutionFilter(institutionType);
    }
    function saveUser() {
      var data = getFormData('userForm');
      if(!data.fullName || !data.email) return showToast('Required fields missing','error');
      var id = document.getElementById('userId').value;
      if(id) {
        if(!data.password) delete data.password;
        callServer('adminUpdateUser', [AA.token, id, data], function(res){ showToast(res.message, res.success?'success':'error'); if(res.success){closeModal('userModal');loadUsers();} }, null, true);
      } else {
        if(!data.password) return showToast('Password required for new users','error');
        callServer('adminCreateUser', [AA.token, data], function(res){ showToast(res.message, res.success?'success':'error'); if(res.success){closeModal('userModal');loadUsers();} }, null, true);
      }
    }
    function deleteUser(id) {
      aaConfirm('Are you sure you want to delete this user?', function() {
        callServer('adminDeleteUser', [AA.token, id], function(res){ showToast(res.message, res.success?'success':'error'); if(res.success)loadUsers(); }, null, true);
      });
    }

    // --- STUDENTS ---
    function loadStudents() {
      callServer('adminGetStudents', [AA.token], function(data) {
        globalStudents = data;
        buildTable('studentsTable', [
          { key: 'admissionNumber' },
          { key: 'fullName' },
          { key: 'className', render: function(r){ return r.className || r.class || ''; } },
          { key: 'gender' },
          { key: 'status', render: function(r){ return formatStatus(r.status); } }
        ], data, function(r) {
          var id = r.id || r.iD;
          return '<button class="aa-btn aa-btn-outline aa-btn-xs" title="Edit" onclick="editStudent(\''+id+'\')"><i class="fa fa-edit"></i></button> ' +
                 '<button class="aa-btn aa-btn-success aa-btn-xs" title="Subjects" onclick="manageEnrollment(\''+id+'\', \''+r.fullName+'\')"><i class="fa fa-book"></i></button> ' +
                 '<button class="aa-btn aa-btn-info aa-btn-xs" title="Generate ID Card" onclick="generateIDCard(\''+id+'\')"><i class="fa fa-id-card"></i></button> ' +
                 '<button class="aa-btn aa-btn-danger aa-btn-xs" title="Delete" onclick="deleteStudent(\''+id+'\')"><i class="fa fa-trash"></i></button>';
        });
      }, null, true);
    }

    function generateIDCard(studentId) {
      showToast('Generating ID Card, please wait...', 'info');
      callServer('adminGenerateIDCard', [AA.token, studentId], function(res) {
        if (res.success) openPDFViewer(res.previewUrl, res.downloadUrl, 'Student ID Card');
        else showToast(res.message, 'error');
      }, null, true);
    }

    function previewStudentPhoto(input) {
      if (input.files && input.files[0]) {
        resizeAndCompressImage(input.files[0], 200, 0.75, function(base64) {
          document.getElementById('studentPhotoBase64').value = base64;
          document.getElementById('studentPhotoPreview').innerHTML = '<img src="' + base64 + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
        });
      }
    }
    

    function editStudent(id) {
      var s = globalStudents.find(function(x) { return String(x.id||x.iD) === String(id); });
      if(!s) return;
      document.getElementById('studentId').value = id;
      
      // The Students sheet column "Class" maps to key "class" via toCamelCase,
      // but the form field is named "className". Copy the value so setFormData can find it.
      var formData = Object.assign({}, s);
      if (formData.class && !formData.className) formData.className = formData.class;
      
      // Normalize section to match dropdown option values ('high' or 'primary')
      if (formData.section) formData.section = normalizeSection(formData.section);
      
      // For single-section schools, force the correct section
      if (!formData.section || formData.section === '') {
        if (false) formData.section = 'high';
        else if (institutionType === 'primary') formData.section = 'primary';
      }
      
      setFormData('studentForm', formData);
      
      // Handle photo preview
      var photoPreview = document.getElementById('studentPhotoPreview');
      if (s.photoUrl) {
        photoPreview.innerHTML = '<img src="' + s.photoUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
      } else {
        photoPreview.innerHTML = '<i class="fa fa-user" style="color:#aaa;"></i>';
      }
      document.getElementById('studentPhotoBase64').value = s.photoUrl || '';
      document.getElementById('studentPhotoInput').value = '';
      
      // Resolve parent email
      document.getElementById('studentParentEmail').value = '';
      if(s.parentID || s.parentId) {
         var p = globalUsers.find(function(u){ return String(u.id||u.iD)===String(s.parentID||s.parentId);});
         if(p) document.getElementById('studentParentEmail').value = p.email;
      }
      openModal('studentModal');
      // Re-apply institution filter AFTER setFormData so the section dropdown
      // is correctly locked/populated for single-section schools.
      applyInstitutionFilter(institutionType);
    }
    function saveStudent() {
      var data = getFormData('studentForm');
      
      // For single-section schools, the section dropdown is disabled and may not submit its value.
      // Force the correct section value based on institution type.
      if (!data.section || data.section === '') {
        if (false) data.section = 'high';
        else if (institutionType === 'primary') data.section = 'primary';
        else data.section = 'both';
      }
      
      var pEmail = document.getElementById('studentParentEmail').value.trim();
      if(pEmail) {
        var p = globalUsers.find(function(u){ return u.email === pEmail && u.role === 'parent'; });
        if(!p) return showToast('Parent email not found or not a parent account','error');
        data.parentId = p.id || p.iD;
      } else { data.parentId = ''; }
      
      var id = document.getElementById('studentId').value;
      if(id) {
        callServer('adminUpdateStudent', [AA.token, id, data], function(res){ showToast(res.message, res.success?'success':'error'); if(res.success){closeModal('studentModal');loadStudents();} }, null, true);
      } else {
        callServer('adminCreateStudent', [AA.token, data], function(res){ showToast(res.message, res.success?'success':'error'); if(res.success){closeModal('studentModal');loadStudents();} }, null, true);
      }
    }
    function deleteStudent(id) {
      aaConfirm('Are you sure you want to delete this student?', function() {
        callServer('adminDeleteStudent', [AA.token, id], function(res){ showToast(res.message, res.success?'success':'error'); if(res.success)loadStudents(); }, null, true);
      });
    }

    // --- CLASSES ---
    function loadClasses() {
      callServer('adminGetClasses', [AA.token], function(data) {
        
        globalClasses = data;
        populateClassDropdowns();
        buildTable('classesTable', [
          { key: 'className' },
          { key: 'section', render: function(r){ return normalizeSection(r.section) === 'high' ? 'High' : 'Primary'; } },
          { key: 'classTeacherId', render: function(r){ 
             var tIds = r.classTeacherIds || (r.classTeacherId ? [r.classTeacherId] : (r.classTeacherID ? [r.classTeacherID] : []));
             if (tIds.length === 0) return 'None';
             var names = [];
             tIds.forEach(function(tId) {
               var t = globalUsers.find(function(u){return String(u.id||u.iD)===String(tId);});
               if(t) names.push(t.fullName);
             });
             return names.length > 0 ? names.join(', ') : 'None'; 
          }},
          { key: 'academicSession' }
        ], data, function(r) {
          var id = r.id || r.iD;
          var tIds = r.classTeacherIds || (r.classTeacherId ? [r.classTeacherId] : (r.classTeacherID ? [r.classTeacherID] : []));
          var tIdStr = tIds.join(',');
          return '<button class="aa-btn aa-btn-info aa-btn-xs" title="Generate Bulk Results" onclick="generateBulkClassResult(\''+r.className+'\')"><i class="fa fa-file-pdf"></i></button> ' +
                 '<button class="aa-btn aa-btn-outline aa-btn-xs" title="Edit Class" onclick="editClass(\''+id+'\', \''+r.className+'\', \''+r.section+'\', \''+tIdStr+'\')"><i class="fa fa-edit"></i></button> ' +
                 '<button class="aa-btn aa-btn-danger aa-btn-xs" title="Delete Class" onclick="deleteClass(\''+id+'\')"><i class="fa fa-trash"></i></button>';
        });
      }, null, true);
    }
    function editClass(id, name, sec, teacherIdsStr) {
      document.getElementById('classId').value = id;
      setFormData('classForm', {className:name, section:sec, classTeacherIds: teacherIdsStr || ''});
      openModal('classModal');
    }
    function saveClass() {
      var data = getFormData('classForm');
      var id = document.getElementById('classId').value;
      if(id) {
        callServer('adminUpdateClass', [AA.token, id, data], function(res){ showToast(res.message, res.success?'success':'error'); if(res.success){closeModal('classModal');loadClasses();} }, null, true);
      } else {
        callServer('adminCreateClass', [AA.token, data], function(res){ showToast(res.message, res.success?'success':'error'); if(res.success){closeModal('classModal');loadClasses();} }, null, true);
      }
    }
    function deleteClass(id) {
      aaConfirm('Delete this class? This may affect student records.', function() {
        callServer('adminDeleteClass', [AA.token, id], function(res){ showToast(res.message, res.success?'success':'error'); if(res.success)loadClasses(); }, null, true);
      });
    }
    function generateBulkClassResult(className) {
      if(!currentTerm || !currentSession) return showToast('Session not loaded.', 'error');
      var rptType = confirm('Generate a Half-Term report instead of Full-Term?\n\nOK = Half-Term\nCancel = Full-Term') ? 'Half Term' : 'Full Term';
      aaConfirm('Generate ' + rptType + ' bulk results PDF for ' + className + '?<br><small class="text-muted">This may take a few moments depending on class size.</small>', function() {
        showToast('Generating bulk results for ' + className + '...', 'info');
        callServer('adminGenerateBulkResult', [AA.token, className, currentTerm, currentSession, rptType], function(res) {
          if(res.success) {
            showToast('Bulk results ready!', 'success');
            openPDFViewer(res.previewUrl, res.downloadUrl, className + ' - Bulk Results');
          } else {
            showToast(res.message || 'Failed to generate results.', 'error');
          }
        }, null, true);
      });
    }

        var currentGradingSystems = [];
    function loadGrading() {
      callServer('getGradingSystems', [AA.token], function(data) {
        currentGradingSystems = data;
        var tbody = document.querySelector('#gradingSystemsTable tbody');
        tbody.innerHTML = '';
        if(!data || data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" class="aa-text-center">No grading systems found</td></tr>';
          return;
        }
        data.forEach(function(gs) {
          var tr = document.createElement('tr');
          var classes = (gs.targetClasses && gs.targetClasses.length > 0) ? gs.targetClasses.join(', ') : '<i>All classes in section</i>';
          var rulesCount = (gs.rules || []).length;
          var section = gs.targetSection ? (gs.targetSection.charAt(0).toUpperCase() + gs.targetSection.slice(1)) : 'Both';
          
          tr.innerHTML = '<td>' + AA.escapeHTML(gs.name || gs.id) + '</td>' +
                         '<td>' + section + '</td>' +
                         '<td><small>' + classes + '</small></td>' +
                         '<td>' + rulesCount + '</td>' +
                         '<td>' +
                           '<button class="aa-btn aa-btn-outline aa-btn-xs" onclick="editGradingSystem(\'' + gs.id + '\')"><i class="fa fa-edit"></i></button> ' +
                           '<button class="aa-btn aa-btn-danger aa-btn-xs" onclick="deleteGradingSystem(\'' + gs.id + '\')"><i class="fa fa-trash"></i></button>' +
                         '</td>';
          tbody.appendChild(tr);
        });
      }, null, true);
    }
    
    function populateGradingClasses() {
      var sel = document.getElementById('gsClasses');
      sel.innerHTML = '';
      if(typeof globalClasses !== 'undefined') {
        globalClasses.forEach(function(c) {
          var opt = document.createElement('option');
          opt.value = c.className;
          opt.textContent = c.className;
          sel.appendChild(opt);
        });
      }
    }
    
    function openGradingModal() {
      document.getElementById('gradingForm').reset();
      document.getElementById('gsId').value = '';
      document.getElementById('gradingModalTitle').innerText = 'Add Grading System';
      document.getElementById('gradeRulesBody').innerHTML = '';
      populateGradingClasses();
      addGradeRuleRow();
      openModal('gradingModal');
    }
    
    function addGradeRuleRow(grade, min, max, remark) {
      grade = grade || ''; min = min !== undefined ? min : ''; max = max !== undefined ? max : ''; remark = remark || '';
      var tbody = document.getElementById('gradeRulesBody');
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><input type="text" class="aa-input grade-val" value="'+AA.escapeHTML(grade)+'" required style="padding:4px; width:100%;"></td>' +
                     '<td><input type="number" class="aa-input min-val" value="'+min+'" required style="padding:4px; width:100%;"></td>' +
                     '<td><input type="number" class="aa-input max-val" value="'+max+'" required style="padding:4px; width:100%;"></td>' +
                     '<td><input type="text" class="aa-input remark-val" value="'+AA.escapeHTML(remark)+'" style="padding:4px; width:100%;"></td>' +
                     '<td><button type="button" class="aa-btn aa-btn-danger aa-btn-xs" onclick="this.closest(\'tr\').remove()"><i class="fa fa-times"></i></button></td>';
      tbody.appendChild(tr);
    }
    
    function editGradingSystem(id) {
      var gs = currentGradingSystems.find(function(x) { return x.id === id; });
      if(!gs) return;
      document.getElementById('gradingForm').reset();
      document.getElementById('gsId').value = gs.id;
      document.getElementById('gsName').value = gs.name || '';
      document.getElementById('gsSection').value = gs.targetSection || 'both';
      populateGradingClasses();
      document.getElementById('gradingModalTitle').innerText = 'Edit Grading System';
      
      var classSel = document.getElementById('gsClasses');
      for(var i=0; i<classSel.options.length; i++) {
        classSel.options[i].selected = gs.targetClasses && gs.targetClasses.includes(classSel.options[i].value);
      }
      
      document.getElementById('gradeRulesBody').innerHTML = '';
      if(gs.rules && gs.rules.length > 0) {
        gs.rules.forEach(function(r) { addGradeRuleRow(r.grade, r.min, r.max, r.remark); });
      } else {
        addGradeRuleRow();
      }
      
      openModal('gradingModal');
    }
    
    function saveGradingSystem() {
      var id = document.getElementById('gsId').value;
      var name = document.getElementById('gsName').value;
      var section = document.getElementById('gsSection').value;
      var classesSel = document.getElementById('gsClasses');
      var targetClasses = [];
      for(var i=0; i<classesSel.options.length; i++) {
        if(classesSel.options[i].selected) targetClasses.push(classesSel.options[i].value);
      }
      
      var rules = [];
      var rows = document.getElementById('gradeRulesBody').querySelectorAll('tr');
      rows.forEach(function(tr) {
        var g = tr.querySelector('.grade-val').value;
        var mn = tr.querySelector('.min-val').value;
        var mx = tr.querySelector('.max-val').value;
        var rm = tr.querySelector('.remark-val').value;
        if(g && mn !== '' && mx !== '') {
          rules.push({ grade: g, min: Number(mn), max: Number(mx), remark: rm });
        }
      });
      
      if(!name) return showToast('System name is required', 'error');
      
      var payload = {
        name: name,
        targetSection: section,
        targetClasses: targetClasses,
        rules: rules
      };
      if(id) payload.id = id;
      
      callServer('adminSaveGradingSystem', [AA.token, payload], function(res) {
        showToast(res.message, res.success ? 'success' : 'error');
        if(res.success) {
          closeModal('gradingModal');
          loadGrading();
        }
      }, null, true);
    }
    
    function deleteGradingSystem(id) {
      aaConfirm('Are you sure you want to delete this grading system?', function() {
        callServer('adminDeleteGradingSystem', [AA.token, id], function(res) {
          showToast(res.message, res.success ? 'success' : 'error');
          if(res.success) loadGrading();
        }, null, true);
      });
    }

    function downloadFinancialReport() {
      var type = document.getElementById('financeReportType').value;
      showToast('Generating financial report...', 'info');
      
      callServer('adminGetPayments', [AA.token], function(payments) {
        callServer('adminGetExpenses', [AA.token], function(expenses) {
          var rows = [];
          
          if (type === 'income' || type === 'both') {
            var approved = payments.filter(function(p){ return String(p.status||'').toLowerCase() === 'approved'; });
            approved.forEach(function(p) {
              rows.push({
                Date: (p.paymentDate || p.date || '').split('T')[0],
                Type: 'Income',
                Description: 'Payment for ' + (p.term||'') + ' ' + (p.session||'') + ' (Ref: ' + (p.receiptRef||p.id) + ')',
                Amount: parseFloat(p.amount) || 0,
                Status: 'Approved'
              });
            });
          }
          
          if (type === 'expenses' || type === 'both') {
            expenses.forEach(function(e) {
              rows.push({
                Date: (e.date || e.createdAt || '').split('T')[0],
                Type: 'Expense',
                Description: e.description || e.category || 'Expense',
                Amount: parseFloat(e.amount) || 0,
                Status: e.status || 'Cleared'
              });
            });
          }
          
          // Sort by date desc
          rows.sort(function(a, b) {
            return new Date(b.Date) - new Date(a.Date);
          });
          
          if (rows.length === 0) {
            showToast('No records found to export.', 'warning');
            return;
          }
          
          var csvContent = "data:text/csv;charset=utf-8,Date,Type,Description,Amount,Status\n";
          rows.forEach(function(r) {
            var desc = '"' + String(r.Description).replace(/"/g, '""') + '"';
            csvContent += r.Date + "," + r.Type + "," + desc + "," + r.Amount + "," + r.Status + "\n";
          });
          
          var encodedUri = encodeURI(csvContent);
          var link = document.createElement("a");
          link.setAttribute("href", encodedUri);
          link.setAttribute("download", "Financial_Report_" + type + "_" + new Date().getTime() + ".csv");
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          
          showToast('Download started.', 'success');
        }, null, true);
      }, null, true);
    }

    function getFinanceHTML(prefix, title) {
      var displayTitle = title ? '<h3 style="margin-bottom:1rem; border-bottom:2px solid var(--aa-primary); padding-bottom:5px; color:var(--aa-primary);">'+title+'</h3>' : '';
      return `
        ${displayTitle}
        <div class="aa-grid-3 mb-4">
          <div class="aa-stat-card">
            <div class="aa-stat-icon bg-info"><i class="fa fa-file-invoice-dollar"></i></div>
            <div class="aa-stat-value" id="${prefix}-fin-billed">...0.00</div>
            <div class="aa-stat-label">Total Expected (Billed)</div>
          </div>
          <div class="aa-stat-card">
            <div class="aa-stat-icon bg-success"><i class="fa fa-wallet"></i></div>
            <div class="aa-stat-value" id="${prefix}-fin-collected">...0.00</div>
            <div class="aa-stat-label">Actual Revenue (Collected)</div>
          </div>
          <div class="aa-stat-card">
            <div class="aa-stat-icon bg-danger"><i class="fa fa-hand-holding-usd"></i></div>
            <div class="aa-stat-value" id="${prefix}-fin-outstanding">...0.00</div>
            <div class="aa-stat-label">Outstanding Debt</div>
          </div>
          <div class="aa-stat-card">
            <div class="aa-stat-icon bg-warning"><i class="fa fa-receipt"></i></div>
            <div class="aa-stat-value" id="${prefix}-fin-expense">...0.00</div>
            <div class="aa-stat-label">Total Expenses</div>
          </div>
          <div class="aa-stat-card">
            <div class="aa-stat-icon bg-navy"><i class="fa fa-balance-scale"></i></div>
            <div class="aa-stat-value" id="${prefix}-fin-net">...0.00</div>
            <div class="aa-stat-label">Net Cash Flow</div>
          </div>
          <div class="aa-stat-card">
            <div class="aa-stat-icon bg-primary"><i class="fa fa-chart-pie"></i></div>
            <div class="aa-stat-value" id="${prefix}-fin-rate">0%</div>
            <div class="aa-stat-label">Collection Rate</div>
          </div>
        </div>

        <div class="aa-grid-2 mb-4">
          <div class="aa-card">
            <div class="aa-card-header"><h3 class="aa-card-title"><i class="fa fa-chart-pie"></i> Revenue Breakdown</h3></div>
            <div class="aa-card-body">
              <canvas id="${prefix}-chartRevenue" style="max-height: 250px; width:100%;"></canvas>
            </div>
          </div>
          <div class="aa-card">
            <div class="aa-card-header"><h3 class="aa-card-title"><i class="fa fa-chart-bar"></i> Cash Flow Overview</h3></div>
            <div class="aa-card-body">
              <canvas id="${prefix}-chartCashFlow" style="max-height: 250px; width:100%;"></canvas>
            </div>
          </div>
        </div>

        <div class="aa-card mb-4">
          <div class="aa-card-header">
            <h3 class="aa-card-title">Top Debtors</h3>
            <button class="aa-btn aa-btn-primary aa-btn-sm" onclick="downloadDebtorsReport('${prefix}')"><i class="fa fa-download"></i> Export CSV</button>
          </div>
          <div class="aa-card-body" style="padding:0;">
            <table class="aa-table" id="${prefix}-finDebtorsTable">
              <thead><tr><th>Student</th><th>Class</th><th>Amount Owed</th></tr></thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `;
    }

    function fetchAndRenderFinance(prefix) {
      var section = prefix === 'primary' ? 'primary' : 'high';
      // Fetch matched stats from backend for current term/session
      callServer('adminGetFinancialStats', [AA.token, currentTerm, currentSession, section], function(statsRes) {
        if(document.getElementById(prefix + '-fin-billed')) {
          var billed = statsRes.totalBilled || 0;
          var collected = statsRes.totalCollected || 0;
          var outstanding = statsRes.totalOutstanding || 0;
          var expense = statsRes.totalExpenses || 0;
          var net = statsRes.netBalance || (collected - expense);
          var rate = billed > 0 ? ((collected / billed) * 100).toFixed(1) : 0;

          document.getElementById(prefix + '-fin-billed').textContent = formatNaira(billed);
          document.getElementById(prefix + '-fin-collected').textContent = formatNaira(collected);
          document.getElementById(prefix + '-fin-outstanding').textContent = formatNaira(outstanding);
          document.getElementById(prefix + '-fin-expense').textContent = formatNaira(expense);
          
          var netEl = document.getElementById(prefix + '-fin-net');
          netEl.textContent = formatNaira(net);
          netEl.style.color = net >= 0 ? 'var(--aa-success)' : 'var(--aa-danger)';
          
          var rateEl = document.getElementById(prefix + '-fin-rate');
          rateEl.textContent = rate + '%';
          rateEl.style.color = rate >= 80 ? 'var(--aa-success)' : (rate >= 50 ? 'var(--aa-warning)' : 'var(--aa-danger)');

          // Render Charts
          if (typeof Chart !== 'undefined' && typeof chartInstances !== 'undefined') {
            // Revenue Doughnut
            if (chartInstances[prefix + '-revDoughnut']) chartInstances[prefix + '-revDoughnut'].destroy();
            var revCtx = document.getElementById(prefix + '-chartRevenue');
            if (revCtx) {
              chartInstances[prefix + '-revDoughnut'] = new Chart(revCtx, {
                type: 'doughnut',
                data: {
                  labels: ['Collected Revenue', 'Outstanding Debt'],
                  datasets: [{
                    data: [collected, outstanding],
                    backgroundColor: ['#4ade80', '#ef4444'],
                    borderWidth: 0
                  }]
                },
                options: { responsive: true, maintainAspectRatio: false }
              });
            }

            // Cash Flow Bar
            if (chartInstances[prefix + '-cashFlowBar']) chartInstances[prefix + '-cashFlowBar'].destroy();
            var cashCtx = document.getElementById(prefix + '-chartCashFlow');
            if (cashCtx) {
              chartInstances[prefix + '-cashFlowBar'] = new Chart(cashCtx, {
                type: 'bar',
                data: {
                  labels: ['Billed', 'Collected', 'Expenses', 'Net Flow'],
                  datasets: [{
                    label: 'Amount (\u20A6)',
                    data: [billed, collected, expense, net],
                    backgroundColor: ['#3b82f6', '#4ade80', '#f59e0b', net >= 0 ? '#10b981' : '#ef4444'],
                    borderRadius: 4
                  }]
                },
                options: { 
                  responsive: true, 
                  maintainAspectRatio: false,
                  scales: { y: { beginAtZero: true } },
                  plugins: { legend: { display: false } }
                }
              });
            }
          }
        }
      });

      // Fetch top debtors
      callServer('adminGetDebtors', [AA.token, currentTerm, currentSession, section], function(debtorsData) {
        if(document.getElementById(prefix + '-finDebtorsTable')) {
          var top = debtorsData.slice(0, 10);
          buildTable(prefix + '-finDebtorsTable', [
            {key:'studentName'},
            {key:'class'},
            {key:'amountOwed', render:function(r){ return '<span class="text-danger">'+formatNaira(r.amountOwed)+'</span>'; }}
          ], top);
        }
      });
    }

    function loadReports() {
      callServer('adminGetComplianceSummary', [AA.token, AA.settings.current_term, AA.settings.current_session], function(res) {
        var html = '<div style="display:flex; gap:20px; flex-wrap:wrap;">';
        
        // Attendance Block
        html += '<div style="flex:1; min-width:250px; background:#f9fbfc; padding:15px; border-radius:8px;">';
        html += '<h6>Daily Attendance (Today)</h6>';
        html += '<div style="margin-top:10px;">';
        html += '<strong style="color:green;"><i class="fa fa-check-circle"></i> Compliant ('+res.attendanceCompliant.length+')</strong>';
        html += '<ul style="margin:5px 0 15px 15px; padding:0; font-size:12px; color:#555;">';
        if(res.attendanceCompliant.length === 0) html += '<li>None</li>';
        res.attendanceCompliant.forEach(function(t) { html += '<li>'+t.fullName+'</li>'; });
        html += '</ul>';
        html += '<strong style="color:red;"><i class="fa fa-times-circle"></i> Defaulted ('+res.attendanceDefaulted.length+')</strong>';
        html += '<ul style="margin:5px 0 0 15px; padding:0; font-size:12px; color:#555;">';
        if(res.attendanceDefaulted.length === 0) html += '<li>None</li>';
        res.attendanceDefaulted.forEach(function(t) { html += '<li>'+t.fullName+'</li>'; });
        html += '</ul>';
        html += '</div></div>';

        // Lesson Plans Block
        html += '<div style="flex:1; min-width:250px; background:#f9fbfc; padding:15px; border-radius:8px;">';
        html += '<h6>Lesson Plans (This Week)</h6>';
        html += '<div style="margin-top:10px;">';
        html += '<strong style="color:green;"><i class="fa fa-check-circle"></i> Submitted ('+res.plansCompliant.length+')</strong>';
        html += '<ul style="margin:5px 0 15px 15px; padding:0; font-size:12px; color:#555;">';
        if(res.plansCompliant.length === 0) html += '<li>None</li>';
        res.plansCompliant.forEach(function(t) { html += '<li>'+t.fullName+'</li>'; });
        html += '</ul>';
        html += '<strong style="color:red;"><i class="fa fa-times-circle"></i> Defaulted ('+res.plansDefaulted.length+')</strong>';
        html += '<ul style="margin:5px 0 0 15px; padding:0; font-size:12px; color:#555;">';
        if(res.plansDefaulted.length === 0) html += '<li>None</li>';
        res.plansDefaulted.forEach(function(t) { html += '<li>'+t.fullName+'</li>'; });
        html += '</ul>';
        html += '</div></div>';

        html += '</div>';
        
        document.getElementById('compliance-summary').innerHTML = html;
      }, null, true);
      
      if (false) {
        document.getElementById('performance-summary').innerHTML = '<p class="text-muted">Loading...</p>';
        callServer('adminGetSchoolPerformanceAnalytics', [AA.token, AA.settings.current_term, AA.settings.current_session, 'primary'], function(resP) {
            var html = '<div class="d-flex gap-3 flex-wrap">';
            html += '<div class="aa-stat-card flex-1"><h6>Primary School</h6><div class="mt-2">';
            html += '<p class="fs-12">Average Score: <b>'+(resP.overallAverage||0)+'%</b></p>';
            html += '<p class="fs-12">Best Class: <b>'+(resP.bestClass||'N/A')+'</b></p>';
            html += '<p class="fs-12">Top Subject: <b>'+(resP.bestSubject||'N/A')+'</b></p></div></div>';
            html += '<p class="fs-12">Average Score: <b>'+(resH.overallAverage||0)+'%</b></p>';
            html += '<p class="fs-12">Best Class: <b>'+(resH.bestClass||'N/A')+'</b></p>';
            html += '<p class="fs-12">Top Subject: <b>'+(resH.bestSubject||'N/A')+'</b></p></div></div>';
            html += '</div>';
            document.getElementById('performance-summary').innerHTML = html;
          }, null, true);
      } else {
        var section = (institutionType === 'secondary') ? 'high' : 'primary';
        callServer('adminGetSchoolPerformanceAnalytics', [AA.token, AA.settings.current_term, AA.settings.current_session, section], function(res) {
          var html = '<div class="aa-stat-card"><h6>Overall Performance</h6><div class="mt-2">';
          html += '<p class="fs-12">Average Score: <b>'+(res.overallAverage||0)+'%</b></p>';
          html += '<p class="fs-12">Best Performing Class: <b>'+(res.bestClass||'N/A')+'</b></p>';
          html += '<p class="fs-12">Top Subject: <b>'+(res.bestSubject||'N/A')+'</b></p></div></div>';
          document.getElementById('performance-summary').innerHTML = html;
        }, null, true);
      }
    }

    // --- ANALYTICS MODULE ---
    var chartInstances = {};

    function getAnalyticsHTML(prefix, title) {
      var primaryOpts = '<option value="Creche">Creche</option><option value="Pre-Nursery">Pre-Nursery</option><option value="Nursery 1">Nursery 1</option><option value="Nursery 2">Nursery 2</option><option value="Primary 1">Primary 1</option><option value="Primary 2">Primary 2</option><option value="Primary 3">Primary 3</option><option value="Primary 4">Primary 4</option><option value="Primary 5">Primary 5</option><option value="Primary 6">Primary 6</option>';
      var highOpts = '<option value="JSS 1">JSS 1</option><option value="JSS 2">JSS 2</option><option value="JSS 3">JSS 3</option><option value="SS 1">SS 1</option><option value="SS 2">SS 2</option><option value="SS 3">SS 3</option>';
      var yearGroupOpts = '';
      if (prefix === 'primary' || institutionType === 'primary') yearGroupOpts = primaryOpts;
      else if (prefix === 'high' || institutionType === 'secondary') yearGroupOpts = highOpts;
      else yearGroupOpts = primaryOpts + highOpts;

      return `
        <div class="d-flex justify-content-between align-items-center mb-4">
          <h2>${title}</h2>
        </div>
        <div class="aa-grid-3 mb-4" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:20px; margin-bottom:1.5rem;">
          <div class="aa-stat-card">
            <div class="aa-stat-icon"><i class="fa fa-chart-line"></i></div>
            <div class="aa-stat-value" id="${prefix}-analytics-overall">-</div>
            <div class="aa-stat-label">Overall Average</div>
          </div>
          <div class="aa-stat-card">
            <div class="aa-stat-icon bg-navy"><i class="fa fa-trophy"></i></div>
            <div class="aa-stat-value" id="${prefix}-analytics-best-class">-</div>
            <div class="aa-stat-label">Top Performing Class</div>
          </div>
          <div class="aa-stat-card">
            <div class="aa-stat-icon bg-info"><i class="fa fa-book-open"></i></div>
            <div class="aa-stat-value" id="${prefix}-analytics-best-subject">-</div>
            <div class="aa-stat-label">Top Subject</div>
          </div>
        </div>

        <div class="aa-grid-2 mb-4" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(400px, 1fr)); gap:20px; margin-bottom:1.5rem;">
          <div class="aa-card">
            <div class="aa-card-header"><h3 class="aa-card-title">Class Performance Comparison</h3></div>
            <div class="aa-card-body">
              <canvas id="${prefix}-chartClassPerformance" style="max-height: 300px; width:100%;"></canvas>
            </div>
          </div>
          <div class="aa-card">
            <div class="aa-card-header"><h3 class="aa-card-title">Subject Average Scores</h3></div>
            <div class="aa-card-body">
              <canvas id="${prefix}-chartSubjectPerformance" style="max-height: 300px; width:100%;"></canvas>
            </div>
          </div>
        </div>

        <div class="aa-card mb-4" style="margin-bottom:1.5rem;">
          <div class="aa-card-header"><h3 class="aa-card-title">Overall Grade Distribution</h3></div>
          <div class="aa-card-body">
            <div style="max-width: 400px; margin: 0 auto;">
              <canvas id="${prefix}-chartGradeDistribution" style="max-height: 300px; width:100%;"></canvas>
            </div>
          </div>
        </div>

        <div class="aa-card mb-4" style="margin-bottom:1.5rem;">
          <div class="aa-card-header"><h3 class="aa-card-title">Year Group Ranking</h3></div>
          <div class="aa-card-body">
            <div class="d-flex align-items-center mb-3" style="display:flex; gap:10px; flex-wrap:wrap; margin-bottom:1rem;">
              <select id="${prefix}-analytics-year-group" class="aa-input" style="max-width:250px;">
                <option value="">Select Year Group...</option>
                ${yearGroupOpts}
              </select>
              <button class="aa-btn aa-btn-primary" onclick="loadYearGroupRanking('${prefix}')">Load Ranking</button>
            </div>
            <div class="table-responsive" style="overflow-x:auto;">
              <table class="aa-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Student Name</th>
                    <th>Class</th>
                    <th>Total Score</th>
                    <th>Average Score</th>
                  </tr>
                </thead>
                <tbody id="${prefix}-analytics-ranking-tbody">
                  <tr><td colspan="5" class="text-center text-muted">Enter a year group and click Load Ranking to see results.</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    }

    function loadAnalytics() {
      if (!currentTerm || !currentSession) {
        return setTimeout(loadAnalytics, 200);
      }
      var container = document.getElementById('analytics-dynamic-container');
      
      if (false) {
        container.innerHTML = getAnalyticsHTML('primary', 'Primary School Analytics');
        fetchAndRenderAnalytics('primary');
      } else {
        var section = (institutionType === 'secondary') ? 'high' : 'primary';
        container.innerHTML = getAnalyticsHTML(section, '');
        fetchAndRenderAnalytics(section);
      }
    }

    function fetchAndRenderAnalytics(prefix) {
      callServer('adminGetSchoolPerformanceAnalytics', [AA.token, AA.settings.current_term, AA.settings.current_session, prefix], function(res) {
        document.getElementById(prefix + '-analytics-overall').textContent = (res.overallAverage || 0) + '%';
        document.getElementById(prefix + '-analytics-best-class').textContent = res.bestClass || 'N/A';
        document.getElementById(prefix + '-analytics-best-subject').textContent = res.bestSubject || 'N/A';

        // Chart class performance (Bar)
        if (chartInstances[prefix + '-classPerf']) chartInstances[prefix + '-classPerf'].destroy();
        var classCtx = document.getElementById(prefix + '-chartClassPerformance');
        if (classCtx && res.classPerformance) {
          var classLabels = res.classPerformance.map(function(c) { return c.className; });
          var classAvgs = res.classPerformance.map(function(c) { return c.average; });
          chartInstances[prefix + '-classPerf'] = new Chart(classCtx, {
            type: 'bar',
            data: {
              labels: classLabels,
              datasets: [{
                label: 'Class Average (%)',
                data: classAvgs,
                backgroundColor: 'rgba(30, 58, 95, 0.8)', // aa-navy-mid
                borderRadius: 4
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: { y: { beginAtZero: true, max: 100 } }
            }
          });
        }

        // Chart subject performance (Bar)
        if (chartInstances[prefix + '-subjectPerf']) chartInstances[prefix + '-subjectPerf'].destroy();
        var subjectCtx = document.getElementById(prefix + '-chartSubjectPerformance');
        if (subjectCtx && res.subjectPerformance) {
          var subLabels = res.subjectPerformance.map(function(s) { return s.subject; });
          var subAvgs = res.subjectPerformance.map(function(s) { return s.average; });
          chartInstances[prefix + '-subjectPerf'] = new Chart(subjectCtx, {
            type: 'bar',
            data: {
              labels: subLabels,
              datasets: [{
                label: 'Subject Average (%)',
                data: subAvgs,
                backgroundColor: 'rgba(240, 165, 0, 0.8)', // aa-gold
                borderRadius: 4
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false,
              scales: { y: { beginAtZero: true, max: 100 } }
            }
          });
        }

        // Chart Grade Distribution (Doughnut)
        if (chartInstances[prefix + '-gradeDist']) chartInstances[prefix + '-gradeDist'].destroy();
        var gradeCtx = document.getElementById(prefix + '-chartGradeDistribution');
        if (gradeCtx && res.gradeDistribution) {
          var gradeLabels = Object.keys(res.gradeDistribution).sort();
          var gradeData = gradeLabels.map(function(k) { return res.gradeDistribution[k]; });
          var baseColors = ['#16a34a', '#0284c7', '#1e3a5f', '#f0a500', '#d97706', '#dc2626', '#9333ea', '#ec4899', '#0ea5e9'];
          var bgColors = gradeLabels.map(function(k, i) { return baseColors[i % baseColors.length]; });

          chartInstances[prefix + '-gradeDist'] = new Chart(gradeCtx, {
            type: 'doughnut',
            data: {
              labels: gradeLabels.length > 0 ? gradeLabels : ['No Data'],
              datasets: [{
                data: gradeData.length > 0 ? gradeData : [1],
                backgroundColor: gradeData.length > 0 ? bgColors : ['#e2e8f0']
              }]
            },
            options: {
              responsive: true,
              maintainAspectRatio: false
            }
          });
        }
      }, null, true);
    }
    
    function loadYearGroupRanking(prefix) {
      // Default to old ID logic if prefix isn't provided (fallback)
      var selectId = prefix ? (prefix + '-analytics-year-group') : 'analytics-year-group';
      var tbodyId = prefix ? (prefix + '-analytics-ranking-tbody') : 'analytics-ranking-tbody';
      
      var yearGroup = document.getElementById(selectId).value;
      if (!yearGroup || yearGroup.trim() === "") {
        AA.showToast("Please enter a year group (e.g. JSS 1)", "error");
        return;
      }
      var tbody = document.getElementById(tbodyId);
      tbody.innerHTML = '<tr><td colspan="5" class="text-center">Loading ranking... <i class="fa fa-spinner fa-spin"></i></td></tr>';
      
      callServer('adminGetYearGroupRanking', [AA.token, AA.settings.current_term, AA.settings.current_session, yearGroup], function(res) {
        if (!res.ranking || res.ranking.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No students found for this year group.</td></tr>';
          return;
        }
        var html = '';
        res.ranking.forEach(function(student) {
          html += '<tr>' +
            '<td><strong>' + student.rank + '</strong></td>' +
            '<td>' + student.name + '</td>' +
            '<td>' + student.className + '</td>' +
            '<td>' + student.totalScore + '</td>' +
            '<td>' + student.averageScore + '%</td>' +
            '</tr>';
        });
        tbody.innerHTML = html;
      }, function(err) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading ranking.</td></tr>';
      }, true);
    }
    // --- ENROLLMENT ---
    function manageEnrollment(studentId, studentName) {
      document.getElementById('enrollment-student-info').textContent = 'Managing Subjects for: ' + studentName;
      loadEnrollmentData(studentId);
      openModal('enrollmentModal');
    }
    var currentEnrollment = { enrolled: [], available: [] };
    function loadEnrollmentData(sid, showLoader) {
      if (showLoader === undefined) showLoader = true;
      callServer('adminGetStudentSubjects', [AA.token, sid], function(data) {
        currentEnrollment.enrolled = data.enrolled || [];
        currentEnrollment.available = data.available || [];
        renderEnrollmentLists(sid);
      }, null, showLoader);
    }
    function renderEnrollmentLists(sid) {
      var availHtml = '';
      currentEnrollment.available.forEach(function(s) {
        var subId = s.id || s.iD;
        var sectionLabel = s.section === 'primary' ? 'Primary' : 'High';
        var classLabel = s.class || s.className || 'All';
        availHtml += '<div class="d-flex justify-content-between align-items-center mb-1 fs-12 p-1 border-bottom">' +
                     '<span>'+s.subjectName+' <span class="aa-badge aa-badge-'+(s.section==='primary'?'info':'navy')+'" style="font-size:9px;">'+sectionLabel+'</span> ('+classLabel+')</span>' +
                     '<button class="aa-btn aa-btn-success aa-btn-xs" onclick="enrollSubject(\''+sid+'\', \''+subId+'\')">Add</button></div>';
      });
      document.getElementById('available-subjects').innerHTML = availHtml || 'No more subjects available';

      var enrolHtml = '';
      currentEnrollment.enrolled.forEach(function(s) {
        var subId = s.id || s.iD;
        enrolHtml += '<div class="d-flex justify-content-between align-items-center mb-1 fs-12 p-1 border-bottom">' +
                     '<span>'+s.subjectName+'</span>' +
                     '<button class="aa-btn aa-btn-danger aa-btn-xs" onclick="unenrollSubject(\''+sid+'\', \''+subId+'\')">Remove</button></div>';
      });
      document.getElementById('enrolled-subjects').innerHTML = enrolHtml || 'No subjects enrolled';
    }
    function enrollSubject(sid, subid) {
      var idx = currentEnrollment.available.findIndex(function(s) { return String(s.id || s.iD) === String(subid); });
      if (idx !== -1) {
        var subject = currentEnrollment.available.splice(idx, 1)[0];
        currentEnrollment.enrolled.push(subject);
        renderEnrollmentLists(sid);
      }
      callServer('adminEnrollStudent', [AA.token, sid, subid, AA.settings.current_session, AA.settings.current_term], function(res) {
        showToast(res.message, res.success ? 'success' : 'error');
        if(!res.success) loadEnrollmentData(sid, false);
      }, function() {
        loadEnrollmentData(sid, false);
      }, false);
    }
    function unenrollSubject(sid, subid) {
      var idx = currentEnrollment.enrolled.findIndex(function(s) { return String(s.id || s.iD) === String(subid); });
      if (idx !== -1) {
        var subject = currentEnrollment.enrolled.splice(idx, 1)[0];
        currentEnrollment.available.push(subject);
        renderEnrollmentLists(sid);
      }
      callServer('adminUnenrollStudent', [AA.token, sid, subid, AA.settings.current_session], function(res) {
        showToast(res.message, res.success ? 'success' : 'error');
        if(!res.success) loadEnrollmentData(sid, false);
      }, function() {
        loadEnrollmentData(sid, false);
      }, false);
    }

    // --- SUBJECTS ---
    function loadSubjects() {
      callServer('adminGetSubjects', [AA.token], function(data) {
        globalSubjects = data;
        buildTable('subjectsTable', [
          { key: 'subjectName' },
          { key: 'section', render: function(r){ return normalizeSection(r.section) === 'high' ? 'High' : 'Primary'; } },
          { key: 'className', render: function(r){ return (r.className || r.class || 'All').split(',').join(', '); } },
          { key: 'assignedTeacherId', render: function(r){ 
             var tId = r.assignedTeacherId || r.assignedTeacherID;
             var t = globalUsers.find(function(u){return String(u.id||u.iD)===String(tId);});
             return t ? t.fullName : 'None'; 
          }}
        ], data, function(r) {
          var id = r.id || r.iD;
          return '<button class="aa-btn aa-btn-outline aa-btn-xs" onclick="editSubject(\''+id+'\', \''+r.subjectName+'\', \''+r.section+'\', \''+(r.className||r.class||'')+'\')"><i class="fa fa-edit"></i></button> ' +
                 '<button class="aa-btn aa-btn-danger aa-btn-xs" onclick="deleteSubject(\''+id+'\')"><i class="fa fa-trash"></i></button>';
        });
      }, null, true);
    }
    function editSubject(id, name, sec, cls) {
      document.getElementById('subjectId').value = id;
      filterSubjectClassesBySection(sec);
      setFormData('subjectForm', {subjectName:name, section:sec, className:cls});
      openModal('subjectModal');
    }

    function openAddSubjectModal() {
      resetForm('subjectForm');
      document.getElementById('subjectId').value = '';
      var defaultSec = document.getElementById('subjectSectionSelect').value;
      filterSubjectClassesBySection(defaultSec);
      openModal('subjectModal');
    }

    function filterSubjectClassesBySection(section) {
      var sec = normalizeSection(section);
      var filteredClasses = globalClasses.filter(function(c) {
        if (!sec) return true;
        var cSec = normalizeSection(c.section);
        return cSec === sec || !cSec;
      });
      filteredClasses.sort(function(a, b) { return (a.className || '').localeCompare(b.className || '', undefined, {numeric: true, sensitivity: 'base'}); });
      var options = '<option value="">All Classes</option>';
      filteredClasses.forEach(function(c){ options += '<option value="'+c.className+'">'+c.className+'</option>'; });
      document.getElementById('subjectClassSelect').innerHTML = options;
    }
    function saveSubject() {
      var data = getFormData('subjectForm');
      var id = document.getElementById('subjectId').value;
      if(id) {
        callServer('adminUpdateSubject', [AA.token, id, data], function(res){ showToast(res.message, res.success?'success':'error'); if(res.success){closeModal('subjectModal');loadSubjects();} }, null, true);
      } else {
        callServer('adminCreateSubject', [AA.token, data], function(res){ showToast(res.message, res.success?'success':'error'); if(res.success){closeModal('subjectModal');loadSubjects();} }, null, true);
      }
    }
    function deleteSubject(id) {
      aaConfirm('Delete this subject?', function() {
        callServer('adminDeleteSubject', [AA.token, id], function(res){ showToast(res.message, res.success?'success':'error'); if(res.success)loadSubjects(); }, null, true);
      });
    }

    // --- BULK IMPORT ---
    var currentBulkType = '';
    function openBulkModal(type) {
      currentBulkType = type;
      document.getElementById('bulkImportFile').value = '';
      if(type === 'students') {
        document.getElementById('bulkImportTitle').textContent = 'Bulk Import Students';
        document.getElementById('bulkImportDesc').textContent = 'Upload a CSV file with: FullName, AdmissionNumber, ClassName, Section (primary/high), Gender, DateOfBirth';
        document.getElementById('btnDownloadTemplate').onclick = function() { downloadCSVTemplate(['FullName', 'AdmissionNumber', 'ClassName', 'Section', 'Gender', 'DateOfBirth'], 'Students_Template.csv'); };
      } else if(type === 'classes') {
        document.getElementById('bulkImportTitle').textContent = 'Bulk Import Classes';
        document.getElementById('bulkImportDesc').textContent = 'Upload a CSV file with: ClassName, Section (primary/high), AcademicSession';
        document.getElementById('btnDownloadTemplate').onclick = function() { downloadCSVTemplate(['ClassName', 'Section', 'AcademicSession'], 'Classes_Template.csv'); };
      } else if(type === 'subjects') {
        document.getElementById('bulkImportTitle').textContent = 'Bulk Import Subjects';
        document.getElementById('bulkImportDesc').textContent = 'Upload a CSV file with: SubjectName, Section (primary/high), TargetClass';
        document.getElementById('btnDownloadTemplate').onclick = function() { downloadCSVTemplate(['SubjectName', 'Section', 'TargetClass'], 'Subjects_Template.csv'); };
      }
      openModal('bulkImportModal');
    }

    function processBulkImport() {
      var fileInput = document.getElementById('bulkImportFile');
      var btn = document.getElementById('btnProcessBulk');
      if(!fileInput.files || !fileInput.files[0]) return showToast('Please select a CSV file', 'error');
      
      btn.innerText = 'Importing...';
      btn.disabled = true;

      var reader = new FileReader();
      reader.onerror = function() {
        btn.innerText = 'Upload & Import';
        btn.disabled = false;
        showToast('Error reading file. It may be locked by another program.', 'error');
      };
      reader.onload = function(e) {
        try {
          var csvText = e.target.result;
          var rawData = parseCSV(csvText);
          if(!rawData || rawData.length === 0) throw new Error('CSV is empty or invalid');
          
          var data = [];
          for (var i = 0; i < rawData.length; i++) {
            var oldObj = rawData[i];
            var obj = {};
            for (var key in oldObj) {
              if (oldObj.hasOwnProperty(key)) {
                var newKey = key.charAt(0).toLowerCase() + key.slice(1);
                var val = String(oldObj[key] || '');
                if (newKey === 'section') val = normalizeSection(val);
                if (newKey === 'targetClass' || newKey === 'className' || newKey === 'class') {
                  newKey = 'className';
                  val = val.split(',').map(function(s) { return s.trim(); }).filter(Boolean).join(',');
                }
                obj[newKey] = val;
              }
            }
            data.push(obj);
          }
          if(data.length === 0) throw new Error('No valid data rows found in CSV');
          
          var endpoint = '';
          if(currentBulkType === 'students') endpoint = 'adminBulkCreateStudents';
          else if(currentBulkType === 'classes') endpoint = 'adminBulkCreateClasses';
          else if(currentBulkType === 'subjects') endpoint = 'adminBulkCreateSubjects';
          
          if(!endpoint) throw new Error('Invalid bulk import type: ' + currentBulkType);

          callServer(endpoint, [AA.token, data], function(res) {
            btn.innerText = 'Upload & Import';
            btn.disabled = false;
            showToast(res.message, res.success ? 'success' : 'error');
            if(res.success) {
              closeModal('bulkImportModal');
              if(currentBulkType === 'students') loadStudents();
              if(currentBulkType === 'classes') loadClasses();
              if(currentBulkType === 'subjects') loadSubjects();
            }
          }, function(err) {
            btn.innerText = 'Upload & Import';
            btn.disabled = false;
          });
        } catch (err) {
          btn.innerText = 'Upload & Import';
          btn.disabled = false;
          showToast(err.message || 'Error processing CSV', 'error');
        }
      };
      reader.readAsText(fileInput.files[0]);
    }

    // --- AUDIT LOGS ---
    function loadAuditLogs() {
      callServer('adminGetAuditLogs', [AA.token], function(data) {
        buildTable('auditTable', [
          { key: 'timestamp', render: function(r){ return formatDateTime(r.timestamp || r.date || r[4] || ''); } },
          { key: 'userName', render: function(r){ return AA.escapeHTML(r.userName || r.userId || r[1] || 'system'); } },
          { key: 'action', render: function(r){ return '<span class="aa-badge aa-badge-info">' + AA.escapeHTML(r.action || r[2] || '') + '</span>'; } },
          { key: 'details', render: function(r){ return AA.escapeHTML(r.details || r[3] || ''); } }
        ], data);
      }, null, true);
    }

    function exportAuditCSV() {
      const table = document.getElementById('auditTable');
      if(!table) return;
      let csv = [];
      const rows = table.querySelectorAll('tr');
      for (let i = 0; i < rows.length; i++) {
        let row = [], cols = rows[i].querySelectorAll('td, th');
        for (let j = 0; j < cols.length; j++) row.push('"' + cols[j].innerText.replace(/"/g, '""') + '"');
        csv.push(row.join(','));
      }
      const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'audit_logs.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    function exportAuditPDF() {
      const table = document.getElementById('auditTable');
      if(!table) return;
      const newWin = window.open('');
      newWin.document.write('<html><head><title>Audit Logs</title><style>table{border-collapse:collapse;width:100%;font-family:sans-serif}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background-color:#f2f2f2}</style></head><body><h2>Audit Logs</h2>' + table.outerHTML + '</body></html>');
      newWin.document.close();
      newWin.focus();
      setTimeout(function() { newWin.print(); newWin.close(); }, 500);
    }

        // --- SETTINGS ---
      var currentGradebookFormat = [];
      
      function renderGradebookBuilder() {
        var container = document.getElementById('gradebook-builder-container');
        container.innerHTML = '';
        var total = 0;
        currentGradebookFormat.forEach(function(col, index) {
          total += parseInt(col.max) || 0;
          var html = '<div style="display:flex; gap:10px; margin-bottom:10px; align-items:center;">' +
            '<input type="text" class="aa-input flex-1" placeholder="Title (e.g. CA1)" value="'+AA.escapeHTML(col.title)+'" onchange="updateGradebookCol('+index+', \'title\', this.value)">' +
            '<input type="text" class="aa-input" style="width:100px;" placeholder="ID (e.g. ca1)" value="'+AA.escapeHTML(col.id)+'" onchange="updateGradebookCol('+index+', \'id\', this.value)">' +
            '<input type="number" class="aa-input" style="width:100px;" placeholder="Max" value="'+col.max+'" onchange="updateGradebookCol('+index+', \'max\', this.value)">' +
            '<button type="button" class="aa-btn aa-btn-sm aa-btn-danger" onclick="removeGradebookCol('+index+')"><i class="fa fa-trash"></i></button>' +
          '</div>';
          container.insertAdjacentHTML('beforeend', html);
        });
        
        container.insertAdjacentHTML('beforeend', '<div style="text-align:right; font-weight:700; font-size:14px; margin-top:10px; color:'+(total === 100 ? 'var(--success)' : 'var(--danger)')+'">Total Marks: '+total+'/100</div>');
        document.getElementById('gradebookFormatInput').value = JSON.stringify(currentGradebookFormat);
      }
      
      window.addGradebookColumn = function() {
        currentGradebookFormat.push({ id: '', title: '', max: 10 });
        renderGradebookBuilder();
      };
      
      window.removeGradebookCol = function(index) {
        currentGradebookFormat.splice(index, 1);
        renderGradebookBuilder();
      };
      
      window.updateGradebookCol = function(index, field, value) {
        if(field === 'max') value = parseInt(value) || 0;
        currentGradebookFormat[index][field] = value;
        renderGradebookBuilder();
      };

    function loadSettings() {
      callServer('adminGetSettings', [AA.token], function(res) {
        var s = (res && res.data !== undefined) ? res.data : (res || {});
        window.globalSettingsData = s;
        setFormData('settingsForm', s);
        
        var btn = document.getElementById('btnPublishResults');
        if (btn) {
          if (s.results_published) {
            btn.className = 'aa-btn aa-btn-danger';
            btn.innerHTML = '<i class="fa fa-eye-slash"></i> Unpublish Results';
          } else {
            btn.className = 'aa-btn aa-btn-info';
            btn.innerHTML = '<i class="fa fa-bullhorn"></i> Publish Results';
          }
        }

        if (s.school_logo_url) document.getElementById('settingsLogoPreview').innerHTML = '<img src="'+s.school_logo_url+'" style="width:100%;height:100%;object-fit:contain;">';
        
        currentGradebookFormat = s.gradebook_format || [
          { id: 'ca1', title: 'CA1', max: 10 },
          { id: 'ca2', title: 'CA2', max: 10 },
          { id: 'ca3', title: 'CA3', max: 10 },
          { id: 'exam', title: 'Exam', max: 70 }
        ];
        renderGradebookBuilder();
        // --- Campus: sync global state ---
        AA.campuses = s.campuses || [];
        populateCampusDropdowns();
        renderCampusSelectorBar();
      }, null, true);
    }

    // Populate all campus <select> elements in forms
    function populateCampusDropdowns() {
      var campuses = AA.campuses || [];
      var baseOption = '<option value="">No Campus (School-wide)</option>';
      var opts = baseOption + campuses.map(function(c) {
        return '<option value="' + AA.escapeHTML(c.id) + '">' + AA.escapeHTML(c.name) + ' (' + 'Primary' + ')</option>';
      }).join('');
      ['userCampusSelect','studentCampusSelect','classCampusSelect','subjectCampusSelect'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.innerHTML = opts;
      });
      // Show/hide campus groups based on whether campuses are configured
      var hasCampuses = campuses.length > 0;
      ['userCampusGroup','studentCampusGroup','classCampusGroup','subjectCampusGroup'].forEach(function(id) {
        var el = document.getElementById(id);
        if (el) el.style.display = hasCampuses ? '' : 'none';
      });
    }

    // Render a campus filter selector bar above the content area (for admins with multiple campuses)
    function renderCampusSelectorBar() {
      var campuses = AA.campuses || [];
      var bar = document.getElementById('campus-selector-bar');
      if (!bar) return;
      if (campuses.length < 2) { bar.style.display = 'none'; return; }
      bar.style.display = 'flex';
      var html = '<span style="font-size:12px;color:#64748b;margin-right:8px;"><i class="fa fa-building"></i> Filter by Campus:</span>';
      html += '<button class="aa-btn aa-btn-sm ' + (!AA.activeCampusId ? 'aa-btn-primary' : 'aa-btn-outline') + '" onclick="setCampusFilter(null)">All Campuses</button>';
      campuses.forEach(function(c) {
        html += '<button class="aa-btn aa-btn-sm ' + (AA.activeCampusId === c.id ? 'aa-btn-primary' : 'aa-btn-outline') + '" onclick="setCampusFilter(\'' + c.id + '\')">' + AA.escapeHTML(c.name) + '</button>';
      });
      bar.innerHTML = html;
    }

    function setCampusFilter(campusId) {
      AA.activeCampusId = campusId || null;
      renderCampusSelectorBar();
      refreshGlobalData();
      loadDashboard();
    }
    // ===========================================================

    function saveSettings() {
      var data = getFormData('settingsForm');
      
      try {
        var format = JSON.parse(data.gradebook_format);
        var total = format.reduce(function(sum, col) { return sum + (parseInt(col.max)||0); }, 0);
        if (total !== 100) return showToast('Gradebook format total must be exactly 100 marks.', 'error');
        data.gradebook_format = format;
      } catch(e) {}

      if (window.globalSettingsData && window.globalSettingsData.results_published !== undefined) {
        data.results_published = window.globalSettingsData.results_published;
      }
      callServer('adminUpdateSettings', [AA.token, data], function(res) {
        showToast(res.message, res.success ? 'success' : 'error');
        if(res.success) { loadSettings(); AA.loadSettings(); loadDashboard(); }
      }, null, true);
    }

    function togglePublishResults() {
      var s = window.globalSettingsData || {};
      var isCurrentlyPublished = !!s.results_published;
      var msg = isCurrentlyPublished ? 
        'Are you sure you want to UNPUBLISH the results? Parents will no longer be able to see them.' : 
        'Are you sure you want to PUBLISH the results for the current term? Parents will instantly get access.';
        
      aaConfirm(msg, function() {
        var data = { results_published: !isCurrentlyPublished };
        callServer('adminUpdateSettings', [AA.token, data], function(res) {
          showToast(res.message, res.success ? 'success' : 'error');
          if(res.success) { 
            s.results_published = data.results_published;
            loadSettings(); 
          }
        }, null, true);
      });
    }

    // --- Utilities ---
    function previewImage(input, previewId, base64Id) {
      if (input.files && input.files[0]) {
        resizeAndCompressImage(input.files[0], 200, 0.75, function(base64) {
          document.getElementById(base64Id).value = base64;
          document.getElementById(previewId).innerHTML = '<img src="'+base64+'" style="width:100%;height:100%;object-fit:contain;">';
        });
      }
    }

    // --- Password Requests ---
    function loadPasswordRequests() {
      callServer('adminGetPasswordRequests', [AA.token], function(data) {
        buildTable('requestsTable', [
          { key: 'fullName' }, { key: 'email' }, { key: 'role' },
          { key: 'timestamp', render: function(r){ return formatDate(r.timestamp); } }
        ], data, function(r) {
          return '<button class="aa-btn aa-btn-primary aa-btn-xs" onclick="openManualReset(\''+r.id+'\', \''+r.email+'\')">Reset Pwd</button>';
        });
      }, null, true);
    }
    
    // Convert Google Drive share URL to direct embeddable image URL
    function driveViewToEmbed(url) {
      if (!url) return url;
      var m = url.match(/\/file\/d\/([^\/]+)/);
      if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1];
      return url;
    }

    function openReviewPaymentModal(payId) {
      callServer('adminGetPayments', [AA.token], function(payments) {
        var p = payments.find(function(x) { return String(x.id||x.iD) === String(payId); });
        if(!p) { showToast('Payment record not found.', 'error'); return; }
        var s = globalStudents.find(function(st){ return String(st.id||st.iD) === String(p.studentID||p.studentId); });
        
        document.getElementById('revPayId').value = p.id || p.iD;
        document.getElementById('revPayStudent').value = s ? s.fullName : (p.studentID||p.studentId||'Unknown');
        document.getElementById('revPayAmount').value = formatNaira(p.amount);
        document.getElementById('revPayMethod').value = p.method || '';
        
        var proofLink = document.getElementById('revPayProofLink');
        var proofImg = document.getElementById('revPayProofImg');
        var proofMissing = document.getElementById('revPayProofMissing');
        
        if (p.proofOfPayment) {
          var embedUrl = driveViewToEmbed(p.proofOfPayment);
          proofImg.src = embedUrl;
          proofLink.href = p.proofOfPayment; // original link for open-in-new-tab
          proofImg.style.display = 'inline-block';
          proofMissing.style.display = 'none';
        } else {
          proofImg.src = '';
          proofLink.href = '#';
          proofImg.style.display = 'none';
          proofMissing.style.display = 'block';
        }
        openModal('reviewPaymentModal');
      }, null, true);
    }

    function approvePayment() {
      var pid = document.getElementById('revPayId').value;
      if(confirm('Are you sure you want to approve this payment? The balance will be updated.')) {
        callServer('adminApprovePayment', [AA.token, pid], function(res) {
          if(res.success) { showToast(res.message, 'success'); closeModal('reviewPaymentModal'); loadFinance(); loadDashboard(); }
          else showToast(res.message, 'error');
        });
      }
    }

    function rejectPayment() {
      var pid = document.getElementById('revPayId').value;
      if(confirm('Are you sure you want to REJECT this payment? The parent will be notified.')) {
        callServer('adminRejectPayment', [AA.token, pid], function(res) {
          if(res.success) { showToast(res.message, 'success'); closeModal('reviewPaymentModal'); loadFinance(); }
          else showToast(res.message, 'error');
        });
      }
    }
    
    // --- Approvals ---
    function loadApprovals() {
      callServer('adminGetPendingTasks', [AA.token], function(data) {
        buildTable('approvalsTable', [
          { key: 'createdAt', render: function(r){ return formatDate(r.createdAt); } },
          { key: 'requesterName' },
          { key: 'taskType' },
          { key: 'payloadJSON', render: function(r){ 
              return '<button class="aa-btn aa-btn-outline aa-btn-xs" onclick=\'viewTaskPayload('+JSON.stringify(r.payload)+')\'>View Payload</button>';
          } }
        ], data, function(r) {
          return '<button class="aa-btn aa-btn-success aa-btn-xs me-1" onclick="approveTask(\''+r.id+'\')">Approve</button>' +
                 '<button class="aa-btn aa-btn-danger aa-btn-xs" onclick="rejectTask(\''+r.id+'\')">Reject</button>';
        });
      }, null, true);
    }
    function approveTask(id) {
      if(!confirm('Approve this task?')) return;
      callServer('adminApproveTask', [AA.token, id], function(res) {
        showToast(res.message, res.success ? 'success' : 'error');
        if (res.success) loadApprovals();
      }, null, true);
    }
    function rejectTask(id) {
      var note = prompt("Reason for rejection:");
      if (note === null) return;
      callServer('adminRejectTask', [AA.token, id, note], function(res) {
        showToast(res.message, res.success ? 'success' : 'error');
        if (res.success) loadApprovals();
      }, null, true);
    }
    function viewTaskPayload(payload) {
      alert(JSON.stringify(payload, null, 2));
    }
    
    function openManualReset(reqId, email) {
      document.getElementById('resetReqId').value = reqId || '';
      document.getElementById('resetTargetEmail').value = email || '';
      if (!email) {
         // If called manually without a request, make it editable or allow search
         document.getElementById('resetTargetEmail').readOnly = false;
         document.getElementById('resetTargetEmail').placeholder = "Enter user email";
      } else {
         document.getElementById('resetTargetEmail').readOnly = true;
      }
      document.getElementById('resetNewPassword').value = 'password123';
      openModal('manualResetModal');
    }

    function processReset() {
      var rid = document.getElementById('resetReqId').value;
      var email = document.getElementById('resetTargetEmail').value;
      var pwd = document.getElementById('resetNewPassword').value;
      
      if (!email || !pwd) return showToast('Email and Password required', 'error');
      
      if (rid) {
        callServer('adminProcessPasswordReset', [AA.token, rid, pwd], function(res) {
          showToast(res.message, res.success ? 'success' : 'error');
          if (res.success) { closeModal('manualResetModal'); loadPasswordRequests(); }
        }, null, true);
      } else {
        // Manual reset without a formal request
        callServer('adminGetUsers', [AA.token], function(users) {
          var user = users.find(function(u){ return u.email.toLowerCase() === email.toLowerCase() || u.id === email; });
          if (!user) return showToast('User not found', 'error');
          callServer('adminUpdateUser', [AA.token, user.id, { password: pwd }], function(res) {
            showToast(res.message, res.success ? 'success' : 'error');
            if (res.success) closeModal('manualResetModal');
          }, null, true);
        });
      }
    }

    // ================================================================
    //  PARENT INVITE SYSTEM
    // ================================================================

    var currentInviteLink = '';
    var currentInviteSchoolName = '';

    function openParentInvites() {
      // Populate student dropdown
      var sel = document.getElementById('inviteStudentSelect');
      sel.innerHTML = '<option value="">No specific student</option>';
      if (globalStudents && globalStudents.length) {
        globalStudents.forEach(function(s) {
          var opt = document.createElement('option');
          opt.value = s.id || s.iD;
          opt.textContent = (s.fullName || 'Student') + (s.className ? ' — ' + s.className : '');
          sel.appendChild(opt);
        });
      }
      document.getElementById('inviteLinkBox').style.display = 'none';
      openModal('parentInviteModal');
      loadInviteHistory();
    }

    function generateParentInvite() {
      var select = document.getElementById('inviteStudentSelect');
      var linkedStudentIds = [];
      for (var i = 0; i < select.options.length; i++) {
        if (select.options[i].selected && select.options[i].value) {
          linkedStudentIds.push(select.options[i].value);
        }
      }
      callServer('adminGenerateParentInvite', [AA.token, linkedStudentIds], function(res) {
        if (!res.success) { showToast(res.message || 'Failed to generate invite', 'error'); return; }
        
        // Build the public URL for the registration page
        var baseUrl = window.location.href.replace(/\/[^\/]*$/, '/');
        currentInviteLink = baseUrl + 'ParentRegister.html?token=' + encodeURIComponent(res.token);
        currentInviteSchoolName = res.schoolName || 'the school portal';

        document.getElementById('generatedInviteLink').value = currentInviteLink;
        document.getElementById('inviteLinkBox').style.display = 'block';
        showToast('Invite link generated! Share it with the parent.', 'success');
        loadInviteHistory();
      }, null, true);
    }

    function copyInviteLink() {
      var inp = document.getElementById('generatedInviteLink');
      inp.select();
      inp.setSelectionRange(0, 99999);
      try {
        navigator.clipboard.writeText(inp.value).then(function() {
          showToast('Link copied to clipboard!', 'success');
        });
      } catch(e) {
        document.execCommand('copy');
        showToast('Link copied to clipboard!', 'success');
      }
    }

    function shareViaWhatsApp() {
      if (!currentInviteLink) return;
      var msg = 'Hello! You are invited to create your parent account on ' + currentInviteSchoolName + '\'s school portal.\n\nClick the link below to register (valid for 48 hours):\n' + currentInviteLink + '\n\nIf you have any issues, please contact the school office.';
      window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
    }

    function shareViaEmail() {
      if (!currentInviteLink) return;
      var subject = encodeURIComponent('Your Parent Portal Registration Invite — ' + currentInviteSchoolName);
      var body = encodeURIComponent(
        'Dear Parent,\n\nYou have been invited to create your parent account on ' + currentInviteSchoolName + '\'s school portal.\n\n' +
        'Please click the link below to complete your registration (this link is valid for 48 hours):\n\n' +
        currentInviteLink + '\n\n' +
        'Once registered, you will be able to:\n' +
        '  • View your child\'s academic results\n' +
        '  • Track attendance records\n' +
        '  • Pay school fees online\n' +
        '  • Receive school announcements\n\n' +
        'If you have any questions, please contact the school office.\n\nRegards,\n' + currentInviteSchoolName
      );
      window.location.href = 'mailto:?subject=' + subject + '&body=' + body;
    }

    function loadInviteHistory() {
      var tbody = document.querySelector('#invitesTable tbody');
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;">Loading...</td></tr>';
      callServer('adminGetParentInvites', [AA.token], function(data) {
        if (!data || !data.length) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#64748b;padding:20px;">No invites generated yet.</td></tr>';
          return;
        }
        var rows = '';
        data.forEach(function(inv) {
          var statusBadge = {
            pending:  '<span class="aa-badge aa-badge-warning">Pending</span>',
            used:     '<span class="aa-badge aa-badge-success">Used</span>',
            revoked:  '<span class="aa-badge" style="background:#ef444420;color:#ef4444;">Revoked</span>',
            expired:  '<span class="aa-badge" style="background:#94a3b820;color:#94a3b8;">Expired</span>'
          }[inv.effectiveStatus || inv.status] || '<span class="aa-badge">Unknown</span>';

          var linkedName = inv.linkedStudentId ? (globalStudents || []).reduce(function(found, s) {
            return (s.id === inv.linkedStudentId || s.iD === inv.linkedStudentId) ? (s.fullName || '—') : found;
          }, '—') : '—';

          var created = new Date(inv.createdAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
          var expires = new Date(inv.expiresAt).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
          
          var revokeBtn = (inv.status === 'pending') 
            ? '<button class="aa-btn aa-btn-danger aa-btn-xs" onclick="revokeInvite(\'' + inv.id + '\')"><i class="fa fa-ban"></i></button>'
            : '—';

          rows += '<tr><td>' + created + '</td><td>' + AA.escapeHTML(linkedName) + '</td><td>' + statusBadge + '</td><td>' + expires + '</td><td>' + revokeBtn + '</td></tr>';
        });
        tbody.innerHTML = rows;
      });
    }

    function revokeInvite(token) {
      aaConfirm('Revoke this invite link? The parent will no longer be able to use it.', function() {
        callServer('adminRevokeParentInvite', [AA.token, token], function(res) {
          showToast(res.message, res.success ? 'success' : 'error');
          if (res.success) loadInviteHistory();
        }, null, true);
      });
    }

    // --- BULK PROMOTION WIZARD ---
    function openPromotionWizard() {
      document.getElementById('pw-phase1').style.display = 'block';
      document.getElementById('pw-phase2').style.display = 'none';
      
      // Auto-fill new session suggestion
      var parts = currentSession.split('/');
      if(parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        document.getElementById('pw-new-session').value = (parseInt(parts[0])+1) + '/' + (parseInt(parts[1])+1);
      } else {
        document.getElementById('pw-new-session').value = '';
      }

      // Populate classes
      var tbody = document.getElementById('pw-class-mapping-tbody');
      var html = '';
      
      var classNames = [];
      globalClasses.forEach(function(c) { if(!classNames.includes(c.className)) classNames.push(c.className); });
      globalStudents.forEach(function(s) {
        if((s.status === 'active' || !s.status) && s.className && !classNames.includes(s.className)) {
          classNames.push(s.className);
        }
      });
      // Sort using a simple string compare since frontend doesn't have getClassSortWeight
      classNames.sort();

      classNames.forEach(function(cName) {
        var options = '<option value="' + cName + '">Stay in ' + cName + '</option>';
        classNames.forEach(function(opt) {
          if (opt !== cName) options += '<option value="' + opt + '">' + opt + '</option>';
        });
        options += '<option value="Graduated">Graduated (Inactive)</option>';
        options += '<option value="Withdrawn">Withdrawn (Inactive)</option>';
        
        html += '<tr><td>' + cName + '</td><td><select class="aa-select pw-mapping-select" data-current="' + cName + '">' + options + '</select></td></tr>';
      });
      tbody.innerHTML = html;
      
      // Pre-select smart destinations (next in sorted list)
      var selects = document.querySelectorAll('.pw-mapping-select');
      selects.forEach(function(s) {
        var current = s.getAttribute('data-current');
        var cIdx = classNames.indexOf(current);
        if(cIdx >= 0 && cIdx < classNames.length - 1) {
          s.value = classNames[cIdx + 1];
        }
      });
      
      openModal('promotionWizardModal');
    }

    function pwGeneratePreview() {
      var mappings = {};
      document.querySelectorAll('.pw-mapping-select').forEach(function(sel) {
        mappings[sel.getAttribute('data-current')] = sel.value;
      });
      
      var tbody = document.getElementById('pw-student-preview-tbody');
      var html = '';
      
      var classOptionsHtml = '';
      var classNames = [];
      globalClasses.forEach(function(c) { if(!classNames.includes(c.className)) classNames.push(c.className); });
      globalStudents.forEach(function(s) {
        if((s.status === 'active' || !s.status) && s.className && !classNames.includes(s.className)) classNames.push(s.className);
      });
      classNames.sort();
      classNames.forEach(function(cName) { classOptionsHtml += '<option value="'+cName+'">'+cName+'</option>'; });
      classOptionsHtml += '<option value="Graduated">Graduated (Inactive)</option>';
      classOptionsHtml += '<option value="Withdrawn">Withdrawn (Inactive)</option>';
      
      var activeCount = 0;
      globalStudents.forEach(function(s) {
        if (s.status && s.status !== 'active') return; // only promote active students
        activeCount++;
        var proposed = mappings[s.className] || s.className;
        var selectId = 'pw_stu_' + s.id;
        html += '<tr>' +
          '<td>' + (s.admNo || 'N/A') + '</td>' +
          '<td>' + (s.fullName || '') + '</td>' +
          '<td>' + (s.className || '') + '</td>' +
          '<td><select id="'+selectId+'" class="aa-select pw-student-dest" data-sid="'+s.id+'" data-current-class="'+(s.className||'')+'">' + classOptionsHtml + '</select></td>' +
        '</tr>';
      });
      
      if(activeCount === 0) {
        html = '<tr><td colspan="4" class="text-center">No active students found to promote.</td></tr>';
      }
      
      tbody.innerHTML = html;
      
      // Set proposed values
      globalStudents.forEach(function(s) {
        if (s.status && s.status !== 'active') return;
        var proposed = mappings[s.className] || s.className;
        var sel = document.getElementById('pw_stu_' + s.id);
        if(sel) sel.value = proposed;
      });
      
      document.getElementById('pw-phase1').style.display = 'none';
      document.getElementById('pw-phase2').style.display = 'block';
    }

    function pwBackToPhase1() {
      document.getElementById('pw-phase1').style.display = 'block';
      document.getElementById('pw-phase2').style.display = 'none';
    }

    function pwExecutePromotion() {
      var promotions = [];
      document.querySelectorAll('.pw-student-dest').forEach(function(sel) {
        var sid = sel.getAttribute('data-sid');
        var dest = sel.value;
        var oldClass = sel.getAttribute('data-current-class');
        var status = (dest === 'Graduated' || dest === 'Withdrawn') ? dest : 'active';
        var cName = (dest === 'Graduated' || dest === 'Withdrawn') ? oldClass : dest;
        promotions.push({ id: sid, className: cName, status: status });
      });
      
      if(promotions.length === 0) return showToast('No students to promote.', 'error');
      
      var newSession = document.getElementById('pw-new-session').value.trim();
      
      aaConfirm('Are you sure you want to promote ' + promotions.length + ' students? This action will update their class and status.', function() {
        var payload = { promotions: promotions };
        if(newSession && newSession !== currentSession) {
          payload.newSession = newSession;
          payload.newTerm = 'First Term';
        }
        
        callServer('adminPromoteStudents', [AA.token, payload], function(res) {
          showToast(res.message, res.success ? 'success' : 'error');
          if(res.success) {
            closeModal('promotionWizardModal');
            loadSettings();
            loadStudents();
          }
        }, null, true);
      });
    }

  
