import re
import subprocess
import os
import glob

html_files = glob.glob('public/*.html')
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
    for i, script in enumerate(scripts):
        temp_file = f'temp_script_{i}.js'
        with open(temp_file, 'w', encoding='utf-8') as f:
            f.write(script)
        
        result = subprocess.run(['node', '-c', temp_file], capture_output=True, text=True)
        if result.returncode != 0:
            print(f"Error in {file} script {i}:")
            print(result.stderr)
        os.remove(temp_file)
print("Linting complete.")
