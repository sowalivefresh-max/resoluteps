import os
import glob

html_files = glob.glob('public/*.html')
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix populateTeacherDropdowns
    old_teacher = """      document.getElementById('studentClassTeacher').innerHTML = options;
      document.getElementById('subjectTeacher').innerHTML = tOptions;"""
      
    new_teacher = """      var sct = document.getElementById('studentClassTeacher'); if(sct) sct.innerHTML = options;
      var st = document.getElementById('subjectTeacher'); if(st) st.innerHTML = tOptions;"""
      
    # Fix populateClassDropdowns
    old_class = """      document.getElementById('studentClassSelect').innerHTML = options;
      document.getElementById('subjectClassSelect').innerHTML = '<option value=\"\">All Classes</option>' + options;"""
      
    new_class = """      var scs = document.getElementById('studentClassSelect'); if(scs) scs.innerHTML = options;
      var subcs = document.getElementById('subjectClassSelect'); if(subcs) subcs.innerHTML = '<option value=\"\">All Classes</option>' + options;"""
      
    content = content.replace(old_teacher, new_teacher)
    content = content.replace(old_class, new_class)
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
        
print("Patched innerHTML assignments.")
