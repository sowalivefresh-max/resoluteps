import re

with open('public/AccountsDashboard.html', 'r', encoding='utf-8') as f:
    content = f.read()

old_recalc = """    function recalcFeeTotal() {
      var total = 0;
      document.querySelectorAll('#feeItemsList .fee-item-amount').forEach(function(inp){
        total += parseFloat(inp.value || 0);
      });
      document.getElementById('feeTotalDisplay').textContent = formatNaira(total);
    }"""

new_recalc = """    function recalcFeeTotal() {
      var mandatory = 0;
      var optional = 0;
      document.querySelectorAll('#feeItemsList .fee-item-row').forEach(function(row){
        var amt = parseFloat(row.querySelector('.fee-item-amount').value || 0);
        var isOpt = row.querySelector('.fee-item-optional').checked;
        if(isOpt) optional += amt;
        else mandatory += amt;
      });
      var total = mandatory + optional;
      var display = formatNaira(mandatory);
      if (optional > 0) display += ' + ' + formatNaira(optional) + ' (Optional)';
      document.getElementById('feeTotalDisplay').textContent = display;
    }"""

content = content.replace(old_recalc, new_recalc)

# We should also update saveFeeStructure to save base total
# Wait, saveFeeStructure uses:
# var total = items.reduce(function(s,i){ return s + (parseFloat(i.amount)||0); }, 0);
# That saves the absolute sum into `totalFee` field in the database.
# Let's leave `totalFee` as the sum of everything for now, or just sum mandatory. It's better to just leave it as the sum of everything (maximum possible fee).

with open('public/AccountsDashboard.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Patched recalcFeeTotal')
