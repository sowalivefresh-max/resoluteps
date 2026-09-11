const { FieldValue } = require("firebase-admin/firestore");

module.exports = function(db) {
  return {
    /**
     * Utility to create a notification directly from other backend actions.
     * @param {string} targetUserId - UID of the user to receive the notification
     * @param {string} title - Title of the notification
     * @param {string} message - Description
     * @param {string} type - 'BILL', 'RESULT', 'ANNOUNCEMENT'
     */
    createNotification: async (targetUserId, title, message, type) => {
      try {
        await db.collection("notifications").add({
          targetUserId: targetUserId,
          title: title,
          message: message,
          type: type,
          isRead: false,
          createdAt: new Date().toISOString()
        });
      } catch (error) {
        console.error("Error creating notification:", error);
      }
    },

    // Endpoint: getNotifications
    getNotifications: async (req, res) => {
      const { uid } = req.user;
      try {
        const notifSnap = await db.collection("notifications")
          .where("targetUserId", "==", uid)
          .orderBy("createdAt", "desc")
          .limit(20)
          .get();

        const notifications = [];
        notifSnap.forEach(doc => {
          notifications.push({ id: doc.id, ...doc.data() });
        });

        res.json({ success: true, notifications: notifications });
      } catch (error) {
        console.error("Error getting notifications:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    },

    // Endpoint: markNotificationRead
    markNotificationRead: async (req, res) => {
      const { uid } = req.user;
      const { notificationId } = req.body;
      
      if (!notificationId) {
        return res.status(400).json({ success: false, message: "Missing notificationId" });
      }

      try {
        const docRef = db.collection("notifications").doc(notificationId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
          return res.status(404).json({ success: false, message: "Notification not found" });
        }

        if (docSnap.data().targetUserId !== uid) {
          return res.status(403).json({ success: false, message: "Unauthorized access to notification" });
        }

        await docRef.update({ isRead: true });
        res.json({ success: true, message: "Notification marked as read" });
      } catch (error) {
        console.error("Error marking notification read:", error);
        res.status(500).json({ success: false, message: error.message });
      }
    }
  };
};
