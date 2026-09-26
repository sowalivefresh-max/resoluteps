import re

with open('public/AccountsDashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update addFeeItem(name, amount, isOptional, gender)
old_add_fee_item = """    function addFeeItem(name, amount) {
      var list = document.getElementById('feeItemsList');
      var idx = list.children.length;
      var row = document.createElement('div');
      row.className = 'd-flex gap-2 mb-2 align-items-center fee-item-row';
      row.innerHTML = '<input type="text" class="aa-input fee-item-name" placeholder="Fee name (e.g. Tuition Fee)" value="'+(name||'')+'" style="flex:2;" oninput="recalcFeeTotal()">'+
        '<input type="number" class="aa-input fee-item-amount" placeholder="Amount" value="'+(amount||'')+'" min="0" style="flex:1;" oninput="recalcFeeTotal()">'+
        '<button type="button" class="aa-btn aa-btn-danger aa-btn-xs" onclick="this.closest(\\'div\\').remove();recalcFeeTotal();"><i class="fa fa-trash"></i></button>';
      list.appendChild(row);
    }"""

new_add_fee_item = """    function addFeeItem(name, amount, isOptional, gender) {
      var list = document.getElementById('feeItemsList');
      var idx = list.children.length;
      var row = document.createElement('div');
      row.className = 'd-flex gap-2 mb-2 align-items-center fee-item-row';
      var optChecked = isOptional ? 'checked' : '';
      var gAll = (gender === 'all' || !gender) ? 'selected' : '';
      var gMale = gender === 'male' ? 'selected' : '';
      var gFemale = gender === 'female' ? 'selected' : '';
      
      row.innerHTML = '<input type="text" class="aa-input fee-item-name" placeholder="Fee name" value="'+(name||'')+'" style="flex:2;" oninput="recalcFeeTotal()">'+
        '<input type="number" class="aa-input fee-item-amount" placeholder="Amount" value="'+(amount||'')+'" min="0" style="flex:1;" oninput="recalcFeeTotal()">'+
        '<select class="aa-select fee-item-gender" style="flex:1;"><option value="all" '+gAll+'>All Students</option><option value="male" '+gMale+'>Male Only</option><option value="female" '+gFemale+'>Female Only</option></select>'+
        '<label style="flex:1; display:flex; align-items:center; gap:5px; margin:0;"><input type="checkbox" class="fee-item-optional" '+optChecked+' onchange="recalcFeeTotal()"> Optional</label>'+
        '<button type="button" class="aa-btn aa-btn-danger aa-btn-xs" onclick="this.closest(\\'div\\').remove();recalcFeeTotal();"><i class="fa fa-trash"></i></button>';
      list.appendChild(row);
    }"""

# 2. Update saveFeeStructure
old_save_loop = """    rows.forEach(function(row) {
      var name = row.querySelector('.fee-item-name').value.trim();
      var amount = parseFloat(row.querySelector('.fee-item-amount').value || 0);
      if (!name) { hasError = true; return; }
      items.push({name: name, amount: amount});
    });"""

new_save_loop = """    rows.forEach(function(row) {
      var name = row.querySelector('.fee-item-name').value.trim();
      var amount = parseFloat(row.querySelector('.fee-item-amount').value || 0);
      var gender = row.querySelector('.fee-item-gender').value;
      var isOptional = row.querySelector('.fee-item-optional').checked;
      if (!name) { hasError = true; return; }
      items.push({name: name, amount: amount, gender: gender, optional: isOptional});
    });"""

# 3. Update editFee
old_edit_forEach = """        items.forEach(function(item){ addFeeItem(item.name, item.amount); });"""
new_edit_forEach = """        items.forEach(function(item){ addFeeItem(item.name, item.amount, item.optional, item.gender); });"""

# 4. Update the display logic inside `buildTable` for 'lineItems'
old_build_table = """            return items.map(function(i){ return '<span class="aa-badge" style="margin:1px;font-size:11px;">'+i.name+': '+formatNaira(i.amount)+'</span>'; }).join('');"""
new_build_table = """            return items.map(function(i){ 
              var opt = i.optional ? ' (Opt)' : '';
              var g = (i.gender && i.gender !== 'all') ? (i.gender==='male'?' (M)':' (F)') : '';
              return '<span class="aa-badge" style="margin:1px;font-size:11px;">'+i.name+g+opt+': '+formatNaira(i.amount)+'</span>'; 
            }).join('');"""

content = content.replace(old_add_fee_item, new_add_fee_item)
content = content.replace(old_save_loop, new_save_loop)
content = content.replace(old_edit_forEach, new_edit_forEach)
content = content.replace(old_build_table, new_build_table)

with open('public/AccountsDashboard.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Patched AccountsDashboard.html')
