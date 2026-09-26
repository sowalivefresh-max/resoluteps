import os
import glob

html_files = glob.glob('public/*.html')
for file in html_files:
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # Fix developer block
    dev_block_old = """        if (AA.user.role === 'developer') {
          document.getElementById('dev-controls').style.display = 'block';
        }"""
    dev_block_new = """        if (AA.user.role === 'developer') {
          var devCtrl = document.getElementById('dev-controls');
          if (devCtrl) devCtrl.style.display = 'block';
        }"""
        
    # Fix admin_assistant block
    admin_block_old = """        if (AA.user.role === 'admin_assistant') {
          document.getElementById('nav-finance').style.display = 'none';
          document.getElementById('nav-approvals').style.display = 'none';
          document.getElementById('nav-settings').style.display = 'none'; // Maybe?
        }"""
    admin_block_new = """        if (AA.user.role === 'admin_assistant') {
          var navFin = document.getElementById('nav-finance'); if (navFin) navFin.style.display = 'none';
          var navApp = document.getElementById('nav-approvals'); if (navApp) navApp.style.display = 'none';
          var navSet = document.getElementById('nav-settings'); if (navSet) navSet.style.display = 'none';
        }"""
        
    content = content.replace(dev_block_old, dev_block_new)
    content = content.replace(admin_block_old, admin_block_new)
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"Patched {file}")
