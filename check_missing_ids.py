import os
with open('public/DeveloperDashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()
    
for el in ['stat-users', 'stat-students', 'stat-classes', 'stat-subjects', 'currentTermText', 'sb-school-name', 'aa-menu-toggle', 'admin-tabs', 'subscription-countdown-banner']:
    if f'id="{el}"' not in content and f"id='{el}'" not in content:
        print(f"Missing ID: {el}")
