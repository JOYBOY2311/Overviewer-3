
// src/lib/config.ts

// TODO: Replace with your actual deployed Firebase Function URLs
// For local development using Firebase Emulators, they might look like:
// export const parseSheetFunctionUrl = "http://127.0.0.1:5001/your-project-id/us-central1/parseSheet";
// export const detectHeadersFunctionUrl = "http://127.0.0.1:5001/your-project-id/us-central1/detectHeaders";
// export const normalizeAndCheckFunctionUrl = "http://127.0.0.1:5001/your-project-id/us-central1/normalizeAndCheck";
// For production, they will look like:
// export const parseSheetFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/parseSheet";
// export const detectHeadersFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/detectHeaders";
// export const normalizeAndCheckFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/normalizeAndCheck";


// --- PARSE SHEET FUNCTION ---
// Using a placeholder - **REPLACE THIS**
export const parseSheetFunctionUrl = process.env.NEXT_PUBLIC_PARSE_SHEET_URL || "https://us-central1-your-project-id.cloudfunctions.net/parseSheet"; // REPLACE_WITH_YOUR_FUNCTION_URL

if (parseSheetFunctionUrl.includes('your-project-id') || parseSheetFunctionUrl.includes('REPLACE')) {
    console.warn("Firebase Function URL (parseSheet) in src/lib/config.ts needs to be updated with your actual function URL or NEXT_PUBLIC_PARSE_SHEET_URL environment variable.");
}

// --- DETECT HEADERS FUNCTION ---
// Using a placeholder - **REPLACE THIS**
export const detectHeadersFunctionUrl = process.env.NEXT_PUBLIC_DETECT_HEADERS_URL || "https://us-central1-your-project-id.cloudfunctions.net/detectHeaders"; // REPLACE_WITH_YOUR_FUNCTION_URL

if (detectHeadersFunctionUrl.includes('your-project-id') || detectHeadersFunctionUrl.includes('REPLACE')) {
    console.warn("Firebase Function URL (detectHeaders) in src/lib/config.ts needs to be updated with your actual function URL or NEXT_PUBLIC_DETECT_HEADERS_URL environment variable.");
}

// --- NORMALIZE AND CHECK FUNCTION ---
// Using a placeholder - **REPLACE THIS**
export const normalizeAndCheckFunctionUrl = process.env.NEXT_PUBLIC_NORMALIZE_CHECK_URL || "https://us-central1-your-project-id.cloudfunctions.net/normalizeAndCheck"; // REPLACE_WITH_YOUR_FUNCTION_URL

if (normalizeAndCheckFunctionUrl.includes('your-project-id') || normalizeAndCheckFunctionUrl.includes('REPLACE')) {
    console.warn("Firebase Function URL (normalizeAndCheck) in src/lib/config.ts needs to be updated with your actual function URL or NEXT_PUBLIC_NORMALIZE_CHECK_URL environment variable.");
}
