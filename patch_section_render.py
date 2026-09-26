import glob
import re

html_files = glob.glob('public/*.html')

# We want to replace:
# { key: 'section', render: function(r){ return normalizeSection(r.section) === 'high' ? 'High' : 'Primary'; } }
# or similar inline rendering.

pattern = re.compile(r"\{\s*key:\s*'section',\s*render:\s*function\(r\)\s*\{\s*return normalizeSection\(r\.section\)\s*===\s*'high'\s*\?\s*'High'\s*:\s*'Primary';\s*\}\s*\}", re.MULTILINE)
replacement = "{ key: 'section', render: function(r) { var sec = normalizeSection(r.section); if(sec === 'high') return 'Secondary'; if(sec === 'primary') return 'Primary'; return 'Both'; } }"

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
        
    if pattern.search(content):
        content = pattern.sub(replacement, content)
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Patched table render in {file}")
