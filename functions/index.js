const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const { getFirestore } = require("firebase-admin/firestore");

// Initialize Firebase Admin
admin.initializeApp();
const db = getFirestore();

// Initialize Express App
const app = express();

const allowedOrigins = [
  "https://resolute-92775.web.app",
  "https://resolute-92775.firebaseapp.com",
  "https://sample.myschoolportal.wuaze.com", 
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "https://victoryspring.aceportalhub.com",
  "http://victoryspring.aceportalhub.com",
  "https://vicspring.aceportalhub.com",
  "http://vicspring.aceportalhub.com"
];
app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS policy violation"), false);
  },
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Trust Firebase Cloud Run proxy for rate limiting
app.set('trust proxy', 1);

// Apply rate limiting to all requests
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window`
  standardHeaders: true, 
  legacyHeaders: false,
  message: { success: false, message: "Too many requests, please try again later." }
});
app.use("/api", apiLimiter);

// Import action handlers
const notificationsActions = require("./actions/notifications")(db);
const authActions = require("./actions/auth")(db);
const adminActions = require("./actions/admin")(db, notificationsActions);
const teacherActions = require("./actions/teacher")(db, notificationsActions);
const parentActions = require("./actions/parent")(db);
const studentActions = require("./actions/student")(db);
const storeActions = require("./actions/store")(db);
const sickbayActions = require("./actions/sickbay")(db, notificationsActions);

async function requireRole(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : req.body.token;
  const action = req.body.action;
  
  if (!token) return res.status(401).json({ success: false, message: "No token provided." });

  try {
    const sessionRef = db.collection("sessions").doc(token);
    const sessionDoc = await sessionRef.get();
    
    if (!sessionDoc.exists) {
      return res.status(401).json({ success: false, message: "Invalid or expired session. Please log in again." });
    }

    const session = sessionDoc.data();
    
    if (action) {
      const role = session.role;
      let isAllowed = false;

      const adminRoles = ["admin", "admin_assistant", "developer", "principal", "vp", "accounts", "headteacher"];
      const teacherRoles = ["teacher", "primary_teacher", "headteacher", "admin", "developer", "principal", "vp"];
      const parentRoles = ["parent", "admin", "developer"];
      const studentRoles = ["student"];
      const storeRoles = ["storekeeper", "admin", "developer", "principal"];
      const nurseRoles = ["nurse", "admin", "developer", "principal"];

      if (action.startsWith("admin")) {
        isAllowed = adminRoles.includes(role);
      } else if (action.startsWith("teacher")) {
        isAllowed = teacherRoles.includes(role);
      } else if (action.startsWith("parent")) {
        isAllowed = parentRoles.includes(role);
      } else if (action.startsWith("student") && action !== "studentLogin") {
        isAllowed = studentRoles.includes(role) || adminRoles.includes(role);
      } else if (action.startsWith("store")) {
        isAllowed = storeRoles.includes(role);
      } else if (action.startsWith("sickbay")) {
        isAllowed = nurseRoles.includes(role);
      } else {
        // Explicitly allow general authenticated actions
        const generalAuthActions = ["userUpdateProfile", "userChangePassword", "markNotificationRead", "getGradingSystems"];
        if (generalAuthActions.includes(action)) {
          isAllowed = true;
        }
      }

      if (!isAllowed) {
        return res.status(403).json({ success: false, message: `Forbidden: Access denied for action '${action}'.` });
      }
    }

    const created = new Date(session.createdAt);
    const hoursElapsed = (new Date() - created) / (1000 * 60 * 60);
    
    if (hoursElapsed > 8) {
      await sessionRef.delete();
      return res.status(401).json({ success: false, message: "Session expired. Please log in again." });
    }

    req.session = session;
    next();
  } catch (error) {
    console.error("Auth Middleware Error:", error);
    res.status(500).json({ success: false, message: "Authentication error." });
  }
}

// ============================================================
// API ROUTES
// ============================================================

app.get('/api/debug-subjects', async (req, res) => {
  try {
    const snap = await db.collection('subjects').get();
    const subs = [];
    snap.forEach(d => subs.push(d.data()));
    res.json(subs);
  } catch (e) {
    res.json({error: e.message});
  }
});
app.post("/api", async (req, res) => {
  let action = req.body.action;
  if (!action) return res.status(400).json({ success: false, message: "No action specified." });

  // Map alternative dashboard prefixes to the core 'admin' API endpoints
  if (action.startsWith("principal") || action.startsWith("accounts") || action.startsWith("vp")) {
    const base = action.startsWith("vp") ? action.substring(2) : (action.startsWith("accounts") ? action.substring(8) : action.substring(9));
    action = "admin" + base;
    req.body.action = action; // update it so the rest of the file (including requireRole) sees 'admin...'
  }

  // --- GAS Compatibility Shim ---
  // The frontend sends { action: "...", args: [...] }
  // We unpack args so our Express routes can read from req.body directly
  if (req.body.args && Array.isArray(req.body.args)) {
    const args = req.body.args;
    if (args.length > 0) {
      if (typeof args[0] === 'object' && !Array.isArray(args[0])) {
        Object.assign(req.body, args[0]);
        req.body.data = args[0]; // For admin/teacher save routes
      } else if (typeof args[0] === 'string') {
        // First positional argument is almost always the token
        req.body.token = args[0];
        
        // Positional mappings for specific auth routes
        if (action === "loginUser") { req.body.email = args[0]; req.body.password = args[1]; }
        if (action === "requestPasswordReset") { req.body.email = args[0]; }
        if (action === "userChangePassword") { req.body.token = args[0]; req.body.currentPassword = args[1]; req.body.oldPassword = args[1]; req.body.newPassword = args[2]; }
        if (action === "userUpdateProfile") { req.body.data = args[1]; }
        if (action === "markNotificationRead") { req.body.notificationId = args[0]; }
        
        // Positional mappings for other routes that pass more than just token
        if (action === "adminGetStats") { req.body.section = args[1]; req.body.campusId = args[2] || null; }
        if (action === "adminGetClasses") { req.body.section = args[1]; req.body.campusId = args[2] || null; }
        if (action === "adminGetAllStudents") { req.body.section = args[1]; req.body.campusId = args[2] || null; }
        if (action === "adminGetUsers") { req.body.section = args[1]; req.body.campusId = args[2] || null; }
        if (action === "adminGetSubjects") { req.body.section = args[1]; req.body.campusId = args[2] || null; }
        if (action === "adminGetComplianceSummary") { req.body.term = args[1]; req.body.session = args[2]; req.body.section = args[3]; req.body.campusId = args[4] || null; }
        if (action === "adminGetLessonPlans") { req.body.term = args[1]; req.body.session = args[2]; req.body.section = args[3]; req.body.campusId = args[4] || null; }
        if (action === "adminCreateUser") { req.body.data = args[1]; }
        if (action === "adminUpdateUser") { req.body.userId = args[1]; req.body.updates = args[2]; }
        if (action === "adminDeleteUser") { req.body.userId = args[1]; }
        
        if (action === "adminCreateStudent") { req.body.data = args[1]; }
        if (action === "adminUpdateStudent") { req.body.studentId = args[1]; req.body.updates = args[2]; }
        if (action === "adminDeleteStudent") { req.body.studentId = args[1]; }
        
        if (action === "adminCreateAnnouncement") { req.body.data = args[1]; }
        if (action === "adminGetAnnouncements") { req.body.section = args[1]; req.body.campusId = args[2] || null; }
        if (action === "adminDeleteAnnouncement") { req.body.announcementId = args[1]; }
        if (action === "parentGetAnnouncements") { /* no args */ }
        
        if (action === "adminCreateClass") { req.body.data = args[1]; }
        if (action === "adminUpdateClass") { req.body.classId = args[1]; req.body.updates = args[2]; }
        if (action === "adminDeleteClass") { req.body.classId = args[1]; }
        
        if (action === "adminCreateSubject") { req.body.data = args[1]; }
        if (action === "adminUpdateSubject") { req.body.subjectId = args[1]; req.body.updates = args[2]; }
        if (action === "adminDeleteSubject") { req.body.subjectId = args[1]; }

        if (action === "adminUpdateSettings") { req.body.data = args[1]; }
        if (action === "adminApprovePayment") { req.body.paymentId = args[1]; }
        if (action === "adminRejectPayment") { req.body.paymentId = args[1]; }
        if (action === "adminSaveFeeStructure") { req.body.data = args[1]; }
        if (action === "adminDeleteFeeStructure") { req.body.feeId = args[1]; }
        if (action === "adminGenerateBills") { req.body.term = args[1]; req.body.session = args[2]; req.body.classFilters = args[3]; }
        
        // Phase 2 Mappings
        if (action === "adminGetStudentSubjects") { req.body.studentId = args[1]; }
        if (action === "adminEnrollStudent") { req.body.studentId = args[1]; req.body.subjectId = args[2]; req.body.session = args[3]; req.body.term = args[4]; }
        if (action === "adminUnenrollStudent") { req.body.studentId = args[1]; req.body.subjectId = args[2]; req.body.session = args[3]; }
        if (action === "adminSaveGradingSystem") { req.body.data = args[1]; }
        if (action === "adminDeleteGradingSystem") { req.body.systemId = args[1]; }
        if (action === "adminGenerateBulkResult") { req.body.className = args[1]; req.body.term = args[2]; req.body.session = args[3]; req.body.rptType = args[4]; }

        // Phase 3 Mappings
        if (action === "adminResetUserPassword") { req.body.userId = args[1]; }
        if (action === "adminImpersonateUser") { req.body.userId = args[1]; }
        if (action === "adminGenerateIDCard") { req.body.studentId = args[1]; }
        if (action === "adminBulkCreateStudents") { req.body.students = args[1]; }
        if (action === "adminBulkCreateClasses") { req.body.classes = args[1]; }
        if (action === "adminToggleStudentLockOverride") { req.body.studentId = args[1]; req.body.lockOverride = args[2]; }
        if (action === "adminSetStudentDiscount") { req.body.studentId = args[1]; req.body.discountConfig = args[2]; }
        if (action === "adminBulkCreateSubjects") { req.body.subjects = args[1]; }
        if (action === "adminApproveTask") { req.body.taskId = args[1]; }
        if (action === "adminRejectTask") { req.body.taskId = args[1]; req.body.note = args[2]; }
        if (action === "adminProcessPasswordReset") { req.body.requestId = args[1]; req.body.newPassword = args[2]; }
        if (action === "adminGetStudentResultPDF") { req.body.studentId = args[1]; req.body.term = args[2]; req.body.session = args[3]; req.body.rptType = args[4]; }
        if (action === "adminGenerateTranscript") { req.body.studentId = args[1]; }
        if (action === "adminSetPromotionStatus") { req.body.studentId = args[1]; req.body.session = args[2]; req.body.status = args[3]; }
        if (action === "teacherGenerateLessonPlanPDF") { req.body.planId = args[1]; }
        
        // Additional Accounts Mappings
        if (action === "adminGetFinancialStats") { req.body.term = args[1]; req.body.session = args[2]; req.body.section = args[3]; req.body.campusId = args[4] || null; }
        if (action === "adminGetDebtors") { req.body.term = args[1]; req.body.session = args[2]; req.body.section = args[3]; req.body.campusId = args[4] || null; }
        if (action === "adminGetBroadsheetData") { req.body.className = args[1]; req.body.term = args[2]; req.body.session = args[3]; }
        if (action === "adminGetBills") { req.body.filters = args[1]; }
        if (action === "adminRecordPayment") { req.body.data = args[1]; }
        if (action === "adminGetStudentLedger") { req.body.studentId = args[1]; }
        if (action === "adminDownloadLedgerPDF") { req.body.studentId = args[1]; req.body.startDate = args[2]; req.body.endDate = args[3]; }
        if (action === "adminDownloadBillInvoice") { req.body.billId = args[1]; }
        if (action === "adminGetSchoolPerformance") { req.body.term = args[1]; req.body.session = args[2]; req.body.section = args[3]; req.body.campusId = args[4] || null; }
        if (action === "adminGetSchoolPerformanceAnalytics") { req.body.term = args[1]; req.body.session = args[2]; req.body.section = args[3]; req.body.campusId = args[4] || null; }
        if (action === "adminGetYearGroupRanking") { req.body.term = args[1]; req.body.session = args[2]; req.body.yearGroup = args[3]; }
        if (action === "adminGenerateReceipt") { req.body.paymentId = args[1]; }
        if (action === "adminManageCampuses") { req.body.campuses = args[1]; }
        if (action === "adminGetStoreItems") { req.body.section = args[1] || null; }
        if (action === "adminCreateStoreOrder") { req.body.data = args[1]; }
        
        // Teacher Subject Assignment Mappings
        if (action === "teacherGetStudentSubjects") { req.body.studentId = args[1]; }
        if (action === "teacherEnrollStudent") { req.body.studentId = args[1]; req.body.subjectId = args[2]; req.body.session = args[3]; req.body.term = args[4]; }
        if (action === "teacherUnenrollStudent") { req.body.studentId = args[1]; req.body.subjectId = args[2]; }
        if (action === "adminRecordExpense") { req.body.data = args[1]; }
        if (action === "adminDeleteExpense") { req.body.expenseId = args[1]; }
        if (action === "adminDeleteBill") { req.body.billId = args[1]; }
        if (action === "adminSendReminders") { req.body.term = args[1]; req.body.session = args[2]; req.body.batchSize = args[3]; }
        if (action === "adminGetSubjects") { /* no args */ }
        if (action === "adminGetTimetableConfig") { /* no args */ }
        if (action === "adminSaveTimetableConfig") { req.body.data = args[1]; }
        if (action === "adminGenerateTimetable") { req.body.classes = args[1]; req.body.term = args[2]; req.body.session = args[3]; req.body.config = args[4]; }
        if (action === "adminGetTimetables") { req.body.term = args[1]; req.body.session = args[2]; }
        if (action === "adminClearTimetables") { req.body.term = args[1]; req.body.session = args[2]; req.body.className = args[3]; }

        if (action === "adminSaveTimetable") { req.body.data = args[1]; }
        if (action === "adminSetComplianceRules") { req.body.rules = args[1]; }
        if (action === "adminSetEarlyBirdConfig") { req.body.config = args[1]; }
        if (action === "adminGetInstallmentPlans") { req.body.status = args[1] || null; }
        if (action === "adminApproveInstallmentPlan") { req.body.planId = args[1]; }
        if (action === "adminRejectInstallmentPlan") { req.body.planId = args[1]; req.body.reason = args[2]; }
        if (action === "parentRequestInstallmentPlan") { req.body.studentId = args[1]; req.body.billId = args[2]; req.body.term = args[3]; req.body.session = args[4]; req.body.milestones = args[5]; }
        if (action === "parentGetInstallmentPlan") { req.body.studentId = args[1]; }
        
        if (action === "teacherGetMySubjects") { req.body.userId = args[1]; }
        if (action === "teacherGetClassStudents") { req.body.className = args[1]; }
        if (action === "teacherGetScores") { req.body.filters = args[1]; }
        if (action === "teacherSaveScore") { req.body.scoreId = args[1]; req.body.studentId = args[2]; req.body.className = args[3]; req.body.subject = args[4]; req.body.term = args[5]; req.body.session = args[6]; req.body.ca1 = args[7]; req.body.ca2 = args[8]; req.body.exam = args[9]; }
        if (action === "teacherBulkSaveScores") { req.body.data = args[1]; } // fixed mapping
        
        if (action === "teacherGetPsychomotor") { req.body.studentId = args[1]; req.body.term = args[2]; req.body.session = args[3]; }
        if (action === "teacherGetAffective") { req.body.studentId = args[1]; req.body.term = args[2]; req.body.session = args[3]; }
        if (action === "teacherSavePsychomotor") { req.body.data = args[1]; }
        if (action === "teacherSaveAffective") { req.body.data = args[1]; }

        // Legacy Teacher Dashboard Aliases
        if (action === "teacherGetMyLessonPlans") { /* no args mapped to req.body needed, uses session */ }
        if (action === "principalGetAllStudents") { /* no args needed for adminGetStudents */ }
        if (action === "teacherGetAttendanceByDate") { req.body.className = args[1]; req.body.date = args[2]; }
        if (action === "teacherMarkAttendance") { req.body.className = args[1]; req.body.date = args[2]; req.body.records = args[3]; req.body.term = args[4]; req.body.session = args[5]; }
        if (action === "teacherSubmitScores") { /* mock success, usually frontend expects {success:true} */ }
        if (action === "teacherSubmitLessonPlan") { req.body.planId = args[1]; req.body.status = "submitted"; }
        if (action === "teacherGetSubjectStudents") { req.body.subjectId = args[1]; req.body.session = args[2]; req.body.term = args[3]; }
        if (action === "teacherGetSubjectAttendance") { Object.assign(req.body, args[1]); }
        if (action === "teacherSaveSubjectAttendance") { req.body.data = args[1]; Object.assign(req.body, args[1]); }
        if (action === "teacherGetClassSettings") { Object.assign(req.body, args[1] || {}); }
        if (action === "teacherSaveClassSettings") { Object.assign(req.body, args[1] || {}); }
        if (action === "adminGenerateBulkResult") { req.body.className = args[1]; req.body.term = args[2]; req.body.session = args[3]; req.body.reportType = args[4]; }
        if (action === "principalGetStudentResultPDF") { req.body.studentId = args[1]; req.body.term = args[2]; req.body.session = args[3]; req.body.reportType = args[4]; }

        // Parent Mappings
        if (action === "parentGenerateIDCard") { req.body.studentId = args[1]; }
        if (action === "parentDownloadReport") { req.body.studentId = args[1]; req.body.term = args[2]; req.body.session = args[3]; req.body.reportType = args[4]; }
        if (action === "parentGetStudentCredit") { req.body.studentId = args[1]; }
        if (action === "parentGetBills") { req.body.studentId = args[1]; }
        if (action === "parentGetPayments") { req.body.studentId = args[1]; }
        if (action === "parentSubmitPaymentData") { req.body.data = args[1]; }
        if (action === "parentDownloadReceipt") { req.body.paymentId = args[1]; }
        
        // Parent Invite Mappings
        if (action === "adminGenerateParentInvite") { req.body.linkedStudentIds = args[1]; }
        if (action === "adminRevokeParentInvite") { req.body.token = args[1]; }
        if (action === "validateParentInvite") { req.body.token = args[0]; }
        if (action === "parentSelfRegister") { req.body.token = args[0]; req.body.fullName = args[1]; req.body.email = args[2]; req.body.password = args[3]; req.body.phone = args[4]; }

        // Student Portal Mappings
        if (action === "studentLogin") { req.body.admissionNumber = args[0]; req.body.password = args[1]; }
        if (action === "studentChangePassword") { req.body.currentPassword = args[1]; req.body.newPassword = args[2]; }
        if (action === "studentResetPassword") { req.body.studentId = args[1]; }
        if (action === "studentGetNoteFile") { req.body.noteId = args[1]; }
        if (action === "studentStartQuiz") { req.body.quizId = args[1]; }
        if (action === "studentSubmitQuiz") { req.body.attemptId = args[1]; req.body.answers = args[2]; }
        if (action === "studentSaveQuizProgress") { req.body.attemptId = args[1]; req.body.answers = args[2]; req.body.remainingSeconds = args[3]; }

        // Teacher Content Mappings
        if (action === "teacherSaveAssignment") { req.body.data = args[1]; }
        if (action === "teacherDeleteAssignment") { req.body.assignmentId = args[1]; }
        if (action === "teacherSaveNote") { req.body.data = args[1]; }
        if (action === "teacherDeleteNote") { req.body.noteId = args[1]; }
        if (action === "teacherSaveQuiz") { req.body.data = args[1]; }
        if (action === "teacherSaveQuestions") { req.body.quizId = args[1]; req.body.questions = args[2]; }
        if (action === "teacherGetQuizQuestions") { req.body.quizId = args[1]; }
        if (action === "teacherDeleteQuiz") { req.body.quizId = args[1]; }
        if (action === "teacherGetQuizResults") { req.body.quizId = args[1]; }
        if (action === "teacherPublishQuiz") { req.body.quizId = args[1]; req.body.publish = args[2]; }

        // Store Mappings
        if (action === "storeGetInventory") { req.body.section = args[1] || null; }
        if (action === "storeReceiveItem") { req.body.data = args[1]; }
        if (action === "storeEditItem") { req.body.data = args[1]; }
        if (action === "storeDeleteItem") { req.body.itemId = args[1].itemId; }
        if (action === "storeIssueItem") { req.body.data = args[1]; }
        if (action === "storeGetRecords") { req.body.section = args[1] || null; }
        if (action === "storeGetStudents") { req.body.section = args[1] || null; }
        if (action === "storeGetPaidItems") { req.body.section = args[1] || null; }

        // Sickbay Mappings
        if (action === "sickbayGetRecords") { /* no args */ }
        if (action === "sickbayAddRecord") { req.body.data = args[1]; }
        if (action === "sickbayGetStudents") { req.body.section = args[1] || null; req.body.campusId = args[2] || null; }
      }
    }
  }

  try {
    switch (action) {
      // --- AUTHENTICATION ACTIONS (No strict session required for all) ---
      case "getPublicBranding": return authActions.getPublicBranding(req, res);
      case "requestPasswordReset": return authActions.requestPasswordReset(req, res);
      case "loginUser": return authActions.loginUser(req, res);
      case "getCurrentUser": return authActions.getCurrentUser(req, res);
      case "logoutUser": return authActions.logoutUser(req, res);
      
      // The following require a valid session, so we can manually run requireRole, 
      // or we can just apply it inside the switch block.
      // For Express, since everything hits `/api`, we'll invoke the middleware explicitly.
      case "userUpdateProfile":
        return requireRole(req, res, () => authActions.userUpdateProfile(req, res));
      case "userChangePassword":
        return requireRole(req, res, () => authActions.userChangePassword(req, res));
      case "getGradingSystems":
        return requireRole(req, res, () => adminActions.adminGetGradingSystems(req, res));

      // --- ADMIN ACTIONS ---
      case "adminGetStats":
        return requireRole(req, res, () => adminActions.adminGetStats(req, res));
      case "adminGetUsers":
        return requireRole(req, res, () => adminActions.adminGetUsers(req, res));
      case "adminCreateUser":
        return requireRole(req, res, () => adminActions.adminCreateUser(req, res));
      case "adminUpdateUser":
        return requireRole(req, res, () => adminActions.adminUpdateUser(req, res));
      case "adminDeleteUser":
        return requireRole(req, res, () => adminActions.adminDeleteUser(req, res));
      
      case "adminGetStudents":
        return requireRole(req, res, () => adminActions.adminGetStudents(req, res));
      case "adminCreateStudent":
        return requireRole(req, res, () => adminActions.adminCreateStudent(req, res));
      case "adminUpdateStudent":
        return requireRole(req, res, () => adminActions.adminUpdateStudent(req, res));
      case "adminDeleteStudent":
        return requireRole(req, res, () => adminActions.adminDeleteStudent(req, res));
      case "adminToggleStudentLockOverride":
        return requireRole(req, res, () => adminActions.adminToggleStudentLockOverride(req, res));
      case "adminSetStudentDiscount":
        return requireRole(req, res, () => adminActions.adminSetStudentDiscount(req, res));
        
      case "adminGetSettings":
        return requireRole(req, res, () => adminActions.adminGetSettings(req, res));
      case "adminUpdateSettings":
        return requireRole(req, res, () => adminActions.adminUpdateSettings(req, res));
      case "adminManageCampuses":
        return requireRole(req, res, () => adminActions.adminManageCampuses(req, res));

      case "adminGetClasses":
        return requireRole(req, res, () => adminActions.adminGetClasses(req, res));
      case "adminCreateClass":
        return requireRole(req, res, () => adminActions.adminCreateClass(req, res));
      case "adminUpdateClass":
        return requireRole(req, res, () => adminActions.adminUpdateClass(req, res));
      case "adminDeleteClass":
        return requireRole(req, res, () => adminActions.adminDeleteClass(req, res));

      case "adminGetSubjects":
        return requireRole(req, res, () => adminActions.adminGetSubjects(req, res));
      case "adminCreateSubject":
        return requireRole(req, res, () => adminActions.adminCreateSubject(req, res));
      case "adminUpdateSubject":
        return requireRole(req, res, () => adminActions.adminUpdateSubject(req, res));
      case "adminDeleteSubject":
        return requireRole(req, res, () => adminActions.adminDeleteSubject(req, res));
        
      case "adminCreateAnnouncement":
        return requireRole(req, res, () => adminActions.adminCreateAnnouncement(req, res));
      case "adminGetAnnouncements":
        return requireRole(req, res, () => adminActions.adminGetAnnouncements(req, res));
      case "adminDeleteAnnouncement":
        return requireRole(req, res, () => adminActions.adminDeleteAnnouncement(req, res));

      // --- SECONDARY ADMIN ACTIONS ---
      case "adminGetTimetableConfig": return requireRole(req, res, () => adminActions.adminGetTimetableConfig(req, res));
      case "adminSaveTimetableConfig": return requireRole(req, res, () => adminActions.adminSaveTimetableConfig(req, res));
      case "adminGenerateTimetable": return requireRole(req, res, () => adminActions.adminGenerateTimetable(req, res));
      case "adminGetTimetables": return requireRole(req, res, () => adminActions.adminGetTimetables(req, res));
      case "adminClearTimetables": return requireRole(req, res, () => adminActions.adminClearTimetables(req, res));

      case "adminSaveTimetable": return requireRole(req, res, () => adminActions.adminSaveTimetable(req, res));
      case "adminGetAuditLogs": return requireRole(req, res, () => adminActions.adminGetAuditLogs(req, res));
      case "adminGetPasswordRequests": return requireRole(req, res, () => adminActions.adminGetPasswordRequests(req, res));
      case "adminGetPayments": return requireRole(req, res, () => adminActions.adminGetPayments(req, res));
      case "adminGetExpenses": return requireRole(req, res, () => adminActions.adminGetExpenses(req, res));
      case "adminGetPendingTasks": return requireRole(req, res, () => adminActions.adminGetPendingTasks(req, res));
      case "adminGetGradingSystems": return requireRole(req, res, () => adminActions.adminGetGradingSystems(req, res));
      case "adminGetStudentSubjects": return requireRole(req, res, () => adminActions.adminGetStudentSubjects(req, res));
      
      case "adminProcessPasswordReset": return requireRole(req, res, () => adminActions.adminProcessPasswordReset(req, res));
      case "adminResetUserPassword": return requireRole(req, res, () => adminActions.adminResetUserPassword(req, res));
      case "adminApprovePayment": return requireRole(req, res, () => adminActions.adminApprovePayment(req, res));
      case "adminRejectPayment": return requireRole(req, res, () => adminActions.adminRejectPayment(req, res));
      case "adminApproveTask": return requireRole(req, res, () => adminActions.adminApproveTask(req, res));
      case "adminRejectTask": return requireRole(req, res, () => adminActions.adminRejectTask(req, res));
      case "adminImpersonateUser": return requireRole(req, res, () => adminActions.adminImpersonateUser(req, res));
      case "adminGenerateIDCard": return requireRole(req, res, () => adminActions.adminGenerateIDCard(req, res));
      case "adminBulkCreateStudents": return requireRole(req, res, () => adminActions.adminBulkCreateStudents(req, res));
      case "adminBulkCreateClasses": return requireRole(req, res, () => adminActions.adminBulkCreateClasses(req, res));
      case "adminBulkCreateSubjects": return requireRole(req, res, () => adminActions.adminBulkCreateSubjects(req, res));
      case "adminEnrollStudent": return requireRole(req, res, () => adminActions.adminEnrollStudent(req, res));
      case "adminUnenrollStudent": return requireRole(req, res, () => adminActions.adminUnenrollStudent(req, res));
      case "adminSaveGradingSystem": return requireRole(req, res, () => adminActions.adminSaveGradingSystem(req, res));
      case "adminDeleteGradingSystem": return requireRole(req, res, () => adminActions.adminDeleteGradingSystem(req, res));
      case "adminGenerateBulkResult": return requireRole(req, res, () => adminActions.adminGenerateBulkResult(req, res));
      case "adminGenerateTranscript": return requireRole(req, res, () => adminActions.adminGenerateTranscript(req, res));
      case "adminGetBroadsheetData": return requireRole(req, res, () => adminActions.adminGetBroadsheetData(req, res));
      case "adminGetComplianceSummary": return requireRole(req, res, () => adminActions.adminGetComplianceSummary(req, res));
      case "adminGetSchoolPerformance":
      case "adminGetSchoolPerformanceAnalytics": return requireRole(req, res, () => adminActions.adminGetSchoolPerformanceAnalytics(req, res));
      case "adminGetYearGroupRanking": return requireRole(req, res, () => adminActions.adminGetYearGroupRanking(req, res));

      case "adminGetFeeStructures":
        return requireRole(req, res, () => adminActions.adminGetFeeStructures(req, res));
      case "adminSaveFeeStructure":
        return requireRole(req, res, () => adminActions.adminSaveFeeStructure(req, res));
      case "adminDeleteFeeStructure":
        return requireRole(req, res, () => adminActions.adminDeleteFeeStructure(req, res));
      case "adminGenerateBills":
        return requireRole(req, res, () => adminActions.adminGenerateBills(req, res));
      case "adminGetBills":
        return requireRole(req, res, () => adminActions.adminGetBills(req, res));
      case "adminDeleteBill":
        return requireRole(req, res, () => adminActions.adminDeleteBill(req, res));
      
      // New Accounts & Finance Endpoints
      case "adminGetFinancialStats":
        return requireRole(req, res, () => adminActions.adminGetFinancialStats(req, res));
      case "adminGetDebtors":
        return requireRole(req, res, () => adminActions.adminGetDebtors(req, res));
      case "adminRecordPayment":
        return requireRole(req, res, () => adminActions.adminRecordPayment(req, res));
      case "adminGetStudentLedger":
        return requireRole(req, res, () => adminActions.adminGetStudentLedger(req, res));
      case "adminDownloadLedgerPDF":
        return requireRole(req, res, () => adminActions.adminDownloadLedgerPDF(req, res));
      case "adminGenerateReceipt":
        return requireRole(req, res, () => adminActions.adminGenerateReceipt(req, res));
      case "adminRecordExpense":
        return requireRole(req, res, () => adminActions.adminRecordExpense(req, res));
      case "adminDeleteExpense":
        return requireRole(req, res, () => adminActions.adminDeleteExpense(req, res));
      case "adminSendReminders":
        return requireRole(req, res, () => adminActions.adminSendReminders(req, res));
      case "adminGetComplianceRules":
        return requireRole(req, res, () => adminActions.adminGetComplianceRules(req, res));
      case "adminSetComplianceRules":
        return requireRole(req, res, () => adminActions.adminSetComplianceRules(req, res));
      case "adminGetEarlyBirdConfig":
        return requireRole(req, res, () => adminActions.adminGetEarlyBirdConfig(req, res));
      case "adminSetEarlyBirdConfig":
        return requireRole(req, res, () => adminActions.adminSetEarlyBirdConfig(req, res));
      case "adminGetStoreItems":
        return requireRole(req, res, () => adminActions.adminGetStoreItems(req, res));
      case "adminCreateStoreOrder":
        return requireRole(req, res, () => adminActions.adminCreateStoreOrder(req, res));
      case "adminGetInstallmentPlans":
        return requireRole(req, res, () => adminActions.adminGetInstallmentPlans(req, res));
      case "adminApproveInstallmentPlan":
        return requireRole(req, res, () => adminActions.adminApproveInstallmentPlan(req, res));
      case "adminRejectInstallmentPlan":
        return requireRole(req, res, () => adminActions.adminRejectInstallmentPlan(req, res));
        
      // New Principal Endpoints
      case "adminGetLessonPlans":
        return requireRole(req, res, () => adminActions.adminGetLessonPlans(req, res));
      case "adminApprovePlan":
        return requireRole(req, res, () => adminActions.adminApprovePlan(req, res));
      case "adminRejectPlan":
        return requireRole(req, res, () => adminActions.adminRejectPlan(req, res));
      case "adminGetAllStudents":
        return requireRole(req, res, () => adminActions.adminGetStudents(req, res)); // Alias to existing
      case "adminGetStudentResultPDF":
        return requireRole(req, res, () => adminActions.adminGetStudentResultPDF(req, res));
      case "adminSetPromotionStatus":
        return requireRole(req, res, () => adminActions.adminSetPromotionStatus(req, res));
      case "teacherGenerateLessonPlanPDF":
        // Allow teachers and principals
        return requireRole(req, res, () => teacherActions.teacherGenerateLessonPlanPDF(req, res));

      // --- TEACHER ACTIONS ---
      case "teacherGetMySubjects":
        return requireRole(req, res, () => teacherActions.teacherGetMySubjects(req, res));
      case "teacherGetClassStudents":
        return requireRole(req, res, () => teacherActions.teacherGetClassStudents(req, res));
      case "teacherGetScores":
        return requireRole(req, res, () => teacherActions.teacherGetScores(req, res));
      case "teacherSaveScore":
        return requireRole(req, res, () => teacherActions.teacherSaveScore(req, res));
      case "teacherUpdateTrait": return requireRole(req, res, () => teacherActions.teacherUpdateTrait(req, res));
      case "teacherGetStudentCount": return requireRole(req, res, () => teacherActions.teacherGetStudentCount(req, res));
      case "teacherGetStudentSubjects": return requireRole(req, res, () => teacherActions.teacherGetStudentSubjects(req, res));
      case "teacherEnrollStudent": return requireRole(req, res, () => teacherActions.teacherEnrollStudent(req, res));
      case "teacherUnenrollStudent": return requireRole(req, res, () => teacherActions.teacherUnenrollStudent(req, res));
      case "teacherBulkSaveScores":
        return requireRole(req, res, () => teacherActions.teacherBulkSaveScores(req, res));
      case "teacherGetLessonPlans":
        return requireRole(req, res, () => teacherActions.teacherGetLessonPlans(req, res));
      case "teacherSaveLessonPlan":
        return requireRole(req, res, () => teacherActions.teacherSaveLessonPlan(req, res));
      case "teacherGetAttendance":
        return requireRole(req, res, () => teacherActions.teacherGetAttendance(req, res));
      case "teacherSaveAttendance":
        return requireRole(req, res, () => teacherActions.teacherSaveAttendance(req, res));
      case "teacherGetPsychomotor":
        return requireRole(req, res, () => teacherActions.teacherGetPsychomotor(req, res));
      case "teacherSavePsychomotor":
        return requireRole(req, res, () => teacherActions.teacherSavePsychomotor(req, res));
      case "teacherGetAffective":
        return requireRole(req, res, () => teacherActions.teacherGetAffective(req, res));
      case "teacherSaveAffective":
        return requireRole(req, res, () => teacherActions.teacherSaveAffective(req, res));
      case "teacherGetSubjectAttendance":
        return requireRole(req, res, () => teacherActions.teacherGetSubjectAttendance(req, res));
      case "teacherSaveSubjectAttendance":
        return requireRole(req, res, () => teacherActions.teacherSaveSubjectAttendance(req, res));
      case "teacherGetClassSettings":
        return requireRole(req, res, () => teacherActions.teacherGetClassSettings(req, res));
      case "teacherSaveClassSettings":
        return requireRole(req, res, () => teacherActions.teacherSaveClassSettings(req, res));
      
      // Legacy Aliases for Teacher UI
      case "teacherGetMyLessonPlans":
        return requireRole(req, res, () => teacherActions.teacherGetLessonPlans(req, res));
      case "teacherSubmitLessonPlan":
        // Maps to save with submitted status
        return requireRole(req, res, () => teacherActions.teacherSaveLessonPlan(req, res));
      case "teacherGetAttendanceByDate":
        return requireRole(req, res, () => teacherActions.teacherGetAttendance(req, res));
      case "teacherMarkAttendance":
        return requireRole(req, res, () => teacherActions.teacherSaveAttendance(req, res));
      case "teacherSubmitScores":
        // Mock success for submit scores button
        return res.json({ success: true, message: "Scores submitted successfully." });
      case "teacherGetSubjectStudents":
        return requireRole(req, res, () => teacherActions.teacherGetSubjectStudents(req, res));
      case "principalGetAllStudents":
        return requireRole(req, res, () => adminActions.adminGetStudents(req, res));
      case "adminGenerateBulkResult":
        return requireRole(req, res, () => adminActions.adminGenerateBulkResult(req, res));
      case "principalGetStudentResultPDF":
        // Mapped to parentDownloadReport logic internally but called by principal/teacher
        return requireRole(req, res, () => parentActions.parentDownloadReport(req, res));


      // --- PARENT ACTIONS ---
      case "parentGetChildren":
        return requireRole(req, res, () => parentActions.parentGetChildren(req, res));
      case "parentGetAnnouncements":
        return requireRole(req, res, () => parentActions.parentGetAnnouncements(req, res));
      case "parentGetReport":
        return requireRole(req, res, () => parentActions.parentGetReport(req, res));
      case "parentDownloadReport":
        return requireRole(req, res, () => parentActions.parentDownloadReport(req, res));
      case "parentGetBills":
        return requireRole(req, res, () => parentActions.parentGetBills(req, res));
      case "parentGetPayments":
        return requireRole(req, res, () => parentActions.parentGetPayments(req, res));
      case "parentGenerateIDCard":
        return requireRole(req, res, () => parentActions.parentGenerateIDCard(req, res));
      case "parentGetStudentCredit":
        return requireRole(req, res, () => parentActions.parentGetStudentCredit(req, res));
      case "parentSubmitPaymentData":
        return requireRole(req, res, () => parentActions.parentSubmitPaymentData(req, res));
      case "parentDownloadReceipt":
        return requireRole(req, res, () => parentActions.parentDownloadReceipt(req, res));
      case "parentRequestInstallmentPlan":
        return requireRole(req, res, () => parentActions.parentRequestInstallmentPlan(req, res));
      case "parentGetInstallmentPlan":
        return requireRole(req, res, () => parentActions.parentGetInstallmentPlan(req, res));

      // --- NOTIFICATIONS ACTIONS ---
      case "getNotifications":
        return requireRole(req, res, () => notificationsActions.getNotifications(req, res));
      case "markNotificationRead":
        return requireRole(req, res, () => notificationsActions.markNotificationRead(req, res));

      // --- PARENT INVITE ACTIONS ---
      case "adminGenerateParentInvite":
        return requireRole(req, res, () => adminActions.adminGenerateParentInvite(req, res));
      case "adminGetParentInvites":
        return requireRole(req, res, () => adminActions.adminGetParentInvites(req, res));
      case "adminRevokeParentInvite":
        return requireRole(req, res, () => adminActions.adminRevokeParentInvite(req, res));
      
      // Public (no session required) — parent self-registration
      case "validateParentInvite":
        return authActions.validateParentInvite(req, res);
      case "parentSelfRegister":
        return authActions.parentSelfRegister(req, res);
      
      // Public — student login (no prior session)
      case "studentLogin":
        return studentActions.studentLogin(req, res);

      // --- STUDENT PORTAL ACTIONS ---
      case "studentGetMyInfo":
        return requireRole(req, res, () => studentActions.studentGetMyInfo(req, res));
      case "studentChangePassword":
        return requireRole(req, res, () => studentActions.studentChangePassword(req, res));
      case "studentResetPassword":
        return requireRole(req, res, () => studentActions.studentResetPassword(req, res));
      case "studentGetAssignments":
        return requireRole(req, res, () => studentActions.studentGetAssignments(req, res));
      case "studentGetNotes":
        return requireRole(req, res, () => studentActions.studentGetNotes(req, res));
      case "studentGetNoteFile":
        return requireRole(req, res, () => studentActions.studentGetNoteFile(req, res));
      case "studentGetQuizzes":
        return requireRole(req, res, () => studentActions.studentGetQuizzes(req, res));
      case "studentStartQuiz":
        return requireRole(req, res, () => studentActions.studentStartQuiz(req, res));
      case "studentSubmitQuiz":
        return requireRole(req, res, () => studentActions.studentSubmitQuiz(req, res));
      case "studentSaveQuizProgress":
        return requireRole(req, res, () => studentActions.studentSaveQuizProgress(req, res));

      // --- TEACHER CONTENT ACTIONS ---
      case "teacherSaveAssignment":
        return requireRole(req, res, () => teacherActions.teacherSaveAssignment(req, res));
      case "teacherGetMyAssignments":
        return requireRole(req, res, () => teacherActions.teacherGetMyAssignments(req, res));
      case "teacherDeleteAssignment":
        return requireRole(req, res, () => teacherActions.teacherDeleteAssignment(req, res));
      case "teacherSaveNote":
        return requireRole(req, res, () => teacherActions.teacherSaveNote(req, res));
      case "teacherGetMyNotes":
        return requireRole(req, res, () => teacherActions.teacherGetMyNotes(req, res));
      case "teacherDeleteNote":
        return requireRole(req, res, () => teacherActions.teacherDeleteNote(req, res));
      case "teacherSaveQuiz":
        return requireRole(req, res, () => teacherActions.teacherSaveQuiz(req, res));
      case "teacherGetMyQuizzes":
        return requireRole(req, res, () => teacherActions.teacherGetMyQuizzes(req, res));
      case "teacherSaveQuestions":
        return requireRole(req, res, () => teacherActions.teacherSaveQuestions(req, res));
      case "teacherGetQuizQuestions":
        return requireRole(req, res, () => teacherActions.teacherGetQuizQuestions(req, res));
      case "teacherDeleteQuiz":
        return requireRole(req, res, () => teacherActions.teacherDeleteQuiz(req, res));
      case "teacherGetQuizResults":
        return requireRole(req, res, () => teacherActions.teacherGetQuizResults(req, res));
      case "teacherPublishQuiz":
        return requireRole(req, res, () => teacherActions.teacherPublishQuiz(req, res));

      // --- STORE ACTIONS ---
      case "storeGetInventory":
        return requireRole(req, res, () => storeActions.storeGetInventory(req, res));
      case "storeReceiveItem":
        return requireRole(req, res, () => storeActions.storeReceiveItem(req, res));
      case "storeEditItem":
        return requireRole(req, res, () => storeActions.storeEditItem(req, res));
      case "storeDeleteItem":
        return requireRole(req, res, () => storeActions.storeDeleteItem(req, res));
      case "storeIssueItem":
        return requireRole(req, res, () => storeActions.storeIssueItem(req, res));
      case "storeGetRecords":
        return requireRole(req, res, () => storeActions.storeGetRecords(req, res));
      case "storeGetStudents":
        return requireRole(req, res, () => storeActions.storeGetStudents(req, res));
      case "storeGetPaidItems":
        return requireRole(req, res, () => storeActions.storeGetPaidItems(req, res));

      // --- SICKBAY ACTIONS ---
      case "sickbayGetRecords":
        return requireRole(req, res, () => sickbayActions.getRecords(req, res));
      case "sickbayAddRecord":
        return requireRole(req, res, () => sickbayActions.addRecord(req, res));
      case "sickbayGetStudents":
        return requireRole(req, res, () => adminActions.adminGetStudents(req, res));

      // Add more routes here as we build chunks...

      default:
        return res.status(404).json({ success: false, message: "Action not implemented yet in Cloud Functions API." });
    }
  } catch (error) {
    console.error(`Error processing action ${action}:`, error);
    return res.status(500).json({ success: false, message: `Server Error: ${error.message}` });
  }
});

exports.api = functions.https.onRequest(app);

// Force deploy hash 7

// force deploy 2

// Force redeploy

// Force redeploy 2
