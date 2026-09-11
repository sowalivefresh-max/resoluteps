/* ============================================================
   ABECEDARIAN ACADEMY - Shared Frontend JavaScript
   Decoupled version: uses fetch() via api.js instead of google.script.run
   ============================================================ */

// --- Session Management --------------------------------------

var AA = {
  token: null,
  user:  null,
  settings: {},
  gradingSystems: [],
  campuses: [],        // List of campus objects from settings: [{id, name, section}]
  activeCampusId: null, // Currently selected campus filter (null = all campuses)

  escapeHTML: function(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  },

  init: function() {
    // Read token from URL ?token=...
    var params = new URLSearchParams(window.location.search);
    this.token = params.get('token');

    if (!this.token) {
      // No token ΓåÆ go to login
      window.location.href = 'Login.html';
      return;
    }
    this.loadCurrentUser();
    this.loadSettings();
    this.loadGradingSystems();
  },

  loadCurrentUser: function() {
    var self = this;
    runBackendAction('getCurrentUser', [self.token])
      .then(function(res) {
        if (!res.success) { self.logout(); return; }
        self.user = res.user;
        if (res.user.isLocked && res.user.role !== 'developer') {
          return self.showPortalLockScreen(res.user.lockMessage);
        }
        self.renderUserInfo(res.user);
      })
      .catch(function(err) { 
        if (err && err.message === 'PORTAL_LOCKED') {
          return self.showPortalLockScreen();
        }
        self.logout(); 
      });
  },

  loadSettings: function() {
    var self = this;
    runBackendAction('getPublicBranding', [])
      .then(function(s) {
        self.settings = s || {};
        self.campuses = s.campuses || [];
        var nameEl = document.getElementById('sb-school-name');
        if (nameEl && s.school_name) nameEl.textContent = s.school_name;
        if (s.school_logo_url && (s.school_logo_url.indexOf('data:image') === 0 || s.school_logo_url.indexOf('http') === 0)) {
          var brandIcon = document.querySelector('.aa-brand-icon');
          if (brandIcon) {
            brandIcon.style.background = '#fff';
            brandIcon.style.borderRadius = '50%';
            brandIcon.innerHTML = '<img src="' + s.school_logo_url + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
          }
        }
        
        if (s.theme_primary && s.theme_secondary) {
          self.applyThemeToDocument('custom', s.theme_primary, s.theme_secondary);
        }
      })
      .catch(function(e) { console.error('loadSettings error', e); });
  },

  // Returns the campus name for a given campusId, or 'N/A'
  getCampusName: function(campusId) {
    if (!campusId) return '';
    var found = (this.campuses || []).find(function(c) { return c.id === campusId; });
    return found ? found.name : campusId;
  },

  // Returns the campusId to use for filtering: user's own campus if set, else activeCampusId if set, else null
  getActiveCampusId: function() {
    if (this.user && this.user.campusId) return this.user.campusId;
    return this.activeCampusId || null;
  },

  loadGradingSystems: function() {
    var self = this;
    runBackendAction('getGradingSystems', [self.token])
      .then(function(res) {
        if (res.success) self.gradingSystems = res.data || [];
      })
      .catch(function(e) { console.error('loadGradingSystems error', e); });
  },

  applyThemeToDocument: function(theme, primary, secondary) {
    var t = { p: primary || '#0d1b2a', s: secondary || '#f0a500' };
    
    var adjustColor = function(color, amount) {
      if(!color || typeof color !== 'string' || !color.startsWith('#')) return color;
      return '#' + color.replace(/^#/, '').replace(/../g, function(c) {
        return ('0'+Math.min(255, Math.max(0, parseInt(c, 16) + amount)).toString(16)).substr(-2);
      });
    };

    var styleId = 'aa-dynamic-theme';
    var styleEl = document.getElementById(styleId);
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = styleId;
      document.head.appendChild(styleEl);
    }
    
    styleEl.innerHTML = ':root { ' +
      '--aa-navy: ' + t.p + '; ' +
      '--aa-navy-light: ' + adjustColor(t.p, 20) + '; ' +
      '--aa-navy-mid: ' + adjustColor(t.p, 40) + '; ' +
      '--aa-gold: ' + t.s + '; ' +
      '--aa-gold-light: ' + adjustColor(t.s, 40) + '; ' +
      '--aa-gold-dark: ' + adjustColor(t.s, -40) + '; ' +
    '}';
  },

  renderUserInfo: function(user) {
    var initials = (user.fullName || 'U').split(' ').map(function(n){return n[0];}).join('').slice(0,2).toUpperCase();
    document.querySelectorAll('.aa-user-avatar').forEach(function(el) {
      if (user.profilePicture && (user.profilePicture.indexOf('data:image') === 0 || user.profilePicture.indexOf('http') === 0)) {
        el.innerHTML = '<img src="' + user.profilePicture + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
      } else {
        el.textContent = initials;
      }
    });
    document.querySelectorAll('.aa-user-name').forEach(function(el) { el.textContent = user.fullName || ''; });
    document.querySelectorAll('.aa-user-role').forEach(function(el) { el.textContent = AA.formatRole(user.role || ''); });
  },

  updateProfile: function() {
    var fullName = document.getElementById('profName').value;
    var email = document.getElementById('profEmail').value;
    var phone = document.getElementById('profPhone').value;
    var photo = document.getElementById('profPhotoBase64').value;

    if (!fullName) return showToast('Name is required', 'error');
    if (!email) return showToast('Email is required', 'error');

    var data = { fullName: fullName, email: email, phone: phone };
    if (photo) data.profilePicture = photo;

    callServer('userUpdateProfile', [this.token, data], function(res) {
      showToast(res.message, res.success ? 'success' : 'error');
      if (res.success) {
        AA.loadCurrentUser();
        closeModal('profileModal');
      }
    }, null, true);
  },

  populateProfileModal: function() {
    var u = AA.user;
    if (!u) return openModal('profileModal');
    document.getElementById('profName').value = u.fullName || '';
    if (document.getElementById('profEmail')) document.getElementById('profEmail').value = u.email || '';
    document.getElementById('profPhone').value = u.phone || '';
    document.getElementById('profPhotoBase64').value = '';

    var avatarEl = document.querySelector('#profileModal .aa-user-avatar');
    if (avatarEl) {
      if (u.profilePicture && (u.profilePicture.indexOf('data:image') === 0 || u.profilePicture.indexOf('http') === 0)) {
        avatarEl.innerHTML = '<img src="' + u.profilePicture + '" alt="avatar" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
      } else {
        var names = (u.fullName || 'User').trim().split(' ');
        var initials = names.length > 1 ? (names[0][0] + names[names.length-1][0]) : names[0].substring(0, 2);
        avatarEl.textContent = initials.toUpperCase();
      }
    }
    openModal('profileModal');
  },

  changePwd: function() {
    var oldEl = document.getElementById('oldPwd');
    var newEl = document.getElementById('newPwd');
    var confEl = document.getElementById('confirmPwd');
    var o = oldEl ? oldEl.value.trim() : '';
    var n = newEl ? newEl.value.trim() : '';
    var c = confEl ? confEl.value.trim() : n;
    if (!o || !n) return showToast('Current and new password required.', 'error');
    if (n.length < 6) return showToast('New password must be at least 6 characters.', 'error');
    if (confEl && n !== c) return showToast('New passwords do not match.', 'error');
    callServer('userChangePassword', [AA.token, o, n], function(r) {
      showToast(r.message, r.success ? 'success' : 'error');
      if (r.success) {
        if (oldEl) oldEl.value = '';
        if (newEl) newEl.value = '';
        if (confEl) confEl.value = '';
        closeModal('profileModal');
        setTimeout(function() {
          if (typeof AA !== 'undefined' && AA.logout) AA.logout();
        }, 1500);
      }
    }, null, true);
  },

  logout: function() {
    if (this.token) {
      runBackendAction('logoutUser', [this.token]).catch(function(){});
    }
    window.location.href = 'Login.html';
  },

  showPortalLockScreen: function(customMessage) {
    var msg = customMessage || 'Your school portal has been temporarily locked due to outstanding subscription payments. Please contact the developer.';
    document.body.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100vh;background:#f8d7da;color:#721c24;flex-direction:column;text-align:center;padding:40px;font-family:sans-serif;">' +
      '<i class="fa fa-lock" style="font-size:64px;margin-bottom:20px;"></i>' +
      '<h1 style="margin:0 0 15px 0;font-size:32px;">Portal Locked</h1>' +
      '<p style="font-size:18px;max-width:600px;line-height:1.5;">' + AA.escapeHTML(msg) + '</p>' +
      '<a href="Login.html" style="margin-top:30px;padding:10px 20px;background:#721c24;color:#fff;text-decoration:none;border-radius:4px;">Back to Login</a>' +
      '</div>';
  },

  formatRole: function(role) {
    var map = { admin:'Administrator', admin_assistant:'Admin Assistant', developer:'Portal Developer', principal:'Principal', vp:'Vice Principal',
      headteacher:'Head Teacher', teacher:'Subject Teacher', primary_teacher:'Class Teacher',
      accounts:'Accounts Officer', parent:'Parent/Guardian', nurse:'School Nurse', storekeeper:'Store Keeper' };
    return map[role] || role;
  }
};

// --- Server Call Wrapper -------------------------------------

/**
 * Wrapper for API calls with loading state management.
 * @param {string} fn - backend function name
 * @param {Array} args - arguments array
 * @param {Function} onSuccess - success callback
 * @param {Function} [onError] - optional error callback
 * @param {boolean} [showLoader] - show full-screen loader
 */
function callServer(fn, args, onSuccess, onError, showLoader) {
  if (showLoader) showLoading();
  runBackendAction(fn, args)
    .then(function(result) {
      if (showLoader) hideLoading();
      if (onSuccess) onSuccess(result);
    })
    .catch(function(err) {
      if (showLoader) hideLoading();
      var msg = err && err.message ? err.message : 'An error occurred. Please try again.';
      if (msg === 'PORTAL_LOCKED' && AA && AA.user && AA.user.role !== 'developer') {
        return AA.showPortalLockScreen(AA.user.lockMessage);
      }
      showToast(msg, 'error');
      if (onError) onError(err);
    });
}

// --- Loading Overlay -----------------------------------------

function showLoading(text) {
  var el = document.getElementById('aa-loading');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aa-loading';
    el.className = 'aa-loading-overlay';
    el.innerHTML = '<div class="aa-spinner"></div><div class="aa-spinner-text">' + (text || 'Please wait...') + '</div>';
    document.body.appendChild(el);
  } else {
    el.querySelector('.aa-spinner-text').textContent = text || 'Please wait...';
    el.style.display = 'flex';
  }
}

function hideLoading() {
  var el = document.getElementById('aa-loading');
  if (el) el.style.display = 'none';
}

// --- Toast Notifications -------------------------------------

function showToast(message, type, duration) {
  var container = document.getElementById('aa-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'aa-toast-container';
    document.body.appendChild(container);
  }
  var t = type || 'info';
  var iconMap = {
    success: '<i class="fa fa-check-circle" style="color:#10b981;font-size:16px;"></i>',
    error:   '<i class="fa fa-times-circle" style="color:#ef4444;font-size:16px;"></i>',
    warning: '<i class="fa fa-exclamation-triangle" style="color:#f59e0b;font-size:16px;"></i>',
    info:    '<i class="fa fa-info-circle" style="color:#3b82f6;font-size:16px;"></i>'
  };
  var icon = iconMap[t] || iconMap['info'];
  var toast = document.createElement('div');
  toast.className = 'aa-toast ' + t;
  toast.innerHTML = '<span class="aa-toast-icon">' + icon + '</span>' +
    '<span class="aa-toast-msg">' + message + '</span>' +
    '<button onclick="this.parentElement.remove()" style="background:none;border:none;cursor:pointer;padding:0 0 0 8px;color:#888;font-size:16px;">&times;</button>';
  container.appendChild(toast);
  setTimeout(function() { if (toast.parentNode) toast.remove(); }, duration || 4000);
}

// --- Tab System -----------------------------------------------

function initTabs(tabGroupId) {
  var group = document.getElementById(tabGroupId);
  if (!group) return;
  group.querySelectorAll('.aa-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      var target = tab.dataset.tab;
      group.querySelectorAll('.aa-tab').forEach(function(t) { t.classList.remove('active'); });
      tab.classList.add('active');
      document.querySelectorAll('.aa-tab-content[data-group="' + tabGroupId + '"]').forEach(function(c) {
        c.classList.toggle('active', c.dataset.id === target);
      });
      if (tab.dataset.onload) { window[tab.dataset.onload] && window[tab.dataset.onload](); }
    });
  });
}

function switchTab(tabGroupId, tabId) {
  var tab = document.querySelector('#' + tabGroupId + ' .aa-tab[data-tab="' + tabId + '"]');
  if (tab) tab.click();
}

// --- Modal System ---------------------------------------------

function openModal(id) {
  var m = document.getElementById(id);
  if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
}

function closeModal(id) {
  var m = document.getElementById(id);
  if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
}

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('aa-modal-backdrop')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// --- Sidebar --------------------------------------------------

function initSidebar() {
  var toggle = document.getElementById('aa-menu-toggle');
  var sidebar = document.getElementById('aa-sidebar');
  var overlay = document.getElementById('aa-sidebar-overlay');
  if (!toggle || !sidebar) return;
  toggle.addEventListener('click', function() {
    sidebar.classList.toggle('open');
    overlay && overlay.classList.toggle('open');
  });
  overlay && overlay.addEventListener('click', function() {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
  });
}

// --- Nav Item Activation --------------------------------------

function setActiveNav(id) {
  document.querySelectorAll('.aa-nav-item').forEach(function(el) { el.classList.remove('active'); });
  var el = document.getElementById(id);
  if (el) el.classList.add('active');
}

// --- Form Utilities -------------------------------------------

function getFormData(formId) {
  var form = document.getElementById(formId);
  if (!form) return {};
  var data = {};
  form.querySelectorAll('[name]').forEach(function(el) {
    var k = el.name; var v = el.value;
    if (el.type === 'checkbox') v = el.checked;
    if (el.type === 'number') v = parseFloat(v) || 0;
    if (el.multiple) {
      var arr = [];
      for (var i = 0; i < el.selectedOptions.length; i++) arr.push(el.selectedOptions[i].value);
      v = arr.join(',');
    }
    data[k] = v;
  });
  return data;
}

function resetForm(formId) {
  var form = document.getElementById(formId);
  if (form) form.reset();
}

function setFormData(formId, data) {
  var form = document.getElementById(formId);
  if (!form) return;
  Object.keys(data).forEach(function(k) {
    var el = form.querySelector('[name="' + k + '"]');
    if (el) {
      if (el.multiple && (typeof data[k] === 'string' || Array.isArray(data[k]))) {
        var vals = Array.isArray(data[k]) ? data[k] : String(data[k]).split(',').map(function(s){return s.trim();});
        for(var i = 0; i < el.options.length; i++) {
          el.options[i].selected = vals.indexOf(el.options[i].value) !== -1;
        }
      } else if (el.type === 'checkbox') {
        el.checked = !!data[k];
      } else {
        el.value = data[k] !== null && data[k] !== undefined ? data[k] : '';
      }
    }
  });
}

// --- Table Utilities ------------------------------------------

function buildTable(tableId, columns, rows, actionFn) {
  var tbody = document.querySelector('#' + tableId + ' tbody');
  if (!tbody) return;
  
  if (rows && rows.success === false) {
    tbody.innerHTML = '<tr><td colspan="' + (columns.length + (actionFn ? 1 : 0)) + '" class="text-center text-danger" style="padding:32px;">' + (rows.message ? AA.escapeHTML(rows.message) : 'Error loading data.') + '</td></tr>';
    return;
  }

  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="' + (columns.length + (actionFn ? 1 : 0)) + '" class="text-center text-muted" style="padding:32px;">No records found.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(function(row, i) {
    var cells = columns.map(function(col) {
      var val = col.render ? col.render(row) : (row[col.key] !== undefined ? AA.escapeHTML(row[col.key]) : '');
      return '<td>' + (val !== null && val !== undefined ? val : '') + '</td>';
    }).join('');
    var actionCell = actionFn ? '<td>' + actionFn(row, i) + '</td>' : '';
    return '<tr>' + cells + actionCell + '</tr>';
  }).join('');
}

function filterTable(inputId, tableId) {
  var val = document.getElementById(inputId).value.toLowerCase();
  var rows = document.querySelectorAll('#' + tableId + ' tbody tr');
  rows.forEach(function(row) {
    row.style.display = row.textContent.toLowerCase().indexOf(val) !== -1 ? '' : 'none';
  });
}

function sortTable(tableId, colIndex) {
  var table, rows, switching, i, x, y, shouldSwitch, dir, switchcount = 0;
  table = document.getElementById(tableId);
  if (!table) return;
  switching = true;
  dir = "asc"; 
  while (switching) {
    switching = false;
    rows = table.rows;
    for (i = 1; i < (rows.length - 1); i++) {
      shouldSwitch = false;
      x = rows[i].getElementsByTagName("TD")[colIndex];
      y = rows[i + 1].getElementsByTagName("TD")[colIndex];
      if (x && y) {
        var xContent = x.innerText.toLowerCase();
        var yContent = y.innerText.toLowerCase();
        if (dir == "asc") {
          if (xContent > yContent) { shouldSwitch = true; break; }
        } else if (dir == "desc") {
          if (xContent < yContent) { shouldSwitch = true; break; }
        }
      }
    }
    if (shouldSwitch) {
      rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
      switching = true;
      switchcount ++;
    } else {
      if (switchcount == 0 && dir == "asc") {
        dir = "desc";
        switching = true;
      }
    }
  }
}

// --- Formatting Utilities ------------------------------------

function safeFloat(val, def) {
  var f = parseFloat(val);
  return isNaN(f) ? (def || 0) : f;
}

function formatNaira(amount) {
  var n = parseFloat(amount) || 0;
  return '\u20A6' + n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function formatDateTime(dateStr) {
  if (!dateStr) return '';
  var d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var h = d.getHours();
  var m = d.getMinutes();
  var ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  m = m < 10 ? '0' + m : m;
  var timeStr = h + ':' + m + ' ' + ampm;
  return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear() + ', ' + timeStr;
}

function calculateDynamicGrade(total, className, section) {
  var score = parseFloat(total) || 0;
  var gradingSystems = (typeof AA !== 'undefined') ? AA.gradingSystems : [];
  
  if (!gradingSystems || gradingSystems.length === 0) {
    if (score >= 75) return 'A1';
    if (score >= 70) return 'B2';
    if (score >= 65) return 'B3';
    if (score >= 60) return 'C4';
    if (score >= 55) return 'C5';
    if (score >= 50) return 'C6';
    if (score >= 45) return 'D7';
    if (score >= 40) return 'E8';
    return 'F9';
  }

  var matchedSystem = null;
  if (className) {
    matchedSystem = gradingSystems.find(function(gs) { 
      return gs.targetClasses && Array.isArray(gs.targetClasses) && 
        gs.targetClasses.some(function(c) { return c.toLowerCase().trim() === className.toLowerCase().trim(); });
    });
  }
  if (!matchedSystem && section && section !== 'both') {
    matchedSystem = gradingSystems.find(function(gs) {
      return (!gs.targetClasses || gs.targetClasses.length === 0) && 
        gs.targetSection && gs.targetSection.toLowerCase() === section.toLowerCase();
    });
  }
  if (!matchedSystem) {
    matchedSystem = gradingSystems.find(function(gs) {
      return (!gs.targetClasses || gs.targetClasses.length === 0) && 
        (!gs.targetSection || gs.targetSection.toLowerCase() === 'both' || gs.targetSection === '');
    });
  }
  if (!matchedSystem) matchedSystem = gradingSystems[0];
  
  if (!matchedSystem.rules || !Array.isArray(matchedSystem.rules) || matchedSystem.rules.length === 0) {
    return 'F';
  }
  
  for (var i = 0; i < matchedSystem.rules.length; i++) {
    var rule = matchedSystem.rules[i];
    if (score >= Number(rule.min) && score <= Number(rule.max)) {
      return rule.grade || 'F';
    }
  }
  
  var lowest = matchedSystem.rules[matchedSystem.rules.length - 1];
  return lowest.grade || 'F';
}

function calculateGrade(total) {
  return calculateDynamicGrade(total);
}

function formatGrade(grade) {
  var cls = { 'A1':'grade-a1','B2':'grade-b2','B3':'grade-b3',
    'C4':'grade-c4','C5':'grade-c5','C6':'grade-c6','D7':'grade-d7','E8':'grade-e8','F9':'grade-f9' };
  return '<span class="' + (cls[grade] || 'grade-b3') + '" style="font-weight:bold;">' + (grade || '') + '</span>';
}

function formatStatus(status) {
  if (!status) return '';
  var s = String(status).toLowerCase();
  var map = {
    'paid':        '<span class="aa-badge aa-badge-success">Paid</span>',
    'partial':     '<span class="aa-badge aa-badge-warning">Partial</span>',
    'outstanding': '<span class="aa-badge aa-badge-danger">Outstanding</span>',
    'active':      '<span class="aa-badge aa-badge-success">Active</span>',
    'suspended':   '<span class="aa-badge aa-badge-danger">Suspended</span>',
    'approved':    '<span class="aa-badge aa-badge-success">Approved</span>',
    'submitted':   '<span class="aa-badge aa-badge-info">Submitted</span>',
    'draft':       '<span class="aa-badge aa-badge-navy">Draft</span>',
    'rejected':    '<span class="aa-badge aa-badge-danger">Rejected</span>',
    'present':     '<span class="aa-badge aa-badge-success">Present</span>',
    'absent':      '<span class="aa-badge aa-badge-danger">Absent</span>',
    'late':        '<span class="aa-badge aa-badge-warning">Late</span>',
    'pending':     '<span class="aa-badge aa-badge-warning"><i class="fa fa-clock mr-1"></i> Pending</span>'
  };
  return map[s] || '<span class="aa-badge aa-badge-navy">' + status + '</span>';
}

function formatAttPct(pct) {
  var n = parseFloat(pct) || 0;
  var color = n >= 90 ? '#16a34a' : n >= 75 ? '#d97706' : '#dc2626';
  return '<span style="font-weight:600;color:' + color + '">' + n + '%</span>';
}

// --- Pagination -----------------------------------------------

var paginationState = {};

function paginate(data, pageSize, page) {
  var start = (page - 1) * pageSize;
  return data.slice(start, start + pageSize);
}

function renderPagination(containerId, total, pageSize, currentPage, onPage) {
  var el = document.getElementById(containerId);
  if (!el) return;
  var totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  var html = '<div class="d-flex align-items-center gap-2" style="font-size:12px;">';
  html += '<span class="text-muted">Page ' + currentPage + ' of ' + totalPages + '</span>';
  html += '<button class="aa-btn aa-btn-outline aa-btn-xs" ' + (currentPage <= 1 ? 'disabled' : '') + ' onclick="(' + onPage + ')(' + (currentPage - 1) + ')">ΓÇ╣ Prev</button>';
  html += '<button class="aa-btn aa-btn-outline aa-btn-xs" ' + (currentPage >= totalPages ? 'disabled' : '') + ' onclick="(' + onPage + ')(' + (currentPage + 1) + ')">Next ΓÇ║</button>';
  html += '</div>';
  el.innerHTML = html;
}

// --- Confirm Dialog -------------------------------------------

function aaConfirm(message, onConfirm) {
  var existing = document.getElementById('aa-confirm-modal');
  if (existing) existing.remove();
  var modal = document.createElement('div');
  modal.id = 'aa-confirm-modal';
  modal.className = 'aa-modal-backdrop open';
  modal.innerHTML = '<div class="aa-modal" style="max-width:380px;">' +
    '<div class="aa-modal-header"><h5 class="aa-modal-title">Confirm Action</h5></div>' +
    '<div class="aa-modal-body"><p style="margin:0;">' + message + '</p></div>' +
    '<div class="aa-modal-footer">' +
    '<button class="aa-btn aa-btn-outline" onclick="document.getElementById(\'aa-confirm-modal\').remove()">Cancel</button>' +
    '<button id="aa-confirm-ok" class="aa-btn aa-btn-danger">Confirm</button>' +
    '</div></div>';
  document.body.appendChild(modal);
  document.getElementById('aa-confirm-ok').onclick = function() {
    modal.remove();
    onConfirm();
  };
}

// --- PDF Viewer -----------------------------------------------

function openPDFViewer(previewUrl, downloadUrl, title) {
  var existing = document.getElementById('aa-pdf-modal');
  if (existing) existing.remove();
  var modal = document.createElement('div');
  modal.id = 'aa-pdf-modal';
  modal.className = 'aa-modal-backdrop open';
  modal.innerHTML = '<div class="aa-modal aa-modal-lg">' +
    '<div class="aa-modal-header">' +
    '<h5 class="aa-modal-title">≡ƒôä ' + (title || 'Document Viewer') + '</h5>' +
    '<button class="aa-modal-close" onclick="document.getElementById(\'aa-pdf-modal\').remove()">├ù</button></div>' +
    '<div class="aa-modal-body" style="padding:0;">' +
    '<iframe src="' + previewUrl + '" style="width:100%;height:70vh;border:none;"></iframe></div>' +
    '<div class="aa-modal-footer">' +
    '<button class="aa-btn aa-btn-outline" onclick="document.getElementById(\'aa-pdf-modal\').remove()">Close</button>' +
    '<button class="aa-btn aa-btn-gold" onclick="var src = document.querySelector(\'#aa-pdf-modal iframe\').src; var html = decodeURIComponent(src.split(\'utf-8,\')[1] || src.split(\',\')[1] || \'\'); var win = window.open(\'\', \'_blank\'); win.document.write(html); win.document.close(); win.focus(); setTimeout(function(){ win.print(); }, 500);"><i class="fa fa-print"></i> Print / Save as PDF</button>' +
    '</div></div>';
  document.body.appendChild(modal);
}

// --- Export Table to CSV --------------------------------------

function exportTableCSV(tableId, filename) {
  var table = document.getElementById(tableId);
  if (!table) return;
  var rows = Array.from(table.querySelectorAll('tr'));
  var csv = rows.map(function(row) {
    return Array.from(row.querySelectorAll('th,td')).map(function(cell) {
      return '"' + cell.innerText.replace(/"/g, '""') + '"';
    }).join(',');
  }).join('\n');
  var link = document.createElement('a');
  link.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  link.download = (filename || 'export') + '.csv';
  link.click();
}

// --- Score Colour Helper -------------------------------------

function scoreColor(score) {
  var n = parseFloat(score) || 0;
  if (n >= 75) return '#15803d';
  if (n >= 60) return '#1d4ed8';
  if (n >= 50) return '#b45309';
  if (n >= 40) return '#9333ea';
  return '#dc2626';
}

// --- Image Utilities -----------------------------------------

function resizeAndCompressImage(file, maxDim, quality, callback) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var width = img.width; var height = img.height;
      if (width > height) {
        if (width > maxDim) { height = Math.round((height * maxDim) / width); width = maxDim; }
      } else {
        if (height > maxDim) { width = Math.round((width * maxDim) / height); height = maxDim; }
      }
      canvas.width = width; canvas.height = height;
      var ctx = canvas.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      try { callback(canvas.toDataURL('image/jpeg', quality)); }
      catch (err) { callback(e.target.result); }
    };
    img.onerror = function() { callback(e.target.result); };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function previewProfilePhoto(input) {
  if (input.files && input.files[0]) {
    resizeAndCompressImage(input.files[0], 200, 0.75, function(base64) {
      document.getElementById('profPhotoBase64').value = base64;
      var preview = document.querySelector('#profileModal .aa-user-avatar');
      if (preview) {
        preview.innerHTML = '<img src="' + base64 + '" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">';
      }
    });
  }
}

function adminResetPassword(uid) {
  aaConfirm('Reset password for this user? The new password will be "password123".', function() {
    callServer('adminResetUserPassword', [AA.token, uid], function(res) {
      showToast(res.message, res.success ? 'success' : 'error');
    }, null, true);
  });
}

// --- CSV Utilities --------------------------------------------

function parseCSV(str) {
  var arr = [];
  var quote = false;
  for (var row = 0, col = 0, c = 0; c < str.length; c++) {
    var cc = str[c], nc = str[c+1];
    arr[row] = arr[row] || [];
    arr[row][col] = arr[row][col] || '';
    if (cc == '"' && quote && nc == '"') { arr[row][col] += cc; ++c; continue; }
    if (cc == '"') { quote = !quote; continue; }
    if (cc == ',' && !quote) { ++col; continue; }
    if (cc == '\r' && nc == '\n' && !quote) { ++row; col = 0; ++c; continue; }
    if (cc == '\n' && !quote) { ++row; col = 0; continue; }
    if (cc == '\r' && !quote) { ++row; col = 0; continue; }
    arr[row][col] += cc;
  }
  if (arr.length < 2) return [];
  var headers = arr[0].map(function(h) { return h.trim(); });
  var data = [];
  for (var i = 1; i < arr.length; i++) {
    var obj = {}; var hasData = false;
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = arr[i][j] ? arr[i][j].trim() : '';
      if (obj[headers[j]]) hasData = true;
    }
    if (hasData) data.push(obj);
  }
  return data;
}

function downloadCSVTemplate(headers, filename) {
  var csv = headers.join(',') + '\n';
  var blob = new Blob([csv], {type: 'text/csv'});
  var url = window.URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// --- DOM Ready ------------------------------------------------

document.addEventListener('DOMContentLoaded', function() {
  initSidebar();
  if (!document.getElementById('aa-toast-container')) {
    var tc = document.createElement('div');
    tc.id = 'aa-toast-container';
    document.body.appendChild(tc);
  }
  
  if (document.getElementById('notification-bell')) {
    initNotifications();
  }
});

// --- Notifications UI Logic ---
function initNotifications() {
  const bell = document.getElementById('notification-bell');
  const dropdown = document.getElementById('notification-dropdown');
  
  if (bell && dropdown) {
    bell.addEventListener('click', function(e) {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });
    
    document.addEventListener('click', function(e) {
      if (!dropdown.contains(e.target) && !bell.contains(e.target)) {
        dropdown.classList.remove('show');
      }
    });
  }

  fetchNotifications();
  // Poll every 60 seconds
  setInterval(fetchNotifications, 60000);
}

async function fetchNotifications() {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const res = await runBackendAction("getNotifications", []);
    if (res.success && res.notifications) {
      renderNotifications(res.notifications);
    }
  } catch (err) {
    console.error("Failed to fetch notifications", err);
  }
}

function renderNotifications(notifications) {
  const dropdown = document.getElementById('notification-dropdown');
  const badge = document.getElementById('notification-badge');
  if (!dropdown || !badge) return;

  // Clear existing items but keep header
  const header = dropdown.querySelector('.notification-header');
  dropdown.innerHTML = '';
  if (header) dropdown.appendChild(header);

  let unreadCount = 0;

  if (notifications.length === 0) {
    dropdown.innerHTML += '<div class="notif-empty">No notifications yet.</div>';
  } else {
    notifications.forEach(n => {
      if (!n.isRead) unreadCount++;
      const item = document.createElement('div');
      item.className = 'notification-item' + (n.isRead ? '' : ' unread');
      
      const dateStr = new Date(n.createdAt).toLocaleString();
      
      item.innerHTML = `
        <div class="notif-title">${n.title}</div>
        <div class="notif-msg">${n.message}</div>
        <div class="notif-time">${dateStr}</div>
      `;

      item.onclick = async () => {
        if (!n.isRead) {
          item.classList.remove('unread');
          unreadCount = Math.max(0, unreadCount - 1);
          updateBadge(badge, unreadCount);
          await runBackendAction("markNotificationRead", []); // Note: the backend expects { notificationId: n.id } in args? No, in Express body. 
          // Wait, our runBackendAction wraps args in an array. 
          // Express backend receives: { action, args: [...] }
          // Let's modify the runBackendAction call to pass the notificationId in args.
          await runBackendAction("markNotificationRead", [{ notificationId: n.id }]);
        }
      };

      dropdown.appendChild(item);
    });
  }

  updateBadge(badge, unreadCount);
}

function updateBadge(badge, count) {
  if (count > 0) {
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// --- Broadsheet Logic ---
function openBroadsheetModal() {
  var html = `
    <div class="aa-modal-backdrop open" id="broadsheetModal" style="z-index: 99999 !important;">
      <div class="aa-modal" style="max-width: 450px;">
        <div class="aa-modal-header">
          <h3 class="aa-modal-title">Download Broadsheet</h3>
          <button class="aa-modal-close" onclick="document.body.removeChild(this.closest('.aa-modal-backdrop'))"><i class="fa fa-times"></i></button>
        </div>
        <div class="aa-modal-body">
          <div class="aa-form-group">
            <label class="aa-label">Class</label>
            <select id="bsClass" class="aa-input">
              <option value="">Loading classes...</option>
            </select>
          </div>
          <div class="aa-form-group">
            <label class="aa-label">Term</label>
            <select id="bsTerm" class="aa-input">
              <option value="First Term">First Term</option>
              <option value="Second Term">Second Term</option>
              <option value="Third Term">Third Term</option>
            </select>
          </div>
          <div class="aa-form-group">
            <label class="aa-label">Session</label>
            <input type="text" id="bsSession" class="aa-input" placeholder="e.g. 2024/2025" />
          </div>
          <div class="aa-form-group">
            <label class="aa-label">Format</label>
            <select id="bsFormat" class="aa-input">
              <option value="csv">Excel / CSV</option>
              <option value="pdf">PDF Document</option>
            </select>
          </div>
          <button class="aa-btn aa-btn-primary" style="width:100%" onclick="generateBroadsheet()"><i class="fa fa-download"></i> Download</button>
        </div>
      </div>
    </div>
  `;
  var div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div.firstElementChild);
  
  if (AA.settings.current_session) document.getElementById('bsSession').value = AA.settings.current_session;
  if (AA.settings.current_term) document.getElementById('bsTerm').value = AA.settings.current_term;
  
  // Fetch classes
  callServer('adminGetClasses', [AA.token, ''], function(res) {
    var sel = document.getElementById('bsClass');
    if(!sel) return;
    sel.innerHTML = '<option value="">-- Select Class --</option>';
    if (res && res.length) { // API returns an array directly for adminGetClasses in scripts.js wrapper?
      // Wait, let's check how callServer passes data. The callback receives `res.data` if success, or `res` if it's the raw payload. 
      // Most places use data.forEach where callback argument is `data`.
      var list = Array.isArray(res) ? res : (res.data || []);
      list.forEach(function(c) {
        sel.innerHTML += '<option value="'+c.className+'">'+c.className+'</option>';
      });
    }
  }, null, true);
}

function generateBroadsheet() {
  var cls = document.getElementById('bsClass').value;
  var term = document.getElementById('bsTerm').value;
  var session = document.getElementById('bsSession').value;
  var format = document.getElementById('bsFormat').value;
  
  if (!cls || !term || !session) return showToast('Please fill all fields', 'error');
  
  showToast('Gathering broadsheet data...', 'info');
  var btn = document.querySelector('#broadsheetModal .aa-btn-primary');
  btn.disabled = true;
  btn.innerHTML = '<i class="fa fa-spinner fa-spin"></i> Generating...';
  
  callServer('adminGetBroadsheetData', [AA.token, cls, term, session], function(res) {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa fa-download"></i> Download';
    
    if (res.success === false) return showToast(res.message || 'An error occurred.', 'error');
    
    var payload = res.success !== undefined ? res.data : res;
    if (!payload || !payload.students || payload.students.length === 0) return showToast('No data found for this class.', 'warning');
    
    var subjects = payload.subjects;
    var students = payload.students;
    var schoolName = AA.settings.school_name || 'School';
    
    if (format === 'csv') {
      var csv = "Student Name,";
      csv += subjects.join(",") + ",Total,Average\n";
      students.forEach(function(s) {
        csv += '"' + s.fullName + '",';
        subjects.forEach(function(sub) {
          csv += (s.subjects[sub] || 0) + ",";
        });
        csv += s.totalScore + "," + s.average + "\n";
      });
      var link = document.createElement("a");
      link.setAttribute("href", encodeURI("data:text/csv;charset=utf-8," + csv));
      link.setAttribute("download", cls + "_Broadsheet_" + term + ".csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Broadsheet downloaded.', 'success');
      document.querySelector('#broadsheetModal .aa-modal-close').click();
    } else if (format === 'pdf') {
      if (typeof window.jspdf === 'undefined') return showToast('PDF library not loaded.', 'error');
      var doc = new window.jspdf.jsPDF({ orientation: 'landscape' });
      doc.setFontSize(16);
      doc.text(schoolName + ' - Broadsheet', 14, 15);
      doc.setFontSize(10);
      doc.text('Class: ' + cls + ' | Term: ' + term + ' | Session: ' + session, 14, 22);
      
      var head = [['Student Name'].concat(subjects).concat(['Total', 'Avg'])];
      var body = students.map(function(s) {
        var row = [s.fullName];
        subjects.forEach(function(sub) { row.push(s.subjects[sub] || 0); });
        row.push(s.totalScore);
        row.push(s.average);
        return row;
      });
      
      var breakColsMeta = {};
    var tableStartY = 9999;
    var tableEndY = 0;

    doc.autoTable({
        startY: 28,
        head: head,
        body: body,
        theme: 'grid',
        styles: { fontSize: 8 },
        headStyles: { fillColor: [30, 58, 95] }
      });
      
      doc.save(cls + "_Broadsheet.pdf");
      showToast('Broadsheet PDF downloaded.', 'success');
      document.querySelector('#broadsheetModal .aa-modal-close').click();
    }
  });
}



// ==========================================
// TIMETABLE GENERATOR FRONTEND LOGIC
// ==========================================

var timetableConfig = { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], periods: [] };

function loadTimetable() {
    // Use already-loaded globalClasses if available, else fetch
    var classes = (typeof globalClasses !== 'undefined' && globalClasses.length) ? globalClasses : [];
    if (classes.length) {
        _populateTimetableClassOptions(classes);
    } else {
        callServer('adminGetClasses', [AA.token], function(data) {
            var list = Array.isArray(data) ? data : (data && Array.isArray(data.data) ? data.data : []);
            _populateTimetableClassOptions(list);
        });
    }

    var sessionSelect = document.getElementById('timetable-session-select');
    if (sessionSelect) {
        var sessVal = (typeof currentSession !== 'undefined' && currentSession) ? currentSession :
                      (AA.settings && AA.settings.current_session ? AA.settings.current_session : '');
        var termVal = (typeof currentTerm !== 'undefined' && currentTerm) ? currentTerm :
                      (AA.settings && AA.settings.current_term ? AA.settings.current_term : '');
        var currentYear = parseInt((sessVal || '').split('/')[0]) || new Date().getFullYear();
        var html = '';
        for (var i = 0; i < 5; i++) {
            var y1 = currentYear - i;
            var y2 = y1 + 1;
            var val = y1 + '/' + y2;
            var sel = (val === sessVal) ? 'selected' : '';
            html += '<option value="' + val + '" ' + sel + '>' + val + '</option>';
        }
        sessionSelect.innerHTML = html;
        if (termVal) {
            var termSelect = document.getElementById('timetable-term-select');
            if (termSelect) termSelect.value = termVal;
        }
    }
}

function _populateTimetableClassOptions(classes) {
    var clsOpts = '<option value="">Select Class...</option>';
    classes.forEach(function(c) { clsOpts += '<option value="' + c.className + '">' + c.className + '</option>'; });
    var clsSelect = document.getElementById('timetable-class-select');
    if (clsSelect) clsSelect.innerHTML = clsOpts;

    var chkHtml = '';
    classes.forEach(function(c) {
        chkHtml += '<div><label><input type="checkbox" class="tt-class-chk" value="' + c.className + '"> ' + c.className + '</label></div>';
    });
    var ttGenClasses = document.getElementById('tt-gen-classes');
    if (ttGenClasses) ttGenClasses.innerHTML = chkHtml || '<p class="text-muted">No classes found.</p>';
}

var activeTimetableDay = '';

function openTimetableConfigModal() {
    callServer('adminGetTimetableConfig', [AA.token], function(res) {
        if (res && res.success && res.data) {
            timetableConfig = res.data;
        } else if (res && res.days) {
            timetableConfig = res;
        } else {
            timetableConfig = { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], scheduleTemplate: {} };
        }
        if (!timetableConfig.days) timetableConfig.days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        if (!timetableConfig.scheduleTemplate) timetableConfig.scheduleTemplate = {};

        // Migrate old periods format: copy to each day independently
        if (timetableConfig.periods && timetableConfig.periods.length > 0) {
            timetableConfig.days.forEach(function(day) {
                if (!timetableConfig.scheduleTemplate[day]) {
                    timetableConfig.scheduleTemplate[day] = JSON.parse(JSON.stringify(timetableConfig.periods));
                }
            });
        }

        document.getElementById('tt-cfg-days').value = timetableConfig.days.join(', ');
        activeTimetableDay = timetableConfig.days.length > 0 ? timetableConfig.days[0] : '';

        _renderTimetableDayTabs();
        openModal('modal-timetable-config');
    });
}

function renderTimetableDayTabs() {
    // Called when the days input changes - parse new days, preserve existing scheduleTemplate
    var newDays = document.getElementById('tt-cfg-days').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    // Add new days with empty schedule (don't copy from others)
    newDays.forEach(function(day) {
        if (!timetableConfig.scheduleTemplate[day]) {
            timetableConfig.scheduleTemplate[day] = [];
        }
    });
    timetableConfig.days = newDays;
    if (!timetableConfig.days.includes(activeTimetableDay)) {
        activeTimetableDay = timetableConfig.days.length > 0 ? timetableConfig.days[0] : '';
    }
    _renderTimetableDayTabs();
}

function _renderTimetableDayTabs() {
    var html = '';
    timetableConfig.days.forEach(function(day) {
        var isAct = day === activeTimetableDay;
        var btnClass = isAct ? 'aa-btn-primary' : 'aa-btn-outline';
        html += '<button class="aa-btn aa-btn-sm ' + btnClass + '" onclick="setActiveTimetableDay(\'' + day + '\')">' + day + '</button>';
    });
    var tabsEl = document.getElementById('tt-cfg-day-tabs');
    if (tabsEl) tabsEl.innerHTML = html;
    _renderTimetableSlots();
}

function setActiveTimetableDay(day) {
    activeTimetableDay = day;
    _renderTimetableDayTabs();
}

function _renderTimetableSlots() {
    var actDayEl = document.getElementById('tt-cfg-active-day');
    if (actDayEl) actDayEl.innerText = activeTimetableDay;

    if (!activeTimetableDay) {
        document.getElementById('tt-cfg-slots').innerHTML = '<p class="text-muted">No day selected.</p>';
        return;
    }
    if (!timetableConfig.scheduleTemplate[activeTimetableDay]) {
        timetableConfig.scheduleTemplate[activeTimetableDay] = [];
    }

    var periods = timetableConfig.scheduleTemplate[activeTimetableDay];
    var html = '';

    if (periods.length === 0) {
        html = '<p class="text-muted" style="padding:10px;">No slots added for ' + activeTimetableDay + ' yet. Click "Add Slot" to begin.</p>';
    }

    periods.forEach(function(p, idx) {
        var typeVal = p.type || (p.isBreak ? 'Break' : 'Subject');
        var isBreakOrEvent = (typeVal === 'Break' || typeVal === 'Event');

        var d = activeTimetableDay.replace(/'/g, "\'");

        var typeSel = '<select class="aa-input" style="min-width:100px;" onchange="_onSlotTypeChange(\'' + d + '\',' + idx + ',this.value)">' +
            '<option value="Subject"' + (typeVal === 'Subject' ? ' selected' : '') + '>Subject</option>' +
            '<option value="Break"'  + (typeVal === 'Break'   ? ' selected' : '') + '>Break</option>'   +
            '<option value="Event"'  + (typeVal === 'Event'   ? ' selected' : '') + '>Event</option>'   +
            '</select>';

        var customLabelField = isBreakOrEvent
            ? '<div style="flex:1;"><label>Break/Event Name</label>' +
              '<input type="text" class="aa-input" value="' + (p.customLabel || '').replace(/"/g, '&quot;') + '" ' +
              'placeholder="e.g. Short Break" onchange="_onSlotCustomLabel(\'' + d + '\',' + idx + ',this.value)"></div>'
            : '';

        var rowBg = isBreakOrEvent ? 'background:#fef3c7;' : 'background:#f8fafc;';

        html += '<div class="aa-form-group" style="display:flex; gap:10px; align-items:flex-end; ' + rowBg + ' padding:10px; border-radius:5px; margin-bottom:6px;">' +
            '<div style="flex:2;"><label>Period ' + (idx + 1) + ' Time</label>' +
            '<input type="text" class="aa-input" value="' + (p.label || '').replace(/"/g, '&quot;') + '" placeholder="e.g. 08:00 - 08:40" ' +
            'onchange="_onSlotLabel(\'' + d + '\',' + idx + ',this.value)"></div>' +
            '<div><label>Type</label>' + typeSel + '</div>' +
            customLabelField +
            '<button class="aa-btn aa-btn-sm aa-btn-danger" style="margin-bottom:0;" onclick="removeTimetableSlot(\'' + d + '\',' + idx + ')"><i class="fa fa-trash"></i></button>' +
            '</div>';
    });

    document.getElementById('tt-cfg-slots').innerHTML = html;
}

function _onSlotLabel(day, idx, val) {
    if (!timetableConfig.scheduleTemplate[day]) return;
    timetableConfig.scheduleTemplate[day][idx].label = val;
}
function _onSlotTypeChange(day, idx, val) {
    if (!timetableConfig.scheduleTemplate[day]) return;
    timetableConfig.scheduleTemplate[day][idx].type = val;
    timetableConfig.scheduleTemplate[day][idx].isBreak = (val === 'Break');
    _renderTimetableSlots();
}
function _onSlotCustomLabel(day, idx, val) {
    if (!timetableConfig.scheduleTemplate[day]) return;
    timetableConfig.scheduleTemplate[day][idx].customLabel = val;
}

function addTimetableSlot() {
    if (!activeTimetableDay) return showToast('Please select a day tab first.', 'warning');
    if (!timetableConfig.scheduleTemplate[activeTimetableDay]) timetableConfig.scheduleTemplate[activeTimetableDay] = [];
    timetableConfig.scheduleTemplate[activeTimetableDay].push({ label: '', type: 'Subject', customLabel: '' });
    _renderTimetableSlots();
}

function removeTimetableSlot(day, idx) {
    if (!timetableConfig.scheduleTemplate[day]) return;
    timetableConfig.scheduleTemplate[day].splice(idx, 1);
    _renderTimetableSlots();
}

function saveTimetableConfig() {
    timetableConfig.days = document.getElementById('tt-cfg-days').value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
    // Keep a legacy periods field pointing at Monday (or first day) for any old code
    var firstDay = timetableConfig.days[0];
    timetableConfig.periods = firstDay ? (timetableConfig.scheduleTemplate[firstDay] || []) : [];

    callServer('adminSaveTimetableConfig', [AA.token, timetableConfig], function(res) {
        if (res && res.success) {
            showToast(res.message || 'Configuration saved.', 'success');
            closeModal('modal-timetable-config');
        } else {
            showToast((res && res.message) ? res.message : 'Failed to save configuration.', 'error');
        }
    }, null, true);
}

function openTimetableGenerateModal() {
    loadTimetable();
    openModal('modal-timetable-generate');
}

function selectAllTtClasses(val) {
    document.querySelectorAll('.tt-class-chk').forEach(function(c) { c.checked = val; });
}

function generateTimetable() {
    var classes = Array.from(document.querySelectorAll('.tt-class-chk:checked')).map(function(c) { return c.value; });
    if (classes.length === 0) return showToast('Please select at least one class.', 'warning');

    var term = document.getElementById('timetable-term-select').value;
    var session = document.getElementById('timetable-session-select').value;

    var btn = document.getElementById('btn-generate-timetable');
    btn.disabled = true;
    btn.innerHTML = 'Generating...';

    callServer('adminGetTimetableConfig', [AA.token], function(res) {
        var config = (res && res.success && res.data) ? res.data : (res && res.days ? res : null);
        var hasSlots = config && config.days && (
            (config.scheduleTemplate && config.days.some(function(d) { return config.scheduleTemplate[d] && config.scheduleTemplate[d].length > 0; })) ||
            (config.periods && config.periods.length > 0)
        );
        if (!hasSlots) {
            btn.disabled = false; btn.innerHTML = 'Generate Now';
            return showToast('Please configure timetable format first (add at least one time slot).', 'error');
        }
        callServer('adminGenerateTimetable', [AA.token, classes, term, session, config], function(resGen) {
            btn.disabled = false; btn.innerHTML = 'Generate Now';
            if (resGen && resGen.success) {
                showToast(resGen.message || 'Timetable generated successfully!', 'success');
                closeModal('modal-timetable-generate');
                var clsSel = document.getElementById('timetable-class-select');
                if (clsSel && clsSel.value) loadTimetableData();
            } else {
                showToast((resGen && resGen.message) ? resGen.message : 'Error generating timetable.', 'error');
            }
        }, function() {
            btn.disabled = false; btn.innerHTML = 'Generate Now';
            showToast('Error generating timetable.', 'error');
        }, true);
    });
}

function loadTimetableData() {
    var className = document.getElementById('timetable-class-select').value;
    var term = document.getElementById('timetable-term-select').value;
    var session = document.getElementById('timetable-session-select').value;
    if (!className) return showToast('Please select a class.', 'warning');

    var area = document.getElementById('timetable-display-area');
    area.innerHTML = '<p>Loading...</p>';

    callServer('adminGetTimetableConfig', [AA.token], function(resCfg) {
        var config = (resCfg && resCfg.success && resCfg.data) ? resCfg.data : (resCfg && resCfg.days ? resCfg : null);
        if (!config || !config.days) {
            area.innerHTML = '<p class="text-muted">Timetable configuration is missing.</p>';
            return;
        }
        callServer('adminGetTimetables', [AA.token, term, session], function(resTt) {
            var list = (resTt && resTt.success && resTt.data) ? resTt.data : (Array.isArray(resTt) ? resTt : null);
            if (!list) { area.innerHTML = '<p class="text-danger">Failed to load timetable data.</p>'; return; }

            var tt = list.find(function(t) { return t.className === className; });
            if (!tt) { area.innerHTML = '<p class="text-muted">No timetable generated for this class yet.</p>'; return; }

            var isPrimary = ['primary','nursery','creche','basic','year','playgroup'].some(function(k){ return className.toLowerCase().includes(k); });
            var secType = isPrimary ? 'Primary' : 'High';

            window.globalTimetableList   = list;
            window.globalTimetableConfig = config;
            window.globalClassName       = className;

            /* ── Group days by identical slot signature ── */
            function sig(day) {
                var ps = (config.scheduleTemplate && config.scheduleTemplate[day]) || config.periods || [];
                return ps.map(function(p){ return p.label+'|'+(p.type||'')+'|'+(p.customLabel||''); }).join('~');
            }
            var groups = [], sigIdx = {};
            config.days.forEach(function(day){
                var s = sig(day);
                if (sigIdx[s] !== undefined) { groups[sigIdx[s]].days.push(day); }
                else {
                    var ps = (config.scheduleTemplate && config.scheduleTemplate[day]) || config.periods || [];
                    sigIdx[s] = groups.length;
                    groups.push({ days:[day], periods:ps });
                }
            });

            /* ── Build on-screen tables ── */
            var btnHtml =
                '<div style="text-align:right;margin-bottom:10px;">' +
                '<button class="aa-btn aa-btn-sm aa-btn-secondary" style="margin-right:10px;" onclick="downloadMasterTimetablePDF(\''+secType+'\')">' +
                '<i class="fa fa-file-excel"></i> Export Master ('+secType+')</button>' +
                '<button id="btn-export-class-pdf" class="aa-btn aa-btn-sm aa-btn-danger" onclick="downloadTimetablePDF(\''+className+'\')">' +
                '<i class="fa fa-file-pdf"></i> Export Class PDF</button></div>';

            var maxCols = 0;
            config.days.forEach(function(d) {
                var len = 0;
                var pIdx = 0;
                var pds = (config.scheduleTemplate && config.scheduleTemplate[d]) || config.periods || [];
                while (pIdx < pds.length) {
                    var p = pds[pIdx]; var pt = p.type || (p.isBreak ? 'Break' : 'Subject');
                    if (pt === 'Break' || pt === 'Event') {
                        var span = 1;
                        while (pIdx+span < pds.length) {
                            var nx = pds[pIdx+span]; var nt = nx.type||(nx.isBreak?'Break':'Subject');
                            if (nt==='Break'||nt==='Event') span++; else break;
                        }
                        len++; pIdx += span;
                    } else {
                        len++; pIdx++;
                    }
                }
                if (len > maxCols) maxCols = len;
            });

            function buildTheadRow(ps, isSub) {
                var bg = isSub ? '#64748b' : '';
                var fg = isSub ? '#ffffff' : '';
                var style = isSub ? ('background:'+bg+';color:'+fg+';') : '';
                var tr = '<tr><th style="'+style+'text-align:left;min-width:90px;font-weight:bold;">Day</th>';
                var pIdx = 0, currentCols = 0;
                while (pIdx < ps.length) {
                    var p = ps[pIdx]; var pt = p.type || (p.isBreak ? 'Break' : 'Subject');
                    if (pt === 'Break' || pt === 'Event') {
                        var span = 1;
                        while (pIdx+span < ps.length) {
                            var nx = ps[pIdx+span]; var nt = nx.type||(nx.isBreak?'Break':'Subject');
                            if (nt==='Break'||nt==='Event') span++; else break;
                        }
                        var bn = p.customLabel||p.label||'Break';
                        var btime = (p.startTime && p.endTime) ? (p.startTime + ' - ' + p.endTime) : (p.label || bn);
                        var brbg = isSub ? '#94a3b8' : '#e2e8f0';
                        var brfg = isSub ? '#ffffff' : '#b91c1c';
                        tr += '<th colspan="'+span+'" style="background:'+brbg+';color:'+brfg+';text-align:center;white-space:nowrap;font-weight:bold;">' + btime + '</th>';
                        pIdx += span; currentCols++;
                    } else {
                        var slbl = (p.startTime && p.endTime) ? (p.startTime + ' - ' + p.endTime) : (p.label||'');
                        tr += '<th style="'+style+'text-align:center;white-space:nowrap;font-weight:bold;">' + slbl + '</th>';
                        pIdx++; currentCols++;
                    }
                }
                while (currentCols < maxCols) {
                    tr += '<th style="'+style+'"></th>';
                    currentCols++;
                }
                tr += '</tr>';
                return tr;
            }

            var allTables = '<div style="overflow-x:auto;"><table class="aa-table" id="timetable-class-table">';
            
            groups.forEach(function(grp, gIdx) {
                var ps = grp.periods;
                if (gIdx === 0) {
                    allTables += '<thead>' + buildTheadRow(ps, false) + '</thead><tbody>';
                } else {
                    allTables += buildTheadRow(ps, true);
                }
                
                grp.days.forEach(function(day, dayIdxInGroup) {
                    var sch = (tt.schedule && tt.schedule[day]) || [];
                    allTables += '<tr><td style="font-weight:bold;white-space:nowrap;vertical-align:middle;">'+day+'</td>';
                    var pi = 0, currentCols = 0;
                    while (pi < ps.length) {
                        var cp = ps[pi]; var cpt = cp.type||(cp.isBreak?'Break':'Subject');
                        if (cpt==='Break'||cpt==='Event') {
                            var sp = 1;
                            while (pi+sp < ps.length) {
                                var np=ps[pi+sp]; var npt=np.type||(np.isBreak?'Break':'Subject');
                                if (npt==='Break'||npt==='Event') sp++; else break;
                            }
                            if (dayIdxInGroup === 0) {
                                var bn = cp.customLabel || 'Break';
                                var verticalStyle = 'writing-mode: vertical-rl; transform: rotate(180deg); margin: 0 auto; letter-spacing: 2px;';
                                allTables += '<td rowspan="'+grp.days.length+'" colspan="'+sp+'" style="background:#e2e8f0;text-align:center;font-weight:bold;color:#b91c1c;vertical-align:middle;padding:10px 0;"><div style="'+verticalStyle+'">'+bn.toUpperCase()+'</div></td>';
                            }
                            pi += sp; currentCols++;
                        } else {
                            var en = sch[pi]||null;
                            var ct = (en && en.type==='Subject') ? en.subjectName : '-';
                            
                            // Smart font sizing for HTML table
                            var fontSizeStyle = '';
                            if (ct.length > 15) fontSizeStyle = 'font-size:0.85em;letter-spacing:-0.2px;';
                            if (ct.length > 20) fontSizeStyle = 'font-size:0.75em;letter-spacing:-0.4px;';
                            
                            allTables += '<td style="text-align:center;vertical-align:middle;'+fontSizeStyle+'">'+ct+'</td>';
                            pi++; currentCols++;
                        }
                    }
                    while (currentCols < maxCols) {
                        allTables += '<td style="border:none;"></td>';
                        currentCols++;
                    }
                    allTables += '</tr>';
                });
            });
            allTables += '</tbody></table></div>';

            area.innerHTML = btnHtml + allTables;
        });
    });
}

function downloadTimetablePDF(className) {
    if (typeof window.jspdf === 'undefined') return showToast('PDF library not loaded.', 'error');
    var config = window.globalTimetableConfig;
    var list   = window.globalTimetableList;
    var cn     = className || window.globalClassName;
    if (!config || !list || !cn) return showToast('Please load a class timetable first.', 'error');

    var tt = list.find(function(t){ return t.className === cn; });
    if (!tt) return showToast('Timetable not found.', 'error');

    var jsPDF = window.jspdf.jsPDF;
    var doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    var pw    = doc.internal.pageSize.getWidth();

    var schoolName = (document.getElementById('sb-school-name')||{}).innerText || 'School';
    var termSel    = document.getElementById('timetable-term-select');
    var term       = termSel ? termSel.options[termSel.selectedIndex].text : '';
    var session    = (document.getElementById('timetable-session-select')||{}).value || '';

    doc.setFontSize(16); doc.setFont(undefined, 'bold');
    doc.text(schoolName, pw/2, 14, {align:'center'});
    doc.setFontSize(11); doc.setFont(undefined, 'normal');
    doc.text('Class Timetable: '+cn+' ('+term+', '+session+')', pw/2, 21, {align:'center'});

    function getDayPeriods(day) {
        return (config.scheduleTemplate && config.scheduleTemplate[day]) || config.periods || [];
    }

    function buildEffectiveCols(periods) {
        var cols = [];
        var pi = 0;
        while (pi < periods.length) {
            var p  = periods[pi];
            var pt = p.type || (p.isBreak ? 'Break' : 'Subject');
            if (pt === 'Break' || pt === 'Event') {
                var bn    = p.customLabel || p.label || 'Break';
                var btime = (p.startTime && p.endTime) ? (p.startTime + ' - ' + p.endTime) : (p.label || bn);
                var idxs  = [pi]; pi++;
                while (pi < periods.length) {
                    var np  = periods[pi];
                    var npt = np.type || (np.isBreak ? 'Break' : 'Subject');
                    if (npt === 'Break' || npt === 'Event') { idxs.push(pi); pi++; } else break;
                }
                cols.push({ type: 'break', label: bn, timeLabel: btime, origIdxs: idxs });
            } else {
                var slotLabel = (p.startTime && p.endTime) ? (p.startTime + ' - ' + p.endTime) : (p.label || ('P' + (pi + 1)));
                cols.push({ type: 'subject', label: slotLabel, origIdx: pi });
                pi++;
            }
        }
        return cols;
    }

    function dayKey(day) {
        return JSON.stringify(getDayPeriods(day).map(function(p){ return p.startTime + p.endTime + p.type; }));
    }
    
    if (config.days.length === 0) return showToast('No days configured.', 'error');

    var maxCols = 0;
    config.days.forEach(function(d) {
        var len = buildEffectiveCols(getDayPeriods(d)).length;
        if (len > maxCols) maxCols = len;
    });
    
    var firstDayKey = dayKey(config.days[0]);
    var masterCols  = buildEffectiveCols(getDayPeriods(config.days[0]));

    var DK = [30, 58, 95];
    var GR = [226, 232, 240];

    function buildHeadRow(eCols) {
        var row = [
            { content: 'DAY', styles: { fillColor: DK, textColor: [255,255,255], fontStyle: 'bold', halign: 'center' } }
        ];
        eCols.forEach(function(col) {
            if (col.type === 'break') {
                row.push({ content: col.timeLabel,
                           styles: { fillColor: GR, textColor: [200,0,0], fontStyle: 'bold', halign: 'center', valign: 'middle' } });
            } else {
                row.push({ content: col.label,
                           styles: { fillColor: DK, textColor: [255,255,255], halign: 'center' } });
            }
        });
        while (row.length < maxCols + 1) {
            row.push({ content: '', styles: { fillColor: DK } });
        }
        return row;
    }

    var body = [];
    var rowBreakMeta = [];

    config.days.forEach(function(day, dayIdx) {
        var dKey       = dayKey(day);
        var isDifferent = (dKey !== firstDayKey);
        var eCols       = isDifferent ? buildEffectiveCols(getDayPeriods(day)) : masterCols;

        if (isDifferent) {
            var subHead = buildHeadRow(eCols);
            subHead.forEach(function(cell) {
                if (cell.styles && cell.styles.fillColor === DK) {
                    cell.styles.fillColor = [100, 116, 139]; // Subheader color
                }
            });
            body.push(subHead);
            rowBreakMeta.push({ isSubHeader: true, breakCols: {}, day: day });
        }

        var sch = (tt.schedule && tt.schedule[day]) || [];
        var row = [];

        // Horizontal Day Name
        row.push({ content: day, styles: { fontStyle: 'bold', halign: 'left', fillColor: [248,250,252] } });

        var breakCols = {};
        eCols.forEach(function(col, i) {
            if (col.type === 'break') {
                breakCols[1 + i] = col.label;
                row.push({ content: ' ', styles: { fillColor: GR, halign: 'center', valign: 'middle' } });
            } else {
                var entry = (sch[col.origIdx] || null);
                var text  = (entry && entry.type === 'Subject') ? entry.subjectName : '-';
                row.push({ content: text, styles: { halign: 'center' } });
            }
        });
        while (row.length < maxCols + 1) {
            row.push({ content: '', styles: { fillColor: [248,250,252] } });
        }

        body.push(row);
        rowBreakMeta.push({ isSubHeader: false, breakCols: breakCols, day: day });
    });

    var breakColsMeta = {};
    var tableStartY = 9999;
    var tableEndY = 0;

    doc.autoTable({
        head: [buildHeadRow(masterCols)],
        body: body,
        startY: 26,
        theme: 'grid',
        headStyles: { fontSize: 8, fontStyle: 'bold', halign: 'center', valign: 'middle' },
        styles:     { fontSize: 8, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 25, halign: 'left' }
        },
        didDrawCell: function(data) {
            if (data.row.section !== 'body') return;
            var meta = rowBreakMeta[data.row.index];
            if (!meta || meta.isSubHeader) return;

            tableStartY = Math.min(tableStartY, data.cell.y);
            tableEndY = Math.max(tableEndY, data.cell.y + data.cell.height);
            
            var breakLabel = meta.breakCols && meta.breakCols[data.column.index];
            if (breakLabel) {
                breakColsMeta[data.column.index] = { x: data.cell.x, w: data.cell.width, label: breakLabel };
            }

            // Smart Font Sizing for subjects in cell
            if (meta.breakCols && !meta.breakCols[data.column.index] && data.column.index > 0) {
                var text = data.cell.raw.content || data.cell.raw;
                if (text && text.length > 15) {
                    doc.saveGraphicsState();
                    doc.setFontSize(6.5);
                    doc.setTextColor(data.cell.styles.textColor);
                    doc.restoreGraphicsState();
                }
            }
        },
        didDrawPage: function(data) {
            if (tableStartY < tableEndY) {
                var cy = (tableStartY + tableEndY) / 2;
                for (var colIdx in breakColsMeta) {
                    var b = breakColsMeta[colIdx];
                    var cx = b.x + b.w / 2;
                    doc.saveGraphicsState();
                    doc.setFontSize(8);
                    doc.setFont(undefined, 'bold');
                    doc.setTextColor(200, 0, 0);
                    var brkStr = b.label.toUpperCase();
                    var tw = doc.getStringUnitWidth(brkStr) * 8 / doc.internal.scaleFactor;
                    var fontHeight = 8 / doc.internal.scaleFactor;
                    var adjustedCx = cx + fontHeight / 3;
                    doc.text(brkStr, adjustedCx, cy + tw / 2, { angle: 90 });
                    doc.restoreGraphicsState();
                }
            }
        }
    });

    doc.save('Class_Timetable_' + cn + '.pdf');
}

function downloadMasterTimetablePDF(section) {
    if (typeof window.jspdf === 'undefined') return showToast('PDF library not loaded.', 'error');
    var list   = window.globalTimetableList;
    var config = window.globalTimetableConfig;
    if (!list || !config) return showToast('Please load timetable data first.', 'error');

    var filteredList = list.filter(function(t) {
        var c = t.className.toLowerCase();
        var isPri = ['primary','nursery','creche','basic','year','playgroup'].some(function(k){ return c.includes(k); });
        if (section === 'Primary') return isPri;
        if (section === 'High')    return !isPri;
        return true;
    });
    if (!filteredList.length) return showToast('No timetables for ' + section + ' section.', 'warning');
    

    var jsPDF = window.jspdf.jsPDF;
    var doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' });
    var pw    = doc.internal.pageSize.getWidth();

    var schoolName = (document.getElementById('sb-school-name') || {}).innerText || 'School';
    var termSel    = document.getElementById('timetable-term-select');
    var term       = termSel ? termSel.options[termSel.selectedIndex].text : '';
    var session    = (document.getElementById('timetable-session-select') || {}).value || '';

    doc.setFontSize(16); doc.setFont(undefined, 'bold');
    doc.text(schoolName, pw / 2, 14, { align: 'center' });
    doc.setFontSize(11); doc.setFont(undefined, 'normal');
    doc.text('Master Timetable: ' + section + ' Section  (' + term + ', ' + session + ')', pw / 2, 21, { align: 'center' });

    function getDayPeriods(day) {
        return (config.scheduleTemplate && config.scheduleTemplate[day]) || config.periods || [];
    }

    function buildEffectiveCols(periods) {
        var cols = [];
        var pi = 0;
        while (pi < periods.length) {
            var p  = periods[pi];
            var pt = p.type || (p.isBreak ? 'Break' : 'Subject');
            if (pt === 'Break' || pt === 'Event') {
                var bn    = p.customLabel || p.label || 'Break';
                var btime = (p.startTime && p.endTime) ? (p.startTime + ' - ' + p.endTime) : (p.label || bn);
                var idxs  = [pi]; pi++;
                while (pi < periods.length) {
                    var np  = periods[pi];
                    var npt = np.type || (np.isBreak ? 'Break' : 'Subject');
                    if (npt === 'Break' || npt === 'Event') { idxs.push(pi); pi++; } else break;
                }
                cols.push({ type: 'break', label: bn, timeLabel: btime, origIdxs: idxs });
            } else {
                var slotLabel = (p.startTime && p.endTime) ? (p.startTime + ' - ' + p.endTime) : (p.label || ('P' + (pi + 1)));
                cols.push({ type: 'subject', label: slotLabel, origIdx: pi });
                pi++;
            }
        }
        return cols;
    }

    function dayKey(day) {
        return JSON.stringify(getDayPeriods(day).map(function(p){ return p.startTime + p.endTime + p.type; }));
    }

    if (config.days.length === 0) return showToast('No days configured.', 'error');
    
    var maxCols = 0;
    config.days.forEach(function(d) {
        var len = buildEffectiveCols(getDayPeriods(d)).length;
        if (len > maxCols) maxCols = len;
    });

    var firstDayKey = dayKey(config.days[0]);
    var masterCols  = buildEffectiveCols(getDayPeriods(config.days[0]));
    var nClasses    = filteredList.length;

    var DK = [30, 58, 95];
    var GR = [226, 232, 240];

    function buildHeadRow(eCols) {
        var row = [
            { content: '',         styles: { fillColor: DK } },
            { content: 'CLASSES',  styles: { fillColor: DK, textColor: [255,255,255], fontStyle: 'bold', halign: 'center' } }
        ];
        eCols.forEach(function(col) {
            if (col.type === 'break') {
                row.push({ content: col.timeLabel,
                           styles: { fillColor: GR, textColor: [200,0,0], fontStyle: 'bold', halign: 'center', valign: 'middle' } });
            } else {
                row.push({ content: col.label,
                           styles: { fillColor: DK, textColor: [255,255,255], halign: 'center' } });
            }
        });
        while (row.length < maxCols + 2) {
            row.push({ content: '', styles: { fillColor: DK } });
        }
        return row;
    }

    function getBreakAbsCols(eCols) {
        var map = {};
        eCols.forEach(function(col, i) {
            if (col.type === 'break') map[2 + i] = col.label;
        });
        return map;
    }

    var masterBreakAbsCols = getBreakAbsCols(masterCols);

    var body = [];
    var rowBreakMeta = [];

    config.days.forEach(function(day, dayIdx) {
        var dKey       = dayKey(day);
        var isDifferent = (dKey !== firstDayKey);
        var eCols       = isDifferent ? buildEffectiveCols(getDayPeriods(day)) : masterCols;
        var breakAbsCols = isDifferent ? getBreakAbsCols(eCols) : masterBreakAbsCols;

        if (isDifferent) {
            var subHead = buildHeadRow(eCols);
            subHead.forEach(function(cell) {
                if (cell.styles && cell.styles.fillColor === DK) {
                    cell.styles.fillColor = [50, 85, 130];
                }
            });
            body.push(subHead);
            rowBreakMeta.push({ isSubHeader: true, breakCols: {}, day: day });
        }

        var sch_map = {};
        filteredList.forEach(function(tt) {
            sch_map[tt.className] = (tt.schedule && tt.schedule[day]) || [];
        });

        filteredList.forEach(function(tt, clsIdx) {
            var sch = sch_map[tt.className];
            var row = [];

            if (clsIdx === 0) {
                row.push({ content: ' ', rowSpan: nClasses,
                           styles: { fillColor: DK, halign: 'center', valign: 'middle' } });
            }

            row.push({ content: tt.className, styles: { fontStyle: 'bold', halign: 'left' } });

            eCols.forEach(function(col, i) {
                if (col.type === 'break') {
                    row.push({ content: ' ', styles: { fillColor: GR, halign: 'center', valign: 'middle' } });
                } else {
                    var entry = (sch[col.origIdx] || null);
                    var text  = (entry && entry.type === 'Subject') ? entry.subjectName : '-';
                    row.push({ content: text, styles: { halign: 'center' } });
                }
            });
            while (row.length < maxCols + 2) {
                row.push({ content: '', styles: { fillColor: [255,255,255] } });
            }

            body.push(row);
            rowBreakMeta.push({ isSubHeader: false, breakCols: breakAbsCols, day: day, clsIdx: clsIdx });
        });
    });

    var breakColsMeta = {};
    var tableStartY = 9999;
    var tableEndY = 0;

    doc.autoTable({
        head: [buildHeadRow(masterCols)],
        body: body,
        startY: 26,
        theme: 'grid',
        headStyles: { fontSize: 8.5, fontStyle: 'bold', halign: 'center', valign: 'middle' },
        styles:     { fontSize: 8.5, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 10, halign: 'center' },
            1: { cellWidth: 35, halign: 'left' }
        },
        didParseCell: function(data) {
            if (data.row.section === 'body') {
                var meta = rowBreakMeta[data.row.index];
                if (meta && !meta.isSubHeader && data.column.index === 0) {
                    if (meta.clsIdx === 0) {
                        data.cell.styles.fillColor = [240, 244, 248];
                        data.cell.styles.textColor = [30, 58, 95];
                        data.cell.text = meta.day;
                    } else {
                        data.cell.text = '';
                    }
                }
            }
        },
        didDrawCell: function(data) {
            if (data.row.section !== 'body') return;
            var meta = rowBreakMeta[data.row.index];
            if (!meta || meta.isSubHeader) return;

            tableStartY = Math.min(tableStartY, data.cell.y);
            tableEndY = Math.max(tableEndY, data.cell.y + data.cell.height);

            var breakLabel = meta.breakCols && meta.breakCols[data.column.index];
            if (breakLabel) {
                breakColsMeta[data.column.index] = { x: data.cell.x, w: data.cell.width, label: breakLabel };
            }

            if (meta.breakCols && !meta.breakCols[data.column.index] && data.column.index > 1) {
                var text = data.cell.raw.content || data.cell.raw;
                if (text && text.length > 15) {
                    doc.saveGraphicsState();
                    doc.setFontSize(7.5);
                    doc.setTextColor(data.cell.styles.textColor);
                    doc.restoreGraphicsState();
                }
            }
        },
        didDrawPage: function(data) {
            if (tableStartY < tableEndY) {
                var cy = (tableStartY + tableEndY) / 2;
                for (var colIdx in breakColsMeta) {
                    var b = breakColsMeta[colIdx];
                    var cx = b.x + b.w / 2;
                    doc.saveGraphicsState();
                    doc.setFontSize(10);
                    doc.setFont(undefined, 'bold');
                    doc.setTextColor(200, 0, 0);
                    var brkStr = b.label.toUpperCase();
                    var tw = doc.getStringUnitWidth(brkStr) * 10 / doc.internal.scaleFactor;
                    var fontHeight = 10 / doc.internal.scaleFactor;
                    var adjustedCx = cx + fontHeight / 3;
                    doc.text(brkStr, adjustedCx, cy + tw / 2, { angle: 90 });
                    doc.restoreGraphicsState();
                }
            }
        }
    });

    doc.save('Master_Timetable_' + section + '.pdf');
}



function clearTimetables() {
    var termSel = document.getElementById('timetable-term-select');
    var sessionSel = document.getElementById('timetable-session-select');
    if (!termSel || !sessionSel) return showToast('Term and Session selectors missing.', 'error');
    
    var term = termSel.options[termSel.selectedIndex].text;
    var session = sessionSel.value;
    if (!term || !session) return showToast('Please select a term and session first.', 'warning');
    
    if (!confirm('Are you sure you want to clear ALL generated timetables for ' + term + ' (' + session + ')? This action cannot be undone.')) return;
    
    showToast('Clearing timetables...', 'info');
    callServer('adminClearTimetables', [AA.token, term, session, null], function(res) {
        if (res && res.success) {
            showToast(res.message || 'Timetables cleared successfully.', 'success');
            loadTimetableData(); // Refresh UI
        } else {
            showToast(res && res.message ? res.message : 'Failed to clear timetables.', 'error');
        }
    });
}
window.clearTimetables = clearTimetables;

window.downloadTimetablePDF = downloadTimetablePDF;
window.loadTimetable = loadTimetable;
window.openTimetableConfigModal = openTimetableConfigModal;
window.renderTimetableSlots = renderTimetableSlots;
window.addTimetableSlot = addTimetableSlot;
window.removeTimetableSlot = removeTimetableSlot;
window.saveTimetableConfig = saveTimetableConfig;
window.openTimetableGenerateModal = openTimetableGenerateModal;
window.selectAllTtClasses = selectAllTtClasses;
window.generateTimetable = generateTimetable;
window.loadTimetableData = loadTimetableData;

// --- Communications System ---
function loadCommunications() {
  var tbody = document.querySelector('#communicationsTable tbody');
  if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4"><i class="fa fa-spinner fa-spin"></i> Loading...</td></tr>';
  
  var instType = typeof institutionType !== 'undefined' ? institutionType : (AA.settings.institution_type || 'primary');
  callServer('adminGetAnnouncements', [AA.token, instType, AA.getActiveCampusId()], function(res) {
    if(!res.success) {
      if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-danger">'+(res.message || 'Error loading')+'</td></tr>';
      return;
    }
    
    // Load classes for the modal dropdown if not loaded
    var cSel = document.getElementById('commClassSelect');
    if(cSel && cSel.options.length <= 1) {
      callServer('adminGetClasses', [AA.token, {section: instType, campusId: AA.getActiveCampusId()}], function(cRes) {
        if(cRes.success) {
          cRes.data.forEach(function(c) {
            cSel.innerHTML += '<option value="'+c.className+'">'+c.className+'</option>';
          });
        }
      });
    }

    // Attach target change listener
    var tgtSel = document.getElementById('commTargetSelect');
    if(tgtSel) {
      tgtSel.onchange = function() {
        document.getElementById('commClassGroup').style.display = this.value === 'class' ? 'block' : 'none';
      };
    }

    if(res.data.length === 0) {
      if(tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No communications found.</td></tr>';
      return;
    }
    
    buildTable('communicationsTable', [
      {key:'createdAt', render:function(r) { return formatDate(r.createdAt); }},
      {key:'subject'},
      {key:'target', render:function(r) { return r.targetAudience === 'all' ? '<span class="aa-badge aa-badge-info">All Parents</span>' : '<span class="aa-badge aa-badge-warning">Class: '+r.targetClass+'</span>'; }},
      {key:'actions', render:function(r) { 
        return '<button class="aa-btn aa-btn-sm aa-btn-outline text-danger" onclick="deleteCommunication(\''+r.id+'\')"><i class="fa fa-trash"></i> Delete</button>'; 
      }}
    ], res.data);
  }, null, false);
}

function sendCommunication() {
  var form = document.getElementById('communicationForm');
  if(!form.checkValidity()) { form.reportValidity(); return; }
  
  var instType = typeof institutionType !== 'undefined' ? institutionType : (AA.settings.institution_type || 'primary');
  var payload = {
    targetAudience: form.targetAudience.value,
    targetClass: form.targetClass ? form.targetClass.value : '',
    subject: form.subject.value,
    message: form.message.value,
    section: instType,
    campusId: AA.getActiveCampusId()
  };
  
  if (payload.targetAudience === 'class' && !payload.targetClass) {
    return showToast('Please select a target class.', 'warning');
  }

  showToast('Sending...', 'info');
  callServer('adminCreateAnnouncement', [AA.token, payload], function(res) {
    if(res.success) {
      showToast(res.message, 'success');
      closeModal('communicationModal');
      loadCommunications();
    } else {
      showToast(res.message, 'error');
    }
  }, null, true);
}

function deleteCommunication(id) {
  if(!confirm('Are you sure you want to delete this communication?')) return;
  showToast('Deleting...', 'info');
  callServer('adminDeleteAnnouncement', [AA.token, id], function(res) {
    if(res.success) {
      showToast(res.message, 'success');
      loadCommunications();
    } else {
      showToast(res.message, 'error');
    }
  }, null, true);
}

function loadParentAnnouncements() {
  var container = document.getElementById('announcements-container');
  if(container) container.innerHTML = '<div class="text-center py-4 text-muted"><i class="fa fa-spinner fa-spin"></i> Loading announcements...</div>';
  
  callServer('parentGetAnnouncements', [AA.token], function(res) {
    if(!res.success) {
      if(container) container.innerHTML = '<div class="text-center py-4 text-danger">'+(res.message||'Error loading announcements')+'</div>';
      return;
    }
    if(res.data.length === 0) {
      if(container) container.innerHTML = '<div class="text-center py-4 text-muted"><i class="fa fa-bullhorn" style="font-size:36px;color:#cbd5e1;display:block;margin-bottom:10px;"></i> No announcements from the school at this time.</div>';
      return;
    }
    
    var html = '';
    res.data.forEach(function(ann) {
      var targetBadge = ann.targetAudience === 'all' ? '<span class="aa-badge aa-badge-info" style="font-size:10px;">All Parents</span>' : '<span class="aa-badge aa-badge-warning" style="font-size:10px;">'+ann.targetClass+'</span>';
      html += '<div style="border:1px solid #e2e8f0; border-radius:8px; padding:15px; margin-bottom:15px;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">';
      html += '  <h4 style="margin:0;font-size:16px;color:#1e293b;">'+AA.escapeHTML(ann.subject)+'</h4>';
      html += '  <div style="text-align:right;">'+targetBadge+'<div style="font-size:11px;color:#94a3b8;margin-top:4px;">'+formatDate(ann.createdAt)+'</div></div>';
      html += '</div>';
      html += '<div style="color:#475569;font-size:14px;white-space:pre-wrap;line-height:1.5;">'+AA.escapeHTML(ann.message)+'</div>';
      html += '</div>';
    });
    if(container) container.innerHTML = html;
  }, null, false);
}

// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').then(function(registration) {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }, function(err) {
      console.log('ServiceWorker registration failed: ', err);
    });
  });
}

