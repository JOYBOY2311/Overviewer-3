// src/lib/config.ts

// TODO: Replace with your actual deployed Firebase Function URL
// For local development using Firebase Emulators, it might look like:
// export const parseSheetFunctionUrl = "http://127.0.0.1:5001/your-project-id/us-central1/parseSheet";
// export const detectHeadersFunctionUrl = "http://127.0.0.1:5001/your-project-id/us-central1/detectHeaders";
// For production, it will look like:
// export const parseSheetFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/parseSheet";
// export const detectHeadersFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/detectHeaders";


// --- PARSE SHEET FUNCTION ---
// Using a placeholder - **REPLACE THIS**
export const parseSheetFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/parseSheet"; // REPLACE_WITH_YOUR_FUNCTION_URL

if (parseSheetFunctionUrl.includes('your-project-id') || parseSheetFunctionUrl.includes('REPLACE')) {
    console.warn("Firebase Function URL (parseSheet) in src/lib/config.ts needs to be updated with your actual function URL.");
}

// --- DETECT HEADERS FUNCTION ---
// Using a placeholder - **REPLACE THIS**
export const detectHeadersFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/detectHeaders"; // REPLACE_WITH_YOUR_FUNCTION_URL

if (detectHeadersFunctionUrl.includes('your-project-id') || detectHeadersFunctionUrl.includes('REPLACE')) {
    console.warn("Firebase Function URL (detectHeaders) in src/lib/config.ts needs to be updated with your actual function URL.");
}
