import re

with open('public/scripts.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find all window.xxx = yyy;
assignments = re.findall(r'window\.([a-zA-Z0-9_]+)\s*=\s*([a-zA-Z0-9_]+);', content)

# Check if yyy is defined as a function or var
for prop, val in assignments:
    if val == prop: # e.g. window.loadTimetable = loadTimetable;
        # Search for function loadTimetable, or var loadTimetable
        if not re.search(rf'function\s+{val}\b', content) and not re.search(rf'(var|let|const)\s+{val}\b', content) and not re.search(rf'^{val}\s*=', content, re.MULTILINE):
            print(f"ERROR: {val} is assigned to window.{prop} but is not defined!")
