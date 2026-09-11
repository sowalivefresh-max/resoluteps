const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const bcrypt = require("bcrypt");

// --- UTILITY: Hash Password ---
function hashPassword(password, salt) {
  const hash = crypto.createHash("sha256");
  hash.update((salt || "") + String(password));
  return hash.digest("hex");
}

function generateSalt() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = function(db) {
  return {
    loginUser: async (req, res) => {
      const { email, password } = req.body;
      if (!email || !password) return res.json({ success: false, message: "Email and password required." });
      
      const usersSnapshot = await db.collection("users").where("email", "==", email.trim().toLowerCase()).get();
      if (usersSnapshot.empty) {
        return res.json({ success: false, message: "Invalid email or password." });
      }
      
      const userDoc = usersSnapshot.docs[0];
      const user = userDoc.data();
      
      let isMatch = false;
      if (user.passwordHash && (user.passwordHash.startsWith("$2b$") || user.passwordHash.startsWith("$2a$"))) {
        isMatch = await bcrypt.compare(String(password), user.passwordHash);
      } else {
        isMatch = hashPassword(password, user.salt || "") === user.passwordHash;
        // Upgrade to bcrypt silently if login succeeds
        if (isMatch) {
          const newHash = await bcrypt.hash(String(password), 10);
          await db.collection("users").doc(userDoc.id).update({
            passwordHash: newHash,
            salt: null
          });
        }
      }
      
      if (!isMatch) {
        return res.json({ success: false, message: "Invalid email or password." });
      }
      
      if (String(user.status).toLowerCase() !== "active") {
        return res.json({ success: false, message: "Account suspended." });
      }
      
      const token = uuidv4();
      await db.collection("sessions").doc(token).set({
        userId: userDoc.id,
        role: user.role,
        fullName: user.fullName,
        section: user.section || "both",
        campusId: user.campusId || null,
        createdAt: new Date().toISOString()
      });
      
      await db.collection("audit_logs").add({
        timestamp: new Date().toISOString(),
        userId: userDoc.id,
        userName: user.fullName,
        action: "LOGIN",
        details: `${user.fullName} logged in as ${user.role}`
      });
      
      return res.json({
        success: true,
        token: token,
        role: user.role,
        userName: user.fullName,
        userId: userDoc.id,
        section: user.section,
        campusId: user.campusId || null
      });
    },

    getCurrentUser: async (req, res) => {
      // Compat for old frontend that passes [token] as an array of strings
      const sessionToken = req.body.token || (req.body.args && req.body.args[0]);
      if (!sessionToken) return res.json({ success: false, message: "Not authenticated" });
      
      const sessDoc = await db.collection("sessions").doc(sessionToken).get();
      if (!sessDoc.exists) return res.json({ success: false, message: "Invalid session" });
      
      const sess = sessDoc.data();
      let collectionName = "users";
      if (sess.role === "student") collectionName = "students";
      
      const uDoc = await db.collection(collectionName).doc(sess.userId).get();
      if (!uDoc.exists) return res.json({ success: false, message: "User not found" });
      
      const settingsDoc = await db.collection("settings").doc("global").get();
      const settings = settingsDoc.exists ? settingsDoc.data() : { currentTerm: "1", currentSession: "2026/2027" };
      
      const userData = { id: uDoc.id, ...uDoc.data() };
      delete userData.passwordHash;
      delete userData.salt;

      // Dynamically attach classAssigned if the user is a class teacher
      if (sess.role === "teacher" || sess.role === "primary_teacher") {
        const classesSnap1 = await db.collection("classes").where("classTeacherId", "==", uDoc.id).get();
        const classesSnap2 = await db.collection("classes").where("classTeacherIds", "array-contains", uDoc.id).get();
        
        const allDocs = [...classesSnap1.docs, ...classesSnap2.docs];
        // Remove duplicates by doc.id
        const uniqueDocsMap = new Map();
        allDocs.forEach(d => uniqueDocsMap.set(d.id, d));
        const uniqueDocs = Array.from(uniqueDocsMap.values());

        if (uniqueDocs.length > 0) {
          userData.classAssigned = uniqueDocs[0].data().className;
          userData.classesAssigned = uniqueDocs.map(d => d.data().className);
          userData.isClassTeacher = true;
        }
      }
      
      return res.json({
        success: true,
        user: userData,
        role: sess.role,
        settings: settings
      });
    },

    logoutUser: async (req, res) => {
      const token = req.body.token;
      if (token) {
        try {
          await db.collection("sessions").doc(token).delete();
        } catch (e) {
          console.error("Logout error:", e);
        }
      }
      return res.json({ success: true, message: "Logged out successfully." });
    },

    userUpdateProfile: async (req, res) => {
      // Middleware attaches session to req.session
      if (!req.session) return res.status(401).json({ success: false, message: "Unauthorized" });
      
      const updates = req.body.data;
      if (!updates || Object.keys(updates).length === 0) {
        return res.json({ success: false, message: "No data provided" });
      }

      try {
        const allowedFields = ["fullName", "phone", "address", "gender", "profilePicture", "email"]; // Fields allowed to be updated by user
        let safeUpdates = {};
        for (let key in updates) {
          if (allowedFields.includes(key)) {
            safeUpdates[key] = updates[key];
          }
        }

        if (safeUpdates.email) {
          safeUpdates.email = safeUpdates.email.trim().toLowerCase();
          const existing = await db.collection("users").where("email", "==", safeUpdates.email).get();
          let conflict = false;
          existing.forEach(doc => { if (doc.id !== req.session.userId) conflict = true; });
          if (conflict) return res.json({ success: false, message: "That email is already in use by another account." });
        }

        if (Object.keys(safeUpdates).length > 0) {
          await db.collection("users").doc(req.session.userId).update(safeUpdates);
        }
        
        return res.json({ success: true, message: "Profile updated successfully." });
      } catch (err) {
        return res.json({ success: false, message: "Error updating profile: " + err.message });
      }
    },

    userChangePassword: async (req, res) => {
      if (!req.session) return res.status(401).json({ success: false, message: "Unauthorized" });
      
      const currentPassword = req.body.currentPassword || req.body.oldPassword;
      const newPassword = req.body.newPassword;
      if (!currentPassword || !newPassword) {
        return res.json({ success: false, message: "Current and new password required." });
      }
      if (String(newPassword).length < 6) {
        return res.json({ success: false, message: "New password must be at least 6 characters." });
      }

      try {
        const userRef = db.collection("users").doc(req.session.userId);
        const userDoc = await userRef.get();
        const user = userDoc.data();

        let isMatch = false;
        if (user.passwordHash && (user.passwordHash.startsWith("$2b$") || user.passwordHash.startsWith("$2a$"))) {
          isMatch = await bcrypt.compare(String(currentPassword), user.passwordHash);
        } else {
          isMatch = hashPassword(currentPassword, user.salt || "") === user.passwordHash;
        }

        if (!isMatch) {
          return res.json({ success: false, message: "Incorrect current password." });
        }

        const newHash = await bcrypt.hash(String(newPassword), 10);

        await userRef.update({
          salt: null,
          passwordHash: newHash
        });

        // Terminate all sessions
        const sessionsSnapshot = await db.collection("sessions").where("userId", "==", req.session.userId).get();
        const batch = db.batch();
        sessionsSnapshot.docs.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();

        return res.json({ success: true, message: "Password updated successfully. Please log in again." });
      } catch (err) {
        return res.json({ success: false, message: "Error changing password: " + err.message });
      }
    },
    
    getPublicBranding: async (req, res) => {
      try {
        const settingsDoc = await db.collection("settings").doc("global").get();
        let cfg = {};
        if (settingsDoc.exists) {
          cfg = settingsDoc.data();
        }
        return res.json({
          success: true,
          school_name: cfg.school_name || "MySchool Cloud",
          school_motto: cfg.school_motto || "Excellence in Education",
          school_logo_url: cfg.school_logo_url || "",
          current_term: cfg.current_term || "First Term",
          current_session: cfg.current_session || "2026/2027",
          theme_primary: cfg.theme_primary || "",
          theme_secondary: cfg.theme_secondary || "",
          campuses: cfg.campuses || [],
          gradebook_format: cfg.gradebook_format || null
        });
      } catch (err) {
        return res.json({ success: false, message: err.message });
      }
    },

    requestPasswordReset: async (req, res) => {
      const { email } = req.body;
      if (!email) return res.json({ success: false, message: "Email is required." });
      // In a real app, send an email with a reset token here.
      // For now, we simulate success so the UI doesn't crash.
      return res.json({ success: true, message: "If that email exists, a password reset link has been sent." });
    },

    // ================================================================
    // PARENT SELF-REGISTRATION
    // ================================================================

    validateParentInvite: async (req, res) => {
      const { token } = req.body;
      if (!token) return res.json({ success: false, message: "Invite token is required." });

      try {
        const inviteDoc = await db.collection("parent_invites").doc(token).get();
        if (!inviteDoc.exists) {
          return res.json({ success: false, message: "Invalid invite link. Please request a new one from the school." });
        }

        const invite = inviteDoc.data();

        if (invite.status === "used") {
          return res.json({ success: false, message: "This invite link has already been used. Please contact the school if you need a new one." });
        }
        if (invite.status === "revoked") {
          return res.json({ success: false, message: "This invite link has been revoked. Please contact the school for a new one." });
        }
        if (new Date(invite.expiresAt) < new Date()) {
          return res.json({ success: false, message: "This invite link has expired (valid for 48 hours). Please request a new one." });
        }

        // Optionally get the linked student names if present
        let linkedStudentNames = [];
        if (invite.linkedStudentIds && Array.isArray(invite.linkedStudentIds)) {
          for (let sid of invite.linkedStudentIds) {
            const stuDoc = await db.collection("students").doc(sid).get();
            if (stuDoc.exists) linkedStudentNames.push(stuDoc.data().fullName);
          }
        } else if (invite.linkedStudentId) {
          const stuDoc = await db.collection("students").doc(invite.linkedStudentId).get();
          if (stuDoc.exists) linkedStudentNames.push(stuDoc.data().fullName);
        }

        return res.json({
          success: true,
          schoolName: invite.schoolName || "MySchool Cloud",
          linkedStudentIds: invite.linkedStudentIds || (invite.linkedStudentId ? [invite.linkedStudentId] : []),
          linkedStudentNames
        });
      } catch (err) {
        return res.json({ success: false, message: "Error validating invite: " + err.message });
      }
    },

    parentSelfRegister: async (req, res) => {
      const { token, fullName, email, password, phone } = req.body;

      if (!token || !fullName || !email || !password) {
        return res.json({ success: false, message: "All required fields must be filled." });
      }

      try {
        // 1. Re-validate the invite token
        const inviteDoc = await db.collection("parent_invites").doc(token).get();
        if (!inviteDoc.exists) return res.json({ success: false, message: "Invalid invite token." });

        const invite = inviteDoc.data();
        if (invite.status !== "pending") return res.json({ success: false, message: "This invite has already been used or revoked." });
        if (new Date(invite.expiresAt) < new Date()) return res.json({ success: false, message: "This invite has expired. Please request a new one." });

        // 2. Check if email already in use
        const existing = await db.collection("users").where("email", "==", email.trim().toLowerCase()).get();
        if (!existing.empty) return res.json({ success: false, message: "An account with this email already exists. Please use the Login page." });

        // 3. Create parent account
        const passwordHash = await bcrypt.hash(String(password), 10);
        const newUserRef = db.collection("users").doc();
        const userData = {
          fullName: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone || "",
          role: "parent",
          section: "both",
          status: "active",
          passwordHash,
          salt: null,
          createdAt: new Date().toISOString(),
          createdVia: "parent_self_registration"
        };
        await newUserRef.set(userData);

        // 4. Link to student if applicable
        const sids = invite.linkedStudentIds || (invite.linkedStudentId ? [invite.linkedStudentId] : []);
        if (sids.length > 0) {
          try {
            const batch = db.batch();
            for(let sid of sids) {
              batch.update(db.collection("students").doc(sid), { parentId: newUserRef.id });
            }
            await batch.commit();
          } catch (e) {
            console.error("Could not link parent to student:", e.message);
          }
        }

        // 5. Mark invite as used
        await db.collection("parent_invites").doc(token).update({
          status: "used",
          usedAt: new Date().toISOString(),
          usedBy: email.trim().toLowerCase(),
          parentUserId: newUserRef.id
        });

        // 6. Audit log
        await db.collection("audit_logs").add({
          timestamp: new Date().toISOString(),
          userId: newUserRef.id,
          userName: fullName.trim(),
          action: "PARENT_SELF_REGISTERED",
          details: `${fullName.trim()} registered as parent via invite link`
        });

        return res.json({ success: true, message: "Account created successfully! You can now log in." });
      } catch (err) {
        return res.json({ success: false, message: "Registration failed: " + err.message });
      }
    }
  };
};
