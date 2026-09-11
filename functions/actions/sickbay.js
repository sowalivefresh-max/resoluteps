module.exports = function(db, notificationsActions) {
  return {
    getRecords: async (req, res) => {
      try {
        const snapshot = await db.collection("sickBayRecords").orderBy("createdAt", "desc").get();
        const records = [];
        snapshot.forEach(doc => {
          records.push({ id: doc.id, ...doc.data() });
        });
        return res.json({ success: true, data: records });
      } catch (err) {
        console.error("Error fetching sick bay records:", err);
        return res.json({ success: false, message: "Error fetching records: " + err.message });
      }
    },

    addRecord: async (req, res) => {
      try {
        const data = req.body.data;
        if (!data || !data.studentId || !data.complaints || !data.medication) {
          return res.json({ success: false, message: "Missing required fields." });
        }

        const sDoc = await db.collection("students").doc(data.studentId).get();
        if (!sDoc.exists) {
           return res.json({ success: false, message: "Student not found." });
        }
        const student = sDoc.data();
        const studentName = student.fullName || ((student.firstName && student.lastName) ? `${student.firstName} ${student.lastName}` : 'Unknown');

        const newRecord = {
          studentId: data.studentId,
          studentName: studentName,
          className: student.className || '',
          complaints: data.complaints,
          medication: data.medication,
          administeredBy: data.administeredBy || 'Nurse',
          date: data.date || new Date().toISOString(),
          createdAt: new Date().toISOString()
        };

        const docRef = await db.collection("sickBayRecords").add(newRecord);
        
        // Notify Parent via Email
        try {
          if (student.parentId) {
            const pDoc = await db.collection("users").doc(student.parentId).get();
            if (pDoc.exists) {
              const parent = pDoc.data();
              if (parent.email) {
                const settingsDoc = await db.collection("settings").doc("global").get();
                const settings = settingsDoc.data();
                
                if (settings && settings.smtp_email && settings.smtp_password) {
                  const nodemailer = require("nodemailer");
                  const transporter = nodemailer.createTransport({
                    service: 'gmail',
                    auth: { user: settings.smtp_email, pass: settings.smtp_password }
                  });
                  
                  const mailOptions = {
                    from: `"${settings.school_name || 'School Administration'}" <${settings.smtp_email}>`,
                    to: parent.email,
                    subject: `Sick Bay Visit Notification - ${studentName}`,
                    text: `Dear ${parent.fullName || 'Parent'},\n\nPlease be informed that your child, ${studentName}, visited the school's Sick Bay today (${new Date().toLocaleDateString()}).\n\nComplaints: ${newRecord.complaints}\nMedication Administered: ${newRecord.medication}\nAdministered By: ${newRecord.administeredBy}\n\nIf you have any concerns, please contact the school administration.\n\nThank you,\nManagement`
                  };
                  
                  await transporter.sendMail(mailOptions);
                }
              }
            }
          }
        } catch (emailErr) {
           console.error("Failed to send sick bay email:", emailErr);
           // We still return success for saving the record even if email fails
        }

        return res.json({ success: true, message: "Sick bay record added successfully.", id: docRef.id });
      } catch (err) {
        console.error("Error adding sick bay record:", err);
        return res.json({ success: false, message: "Error adding record: " + err.message });
      }
    }
  };
};
