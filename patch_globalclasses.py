import glob

html_files = glob.glob('public/*.html')
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # We want to find:
    # globalClasses = data;
    # populateClassDropdowns();
    # buildTable('classesTable',
    
    # Or just:
    # globalClasses = data;
    
    # Wait, `globalClasses = data;` might be used for other things (e.g. students, users).
    # It's better to specifically look for where `adminGetClasses` sets `data`.
    # Let's replace `globalClasses = data;` with `if(window.sortClassesArray) window.sortClassesArray(data); globalClasses = data;` 
    # BUT only if it is immediately followed by `populateClassDropdowns()` or `buildTable`.
    
    # Actually, a simpler way is to replace:
    # `globalClasses = data;`
    # `populateClassDropdowns();`
    # inside loadClasses()
    
    # Let's just find `callServer('adminGetClasses'` and ensure we sort `c` or `data`.
    
    lines = content.split('\n')
    for i in range(len(lines)):
        if "callServer('adminGetClasses'" in lines[i]:
            # It could be `function(c){ globalClasses = c;`
            # or `function(data) {`
            pass
            
    # Better regex or string replacement:
    if 'globalClasses = data;\n        populateClassDropdowns();' in content:
        content = content.replace('globalClasses = data;\n        populateClassDropdowns();',
            'if(window.sortClassesArray) window.sortClassesArray(data);\n        globalClasses = data;\n        populateClassDropdowns();')
            
    if 'function(c){ globalClasses = c; populateClassDropdowns(); }' in content:
        content = content.replace('function(c){ globalClasses = c; populateClassDropdowns(); }',
            'function(c){ if(window.sortClassesArray) window.sortClassesArray(c); globalClasses = c; populateClassDropdowns(); }')
            
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
        
print("Patched globalClasses sorting in HTML files.")
