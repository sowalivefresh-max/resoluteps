module.exports = function(db) {
  return {
    storeGetInventory: async (req, res) => {
      try {
        const { section } = req.body;
        let query = db.collection("store_items");
        if (section && section !== "both" && section !== "") {
          // If we want items specific to a section, we can filter here,
          // but typically items might apply to all. Let's filter if the field exists.
          query = query.where("section", "in", [section, "both", ""]);
        }
        const snap = await query.get();
        const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.json({ success: true, data: items });
      } catch (e) {
        console.error("storeGetInventory Error:", e);
        return res.json({ success: false, message: e.message });
      }
    },

    storeReceiveItem: async (req, res) => {
      try {
        const { data } = req.body; // { name, category, quantity, section, price }
        if (!data.name || !data.quantity) {
          return res.json({ success: false, message: "Missing required fields." });
        }

        // Add or update existing item
        // Let's assume we create a new item or if an ID is passed, we update it.
        if (data.id) {
          const docRef = db.collection("store_items").doc(data.id);
          const docSnap = await docRef.get();
          if (docSnap.exists) {
            const currentStock = Number(docSnap.data().stock || 0);
            await docRef.update({
              stock: currentStock + Number(data.quantity),
              updatedAt: new Date().toISOString()
            });
          }
        } else {
          await db.collection("store_items").add({
            name: data.name,
            category: data.category || "General",
            stock: Number(data.quantity),
            price: Number(data.price || 0),
            section: data.section || "both",
            size: data.size || "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
        return res.json({ success: true, message: "Item stock updated successfully." });
      } catch (e) {
        console.error("storeReceiveItem Error:", e);
        return res.json({ success: false, message: e.message });
      }
    },

    storeEditItem: async (req, res) => {
      try {
        const { data } = req.body;
        if (!data.id) return res.json({ success: false, message: "Missing item ID." });
        await db.collection("store_items").doc(data.id).update({
          name: data.name,
          category: data.category,
          price: Number(data.price || 0),
          section: data.section || "both",
          size: data.size || "",
          updatedAt: new Date().toISOString()
        });
        return res.json({ success: true, message: "Item updated successfully." });
      } catch (e) {
        return res.json({ success: false, message: e.message });
      }
    },

    storeDeleteItem: async (req, res) => {
      try {
        const { itemId } = req.body;
        if (!itemId) return res.json({ success: false, message: "Missing item ID." });
        await db.collection("store_items").doc(itemId).delete();
        return res.json({ success: true, message: "Item deleted successfully." });
      } catch (e) {
        return res.json({ success: false, message: e.message });
      }
    },

    storeIssueItem: async (req, res) => {
      try {
        const { data } = req.body; // { itemId, studentId, studentName, quantity, note }
        if (!data.itemId || !data.studentId || !data.quantity) {
          return res.json({ success: false, message: "Missing required fields." });
        }

        const itemRef = db.collection("store_items").doc(data.itemId);
        const itemSnap = await itemRef.get();
        if (!itemSnap.exists) {
          return res.json({ success: false, message: "Item not found." });
        }

        const currentStock = Number(itemSnap.data().stock || 0);
        const qtyToIssue = Number(data.quantity);
        if (currentStock < qtyToIssue) {
          return res.json({ success: false, message: "Insufficient stock." });
        }

        const batch = db.batch();
        batch.update(itemRef, {
          stock: currentStock - qtyToIssue,
          updatedAt: new Date().toISOString()
        });

        const recordRef = db.collection("store_records").doc();
        batch.set(recordRef, {
          itemId: data.itemId,
          itemName: itemSnap.data().name,
          studentId: data.studentId,
          studentName: data.studentName,
          quantity: qtyToIssue,
          note: data.note || "",
          issuedBy: req.session.userId || req.session.name || "Storekeeper",
          date: new Date().toISOString()
        });

        // If there's a corresponding payment to deduct/link from store_orders, update it here.
        if (data.orderId) {
           const orderRef = db.collection("store_orders").doc(data.orderId);
           batch.update(orderRef, { status: "Issued", issuedAt: new Date().toISOString() });
        }

        await batch.commit();
        return res.json({ success: true, message: "Item issued successfully." });
      } catch (e) {
        console.error("storeIssueItem Error:", e);
        return res.json({ success: false, message: e.message });
      }
    },

    storeGetRecords: async (req, res) => {
      try {
        // We can fetch records and optionally filter by section if needed.
        // But store records usually don't have section, just student names.
        const snap = await db.collection("store_records").orderBy("date", "desc").limit(100).get();
        const records = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.json({ success: true, data: records });
      } catch (e) {
        console.error("storeGetRecords Error:", e);
        return res.json({ success: false, message: e.message });
      }
    },

    storeGetStudents: async (req, res) => {
      try {
        const { section } = req.body;
        let query = db.collection("students").where("role", "==", "student");
        if (section && section !== "both" && section !== "") {
          query = query.where("section", "==", section);
        }
        
        const snap = await query.get();
        const students = snap.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            userId: d.userId || doc.id,
            name: d.fullName || d.name,
            admissionNumber: d.admissionNumber,
            className: d.className || d.class,
            section: d.section
          };
        });
        
        return res.json({ success: true, data: students });
      } catch (e) {
        console.error("storeGetStudents Error:", e);
        return res.json({ success: false, message: e.message });
      }
    },

    storeGetPaidItems: async (req, res) => {
      try {
        // Allows Accounts to prompt the storekeeper
        // Fetch items from store_orders where status is 'Paid' (Pending issuance)
        const { section } = req.body;
        let query = db.collection("store_orders").where("status", "==", "Paid");
        if (section && section !== "both" && section !== "") {
          query = query.where("section", "in", [section, "both", ""]);
        }
        const snap = await query.get();
        const orders = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return res.json({ success: true, data: orders });
      } catch (e) {
         console.error("storeGetPaidItems Error:", e);
         return res.json({ success: false, message: e.message });
      }
    }
  };
};
