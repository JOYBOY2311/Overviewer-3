// src/lib/config.ts

// TODO: Replace with your actual deployed Firebase Function URL
// For local development using Firebase Emulators, it might look like:
// export const parseSheetFunctionUrl = "http://127.0.0.1:5001/your-project-id/us-central1/parseSheet";
// For production, it will look like:
// export const parseSheetFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/parseSheet";

// Using a placeholder - **REPLACE THIS**
export const parseSheetFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/parseSheet"; // REPLACE_WITH_YOUR_FUNCTION_URL

if (parseSheetFunctionUrl.includes('your-project-id') || parseSheetFunctionUrl.includes('REPLACE')) {
    console.warn("Firebase Function URL in src/lib/config.ts needs to be updated with your actual function URL.");
}
