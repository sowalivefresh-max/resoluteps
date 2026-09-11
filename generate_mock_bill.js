const fs = require('fs');
const pdf = require('./functions/actions/pdf.js');

const mockStudent = {
  fullName: "Daniel Okunbanjo",
  admissionNumber: "VS/2023/105",
  className: "Primary 4"
};

const mockBill = {
  term: "First Term",
  session: "2023/2024",
  lineItems: JSON.stringify([
    { name: "Tuition", amount: 420000 },
    { name: "Textbooks", amount: 15000 },
    { name: "Workbook", amount: 25000 },
    { name: "Co-curricular", amount: 25000 },
    { name: "Notebooks & Stationery", amount: 20000 },
    { name: "ICT", amount: 15000 },
    { name: "Events & Excursions", amount: 30000 },
    { name: "Development Levy", amount: 50000 }
  ]),
  discountAmount: 0
};

const mockCfg = {
  schoolName: "Resolute Private School",
  schoolAddress: "123 Education Avenue, Lagos, Nigeria",
  schoolEmail: "accounts@resoluteprivateschool.com",
  schoolWebsite: "www.resoluteprivateschool.com",
  school_logo_url: "https://via.placeholder.com/120/0d1b2a/ffffff?text=Logo"
};

const html = pdf.generateBillPDFHTML(mockStudent, mockBill, mockCfg);
fs.writeFileSync('mock_bill.html', html);
console.log("Mock bill generated at mock_bill.html");
