
// src/lib/config.ts

// TODO: Replace with your actual deployed Firebase Function URLs
// For local development using Firebase Emulators, they might look like:
// export const parseSheetFunctionUrl = "http://127.0.0.1:5001/your-project-id/us-central1/parseSheet";
// export const detectHeadersFunctionUrl = "http://127.0.0.1:5001/your-project-id/us-central1/detectHeaders";
// export const normalizeAndCheckFunctionUrl = "http://127.0.0.1:5001/your-project-id/us-central1/normalizeAndCheck";
// export const scrapeWebsiteContentFunctionUrl = "http://127.0.0.1:5001/your-project-id/us-central1/scrapeWebsiteContent";
// export const processAndSummarizeContentFunctionUrl = "http://127.0.0.1:5001/your-project-id/us-central1/processAndSummarizeContent";
// export const saveCompanyDataFunctionUrl = "http://127.0.0.1:5001/your-project-id/us-central1/saveCompanyData";


// For production, they will look like:
// export const parseSheetFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/parseSheet";
// export const detectHeadersFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/detectHeaders";
// export const normalizeAndCheckFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/normalizeAndCheck";
// export const scrapeWebsiteContentFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/scrapeWebsiteContent";
// export const processAndSummarizeContentFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/processAndSummarizeContent";
// export const saveCompanyDataFunctionUrl = "https://us-central1-your-project-id.cloudfunctions.net/saveCompanyData";


// --- PARSE SHEET FUNCTION ---
export const parseSheetFunctionUrl = process.env.NEXT_PUBLIC_PARSE_SHEET_URL || "https://us-central1-your-project-id.cloudfunctions.net/parseSheet";

if (parseSheetFunctionUrl.includes('your-project-id') || parseSheetFunctionUrl.includes('REPLACE')) {
    console.warn("Update Firebase Function URL (parseSheet) in src/lib/config.ts or set NEXT_PUBLIC_PARSE_SHEET_URL environment variable.");
}

// --- DETECT HEADERS FUNCTION ---
export const detectHeadersFunctionUrl = process.env.NEXT_PUBLIC_DETECT_HEADERS_URL || "https://us-central1-your-project-id.cloudfunctions.net/detectHeaders";

if (detectHeadersFunctionUrl.includes('your-project-id') || detectHeadersFunctionUrl.includes('REPLACE')) {
    console.warn("Update Firebase Function URL (detectHeaders) in src/lib/config.ts or set NEXT_PUBLIC_DETECT_HEADERS_URL environment variable.");
}

// --- NORMALIZE AND CHECK FUNCTION ---
export const normalizeAndCheckFunctionUrl = process.env.NEXT_PUBLIC_NORMALIZE_CHECK_URL || "https://us-central1-your-project-id.cloudfunctions.net/normalizeAndCheck";

if (normalizeAndCheckFunctionUrl.includes('your-project-id') || normalizeAndCheckFunctionUrl.includes('REPLACE')) {
    console.warn("Update Firebase Function URL (normalizeAndCheck) in src/lib/config.ts or set NEXT_PUBLIC_NORMALIZE_CHECK_URL environment variable.");
}

// --- SCRAPE WEBSITE CONTENT FUNCTION ---
export const scrapeWebsiteContentFunctionUrl = process.env.NEXT_PUBLIC_SCRAPE_CONTENT_URL || "https://us-central1-your-project-id.cloudfunctions.net/scrapeWebsiteContent";

if (scrapeWebsiteContentFunctionUrl.includes('your-project-id') || scrapeWebsiteContentFunctionUrl.includes('REPLACE')) {
    console.warn("Update Firebase Function URL (scrapeWebsiteContent) in src/lib/config.ts or set NEXT_PUBLIC_SCRAPE_CONTENT_URL environment variable.");
}

// --- PROCESS AND SUMMARIZE CONTENT FUNCTION ---
export const processAndSummarizeContentFunctionUrl = process.env.NEXT_PUBLIC_PROCESS_SUMMARIZE_URL || "https://us-central1-your-project-id.cloudfunctions.net/processAndSummarizeContent";

if (processAndSummarizeContentFunctionUrl.includes('your-project-id') || processAndSummarizeContentFunctionUrl.includes('REPLACE')) {
    console.warn("Update Firebase Function URL (processAndSummarizeContent) in src/lib/config.ts or set NEXT_PUBLIC_PROCESS_SUMMARIZE_URL environment variable.");
}

// --- SAVE COMPANY DATA FUNCTION ---
export const saveCompanyDataFunctionUrl = process.env.NEXT_PUBLIC_SAVE_DATA_URL || "https://us-central1-your-project-id.cloudfunctions.net/saveCompanyData";

if (saveCompanyDataFunctionUrl.includes('your-project-id') || saveCompanyDataFunctionUrl.includes('REPLACE')) {
    console.warn("Update Firebase Function URL (saveCompanyData) in src/lib/config.ts or set NEXT_PUBLIC_SAVE_DATA_URL environment variable.");
}
