module.exports = function(db, notificationsActions) {
  async function getTeacherClass(userId) {
    const userDoc = await db.collection("users").doc(userId).get();
    let cls = userDoc.exists ? userDoc.data().classAssigned : null;
    if (!cls) {
      const snap1 = await db.collection("classes").where("classTeacherId", "==", userId).get();
      const snap2 = await db.collection("classes").where("classTeacherIds", "array-contains", userId).get();
      if (!snap1.empty) cls = snap1.docs[0].data().className;
      else if (!snap2.empty) cls = snap2.docs[0].data().className;
    }
    return cls;
  }

  return {
    teacherGetMySubjects: async (req, res) => {
      // Session attached by middleware
      const session = req.session;
      const role = session.role;
      const userId = session.userId;
      
      try {
        if (role === 'primary_teacher') {
          // Fetch the user to get their assigned class
          const myClass = (await getTeacherClass(userId)) || "";
          const myClassNormalized = myClass.toLowerCase().trim();
          
          const subjectsSnap = await db.collection("subjects").get();
          const subjects = [];
          
          subjectsSnap.forEach(doc => {
            let sub = doc.data();
            sub.id = doc.id;
            
            const sec = sub.section ? String(sub.section).toLowerCase().trim() : "";
            let classList = sub.className || sub.class || sub.targetClasses || "";
            if (Array.isArray(classList)) classList = classList.join(",");
            const classListNormalized = classList.toLowerCase().trim();
            
            let isMySubject = false;
            
            // 1. Explicitly assigned to this teacher
            if (sub.assignedTeacherId && String(sub.assignedTeacherId) === String(userId)) {
              isMySubject = true;
            } 
            // 2. Assigned to this specific class
            else if (myClassNormalized && (classListNormalized.includes(myClassNormalized) || myClassNormalized.includes(classListNormalized))) {
              isMySubject = true;
            }
            // 3. Assigned to all primary (if section is primary and no specific class constraint)
            else if (sec === 'primary' && (!classListNormalized || classListNormalized === 'all' || classListNormalized === '')) {
              isMySubject = true;
            }
            // 4. Fallback: if section is primary and class list contains the generic 'primary' string
            else if (sec === 'primary' && classListNormalized.includes('primary') && !myClassNormalized) {
              isMySubject = true;
            }
            // 5. Fallback: if explicitly assigned to 'all' classes regardless of section
            else if (classListNormalized === 'all' || classListNormalized === 'both') {
              isMySubject = true;
            }
            
            if (isMySubject) {
              subjects.push(sub);
            }
          });
          return res.json({ success: true, data: subjects });
        } else {
          // Standard teacher, just get explicitly assigned subjects
          const subjectsSnap = await db.collection("subjects").get();
          const subjects = [];
          subjectsSnap.forEach(doc => {
            let sub = doc.data();
            sub.id = doc.id;
            const tId = sub.assignedTeacherId || sub.teacherId;
            if (tId && String(tId) === String(userId)) {
              subjects.push(sub);
            }
          });
          return res.json({ success: true, data: subjects });
        }
      } catch (err) {
        return res.json({ success: false, message: "Error fetching subjects: " + err.message });
      }
    },

    teacherGetStudentCount: async (req, res) => {
      const userId = req.session.userId;
      const role = req.session.role;
      try {
        let studentCount = 0;
        if (role === 'primary_teacher') {
          const myClass = await getTeacherClass(userId);
          if (myClass) {
            const snap = await db.collection("students").where("className", "==", myClass).count().get();
            studentCount = snap.data().count;
          }
        } else {
          const subSnap = await db.collection("subjects").get();
          const subjectIds = [];
          subSnap.forEach(d => {
            const sub = d.data();
            const tId = sub.assignedTeacherId || sub.teacherId;
            if (tId && String(tId) === String(userId)) {
              subjectIds.push(d.id);
            }
          });
          if (subjectIds.length > 0) {
            let uniqueStudents = new Set();
            for (let i = 0; i < subjectIds.length; i += 30) {
              const chunk = subjectIds.slice(i, i + 30);
              const enrollSnap = await db.collection("student_subjects").where("subjectId", "in", chunk).get();
              enrollSnap.forEach(doc => uniqueStudents.add(doc.data().studentId));
            }
            studentCount = uniqueStudents.size;
          }
        }
        return res.json({ success: true, data: studentCount });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    teacherGetClassStudents: async (req, res) => {
      const className = req.body.className;
      if (!className) return res.json({ success: false, message: "Class name required." });
      
      try {
        const studentsSnap = await db.collection("students")
          .where("className", "==", className)
          .where("status", "==", "active")
          .get();
          
        const students = [];
        studentsSnap.forEach(doc => {
          let st = doc.data();
          st.id = doc.id;
          students.push(st);
        });
        
        return res.json({ success: true, data: students });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching students: " + err.message });
      }
    },

    teacherGetStudentSubjects: async (req, res) => {
      try {
        const sid = req.body.studentId;
        if (!sid) return res.json({ success: false, message: "Student ID required" });
        
        const teacherClass = await getTeacherClass(req.session.userId);
        if (!teacherClass) return res.json({ success: false, message: "You are not assigned as a class teacher." });
        
        const studentDoc = await db.collection("students").doc(sid).get();
        if (!studentDoc.exists || studentDoc.data().className !== teacherClass) {
          return res.json({ success: false, message: "Student not found in your assigned class." });
        }
        
        const role = req.session.role;
        const targetSection = 'primary';
        
        const subjectsSnap = await db.collection("subjects").where("section", "==", targetSection).get();
        const allSubjects = subjectsSnap.docs.map(d => ({id: d.id, ...d.data()}));
        
        const enrollSnap = await db.collection("student_subjects").where("studentId", "==", sid).get();
        const enrolledIds = enrollSnap.docs.map(d => d.data().subjectId);
        
        const enrolled = allSubjects.filter(s => enrolledIds.includes(s.id));
        const available = allSubjects.filter(s => !enrolledIds.includes(s.id));
        
        return res.json({ success: true, data: { enrolled, available } });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    teacherGetSubjectStudents: async (req, res) => {
      try {
        const { subjectId, session, term } = req.body;
        if (!subjectId) return res.json({ success: false, message: "Subject ID required" });

        // 1. Get enrollments for this subject
        let query = db.collection("student_subjects").where("subjectId", "==", subjectId);
        if (session) query = query.where("session", "==", session);
        if (term) query = query.where("term", "==", term);

        const enrollSnap = await query.get();
        if (enrollSnap.empty) return res.json({ success: true, data: [] });
        
        const studentIds = enrollSnap.docs.map(d => d.data().studentId);
        
        // 2. Fetch the student details for these IDs
        const studentsSnap = await db.collection("students").where("status", "==", "active").get();
        const students = [];
        studentsSnap.forEach(doc => {
          if (studentIds.includes(doc.id)) {
            let st = doc.data();
            st.id = doc.id;
            students.push(st);
          }
        });
        
        return res.json({ success: true, data: students });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    teacherEnrollStudent: async (req, res) => { 
      try {
        const { studentId, subjectId, session, term } = req.body;
        if (!studentId || !subjectId) return res.json({ success: false, message: "Student and Subject ID required" });
        
        const teacherClass = await getTeacherClass(req.session.userId);
        const studentDoc = await db.collection("students").doc(studentId).get();
        if (!studentDoc.exists || studentDoc.data().className !== teacherClass) {
          return res.json({ success: false, message: "Student not found in your assigned class." });
        }
        
        const existing = await db.collection("student_subjects")
          .where("studentId", "==", studentId)
          .where("subjectId", "==", subjectId).get();
          
        if (!existing.empty) return res.json({ success: false, message: "Student already enrolled in this subject" });
        
        await db.collection("student_subjects").add({
          studentId, subjectId, session, term, enrolledAt: new Date().toISOString()
        });
        return res.json({ success: true, message: "Student enrolled successfully." });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },

    teacherUnenrollStudent: async (req, res) => { 
      try {
        const { studentId, subjectId } = req.body;
        if (!studentId || !subjectId) return res.json({ success: false, message: "Student and Subject ID required" });
        
        const teacherClass = await getTeacherClass(req.session.userId);
        const studentDoc = await db.collection("students").doc(studentId).get();
        if (!studentDoc.exists || studentDoc.data().className !== teacherClass) {
          return res.json({ success: false, message: "Student not found in your assigned class." });
        }
        
        const existing = await db.collection("student_subjects")
          .where("studentId", "==", studentId)
          .where("subjectId", "==", subjectId).get();
          
        if (existing.empty) return res.json({ success: false, message: "Enrollment not found" });
        
        const batch = db.batch();
        existing.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        
        return res.json({ success: true, message: "Student unenrolled successfully." });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },

    teacherGetScores: async (req, res) => {
      const filters = req.body.filters || {};
      const session = req.session;
      
      if (!filters.subjectId) {
        filters.teacherId = session.userId;
      }
      
      try {
        let query = db.collection("assessments");
        
        if (filters.subjectId) query = query.where("subjectId", "==", filters.subjectId);
        if (filters.teacherId) query = query.where("teacherId", "==", filters.teacherId);
        if (filters.className) query = query.where("className", "==", filters.className);
        if (filters.term) query = query.where("term", "==", filters.term);
        if (filters.session) query = query.where("session", "==", filters.session);
        
        const scoresSnap = await query.get();
        const scores = [];
        scoresSnap.forEach(doc => {
          let s = doc.data();
          s.id = doc.id;
          scores.push(s);
        });
        
        return res.json({ success: true, data: scores });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching scores: " + err.message });
      }
    },
    
    teacherGetLessonPlans: async (req, res) => {
      const session = req.session;
      try {
        const plansSnap = await db.collection("lessonPlans")
          .where("teacherId", "==", session.userId)
          .orderBy("createdAt", "desc")
          .get();
          
        const plans = [];
        plansSnap.forEach(doc => {
          let p = doc.data();
          p.id = doc.id;
          plans.push(p);
        });
        
        return res.json({ success: true, data: plans });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching lesson plans: " + err.message });
      }
    },

    teacherSaveScore: async (req, res) => {
      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "EDIT_GRADEBOOK", details: `Updated gradebook score for student ${req.body.data ? req.body.data.studentId : "unknown"}` }).catch(()=>{}); }
      const data = req.body.data;
      if (!data || !data.studentId || !data.subjectId) {
        return res.json({ success: false, message: "Student ID and Subject ID required." });
      }
      
      try {
        if (data.id) {
          await db.collection("assessments").doc(data.id).update(data);
          return res.json({ success: true, message: "Score updated successfully." });
        } else {
          // Verify existing score
          const existingSnap = await db.collection("assessments")
            .where("studentId", "==", data.studentId)
            .where("subjectId", "==", data.subjectId)
            .where("term", "==", data.term)
            .where("session", "==", data.session)
            .get();
            
          if (!existingSnap.empty) {
            await db.collection("assessments").doc(existingSnap.docs[0].id).update(data);
            return res.json({ success: true, message: "Score updated successfully." });
          } else {
            const newRef = db.collection("assessments").doc();
            data.id = newRef.id;
            await newRef.set(data);
            return res.json({ success: true, message: "Score saved successfully." });
          }
        }
      } catch (err) {
        return res.json({ success: false, message: "Error saving score: " + err.message });
      }
    },

    teacherBulkSaveScores: async (req, res) => {
      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "EDIT_GRADEBOOK", details: `Bulk updated gradebook scores` }).catch(()=>{}); }
      const scores = req.body.data;
      if (!scores || !Array.isArray(scores) || scores.length === 0) {
        return res.json({ success: false, message: "No score data provided." });
      }

      try {
        const batch = db.batch();
        let count = 0;
        
        for (let data of scores) {
          if (!data.studentId || !data.subjectId) continue;
          
          if (data.id) {
            batch.update(db.collection("assessments").doc(data.id), data);
          } else {
            const existingSnap = await db.collection("assessments")
              .where("studentId", "==", data.studentId)
              .where("subjectId", "==", data.subjectId)
              .where("term", "==", data.term)
              .where("session", "==", data.session)
              .get();
              
            if (!existingSnap.empty) {
              batch.update(db.collection("assessments").doc(existingSnap.docs[0].id), data);
            } else {
              const newRef = db.collection("assessments").doc();
              data.id = newRef.id;
              batch.set(newRef, data);
            }
          }
          count++;
        }
        
        if (count > 0) {
          await batch.commit();
          
          // Trigger notifications to parents in the background (fire and forget)
          if (notificationsActions) {
            // Deduplicate by studentId to prevent spam
            const uniqueStudentIds = [...new Set(scores.map(s => s.studentId).filter(Boolean))];
            uniqueStudentIds.forEach(async (sid) => {
              try {
                const studentDoc = await db.collection("students").doc(sid).get();
                if (studentDoc.exists && studentDoc.data().parentId) {
                  const student = studentDoc.data();
                  // We pick the first score data for term info
                  const meta = scores.find(s => s.studentId === sid);
                  notificationsActions.createNotification(
                    student.parentId,
                    "Exam Results Updated",
                    `New results have been uploaded/updated for ${student.fullName || 'your child'} (${meta.term || ''}, ${meta.session || ''}).`,
                    "RESULT"
                  );
                }
              } catch (e) {
                console.error("Failed to trigger result notification for", sid, e);
              }
            });
          }
        }
        return res.json({ success: true, message: `${count} scores saved successfully.` });
      } catch (err) {
        return res.json({ success: false, message: "Error saving bulk scores: " + err.message });
      }
    },

    teacherSaveLessonPlan: async (req, res) => {
      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "UPLOAD_LESSON_NOTE", details: `Uploaded/Saved lesson note` }).catch(()=>{}); }
      const data = req.body.data;
      const session = req.session;
      
      if (!data || !data.title) {
        return res.json({ success: false, message: "Plan title is required." });
      }

      try {
        if (data.id) {
          await db.collection("lessonPlans").doc(data.id).update({
            ...data,
            updatedAt: new Date().toISOString()
          });
          return res.json({ success: true, message: "Lesson plan updated." });
        } else {
          const newRef = db.collection("lessonPlans").doc();
          await newRef.set({
            ...data,
            id: newRef.id,
            teacherId: session.userId,
            teacherName: session.fullName,
            createdAt: new Date().toISOString(),
            status: "Pending" // requires admin/principal approval usually
          });
          return res.json({ success: true, message: "Lesson plan submitted." });
        }
      } catch (err) {
        return res.json({ success: false, message: "Error saving lesson plan: " + err.message });
      }
    },

    teacherGetAttendance: async (req, res) => {
      const { className, date } = req.body;
      if (!className || !date) return res.json({ success: false, message: "Class and date required." });
      
      try {
        const attendanceSnap = await db.collection("attendance")
          .where("className", "==", className)
          .where("date", "==", date)
          .get();
          
        const records = [];
        attendanceSnap.forEach(doc => {
          let rec = doc.data();
          rec.id = doc.id;
          records.push(rec);
        });
        
        return res.json({ success: true, data: records });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching attendance: " + err.message });
      }
    },

    teacherSaveAttendance: async (req, res) => {
      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "MARK_ATTENDANCE", details: `Marked attendance for ${req.body.className || "unknown class"}` }).catch(()=>{}); }
      const records = req.body.records || req.body.data;
      if (!records || !Array.isArray(records)) {
        return res.json({ success: false, message: "Invalid attendance data." });
      }

      const date = req.body.date;
      const className = req.body.className;
      const term = req.body.term || "";
      const session = req.body.session || "";

      if (!date || !className) {
        return res.json({ success: false, message: "Date and class name are required." });
      }

      try {
        const batch = db.batch();
        let count = 0;
        
        for (let record of records) {
          if (!record.studentId) continue;
          
          // Generate deterministic ID so we can blindly update without querying
          const docId = record.studentId + "_" + date.replace(/\//g, "-");
          const ref = db.collection("attendance").doc(docId);
          
          batch.set(ref, {
            studentId: record.studentId,
            className: className,
            date: date,
            status: record.status,
            term: term,
            session: session,
            teacherId: req.session.userId,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          
          count++;
        }
        
        await batch.commit();

        // Send Email Notifications
        try {
          const settingsDoc = await db.collection("settings").doc("global").get();
          const settings = settingsDoc.data();
          if (settings && settings.smtp_email && settings.smtp_password) {
            const nodemailer = require("nodemailer");
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: { user: settings.smtp_email, pass: settings.smtp_password }
            });
            
            const emailPromises = [];
            
            await Promise.allSettled(records.filter(r => r.studentId && r.status).map(async (record) => {
              const sDoc = await db.collection("students").doc(record.studentId).get();
              if (!sDoc.exists) return;
              const student = sDoc.data();
              if (!student.parentId) return;
              
              const pDoc = await db.collection("users").doc(student.parentId).get();
              if (!pDoc.exists) return;
              const parent = pDoc.data();
              
              if (parent.email) {
                  const studentName = student.fullName || ((student.firstName && student.lastName) ? `${student.firstName} ${student.lastName}` : 'your ward');
                  const mailOptions = {
                    from: `"${settings.school_name || 'School Administration'}" <${settings.smtp_email}>`,
                    to: parent.email,
                    subject: `Attendance Notification for ${studentName}`,
                    text: `Dear ${parent.fullName || 'Parent'},\n\nPlease be informed that your ward, ${studentName}, was marked ${record.status} on ${date} in ${className}.\n\nThank you,\nManagement`
                };
                emailPromises.push(transporter.sendMail(mailOptions));
              }
            }));
            
            // Wait for all emails to be dispatched concurrently to prevent cloud function termination
            await Promise.allSettled(emailPromises);
          }
        } catch(e) {
          console.error("Attendance email error:", e);
        }

        return res.json({ success: true, message: `Saved attendance for ${count} students.` });
      } catch (err) {
        return res.json({ success: false, message: "Error saving attendance: " + err.message });
      }
    },

    teacherGetSubjectAttendance: async (req, res) => {
      const { className, subjectName, date } = req.body;
      if (!className || !subjectName || !date) return res.json({ success: false, message: "Class, subject, and date required." });
      
      try {
        const snap = await db.collection("subject_attendance")
          .where("className", "==", className)
          .where("subjectName", "==", subjectName)
          .where("date", "==", date)
          .get();
          
        const records = [];
        snap.forEach(doc => {
          let rec = doc.data();
          rec.id = doc.id;
          records.push(rec);
        });
        
        return res.json({ success: true, data: records });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching subject attendance: " + err.message });
      }
    },

    teacherSaveSubjectAttendance: async (req, res) => {
      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "MARK_ATTENDANCE", details: `Marked subject attendance` }).catch(()=>{}); }
      const records = req.body.records || req.body.data;
      if (!records || !Array.isArray(records)) {
        return res.json({ success: false, message: "Invalid attendance data." });
      }

      const { date, className, subjectName, term, session } = req.body;

      if (!date || !className || !subjectName) {
        return res.json({ success: false, message: "Date, class, and subject are required." });
      }

      try {
        const batch = db.batch();
        let count = 0;
        
        for (let record of records) {
          if (!record.studentId) continue;
          
          // Generate deterministic ID
          const docId = record.studentId + "_" + subjectName.replace(/[^a-zA-Z0-9]/g, "") + "_" + date.replace(/\//g, "-");
          const ref = db.collection("subject_attendance").doc(docId);
          
          batch.set(ref, {
            studentId: record.studentId,
            className: className,
            subjectName: subjectName,
            date: date,
            status: record.status,
            term: term || "",
            session: session || "",
            teacherId: req.session.userId,
            updatedAt: new Date().toISOString()
          }, { merge: true });
          
          count++;
        }
        
        await batch.commit();

        return res.json({ success: true, message: `Saved subject attendance for ${count} students.` });
      } catch (err) {
        return res.json({ success: false, message: "Error saving subject attendance: " + err.message });
      }
    },

    teacherGetPsychomotor: async (req, res) => {
      const { studentId, term, session } = req.body;
      if (!studentId || !term || !session) return res.json({ success: false, message: "Missing parameters." });
      
      try {
        const snap = await db.collection("psychomotorRecords")
          .where("studentId", "==", studentId)
          .where("term", "==", term)
          .where("session", "==", session)
          .get();
          
        if (snap.empty) return res.json({ success: true, data: null });
        let data = snap.docs[0].data();
        data.id = snap.docs[0].id;
        return res.json({ success: true, data: data });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching psychomotor: " + err.message });
      }
    },

    teacherGetClassSettings: async (req, res) => {
      const { className, term, session } = req.body;
      if (!className || !term || !session) return res.json({ success: false, message: "Missing parameters." });
      try {
        const snap = await db.collection("classSettings")
          .where("className", "==", className)
          .where("term", "==", term)
          .where("session", "==", session)
          .get();
        if (snap.empty) return res.json({ success: true, data: null });
        let data = snap.docs[0].data();
        data.id = snap.docs[0].id;
        return res.json({ success: true, data: data });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching class settings: " + err.message });
      }
    },

    teacherSaveClassSettings: async (req, res) => {
      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "UPDATE_CLASS_SETTINGS", details: `Updated class settings` }).catch(()=>{}); }
      const data = req.body;
      if (!data || !data.className || !data.term || !data.session) {
        return res.json({ success: false, message: "Missing required data." });
      }
      try {
        const snap = await db.collection("classSettings")
          .where("className", "==", data.className)
          .where("term", "==", data.term)
          .where("session", "==", data.session)
          .get();
        if (!snap.empty) {
          await db.collection("classSettings").doc(snap.docs[0].id).update(data);
          return res.json({ success: true, message: "Class settings updated." });
        } else {
          const newRef = db.collection("classSettings").doc();
          data.id = newRef.id;
          await newRef.set(data);
          return res.json({ success: true, message: "Class settings saved." });
        }
      } catch (err) {
        return res.json({ success: false, message: "Error saving class settings: " + err.message });
      }
    },

    teacherSavePsychomotor: async (req, res) => {
      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "UPDATE_TRAITS", details: `Updated psychomotor traits` }).catch(()=>{}); }
      const data = req.body.data;
      if (!data || !data.studentId || !data.term || !data.session) {
        return res.json({ success: false, message: "Missing required data." });
      }

      try {
        const snap = await db.collection("psychomotorRecords")
          .where("studentId", "==", data.studentId)
          .where("term", "==", data.term)
          .where("session", "==", data.session)
          .get();

        if (!snap.empty) {
          await db.collection("psychomotorRecords").doc(snap.docs[0].id).update(data);
          return res.json({ success: true, message: "Psychomotor record updated." });
        } else {
          const newRef = db.collection("psychomotorRecords").doc();
          data.id = newRef.id;
          await newRef.set(data);
          return res.json({ success: true, message: "Psychomotor record saved." });
        }
      } catch (err) {
        return res.json({ success: false, message: "Error saving psychomotor: " + err.message });
      }
    },

    teacherGetAffective: async (req, res) => {
      const { studentId, term, session } = req.body;
      if (!studentId || !term || !session) return res.json({ success: false, message: "Missing parameters." });
      
      try {
        const snap = await db.collection("affectiveRecords")
          .where("studentId", "==", studentId)
          .where("term", "==", term)
          .where("session", "==", session)
          .get();
          
        if (snap.empty) return res.json({ success: true, data: null });
        let data = snap.docs[0].data();
        data.id = snap.docs[0].id;
        return res.json({ success: true, data: data });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching affective record: " + err.message });
      }
    },

    teacherSaveAffective: async (req, res) => {
      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "UPDATE_TRAITS", details: `Updated affective traits` }).catch(()=>{}); }
      const data = req.body.data;
      if (!data || !data.studentId || !data.term || !data.session) {
        return res.json({ success: false, message: "Missing required data." });
      }

      try {
        const snap = await db.collection("affectiveRecords")
          .where("studentId", "==", data.studentId)
          .where("term", "==", data.term)
          .where("session", "==", data.session)
          .get();

        if (!snap.empty) {
          await db.collection("affectiveRecords").doc(snap.docs[0].id).update(data);
          return res.json({ success: true, message: "Affective record updated." });
        } else {
          const newRef = db.collection("affectiveRecords").doc();
          data.id = newRef.id;
          await newRef.set(data);
          return res.json({ success: true, message: "Affective record saved." });
        }
      } catch (err) {
        return res.json({ success: false, message: "Error saving affective record: " + err.message });
      }
    },
    
    teacherGenerateLessonPlanPDF: async (req, res) => {
      try {
        const { planId } = req.body;
        const planDoc = await db.collection("lessonPlans").doc(planId).get();
        if (!planDoc.exists) return res.json({ success: false, message: "Plan not found." });
        const p = planDoc.data();
        
        let html = `<html><body style="font-family:sans-serif; padding:20px;">
          <h2 style="text-align:center;">Lesson Plan</h2>
          <hr/>
          <p><strong>Topic:</strong> ${p.topic || ''}</p>
          <p><strong>Subject:</strong> ${p.subjectName || p.subject || ''}</p>
          <p><strong>Class:</strong> ${p.className || ''}</p>
          <p><strong>Week:</strong> ${p.week || ''}</p>
          <p><strong>Teacher:</strong> ${p.teacherName || ''}</p>
          <p><strong>Reference Book:</strong> ${p.referenceBook || ''}</p>
          <hr/>
          <h4>Objectives</h4>
          <p>${p.objectives || ''}</p>
          
          <h4>Entry Behaviour</h4>
          <p>${p.entryBehaviour || ''}</p>
          
          <h4>Teaching Aids</h4>
          <p>${p.teachingAids || ''}</p>
          
          <h4>Lesson Content</h4>
          <div>${p.content || ''}</div>
          
          <h4>Presentation Steps</h4>
          <p>${p.presentationSteps || ''}</p>
          
          <h4>Evaluation</h4>
          <p>${p.evaluation || ''}</p>
          
          <h4>Assignment</h4>
          <p>${p.assignment || ''}</p>
          <hr/>
          <p><strong>Status:</strong> ${p.status || 'Pending'}</p>
        </body></html>`;
        
        const dataUri = "data:text/html;charset=utf-8," + encodeURIComponent(html);
        return res.json({ success: true, previewUrl: dataUri, downloadUrl: dataUri });
      } catch (err) {
        return res.json({ success: false, message: "Error generating PDF: " + err.message });
      }
    },

    // ================================================================
    // ASSIGNMENTS
    // ================================================================

    teacherSaveAssignment: async (req, res) => {
      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "CREATE_CONTENT", details: `Saved assignment` }).catch(()=>{}); }
      const data = req.body.data;
      if (!data || !data.title) return res.json({ success: false, message: "Assignment title required." });
      try {
        const settings = await db.collection("settings").doc("global").get();
        const s = settings.exists ? settings.data() : {};
        const payload = {
          ...data,
          teacherId: req.session.userId,
          teacherName: req.session.fullName || "",
          term: data.term || s.current_term || "",
          session: data.session || s.current_session || "",
          createdAt: new Date().toISOString()
        };
        if (data.id) {
          await db.collection("assignments").doc(data.id).update(payload);
          return res.json({ success: true, message: "Assignment updated." });
        } else {
          const ref = db.collection("assignments").doc();
          await ref.set(payload);
          return res.json({ success: true, message: "Assignment created.", id: ref.id });
        }
      } catch (err) {
        return res.json({ success: false, message: "Error saving assignment: " + err.message });
      }
    },

    teacherGetMyAssignments: async (req, res) => {
      try {
        const snap = await db.collection("assignments")
          .where("teacherId", "==", req.session.userId).get();
        const results = [];
        snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
        results.sort((a, b) => (b.createdAt || "") > (a.createdAt || "") ? 1 : -1);
        return res.json({ success: true, data: results });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    teacherDeleteAssignment: async (req, res) => {
      const { assignmentId } = req.body;
      if (!assignmentId) return res.json({ success: false, message: "Assignment ID required." });
      try {
        await db.collection("assignments").doc(assignmentId).delete();
        return res.json({ success: true, message: "Assignment deleted." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    // ================================================================
    // LESSON NOTES
    // ================================================================

    teacherSaveNote: async (req, res) => {
      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "CREATE_CONTENT", details: `Saved class note` }).catch(()=>{}); }
      const data = req.body.data;
      if (!data || !data.title) return res.json({ success: false, message: "Note title required." });
      try {
        const settings = await db.collection("settings").doc("global").get();
        const s = settings.exists ? settings.data() : {};
        const payload = {
          title: data.title,
          subjectName: data.subjectName || "",
          className: data.className || "All",
          fileName: data.fileName || "",
          mimeType: data.mimeType || data.fileMime || "application/pdf",
          fileData: data.fileData || "",
          teacherId: req.session.userId,
          teacherName: req.session.fullName || "",
          term: data.term || s.current_term || "",
          session: data.session || s.current_session || "",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        };
        const ref = db.collection("lesson_notes").doc();
        await ref.set(payload);
        return res.json({ success: true, message: "Note uploaded. It will auto-expire in 7 days.", id: ref.id });
      } catch (err) {
        return res.json({ success: false, message: "Error saving note: " + err.message });
      }
    },

    teacherGetMyNotes: async (req, res) => {
      try {
        const snap = await db.collection("lesson_notes")
          .where("teacherId", "==", req.session.userId).get();
        const now = Date.now();
        const results = [];
        const deletePromises = [];
        snap.forEach(doc => {
          const d = doc.data();
          const created = d.createdAt ? new Date(d.createdAt).getTime() : 0;
          const expired = now - created > 7 * 24 * 60 * 60 * 1000;
          if (expired) {
            deletePromises.push(doc.ref.delete());
          } else {
            const { fileData, ...meta } = d; // strip file data from list
            results.push({ id: doc.id, ...meta, expired });
          }
        });
        await Promise.all(deletePromises);
        results.sort((a, b) => (b.createdAt || "") > (a.createdAt || "") ? 1 : -1);
        return res.json({ success: true, data: results });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    teacherDeleteNote: async (req, res) => {
      const { noteId } = req.body;
      if (!noteId) return res.json({ success: false, message: "Note ID required." });
      try {
        await db.collection("lesson_notes").doc(noteId).delete();
        return res.json({ success: true, message: "Note deleted." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    // ================================================================
    // CBT QUIZZES
    // ================================================================

    teacherSaveQuiz: async (req, res) => {
      const data = req.body.data;
      if (!data || !data.title) return res.json({ success: false, message: "Quiz title required." });
      try {
        const settings = await db.collection("settings").doc("global").get();
        const s = settings.exists ? settings.data() : {};
        const payload = {
          title: data.title,
          subjectName: data.subjectName || "",
          className: data.className || "All",
          durationMinutes: parseInt(data.durationMinutes) || 30,
          obtainableScore: parseFloat(data.obtainableScore) || null,
          shuffleQuestions: !!data.shuffleQuestions,
          shuffleOptions: !!data.shuffleOptions,
          teacherId: req.session.userId,
          teacherName: req.session.fullName || "",
          term: data.term || s.current_term || "",
          session: data.session || s.current_session || "",
          isPublished: data.isPublished || false,
          availableFrom: data.availableFrom || null,
          availableTo: data.availableTo || null,
          createdAt: new Date().toISOString()
        };
        if (data.id) {
          await db.collection("cbt_quizzes").doc(data.id).update({ ...payload, isPublished: !!data.isPublished });
          return res.json({ success: true, message: "Quiz updated.", id: data.id });
        } else {
          const ref = db.collection("cbt_quizzes").doc();
          await ref.set(payload);
          return res.json({ success: true, message: "Quiz created.", id: ref.id });
        }
      } catch (err) {
        return res.json({ success: false, message: "Error saving quiz: " + err.message });
      }
    },

    teacherGetMyQuizzes: async (req, res) => {
      try {
        const snap = await db.collection("cbt_quizzes")
          .where("teacherId", "==", req.session.userId).get();
        const results = [];
        for (const doc of snap.docs) {
          const qSnap = await db.collection("cbt_questions").where("quizId", "==", doc.id).get();
          const attSnap = await db.collection("cbt_attempts").where("quizId", "==", doc.id).where("status", "==", "completed").get();
          results.push({ id: doc.id, ...doc.data(), questionCount: qSnap.size, attemptCount: attSnap.size });
        }
        results.sort((a, b) => (b.createdAt || "") > (a.createdAt || "") ? 1 : -1);
        return res.json({ success: true, data: results });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    teacherSaveQuestions: async (req, res) => {
      const { quizId, questions } = req.body;
      if (!quizId || !questions || !Array.isArray(questions)) {
        return res.json({ success: false, message: "Quiz ID and questions array required." });
      }
      try {
        // Delete existing questions for this quiz first
        const existSnap = await db.collection("cbt_questions").where("quizId", "==", quizId).get();
        const batch = db.batch();
        existSnap.docs.forEach(doc => batch.delete(doc.ref));

        const answerKey = {};
        questions.forEach(q => {
          if (!q.question || !q.correctAnswer) return;
          const ref = db.collection("cbt_questions").doc();
          batch.set(ref, {
            quizId,
            question: q.question,
            imageUrl: q.imageUrl || "",
            optionA: q.optionA || "",
            optionB: q.optionB || "",
            optionC: q.optionC || "",
            optionD: q.optionD || "",
            correctAnswer: q.correctAnswer.toUpperCase(),
            createdAt: new Date().toISOString()
          });
          answerKey[ref.id] = q.correctAnswer.toUpperCase();
        });

        batch.update(db.collection("cbt_quizzes").doc(quizId), { answerKey });
        await batch.commit();
        return res.json({ success: true, message: `${questions.length} question(s) saved.` });
      } catch (err) {
        return res.json({ success: false, message: "Error saving questions: " + err.message });
      }
    },

    teacherGetQuizQuestions: async (req, res) => {
      const { quizId } = req.body;
      if (!quizId) return res.json({ success: false, message: "Quiz ID required." });
      try {
        const snap = await db.collection("cbt_questions").where("quizId", "==", quizId).get();
        const results = [];
        snap.forEach(doc => results.push({ id: doc.id, ...doc.data() }));
        return res.json({ success: true, data: results });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    teacherDeleteQuiz: async (req, res) => {
      const { quizId } = req.body;
      if (!quizId) return res.json({ success: false, message: "Quiz ID required." });
      try {
        const batch = db.batch();
        batch.delete(db.collection("cbt_quizzes").doc(quizId));
        const qSnap = await db.collection("cbt_questions").where("quizId", "==", quizId).get();
        qSnap.docs.forEach(doc => batch.delete(doc.ref));
        const aSnap = await db.collection("cbt_attempts").where("quizId", "==", quizId).get();
        aSnap.docs.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        return res.json({ success: true, message: "Quiz and all related data deleted." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    teacherGetQuizResults: async (req, res) => {
      const { quizId } = req.body;
      if (!quizId) return res.json({ success: false, message: "Quiz ID required." });
      try {
        const quizSnap = await db.collection("cbt_quizzes").doc(quizId).get();
        const obtainableScore = quizSnap.exists ? (quizSnap.data().obtainableScore || null) : null;

        const snap = await db.collection("cbt_attempts")
          .where("quizId", "==", quizId)
          .where("status", "==", "completed").get();
        const results = [];
        snap.forEach(doc => {
          const d = doc.data();
          results.push({ 
            id: doc.id, 
            studentId: d.studentId,
            studentName: d.studentName, 
            className: d.className, 
            score: d.score, 
            total: d.total, 
            percentage: d.percentage, 
            submittedAt: d.submittedAt,
            obtainableScore: obtainableScore
          });
        });
        results.sort((a, b) => (b.percentage || 0) - (a.percentage || 0));
        return res.json({ success: true, data: results });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    teacherPublishQuiz: async (req, res) => {
      if(req.session) { db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "User", action: "PUBLISH_QUIZ", details: `Published quiz` }).catch(()=>{}); }
      const { quizId, publish } = req.body;
      if (!quizId) return res.json({ success: false, message: "Quiz ID required." });
      try {
        await db.collection("cbt_quizzes").doc(quizId).update({ isPublished: !!publish });
        return res.json({ success: true, message: publish ? "Quiz published. Students can now access it." : "Quiz unpublished." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    }
  };
};
