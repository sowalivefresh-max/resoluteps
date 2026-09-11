const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");

module.exports = function(db) {
  return {

    // === STUDENT AUTH ===

    studentLogin: async (req, res) => {
      const { admissionNumber, password } = req.body;
      if (!admissionNumber || !password) {
        return res.json({ success: false, message: "Admission number and password are required." });
      }
      try {
        const snap = await db.collection("students")
          .where("admissionNumber", "==", admissionNumber.trim())
          .where("status", "==", "active")
          .limit(1).get();

        if (snap.empty) {
          return res.json({ success: false, message: "Invalid admission number or password." });
        }

        const doc = snap.docs[0];
        const student = doc.data();

        if (student.portalEnabled === false) {
          return res.json({ success: false, message: "Your portal account has been disabled. Please contact admin." });
        }

        let hash = student.portalPasswordHash;
        let mustChange = student.mustChangePassword;

        // Auto-initialize default password for bulk-uploaded or legacy students
        if (!hash) {
          let defaultPassword = "Welcome@1";
          if (student.dateOfBirth) {
            const dob = student.dateOfBirth.replace(/[-/]/g, "");
            if (dob.length === 8) {
              if (parseInt(dob.substring(0, 4)) > 1900) {
                defaultPassword = dob.substring(6, 8) + dob.substring(4, 6) + dob.substring(0, 4);
              } else {
                defaultPassword = dob;
              }
            }
          }
          hash = await bcrypt.hash(defaultPassword, 10);
          mustChange = true;
          await db.collection("students").doc(doc.id).update({
            portalPasswordHash: hash,
            mustChangePassword: true,
            portalEnabled: true
          });
        }

        const isMatch = await bcrypt.compare(String(password), hash);
        if (!isMatch) {
          return res.json({ success: false, message: "Invalid admission number or password." });
        }

        const token = uuidv4();
        await db.collection("sessions").doc(token).set({
          userId: doc.id,
          role: "student",
          fullName: student.fullName,
          studentId: doc.id,
          admissionNumber: student.admissionNumber,
          className: student.className || "",
          section: student.section || "primary",
          campusId: student.campusId || null,
          createdAt: new Date().toISOString()
        });

        return res.json({
          success: true,
          token,
          role: "student",
          mustChangePassword: !!mustChange,
          userName: student.fullName,
          userId: doc.id,
          admissionNumber: student.admissionNumber
        });
      } catch (err) {
        return res.json({ success: false, message: "Login error: " + err.message });
      }
    },

    studentChangePassword: async (req, res) => {
      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "CHANGE_PASSWORD", details: `Changed password` }).catch(()=>{}); }
      if (!req.session || req.session.role !== "student") {
        return res.status(403).json({ success: false, message: "Unauthorized." });
      }
      const { newPassword, currentPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.json({ success: false, message: "New password must be at least 6 characters." });
      }
      try {
        const studentRef = db.collection("students").doc(req.session.userId);
        const studentDoc = await studentRef.get();
        const student = studentDoc.data();

        if (!student.mustChangePassword) {
          if (!currentPassword) return res.json({ success: false, message: "Current password is required." });
          const match = await bcrypt.compare(String(currentPassword), student.portalPasswordHash);
          if (!match) return res.json({ success: false, message: "Incorrect current password." });
        }

        const newHash = await bcrypt.hash(String(newPassword), 10);
        await studentRef.update({ portalPasswordHash: newHash, mustChangePassword: false });

        const sessSnap = await db.collection("sessions").where("userId", "==", req.session.userId).get();
        const batch = db.batch();
        sessSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();

        return res.json({ success: true, message: "Password changed successfully. Please log in again." });
      } catch (err) {
        return res.json({ success: false, message: "Error changing password: " + err.message });
      }
    },

    studentGetMyInfo: async (req, res) => {
      if (!req.session || req.session.role !== "student") {
        return res.status(403).json({ success: false, message: "Unauthorized." });
      }
      try {
        const doc = await db.collection("students").doc(req.session.userId).get();
        if (!doc.exists) return res.json({ success: false, message: "Student not found." });
        const data = doc.data();
        delete data.portalPasswordHash;
        return res.json({ success: true, data: { id: doc.id, ...data } });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    studentResetPassword: async (req, res) => {
      const { studentId } = req.body;
      if (!studentId) return res.json({ success: false, message: "Student ID required." });
      try {
        const doc = await db.collection("students").doc(studentId).get();
        if (!doc.exists) return res.json({ success: false, message: "Student not found." });
        const student = doc.data();

        let defaultPassword = "Welcome@1";
        if (student.dateOfBirth) {
          const dob = student.dateOfBirth.replace(/[-/]/g, "");
          if (dob.length === 8) {
            if (parseInt(dob.substring(0, 4)) > 1900) {
              defaultPassword = dob.substring(6, 8) + dob.substring(4, 6) + dob.substring(0, 4);
            } else {
              defaultPassword = dob;
            }
          }
        }

        const hash = await bcrypt.hash(defaultPassword, 10);
        await db.collection("students").doc(studentId).update({
          portalPasswordHash: hash,
          mustChangePassword: true,
          portalEnabled: true
        });

        return res.json({ success: true, message: "Password reset successfully. Student must change password on next login." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    studentGetAssignments: async (req, res) => {
      if (!req.session || req.session.role !== "student") {
        return res.status(403).json({ success: false, message: "Unauthorized." });
      }
      try {
        const uDoc = await db.collection("students").doc(req.session.userId).get();
        const studentData = uDoc.data() || {};
        const sClass = (studentData.className || "").trim().toLowerCase();
        
        const settingsDoc = await db.collection("settings").doc("global").get();
        const settings = settingsDoc.exists ? settingsDoc.data() : {};
        const term = settings.current_term || "";
        const session = settings.current_session || "";

        const snap = await db.collection("assignments")
          .where("term", "==", term)
          .where("session", "==", session).get();


        const results = [];
        snap.forEach(doc => {
          const d = doc.data();
          let isTarget = false;
          if (!d.className || d.className === "All") {
            isTarget = true;
          } else if (Array.isArray(d.className)) {
            isTarget = d.className.some(c => String(c).trim().toLowerCase() === sClass || String(c).trim().toLowerCase() === "all");
          } else if (typeof d.className === 'string') {
            const parts = d.className.split(',').map(s => s.trim().toLowerCase());
            isTarget = parts.includes(sClass) || parts.includes("all") || d.className.trim().toLowerCase() === sClass;
          }
          if (!d.className || isTarget) {
            results.push({ id: doc.id, ...d });
          }
        });
        results.sort((a, b) => (b.createdAt || "") > (a.createdAt || "") ? 1 : -1);
        return res.json({ success: true, data: results });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    studentGetNotes: async (req, res) => {
      if (!req.session || req.session.role !== "student") {
        return res.status(403).json({ success: false, message: "Unauthorized." });
      }
      try {
        const uDoc = await db.collection("students").doc(req.session.userId).get();
        const studentData = uDoc.data() || {};
        const sClass = (studentData.className || "").trim().toLowerCase();
        console.log(`[DEBUG] studentGetNotes called for student class: "${sClass}" (raw: "${studentData.className}")`);
        
        const snap = await db.collection("lesson_notes").get();
        console.log(`[DEBUG] Found ${snap.size} total notes in Firestore.`);

        const now = Date.now();
        const results = [];
        const deletePromises = [];
        snap.forEach(doc => {
          const d = doc.data();
          const created = d.createdAt ? new Date(d.createdAt).getTime() : 0;
          if (now - created > 7 * 24 * 60 * 60 * 1000) {
            deletePromises.push(doc.ref.delete());
            return;
          }
          let isTarget = false;
          if (!d.className || d.className === "All") {
            isTarget = true;
          } else if (Array.isArray(d.className)) {
            isTarget = d.className.some(c => String(c).trim().toLowerCase() === sClass || String(c).trim().toLowerCase() === "all");
          } else if (typeof d.className === 'string') {
            const parts = d.className.split(',').map(s => s.trim().toLowerCase());
            isTarget = parts.includes(sClass) || parts.includes("all") || d.className.trim().toLowerCase() === sClass;
          }
          
          console.log(`[DEBUG] Note ID: ${doc.id}, Note Class: ${JSON.stringify(d.className)}, isTarget: ${isTarget}`);
          
          if (!d.className || isTarget) {
            const { fileData, ...meta } = d;
            results.push({ id: doc.id, ...meta });
          }
        });
        await Promise.all(deletePromises);
        results.sort((a, b) => (b.createdAt || "") > (a.createdAt || "") ? 1 : -1);
        console.log(`[DEBUG] Returning ${results.length} notes for student.`);
        return res.json({ success: true, data: results });
      } catch (err) {
        console.error("[DEBUG] Error in studentGetNotes:", err);
        return res.json({ success: false, message: err.message });
      }
    },

    studentGetNoteFile: async (req, res) => {
      if (!req.session || req.session.role !== "student") {
        return res.status(403).json({ success: false, message: "Unauthorized." });
      }
      const { noteId } = req.body;
      if (!noteId) return res.json({ success: false, message: "Note ID required." });
      try {
        const doc = await db.collection("lesson_notes").doc(noteId).get();
        if (!doc.exists) return res.json({ success: false, message: "Note not found." });
        const d = doc.data();
        const created = d.createdAt ? new Date(d.createdAt).getTime() : 0;
        if (Date.now() - created > 7 * 24 * 60 * 60 * 1000) {
          return res.json({ success: false, message: "This note has expired and is no longer available." });
        }
        return res.json({ success: true, fileData: d.fileData, fileName: d.fileName, mimeType: d.mimeType || "application/pdf" });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    studentGetQuizzes: async (req, res) => {
      if (!req.session || req.session.role !== "student") {
        return res.status(403).json({ success: false, message: "Unauthorized." });
      }
      try {
        const { userId } = req.session;
        const uDoc = await db.collection("students").doc(req.session.userId).get();
        const studentData = uDoc.data() || {};
        const className = studentData.className || "";

        // === FINANCE LOCK CHECK ===
        const rulesDoc = await db.collection("settings").doc("compliance_rules").get();
        const rules = rulesDoc.exists ? rulesDoc.data() : {};
        if (rules.cbt_lock_enabled) {
          const settingsDoc = await db.collection("settings").doc("global").get();
          const globalSettings = settingsDoc.data() || {};
          const currentTerm = globalSettings.current_term;
          const currentSession = globalSettings.current_session;
          if (currentTerm && currentSession) {
            const billSnap = await db.collection("bills")
              .where("studentId", "==", userId)
              .where("term", "==", currentTerm)
              .where("session", "==", currentSession)
              .limit(1).get();
            if (!billSnap.empty) {
              const bill = billSnap.docs[0].data();
              const billed = Number(bill.totalBilled || 0);
              const arrears = Number(bill.arrears || 0);
              const paidSnap = await db.collection("payments")
                .where("studentId", "==", userId)
                .where("term", "==", currentTerm)
                .where("session", "==", currentSession)
                .where("status", "==", "Approved").get();
              let paid = 0;
              paidSnap.forEach(d => paid += Number(d.data().amount || 0));
              let outstanding = Math.max(0, (billed + arrears) - paid);
              const totalDue = billed + arrears;
              const threshold = rules.cbt_lock_threshold || 0.5;
              let lockMessage = `CBT access is restricted. You have an outstanding fee balance of ₦${outstanding.toLocaleString()}. Please contact the accounts office.`;
              
              if (totalDue > 0 && (outstanding / totalDue) > threshold) {
                if (studentData.lockOverride) {
                  outstanding = 0;
                } else {
                  const planSnap = await db.collection("installment_plans")
                    .where("studentId", "==", userId)
                    .where("status", "==", "Approved")
                    .where("term", "==", currentTerm)
                    .where("session", "==", currentSession)
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
                      lockMessage = `Installment Plan Defaulted! You missed a payment milestone. CBT access is restricted.`;
                    }
                  }
                }
              }
              
              if (totalDue > 0 && (outstanding / totalDue) > threshold) {
                return res.json({ success: false, financeLocked: true, outstandingAmount: outstanding, message: lockMessage });
              }
            }
          }
        }
        // === END FINANCE LOCK CHECK ===
        const settingsDoc = await db.collection("settings").doc("global").get();
        const settings = settingsDoc.exists ? settingsDoc.data() : {};
        const term = settings.current_term || "";
        const session = settings.current_session || "";

        const snap = await db.collection("cbt_quizzes")
          .where("term", "==", term)
          .where("session", "==", session).get();

        const attSnap = await db.collection("cbt_attempts")
          .where("studentId", "==", userId).get();
        const attemptedMap = {};
        attSnap.forEach(d => {
          const data = d.data();
          if (data.status === "completed") attemptedMap[data.quizId] = { score: data.score, total: data.total, percentage: data.percentage };
        });

        const sClass = (className || "").trim().toLowerCase();
        const results = [];
        snap.forEach(doc => {
          const d = doc.data();
          let isTarget = false;
          if (!d.className || d.className === "All") {
            isTarget = true;
          } else if (Array.isArray(d.className)) {
            isTarget = d.className.some(c => String(c).trim().toLowerCase() === sClass || String(c).trim().toLowerCase() === "all");
          } else if (typeof d.className === 'string') {
            const parts = d.className.split(',').map(s => s.trim().toLowerCase());
            isTarget = parts.includes(sClass) || parts.includes("all") || d.className.trim().toLowerCase() === sClass;
          }
          if (!d.className || isTarget) {
            const now = new Date().getTime();
            let timeLocked = false;
            let timeLockedReason = "";
            if (d.availableFrom && now < new Date(d.availableFrom).getTime()) {
              timeLocked = true;
              timeLockedReason = "starts_later";
            } else if (d.availableTo && now > new Date(d.availableTo).getTime()) {
              timeLocked = true;
              timeLockedReason = "ended";
            }
            results.push({ id: doc.id, ...d, timeLocked, timeLockedReason, attemptResult: attemptedMap[doc.id] || null });
          }
        });
        return res.json({ success: true, data: results });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    studentStartQuiz: async (req, res) => {
      if (!req.session || req.session.role !== "student") {
        return res.status(403).json({ success: false, message: "Unauthorized." });
      }
      const { quizId } = req.body;
      if (!quizId) return res.json({ success: false, message: "Quiz ID required." });
      try {
        const { userId, fullName } = req.session;
        const uDoc = await db.collection("students").doc(req.session.userId).get();
        const studentData = uDoc.data() || {};
        const className = studentData.className || "";

        
        const existingSnap = await db.collection("cbt_attempts")
          .where("quizId", "==", quizId)
          .where("studentId", "==", userId)
          .limit(1).get();
          
        let attemptId = null;
        let savedAnswers = {};
        let savedSecs = null;

        if (!existingSnap.empty) {
          const att = existingSnap.docs[0].data();
          if (att.status === "completed") {
            return res.json({ success: false, alreadyAttempted: true, message: "You have already attempted this quiz.", score: att.score, total: att.total, percentage: att.percentage });
          } else {
            attemptId = existingSnap.docs[0].id;
            if (att.answers && Array.isArray(att.answers)) {
              att.answers.forEach(a => {
                if (a.selectedOption) savedAnswers[a.questionId] = a.selectedOption;
              });
            }
            // Use wall-clock time for strict enforcement
            if (att.startedAt) {
              const quizDoc = await db.collection("cbt_quizzes").doc(quizId).get();
              const durationMin = Number(quizDoc.exists ? quizDoc.data().durationMinutes || 30 : 30);
              const elapsedSecs = Math.floor((new Date().getTime() - new Date(att.startedAt).getTime()) / 1000);
              savedSecs = Math.max(0, (durationMin * 60) - elapsedSecs);
            }
          }
        }

        const quizDoc = await db.collection("cbt_quizzes").doc(quizId).get();
        if (!quizDoc.exists) return res.json({ success: false, message: "Quiz not found." });
        const quiz = quizDoc.data();
        
        const now = new Date().getTime();
        if (quiz.availableFrom && now < new Date(quiz.availableFrom).getTime()) {
           return res.json({ success: false, message: "Quiz is not yet available." });
        }
        if (quiz.availableTo && now > new Date(quiz.availableTo).getTime()) {
           return res.json({ success: false, message: "Quiz has ended." });
        }

        const qSnap = await db.collection("cbt_questions").where("quizId", "==", quizId).get();
        const questions = [];
        qSnap.forEach(doc => {
          const q = doc.data();
          questions.push({ id: doc.id, question: q.question, optionA: q.optionA, optionB: q.optionB, optionC: q.optionC, optionD: q.optionD });
        });
        
        // Only shuffle if it's a new attempt, to avoid confusing them if they resume? 
        // Actually, the answer is mapped by ID and letter, so shuffle is perfectly safe.
        if (quiz.shuffleQuestions !== false) {
          questions.sort(() => Math.random() - 0.5);
        }

        if (!attemptId) {
          const attemptRef = db.collection("cbt_attempts").doc();
          await attemptRef.set({
            quizId, studentId: userId, studentName: fullName, className,
            startedAt: new Date().toISOString(), status: "in_progress"
          });
          attemptId = attemptRef.id;
        }

        return res.json({
          success: true,
          attemptId,
          savedAnswers,
          savedSecs,
          quiz: {
            title: quiz.title,
            durationMinutes: quiz.durationMinutes,
            shuffleOptions: quiz.shuffleOptions !== false
          },
          questions
        });

      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    
    studentSaveQuizProgress: async (req, res) => {
      if (!req.session || req.session.role !== "student") {
        return res.status(403).json({ success: false, message: "Unauthorized." });
      }
      const { attemptId, answers, remainingSeconds } = req.body;
      if (!attemptId) return res.json({ success: false, message: "Attempt ID required." });
      try {
        const attemptRef = db.collection("cbt_attempts").doc(attemptId);
        const attemptDoc = await attemptRef.get();
        if (!attemptDoc.exists) return res.json({ success: false, message: "Attempt not found." });
        if (attemptDoc.data().status === "completed") {
          return res.json({ success: false, message: "Quiz already completed." });
        }
        await attemptRef.update({
          answers: answers || [],
          remainingSeconds: remainingSeconds || 0,
          lastSavedAt: new Date().toISOString()
        });
        return res.json({ success: true, message: "Progress saved." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    studentSubmitQuiz: async (req, res) => {

      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "SUBMIT_QUIZ", details: `Submitted CBT Quiz` }).catch(()=>{}); }
      if (!req.session || req.session.role !== "student") {
        return res.status(403).json({ success: false, message: "Unauthorized." });
      }
      const { attemptId, answers } = req.body;
      if (!attemptId || !answers) return res.json({ success: false, message: "Attempt ID and answers required." });
      try {
        const attemptRef = db.collection("cbt_attempts").doc(attemptId);
        const attemptDoc = await attemptRef.get();
        if (!attemptDoc.exists) return res.json({ success: false, message: "Attempt not found." });
        if (attemptDoc.data().status === "completed") {
          return res.json({ success: false, message: "Quiz already submitted." });
        }

        const { quizId, startedAt } = attemptDoc.data();
        const quizDoc = await db.collection("cbt_quizzes").doc(quizId).get();
        if (!quizDoc.exists) return res.json({ success: false, message: "Quiz not found." });
        const correctMap = quizDoc.data().answerKey || {};

        // Server-Side Time Enforcement
        const durationMin = Number(quizDoc.data().durationMinutes || 30);
        if (startedAt) {
          const elapsedSecs = (new Date().getTime() - new Date(startedAt).getTime()) / 1000;
          const bufferSecs = 120; // 2 minutes grace period for network latency
          if (elapsedSecs > (durationMin * 60) + bufferSecs) {
            return res.json({ success: false, message: `Time expired! Your submission was rejected because it exceeded the allowed ${durationMin} minutes.` });
          }
        }

        let score = 0;
        const total = Object.keys(correctMap).length;
        const gradedAnswers = (answers || []).map(a => {
          const isCorrect = a.selectedOption && correctMap[a.questionId] &&
            a.selectedOption.toUpperCase() === correctMap[a.questionId].toUpperCase();
          if (isCorrect) score++;
          return { questionId: a.questionId, selected: a.selectedOption, correct: correctMap[a.questionId], isCorrect };
        });

        const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

        await attemptRef.update({
          status: "completed",
          submittedAt: new Date().toISOString(),
          score, total, percentage, answers: gradedAnswers
        });

        return res.json({ success: true, score, total, percentage, message: `Quiz submitted! You scored ${score}/${total} (${percentage}%)` });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    }
  };
};
