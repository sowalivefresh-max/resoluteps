// Helper to calculate dynamic grades based on class/section grading systems
const computeDynamicGrade = (score, className, section, gradingSystems) => {
  if (!gradingSystems || gradingSystems.length === 0) {
    if (score >= 75) return { grade: 'A1', remark: 'Excellent' };
    if (score >= 70) return { grade: 'B2', remark: 'Very Good' };
    if (score >= 65) return { grade: 'B3', remark: 'Good' };
    if (score >= 60) return { grade: 'C4', remark: 'Credit' };
    if (score >= 55) return { grade: 'C5', remark: 'Credit' };
    if (score >= 50) return { grade: 'C6', remark: 'Credit' };
    if (score >= 45) return { grade: 'D7', remark: 'Pass' };
    if (score >= 40) return { grade: 'E8', remark: 'Pass' };
    return { grade: 'F9', remark: 'Fail' };
  }

  let matchedSystem = null;
  if (className) {
    matchedSystem = gradingSystems.find(gs => 
      gs.targetClasses && Array.isArray(gs.targetClasses) && 
      gs.targetClasses.some(c => c.toLowerCase().trim() === className.toLowerCase().trim())
    );
  }
  if (!matchedSystem && section && section !== 'both') {
    matchedSystem = gradingSystems.find(gs => 
      (!gs.targetClasses || gs.targetClasses.length === 0) && 
      gs.targetSection && gs.targetSection.toLowerCase() === section.toLowerCase()
    );
  }
  if (!matchedSystem) {
    matchedSystem = gradingSystems.find(gs => 
      (!gs.targetClasses || gs.targetClasses.length === 0) && 
      (!gs.targetSection || gs.targetSection.toLowerCase() === 'both' || gs.targetSection === '')
    );
  }
  if (!matchedSystem) matchedSystem = gradingSystems[0];
  
  if (!matchedSystem.rules || !Array.isArray(matchedSystem.rules) || matchedSystem.rules.length === 0) {
    return { grade: 'F', remark: 'Fail' };
  }
  
  for (const rule of matchedSystem.rules) {
    if (score >= Number(rule.min) && score <= Number(rule.max)) {
      return { grade: rule.grade || 'F', remark: rule.remark || '' };
    }
  }
  
  let lowest = matchedSystem.rules[matchedSystem.rules.length - 1];
  return { grade: lowest.grade || 'F', remark: lowest.remark || '' };
};

module.exports = function(db) {

  // Utility function to ensure a parent is authorized to view a specific child
  async function verifyParentChild(parentUserId, studentId) {
    if (!studentId) throw new Error("Student ID is required.");
    const studentDoc = await db.collection("students").doc(studentId).get();
    if (!studentDoc.exists) throw new Error("Student not found.");
    
    const studentData = studentDoc.data();
    if (studentData.parentId !== parentUserId) {
      throw new Error("Unauthorized access to student data.");
    }
    return true;
  }

  return {
    parentGetChildren: async (req, res) => {
      const session = req.session;
      
      try {
        const studentsSnap = await db.collection("students")
          .where("parentId", "==", session.userId)
          .get();
          
        const children = [];
        studentsSnap.forEach(doc => {
          let s = doc.data();
          s.id = doc.id;
          children.push(s);
        });
        
        return res.json({ success: true, data: children });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching children: " + err.message });
      }
    },

    parentGetReport: async (req, res) => {
      const { studentId, term, session: academicSession, reportType } = req.body;
      const session = req.session;
      
      try {
        await verifyParentChild(session.userId, studentId);
        
        const studentDoc = await db.collection("students").doc(studentId).get();
        if (!studentDoc.exists) return res.json({ success: false, message: "Student not found." });
        
        let student = studentDoc.data();
        student.id = studentDoc.id;

        const settingsSnap = await db.collection("settings").doc("global").get();
        const cfg = settingsSnap.exists ? settingsSnap.data() : {};
        if (term === cfg.current_term && academicSession === cfg.current_session && !cfg.results_published) {
          return res.json({ success: false, message: "Results for the current term have not been published yet." });
        }

        // === REPORT FINANCE LOCK CHECK ===
        const rulesDoc = await db.collection("settings").doc("compliance_rules").get();
        const compRules = rulesDoc.exists ? rulesDoc.data() : {};
        if (compRules.report_lock_enabled) {
          const billSnap = await db.collection("bills")
            .where("studentId", "==", studentId)
            .where("term", "==", term)
            .where("session", "==", academicSession)
            .limit(1).get();
          if (!billSnap.empty) {
            const bill = billSnap.docs[0].data();
            const billed = Number(bill.totalBilled || 0);
            const arrears = Number(bill.arrears || 0);
            const paidSnap = await db.collection("payments")
              .where("studentId", "==", studentId)
              .where("term", "==", term)
              .where("session", "==", academicSession)
              .where("status", "==", "Approved").get();
            let paid = 0;
            paidSnap.forEach(d => paid += Number(d.data().amount || 0));
            let outstanding = Math.max(0, (billed + arrears) - paid);
            const minBalance = Number(compRules.report_lock_min_balance || 0);
            let lockMessage = `Report download is restricted. Outstanding fee balance: ₦${outstanding.toLocaleString()}. Please contact the accounts office.`;
            
            if (outstanding > minBalance) {
              if (student.lockOverride) {
                outstanding = 0;
              } else {
                const planSnap = await db.collection("installment_plans")
                  .where("studentId", "==", studentId)
                  .where("status", "==", "Approved")
                  .where("term", "==", term)
                  .where("session", "==", academicSession)
                  .get();
                if (!planSnap.empty) {
                  let plan = planSnap.docs[0].data();
                  let expectedPaid = 0;
                  const nowMs = new Date().getTime();
                  const gracePeriodMs = 3 * 24 * 60 * 60 * 1000;
                  if (plan.milestones && Array.isArray(plan.milestones)) {
                    plan.milestones.forEach(m => {
                      const dueMs = new Date(m.dueDate).getTime();
                      if ((dueMs + gracePeriodMs) <= nowMs) {
                        expectedPaid += Number(m.amount || 0);
                      }
                    });
                  }
                  if (paid >= expectedPaid) {
                    outstanding = 0;
                  } else {
                    lockMessage = `Installment Plan Defaulted! You missed a payment milestone. Report access is restricted.`;
                  }
                }
              }
            }
            
            if (outstanding > minBalance) {
              return res.json({ success: false, financeLocked: true, outstandingAmount: outstanding, message: lockMessage });
            }
          }
        }
        // === END REPORT FINANCE LOCK CHECK ===
        
        const scoresSnap = await db.collection("assessments")
          .where("studentId", "==", studentId)
          .where("term", "==", term)
          .where("session", "==", academicSession)
          .get();
          
        const scores = [];
        let totalSum = 0;
        
        scoresSnap.forEach(doc => {
          let s = doc.data();
          s.id = doc.id;
          // Only show finalized or locked scores to parents, or all based on reportType
          // Assuming we show all for this chunk
          scores.push(s);
          totalSum += (parseFloat(s.total) || 0);
        });
        
        const avg = scores.length > 0 ? Math.round((totalSum / scores.length) * 10) / 10 : 0;
        
        const gradingSnap = await db.collection("gradingSystems").get();
        const gradingSystems = gradingSnap.docs.map(d => ({id: d.id, ...d.data()}));
        const className = student.className || "";
        const section = student.section || "";
        const overallGradeObj = computeDynamicGrade(avg, className, section, gradingSystems);

        return res.json({ 
          success: true, 
          student: student, 
          scores: scores,
          summary: { 
            totalSubjects: scores.length, 
            totalScore: totalSum, 
            average: avg, 
            overallGrade: overallGradeObj.grade 
          } 
        });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    parentGetBills: async (req, res) => {
      const { studentId } = req.body;
      const session = req.session;
      
      try {
        await verifyParentChild(session.userId, studentId);
        
        const billsSnap = await db.collection("bills").where("studentId", "==", studentId).get();
        const bills = [];
        billsSnap.forEach(doc => {
          let b = doc.data();
          b.id = doc.id;
          bills.push(b);
        });
        // Compute paid amount and balance per term/session
        const paymentsSnap = await db.collection("payments").where("studentId", "==", studentId).where("status", "==", "Approved").get();
        const paidMap = {};
        paymentsSnap.forEach(doc => {
          const p = doc.data();
          const term = p.term || '';
          const sess = p.session || '';
          const key = term + "_" + sess;
          paidMap[key] = (paidMap[key] || 0) + Number(p.amount || 0);
        });

        const enriched = bills.map(b => {
          const key = (b.term || '') + "_" + (b.session || '');
          const totalPaid = paidMap[key] || 0;
          const netBilled = Number(b.totalBilled || 0);
          const balance = Math.max(0, netBilled - totalPaid);
          const status = balance === 0 ? 'Paid' : (totalPaid > 0 ? 'Partial' : 'Unpaid');
          return { ...b, totalPaid, balance, status };
        });
        
        return res.json({ success: true, data: enriched });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    parentGetPayments: async (req, res) => {
      const { studentId } = req.body;
      const session = req.session;
      
      try {
        await verifyParentChild(session.userId, studentId);
        
        const paymentsSnap = await db.collection("payments").where("studentId", "==", studentId).get();
        const payments = [];
        paymentsSnap.forEach(doc => {
          let p = doc.data();
          p.id = doc.id;
          payments.push(p);
        });
        
        return res.json({ success: true, data: payments });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    parentDownloadReport: async (req, res) => {
      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "DOWNLOAD_REPORT", details: `Viewed/Downloaded report` }).catch(()=>{}); }
      const { studentId, term, session: academicSession, reportType } = req.body;
      const session = req.session;
      
      try {
        await verifyParentChild(session.userId, studentId);
        
        const studentDoc = await db.collection("students").doc(studentId).get();
        if (!studentDoc.exists) return res.json({ success: false, message: "Student not found." });
        let student = studentDoc.data();
        student.id = studentDoc.id;
        
        const settingsSnap = await db.collection("settings").doc("global").get();
        const cfg = settingsSnap.exists ? settingsSnap.data() : {};
        if (term === cfg.current_term && academicSession === cfg.current_session && !cfg.results_published) {
          return res.json({ success: false, message: "Results for the current term have not been published yet." });
        }
        
        const scoresSnap = await db.collection("assessments")
          .where("studentId", "==", studentId)
          .where("term", "==", term)
          .where("session", "==", academicSession)
          .get();
          
        const scores = [];
        let totalSum = 0;
        scoresSnap.forEach(doc => {
          let s = doc.data();
          s.id = doc.id;
          scores.push(s);
          totalSum += (parseFloat(s.total) || 0);
        });
        
        const avg = scores.length > 0 ? Math.round((totalSum / scores.length) * 10) / 10 : 0;
        
        // Fetch behavioral traits and grading
        const [psySnap, affSnap, gradingSnap] = await Promise.all([
          db.collection("psychomotorRecords").where("studentId", "==", studentId).where("term", "==", term).where("session", "==", academicSession).get(),
          db.collection("affectiveRecords").where("studentId", "==", studentId).where("term", "==", term).where("session", "==", academicSession).get(),
          db.collection("gradingSystems").get()
        ]);
        
        const gradingSystems = gradingSnap.docs.map(d => ({id: d.id, ...d.data()}));
        const className = student.className || "";
        const section = student.section || "";
        const overallGradeObj = computeDynamicGrade(avg, className, section, gradingSystems);
        
        const report = {
          student: student,
          scores: scores,
          summary: { average: avg, overallGrade: overallGradeObj.grade },
          attendance: { percentage: 95 }, // Mock for now
          psychomotor: psySnap.empty ? {} : psySnap.docs[0].data(),
          affective: affSnap.empty ? {} : affSnap.docs[0].data(),
          term: term,
          session: academicSession,
          reportType: reportType
        };
        
        const pdfGenerator = require("./pdf");
        const { enrichReportData } = require("./reportUtil");
        await enrichReportData(db, report, cfg);

        const html = pdfGenerator.generateStudentReportHTML(report, cfg);
        const dataUri = "data:text/html;charset=utf-8," + encodeURIComponent(html);
        
        return res.json({ success: true, previewUrl: dataUri, downloadUrl: dataUri });
      } catch (err) {
        return res.json({ success: false, message: "Error downloading report: " + err.message });
      }
    },

    parentGenerateIDCard: async (req, res) => {
      const { studentId } = req.body;
      const session = req.session;
      try {
        await verifyParentChild(session.userId, studentId);
        
        const studentDoc = await db.collection("students").doc(studentId).get();
        if (!studentDoc.exists) return res.json({ success: false, message: "Student not found." });
        const student = studentDoc.data();
        
        const cfgDoc = await db.collection("settings").doc("global").get();
        const cfg = cfgDoc.exists ? cfgDoc.data() : { schoolName: "MySchool Portal" };
        
        const pdfGenerator = require("./pdf");
        const html = pdfGenerator.generateStudentIdCardHTML(student, cfg);
        const dataUri = "data:text/html;charset=utf-8," + encodeURIComponent(html);
        
        return res.json({ success: true, previewUrl: dataUri, downloadUrl: dataUri });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    parentGetStudentCredit: async (req, res) => {
      const { studentId } = req.body;
      const session = req.session;
      try {
        await verifyParentChild(session.userId, studentId);
        // Returns 0 credit for now as it's just a stub
        return res.json(0); 
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    parentSubmitPaymentData: async (req, res) => {
      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "SUBMIT_PAYMENT", details: `Submitted fee payment` }).catch(()=>{}); }
      const { data } = req.body;
      const session = req.session;
      try {
        if (!data || !data.studentId) throw new Error("Student ID missing.");
        if (!data.amount || Number(data.amount) <= 0) throw new Error("Please enter a valid amount.");
        if (data.method !== 'Cash' && !data.proofOfPayment) throw new Error("Proof of payment is required.");

        // Verify parent is linked to this student
        await verifyParentChild(session.userId, data.studentId);

        // Fetch student name and class to store with payment
        const studentDoc = await db.collection("students").doc(data.studentId).get();
        if (!studentDoc.exists) throw new Error("Student not found.");
        const student = studentDoc.data();

        const paymentData = {
          studentId: data.studentId,
          studentName: student.fullName || (student.firstName + ' ' + student.lastName),
          className: student.className || student.class || '',
          amount: Number(data.amount),
          method: data.method || 'Bank Transfer',
          proofOfPayment: data.proofOfPayment,
          comment: data.comment || "",
          term: data.term,
          session: data.session,
          status: "Pending",  // Needs approval from accounts
          submittedBy: session.userId,
          submittedByRole: "parent",
          paymentDate: new Date().toISOString(),
          date: new Date().toISOString()
        };

        await db.collection("payments").add(paymentData);

        return res.json({ success: true, message: "Payment submitted successfully. It will appear on your ledger once approved by the accounts office." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    parentDownloadReceipt: async (req, res) => {
      const { paymentId } = req.body;
      try {
        if (!paymentId) return res.json({ success: false, message: "Payment ID required." });
        const payDoc = await db.collection("payments").doc(paymentId).get();
        if (!payDoc.exists) return res.json({ success: false, message: "Payment not found." });
        const p = payDoc.data();
        if (p.status !== "Approved") return res.json({ success: false, message: "Receipt is only available for approved payments." });

        const settingsDoc = await db.collection("settings").doc("global").get();
        const settings = settingsDoc.data() || {};
        const receiptNo = payDoc.id.slice(-8).toUpperCase();

        let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
          <style>
            body{font-family:"Times New Roman",serif;margin:0;padding:20px;color:#1a1a1a;}
            .wrap{max-width:700px;margin:0 auto;border:3px double #0d1b2a;padding:20px;}
            .hdr{display:flex;align-items:center;border-bottom:2px solid #0d1b2a;padding-bottom:12px;margin-bottom:16px;}
            .school-name{font-size:20px;font-weight:bold;text-transform:uppercase;color:#0d1b2a;}
            .title-badge{background:#0d1b2a;color:#f0a500;padding:4px 16px;font-size:13px;font-weight:bold;text-transform:uppercase;display:inline-block;margin-top:8px;}
            table{width:100%;border-collapse:collapse;margin:16px 0;}
            th{background:#0d1b2a;color:#f0a500;padding:6px 10px;border:1px solid #0d1b2a;}
            td{padding:6px 10px;border:1px solid #ccc;}
            tr:nth-child(even){background:#f8f8f8;}
            .total-row td{font-weight:bold;font-size:14px;background:#e8f5e9;}
            .footer{text-align:center;margin-top:20px;font-size:10px;color:#888;border-top:1px solid #e0e0e0;padding-top:10px;}
          </style>
        </head><body><div class="wrap">
          <div class="hdr">
            <div style="width:60px;height:60px;background:#0d1b2a;display:flex;align-items:center;justify-content:center;color:#f0a500;font-weight:bold;font-size:14px;margin-right:15px;">Logo</div>
            <div>
              <div class="school-name">${settings.school_name || 'MySchool Portal'}</div>
              <div class="title-badge">Official Payment Receipt</div>
            </div>
          </div>
          <table>
            <tr><th colspan="2" style="text-align:left;">Receipt Details</th></tr>
            <tr><td>Receipt No</td><td><strong>${receiptNo}</strong></td></tr>
            <tr><td>Student Name</td><td>${p.studentName || '-'}</td></tr>
            <tr><td>Class</td><td>${p.className || '-'}</td></tr>
            <tr><td>Term / Session</td><td>${p.term || '-'} / ${p.session || '-'}</td></tr>
            <tr><td>Payment Method</td><td>${p.method || 'Bank Transfer'}</td></tr>
            <tr><td>Date Approved</td><td>${new Date(p.approvedAt || p.date || Date.now()).toLocaleDateString()}</td></tr>
            <tr class="total-row"><td>Amount Paid</td><td style="color:#16a34a;font-size:16px;">\u20a6${Number(p.amount || 0).toLocaleString()}</td></tr>
          </table>
          <p style="margin-top:20px;">This receipt confirms that the above payment has been received and approved by the accounts office.</p>
          <div class="footer">Generated on ${new Date().toLocaleString()} &mdash; ${settings.school_name || 'MySchool Portal'}</div>
        </div></body></html>`;

        const dataUri = "data:text/html;charset=utf-8," + encodeURIComponent(html);
        return res.json({ success: true, previewUrl: dataUri });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },
    parentRequestInstallmentPlan: async (req, res) => {
      try {
        const { studentId, billId, term, session, milestones } = req.body;
        const parentId = req.session.userId;
        if (!studentId || !billId || !milestones || !Array.isArray(milestones) || milestones.length === 0) {
          return res.json({ success: false, message: "Student ID, bill ID, and milestones are required." });
        }
        await verifyParentChild(parentId, studentId);
        const billDoc = await db.collection("bills").doc(billId).get();
        if (!billDoc.exists) return res.json({ success: false, message: "Bill not found." });
        const bill = billDoc.data();
        const totalMilestone = milestones.reduce((sum, m) => sum + Number(m.amount || 0), 0);
        const billTotal = Number(bill.totalBilled || 0) + Number(bill.arrears || 0);
        if (Math.abs(totalMilestone - billTotal) > 1) {
          return res.json({ success: false, message: `Milestone total (N${totalMilestone.toLocaleString()}) must equal total due (N${billTotal.toLocaleString()}).` });
        }
        const existingSnap = await db.collection("installment_plans").where("billId", "==", billId).get();
        if (!existingSnap.empty) {
          const existing = existingSnap.docs[0].data();
          if (existing.status === "pending" || existing.status === "approved") {
            return res.json({ success: false, message: "A plan already exists for this bill." });
          }
        }
        const studentDoc = await db.collection("students").doc(studentId).get();
        const studentData = studentDoc.exists ? studentDoc.data() : {};
        const studentName = studentData.fullName || "Unknown";
        const campusId = studentData.campusId || bill.campusId || null;
        const className = studentData.className || bill.className || null;
        // Normalize section value
        let section = (studentData.section || bill.section || "both").toLowerCase();
        
        const planRef = db.collection("installment_plans").doc();
        await planRef.set({
          id: planRef.id, studentId, studentName, billId, parentId,
          term: term || bill.term, session: session || bill.session,
          totalAmount: billTotal, campusId, className, section,
          milestones: milestones.map(m => ({ ...m, amount: Number(m.amount), paid: false })),
          status: "pending", createdAt: new Date().toISOString()
        });
        await db.collection("notifications").add({
          targetRole: "accounts",
          title: "New Installment Plan Request",
          message: `${studentName}'s parent has requested an installment payment plan for ${term || bill.term}, ${session || bill.session}.`,
          type: "FINANCE", isRead: false, createdAt: new Date().toISOString()
        });
        return res.json({ success: true, message: "Installment plan submitted for approval. The accounts office will review it shortly." });
      } catch(err) { return res.json({ success: false, message: err.message }); }
    },

    parentGetInstallmentPlan: async (req, res) => {
      try {
        const { studentId } = req.body;
        const parentId = req.session.userId;
        await verifyParentChild(parentId, studentId);
        const snap = await db.collection("installment_plans").where("studentId", "==", studentId).get();
        const plans = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        plans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return res.json({ success: true, data: plans });
      } catch(err) { return res.json({ success: false, message: err.message }); }
    },
    
    parentGetAnnouncements: async (req, res) => {
      try {
        const parentId = req.session.userId;
        
        // Find children of this parent to know their sections/classes/campuses
        const snap = await db.collection("students").where("parentId", "==", parentId).get();
        if (snap.empty) {
          // If parent has no children, they probably only see "all" announcements, but we can query that.
          const announcementsSnap = await db.collection("announcements")
            .where("targetAudience", "==", "all")
            .orderBy("createdAt", "desc").get();
          return res.json({ success: true, data: announcementsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
        }

        const classes = [];
        const sections = ["both", ""];
        const campuses = [null, ""];
        
        snap.forEach(doc => {
          const s = doc.data();
          if (s.className && !classes.includes(s.className)) classes.push(s.className);
          if (s.section && !sections.includes(s.section)) sections.push(s.section);
          if (s.campusId && !campuses.includes(s.campusId)) campuses.push(s.campusId);
        });

        // We can't do complex OR queries natively in firestore easily in one go.
        // So we query ALL announcements for the matching campus/section, then filter in memory for classes or 'all'.
        
        // Let's just fetch all announcements, since there won't be millions, 
        // and filter them based on the parent's children.
        // To be somewhat efficient, we'll order by createdAt desc limit 100.
        const allAnnSnap = await db.collection("announcements")
          .orderBy("createdAt", "desc")
          .limit(100)
          .get();
          
        const validAnnouncements = [];
        allAnnSnap.forEach(doc => {
          const a = doc.data();
          
          // Filter by campus
          if (a.campusId && !campuses.includes(a.campusId)) return;
          
          // Filter by section
          if (a.section && a.section !== "both" && !sections.includes(a.section)) return;
          
          // Filter by audience
          if (a.targetAudience === "all") {
            validAnnouncements.push({ id: doc.id, ...a });
          } else if (a.targetAudience === "class" && classes.includes(a.targetClass)) {
            validAnnouncements.push({ id: doc.id, ...a });
          }
        });
        
        return res.json({ success: true, data: validAnnouncements });
      } catch(err) {
        return res.json({ success: false, message: err.message });
      }
    }

  };
};
