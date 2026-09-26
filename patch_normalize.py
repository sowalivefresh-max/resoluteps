import glob
import re

html_files = glob.glob('public/*.html')

new_normalize = """    function normalizeSection(sec) {
      var s = String(sec || '').toLowerCase().trim();
      if (s === 'high' || s === 'secondary' || s === 'secondaryschool' || s === 'secondary school') return 'high';
      if (s === 'primary' || s === 'primaryschool' || s === 'primary school' || s === 'basic') return 'primary';
      return 'both';
    }"""

# We need to replace the existing normalizeSection function block.
# It usually looks like:
#     function normalizeSection(sec) {
#       var s = String(sec || '').toLowerCase().trim();
#       if (s === 'primary' || s === 'primaryschool' || s === 'primary school') return 'primary';
#       return s; // 'both' or ''
#     }

for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
        
    # use regex to replace the normalizeSection block
    pattern = re.compile(r"function normalizeSection\(sec\)\s*\{[^\}]+\}", re.MULTILINE)
    
    if pattern.search(content):
        content = pattern.sub(new_normalize, content)
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Patched normalizeSection in {file}")
