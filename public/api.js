/**
 * api.js
 * Centralized API client for communicating with the Google Apps Script Backend.
 */

// --- DEPLOYMENT CONFIGURATION ------------------------------------------------
// Dynamically select the backend URL based on the environment
// -----------------------------------------------------------------------------
const PROJECT_ID = "victoryspring-681e5";
const REGION = "us-central1";

// The live Firebase Cloud Run URL (as returned by the deployment)
// Using relative path to utilize Firebase Hosting Rewrites (fixes CORS and firewall issues)
let SCRIPT_URL = "/api";

// If running locally, use the Firebase Emulator
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
  SCRIPT_URL = `http://127.0.0.1:5001/${PROJECT_ID}/${REGION}/api/api`;
}

/**
 * Calls a backend function.
 * @param {string} action - The name of the function in Code.gs
 * @param {Array} args - An array of arguments to pass to the function
 * @returns {Promise<any>}
 */
async function runBackendAction(action, args = []) {
  try {
    const token = (typeof AA !== 'undefined' && AA.token) ? AA.token : (args[0] || "");
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: action, args: args, token: token }),
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    // Legacy support: if the backend returned { success: true, data: ... }, unwrap it
    // so the frontend receives the raw array/object as it did with google.script.run
    if (data && typeof data === 'object' && data.success === true && data.data !== undefined) {
      return data.data;
    }
    
    return data;
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
}
