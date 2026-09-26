import glob

html_files = glob.glob('public/*.html')
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix timetable-class-select and tt-gen-classes inside populateClassDropdowns
    old_tt1 = """      var ttClsSel = document.getElementById('timetable-class-select');
      if (ttClsSel) {"""
      # Actually, these already have if (ttClsSel) !

    # Fix loadDashboard stats
    old_stats = """        document.getElementById('stat-users').textContent = res.users;
        document.getElementById('stat-students').textContent = res.students;
        document.getElementById('stat-classes').textContent = res.classes;
        document.getElementById('stat-subjects').textContent = res.subjects;"""
        
    new_stats = """        var su = document.getElementById('stat-users'); if(su) su.textContent = res.users;
        var sst = document.getElementById('stat-students'); if(sst) sst.textContent = res.students;
        var sc = document.getElementById('stat-classes'); if(sc) sc.textContent = res.classes;
        var ss = document.getElementById('stat-subjects'); if(ss) ss.textContent = res.subjects;"""
        
    old_term = """        document.getElementById('currentTermText').textContent = currentTerm + ' ' + currentSession;
        if (s.school_name) document.getElementById('sb-school-name').textContent = s.school_name;"""
        
    new_term = """        var ctt = document.getElementById('currentTermText'); if(ctt) ctt.textContent = currentTerm + ' ' + currentSession;
        var sbs = document.getElementById('sb-school-name'); if(sbs && s.school_name) sbs.textContent = s.school_name;"""
        
    content = content.replace(old_stats, new_stats)
    content = content.replace(old_term, new_term)
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)

print("Patched loadDashboard DOM assignments.")
