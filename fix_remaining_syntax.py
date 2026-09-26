import os
import glob
import re

html_files = glob.glob('public/*.html')
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    pattern2 = r"if \(!data\.section \|\| data\.section === ''\) \{\s*else if \(institutionType === 'secondary'\) data\.section = 'high';\s*else if \(institutionType === 'primary'\) data\.section = 'primary';\s*else data\.section = 'both';\s*\}"
    replacement2 = """if (!data.section || data.section === '') {
        if (institutionType === 'secondary') data.section = 'high';
        else if (institutionType === 'primary') data.section = 'primary';
        else data.section = 'both';
      }"""

    new_content = re.sub(pattern2, replacement2, content)
    
    if new_content != content:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Updated {file}')
