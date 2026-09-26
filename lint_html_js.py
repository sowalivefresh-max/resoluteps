import re
import subprocess
import os

with open('public/DeveloperDashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

scripts = re.findall(r'<script>(.*?)</script>', content, re.DOTALL)
for i, script in enumerate(scripts):
    with open(f'temp_script_{i}.js', 'w', encoding='utf-8') as f:
        f.write(script)
    
    result = subprocess.run(['node', '-c', f'temp_script_{i}.js'], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error in script {i}:")
        print(result.stderr)
    os.remove(f'temp_script_{i}.js')
