const fs = require('fs');
const pdf = require('./functions/actions/pdf.js');

const mockStudent = {
  fullName: "John Doe",
  admissionNumber: "VS/2023/001",
  gender: "Male",
  dob: "2015-05-14",
  className: "Primary 4",
  photoUrl: "https://via.placeholder.com/80/0d1b2a/ffffff?text=Photo"
};

const mockTermData = [
  {
    session: "2023/2024",
    term: "First Term",
    className: "Primary 4",
    scores: [
      { subject: "Mathematics", ca: 25, exam: 60, total: 85, grade: "A1", remark: "Excellent" },
      { subject: "English Language", ca: 20, exam: 55, total: 75, grade: "A1", remark: "Excellent" },
      { subject: "Basic Science", ca: 15, exam: 45, total: 60, grade: "C4", remark: "Credit" }
    ]
  },
  {
    session: "2023/2024",
    term: "Second Term",
    className: "Primary 4",
    scores: [
      { subject: "Mathematics", ca: 28, exam: 62, total: 90, grade: "A1", remark: "Excellent" },
      { subject: "English Language", ca: 22, exam: 50, total: 72, grade: "B2", remark: "Very Good" },
      { subject: "Basic Science", ca: 18, exam: 50, total: 68, grade: "B3", remark: "Good" }
    ]
  }
];

const mockCfg = {
  schoolName: "Resolute Private School",
  schoolAddress: "123 Education Avenue, Lagos, Nigeria",
  school_logo_url: "https://via.placeholder.com/80",
  head_teacher_signature: "https://via.placeholder.com/150x40?text=Signature"
};

const html = pdf.generateTranscriptHTML(mockStudent, mockTermData, mockCfg);
fs.writeFileSync('mock_transcript.html', html);
console.log("Mock transcript generated at mock_transcript.html");
