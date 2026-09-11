module.exports = {
  getReportCSS: function() {
    let html = '<style>';
    html += 'body{font-family: Arial, Helvetica, sans-serif; margin:0; padding:0; color:#000; font-size:10px;}';
    html += '.wrap{max-width:800px; margin:0 auto; padding:15px; box-sizing:border-box; border: 4px double #000;}';
    html += '.hdr{display:flex; align-items:center; margin-bottom:10px;}';
    html += '.logo{width:80px; height:80px; object-fit:contain; margin-right:15px;}';
    html += '.logo-ph{width:80px; height:80px; background:#0d1b2a; display:flex; align-items:center; justify-content:center; color:#f0a500; font-weight:bold; font-size:14px; margin-right:15px;}';
    html += '.school-info{flex:1; text-align:center;}';
    html += '.school-name{font-size:24px; font-weight:bold; text-transform:uppercase; color:#000; font-family:"Times New Roman", Times, serif;}';
    html += '.school-motto{font-size:12px; font-style:italic; margin:2px 0;}';
    html += '.rpt-title{font-size:14px; font-weight:bold; text-transform:uppercase; margin-top:8px; text-decoration: underline;}';
    
    html += '.bio-box{display:flex; border: 2px solid #000; margin-bottom:10px; border-radius: 4px; overflow:hidden;}';
    html += '.bio-data{flex:1; padding:0;}';
    html += '.bio-row{display:flex; border-bottom:1px solid #000;}';
    html += '.bio-row:last-child{border-bottom:none;}';
    html += '.bio-cell{flex:1; display:flex; border-right:1px solid #000; padding:4px;}';
    html += '.bio-cell:last-child{border-right:none;}';
    html += '.bio-label{font-weight:bold; margin-right:5px; text-transform:uppercase;}';
    html += '.passport{width:90px; border-left:2px solid #000; display:flex; align-items:center; justify-content:center; background:#eee;}';
    
    html += 'table{width:100%; border-collapse:collapse; margin-bottom:10px;}';
    html += 'th, td{border:1px solid #000; padding:4px; text-align:center;}';
    html += 'th{background:#f0f0f0; font-weight:bold; text-transform:uppercase; font-size:10px;}';
    html += '.text-left{text-align:left; padding-left:8px;}';
    
    html += '.summary-row{font-weight:bold; background:#f9f9f9;}';
    
    html += '.cols-3{display:flex; gap:10px;}';
    html += '.col{flex:1;}';
    
    html += '.trait-table{width:100%; border-collapse:collapse; margin-bottom:8px; font-size:9px;}';
    html += '.trait-table th, .trait-table td{border:1px solid #000; padding:2px 4px; text-align:left;}';
    html += '.trait-table th{background:#f0f0f0; text-align:center;}';
    html += '.trait-table .center{text-align:center;}';
    
    html += '.comment-box{border:1px solid #000; padding:5px; margin-bottom:8px;}';
    html += '.comment-title{font-weight:bold; text-transform:uppercase; margin-bottom:4px; font-size:10px; border-bottom:1px solid #000; padding-bottom:2px;}';
    html += '.comment-text{font-style:italic; min-height:20px;}';
    
    html += '.legend-table{width:100%; font-size:8px; margin-bottom:8px;}';
    html += '.legend-table td{padding:1px; border:none; text-align:left;}';
    
    html += '.sig-block{margin-top:10px; display:flex; align-items:flex-end; gap:5px;}';
    html += '.sig-line{flex:1; border-bottom:1px solid #000; height:15px;}';
    
    html += '.page-break { page-break-after: always; }';
    html += '</style>';
    return html;
  },

  generateStudentReportHTML: function(report, cfg) {
    const s = report.student || {};
    const scores = report.scores || [];
    const summary = report.summary || {};
    const att = report.attendance || { present: 0, absent: 0, late: 0, total: 0, percentage: 0 };
    const psy = report.psychomotor || {};
    const term = report.term || '';
    const session = report.session || '';

    let html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
    html += this.getReportCSS();
    html += '</head><body><div class="wrap">';

    // Header
    html += '<div class="hdr">';
    html += '<div class="logo-ph">Logo</div>'; // Client handles logo
    html += '<div class="school-info">';
    html += '<div class="school-name">' + (cfg.schoolName || "RESOLUTE PRIVATE SCHOOL") + '</div>';
    if (cfg.schoolMotto) html += '<div class="school-motto">' + cfg.schoolMotto + '</div>';
    html += '<div style="font-size:10px; margin-top:2px;">' + (cfg.schoolAddress || 'School Address') + '</div>';
    html += '<div class="rpt-title">STUDENT REPORT SHEET</div>';
    html += '</div>';
    html += '</div>';

    // Biodata Grid
    let photoUrl = s.photoUrl || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(s.fullName || 'S') + '&background=f0a500&color=fff&size=300');
    
    html += '<div class="bio-box">';
    html += '<div class="bio-data">';
    html += '<div class="bio-row">';
    html += '<div class="bio-cell"><span class="bio-label">NAME:</span> ' + (s.fullName || '') + '</div>';
    html += '<div class="bio-cell"><span class="bio-label">ADMISSION NO:</span> ' + (s.admissionNumber || '') + '</div>';
    html += '<div class="bio-cell"><span class="bio-label">GENDER:</span> ' + (s.gender || '') + '</div>';
    html += '</div>';
    html += '<div class="bio-row">';
    html += '<div class="bio-cell"><span class="bio-label">CLASS:</span> ' + (s.className || '') + '</div>';
    html += '<div class="bio-cell"><span class="bio-label">TERM:</span> ' + term + '</div>';
    html += '<div class="bio-cell"><span class="bio-label">YEAR:</span> ' + session + '</div>';
    html += '</div>';
    html += '<div class="bio-row">';
    html += '<div class="bio-cell"><span class="bio-label">D.O.B:</span> ' + (s.dob || '') + '</div>';
    html += '<div class="bio-cell"><span class="bio-label">CLASS AGE AVERAGE:</span> </div>';
    html += '<div class="bio-cell"><span class="bio-label">NO. IN CLASS:</span> </div>';
    html += '</div>';
    html += '<div class="bio-row">';
    html += '<div class="bio-cell"><span class="bio-label">TIMES SCHOOL OPENED:</span> ' + (att.total || '') + '</div>';
    html += '<div class="bio-cell" style="flex:1.5;"><span class="bio-label">ATTENDANCE:</span> <span style="font-weight:bold;">' + (att.percentage || 0) + '%</span> <span style="font-size:9px; color:#555; margin-left:10px;">[Pre: ' + (att.present || 0) + ' | Abs: ' + (att.absent || 0) + ' | Late: ' + (att.late || 0) + ']</span></div>';
    html += '<div class="bio-cell"><span class="bio-label">NEW TERM STARTS:</span> </div>';
    html += '</div>';
    html += '</div>';
    html += '<div class="passport"><img src="' + photoUrl + '" style="width:100%; height:100%; object-fit:cover;"></div>';
    html += '</div>';

    let isHalfTerm = report.reportType && report.reportType.toLowerCase().includes('half');

    // Scores Table (Core Subjects)
    html += '<table>';
    html += '<tr><th>SUBJECTS</th>';
    if (isHalfTerm) {
      html += '<th>CA1</th><th>CA2</th>';
    } else {
      html += '<th>CA (40%)</th><th>EXAM (60%)</th><th>TOTAL (100%)</th><th>GRADE</th>';
    }
    html += '</tr>';

    let totalMarks = 0;
    for (let i = 0; i < scores.length; i++) {
      let sc = scores[i];
      let tTotal = Number(sc.total || sc.termTotal || 0);
      totalMarks += tTotal;
      html += '<tr><td class="text-left">' + (sc.subjectName || '') + '</td>';
      
      if (isHalfTerm) {
        let ca1 = sc.ca1 !== undefined ? sc.ca1 : (sc.CA1 || '');
        let ca2 = sc.ca2 !== undefined ? sc.ca2 : (sc.CA2 || '');
        html += '<td>' + ca1 + '</td><td>' + ca2 + '</td>';
      } else {
        // Full term expects CA to be sum of CA1, CA2, CA3
        let ca1 = Number(sc.ca1 || sc.CA1 || 0);
        let ca2 = Number(sc.ca2 || sc.CA2 || 0);
        let ca3 = Number(sc.ca3 || sc.CA3 || 0);
        let sumCA = ca1 + ca2 + ca3;
        let exam = sc.exam !== undefined ? sc.exam : (sc.EXAM || '');
        let g = sc.termGrade || sc.grade || '';
        html += '<td>' + sumCA + '</td><td>' + exam + '</td><td><strong>' + tTotal + '</strong></td><td>' + g + '</td>';
      }
      html += '</tr>';
    }

    html += '<tr class="summary-row"><td class="text-left">CORE SUBJECTS OFFERED</td><td colspan="' + (isHalfTerm ? 2 : 4) + '" style="text-align:left; padding-left:10px;">' + scores.length + '</td></tr>';
    if (!isHalfTerm) {
      html += '<tr class="summary-row"><td class="text-left">TOTAL MARKS OBTAINED</td><td colspan="4" style="text-align:left; padding-left:10px;">' + totalMarks + '</td></tr>';
      html += '<tr class="summary-row"><td class="text-left">PUPIL AVERAGE OF CORE SUBJECTS</td><td colspan="4" style="text-align:left; padding-left:10px;">' + (summary.average || 0) + '%</td></tr>';
    }
    html += '</table>';

    // 3 Columns Layout
    html += '<div class="cols-3">';
    
    // Column 1
    html += '<div class="col">';
    html += '<table class="trait-table">';
    html += '<tr><th colspan="2">HOME PERFORMANCE INDICES</th></tr>';
    ['Punctuality', 'Neatness', 'PTC attendance', 'Quality of homework submitted', 'Prompt homework submission'].forEach((t, i) => {
      let keys = ['hp_punctuality', 'hp_neatness', 'hp_ptc', 'hp_hw_quality', 'hp_hw_prompt'];
      html += '<tr><td>' + t + '</td><td width="30" class="center">' + (psy[keys[i]] || '') + '</td></tr>';
    });
    html += '</table>';
    
    html += '<table class="trait-table">';
    html += '<tr><th colspan="2">CONDUCTS & WORK HABITS</th></tr>';
    let conducts = ['Polite', 'Independent & Organized', 'Relates appropriately with adults', 'Maintains appropriate behaviour without prompting', 'Exhibits eagerness & curiousity as a learner', 'Participates actively in class', 'Collaborates with other children for learning', 'Perseveres at a challenging task', 'Daily work reflects best effort', 'Leadership skills', 'Public presentation skills'];
    let cKeys = ['cd_polite', 'cd_independent', 'cd_adults', 'cd_behaviour', 'cd_curious', 'cd_active', 'cd_collaborates', 'cd_perseveres', 'cd_effort', 'cd_leadership', 'cd_presentation'];
    conducts.forEach((t, i) => {
      html += '<tr><td>' + t + '</td><td width="30" class="center">' + (psy[cKeys[i]] || '') + '</td></tr>';
    });
    html += '</table>';
    html += '</div>'; // End col 1

    // Column 2
    html += '<div class="col">';
    html += '<table class="trait-table">';
    html += '<tr><th colspan="2">OTHER SUBJECTS</th></tr>';
    let others = ['Music', 'Physical Education', 'Swimming', 'Library', 'Handwriting', 'Chess', 'Diction', 'Project'];
    let oKeys = ['os_music', 'os_pe', 'os_swimming', 'os_library', 'os_handwriting', 'os_chess', 'os_diction', 'os_project'];
    others.forEach((t, i) => {
      html += '<tr><td>' + t + '</td><td width="30" class="center">' + (psy[oKeys[i]] || '') + '</td></tr>';
    });
    html += '</table>';
    
    html += '<table class="trait-table">';
    html += '<tr><th colspan="2">ENRICHMENT ACTIVITIES</th></tr>';
    let enrich = ['Computer', 'French', 'Arts & Craft', 'Taekwando', 'Ballet', 'Leadership', 'Robotics', 'Music', 'Table Tennis / Football / Basketball', 'Reading Club', 'Chess/Scrabble', 'Etiquette / Red Cross'];
    let eKeys = ['en_computer', 'en_french', 'en_arts', 'en_taekwando', 'en_ballet', 'en_leadership', 'en_robotics', 'en_music', 'en_sports', 'en_reading', 'en_chess', 'en_etiquette'];
    enrich.forEach((t, i) => {
      html += '<tr><td>' + t + '</td><td width="30" class="center">' + (psy[eKeys[i]] || '') + '</td></tr>';
    });
    html += '</table>';
    html += '</div>'; // End col 2

    // Column 3
    html += '<div class="col">';
    html += '<div class="comment-box"><div class="comment-title">TEACHER\'S COMMENT:</div><div class="comment-text">' + (report.classTeacherComment || '') + '</div></div>';
    
    let ctName = cfg.class_teacher_name || report.classTeacherName || '';
    let ctSig = cfg.class_teacher_signature ? '<img src="' + cfg.class_teacher_signature + '" style="max-height:20px; object-fit:contain;">' : '';
    html += '<div class="sig-block" style="margin-top: 15px;"><div style="font-weight:bold; font-size:9px;">TEACHER\'S NAME:</div><div class="sig-line" style="display:flex; justify-content:center; font-style:italic;">' + ctName + ' ' + ctSig + '</div></div>';
    
    html += '<table class="trait-table" style="margin-top:15px; margin-bottom:15px;">';
    html += '<tr><th colspan="4">GRADES</th></tr>';
    html += '<tr><td class="center">A</td><td>EXCELLENT</td><td class="center">90-100%</td><td>NA: NEEDS ATTENTION</td></tr>';
    html += '<tr><td class="center">B</td><td>VERY GOOD</td><td class="center">80-89%</td><td>D: DEVELOPING</td></tr>';
    html += '<tr><td class="center">C</td><td>GOOD</td><td class="center">70-79%</td><td>SD: STEADILY DEVELOPING</td></tr>';
    html += '<tr><td class="center">D</td><td>FAIR</td><td class="center">60-69%</td><td>M: MASTERED</td></tr>';
    html += '<tr><td class="center">E</td><td>POOR</td><td class="center">50-59%</td><td></td></tr>';
    html += '<tr><td class="center">F</td><td>FAIL</td><td class="center">0-49%</td><td></td></tr>';
    html += '</table>';
    
    html += '<div class="comment-box"><div class="comment-title">HEAD TEACHER\'S COMMENT:</div><div class="comment-text">' + (report.principalComment || report.headTeacherComment || '') + '</div></div>';
    
    let prinSig = (cfg.principal_signature || cfg.head_teacher_signature) ? '<img src="' + (cfg.principal_signature || cfg.head_teacher_signature) + '" style="max-height:20px; object-fit:contain;">' : '';
    html += '<div class="sig-block" style="margin-top: 15px;"><div style="font-weight:bold; font-size:9px;">SIGNATURE:</div><div class="sig-line" style="display:flex; justify-content:center;">' + prinSig + '</div></div>';
    
    html += '</div>'; // End col 3
    html += '</div>'; // End cols-3

    html += '</div></body></html>';
    return html;
  },

  generateStudentIdCardHTML: function(student, cfg) {
    let schoolName = cfg.school_name || 'MY SCHOOL CLOUD';
    let motto = cfg.school_motto || 'In Love, Serve One Another';
    let termSess = (student.session || '2025/2026');
    let sectionName = 'Primary School';
    
    let photoUrl = student.photoUrl || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(student.fullName || 'S') + '&background=f0a500&color=fff&size=300');
    let logoUrl = cfg.school_logo_url || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(schoolName) + '&background=0d1b2a&color=fff');

    // Build repeating watermark text for the front
    let wmText = '';
    for(let i = 0; i < 30; i++) { wmText += '<div class="watermark-text">' + schoolName + '</div>'; }

    let html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>ID Card</title><style>';
    html += '@import url("https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap");';
    html += 'body { font-family: "Outfit", sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; background: #e2e8f0; gap: 30px; padding: 20px; }';
    html += '.card { width: 520px; height: 320px; background: #ffffff; border-radius: 16px; box-shadow: 0 20px 40px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(0,0,0,0.05); position: relative; overflow: hidden; display: flex; flex-direction: row; box-sizing: border-box; }';
    html += '.card::before { content: ""; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle at 75% 25%, rgba(240, 165, 0, 0.08) 0%, transparent 40%), radial-gradient(circle at 10% 90%, rgba(13, 27, 42, 0.04) 0%, transparent 40%); z-index: 0; pointer-events: none; }';
    
    // Front Watermarks
    html += '.watermark-front { position: absolute; top: 0; left: -100px; width: 800px; height: 400px; display: flex; flex-wrap: wrap; transform: rotate(-25deg); opacity: 0.04; pointer-events: none; z-index: 1; align-content: center; justify-content: center; }';
    html += '.watermark-text { font-size: 18px; font-weight: 800; color: #0f172a; margin: 10px 20px; white-space: nowrap; text-transform: uppercase; letter-spacing: 2px; }';

    
    // LEFT SIDE - PHOTO PROFILE
    html += '.photo-pane { width: 38%; height: 100%; position: relative; z-index: 2; padding: 25px 20px; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f8fafc; border-right: 1px solid rgba(0,0,0,0.05); }';
    html += '.student-photo { width: 135px; height: 155px; border-radius: 14px; object-fit: cover; box-shadow: 0 12px 24px rgba(0,0,0,0.12); border: 4px solid #ffffff; background: #e2e8f0; }';
    html += '.badge { margin-top: 20px; background: rgba(240, 165, 0, 0.15); color: #c27d00; font-size: 11px; font-weight: 800; padding: 6px 14px; border-radius: 20px; text-transform: uppercase; letter-spacing: 1px; text-align: center; width: max-content; }';

    // RIGHT SIDE - CONTENT
    html += '.content-pane { width: 62%; height: 100%; position: relative; z-index: 2; padding: 25px 30px; box-sizing: border-box; display: flex; flex-direction: column; justify-content: space-between; }';
    html += '.header { display: flex; align-items: center; gap: 12px; }';
    html += '.logo-img { width: 45px; height: 45px; border-radius: 10px; object-fit: contain; background: #fff; padding: 2px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }';
    html += '.school-info { display: flex; flex-direction: column; justify-content: center; }';
    html += '.school-name { font-size: 15px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; line-height: 1.2; }';
    html += '.school-motto { font-size: 10px; color: #64748b; font-weight: 500; font-style: italic; margin-top: 3px; }';
    
    html += '.identity-section { margin-top: auto; margin-bottom: auto; }';
    html += '.card-title { font-size: 9px; font-weight: 800; color: #f0a500; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 5px; }';
    html += '.student-name { font-size: 24px; font-weight: 800; color: #0f172a; text-transform: uppercase; line-height: 1.1; margin-bottom: 15px; letter-spacing: -0.5px; }';
    
    html += '.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 15px; }';
    html += '.info-item { display: flex; flex-direction: column; gap: 3px; }';
    html += '.info-label { font-size: 9px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.5px; }';
    html += '.info-value { font-size: 13px; font-weight: 600; color: #334155; }';
    
    html += '.footer { display: flex; justify-content: space-between; align-items: center; padding-top: 15px; border-top: 1px solid rgba(0,0,0,0.06); margin-top: auto; }';
    html += '.footer-text { font-size: 10px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 1px; }';
    html += '.accent-line { position: absolute; left: 0; bottom: 0; width: 100%; height: 5px; background: linear-gradient(90deg, #f0a500, #ffc947); }';
    
    // BACK SIDE
    html += '.card.back { flex-direction: column; padding: 30px; justify-content: center; }';
    html += '.back-header { text-align: center; font-size: 16px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 1.5px; z-index: 2; margin-bottom: 25px; }';
    html += '.terms-title { font-size: 11px; font-weight: 800; color: #f0a500; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px; z-index: 2; }';
    html += '.terms-list { margin: 0; padding-left: 15px; z-index: 2; font-size: 12px; color: #475569; font-weight: 500; line-height: 1.6; }';
    html += '.terms-list li { margin-bottom: 6px; }';
    html += '.terms-list li::marker { color: #f0a500; font-size: 14px; }';
    html += '.barcode-wrapper { text-align: center; margin-top: auto; z-index: 2; }';
    html += '.barcode { font-size: 16px; font-weight: 800; color: #0f172a; letter-spacing: 3px; font-family: monospace; }';
    html += '.barcode-bars { margin: 8px auto 0; width: 220px; height: 30px; background-image: repeating-linear-gradient(90deg, #0f172a, #0f172a 2px, transparent 2px, transparent 5px, #0f172a 5px, #0f172a 9px, transparent 9px, transparent 12px); opacity: 0.85; }';
    html += '.watermark-back { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity: 0.04; z-index: 1; width: 240px; height: 240px; object-fit: contain; }';
    
    html += '</style></head><body>';
    
    // ====== FRONT CARD ======
    html += '<div class="card front">';
    html += '<div class="watermark-front">' + wmText + '</div>';
    
    html += '<div class="photo-pane">';
    html += '<img src="' + photoUrl + '" class="student-photo" alt="Photo">';
    html += '<div class="badge">' + sectionName + '</div>';
    html += '</div>'; // end photo-pane
    
    html += '<div class="content-pane">';
    
    html += '<div class="header">';
    html += '<img src="' + logoUrl + '" class="logo-img" alt="Logo">';
    html += '<div class="school-info">';
    html += '<div class="school-name">' + schoolName + '</div>';
    html += '<div class="school-motto">' + motto + '</div>';
    html += '</div>'; // end school-info
    html += '</div>'; // end header
    
    html += '<div class="identity-section">';
    html += '<div class="card-title">Student Identity Card</div>';
    html += '<div class="student-name">' + (student.fullName || 'N/A') + '</div>';
    
    html += '<div class="info-grid" style="grid-template-columns: 1fr; gap: 8px;">';
    html += '<div class="info-item"><span class="info-label">Admission No</span><span class="info-value">' + (student.admissionNumber || 'N/A') + '</span></div>';
    html += '<div class="info-item"><span class="info-label">Class</span><span class="info-value">' + (student.className || 'N/A') + '</span></div>';
    html += '<div class="info-item"><span class="info-label">Gender</span><span class="info-value">' + (student.gender || 'N/A') + '</span></div>';
    html += '</div>'; // end info-grid
    html += '</div>'; // end identity-section
    
    html += '<div class="footer">';
    html += '<div class="footer-text">Valid: ' + termSess + '</div>';
    html += '<div class="footer-text">Academic Session</div>';
    html += '</div>'; // end footer
    
    html += '<div class="accent-line"></div>';
    html += '</div>'; // end content-pane
    html += '</div>'; // end front card

    // ====== BACK CARD ======
    html += '<div class="card back">';
    html += '<img src="' + logoUrl + '" class="watermark-back" alt="Watermark">';
    html += '<div class="back-header">' + schoolName + '</div>';
    
    html += '<div class="terms-title">Terms & Conditions</div>';
    html += '<ul class="terms-list">';
    html += '<li>This card must be worn at all times within the school premises.</li>';
    html += '<li>This card is non-transferable and must not be defaced.</li>';
    html += '<li>Loss of card must be reported to the school office immediately.</li>';
    html += '<li>If found, please return to the school office.</li>';
    html += '</ul>';
    
    html += '<div class="barcode-wrapper">';
    html += '<div class="barcode">' + (student.admissionNumber || 'N/A') + '</div>';
    html += '<div class="barcode-bars"></div>';
    html += '</div>'; // end barcode-wrapper
    
    html += '<div class="accent-line"></div>';
    html += '</div>'; // end back card

    html += '</body></html>';
    
    return html;
  },

  generateStudentLedgerHTML: function(ledgerData, cfg) {
    const s = ledgerData.student || {};
    const bills = ledgerData.bills || [];
    const payments = ledgerData.payments || [];
    const startDate = ledgerData.startDate;
    const endDate = ledgerData.endDate;
    
    let html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
    html += '<style>';
    html += 'body{font-family: Arial, sans-serif; margin:0; padding:20px; color:#333; font-size:12px;}';
    html += '.wrap{max-width:800px; margin:0 auto; padding:20px;}';
    html += '.hdr{display:flex; align-items:center; border-bottom:2px solid #0d1b2a; padding-bottom:15px; margin-bottom:20px;}';
    html += '.logo{width:70px; height:70px; object-fit:contain; margin-right:20px;}';
    html += '.school-info{flex:1;}';
    html += '.school-name{font-size:22px; font-weight:bold; color:#0d1b2a; margin-bottom:4px;}';
    html += '.doc-title{font-size:16px; font-weight:bold; color:#f0a500; text-transform:uppercase;}';
    
    html += '.student-details{display:flex; justify-content:space-between; background:#f8f9fa; padding:15px; border-radius:8px; margin-bottom:25px;}';
    html += '.student-details p{margin:0 0 5px 0; font-size:13px;}';
    
    html += 'h3{color:#0d1b2a; border-bottom:1px solid #ccc; padding-bottom:5px; margin-top:20px; margin-bottom:10px; font-size:14px;}';
    html += 'table{width:100%; border-collapse:collapse; margin-bottom:20px;}';
    html += 'th, td{border:1px solid #ddd; padding:8px; text-align:left;}';
    html += 'th{background:#0d1b2a; color:#fff; font-size:11px; text-transform:uppercase;}';
    html += 'td{font-size:12px;}';
    html += '.text-right{text-align:right;}';
    html += '.text-center{text-align:center;}';
    html += '.summary-box{display:flex; justify-content:flex-end; margin-top:20px;}';
    html += '.summary-table{width:300px;}';
    html += '.summary-table th{background:#f0f0f0; color:#333; text-align:right; width:60%;}';
    html += '.summary-table td{text-align:right; font-weight:bold;}';
    html += '</style>';
    html += '</head><body><div class="wrap">';

    const logoHtml = cfg.school_logo_url 
        ? `<img src="${cfg.school_logo_url}" class="logo">` 
        : `<div style="width:70px;height:70px;background:#0d1b2a;display:flex;align-items:center;justify-content:center;color:#f0a500;font-weight:bold;font-size:12px;margin-right:20px;">Logo</div>`;

    html += '<div class="hdr">';
    html += logoHtml;
    html += '<div class="school-info">';
    html += '<div class="school-name">' + (cfg.schoolName || cfg.school_name || "MySchool Portal") + '</div>';
    html += '<div class="doc-title">Student Financial Statement</div>';
    html += '</div>';
    
    html += '<div style="text-align:right;">';
    html += '<p style="margin:0 0 4px 0;font-size:12px;"><strong>Date Printed:</strong> ' + new Date().toLocaleDateString() + '</p>';
    if (startDate && endDate) {
        html += '<p style="margin:0;font-size:12px;"><strong>Period:</strong> ' + startDate + ' to ' + endDate + '</p>';
    }
    html += '</div>';
    html += '</div>'; // end hdr

    html += '<div class="student-details">';
    html += '<div>';
    html += '<p><strong>Student Name:</strong> ' + (s.fullName || 'N/A') + '</p>';
    html += '<p><strong>Class:</strong> ' + (s.className || 'N/A') + '</p>';
    html += '</div>';
    html += '<div>';
    html += '<p><strong>Admission No:</strong> ' + (s.admissionNumber || 'N/A') + '</p>';
    html += '<p><strong>Status:</strong> ' + (s.enrollmentStatus || 'Active') + '</p>';
    html += '</div>';
    html += '</div>';

    // Format Currency Helper
    const formatNaira = (amt) => {
        return '&#8358;' + parseFloat(amt||0).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    };

    html += '<h3>Term Bills</h3>';
    if (bills.length === 0) {
        html += '<p class="text-center">No bills found for this period.</p>';
    } else {
        html += '<table><thead><tr><th>Term & Session</th><th>Billed Amount</th><th>Discount</th><th>Paid</th><th>Balance Due</th><th>Status</th></tr></thead><tbody>';
        bills.forEach(b => {
            const discount = parseFloat(b.discountAmount || 0);
            const discountStr = discount > 0 ? ('-' + formatNaira(discount)) : '-';
            html += `<tr>
                <td>${b.term} ${b.session}</td>
                <td class="text-right">${formatNaira(b.originalFeeTotal || b.totalBilled)}</td>
                <td class="text-right">${discountStr}</td>
                <td class="text-right">${formatNaira(b.totalPaid)}</td>
                <td class="text-right" style="color:#d9534f;font-weight:bold;">${formatNaira(b.balance)}</td>
                <td class="text-center">${b.status}</td>
            </tr>`;
        });
        html += '</tbody></table>';
    }

    html += '<h3>Payment History</h3>';
    if (payments.length === 0) {
        html += '<p class="text-center">No payments found for this period.</p>';
    } else {
        html += '<table><thead><tr><th>Date</th><th>Term & Session</th><th>Receipt Ref</th><th>Method</th><th>Amount Paid</th><th>Status</th></tr></thead><tbody>';
        payments.forEach(p => {
            const dateStr = p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : (p.date ? new Date(p.date).toLocaleDateString() : '-');
            html += `<tr>
                <td>${dateStr}</td>
                <td>${p.term || ''} ${p.session || ''}</td>
                <td>${p.receiptRef || p.id || ''}</td>
                <td>${p.method || p.paymentMethod || 'N/A'}</td>
                <td class="text-right" style="color:#5cb85c;font-weight:bold;">${formatNaira(p.amount)}</td>
                <td class="text-center">${p.status || 'Approved'}</td>
            </tr>`;
        });
        html += '</tbody></table>';
    }

    // Summary Box
    let totalBilled = 0;
    bills.forEach(b => totalBilled += parseFloat(b.totalBilled || 0));
    let totalPaid = 0;
    payments.filter(p => p.status === 'Approved').forEach(p => totalPaid += parseFloat(p.amount || 0));
    let balance = Math.max(0, totalBilled - totalPaid);
    let overage = Math.max(0, totalPaid - totalBilled);

    html += '<div class="summary-box"><table class="summary-table"><tbody>';
    html += `<tr><th>Total Billed (Period):</th><td>${formatNaira(totalBilled)}</td></tr>`;
    html += `<tr><th>Total Approved Payments:</th><td>${formatNaira(totalPaid)}</td></tr>`;
    if (overage > 0) {
        html += `<tr><th>Credit Balance (Overage):</th><td style="color:#5cb85c;">${formatNaira(overage)}</td></tr>`;
    } else {
        html += `<tr><th>Outstanding Balance:</th><td style="color:#d9534f;">${formatNaira(balance)}</td></tr>`;
    }
    html += '</tbody></table></div>';

    html += '<div style="margin-top:40px;text-align:center;font-size:11px;color:#777;">This statement is electronically generated.</div>';
    html += '</div></body></html>';
    
    return html;
  },

  generateTranscriptHTML: function(student, termData, cfg) {
    let html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
    html += '<style>';
    html += 'body{font-family: "Times New Roman", Times, serif; margin:0; padding:15px; color:#000; font-size:11px;}';
    html += '.wrap{max-width:800px; margin:0 auto; padding:20px; border: 4px double #0d1b2a;}';
    html += '.hdr{display:flex; align-items:center; border-bottom:2px solid #0d1b2a; padding-bottom:15px; margin-bottom:15px;}';
    html += '.logo{width:80px; height:80px; object-fit:contain; margin-right:20px;}';
    html += '.school-info{flex:1; text-align:center;}';
    html += '.school-name{font-size:24px; font-weight:bold; color:#0d1b2a; margin-bottom:4px; text-transform:uppercase;}';
    html += '.doc-title{font-size:16px; font-weight:bold; color:#f0a500; text-transform:uppercase; margin-top:5px; text-decoration:underline;}';
    
    html += '.student-details{display:flex; justify-content:space-between; padding:10px; border:1px solid #000; border-radius:4px; margin-bottom:20px; font-size:12px;}';
    html += '.student-details p{margin:2px 0;}';
    html += '.bio-label{font-weight:bold; text-transform:uppercase; margin-right:5px;}';
    
    html += '.term-block{margin-bottom:20px; page-break-inside: avoid;}';
    html += '.term-title{font-size:13px; font-weight:bold; background:#0d1b2a; color:#fff; padding:4px 8px; margin-bottom:0; text-transform:uppercase;}';
    html += 'table{width:100%; border-collapse:collapse; margin-bottom:5px;}';
    html += 'th, td{border:1px solid #000; padding:4px; text-align:center;}';
    html += 'th{background:#f0f0f0; font-weight:bold; font-size:10px; text-transform:uppercase;}';
    html += 'td{font-size:11px;}';
    html += '.text-left{text-align:left; padding-left:8px;}';
    
    html += '.term-avg{font-weight:bold; background:#f9f9f9;}';
    
    html += '.footer{margin-top:30px; font-size:10px;}';
    html += '.legend-table{width:50%; font-size:9px; margin-bottom:15px; border-collapse:collapse;}';
    html += '.legend-table th, .legend-table td{padding:2px; border:1px solid #000; text-align:center;}';
    
    html += '.sig-block{display:flex; justify-content:space-between; margin-top:40px;}';
    html += '.sig-line{width:200px; border-top:1px solid #000; text-align:center; padding-top:4px;}';
    html += '</style>';
    html += '</head><body><div class="wrap">';

    const logoHtml = cfg.school_logo_url 
        ? `<img src="${cfg.school_logo_url}" class="logo">` 
        : `<div style="width:80px;height:80px;background:#0d1b2a;display:flex;align-items:center;justify-content:center;color:#f0a500;font-weight:bold;font-size:12px;margin-right:20px;">Logo</div>`;

    html += '<div class="hdr">';
    html += logoHtml;
    html += '<div class="school-info">';
    html += '<div class="school-name">' + (cfg.schoolName || cfg.school_name || "MySchool Portal") + '</div>';
    html += '<div style="font-size:11px;">' + (cfg.schoolAddress || "School Address") + '</div>';
    html += '<div class="doc-title">Official Academic Transcript</div>';
    html += '</div>';
    if (student.photoUrl) {
        html += `<img src="${student.photoUrl}" style="width:80px; height:80px; object-fit:cover; border:1px solid #ccc; border-radius:4px;">`;
    } else {
        html += '<div style="width:80px;height:80px;background:#eee;border:1px solid #ccc;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#999;font-size:10px;">No Photo</div>';
    }
    html += '</div>'; // end hdr

    html += '<div class="student-details">';
    html += '<div>';
    html += '<p><span class="bio-label">Student Name:</span> ' + (student.fullName || 'N/A') + '</p>';
    html += '<p><span class="bio-label">Admission No:</span> ' + (student.admissionNumber || 'N/A') + '</p>';
    html += '</div>';
    html += '<div>';
    html += '<p><span class="bio-label">Gender:</span> ' + (student.gender || 'N/A') + '</p>';
    html += '<p><span class="bio-label">Date of Birth:</span> ' + (student.dob || 'N/A') + '</p>';
    html += '</div>';
    html += '</div>';

    if (termData.length === 0) {
        html += '<p style="text-align:center; padding:30px; font-style:italic;">No academic records found for this student.</p>';
    } else {
        termData.forEach(td => {
            html += '<div class="term-block">';
            html += '<div class="term-title">' + td.session + ' - ' + td.term + ' (' + (td.className || 'Class') + ')</div>';
            html += '<table><thead><tr><th class="text-left">Subject</th><th>CA</th><th>Exam</th><th>Total</th><th>Grade</th><th>Remark</th></tr></thead><tbody>';
            
            let termTotalScore = 0;
            let subCount = 0;
            
            td.scores.forEach(s => {
                const ca = parseFloat(s.ca || s.termCA || 0);
                const exam = parseFloat(s.exam || s.termExam || 0);
                const total = parseFloat(s.total || s.termTotal || (ca + exam));
                termTotalScore += total;
                subCount++;
                
                let grade = s.grade || '';
                let remark = s.remark || '';
                
                // Fallback grade calculation if missing
                if (!grade) {
                    if (total >= 75) { grade = 'A1'; remark = 'Excellent'; }
                    else if (total >= 70) { grade = 'B2'; remark = 'Very Good'; }
                    else if (total >= 65) { grade = 'B3'; remark = 'Good'; }
                    else if (total >= 60) { grade = 'C4'; remark = 'Credit'; }
                    else if (total >= 55) { grade = 'C5'; remark = 'Credit'; }
                    else if (total >= 50) { grade = 'C6'; remark = 'Credit'; }
                    else if (total >= 45) { grade = 'D7'; remark = 'Pass'; }
                    else if (total >= 40) { grade = 'E8'; remark = 'Pass'; }
                    else { grade = 'F9'; remark = 'Fail'; }
                }
                
                html += `<tr>
                    <td class="text-left">${s.subject || s.subjectName || ''}</td>
                    <td>${s.ca !== undefined ? s.ca : (s.termCA !== undefined ? s.termCA : '-')}</td>
                    <td>${s.exam !== undefined ? s.exam : (s.termExam !== undefined ? s.termExam : '-')}</td>
                    <td><strong>${total}</strong></td>
                    <td><strong>${grade}</strong></td>
                    <td>${remark}</td>
                </tr>`;
            });
            
            const termAvg = subCount > 0 ? (termTotalScore / subCount).toFixed(1) : 0;
            html += `<tr class="term-avg">
                <td colspan="3" class="text-left">TERM AVERAGE</td>
                <td colspan="3">${termAvg}%</td>
            </tr>`;
            
            html += '</tbody></table>';
            html += '</div>';
        });
    }

    html += '<div class="footer">';
    html += '<table class="legend-table"><thead><tr><th colspan="5">Grading Legend</th></tr><tr><th>Score</th><th>Grade</th><th>Remark</th></tr></thead><tbody>';
    html += '<tr><td>75 - 100</td><td>A1</td><td>Excellent</td></tr>';
    html += '<tr><td>70 - 74</td><td>B2</td><td>Very Good</td></tr>';
    html += '<tr><td>65 - 69</td><td>B3</td><td>Good</td></tr>';
    html += '<tr><td>60 - 64</td><td>C4</td><td>Credit</td></tr>';
    html += '<tr><td>50 - 59</td><td>C5/C6</td><td>Credit</td></tr>';
    html += '<tr><td>40 - 49</td><td>D7/E8</td><td>Pass</td></tr>';
    html += '<tr><td>0 - 39</td><td>F9</td><td>Fail</td></tr>';
    html += '</tbody></table>';
    
    html += '<div class="sig-block">';
    html += '<div><p>Date Issued: <strong>' + new Date().toLocaleDateString() + '</strong></p></div>';
    
    html += '<div>';
    if (cfg.head_teacher_signature || cfg.principal_signature) {
        html += `<img src="${cfg.head_teacher_signature || cfg.principal_signature}" style="max-height:40px; margin-bottom:5px; display:block; margin: 0 auto;"><br>`;
    } else {
        html += '<br><br><br>';
    }
    html += '<div class="sig-line">Head Teacher\'s Signature & Date</div>';
    html += '</div>';
    html += '</div>'; // end sig-block
    
    html += '</div>'; // end footer

    html += '</div></body></html>';
    
    return html;
  },

  generateBillPDFHTML: function(student, bill, cfg) {
    const formatNaira = (amt) => {
        return Number(amt || 0).toLocaleString('en-NG', {minimumFractionDigits: 2, maximumFractionDigits: 2});
    };
    
    const schoolName = cfg.schoolName || cfg.school_name || "Resolute Private School";
    const schoolAddress = cfg.schoolAddress || "123 Education Avenue, Lagos, Nigeria";
    const schoolEmail = cfg.schoolEmail || cfg.smtp_email || "info@resoluteprivateschool.com";
    const schoolWebsite = cfg.schoolWebsite || "www.resoluteprivateschool.com";
    
    // Generate Invoice Number
    const dateObj = new Date();
    const dateStr = dateObj.toLocaleDateString('en-GB'); // dd/mm/yyyy
    
    // Determine due date (assume 1st day of term, mock it to +14 days from now if not in config)
    const dueObj = new Date();
    dueObj.setDate(dueObj.getDate() + 14);
    const dueDateStr = dueObj.toLocaleDateString('en-GB');

    let invoiceNo = 'INV-' + (bill.session || '').replace('/', '') + '-' + (bill.term || 'TERM').substring(0,6).toUpperCase();
    if (student.admissionNumber) {
        invoiceNo += '-' + student.admissionNumber.replace(/\D/g, '');
    } else {
        invoiceNo += '-' + Math.floor(Math.random() * 10000);
    }
    
    let html = '<!DOCTYPE html><html><head><meta charset="utf-8">';
    html += '<style>';
    html += 'body{font-family: "Arial", sans-serif; margin:0; padding:15px; color:#000; font-size:12px;}';
    html += '.wrap{max-width:800px; margin:0 auto;}';
    html += '.hdr{display:flex; align-items:flex-start; margin-bottom:20px;}';
    html += '.school-info{flex:1;}';
    html += '.school-name{font-size:24px; font-weight:bold; margin-bottom:10px; text-transform:uppercase;}';
    html += '.logo{width:120px; height:120px; object-fit:contain; margin-left:20px;}';
    
    html += '.student-bar{display:flex; border:1px solid #000; margin-bottom:10px;}';
    html += '.student-label{font-weight:bold; padding:8px; width:40%;}';
    html += '.student-name{font-weight:bold; padding:8px; font-size:14px; text-transform:uppercase;}';
    
    html += '.top-right-table{width:40%; margin-left:auto; border-collapse:collapse; margin-bottom:20px; font-size:11px;}';
    html += '.top-right-table th, .top-right-table td{border:1px solid #000; padding:4px 8px;}';
    html += '.top-right-table th{text-align:left; font-weight:bold;}';
    html += '.top-right-table td{text-align:center;}';
    
    html += '.split-layout{display:flex; gap:10px;}';
    html += '.notes-col{width:45%;}';
    html += '.items-col{width:55%;}';
    
    html += '.notes-box{border:1px solid #000; padding:0; height:100%;}';
    html += '.notes-hdr{font-weight:bold; text-align:center; padding:4px; border-bottom:1px solid #000; background:#f9f9f9;}';
    html += '.notes-content{padding:10px; font-size:11px; line-height:1.4;}';
    html += '.notes-content ol{padding-left:15px; margin:0;}';
    html += '.notes-content li{margin-bottom:10px;}';
    
    html += '.items-table{width:100%; border-collapse:collapse; font-size:11px; height:100%;}';
    html += '.items-table th, .items-table td{border:1px solid #000; padding:6px 8px;}';
    html += '.items-table th{text-align:center; font-weight:bold; background:#f9f9f9;}';
    html += '.item-name{width:60%;}';
    html += '.item-amt{text-align:right;}';
    
    html += '.total-row{font-weight:bold;}';
    html += '.total-label{text-align:right;}';
    
    html += '.payment-details{margin-top:20px; border-collapse:collapse; width:100%; font-size:11px;}';
    html += '.payment-details th, .payment-details td{border:1px solid #000; padding:6px 8px; text-align:center;}';
    html += '.payment-details th{font-weight:bold; background:#f9f9f9;}';
    
    html += '</style>';
    html += '</head><body><div class="wrap">';

    // Header
    const logoHtml = cfg.school_logo_url 
        ? `<img src="${cfg.school_logo_url}" class="logo">` 
        : `<div class="logo" style="background:#eee; display:flex; align-items:center; justify-content:center; color:#999;">Logo</div>`;

    html += '<div class="hdr">';
    html += '<div class="school-info">';
    html += '<div class="school-name">' + schoolName + '</div>';
    html += '<div style="margin-bottom:15px;">' + schoolAddress + '</div>';
    html += '<div>e-mail: ' + schoolEmail + '</div>';
    html += '<div>website: ' + schoolWebsite + '</div>';
    html += '</div>';
    html += logoHtml;
    html += '</div>';

    // Student Bar
    html += '<div class="student-bar">';
    html += '<div class="student-label">Account in respect of</div>';
    html += '<div class="student-name">' + (student.fullName || 'N/A') + '</div>';
    html += '</div>';
    
    // Top Right Table
    html += '<table class="top-right-table">';
    html += `<tr><th>DATE:</th><td>${dateStr}</td></tr>`;
    html += `<tr><th>DUE DATE:</th><td>${dueDateStr}</td></tr>`;
    html += `<tr><th>INVOICE NO:</th><td>${invoiceNo}</td></tr>`;
    html += `<tr><th>TERM:</th><td>${bill.term || ''}</td></tr>`;
    html += `<tr><th>STUDENT NO:</th><td>${student.admissionNumber || ''}</td></tr>`;
    html += `<tr><th>CLASS:</th><td>${student.className || ''}</td></tr>`;
    html += '</table>';

    // Split Section
    html += '<div class="split-layout">';
    
    // Notes Col
    html += '<div class="notes-col"><div class="notes-box">';
    html += '<div class="notes-hdr">Notes:</div>';
    html += '<div class="notes-content"><ol>';
    html += '<li>Fees are to be paid on or before the 1st day of Term.</li>';
    html += '<li>Pupils whose fees are not paid before school resumes would not be allowed into the school upon resumption.</li>';
    html += '<li>Payment is to be made directly to the school bank accounts, tellers and other evidence of payment should be forwarded to the Bursar at ' + schoolEmail + ' on or before the first day of Term.</li>';
    html += '<li>Damages done by pupils other than wear and tear will be separately invoiced and must be paid as an extra.</li>';
    html += '</ol></div>';
    html += '</div></div>';

    // Items Col
    let lineItems = [];
    try { lineItems = typeof bill.lineItems === 'string' ? JSON.parse(bill.lineItems) : (bill.lineItems || []); } catch(e){}
    
    // If no lineItems explicitly stored in the bill document (older bills), fallback to totalBilled
    if (lineItems.length === 0 && bill.totalBilled) {
        lineItems.push({ name: "Tuition", amount: bill.totalBilled });
    }

    html += '<div class="items-col">';
    html += '<table class="items-table">';
    html += '<thead><tr><th colspan="2">ITEM</th></tr></thead>';
    html += '<tbody>';
    
    let totalAmt = 0;
    lineItems.forEach(item => {
        const amt = parseFloat(item.amount) || 0;
        totalAmt += amt;
        html += `<tr>
            <td class="item-name">${item.name}</td>
            <td class="item-amt">${formatNaira(amt)}</td>
        </tr>`;
    });
    
    // Empty rows for filler to match screenshot style
    for(let i=0; i < Math.max(0, 10 - lineItems.length); i++) {
        html += `<tr><td>&nbsp;</td><td></td></tr>`;
    }

    if (bill.discountAmount && parseFloat(bill.discountAmount) > 0) {
        html += `<tr><td class="item-name">Discount</td><td class="item-amt">-${formatNaira(bill.discountAmount)}</td></tr>`;
        totalAmt -= parseFloat(bill.discountAmount);
    }

    html += `<tr class="total-row">
        <td class="total-label">Total Due: NGN</td>
        <td class="item-amt">${formatNaira(totalAmt)}</td>
    </tr>`;
    html += '</tbody></table>';
    html += '</div>'; // end items-col
    
    html += '</div>'; // end split-layout

    // Payment Details
    html += '<table class="payment-details">';
    html += '<thead><tr><th colspan="3">PAYMENT DETAILS :</th></tr>';
    html += '<tr><th>BANK</th><th>ACCOUNT NO</th><th>ACCOUNT NAME</th></tr></thead>';
    html += '<tbody>';
    html += `<tr>
        <td>ZENITH BANK</td>
        <td>1312426803</td>
        <td>RESOLUTE PRIVATE SCHOOL</td>
    </tr>`;
    html += '</tbody></table>';

    html += '</div></body></html>';
    
    return html;
  }
};
