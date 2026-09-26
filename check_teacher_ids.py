import os
with open('public/DeveloperDashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()
    
for el in ['studentClassTeacher', 'subjectTeacher']:
    if f'id="{el}"' not in content and f"id='{el}'" not in content:
        print(f"Missing ID: {el}")
