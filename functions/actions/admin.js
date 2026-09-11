const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");

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

module.exports = function(db, notificationsActions) {
  const classOrderMap = {
    "creche": 10, "playgroup": 20, "pre-nursery": 30, 
    "nursery 1": 40, "nursery 2": 42, "nursery 3": 44, "nursery": 40,
    "kg 1": 50, "kg 2": 52, "kg 3": 54, "kindergarten": 50, "kg": 50,
    "grade 1": 70, "grade 2": 80, "grade 3": 90, "grade 4": 100, "grade 5": 110, "grade 6": 120, "grade": 70,
    "primary 1": 70, "primary 2": 80, "primary 3": 90, "primary 4": 100, "primary 5": 110, "primary 6": 120, "primary": 70,
    "year 1": 70, "year 2": 80, "year 3": 90, "year 4": 100, "year 5": 110, "year 6": 120, "year": 70,
    "jss 1": 130, "jss 2": 140, "jss 3": 150, "jss": 130,
    "ss 1": 160, "ss 2": 170, "ss 3": 180,
    "sss 1": 160, "sss 2": 170, "sss 3": 180, "ss": 160, "sss": 160
  };
  function getClassSortWeight(className) {
    if (!className) return 999;
    let normalized = className.toLowerCase().trim();
    for (let key in classOrderMap) {
      if (normalized.startsWith(key)) return classOrderMap[key];
    }
    return 999;
  }

  // Gamification gameloop helper: Syncs the isFinanciallyCleared badge flag on a student
  async function syncStudentFinancialClearance(studentId) {
    if (!studentId) return;
    try {
      // 1. Get all bills for this student (handle legacy schema studentId vs studentID)
      const bills1 = await db.collection("bills").where("studentId", "==", studentId).get();
      const bills2 = await db.collection("bills").where("studentID", "==", studentId).get();
      
      let totalBilled = 0;
      const seenDocs = new Set();
      const processBill = (doc) => {
        if (seenDocs.has(doc.id)) return;
        seenDocs.add(doc.id);
        let b = doc.data();
        totalBilled += Number(b.totalBilled || 0) + Number(b.arrears || 0);
      };
      bills1.forEach(processBill);
      bills2.forEach(processBill);

      // 2. Get all approved payments for this student
      const pays1 = await db.collection("payments").where("studentId", "==", studentId).where("status", "==", "Approved").get();
      const pays2 = await db.collection("payments").where("studentID", "==", studentId).where("status", "==", "Approved").get();
      
      let totalPaid = 0;
      const processPay = (doc) => {
        if (seenDocs.has(doc.id)) return;
        seenDocs.add(doc.id);
        totalPaid += Number(doc.data().amount || 0);
      };
      pays1.forEach(processPay);
      pays2.forEach(processPay);

      // 3. Compare and update
      const isFinanciallyCleared = (totalBilled > 0 && totalPaid >= totalBilled);
      await db.collection("students").doc(studentId).update({ isFinanciallyCleared });
    } catch(err) {
      console.error("Error syncing financial clearance for student:", studentId, err);
    }
  }

  return {
    adminGetStats: async (req, res) => {
      // Middleware ensures req.session exists and role is admin/admin_assistant
      const section = req.body.section || "both";
      const campusId = req.body.campusId || null;

      try {
        let totalUsers = 0, totalStudents = 0, totalClasses = 0, totalSubjects = 0;
        let totalTeachers = 0, totalParents = 0, totalStaff = 0;

        if ((section === "both" || !section) && !campusId) {
          // Fast path: Use aggregate queries when not filtering by section or campus
          const [usersSnap, studentsSnap, classesSnap, subjectsSnap, teachersSnap, parentsSnap, staffSnap] = await Promise.all([
            db.collection("users").count().get(),
            db.collection("students").where("status", "==", "active").count().get(),
            db.collection("classes").count().get(),
            db.collection("subjects").count().get(),
            db.collection("users").where("role", "in", ["teacher", "primary_teacher"]).count().get(),
            db.collection("users").where("role", "==", "parent").count().get(),
            db.collection("users").where("role", "not-in", ["developer", "admin", "parent", "vendor", "student"]).count().get()
          ]);
          
          totalUsers = usersSnap.data().count;
          totalStudents = studentsSnap.data().count;
          totalClasses = classesSnap.data().count;
          totalSubjects = subjectsSnap.data().count;
          totalTeachers = teachersSnap.data().count;
          totalParents = parentsSnap.data().count;
          totalStaff = staffSnap.data().count;
        } else {
          // Filtered path: Fetch documents and filter in memory to overcome Firestore composite query limits
          const [usersSnap, studentsSnap, classesSnap, subjectsSnap] = await Promise.all([
            db.collection("users").get(),
            db.collection("students").where("status", "==", "active").get(),
            db.collection("classes").get(),
            db.collection("subjects").get()
          ]);

          const matchFilter = (d) => {
            if (section && section !== "both") {
              const sec = (d.section || "").toLowerCase();
              if (sec !== section && sec !== "both") return false;
            }
            if (campusId) {
              if ((d.campusId || null) !== campusId) return false;
            }
            return true;
          };

          const users = usersSnap.docs.map(doc => doc.data()).filter(matchFilter);
          totalUsers = users.length;
          
          totalStudents = studentsSnap.docs.map(doc => doc.data()).filter(matchFilter).length;
          totalClasses = classesSnap.docs.map(doc => doc.data()).filter(matchFilter).length;
          totalSubjects = subjectsSnap.docs.map(doc => doc.data()).filter(matchFilter).length;

          // Breakdowns
          users.forEach(u => {
            if (u.role === "teacher" || u.role === "primary_teacher") totalTeachers++;
            if (u.role === "parent") totalParents++;
            if (!["developer", "admin", "parent", "vendor", "student"].includes(u.role)) totalStaff++;
          });
        }

        return res.json({
          success: true,
          data: {
            users: totalStaff, // Usually displayed as staff count
            students: totalStudents,
            classes: totalClasses,
            subjects: totalSubjects,
            totalStudents: totalStudents,
            totalUsers: totalUsers,
            totalStaff: totalStaff,
            totalTeachers: totalTeachers,
            totalParents: totalParents
          }
        });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching stats: " + err.message });
      }
    },

    adminGetUsers: async (req, res) => {
      try {
        const section = req.body.section;
        const campusId = req.body.campusId || null;
        const usersSnap = await db.collection("users").get();
        const users = [];
        usersSnap.forEach(doc => {
          let data = doc.data();
          if (data.role === "developer") return; // Hide developer from the admin list
          
          // Section filtering
          if (section && section !== "both") {
            const sec = (data.section || "").toLowerCase();
            if (sec !== section && sec !== "both") return;
          }
          // Campus filtering
          if (campusId) {
            if ((data.campusId || null) !== campusId) return;
          }
          data.id = doc.id; // ensure ID is attached
          delete data.passwordHash; // SECURITY: Never send hashes to frontend
          delete data.salt;
          users.push(data);
        });

        // Append students with active portals
        const studentsSnap = await db.collection("students").where("portalEnabled", "==", true).get();
        studentsSnap.forEach(doc => {
          let data = doc.data();
          if (data.portalPasswordHash) {
            if (section && section !== "both") {
              const sec = (data.section || "").toLowerCase();
              if (sec !== section && sec !== "both") return;
            }
            if (campusId) {
              if ((data.campusId || null) !== campusId) return;
            }
            users.push({
              id: doc.id,
              fullName: data.fullName,
              username: data.admissionNumber,
              email: data.admissionNumber,
              role: "student",
              section: data.section || "both",
              status: data.status || "active"
            });
          }
        });

        return res.json({ success: true, data: users });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching users: " + err.message });
      }
    },

    adminGetComplianceSummary: async (req, res) => {
      try {
        const { term, session, section } = req.body;
        const campusId = req.body.campusId || null;
        
        // 1. Get all teachers
        const usersSnap = await db.collection("users").where("role", "in", ["teacher", "primary_teacher"]).get();
        let teachers = [];
        usersSnap.forEach(doc => {
          const d = doc.data();
          
          if (section && section !== "both") {
            const sec = (d.section || "").toLowerCase();
            if (sec !== section && sec !== "both") return;
          }
          // Campus filtering
          if (campusId) {
            if ((d.campusId || null) !== campusId) return;
          }
          
          teachers.push({ id: doc.id, fullName: d.fullName, role: d.role, classAssigned: d.classAssigned, classesAssigned: d.classesAssigned });
        });
        
        // 2. Attendance Compliance (Today)
        const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const attendanceSnap = await db.collection("attendance").where("date", "==", todayStr).get();
        const attendanceTeacherIds = new Set();
        const attendanceClasses = new Set();
        attendanceSnap.forEach(doc => {
          const d = doc.data();
          if (d.teacherId) attendanceTeacherIds.add(d.teacherId);
          if (d.className) attendanceClasses.add(d.className);
        });
        
        let attendanceCompliant = [];
        let attendanceDefaulted = [];
        teachers.forEach(t => {
          let isClassCompliant = false;
          if (t.classesAssigned && Array.isArray(t.classesAssigned)) {
            isClassCompliant = t.classesAssigned.some(c => attendanceClasses.has(c));
          } else if (t.classAssigned && attendanceClasses.has(t.classAssigned)) {
            isClassCompliant = true;
          }
          if (attendanceTeacherIds.has(t.id) || isClassCompliant) {
            attendanceCompliant.push(t);
          } else {
            attendanceDefaulted.push(t);
          }
        });
        
        // 3. Lesson Plans Compliance (This Week)
        const now = new Date();
        const firstDayOfWeek = new Date(now.setDate(now.getDate() - now.getDay())); 
        firstDayOfWeek.setHours(0,0,0,0);
        
        // Fetch plans for current term/session to filter by date in memory (since we might not have a composite index)
        let query = db.collection("lessonPlans");
        if(term) query = query.where("term", "==", term);
        if(session) query = query.where("session", "==", session);
        const plansSnap = await query.get();
        
        const plansTeacherIds = new Set();
        plansSnap.forEach(doc => {
          const d = doc.data();
          if (d.createdAt) {
            const planDate = new Date(d.createdAt);
            if (planDate >= firstDayOfWeek) {
              if (d.teacherId) plansTeacherIds.add(d.teacherId);
            }
          }
        });
        
        let plansCompliant = [];
        let plansDefaulted = [];
        teachers.forEach(t => {
          if (plansTeacherIds.has(t.id)) {
            plansCompliant.push(t);
          } else {
            plansDefaulted.push(t);
          }
        });

        return res.json({ 
          success: true, 
          totalTeachers: teachers.length, 
          attendanceCompliant: attendanceCompliant,
          attendanceDefaulted: attendanceDefaulted,
          plansCompliant: plansCompliant,
          plansDefaulted: plansDefaulted
        });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching compliance: " + err.message });
      }
    },
    adminGetSchoolPerformanceAnalytics: async (req, res) => {
      try {
        const { term, session, section } = req.body;
        if (!term || !session) return res.json({ success: true, overallAverage: 0, bestClass: "N/A", bestSubject: "N/A" });
        
        // 1. Get all students to map studentId -> className and section
        const studentsSnap = await db.collection("students").get();
        const studentClassMap = {};
        const studentSectionMap = {};
        studentsSnap.forEach(doc => {
          const data = doc.data();
          studentClassMap[doc.id] = data.className;
          studentSectionMap[doc.id] = (data.section || "").toLowerCase();
        });
        
        // 2. Get all assessments for term/session
        const assSnap = await db.collection("assessments")
          .where("term", "==", term)
          .where("session", "==", session)
          .get();
          
        // 1.5 Get all grading systems
        const gradingSnap = await db.collection("gradingSystems").get();
        const gradingSystems = gradingSnap.docs.map(d => ({id: d.id, ...d.data()}));
          
        let totalScoreSum = 0;
        let totalScoreCount = 0;
        const classScores = {}; // { className: { sum: 0, count: 0, studentScores: {} } }
        const subjectScores = {}; // { subject: { sum: 0, count: 0, maxScore: 0 } }
        const gradeDistribution = {};
        
        assSnap.forEach(doc => {
          const data = doc.data();
          
          // Section Filtering
          const studentSection = studentSectionMap[data.studentId] || (data.section || "").toLowerCase();
          if (section && section !== "both" && studentSection !== section.toLowerCase() && studentSection !== "both") {
            return; // Skip this assessment as it doesn't belong to the requested section
          }

          const total = Number(data.total) || 0;
          totalScoreSum += total;
          totalScoreCount++;
          
          const className = studentClassMap[data.studentId] || data.className || "Unknown";
          
          // Grade
          const gradeObj = computeDynamicGrade(total, className, studentSection, gradingSystems);
          const grade = gradeObj.grade;
          gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;

          // Class
          if (!classScores[className]) classScores[className] = { sum: 0, count: 0, studentScores: {} };
          classScores[className].sum += total;
          classScores[className].count++;
          
          if (!classScores[className].studentScores[data.studentId]) {
             classScores[className].studentScores[data.studentId] = { sum: 0, count: 0 };
          }
          classScores[className].studentScores[data.studentId].sum += total;
          classScores[className].studentScores[data.studentId].count++;

          // Subject
          const subject = data.subjectName || data.subject || "Unknown";
          if (!subjectScores[subject]) subjectScores[subject] = { sum: 0, count: 0, maxScore: 0 };
          subjectScores[subject].sum += total;
          subjectScores[subject].count++;
          if (total > subjectScores[subject].maxScore) subjectScores[subject].maxScore = total;
        });
        
        const overallAverage = totalScoreCount > 0 ? Math.round(totalScoreSum / totalScoreCount) : 0;
        
        let bestClass = "N/A";
        let bestClassAvg = -1;
        const classPerformance = [];
        
        for (const [cName, stats] of Object.entries(classScores)) {
          if (cName === "Unknown") continue;
          const avg = Math.round(stats.sum / stats.count);
          const totalStudents = Object.keys(stats.studentScores).length;
          
          let topStudentScore = -1;
          for (const sId in stats.studentScores) {
             const sAvg = stats.studentScores[sId].sum / stats.studentScores[sId].count;
             if (sAvg > topStudentScore) topStudentScore = sAvg;
          }

          classPerformance.push({
             className: cName,
             average: avg,
             totalStudents: totalStudents,
             topStudentAverage: Math.round(topStudentScore)
          });
          
          if (avg > bestClassAvg) {
            bestClassAvg = avg;
            bestClass = cName;
          }
        }
        
        classPerformance.sort((a, b) => b.average - a.average);

        let bestSubject = "N/A";
        let bestSubjectAvg = -1;
        const subjectPerformance = [];

        for (const [sub, stats] of Object.entries(subjectScores)) {
          if (sub === "Unknown") continue;
          const avg = Math.round(stats.sum / stats.count);
          subjectPerformance.push({
             subject: sub,
             average: avg,
             highestScore: stats.maxScore
          });

          if (avg > bestSubjectAvg) {
             bestSubjectAvg = avg;
             bestSubject = sub;
          }
        }
        
        subjectPerformance.sort((a, b) => b.average - a.average);

        return res.json({ 
          success: true, 
          overallAverage, 
          bestClass, 
          bestSubject,
          classPerformance,
          subjectPerformance,
          gradeDistribution 
        });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching performance: " + err.message });
      }
    },
    adminGetYearGroupRanking: async (req, res) => {
      try {
        const { term, session, yearGroup } = req.body;
        if (!term || !session || !yearGroup) return res.json({ success: false, message: "Missing required fields" });
        
        const yearGroupLower = yearGroup.toLowerCase().trim();
        
        // Handle interchangeable "Primary" and "Basic" prefixes
        let alternateYearGroupLower = yearGroupLower;
        if (yearGroupLower.startsWith("primary ")) {
          alternateYearGroupLower = yearGroupLower.replace("primary ", "basic ");
        } else if (yearGroupLower.startsWith("basic ")) {
          alternateYearGroupLower = yearGroupLower.replace("basic ", "primary ");
        }

        // 1. Get all students and filter by year group prefix
        const studentsSnap = await db.collection("students").get();
        const studentMap = {}; // id -> { name, className }
        studentsSnap.forEach(doc => {
          const data = doc.data();
          const cName = data.className || "";
          const cNameLower = cName.toLowerCase();
          
          if (cNameLower.startsWith(yearGroupLower) || cNameLower.startsWith(alternateYearGroupLower)) {
            studentMap[doc.id] = {
              name: data.fullName || data.name || "Unknown Student",
              className: cName
            };
          }
        });

        if (Object.keys(studentMap).length === 0) {
          return res.json({ success: true, ranking: [] });
        }
        
        // 2. Get assessments for term/session
        const assSnap = await db.collection("assessments")
          .where("term", "==", term)
          .where("session", "==", session)
          .get();
          
        const studentScores = {}; // id -> { sum, count }
        
        assSnap.forEach(doc => {
          const data = doc.data();
          if (studentMap[data.studentId]) {
            if (!studentScores[data.studentId]) {
              studentScores[data.studentId] = { sum: 0, count: 0 };
            }
            const total = Number(data.total) || 0;
            studentScores[data.studentId].sum += total;
            studentScores[data.studentId].count++;
          }
        });
        
        const ranking = [];
        
        for (const sId in studentMap) {
          const stats = studentScores[sId];
          const sum = stats ? stats.sum : 0;
          const count = stats ? stats.count : 0;
          const avg = count > 0 ? (sum / count) : 0;
          
          ranking.push({
            studentId: sId,
            name: studentMap[sId].name,
            className: studentMap[sId].className,
            totalScore: sum,
            averageScore: Math.round(avg * 10) / 10 // 1 decimal place
          });
        }
        
        // Sort descending by average
        ranking.sort((a, b) => b.averageScore - a.averageScore);
        
        // Add rank number
        ranking.forEach((student, index) => {
          student.rank = index + 1;
        });

        return res.json({ success: true, ranking });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching year group ranking: " + err.message });
      }
    },
    adminGetStudents: async (req, res) => {
      try {
        const section = req.body.section;
        const campusId = req.body.campusId || null;
        const snap = await db.collection("students").get();
        const students = [];
        snap.forEach(doc => {
          let data = doc.data();
          if (section && section !== "both") {
            const sec = (data.section || "").toLowerCase();
            if (sec !== section && sec !== "both") return;
          }
          // Campus filtering
          if (campusId) {
            if ((data.campusId || null) !== campusId) return;
          }
          data.id = doc.id;
          students.push(data);
        });
        students.sort((a, b) => {
          let diff = getClassSortWeight(a.className) - getClassSortWeight(b.className);
          if (diff !== 0) return diff;
          return (a.fullName || "").localeCompare(b.fullName || "");
        });
        return res.json({ success: true, data: students });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching students: " + err.message });
      }
    },

    adminGetSettings: async (req, res) => {
      try {
        const snap = await db.collection("settings").doc("global").get();
        const settings = snap.exists ? snap.data() : {};
        return res.json({ success: true, data: settings });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching settings: " + err.message });
      }
    },

    adminUpdateUser: async (req, res) => {
      const { userId, updates } = req.body;
      if (!userId || !updates) return res.json({ success: false, message: "User ID and updates required." });
      
      try {
        const uDoc = await db.collection("users").doc(userId).get();
        if (!uDoc.exists) {
           const sDoc = await db.collection("students").doc(userId).get();
           if (sDoc.exists) return res.json({ success: false, message: "Please use the Student Manager to edit student details." });
           return res.json({ success: false, message: "User not found." });
        }
        
        // If password is being updated, we need to hash it
        if (updates.password) {
          updates.passwordHash = await bcrypt.hash(String(updates.password), 10);
          updates.salt = null;
          delete updates.password;
        }
        
        await db.collection("users").doc(userId).update(updates);
        return res.json({ success: true, message: "User updated successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error updating user: " + err.message });
      }
    },

    adminGetClasses: async (req, res) => {
      try {
        const section = req.body.section;
        const campusId = req.body.campusId || null;
        const classesSnap = await db.collection("classes").get();
        const classes = [];
        classesSnap.forEach(doc => {
          let data = doc.data();
          if (section && section !== "both") {
            const sec = (data.section || "").toLowerCase();
            if (sec !== section && sec !== "both") return;
          }
          // Campus filtering
          if (campusId) {
            if ((data.campusId || null) !== campusId) return;
          }
          data.id = doc.id;
          classes.push(data);
        });
        classes.sort((a, b) => {
          let diff = getClassSortWeight(a.className) - getClassSortWeight(b.className);
          if (diff !== 0) return diff;
          return (a.className || "").localeCompare(b.className || "");
        });
        return res.json({ success: true, data: classes });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching classes: " + err.message });
      }
    },

    adminGetSubjects: async (req, res) => {
      try {
        const campusId = req.body.campusId || null;
        const section = req.body.section || null;
        const subjectsSnap = await db.collection("subjects").get();
        const subjects = [];
        subjectsSnap.forEach(doc => {
          let data = doc.data();
          data.id = doc.id;
          if (section && section !== "both") {
            const sec = (data.section || "").toLowerCase();
            if (sec !== section && sec !== "both") return;
          }
          // Campus filtering
          if (campusId) {
            if ((data.campusId || null) !== campusId) return;
          }
          subjects.push(data);
        });
        return res.json({ success: true, data: subjects });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching subjects: " + err.message });
      }
    },

    adminGetFeeStructures: async (req, res) => {
      try {
        const feesSnap = await db.collection("feeStructure").get();
        const fees = [];
        feesSnap.forEach(doc => {
          let data = doc.data();
          data.id = doc.id;
          // Normalise: ensure totalFee is always set (handle legacy totalAmount field)
          if (!data.totalFee && data.totalAmount) data.totalFee = data.totalAmount;
          // Normalise lineItems to string for consistent frontend parsing
          if (data.lineItems && typeof data.lineItems !== 'string') {
            data.lineItems = JSON.stringify(data.lineItems);
          }
          fees.push(data);
        });
        return res.json({ success: true, data: fees });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching fee structures: " + err.message });
      }
    },

    adminSaveFeeStructure: async (req, res) => {
      const data = req.body.data;
      if (!data.className || !data.term || !data.session) {
        return res.json({ success: false, message: "Class, term, and session required." });
      }

      let lineItems = [];
      if (data.lineItems) {
        try { lineItems = typeof data.lineItems === "string" ? JSON.parse(data.lineItems) : data.lineItems; }
        catch (e) { lineItems = []; }
      }

      // Always recalculate total from line items
      const totalFee = lineItems.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
      const section = data.section || "";
      const lineItemsStr = JSON.stringify(lineItems);

      try {
        if (data.id) {
          await db.collection("feeStructure").doc(data.id).update({
            className: data.className.trim(), section, totalFee, lineItems: lineItemsStr, updatedAt: new Date().toISOString()
          });
          return res.json({ success: true, message: `Fee structure updated. Total: ₦${totalFee.toLocaleString()}` });
        }

        const classes = data.className.split(",").map(c => c.trim()).filter(Boolean);
        let saved = [];
        const batch = db.batch();

        for (let cls of classes) {
          // Check existing
          const existingSnap = await db.collection("feeStructure")
            .where("className", "==", cls)
            .where("term", "==", data.term)
            .where("session", "==", data.session)
            .get();

          if (!existingSnap.empty) {
            batch.update(existingSnap.docs[0].ref, { section, totalFee, lineItems: lineItemsStr, updatedAt: new Date().toISOString() });
          } else {
            const newRef = db.collection("feeStructure").doc();
            batch.set(newRef, {
              id: newRef.id, className: cls, section, term: data.term, session: data.session,
              totalFee, lineItems: lineItemsStr, createdAt: new Date().toISOString()
            });
          }
          saved.push(cls);
        }
        await batch.commit();
        return res.json({ success: true, message: `Fee structures saved for: ${saved.join(", ")}. Total: ₦${totalFee.toLocaleString()}` });
      } catch (err) {
        return res.json({ success: false, message: "Error saving fee structure: " + err.message });
      }
    },

    adminGenerateBills: async (req, res) => {
      const { term, session, section } = req.body;
      const recordedByUserId = req.session.userId;
      
      try {
        // Query all students (no status filter to avoid missing students with no status field)
        let studentsSnap = await db.collection("students").get();
        let students = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Filter: include students with no status OR status 'active' (exclude explicitly inactive/suspended)
        students = students.filter(s => !s.status || s.status === 'active');
        // Filter by section if specified
        if (section && section !== 'both') {
          students = students.filter(s => {
            const sec = (s.section || '').toLowerCase();
            return sec === section || sec === 'both';
          });
        }
        
        // Query fee structures
        const feesSnap = await db.collection("feeStructure").where("term", "==", term).where("session", "==", session).get();
        const feeStructures = feesSnap.docs.map(doc => doc.data());

        // Pre-fetch all existing bills for this term and session to avoid N+1 queries
        const existingBillsSnap = await db.collection("bills").where("term", "==", term).where("session", "==", session).get();
        const existingBillStudentIds = new Set(existingBillsSnap.docs.map(doc => doc.data().studentId));

        // Pre-fetch early-bird config
        const earlyBirdConfigDoc = await db.collection("settings").doc("early_bird_config").get();
        const earlyBirdCfg = earlyBirdConfigDoc.exists ? earlyBirdConfigDoc.data() : null;

        // Pre-fetch settings and parents for email notifications
        const settingsDoc = await db.collection("settings").doc("global").get();
        const settings = settingsDoc.data() || {};
        let transporter = null;
        if (settings.smtp_email && settings.smtp_password) {
          const nodemailer = require("nodemailer");
          transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: settings.smtp_email, pass: settings.smtp_password }
          });
        }
        
        const parentsSnap = await db.collection("users").where("role", "==", "parent").get();
        const parentsMap = {};
        parentsSnap.forEach(doc => { parentsMap[doc.id] = doc.data(); });

        // Pre-fetch all past bills and payments to calculate global arrears
        const allBillsSnap = await db.collection("bills").get();
        const allPaymentsSnap = await db.collection("payments").where("status", "==", "Approved").get();
        
        let globalBalances = {};
        allBillsSnap.forEach(doc => {
          const b = doc.data();
          if(!globalBalances[b.studentId]) globalBalances[b.studentId] = { billed: 0, paid: 0 };
          // Calculate pure net fee to avoid double counting arrears
          let pureFee = Number(b.originalFeeTotal || b.totalBilled || 0) - Number(b.discountAmount || 0);
          globalBalances[b.studentId].billed += pureFee;
        });
        allPaymentsSnap.forEach(doc => {
          const p = doc.data();
          const sid = p.studentId || p.studentID;
          if(globalBalances[sid]) globalBalances[sid].paid += Number(p.amount || 0);
        });

        let emailPromises = [];

        let generated = 0;
        let skipped = 0;
        let generatedStudentIds = [];
        
        const batches = [];
        let currentBatch = db.batch();
        let operationCount = 0;

        const commitBatchIfNeeded = () => {
          if (operationCount >= 490) {
            batches.push(currentBatch.commit());
            currentBatch = db.batch();
            operationCount = 0;
          }
        };

        for (let student of students) {
          const sid = student.id;
          const className = student.className || "";
          
          if (existingBillStudentIds.has(sid)) {
            skipped++;
            continue;
          }

          const fee = feeStructures.find(f => f.className === className);
          if (!fee) {
            skipped++;
            continue;
          }

          const originalFeeTotal = parseFloat(fee.totalFee) || parseFloat(fee.totalAmount) || 0;
          let total = originalFeeTotal;
          
          let lineItems = [];
          try { lineItems = typeof fee.lineItems === 'string' ? JSON.parse(fee.lineItems) : (fee.lineItems || []); } catch(e){}
          
          let discountAmount = 0;
          if (student.discountConfig && student.discountConfig.type && student.discountConfig.type !== 'none') {
            if (student.discountConfig.type === 'fixed') {
              discountAmount = parseFloat(student.discountConfig.value) || 0;
            } else if (student.discountConfig.type === 'percentage') {
              const tuitionItem = lineItems.find(i => i.name && i.name.toLowerCase().includes('tuition'));
              const tuitionAmount = tuitionItem ? (parseFloat(tuitionItem.amount) || 0) : 0;
              discountAmount = (parseFloat(student.discountConfig.value) || 0) / 100 * tuitionAmount;
            }
          }
          if (discountAmount > 0) {
            total = Math.max(0, total - discountAmount);
          }
          
          // Calculate arrears
          let pastArrears = 0;
          if (globalBalances[sid]) {
             let owed = globalBalances[sid].billed - globalBalances[sid].paid;
             if (owed > 0) pastArrears = owed;
          }

          var earlyBirdSavings = 0;
          // For simplicity in this chunk, assuming 0 credit. Real implementation would fetch credit.
          const credit = 0; 
          const appliedCredit = Math.min(credit, total);
          const finalBalance = total - appliedCredit;
          const billStatus = finalBalance <= 0 ? "Paid" : (appliedCredit > 0 ? "Partial" : "Outstanding");
          
          // Fetch early-bird config for this bill generation
          let earlyBirdDeadline = null;
          let earlyBirdDiscountPercent = 0;
          if (typeof earlyBirdCfg !== 'undefined' && earlyBirdCfg && earlyBirdCfg.enabled) {
            const deadlineDate = new Date();
            deadlineDate.setDate(deadlineDate.getDate() + (earlyBirdCfg.days || 14));
            earlyBirdDeadline = deadlineDate.toISOString();
            earlyBirdDiscountPercent = Number(earlyBirdCfg.discountPercent || 3);
            // Calculate the early bird tuition savings
            const tuitionItem = lineItems.find(i => i.name && i.name.toLowerCase().includes('tuition'));
            const tuitionAmount = tuitionItem ? (parseFloat(tuitionItem.amount) || 0) : 0;
            earlyBirdSavings = (earlyBirdDiscountPercent / 100) * tuitionAmount;
          }

          const newBillRef = db.collection("bills").doc();
          currentBatch.set(newBillRef, {
            id: newBillRef.id, studentId: sid, studentName: student.fullName, className: className,
            term: term, session: session, originalFeeTotal, arrears: pastArrears, totalBilled: total, discountAmount: discountAmount, totalPaid: appliedCredit,
            balance: finalBalance, status: billStatus, lineItems: fee.lineItems,
            createdAt: new Date().toISOString(),
            earlyBirdDeadline: earlyBirdDeadline,
            earlyBirdDiscountPercent: earlyBirdDiscountPercent,
            earlyBirdSavings: earlyBirdSavings || 0,
            earlyBirdApplied: false
          });
          generatedStudentIds.push(sid);
          operationCount++;
          commitBatchIfNeeded();

          // Add notification to batch instead of calling notificationsActions to avoid N+1
          if (student.parentId) {
            const notifRef = db.collection("notifications").doc();
            currentBatch.set(notifRef, {
              targetUserId: student.parentId,
              title: "New Bill Assigned",
              message: `A new fee bill of ₦${total.toLocaleString()} for ${student.fullName || 'your child'} (${term}, ${session}) has been generated.` + (pastArrears > 0 ? ` Outstanding Arrears: ₦${pastArrears.toLocaleString()}.` : ''),
              type: "BILL",
              isRead: false,
              createdAt: new Date().toISOString()
            });
            operationCount++;
            commitBatchIfNeeded();
            
            // Queue email notification
            if (transporter && parentsMap[student.parentId]) {
              const parent = parentsMap[student.parentId];
              if (parent.email) {
                const parentName = parent.fullName || "Parent/Guardian";
                let totalAmountDue = total + pastArrears;
                const mailOptions = {
                  from: `"${settings.school_name || 'School Administration'}" <${settings.smtp_email}>`,
                  to: parent.email,
                  subject: `New Bill Generated: ₦${Number(totalAmountDue).toLocaleString()} for ${student.fullName || 'your ward'}`,
                  html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                      <div style="text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 20px;">
                        <h2 style="color: #1e293b; margin: 0;">New Bill Generated</h2>
                        <h4 style="color: #64748b; margin: 5px 0 0 0;">${settings.school_name || 'School Administration'}</h4>
                      </div>
                      
                      <p>Dear ${parentName},</p>
                      <p>Please be informed that a new fee bill has been generated for your ward for the current academic session.</p>
                      
                      <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <table style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td style="padding: 8px 0; color: #64748b; width: 40%;">Student Name:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${student.fullName || ''}</td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #64748b;">Class:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${className || ''}</td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #64748b;">Term:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${term || ''}</td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #64748b;">Session:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-weight: 500;">${session || ''}</td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 15px;">Current Term Fee:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-weight: 700; border-top: 1px dashed #cbd5e1; padding-top: 15px; font-size: 16px;">₦${Number(total).toLocaleString()}</td>
                          </tr>
                          ${pastArrears > 0 ? `
                          <tr>
                            <td style="padding: 8px 0; color: #ef4444;">Arrears Brought Forward:</td>
                            <td style="padding: 8px 0; color: #ef4444; font-weight: 700; font-size: 16px;">₦${Number(pastArrears).toLocaleString()}</td>
                          </tr>
                          <tr>
                            <td style="padding: 8px 0; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 15px;">Total Amount Due:</td>
                            <td style="padding: 8px 0; color: #1e293b; font-weight: 700; border-top: 1px dashed #cbd5e1; padding-top: 15px; font-size: 18px;">₦${Number(totalAmountDue).toLocaleString()}</td>
                          </tr>
                          ` : ''}
                        </table>
                      </div>
                      
                      <p>Please log in to the school portal to view the detailed breakdown and make payment.</p>
                      <p>Thank you.</p>
                      <p style="color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 15px; margin-top: 30px;">
                        This is an automated message from the school portal. Please do not reply directly to this email.
                      </p>
                    </div>
                  `
                };
                emailPromises.push(transporter.sendMail(mailOptions));
              }
            }
          }

          generated++;
        }
        
        if (generated > 0) {
          const auditRef = db.collection("audit_logs").doc();
          currentBatch.set(auditRef, {
            timestamp: new Date().toISOString(),
            userId: recordedByUserId,
            userName: req.session.fullName || 'System Admin',
            action: "GENERATE_BILLS",
            details: `${term} ${session}: ${generated} bills generated.`
          });
          operationCount++;
        }
        
        if (operationCount > 0) {
          batches.push(currentBatch.commit());
        }
        
        await Promise.all(batches);
        
        // Gamification: Background sync zero-debt shield for all affected students
        if (typeof syncStudentFinancialClearance === 'function') {
           // We don't await this so the API response isn't blocked
           Promise.allSettled(generatedStudentIds.map(sid => syncStudentFinancialClearance(sid))).catch(e => console.error("Error in background gamification sync", e));
        }
        
        if (emailPromises.length > 0) {
          Promise.allSettled(emailPromises).catch(e => console.error("Error sending bill emails:", e));
        }
        
        return res.json({ success: true, message: `${generated} bill(s) generated. ${skipped} skipped.` });
      } catch (err) {
        return res.json({ success: false, message: "Error generating bills: " + err.message });
      }
    },

    // --- NEW CORE CRUD ENDPOINTS ---

    adminCreateUser: async (req, res) => {
      const data = req.body.data;
      if (!data || !data.email || !data.password || !data.fullName) {
        return res.json({ success: false, message: "Email, password, and full name are required." });
      }
      try {
        // Check if user exists
        const existing = await db.collection("users").where("email", "==", data.email).get();
        if (!existing.empty) return res.json({ success: false, message: "User with this email already exists." });

        const passwordHash = await bcrypt.hash(String(data.password), 10);

        const newUserRef = db.collection("users").doc();
        const userData = {
          ...data,
          passwordHash,
          salt: null,
          createdAt: new Date().toISOString()
        };
        delete userData.password; // Don't store plain text
        
        await newUserRef.set(userData);
        return res.json({ success: true, message: "User created successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error creating user: " + err.message });
      }
    },

    adminDeleteUser: async (req, res) => {
      const { id } = req.body; // or req.body.args[1]... wait, the frontend sends it via arguments.
      // We unpack args in index.js for specific routes. For a generic route like this, the frontend sends:
      // callServer('adminDeleteUser', [AA.token, id])
      // If we don't map it in index.js, req.body will have args: [token, id].
      // We should map these in index.js, so req.body has what we expect. Let's assume req.body.userId.
      const userId = req.body.userId;
      if (!userId) return res.json({ success: false, message: "User ID required." });
      try {
        const uDoc = await db.collection("users").doc(userId).get();
        if (!uDoc.exists) {
           const sDoc = await db.collection("students").doc(userId).get();
           if (sDoc.exists) return res.json({ success: false, message: "Please use the Student Manager to delete students." });
           return res.json({ success: false, message: "User not found." });
        }
        
        await db.collection("users").doc(userId).delete();
        return res.json({ success: true, message: "User deleted successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error deleting user: " + err.message });
      }
    },

    adminCreateStudent: async (req, res) => {
      const data = req.body.data;
      if (!data || !data.fullName) return res.json({ success: false, message: "Student name is required." });
      try {
        // Auto-generate admission number
        const settingsSnap = await db.collection("settings").doc("global").get();
        let prefix = "SCH";
        if (settingsSnap.exists) {
          const sData = settingsSnap.data();
          if (sData.school_prefix) {
            prefix = sData.school_prefix.trim().toUpperCase();
          } else if (sData.school_name) {
            prefix = sData.school_name.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
          }
        }
        if (!prefix || prefix.length === 0) prefix = "SCH";
        
        const year = String(new Date().getFullYear()).slice(-2);
        
        const counterRef = db.collection("settings").doc("counters");
        const newSerial = await db.runTransaction(async (t) => {
          const doc = await t.get(counterRef);
          let nextVal = 1;
          if (doc.exists) {
            nextVal = (doc.data().admission_serial || 0) + 1;
          }
          t.set(counterRef, { admission_serial: nextVal }, { merge: true });
          return nextVal;
        });
        
        const serialStr = String(newSerial).padStart(4, '0');
        data.admissionNumber = `${prefix}/${year}/${serialStr}`;

        data.status = "active";
        
        // Auto-provision student portal account
        // Default password = DOB in DDMMYYYY (e.g. 15082010) if available, else "Welcome@1"
        let defaultPassword = "Welcome@1";
        if (data.dateOfBirth) {
          const dob = data.dateOfBirth.replace(/[-/]/g, ""); // normalize separators
          // Try to make DDMMYYYY from YYYY-MM-DD or DD/MM/YYYY
          if (dob.length === 8) {
            // If YYYYMMDD, convert to DDMMYYYY
            if (parseInt(dob.substring(0, 4)) > 1900) {
              defaultPassword = dob.substring(6, 8) + dob.substring(4, 6) + dob.substring(0, 4);
            } else {
              defaultPassword = dob; // already DDMMYYYY
            }
          }
        }
        const portalPasswordHash = await bcrypt.hash(defaultPassword, 10);
        data.portalPasswordHash = portalPasswordHash;
        data.mustChangePassword = true;
        data.portalEnabled = true;
        
        const docRef = db.collection("students").doc();
        await docRef.set({ ...data, createdAt: new Date().toISOString() });
        return res.json({ success: true, message: "Student created successfully. Portal account provisioned.", admissionNumber: data.admissionNumber });
      } catch (err) {
        return res.json({ success: false, message: "Error creating student: " + err.message });
      }
    },

    adminUpdateStudent: async (req, res) => {
      const { studentId, updates } = req.body;
      if (!studentId || !updates) return res.json({ success: false, message: "Student ID and updates required." });
      try {
        await db.collection("students").doc(studentId).update(updates);
        return res.json({ success: true, message: "Student updated successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error updating student: " + err.message });
      }
    },

    adminDeleteStudent: async (req, res) => {
      const { studentId } = req.body;
      if (!studentId) return res.json({ success: false, message: "Student ID required." });
      try {
        await db.collection("students").doc(studentId).delete();
        return res.json({ success: true, message: "Student deleted successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error deleting student: " + err.message });
      }
    },

    adminCreateClass: async (req, res) => {
      const data = req.body.data;
      if (!data || !data.className) return res.json({ success: false, message: "Class name is required." });
      if (data.classTeacherIds && typeof data.classTeacherIds === 'string') {
        const ids = data.classTeacherIds.split(',').filter(x => x.trim() !== '');
        data.classTeacherIds = ids;
        if (ids.length > 0) data.classTeacherId = ids[0];
      }
      try {
        const docRef = db.collection("classes").doc();
        await docRef.set({ ...data, createdAt: new Date().toISOString() });
        return res.json({ success: true, message: "Class created successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error creating class: " + err.message });
      }
    },

    adminUpdateClass: async (req, res) => {
      const { classId, updates } = req.body;
      if (!classId || !updates) return res.json({ success: false, message: "Class ID and updates required." });
      if (updates.classTeacherIds && typeof updates.classTeacherIds === 'string') {
        const ids = updates.classTeacherIds.split(',').filter(x => x.trim() !== '');
        updates.classTeacherIds = ids;
        if (ids.length > 0) updates.classTeacherId = ids[0];
        else updates.classTeacherId = '';
      }
      try {
        await db.collection("classes").doc(classId).update(updates);
        return res.json({ success: true, message: "Class updated successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error updating class: " + err.message });
      }
    },

    adminDeleteClass: async (req, res) => {
      const { classId } = req.body;
      if (!classId) return res.json({ success: false, message: "Class ID required." });
      try {
        await db.collection("classes").doc(classId).delete();
        return res.json({ success: true, message: "Class deleted successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error deleting class: " + err.message });
      }
    },

    adminCreateSubject: async (req, res) => {
      const data = req.body.data;
      if (!data || !data.subjectName) return res.json({ success: false, message: "Subject name is required." });
      try {
        const docRef = db.collection("subjects").doc();
        await docRef.set({ ...data, createdAt: new Date().toISOString() });
        return res.json({ success: true, message: "Subject created successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error creating subject: " + err.message });
      }
    },

    adminUpdateSubject: async (req, res) => {
      const { subjectId, updates } = req.body;
      if (!subjectId || !updates) return res.json({ success: false, message: "Subject ID and updates required." });
      try {
        await db.collection("subjects").doc(subjectId).update(updates);
        return res.json({ success: true, message: "Subject updated successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error updating subject: " + err.message });
      }
    },

    adminDeleteSubject: async (req, res) => {
      const { subjectId } = req.body;
      if (!subjectId) return res.json({ success: false, message: "Subject ID required." });
      try {
        await db.collection("subjects").doc(subjectId).delete();
        return res.json({ success: true, message: "Subject deleted successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error deleting subject: " + err.message });
      }
    },

    adminUpdateSettings: async (req, res) => {
      const updates = req.body.data;
      if (!updates) return res.json({ success: false, message: "Settings data required." });
      try {
        const oldSettingsDoc = await db.collection("settings").doc("global").get();
        const oldSettings = oldSettingsDoc.exists ? oldSettingsDoc.data() : {};

        await db.collection("settings").doc("global").set(updates, { merge: true });
        
        if (updates.results_published === true && !oldSettings.results_published) {
          const settingsDoc = await db.collection("settings").doc("global").get();
          const settings = settingsDoc.data();
          
          if (settings.smtp_email && settings.smtp_password) {
            const nodemailer = require("nodemailer");
            const transporter = nodemailer.createTransport({
              service: 'gmail',
              auth: { user: settings.smtp_email, pass: settings.smtp_password }
            });
            
            const parentsSnap = await db.collection("users").where("role", "==", "parent").get();
            const emailPromises = [];
            
            parentsSnap.forEach(doc => {
              const p = doc.data();
              if (p.email) {
                const mailOptions = {
                  from: `"${settings.school_name || 'School Administration'}" <${settings.smtp_email}>`,
                  to: p.email,
                  subject: `Results Published - ${settings.current_term} (${settings.current_session})`,
                  text: `Dear ${p.fullName || 'Parent'},\n\nPlease be informed that the results for ${settings.current_term} (${settings.current_session}) have been officially published.\n\nYou can now log into the portal to view and download your child's report card.\n\nThank you,\nManagement`
                };
                emailPromises.push(transporter.sendMail(mailOptions));
              }
            });
            
            Promise.allSettled(emailPromises).catch(e => console.error("Email sending error:", e));
          }
        }

        return res.json({ success: true, message: "Settings updated successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error updating settings: " + err.message });
      }
    },

    // --- CAMPUS MANAGEMENT ---
    adminManageCampuses: async (req, res) => {
      const campuses = req.body.campuses;
      if (!Array.isArray(campuses)) return res.json({ success: false, message: "Campuses must be an array." });
      try {
        // Validate and sanitize each campus entry
        const sanitized = campuses.map((c, i) => ({
          id: c.id || `campus_${Date.now()}_${i}`,
          name: (c.name || '').trim(),
          section: c.section || 'both'
        })).filter(c => c.name);
        
        await db.collection("settings").doc("global").set({ campuses: sanitized }, { merge: true });
        
        await db.collection("audit_logs").add({
          timestamp: new Date().toISOString(),
          userId: req.session.userId,
          userName: req.session.fullName || 'System Admin',
          action: "MANAGE_CAMPUSES",
          details: `Campus list updated: ${sanitized.map(c => c.name).join(', ') || '(empty)'}`
        });
        
        return res.json({ success: true, message: "Campuses saved successfully.", campuses: sanitized });
      } catch (err) {
        return res.json({ success: false, message: "Error saving campuses: " + err.message });
      }
    },

    // --- SECONDARY READ ENDPOINTS ---
    adminGetAuditLogs: async (req, res) => {
      try {
        const snap = await db.collection("audit_logs").orderBy("timestamp", "desc").limit(100).get();
        return res.json({ success: true, data: snap.docs.map(d => ({id: d.id, ...d.data()})) });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    adminGetPasswordRequests: async (req, res) => {
      try {
        const snap = await db.collection("password_requests").where("status", "==", "pending").get();
        return res.json({ success: true, data: snap.docs.map(d => ({id: d.id, ...d.data()})) });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    adminGetPayments: async (req, res) => {
      try {
        const snap = await db.collection("payments").orderBy("paymentDate", "desc").limit(100).get();
        return res.json({ success: true, data: snap.docs.map(d => ({id: d.id, ...d.data()})) });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    adminGetExpenses: async (req, res) => {
      try {
        const snap = await db.collection("expenses").orderBy("date", "desc").limit(100).get();
        return res.json({ success: true, data: snap.docs.map(d => ({id: d.id, ...d.data()})) });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    adminGetPendingTasks: async (req, res) => {
      try {
        const snap = await db.collection("approvals").where("status", "==", "pending").get();
        return res.json({ success: true, data: snap.docs.map(d => ({id: d.id, ...d.data()})) });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    adminGetGradingSystems: async (req, res) => {
      try {
        const snap = await db.collection("gradingSystems").get();
        return res.json({ success: true, data: snap.docs.map(d => ({id: d.id, ...d.data()})) });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    adminGetStudentSubjects: async (req, res) => {
      try {
        const sid = req.body.studentId;
        if (!sid) return res.json({ success: false, message: "Student ID required" });
        
        // Get all subjects
        const subjectsSnap = await db.collection("subjects").get();
        const allSubjects = subjectsSnap.docs.map(d => ({id: d.id, ...d.data()}));
        
        // Get enrolled subjects
        const enrollSnap = await db.collection("student_subjects").where("studentId", "==", sid).get();
        const enrolledIds = enrollSnap.docs.map(d => d.data().subjectId);
        
        const enrolled = allSubjects.filter(s => enrolledIds.includes(s.id));
        const available = allSubjects.filter(s => !enrolledIds.includes(s.id));
        
        return res.json({ success: true, data: { enrolled, available } });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },

    adminPromoteStudents: async (req, res) => {
      try {
        const { promotions, newSession, newTerm } = req.body;
        if (!Array.isArray(promotions)) return res.json({ success: false, message: "Promotions array required" });
        
        const batch = db.batch();
        let promotedCount = 0;
        
        for (const p of promotions) {
          if (!p.id || !p.status || !p.className) continue;
          
          const studentRef = db.collection("students").doc(p.id);
          // If status is graduated/withdrawn, mark as inactive but preserve history
          const updates = { 
            className: p.className, 
            status: p.status === 'active' ? 'active' : 'inactive',
            inactiveReason: p.status !== 'active' ? p.status : null 
          };
          batch.update(studentRef, updates);
          promotedCount++;
        }
        
        if (promotedCount > 0) {
          await batch.commit();
        }
        
        if (newSession && newTerm) {
          await db.collection("settings").doc("global").update({
            current_session: newSession,
            current_term: newTerm
          });
        }
        
        return res.json({ success: true, message: `Successfully updated ${promotedCount} students.` });
      } catch (err) {
        return res.json({ success: false, message: "Promotion failed: " + err.message });
      }
    },

    // --- SECONDARY ACTION ENDPOINTS ---
    adminProcessPasswordReset: async (req, res) => { 
      try {
        const { requestId, newPassword } = req.body;
        if (!requestId || !newPassword) return res.json({ success: false, message: "Request ID and new password required" });
        
        const reqRef = db.collection("password_requests").doc(requestId);
        const reqSnap = await reqRef.get();
        if (!reqSnap.exists) return res.json({ success: false, message: "Request not found" });
        
        const requestData = reqSnap.data();
        const userId = requestData.userId;
        
        const hash = await bcrypt.hash(String(newPassword), 10);
        
        await db.collection("users").doc(userId).update({ salt: null, passwordHash: hash });
        await reqRef.update({ status: "Processed", processedAt: new Date().toISOString() });
        
        return res.json({ success: true, message: "Password reset successfully." });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    adminResetUserPassword: async (req, res) => { 
      try {
        const userId = req.body.userId;
        if (!userId) return res.json({ success: false, message: "User ID required" });
        
        // Generate a random temporary password
        const tempPassword = Math.random().toString(36).slice(-8);
        const hash = await bcrypt.hash(String(tempPassword), 10);
        
        const userDoc = await db.collection("users").doc(userId).get();
        if (userDoc.exists) {
          await db.collection("users").doc(userId).update({ salt: null, passwordHash: hash });
          return res.json({ success: true, message: `Password reset successfully. Temporary password is: ${tempPassword}` });
        }
        
        const studentDoc = await db.collection("students").doc(userId).get();
        if (studentDoc.exists) {
          await db.collection("students").doc(userId).update({ portalPasswordHash: hash, mustChangePassword: true });
          return res.json({ success: true, message: `Student password reset successfully. Temporary password is: ${tempPassword}` });
        }
        
        return res.json({ success: false, message: "User not found" });
      } catch (err) {
        return res.json({ success: false, message: "Reset error: " + err.message });
      }
    },
    adminApprovePayment: async (req, res) => { 
      try {
        const pid = req.body.paymentId;
        if (!pid) return res.json({ success: false, message: "Payment ID required" });
        const pRef = db.collection("payments").doc(pid);
        const pSnap = await pRef.get();
        if (!pSnap.exists) return res.json({ success: false, message: "Payment not found" });
        
        const payment = pSnap.data();
        if (payment.status === "Approved") return res.json({ success: false, message: "Payment already approved" });
        
        await pRef.update({ 
          status: "Approved", 
          approvedAt: new Date().toISOString(), 
          approvedBy: req.session.userId 
        });
        
        await db.collection("audit_logs").add({
          timestamp: new Date().toISOString(),
          userId: req.session.userId,
          userName: req.session.fullName || 'System Admin',
          action: "APPROVE_PAYMENT",
          details: `Approved payment ${pid} for ${payment.amount || 'an unknown amount'}.`
        });
        
        // Gamification: Background sync zero-debt shield
        await syncStudentFinancialClearance(payment.studentId || payment.studentID);
        
        // ---- BEGIN SEND RECEIPT EMAIL ----
        try {
          const settingsDoc = await db.collection("settings").doc("global").get();
          const settings = settingsDoc.data() || {};
          
          if (settings.smtp_email && settings.smtp_password && payment.studentId) {
            const studentDoc = await db.collection("students").doc(payment.studentId).get();
            if (studentDoc.exists && studentDoc.data().parentId) {
              const parentDoc = await db.collection("users").doc(studentDoc.data().parentId).get();
              if (parentDoc.exists && parentDoc.data().email) {
                const parentEmail = parentDoc.data().email;
                const parentName = parentDoc.data().fullName || "Parent/Guardian";
                
                const nodemailer = require("nodemailer");
                const transporter = nodemailer.createTransport({
                  service: 'gmail',
                  auth: {
                    user: settings.smtp_email,
                    pass: settings.smtp_password
                  }
                });
                
                const mailOptions = {
                  from: `"${settings.school_name || 'School Administration'}" <${settings.smtp_email}>`,
                  to: parentEmail,
                  subject: `Payment Receipt: ₦${Number(payment.amount).toLocaleString()} for ${payment.studentName || 'your ward'}`,
                  html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
                      <div style="text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 20px;">
                        <h2 style="color: #1e293b; margin: 0;">Payment Receipt</h2>
                        <h4 style="color: #64748b; margin: 5px 0 0 0;">${settings.school_name || 'School Administration'}</h4>
                      </div>
                      
                      <p>Dear ${parentName},</p>
                      <p>We are pleased to inform you that your recent payment has been <strong>approved</strong>. Below are the details of the transaction:</p>
                      
                      <div style="background: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
                        <table style="width: 100%; border-collapse: collapse;">
                          <tr><td style="padding: 8px 0; color: #64748b; width: 40%;">Student:</td><td style="padding: 8px 0; font-weight: bold; color: #0f172a;">${payment.studentName || '-'}</td></tr>
                          <tr><td style="padding: 8px 0; color: #64748b;">Class:</td><td style="padding: 8px 0; font-weight: bold; color: #0f172a;">${payment.className || '-'}</td></tr>
                          <tr><td style="padding: 8px 0; color: #64748b;">Amount Paid:</td><td style="padding: 8px 0; font-weight: bold; color: #10b981; font-size: 16px;">₦${Number(payment.amount).toLocaleString()}</td></tr>
                          <tr><td style="padding: 8px 0; color: #64748b;">Term/Session:</td><td style="padding: 8px 0; font-weight: bold; color: #0f172a;">${payment.term || '-'}, ${payment.session || '-'}</td></tr>
                          <tr><td style="padding: 8px 0; color: #64748b;">Payment Method:</td><td style="padding: 8px 0; font-weight: bold; color: #0f172a;">${payment.method || 'Bank Transfer'}</td></tr>
                          <tr><td style="padding: 8px 0; color: #64748b;">Date Approved:</td><td style="padding: 8px 0; font-weight: bold; color: #0f172a;">${new Date().toLocaleDateString()}</td></tr>
                        </table>
                      </div>
                      
                      <p>Thank you for your prompt payment!</p>
                      <p style="color: #64748b; font-size: 12px; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 15px;">
                        This is an automated message. Please do not reply directly to this email. You can download an official PDF receipt directly from the Parent Portal.
                      </p>
                    </div>
                  `
                };
                
                // Fire and forget (don't await) so it doesn't block the UI response
                transporter.sendMail(mailOptions).catch(e => console.error("Receipt email failed:", e));
              }
            }
          }
        } catch (emailErr) {
          console.error("Email setup error:", emailErr);
        }
        // ---- END SEND RECEIPT EMAIL ----
        
        return res.json({ success: true, message: "Payment approved successfully." });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    adminRejectPayment: async (req, res) => { 
      try {
        const pid = req.body.paymentId;
        if (!pid) return res.json({ success: false, message: "Payment ID required" });
        const pRef = db.collection("payments").doc(pid);
        
        await pRef.update({ 
          status: "Rejected", 
          rejectedAt: new Date().toISOString(), 
          rejectedBy: req.session.userId 
        });
        
        await db.collection("audit_logs").add({
          timestamp: new Date().toISOString(),
          userId: req.session.userId,
          userName: req.session.fullName || 'System Admin',
          action: "REJECT_PAYMENT",
          details: `Rejected payment ${pid}.`
        });
        
        return res.json({ success: true, message: "Payment rejected successfully." });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    adminRequestApproval: async (req, res) => {
      try {
        const { actionType, title, payload } = req.body;
        if (!actionType) return res.json({ success: false, message: "Action type required" });
        await db.collection("approvals").add({
          title: title || "Pending Action",
          actionType,
          payload,
          requestedBy: req.session.userId,
          requestedAt: new Date().toISOString(),
          status: "pending"
        });
        return res.json({ success: true, message: "Approval requested successfully." });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    adminApproveTask: async (req, res) => { 
      try {
        const taskId = req.body.taskId;
        if (!taskId) return res.json({ success: false, message: "Task ID required" });
        const ref = db.collection("approvals").doc(taskId);
        const snap = await ref.get();
        if (!snap.exists) return res.json({ success: false, message: "Task not found." });
        
        const task = snap.data();
        if (task.status !== "pending") return res.json({ success: false, message: "Task already processed." });
        
        // Execute the underlying task based on actionType
        if (task.actionType === "delete_student") {
          await db.collection("students").doc(task.payload.studentId).delete();
        } else if (task.actionType === "delete_class") {
          await db.collection("classes").doc(task.payload.classId).delete();
        } else if (task.actionType === "delete_subject") {
          await db.collection("subjects").doc(task.payload.subjectId).delete();
        } else if (task.actionType === "update_grading") {
          await db.collection("settings").doc("grading").set(task.payload.data, { merge: true });
        }
        
        await ref.update({ status: "Approved", approvedAt: new Date().toISOString(), approvedBy: req.session.userId });
        return res.json({ success: true, message: "Task approved and executed successfully." });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    adminRejectTask: async (req, res) => { 
      try {
        const { taskId, note } = req.body;
        if (!taskId) return res.json({ success: false, message: "Task ID required" });
        const ref = db.collection("approvals").doc(taskId);
        await ref.update({ status: "Rejected", rejectNote: note || "", rejectedAt: new Date().toISOString(), rejectedBy: req.session.userId });
        return res.json({ success: true, message: "Task rejected successfully." });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    adminImpersonateUser: async (req, res) => { 
      try {
        const userId = req.body.userId;
        if (!userId) return res.json({ success: false, message: "User ID required" });
        
        let userDoc = await db.collection("users").doc(userId).get();
        let collection = "users";
        
        if (!userDoc.exists) {
          userDoc = await db.collection("students").doc(userId).get();
          collection = "students";
        }
        
        if (!userDoc.exists) return res.json({ success: false, message: "User not found" });
        
        const user = userDoc.data();
        const role = collection === "students" ? "student" : user.role;
        const token = uuidv4();
        
        await db.collection("sessions").doc(token).set({
          userId: userDoc.id,
          role: role,
          fullName: user.fullName,
          section: user.section || "both",
          createdAt: new Date().toISOString()
        });
        
        await db.collection("audit_logs").add({
          timestamp: new Date().toISOString(),
          userId: req.session.userId,
          userName: req.session.fullName || 'System Admin',
          action: "IMPERSONATE_USER",
          details: `Admin ${req.session.userId} generated a session to impersonate ${userId}.`
        });
        
        return res.json({ success: true, token, role: role });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    adminGenerateIDCard: async (req, res) => {
      const { studentId } = req.body;
      try {
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
        return res.json({ success: false, message: "Error generating ID card: " + err.message });
      }
    },
    adminEnrollStudent: async (req, res) => { 
      try {
        const { studentId, subjectId, session, term } = req.body;
        if (!studentId || !subjectId) return res.json({ success: false, message: "Student and Subject ID required" });
        
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
    adminUnenrollStudent: async (req, res) => { 
      try {
        const { studentId, subjectId } = req.body;
        if (!studentId || !subjectId) return res.json({ success: false, message: "Student and Subject ID required" });
        
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
    adminSaveGradingSystem: async (req, res) => { 
      try {
        const data = req.body.data;
        if (!data) return res.json({ success: false, message: "Grading system data required" });
        
        let docRef;
        if (data.id) {
          docRef = db.collection("gradingSystems").doc(data.id);
        } else {
          docRef = db.collection("gradingSystems").doc();
          data.id = docRef.id;
        }
        await docRef.set(data, { merge: true });
        
        await db.collection("audit_logs").add({
          timestamp: new Date().toISOString(),
          userId: req.session.userId,
          userName: req.session.fullName || 'System Admin',
          action: "UPDATE_GRADING_SYSTEM",
          details: `Updated grading system: ${data.name || data.id}`
        });
        return res.json({ success: true, message: "Grading system saved successfully." });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },

    adminDeleteGradingSystem: async (req, res) => {
      try {
        const systemId = req.body.systemId;
        if (!systemId) return res.json({ success: false, message: "System ID required" });
        await db.collection("gradingSystems").doc(systemId).delete();
        return res.json({ success: true, message: "Grading system deleted successfully." });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    adminGenerateBulkResult: async (req, res) => { 
      try {
        const { className, term, session, rptType } = req.body;
        if (!className || !term || !session) return res.json({ success: false, message: "Class, term, and session required." });
        
        // Fetch all assessments for this class/term/session
        const assessmentsSnap = await db.collection("assessments")
          .where("className", "==", className)
          .where("term", "==", term)
          .where("session", "==", session).get();
          
        if (assessmentsSnap.empty) return res.json({ success: false, message: "No assessments found for this class and term." });
        
        const assessments = assessmentsSnap.docs.map(d => d.data());
        
        // Group by student
        const studentResults = {};
        assessments.forEach(ass => {
          if (!studentResults[ass.studentId]) {
            studentResults[ass.studentId] = { studentId: ass.studentId, totalScore: 0, subjects: 0 };
          }
          studentResults[ass.studentId].totalScore += (Number(ass.total) || 0);
          studentResults[ass.studentId].subjects += 1;
        });
        
        // Save summary to results collection
        const batch = db.batch();
        Object.keys(studentResults).forEach(sid => {
          const docRef = db.collection("results").doc(`${sid}_${term}_${session}`);
          batch.set(docRef, {
            studentId: sid,
            className, term, session, type: rptType,
            totalScore: studentResults[sid].totalScore,
            average: studentResults[sid].subjects > 0 ? (studentResults[sid].totalScore / studentResults[sid].subjects) : 0,
            generatedAt: new Date().toISOString()
          }, { merge: true });
        });
        
        await batch.commit();
        
        return res.json({ success: true, message: `Successfully generated results for ${Object.keys(studentResults).length} students.` });
      } catch (err) { return res.json({ success: false, message: err.message }); }
    },
    
    adminGetBroadsheetData: async (req, res) => {
      try {
        const { className, term, session } = req.body;
        if (!className || !term || !session) return res.json({ success: false, message: "Class, term, and session required." });
        
        const studentsSnap = await db.collection("students").where("className", "==", className).get();
        if (studentsSnap.empty) {
          return res.json({ success: true, data: { subjects: [], students: [] } });
        }
        
        const studentIds = studentsSnap.docs.map(doc => doc.id);
        const subjectsSet = new Set();
        const studentMap = {}; 
        
        studentsSnap.forEach(doc => {
          const s = doc.data();
          studentMap[doc.id] = { id: doc.id, fullName: s.fullName || (s.firstName + ' ' + s.lastName), subjects: {}, totalScore: 0 };
        });
        
        let assessments = [];
        const chunkArray = (arr, size) => arr.length ? [arr.slice(0, size), ...chunkArray(arr.slice(size), size)] : [];
        const idChunks = chunkArray(studentIds, 10);
        
        for (const chunk of idChunks) {
          const assSnap = await db.collection("assessments")
            .where("studentId", "in", chunk)
            .where("term", "==", term)
            .where("session", "==", session)
            .get();
          assSnap.forEach(doc => assessments.push(doc.data()));
        }
        
        assessments.forEach(ass => {
          if (!ass.subjectName) return; 
          subjectsSet.add(ass.subjectName);
          
          if (!studentMap[ass.studentId]) {
            studentMap[ass.studentId] = { id: ass.studentId, fullName: ass.studentName || ass.studentId, subjects: {}, totalScore: 0 };
          }
          const total = Number(ass.total) || 0;
          studentMap[ass.studentId].subjects[ass.subjectName] = total;
          studentMap[ass.studentId].totalScore += total;
        });
        
        const subjects = Array.from(subjectsSet).sort();
        const students = Object.values(studentMap).map(st => {
          st.average = subjects.length > 0 ? (st.totalScore / subjects.length).toFixed(1) : 0;
          return st;
        });
        
        students.sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));
        
        return res.json({ success: true, data: { subjects, students } });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },
    
    // ==========================================
    // MISSING ACCOUNTS / FINANCE ENDPOINTS
    // ==========================================
    
    adminGetFinancialStats: async (req, res) => {
      try {
        const { term, session, section } = req.body;

        // Fetch students if section is provided to map studentId to section
        let studentSectionMap = {};
        if (section && section !== "both") {
          const studentsSnap = await db.collection("students").get();
          studentsSnap.forEach(doc => {
            const data = doc.data();
            studentSectionMap[doc.id] = (data.section || "").toLowerCase();
          });
        }

        // Fetch all approved payments and build a paid map per student
        const paymentsSnap = await db.collection("payments").where("term", "==", term).where("session", "==", session).get();
        let totalCollected = 0;
        let paidMap = {};
        paymentsSnap.forEach(doc => {
          const d = doc.data();
          if (section && section !== "both") {
            const sid = d.studentId || d.studentID;
            const studentSection = studentSectionMap[sid] || (d.section || "").toLowerCase();
            if (studentSection !== section.toLowerCase() && studentSection !== "both") return;
          }
          if (d.status === "Approved") {
            const amount = Number(d.amount || 0);
            totalCollected += amount;
            const sid = d.studentId || d.studentID;
            if (sid) {
              paidMap[sid] = (paidMap[sid] || 0) + amount;
            }
          }
        });

        // Total billed & outstanding from bills collection
        const billsSnap = await db.collection("bills").where("term", "==", term).where("session", "==", session).get();
        let totalBilled = 0;
        let totalOutstanding = 0;
        let totalArrears = 0;
        billsSnap.forEach(doc => {
          const data = doc.data();
          if (section && section !== "both") {
            const studentSection = studentSectionMap[data.studentId] || (data.section || "").toLowerCase();
            if (studentSection !== section.toLowerCase() && studentSection !== "both") return;
          }
          let billed = Number(data.totalBilled || 0);
          let arrears = Number(data.arrears || 0);
          let paid = paidMap[data.studentId] || 0;
          totalBilled += billed;
          totalArrears += arrears;
          totalOutstanding += Math.max(0, (billed + arrears) - paid);
        });

        let totalExpectedIncome = totalBilled + totalArrears;

        // Total expenses
        const expensesSnap = await db.collection("expenses").get();
        let totalExpenses = 0;
        expensesSnap.forEach(doc => { totalExpenses += Number(doc.data().amount || 0); });

        const netBalance = totalCollected - totalExpenses;

        return res.json({
          success: true,
          totalBilled,
          totalArrears,
          totalExpectedIncome,
          totalCollected,
          totalOutstanding,
          totalExpenses,
          netBalance
        });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminGetDebtors: async (req, res) => {
      try {
        const { term, session, section } = req.body;
        // Fetch all bills and payments
        const billsSnap = await db.collection("bills").where("term", "==", term).where("session", "==", session).get();
        const paymentsSnap = await db.collection("payments").where("term", "==", term).where("session", "==", session).where("status", "==", "Approved").get();
        
        let studentBalances = {};
        
        // Fetch students if section is provided to map studentId to section
        let studentSectionMap = {};
        if (section && section !== "both") {
          const studentsSnap = await db.collection("students").get();
          studentsSnap.forEach(doc => {
            const data = doc.data();
            studentSectionMap[doc.id] = (data.section || "").toLowerCase();
          });
        }
        
        billsSnap.forEach(doc => {
          const b = doc.data();
          if (section && section !== "both") {
            const studentSection = studentSectionMap[b.studentId] || (b.section || "").toLowerCase();
            if (studentSection !== section.toLowerCase() && studentSection !== "both") return;
          }
          if(!studentBalances[b.studentId]) studentBalances[b.studentId] = { studentName: b.studentName, class: b.className, totalBilled: 0, totalPaid: 0 };
          studentBalances[b.studentId].totalBilled += Number(b.totalBilled || 0);
        });
        
        paymentsSnap.forEach(doc => {
          const p = doc.data();
          const sid = p.studentId || p.studentID;
          if(studentBalances[sid]) {
             studentBalances[sid].totalPaid += Number(p.amount || 0);
          }
        });
        
        let debtors = [];
        for (let sid in studentBalances) {
          let bal = studentBalances[sid];
          let owed = bal.totalBilled - bal.totalPaid;
          if (owed > 0) {
            debtors.push({ id: sid, studentName: bal.studentName, class: bal.class, amountOwed: owed });
          }
        }
        
        debtors.sort((a, b) => {
          let diff = getClassSortWeight(a.class) - getClassSortWeight(b.class);
          if (diff !== 0) return diff;
          return (a.studentName || "").localeCompare(b.studentName || "");
        });
        return res.json({ success: true, data: debtors });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminGetBills: async (req, res) => {
      try {
        const snap = await db.collection("bills").get();
        const bills = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Aggregate approved payments per student to compute real totalPaid & balance
        const paymentsSnap = await db.collection("payments").where("status", "==", "Approved").get();
        const paidMap = {};
        paymentsSnap.forEach(doc => {
          const p = doc.data();
          const sid = p.studentId || p.studentID;
          const term = p.term || '';
          const session = p.session || '';
          if (sid) {
            const key = sid + "_" + term + "_" + session;
            paidMap[key] = (paidMap[key] || 0) + Number(p.amount || 0);
          }
        });

        // Enrich bills with real paid amount and computed balance
        const enriched = bills.map(b => {
          const sid = b.studentId || b.studentID;
          const term = b.term || '';
          const session = b.session || '';
          const key = sid + "_" + term + "_" + session;
          const totalPaid = paidMap[key] || 0;
          const netBilled = Number(b.totalBilled || 0);
          const balance = Math.max(0, netBilled - totalPaid);
          const status = balance === 0 ? 'Paid' : (totalPaid > 0 ? 'Partial' : 'Unpaid');
          return { ...b, totalPaid, balance, status };
        });

        enriched.sort((a, b) => {
          let diff = getClassSortWeight(a.className) - getClassSortWeight(b.className);
          if (diff !== 0) return diff;
          return (a.studentName || "").localeCompare(b.studentName || "");
        });
        return res.json({ success: true, data: enriched });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminDeleteBill: async (req, res) => {
      try {
        const { billId } = req.body;
        if (!billId) return res.json({ success: false, message: "Bill ID is required." });
        await db.collection("bills").doc(billId).delete();
        return res.json({ success: true, message: "Bill deleted successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error deleting bill: " + err.message });
      }
    },

    adminRecordPayment: async (req, res) => {
      try {
        const { data } = req.body;
        if (!data || !data.studentId) return res.json({ success: false, message: "Student and amount required." });
        data.paymentDate = new Date().toISOString();
        data.date = data.paymentDate;
        data.status = "Approved"; // Automatically approved if recorded by Admin/Accounts
        const payRef = await db.collection("payments").add(data);

        // ---- SEND EMAIL RECEIPT ----
        try {
          const settingsDoc = await db.collection("settings").doc("global").get();
          const settings = settingsDoc.data() || {};
          if (settings.smtp_email && settings.smtp_password) {
            const studentDoc = await db.collection("students").doc(data.studentId).get();
            if (studentDoc.exists && studentDoc.data().parentId) {
              const parentDoc = await db.collection("users").doc(studentDoc.data().parentId).get();
              if (parentDoc.exists && parentDoc.data().email) {
                const nodemailer = require("nodemailer");
                const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: settings.smtp_email, pass: settings.smtp_password } });
                const receiptNo = payRef.id.slice(-8).toUpperCase();
                const mailOptions = {
                  from: `"${settings.school_name || 'School Administration'}" <${settings.smtp_email}>`,
                  to: parentDoc.data().email,
                  subject: `Payment Receipt: \u20a6${Number(data.amount).toLocaleString()} for ${data.studentName || 'your ward'}`,
                  html: `
                    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;border:1px solid #e2e8f0;border-radius:8px;">
                      <div style="text-align:center;border-bottom:2px solid #3b82f6;padding-bottom:15px;margin-bottom:20px;">
                        <h2 style="color:#1e293b;margin:0;">Payment Receipt</h2>
                        <h4 style="color:#64748b;margin:5px 0 0;">${settings.school_name || 'School Administration'}</h4>
                      </div>
                      <p>Dear ${parentDoc.data().fullName || 'Parent/Guardian'},</p>
                      <p>Payment recorded by the accounts office has been confirmed. Details below:</p>
                      <div style="background:#f8fafc;padding:15px;border-radius:6px;margin:20px 0;">
                        <table style="width:100%;border-collapse:collapse;">
                          <tr><td style="padding:8px 0;color:#64748b;width:40%;">Receipt No:</td><td style="font-weight:bold;color:#0f172a;">${receiptNo}</td></tr>
                          <tr><td style="padding:8px 0;color:#64748b;">Student:</td><td style="font-weight:bold;color:#0f172a;">${data.studentName || '-'}</td></tr>
                          <tr><td style="padding:8px 0;color:#64748b;">Class:</td><td style="font-weight:bold;color:#0f172a;">${data.className || '-'}</td></tr>
                          <tr><td style="padding:8px 0;color:#64748b;">Amount Paid:</td><td style="font-weight:bold;color:#10b981;font-size:16px;">\u20a6${Number(data.amount).toLocaleString()}</td></tr>
                          <tr><td style="padding:8px 0;color:#64748b;">Term/Session:</td><td style="font-weight:bold;color:#0f172a;">${data.term || '-'}, ${data.session || '-'}</td></tr>
                          <tr><td style="padding:8px 0;color:#64748b;">Method:</td><td style="font-weight:bold;color:#0f172a;">${data.method || 'Bank Transfer'}</td></tr>
                          <tr><td style="padding:8px 0;color:#64748b;">Date:</td><td style="font-weight:bold;color:#0f172a;">${new Date().toLocaleDateString()}</td></tr>
                          ${data.balanceAfterPayment !== undefined ? `<tr><td style="padding:8px 0;color:#64748b;">Remaining Balance:</td><td style="font-weight:bold;color:${data.balanceAfterPayment > 0 ? '#dc2626' : '#10b981'};">\u20a6${Number(data.balanceAfterPayment).toLocaleString()}</td></tr>` : ''}
                        </table>
                      </div>
                      <p>Thank you for your prompt payment!</p>
                      <p style="color:#64748b;font-size:12px;margin-top:30px;border-top:1px solid #e2e8f0;padding-top:15px;">This is an automated message from the school accounts system.</p>
                    </div>`
                };
                transporter.sendMail(mailOptions).catch(e => console.error("Receipt email failed:", e));
              }
            }
          }
        } catch(emailErr) { console.error("Email error:", emailErr); }
        // ---- END SEND EMAIL RECEIPT ----

        return res.json({ success: true, message: "Payment recorded successfully. A receipt has been emailed to the parent." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminGetStudentLedger: async (req, res) => {
      try {
        const { studentId } = req.body;
        const billsSnap = await db.collection("bills").where("studentId", "==", studentId).get();
        const paymentsSnap = await db.collection("payments").where("studentId", "==", studentId).get();
        
        const bills = billsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Calculate credit balance (overpayments)
        const totalBilled = bills.reduce((s, b) => s + Number(b.totalBilled || 0), 0);
        const totalPaid = payments.filter(p => p.status === 'Approved').reduce((s, p) => s + Number(p.amount || 0), 0);
        const creditBalance = Math.max(0, totalPaid - totalBilled);
        
        return res.json({ success: true, bills, payments, creditBalance });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminDownloadLedgerPDF: async (req, res) => {
      try {
        const { studentId, startDate, endDate } = req.body;
        
        // Fetch student
        const studentDoc = await db.collection("students").doc(studentId).get();
        if(!studentDoc.exists) return res.json({ success: false, message: "Student not found" });
        const student = studentDoc.data();
        
        // Fetch bills and payments
        const billsSnap = await db.collection("bills").where("studentId", "==", studentId).get();
        const paymentsSnap = await db.collection("payments").where("studentId", "==", studentId).get();
        
        let bills = billsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        let payments = paymentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Filter by Date
        if (startDate && endDate) {
          const start = new Date(startDate).getTime();
          const end = new Date(endDate).getTime() + (24 * 60 * 60 * 1000) - 1; // End of day
          
          bills = bills.filter(b => {
             const ts = b.createdAt ? new Date(b.createdAt).getTime() : 0;
             return ts >= start && ts <= end;
          });
          
          payments = payments.filter(p => {
             const ts = (p.paymentDate || p.date) ? new Date(p.paymentDate || p.date).getTime() : 0;
             return ts >= start && ts <= end;
          });
        }
        
        // Sort chronologically
        bills.sort((a,b) => (a.createdAt ? new Date(a.createdAt).getTime() : 0) - (b.createdAt ? new Date(b.createdAt).getTime() : 0));
        payments.sort((a,b) => {
          const ta = (a.paymentDate || a.date) ? new Date(a.paymentDate || a.date).getTime() : 0;
          const tb = (b.paymentDate || b.date) ? new Date(b.paymentDate || b.date).getTime() : 0;
          return ta - tb;
        });
        
        const ledgerData = {
          student,
          bills,
          payments,
          startDate,
          endDate
        };
        
        const pdfGenerator = require("./pdf");
        const cfgDoc = await db.collection("settings").doc("global").get();
        const cfg = cfgDoc.exists ? cfgDoc.data() : { schoolName: "MySchool Portal" };
        
        const html = pdfGenerator.generateStudentLedgerHTML(ledgerData, cfg);
        const dataUri = "data:text/html;charset=utf-8," + encodeURIComponent(html);
        
        return res.json({ success: true, previewUrl: dataUri });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminDownloadBillInvoice: async (req, res) => {
      try {
        const { billId } = req.body;
        if (!billId) return res.json({ success: false, message: "billId is required" });

        const billDoc = await db.collection("bills").doc(billId).get();
        if (!billDoc.exists) return res.json({ success: false, message: "Bill not found" });
        const bill = { id: billDoc.id, ...billDoc.data() };

        const stuId = bill.studentId || bill.studentID;
        const stuDoc = await db.collection("students").doc(stuId).get();
        if (!stuDoc.exists) return res.json({ success: false, message: "Student not found" });
        const student = { id: stuDoc.id, ...stuDoc.data() };

        const pdfGenerator = require("./pdf");
        const cfgDoc = await db.collection("settings").doc("global").get();
        const cfg = cfgDoc.exists ? cfgDoc.data() : { schoolName: "Resolute Private School" };

        const html = pdfGenerator.generateBillPDFHTML(student, bill, cfg);
        const dataUri = "data:text/html;charset=utf-8," + encodeURIComponent(html);

        return res.json({ success: true, previewUrl: dataUri });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminGenerateReceipt: async (req, res) => {
      try {
        const { paymentId } = req.body;
        const payDoc = await db.collection("payments").doc(paymentId).get();
        if(!payDoc.exists) return res.json({ success: false, message: "Payment not found" });
        const p = payDoc.data();

        const settingsDoc = await db.collection("settings").doc("global").get();
        const settings = settingsDoc.data() || {};
        const receiptNo = payDoc.id.slice(-8).toUpperCase();
        const logoHtml = settings.school_logo_url ? `<img src="${settings.school_logo_url}" style="width:60px;height:60px;object-fit:contain;margin-right:15px;">` : `<div style="width:60px;height:60px;background:#0d1b2a;display:flex;align-items:center;justify-content:center;color:#f0a500;font-weight:bold;font-size:14px;margin-right:15px;">Logo</div>`;

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
            ${logoHtml}
            <div>
              <div class="school-name">${settings.school_name || 'MySchool Portal'}</div>
              ${settings.school_address ? `<div style="font-size:11px;color:#555;">${settings.school_address}</div>` : ''}
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
            <tr><td>Date</td><td>${new Date(p.paymentDate || p.date || Date.now()).toLocaleDateString()}</td></tr>
            <tr class="total-row"><td>Amount Paid</td><td style="color:#16a34a;font-size:16px;">\u20a6${Number(p.amount || 0).toLocaleString()}</td></tr>
            ${p.balanceAfterPayment !== undefined ? `<tr><td>Balance Remaining</td><td style="font-weight:bold;color:${Number(p.balanceAfterPayment) > 0 ? '#dc2626' : '#16a34a'};">\u20a6${Number(p.balanceAfterPayment).toLocaleString()}</td></tr>` : ''}
          </table>
          ${p.receiptRef ? `<p style="font-size:11px;"><strong>Reference:</strong> ${p.receiptRef}</p>` : ''}
          <p style="margin-top:20px;">This receipt confirms that the above payment has been received and approved by the accounts office.</p>
          <div class="footer">Generated on ${new Date().toLocaleString()} &mdash; ${settings.school_name || 'MySchool Portal'}</div>
        </div></body></html>`;

        const dataUri = "data:text/html;charset=utf-8," + encodeURIComponent(html);
        return res.json({ success: true, previewUrl: dataUri, receiptNo });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminRecordExpense: async (req, res) => {
      try {
        const { data } = req.body;
        data.date = new Date().toISOString();
        if(data.id) {
          await db.collection("expenses").doc(data.id).update(data);
        } else {
          await db.collection("expenses").add(data);
        }
        return res.json({ success: true, message: "Expense recorded." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminDeleteExpense: async (req, res) => {
      try {
        const { expenseId } = req.body;
        await db.collection("expenses").doc(expenseId).delete();
        return res.json({ success: true, message: "Expense deleted." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminSendReminders: async (req, res) => {
      try {
        const { term, session } = req.body;
        
        // 1. Fetch SMTP settings
        const settingsDoc = await db.collection("settings").doc("global").get();
        const settings = settingsDoc.data() || {};
        if (!settings.smtp_email || !settings.smtp_password) {
          return res.json({ success: false, message: "Email settings are not configured. Please set them in the Admin Dashboard Settings." });
        }
        
        const nodemailer = require("nodemailer");
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: settings.smtp_email,
            pass: settings.smtp_password
          }
        });

        // 2. Fetch all bills and payments to determine debtors
        const billsSnap = await db.collection("bills").where("term", "==", term).where("session", "==", session).get();
        const paymentsSnap = await db.collection("payments").where("term", "==", term).where("session", "==", session).where("status", "==", "Approved").get();
        
        let studentBalances = {};
        billsSnap.forEach(doc => {
          const b = doc.data();
          if(!studentBalances[b.studentId]) studentBalances[b.studentId] = { studentName: b.studentName, class: b.className, totalBilled: 0, totalPaid: 0 };
          studentBalances[b.studentId].totalBilled += Number(b.totalBilled || 0);
        });
        
        paymentsSnap.forEach(doc => {
          const p = doc.data();
          if(studentBalances[p.studentId]) {
             studentBalances[p.studentId].totalPaid += Number(p.amount || 0);
          }
        });

        // 3. Send emails to parents of debtors
        let sentCount = 0;
        let errors = [];

        for (let sid in studentBalances) {
          let bal = studentBalances[sid];
          let owed = bal.totalBilled - bal.totalPaid;
          
          if (owed > 0) {
            // Find student parent
            const studentDoc = await db.collection("students").doc(sid).get();
            if (studentDoc.exists && studentDoc.data().parentId) {
              const parentId = studentDoc.data().parentId;
              const parentDoc = await db.collection("users").doc(parentId).get();
              
              if (parentDoc.exists && parentDoc.data().email) {
                const parentEmail = parentDoc.data().email;
                const parentName = parentDoc.data().fullName || "Parent/Guardian";
                
                const mailOptions = {
                  from: `"${settings.school_name || 'School Administration'}" <${settings.smtp_email}>`,
                  to: parentEmail,
                  subject: `Fee Reminder: Outstanding Balance for ${bal.studentName}`,
                  html: `
                    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
                      <h2 style="color: #0f172a;">Fee Payment Reminder</h2>
                      <p>Dear ${parentName},</p>
                      <p>This is a gentle reminder that there is an outstanding balance of <strong>₦${owed.toLocaleString()}</strong> for your ward, <strong>${bal.studentName}</strong> (${bal.class}), for the current term (${term}, ${session}).</p>
                      <p>Please log in to your Parent Portal to view the full ledger and record a payment.</p>
                      <p>If you have already made this payment, kindly upload your proof of payment on the portal or contact the accounts office.</p>
                      <br>
                      <p>Best regards,<br><strong>${settings.school_name || 'School Administration'}</strong></p>
                    </div>
                  `
                };
                
                try {
                  await transporter.sendMail(mailOptions);
                  sentCount++;
                } catch(e) {
                  errors.push(`Failed to send to ${parentEmail}`);
                }
              }
            }
          }
        }
        
        if (sentCount === 0 && errors.length === 0) {
           return res.json({ success: true, message: "No debtors found with linked parent emails." });
        }
        
        return res.json({ 
          success: true, 
          message: `Successfully sent ${sentCount} reminders.${errors.length > 0 ? ' (' + errors.length + ' failed)' : ''}` 
        });

      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },
    
    adminDeleteFeeStructure: async (req, res) => {
      try {
        const { feeId } = req.body;
        await db.collection("feeStructure").doc(feeId).delete();
        return res.json({ success: true, message: "Fee structure deleted." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    // ==========================================
    // MISSING PRINCIPAL / VP ENDPOINTS
    // ==========================================
    
    adminGetLessonPlans: async (req, res) => {
      try {
        const { term, session, section } = req.body;
        let query = db.collection("lessonPlans");
        if(term) query = query.where("term", "==", term);
        if(session) query = query.where("session", "==", session);
        
        const snap = await query.get();
        let plans = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (section && section !== "both") {
          // Fetch teachers for the requested section to filter plans
          const usersSnap = await db.collection("users").get();
          const allowedTeacherIds = new Set();
          usersSnap.forEach(doc => {
            const d = doc.data();
            const sec = (d.section || "").toLowerCase();
            if (sec === section || sec === "both") {
              allowedTeacherIds.add(doc.id);
            }
          });
          plans = plans.filter(p => allowedTeacherIds.has(p.teacherId));
        }

        return res.json({ success: true, data: plans });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },
    
    adminApprovePlan: async (req, res) => {
      try {
        const { planId, note } = req.body;
        await db.collection("lessonPlans").doc(planId).update({ status: "Approved", reviewNote: note || "" });
        return res.json({ success: true, message: "Plan approved." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminRejectPlan: async (req, res) => {
      try {
        const { planId, note } = req.body;
        await db.collection("lessonPlans").doc(planId).update({ status: "Rejected", reviewNote: note || "" });
        return res.json({ success: true, message: "Plan rejected." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },
    
    adminSetPromotionStatus: async (req, res) => {
      try {
        const { studentId, session, status } = req.body;
        if (!studentId || !session) {
          return res.json({ success: false, message: "Student ID and Session are required." });
        }
        
        await db.collection("students").doc(studentId).update({
          promotionStatus: status || "",
          promotionSession: session
        });
        
        return res.json({ success: true, message: "Promotion status updated successfully." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminGetStudentResultPDF: async (req, res) => {
      try {
        const { studentId, term, session, rptType } = req.body;
        
        // Fetch student
        const studentDoc = await db.collection("students").doc(studentId).get();
        if(!studentDoc.exists) return res.json({ success: false, message: "Student not found" });
        const student = studentDoc.data();
        
        // Fetch scores
        const scoresSnap = await db.collection("assessments").where("studentId", "==", studentId).where("term", "==", term).where("session", "==", session).get();
        const scores = scoresSnap.docs.map(d => d.data());
        
        // Mock summary
        let totalScore = 0;
        scores.forEach(s => totalScore += Number(s.total || s.termTotal || 0));
        let average = scores.length ? (totalScore / scores.length).toFixed(1) : 0;
        
        // Fetch Psychomotor / Behavioural traits
        let psychomotor = {};
        const psySnap = await db.collection("psychomotorRecords").where("studentId", "==", studentId).where("term", "==", term).where("session", "==", session).limit(1).get();
        if (!psySnap.empty) {
          psychomotor = psySnap.docs[0].data();
        }
        
        let reportData = {
          student: student,
          scores: scores,
          summary: { average: average, overallGrade: average >= 50 ? 'P' : 'F' },
          term: term,
          session: session,
          psychomotor: psychomotor
        };
        
        const pdfGenerator = require("./pdf");
        const { enrichReportData } = require("./reportUtil");
        const cfgDoc = await db.collection("settings").doc("global").get();
        const cfg = cfgDoc.exists ? cfgDoc.data() : { schoolName: "MySchool Portal" };
        
        await enrichReportData(db, reportData, cfg);
        
        const html = pdfGenerator.generateStudentReportHTML(reportData, cfg);
        const dataUri = "data:text/html;charset=utf-8," + encodeURIComponent(html);
        
        return res.json({ success: true, previewUrl: dataUri, downloadUrl: dataUri });
      } catch(err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminGenerateTranscript: async (req, res) => {
      try {
        const { studentId } = req.body;
        
        // Fetch student
        const studentDoc = await db.collection("students").doc(studentId).get();
        if(!studentDoc.exists) return res.json({ success: false, message: "Student not found" });
        const student = studentDoc.data();
        
        // Fetch ALL scores for this student
        const scoresSnap = await db.collection("assessments").where("studentId", "==", studentId).get();
        const allScores = scoresSnap.docs.map(d => d.data());
        
        // Group by Session and Term
        let grouped = {};
        allScores.forEach(s => {
           let session = s.session || 'Unknown Session';
           let term = s.term || 'Unknown Term';
           let key = session + '_' + term;
           if (!grouped[key]) {
               grouped[key] = {
                   session: session,
                   term: term,
                   className: s.className || student.className || '',
                   scores: []
               };
           }
           grouped[key].scores.push(s);
        });
        
        // Convert to array and sort (simple string sort works well for "2023/2024_First Term")
        let termData = Object.values(grouped);
        termData.sort((a,b) => {
           if(a.session !== b.session) return a.session.localeCompare(b.session);
           
           // Sort terms chronologically
           const termOrder = { "First Term": 1, "Second Term": 2, "Third Term": 3 };
           const orderA = termOrder[a.term] || 99;
           const orderB = termOrder[b.term] || 99;
           return orderA - orderB;
        });
        
        const pdfGenerator = require("./pdf");
        const cfgDoc = await db.collection("settings").doc("global").get();
        const cfg = cfgDoc.exists ? cfgDoc.data() : { schoolName: "MySchool Portal" };
        
        const html = pdfGenerator.generateTranscriptHTML(student, termData, cfg);
        const dataUri = "data:text/html;charset=utf-8," + encodeURIComponent(html);
        
        return res.json({ success: true, previewUrl: dataUri });
      } catch(err) {
        return res.json({ success: false, message: err.message });
      }
    },

    // =============================================================
    // PARENT SELF-REGISTRATION INVITE SYSTEM
    // =============================================================

    adminGenerateParentInvite: async (req, res) => {
      try {
        const { linkedStudentIds } = req.body;
        const token = uuidv4();
        const now = new Date();
        const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours

        // Fetch school name for the invite
        const cfgDoc = await db.collection("settings").doc("global").get();
        const cfg = cfgDoc.exists ? cfgDoc.data() : {};
        const schoolName = cfg.school_name || cfg.schoolName || "MySchool Cloud";

        const inviteData = {
          token,
          schoolName,
          createdBy: req.session ? req.session.userId : "admin",
          createdByName: req.session ? req.session.fullName : "Admin",
          createdAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          status: "pending",
          linkedStudentIds: linkedStudentIds || []
        };

        await db.collection("parent_invites").doc(token).set(inviteData);

        return res.json({ success: true, token, schoolName, expiresAt: expiresAt.toISOString() });
      } catch (err) {
        return res.json({ success: false, message: "Error generating invite: " + err.message });
      }
    },

    adminGetParentInvites: async (req, res) => {
      try {
        const snap = await db.collection("parent_invites")
          .orderBy("createdAt", "desc")
          .limit(50)
          .get();

        const invites = [];
        const now = new Date();
        snap.forEach(doc => {
          const d = doc.data();
          // Auto-mark expired invites for display
          const effectiveStatus = d.status === "pending" && new Date(d.expiresAt) < now
            ? "expired"
            : d.status;
          invites.push({ id: doc.id, ...d, effectiveStatus });
        });

        return res.json({ success: true, data: invites });
      } catch (err) {
        return res.json({ success: false, message: "Error fetching invites: " + err.message });
      }
    },

    adminRevokeParentInvite: async (req, res) => {
      const { token } = req.body;
      if (!token) return res.json({ success: false, message: "Token required." });
      try {
        await db.collection("parent_invites").doc(token).update({ status: "revoked" });
        return res.json({ success: true, message: "Invite revoked successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error revoking invite: " + err.message });
      }
    },

    adminToggleStudentLockOverride: async (req, res) => {
      const { studentId, lockOverride } = req.body;
      if (!studentId) return res.json({ success: false, message: "Student ID required." });
      try {
        await db.collection("students").doc(studentId).update({ lockOverride: !!lockOverride });
        
        await db.collection("audit_logs").add({
          timestamp: new Date().toISOString(),
          userId: req.session.userId,
          userName: req.session.fullName || 'Admin',
          action: "TOGGLE_LOCK_OVERRIDE",
          details: `Set finance lock override to ${!!lockOverride} for student ${studentId}.`
        });
        
        return res.json({ success: true, message: "Lock override toggled successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error toggling lock override: " + err.message });
      }
    },

    adminSetStudentDiscount: async (req, res) => {
      const { studentId, discountConfig } = req.body;
      if (!studentId || !discountConfig) return res.json({ success: false, message: "Student ID and config required." });
      try {
        // Save discount config to student profile
        await db.collection("students").doc(studentId).update({ discountConfig });

        // Also recalculate & update any existing bills for this student
        const billsSnap = await db.collection("bills").where("studentId", "==", studentId).get();
        if (!billsSnap.empty) {
          const batch = db.batch();
          for (const billDoc of billsSnap.docs) {
            const bill = billDoc.data();
            // Fetch fee structure to get lineItems for percentage calc
            let lineItems = [];
            const feeSnap = await db.collection("feeStructure")
              .where("className", "==", bill.className)
              .where("term", "==", bill.term)
              .where("session", "==", bill.session)
              .limit(1).get();
            if (!feeSnap.empty) {
              const feeData = feeSnap.docs[0].data();
              try { lineItems = typeof feeData.lineItems === 'string' ? JSON.parse(feeData.lineItems) : (feeData.lineItems || []); } catch(e){}
            }

            // Determine original (pre-discount) fee total using best available source
            // Priority: 1) originalFeeTotal stored on bill, 2) fee structure totalFee, 3) reconstruct from totalBilled + existing discount
            let feeTotal = 0;
            if (!feeSnap.empty) {
              const feeData = feeSnap.docs[0].data();
              feeTotal = parseFloat(feeData.totalFee) || parseFloat(feeData.totalAmount) || 0;
            }
            if (bill.originalFeeTotal && parseFloat(bill.originalFeeTotal) > 0) {
              feeTotal = parseFloat(bill.originalFeeTotal);
            } else if (feeTotal === 0) {
              // Reconstruct from existing stored values (totalBilled was post-discount, so add back old discount)
              feeTotal = (parseFloat(bill.totalBilled) || 0) + (parseFloat(bill.discountAmount) || 0);
            }

            let discountAmount = 0;
            if (discountConfig.type && discountConfig.type !== 'none') {
              if (discountConfig.type === 'fixed') {
                discountAmount = parseFloat(discountConfig.value) || 0;
              } else if (discountConfig.type === 'percentage') {
                const tuitionItem = lineItems.find(i => i.name && i.name.toLowerCase().includes('tuition'));
                const tuitionAmount = tuitionItem ? (parseFloat(tuitionItem.amount) || 0) : 0;
                discountAmount = (parseFloat(discountConfig.value) || 0) / 100 * tuitionAmount;
              }
            }

            const newTotal = Math.max(0, feeTotal - discountAmount);
            const totalPaid = parseFloat(bill.totalPaid) || 0;
            const newBalance = Math.max(0, newTotal - totalPaid);
            const newStatus = newBalance <= 0 ? 'Paid' : (totalPaid > 0 ? 'Partial' : 'Outstanding');

            batch.update(billDoc.ref, {
              totalBilled: newTotal,
              discountAmount,
              balance: newBalance,
              status: newStatus
            });
          }
          await batch.commit();
        }

        return res.json({ success: true, message: "Student discount applied and bills updated successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error setting discount: " + err.message });
      }
    },

    adminBulkCreateStudents: async (req, res) => {
      const students = req.body.students || req.body.data;
      if (!Array.isArray(students) || students.length === 0) {
        return res.json({ success: false, message: "No students provided." });
      }
      try {
        const settingsSnap = await db.collection("settings").doc("global").get();
        let prefix = "SCH";
        if (settingsSnap.exists) {
          const sData = settingsSnap.data();
          if (sData.school_prefix) {
            prefix = sData.school_prefix.trim().toUpperCase();
          } else if (sData.school_name) {
            prefix = sData.school_name.replace(/[^A-Za-z]/g, '').substring(0, 3).toUpperCase();
          }
        }
        if (!prefix || prefix.length === 0) prefix = "SCH";
        const year = String(new Date().getFullYear()).slice(-2);

        const numMissing = students.filter(s => !s.admissionNumber || s.admissionNumber.trim() === '').length;
        let currentSerial = 1;

        if (numMissing > 0) {
          const counterRef = db.collection("settings").doc("counters");
          currentSerial = await db.runTransaction(async (t) => {
            const doc = await t.get(counterRef);
            let nextVal = 1;
            if (doc.exists) nextVal = (doc.data().admission_serial || 0) + 1;
            t.set(counterRef, { admission_serial: nextVal + numMissing }, { merge: true });
            return nextVal;
          });
        }

        const chunks = [];
        for (let i = 0; i < students.length; i += 500) {
          chunks.push(students.slice(i, i + 500));
        }

        const createdAt = new Date().toISOString();
        for (const chunk of chunks) {
          const batch = db.batch();
          for (const st of chunk) {
            if (!st.admissionNumber || st.admissionNumber.trim() === '') {
              const serialStr = String(currentSerial++).padStart(4, '0');
              st.admissionNumber = `${prefix}/${year}/${serialStr}`;
            }
            st.status = "active";
            const docRef = db.collection("students").doc();
            batch.set(docRef, { ...st, createdAt });
          }
          await batch.commit();
        }

        return res.json({ success: true, message: `Successfully imported ${students.length} students.` });
      } catch (err) {
        return res.json({ success: false, message: "Bulk create error: " + err.message });
      }
    },

    adminBulkCreateClasses: async (req, res) => {
      const classes = req.body.classes || req.body.data;
      if (!Array.isArray(classes) || classes.length === 0) return res.json({ success: false, message: "No classes provided." });
      try {
        const chunks = [];
        for (let i = 0; i < classes.length; i += 500) chunks.push(classes.slice(i, i + 500));
        for (const chunk of chunks) {
          const batch = db.batch();
          for (const cl of chunk) {
            const docRef = db.collection("classes").doc();
            batch.set(docRef, cl);
          }
          await batch.commit();
        }
        return res.json({ success: true, message: `Successfully imported ${classes.length} classes.` });
      } catch (err) {
        return res.json({ success: false, message: "Bulk create error: " + err.message });
      }
    },

    adminBulkCreateSubjects: async (req, res) => {
      const subjects = req.body.subjects || req.body.data;
      if (!Array.isArray(subjects) || subjects.length === 0) return res.json({ success: false, message: "No subjects provided." });
      try {
        const chunks = [];
        for (let i = 0; i < subjects.length; i += 500) chunks.push(subjects.slice(i, i + 500));
        for (const chunk of chunks) {
          const batch = db.batch();
          for (const sub of chunk) {
            const docRef = db.collection("subjects").doc();
            batch.set(docRef, sub);
          }
          await batch.commit();
        }
        return res.json({ success: true, message: `Successfully imported ${subjects.length} subjects.` });
      } catch (err) {
        return res.json({ success: false, message: "Bulk create error: " + err.message });
      }
    },

    // ================================================
    // COMPLIANCE ENGINE — Finance Lock Configuration
    // ================================================
    adminGetComplianceRules: async (req, res) => {
      try {
        const doc = await db.collection("settings").doc("compliance_rules").get();
        return res.json({ success: true, data: doc.exists ? doc.data() : {
          cbt_lock_enabled: false,
          cbt_lock_threshold: 0.5,
          report_lock_enabled: false,
          report_lock_min_balance: 0,
          soft_lock_enabled: false,
          soft_lock_threshold: 0.5
        }});
      } catch(err) { return res.json({ success: false, message: err.message }); }
    },

    adminSetComplianceRules: async (req, res) => {
      try {
        const rules = req.body.rules;
        if (!rules) return res.json({ success: false, message: "Rules object required." });
        await db.collection("settings").doc("compliance_rules").set(rules, { merge: true });
        await db.collection("audit_logs").add({
          timestamp: new Date().toISOString(),
          userId: req.session.userId,
          userName: req.session.fullName || "Admin",
          action: "SET_COMPLIANCE_RULES",
          details: JSON.stringify(rules)
        });
        return res.json({ success: true, message: "Compliance rules updated." });
      } catch(err) { return res.json({ success: false, message: err.message }); }
    },

    adminGetEarlyBirdConfig: async (req, res) => {
      try {
        const doc = await db.collection("settings").doc("early_bird_config").get();
        return res.json({ success: true, data: doc.exists ? doc.data() : {
          enabled: false, days: 14, discountPercent: 3
        }});
      } catch(err) { return res.json({ success: false, message: err.message }); }
    },

    adminSetEarlyBirdConfig: async (req, res) => {
      try {
        const config = req.body.config;
        if (!config) return res.json({ success: false, message: "Config object required." });
        await db.collection("settings").doc("early_bird_config").set(config, { merge: true });
        await db.collection("audit_logs").add({
          timestamp: new Date().toISOString(),
          userId: req.session.userId,
          userName: req.session.fullName || "Admin",
          action: "SET_EARLY_BIRD_CONFIG",
          details: JSON.stringify(config)
        });
        return res.json({ success: true, message: "Early-bird config saved." });
      } catch(err) { return res.json({ success: false, message: err.message }); }
    },

    adminGetInstallmentPlans: async (req, res) => {
      try {
        const { status } = req.body;

        // Read section + campus from the logged-in officer's session
        const sessionCampusId = req.session.campusId || null;
        let sessionSection = (req.session.section || "both").toLowerCase();
        

        // Unified match filter — mirrors the pattern used throughout admin.js
        const matchFilter = (p) => {
          // Section isolation (primary vs high_school)
          if (sessionSection && sessionSection !== "both") {
            let planSec = (p.section || "both").toLowerCase();
            
            if (planSec !== sessionSection && planSec !== "both") return false;
          }
          // Campus isolation
          if (sessionCampusId) {
            if ((p.campusId || null) !== sessionCampusId) return false;
          }
          return true;
        };

        const snap = await db.collection("installment_plans").get();
        let plans = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(matchFilter);

        // Attach lockOverride from student docs
        const lockMap = {};
        
        // Fetch all students since it's simple
        const allStudentsSnap = await db.collection("students").get();
        allStudentsSnap.forEach(doc => {
           lockMap[doc.id] = !!(doc.data().lockOverride);
        });
        
        plans.forEach(p => {
           p.lockOverride = lockMap[p.studentId] || false;
        });

        if (status) plans = plans.filter(p => p.status === status);
        plans.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        return res.json({ success: true, data: plans });
      } catch(err) { return res.json({ success: false, message: err.message || "Failed to load installment plans." }); }
    },

    adminApproveInstallmentPlan: async (req, res) => {
      try {
        const { planId } = req.body;
        if (!planId) return res.json({ success: false, message: "Plan ID required." });
        const planRef = db.collection("installment_plans").doc(planId);
        const planSnap = await planRef.get();
        if (!planSnap.exists) return res.json({ success: false, message: "Plan not found." });
        const plan = planSnap.data();
        await planRef.update({ status: "approved", approvedAt: new Date().toISOString(), approvedBy: req.session.userId });
        await db.collection("notifications").add({
          targetUserId: plan.parentId,
          title: "Installment Plan Approved",
          message: `Your installment payment plan for ${plan.studentName || "your child"} (${plan.term}, ${plan.session}) has been approved.`,
          type: "FINANCE", isRead: false, createdAt: new Date().toISOString()
        });
        await db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "Admin", action: "APPROVE_INSTALLMENT_PLAN", details: `Approved plan ${planId}` });
        return res.json({ success: true, message: "Installment plan approved." });
      } catch(err) { return res.json({ success: false, message: err.message }); }
    },

    adminRejectInstallmentPlan: async (req, res) => {
      try {
        const { planId, reason } = req.body;
        if (!planId) return res.json({ success: false, message: "Plan ID required." });
        const planRef = db.collection("installment_plans").doc(planId);
        const planSnap = await planRef.get();
        if (!planSnap.exists) return res.json({ success: false, message: "Plan not found." });
        const plan = planSnap.data();
        await planRef.update({ status: "rejected", rejectedAt: new Date().toISOString(), rejectedBy: req.session.userId, rejectionReason: reason || "" });
        await db.collection("notifications").add({
          targetUserId: plan.parentId,
          title: "Installment Plan Not Approved",
          message: `Your installment plan for ${plan.studentName || "your child"} was not approved. ${reason ? "Reason: " + reason : "Please contact the accounts office."}`,
          type: "FINANCE", isRead: false, createdAt: new Date().toISOString()
        });
        await db.collection("audit_logs").add({ timestamp: new Date().toISOString(), userId: req.session.userId, userName: req.session.fullName || "Admin", action: "REJECT_INSTALLMENT_PLAN", details: `Rejected plan ${planId}. Reason: ${reason || "N/A"}` });
        return res.json({ success: true, message: "Plan rejected." });
      } catch(err) { return res.json({ success: false, message: err.message }); }
    },

    adminGetStoreItems: async (req, res) => {
      try {
        const { section } = req.body;
        let query = db.collection("store_items");
        if (section && section !== "both" && section !== "") {
          query = query.where("section", "in", [section, "both", ""]);
        }
        const snap = await query.get();
        const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.json({ success: true, data: items });
      } catch (e) {
        console.error("adminGetStoreItems Error:", e);
        return res.json({ success: false, message: e.message });
      }
    },

    adminCreateStoreOrder: async (req, res) => {
      try {
        const { data } = req.body; // { studentId, studentName, itemId, itemName, quantity, amountPaid, paymentMethod }
        if (!data.studentId || !data.itemId || !data.quantity) {
          return res.json({ success: false, message: "Missing required fields." });
        }
        
        await db.collection("store_orders").add({
           studentId: data.studentId,
           studentName: data.studentName,
           itemId: data.itemId,
           itemName: data.itemName,
           quantity: Number(data.quantity),
           amountPaid: Number(data.amountPaid || 0),
           paymentMethod: data.paymentMethod || "Cash",
           section: data.section || "both",
           status: "Paid",
           recordedBy: req.session.userId || req.session.name || "Accounts",
           createdAt: new Date().toISOString()
        });

        // Also add to audit logs or general payments if desired, for now just store_orders is enough
        // to trigger the storekeeper.
        await db.collection("audit_logs").add({ 
           timestamp: new Date().toISOString(), 
           userId: req.session.userId, 
           userName: req.session.fullName || "Accounts", 
           action: "RECORD_STORE_PAYMENT", 
           details: `Recorded store payment for ${data.studentName}: ${data.quantity}x ${data.itemName}` 
        });

        return res.json({ success: true, message: "Store payment recorded and forwarded to storekeeper." });
      } catch (e) {
        console.error("adminCreateStoreOrder Error:", e);
        return res.json({ success: false, message: e.message });
      }
    },

    adminGetTimetableConfig: async (req, res) => {
      try {
        const snap = await db.collection("settings").doc("timetable_config").get();
        if (!snap.exists) {
          return res.json({ success: true, data: { days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], periods: [] } });
        }
        return res.json({ success: true, data: snap.data() });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminSaveTimetableConfig: async (req, res) => {
      try {
        const { data } = req.body;
        await db.collection("settings").doc("timetable_config").set(data, { merge: true });
        return res.json({ success: true, message: "Timetable configuration saved." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminGenerateTimetable: async (req, res) => {
      try {
        const { classes, term, session, config } = req.body;
        if (!classes || !classes.length) return res.json({ success: false, message: "Missing parameter: classes" });
        if (!term) return res.json({ success: false, message: "Missing parameter: term" });
        if (!session) return res.json({ success: false, message: "Missing parameter: session" });
        if (!config) return res.json({ success: false, message: "Missing parameter: config" });
        
        const subjectsSnap = await db.collection("subjects").get();
        const allSubjects = subjectsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        const teacherBusySlots = {};
        const generatedTimetables = [];
        
        for (const className of classes) {
          const timetable = {
            className,
            term,
            session,
            schedule: {}, 
            updatedAt: new Date().toISOString()
          };
          
          const isPrimary = className.toLowerCase().includes("primary") || className.toLowerCase().includes("nursery") || className.toLowerCase().includes("creche") || className.toLowerCase().includes("basic") || className.toLowerCase().includes("playgroup") || className.toLowerCase().includes("year");
          
          let classSubjects = [];
          if (isPrimary) {
             classSubjects = allSubjects.filter(s => String(s.section).toLowerCase() === 'primary');
          } else {
             const studentsSnap = await db.collection("students").where("className", "==", className).get();
             const studentIds = studentsSnap.docs.map(d => d.id);
             if (studentIds.length > 0) {
               const enrollments = [];
               for(let i=0; i<studentIds.length; i+=30) {
                 const chunk = studentIds.slice(i, i+30);
                 const eSnap = await db.collection("student_subjects").where("studentId", "in", chunk).get();
                 eSnap.forEach(d => enrollments.push(d.data().subjectId));
               }
               const uniqueSubjectIds = [...new Set(enrollments)];
               classSubjects = allSubjects.filter(s => uniqueSubjectIds.includes(s.id));
             } else {
               classSubjects = [];
             }
          }
          
          if (classSubjects.length === 0) {
            generatedTimetables.push(timetable);
            continue;
          }
          
          for (let d = 0; d < config.days.length; d++) {
            const day = config.days[d];
            const dayPeriods = (config.scheduleTemplate && config.scheduleTemplate[day]) 
                                ? config.scheduleTemplate[day] 
                                : (config.periods || []);
            
            timetable.schedule[day] = new Array(dayPeriods.length).fill(null);
            
            for (let p = 0; p < dayPeriods.length; p++) {
               const periodConfig = dayPeriods[p];
               if (periodConfig.isBreak || periodConfig.type === 'Break' || periodConfig.type === 'Event') {
                 timetable.schedule[day][p] = { 
                    type: periodConfig.type || (periodConfig.isBreak ? "Break" : "Event"), 
                    label: periodConfig.customLabel || periodConfig.label || periodConfig.type || "Break" 
                 };
                 continue;
               }
               
               let assigned = false;
               const shuffledSubjects = [...classSubjects].sort(() => 0.5 - Math.random());
               
               for (const subject of shuffledSubjects) {
                 if (isPrimary) {
                   timetable.schedule[day][p] = { type: "Subject", subjectId: subject.id, subjectName: subject.subjectName };
                   assigned = true;
                   break;
                 } else {
                   const teacherId = subject.assignedTeacherId;
                   const timeKey = `${day}_${p}`;
                   
                   if (!teacherId || !teacherBusySlots[teacherId]) {
                      if(teacherId) teacherBusySlots[teacherId] = {};
                   }
                   
                   if (!teacherId || !teacherBusySlots[teacherId][timeKey]) {
                     timetable.schedule[day][p] = { type: "Subject", subjectId: subject.id, subjectName: subject.subjectName, teacherId };
                     if (teacherId) teacherBusySlots[teacherId][timeKey] = true;
                     assigned = true;
                     break;
                   }
                 }
               }
               
               if (!assigned) {
                 timetable.schedule[day][p] = { type: "Free", label: "Free Period" };
               }
            }
          }
          generatedTimetables.push(timetable);
        }
        
        const batch = db.batch();
        for (const tt of generatedTimetables) {
          const id = `${tt.className}_${tt.term}_${tt.session}`.replace(/[^a-zA-Z0-9_]/g, "_");
          const ref = db.collection("timetables").doc(id);
          batch.set(ref, tt);
        }
        await batch.commit();
        
        return res.json({ success: true, message: "Timetables generated successfully." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },


    adminClearTimetables: async (req, res) => {
      try {
        const { term, session, className } = req.body;
        if (!term || !session) {
          return res.json({ success: false, message: "Missing term or session." });
        }
        let query = db.collection("timetables").where("term", "==", term).where("session", "==", session);
        if (className) {
          query = query.where("className", "==", className);
        }
        const snap = await query.get();
        const batch = db.batch();
        snap.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        return res.json({ success: true, message: `Successfully cleared ${snap.docs.length} timetable(s).` });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },
    adminGetTimetables: async (req, res) => {
      try {
        const { term, session } = req.body;
        let query = db.collection("timetables");
        if (term) query = query.where("term", "==", term);
        if (session) query = query.where("session", "==", session);
        
        const snap = await query.get();
        const timetables = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.json({ success: true, data: timetables });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    adminSaveTimetable: async (req, res) => {
      try {
        const { data } = req.body;
        if (!data.className || !data.term || !data.session) {
          return res.json({ success: false, message: "Missing required fields." });
        }
        const id = `${data.className}_${data.term}_${data.session}`.replace(/[^a-zA-Z0-9_]/g, "_");
        data.updatedAt = new Date().toISOString();
        await db.collection("timetables").doc(id).set(data, { merge: true });
        return res.json({ success: true, message: "Timetable saved." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },
    
    adminCreateAnnouncement: async (req, res) => {
      try {
        const { data } = req.body;
        if (!data.subject || !data.message || !data.targetAudience) {
          return res.json({ success: false, message: "Missing required fields." });
        }
        data.createdAt = new Date().toISOString();
        const docRef = await db.collection("announcements").add(data);
        return res.json({ success: true, message: "Announcement sent successfully.", id: docRef.id });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },
    
    adminGetAnnouncements: async (req, res) => {
      try {
        const { section, campusId } = req.body;
        let query = db.collection("announcements");
        if (section && section !== "both") {
          query = query.where("section", "in", [section, "both", ""]);
        }
        if (campusId) {
          query = query.where("campusId", "in", [campusId, null, ""]);
        }
        const snap = await query.orderBy("createdAt", "desc").get();
        const announcements = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.json({ success: true, data: announcements });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },
    
    adminDeleteAnnouncement: async (req, res) => {
      try {
        const { announcementId } = req.body;
        if (!announcementId) return res.json({ success: false, message: "Missing announcement ID." });
        await db.collection("announcements").doc(announcementId).delete();
        return res.json({ success: true, message: "Announcement deleted." });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    }
  };
};
