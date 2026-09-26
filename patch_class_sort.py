import glob

old_sort = "filteredClasses.sort(function(a, b) { return (a.className || '').localeCompare(b.className || '', undefined, {numeric: true, sensitivity: 'base'}); });"
new_sort = """var classOrder = ["reception", "kg1", "kg 1", "kg2", "kg 2", "nursery class", "nursery", "basic 1", "basic 2", "basic 3", "basic 4", "basic 5", "jss1", "jss 1", "jss2", "jss 2", "jss3", "jss 3", "sss1", "sss 1", "sss2", "sss 2", "sss3", "sss 3"];
      filteredClasses.sort(function(a, b) {
        var nameA = String(a.className || '').toLowerCase().trim();
        var nameB = String(b.className || '').toLowerCase().trim();
        var idxA = classOrder.indexOf(nameA);
        var idxB = classOrder.indexOf(nameB);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return nameA.localeCompare(nameB, undefined, {numeric: true, sensitivity: 'base'});
      });"""

html_files = glob.glob('public/*.html')
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if old_sort in content:
        content = content.replace(old_sort, new_sort)
        with open(file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Patched {file}")
