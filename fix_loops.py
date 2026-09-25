import os
import glob

html_files = glob.glob('public/*.html')
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    new_content = content.replace(
        'if (!AA.user || !AA.settings || !AA.settings.current_term) return setTimeout(initDashboard, 100);',
        'if (!AA.user || !AA.settings) return setTimeout(initDashboard, 100);'
    )
    
    if new_content != content:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Updated {file}')
