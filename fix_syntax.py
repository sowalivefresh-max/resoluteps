import os
import glob
import re

html_files = glob.glob('public/*.html')
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Fix formData.section
    pattern1 = r"if \(!formData\.section \|\| formData\.section === ''\) \{\s*else if \(institutionType === 'secondary'\) formData\.section = 'high';\s*else if \(institutionType === 'primary'\) formData\.section = 'primary';\s*\}"
    replacement1 = """if (!formData.section || formData.section === '') {
        if (institutionType === 'secondary') formData.section = 'high';
        else if (institutionType === 'primary') formData.section = 'primary';
      }"""
    
    # Fix data.section
    pattern2 = r"if \(!data\.section \|\| data\.section === ''\) \{\s*else if \(institutionType === 'secondary'\) data\.section = 'high';\s*else if \(institutionType === 'primary'\) data\.section = 'primary';\s*\}"
    replacement2 = """if (!data.section || data.section === '') {
        if (institutionType === 'secondary') data.section = 'high';
        else if (institutionType === 'primary') data.section = 'primary';
      }"""

    new_content = re.sub(pattern1, replacement1, content)
    new_content = re.sub(pattern2, replacement2, new_content)
    
    if new_content != content:
        with open(file, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f'Updated {file}')
