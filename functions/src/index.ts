
/**
 * Import function triggers from their respective submodules:
 * ... (comments) ...
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import type { Request, Response } from "express"; // Use 'type' import
import Busboy from 'busboy';
import * as XLSX from "xlsx";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import * as admin from 'firebase-admin';
import axios from 'axios';
import * as cheerio from 'cheerio';


// Import Genkit flows
import { detectHeaders as detectHeadersFlow, type DetectHeadersInput, type DetectHeadersOutput } from "../../src/ai/flows/detect-headers-flow";
import { summarizeContent as summarizeContentFlow, type SummarizeContentInput, type SummarizeContentOutput } from "../../src/ai/flows/summarize-content-flow";


// --- Initialize Firebase Admin SDK ---
try {
    admin.initializeApp();
    logger.info("Firebase Admin SDK initialized successfully.");
} catch (error) {
    logger.error("Error initializing Firebase Admin SDK:", error);
    // Depending on your setup, you might want to re-throw or handle differently
    // If running locally with emulators, multiple initializations might happen,
    // which can sometimes cause benign errors if not handled.
    if (admin.apps.length === 0) {
        // Rethrow only if no app was initialized at all
        throw error;
    } else {
        logger.warn("Firebase Admin SDK might have been initialized already.");
    }
}
const db = admin.firestore();
// ------------------------------------


// Define the type for a row parsed from Excel
type ExcelRow = (string | number | boolean | Date | null)[];

// Define the mapping structure confirmed by the user
type ConfirmedHeaderMapping = {
    name: string | null;
    country: string | null;
    website: string | null;
};

// Define the structure for the result of processing a single row (Updated for Phase 6)
type ProcessedRowResult = {
    originalData: {
        companyName: string | null;
        country: string | null;
        website: string | null;
    };
    normalizedData: {
        companyName: string | null;
        country: string | null;
        website: string | null;
    };
    status: 'Fetched' | 'To Process' | 'Error';
    errorMessage?: string;
    fetchedData?: {
        summary?: string;
        lastUpdated?: string; // ISO string
        independenceCriteria?: "Yes" | "";
        insufficientInfo?: "Yes" | "";
        // Add other fields as needed
    };
    scrapingStatus?: 'Pending' | 'Scraping' | 'Success' | 'Failed_Scrape' | 'Failed_Error';
    scrapedText?: string | null;
    scrapingErrorMessage?: string;
    summarizationStatus?: 'Pending_Summary' | 'Summarizing' | 'Success_Summary' | 'Failed_Summary';
    summary?: string; // Top-level summary for consistency
    independenceCriteria?: "Yes" | ""; // Top-level for consistency
    insufficientInfo?: "Yes" | ""; // Top-level for consistency
    summarizationErrorMessage?: string;
    saveStatus?: 'Pending_Save' | 'Saving' | 'Saved' | 'Failed_Save'; // Added for Phase 6
    saveErrorMessage?: string; // Added for Phase 6
};

// --- Helper function for Manual CORS ---
const setCorsHeaders = (req: Request, res: Response): void => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT, DELETE"); // Allow PUT/DELETE if needed
    res.set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
};
// --------------------------------------

export const parseSheet = onRequest({ memory: "512MiB", timeoutSeconds: 60 }, (req: Request, res: Response) => {
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
    }
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed"); return;
    }
    try {
        const busboy = Busboy({ headers: req.headers });
        const tmpdir = os.tmpdir();
        const fileWrites: Promise<void>[] = [];
        let uploadedFilePath = "";
        let fileBuffer: Buffer | null = null;

        busboy.on("file", (fieldname: string, file: NodeJS.ReadableStream, filename: Busboy.FileInfo) => {
            logger.info(`Processing file: ${filename.filename}`);
            const filepath = path.join(tmpdir, filename.filename);
            uploadedFilePath = filepath;
            const writeStream = fs.createWriteStream(filepath);
            file.pipe(writeStream);
            const chunks: Buffer[] = [];
            file.on("data", (chunk: Buffer) => { chunks.push(chunk); });
            const promise = new Promise<void>((resolve, reject) => {
                file.on("end", () => { fileBuffer = Buffer.concat(chunks); writeStream.end(); });
                writeStream.on("finish", resolve);
                writeStream.on("error", reject);
            });
            fileWrites.push(promise);
        });

        busboy.on("finish", async () => {
            try {
                await Promise.all(fileWrites);
                if (!fileBuffer || fileBuffer.length === 0) {
                    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
                        logger.warn("Reading file from disk as buffer was null or empty.");
                        fileBuffer = fs.readFileSync(uploadedFilePath);
                        if (!fileBuffer || fileBuffer.length === 0) {
                            throw new Error("File buffer is empty even after disk fallback.");
                        }
                    } else {
                        throw new Error("No file uploaded or file buffer is empty.");
                    }
                }
                logger.info("Parsing workbook from buffer...");
                const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: false });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                if (!worksheet) { throw new Error(`Sheet "${sheetName}" not found or empty.`); }
                const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, { header: 1, defval: null, raw: true });
                if (jsonData.length === 0) { logger.info("Sheet contains no data."); res.status(200).json({ headers: [], rows: [] }); return; }
                const headers: string[] = jsonData[0].map((header) => String(header ?? ""));
                const rows: ExcelRow[] = jsonData.slice(1).map(row =>
                    row.map(cell => (cell === undefined ? null : cell))
                );
                logger.info(`Parsed ${headers.length} headers and ${rows.length} rows.`);
                res.status(200).json({ headers, rows });
            } catch (error: unknown) {
                logger.error("Error parsing Excel file:", error);
                const errorMessage = error instanceof Error ? error.message : "Unknown parsing error";
                if (!res.headersSent) { setCorsHeaders(req, res); }
                res.status(500).json({ error: `Failed to parse Excel file: ${errorMessage}` });
            } finally {
                if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
                    try { fs.unlinkSync(uploadedFilePath); logger.info(`Temporary file deleted: ${uploadedFilePath}`); } catch (unlinkError) { logger.error(`Error deleting temporary file ${uploadedFilePath}:`, unlinkError); }
                }
            }
        });
        busboy.on("error", (err: Error) => {
            logger.error("Busboy error:", err);
            if (!res.headersSent) { setCorsHeaders(req, res); }
            res.status(500).json({ error: "Error processing form data." });
        });
        req.pipe(busboy);
    } catch(error) {
        logger.error("Synchronous error in parseSheet:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        if (!res.headersSent) { setCorsHeaders(req, res); }
        res.status(500).json({ error: `Failed to process request: ${errorMessage}` });
    }
});

export const detectHeaders = onRequest({ memory: "512MiB", timeoutSeconds: 60 }, (req: Request, res: Response) => {
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
    }
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed"); return;
    }
    try {
        const inputData = req.body as DetectHeadersInput;
        if (!inputData || !Array.isArray(inputData.headers) || inputData.headers.length === 0) {
            logger.error("Invalid input: 'headers' array is required.", { body: req.body });
            if (!res.headersSent) { setCorsHeaders(req, res); }
            res.status(400).json({ error: "Invalid input: 'headers' array is required and must not be empty." });
            return;
        }
        logger.info("Calling detectHeaders Genkit flow with headers:", inputData.headers);
        detectHeadersFlow(inputData).then((result: DetectHeadersOutput) => {
            logger.info("detectHeaders Genkit flow completed successfully.", { result });
            if (!res.headersSent) { setCorsHeaders(req, res); }
            res.status(200).json(result);
        }).catch((error: Error) => {
            logger.error("Error calling detectHeaders Genkit flow:", error);
            const errorMessage = error instanceof Error ? error.message : "Unknown AI processing error";
            if (!res.headersSent) { setCorsHeaders(req, res); }
            res.status(500).json({ error: `Failed to detect headers: ${errorMessage}` });
        });
    } catch (error: unknown) {
        logger.error("Synchronous error in detectHeaders function:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown processing error";
        if (!res.headersSent) { setCorsHeaders(req, res); }
        res.status(500).json({ error: `Failed to process request: ${errorMessage}` });
    }
});

export const normalizeAndCheck = onRequest({ memory: "1GiB", timeoutSeconds: 120 }, async (req: Request, res: Response): Promise<void> => {
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
    }
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed"); return;
    }
    let allHeaders: string[] = [];
    try {
        // Adjust expected structure if 'originalIndex' isn't sent from frontend initially
        const { rows, confirmedHeaders, headers: inputHeaders } = req.body as { rows: ExcelRow[], confirmedHeaders: ConfirmedHeaderMapping, headers: string[] };
        if (!Array.isArray(rows)) {
            throw new Error("Invalid input: 'rows' must be an array.");
        }
        if (!confirmedHeaders || typeof confirmedHeaders !== 'object') {
            throw new Error("Invalid input: 'confirmedHeaders' object is required.");
        }
        if (!confirmedHeaders.name && !confirmedHeaders.country && !confirmedHeaders.website) {
            throw new Error("Invalid input: At least one confirmed header (name, country, website) is required.");
        }
        if (!Array.isArray(inputHeaders) || inputHeaders.length === 0) {
            throw new Error("Invalid input: 'headers' array is required for index lookup.");
        }
        allHeaders = inputHeaders;
        logger.info(`Starting normalizeAndCheck for ${rows.length} rows.`);
        const results: ProcessedRowResult[] = []; // Use ProcessedRowResult directly now
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        const getIndex = (headerName: string | null): number => {
            if (headerName === null || headerName === undefined) return -1;
            const index = allHeaders.indexOf(headerName);
            if (index === -1) {
                logger.warn(`Header "${headerName}" not found in provided headers:`, allHeaders);
            }
            return index;
        };
        const nameIndex = getIndex(confirmedHeaders.name);
        const countryIndex = getIndex(confirmedHeaders.country);
        const websiteIndex = getIndex(confirmedHeaders.website);

        for (let i = 0; i < rows.length; i++) { // Iterate with index
            const row = rows[i];
            const originalIndex = i; // Store the original index
            let status: ProcessedRowResult['status'] = 'To Process';
            let fetchedData: ProcessedRowResult['fetchedData'] | undefined = undefined;
            let errorMessage: string | undefined = undefined;
            let scrapingStatus: ProcessedRowResult['scrapingStatus'] = 'Pending';
            let summarizationStatus: ProcessedRowResult['summarizationStatus'] = 'Pending_Summary';
            let saveStatus: ProcessedRowResult['saveStatus'] = 'Pending_Save'; // Initial save status

            // AI fields initialized
            let summary: string | undefined = undefined;
            let independenceCriteria: ProcessedRowResult['independenceCriteria'] = "";
            let insufficientInfo: ProcessedRowResult['insufficientInfo'] = "";

            const originalCompanyName = nameIndex !== -1 ? String(row[nameIndex] ?? '') : null;
            const originalCountry = countryIndex !== -1 ? String(row[countryIndex] ?? '') : null;
            const originalWebsite = websiteIndex !== -1 ? String(row[websiteIndex] ?? '') : null;

            const normalizedCompanyName = originalCompanyName ? originalCompanyName.trim().toLowerCase() : null;
            const normalizedCountry = originalCountry ? originalCountry.trim().toLowerCase() : null;
            let normalizedWebsite: string | null = null;
            if (originalWebsite) {
                try {
                    let tempWebsite = originalWebsite.trim().toLowerCase();
                    tempWebsite = tempWebsite.replace(/^https?:\/\//, '');
                    tempWebsite = tempWebsite.replace(/^www\./, '');
                    tempWebsite = tempWebsite.replace(/\/$/, '');
                    if (tempWebsite.includes('.') && !tempWebsite.includes(' ')) {
                        normalizedWebsite = tempWebsite;
                    } else {
                        logger.warn(`Invalid website format skipped: ${originalWebsite}`);
                    }
                } catch (normError) {
                    logger.error(`Error normalizing website "${originalWebsite}":`, normError);
                    errorMessage = `Error normalizing website: ${originalWebsite}`;
                    status = 'Error';
                    scrapingStatus = 'Failed_Error';
                    summarizationStatus = 'Failed_Summary';
                    saveStatus = 'Failed_Save'; // Cannot save if basic normalization fails
                }
            }

            if (status !== 'Error' && normalizedWebsite) {
                try {
                    const companiesRef = db.collection('companies');
                    const query = companiesRef.where('website', '==', normalizedWebsite).limit(1);
                    const snapshot = await query.get();
                    if (!snapshot.empty) {
                        const doc = snapshot.docs[0];
                        const docData = doc.data();
                        if (docData.lastUpdated && docData.lastUpdated instanceof admin.firestore.Timestamp) {
                            const lastUpdatedTimestamp = docData.lastUpdated;
                            const lastUpdatedDate = lastUpdatedTimestamp.toDate();
                            if (lastUpdatedDate > sixMonthsAgo) {
                                status = 'Fetched';
                                // Populate fetchedData
                                fetchedData = {
                                    summary: docData.summary || undefined,
                                    lastUpdated: lastUpdatedTimestamp.toDate().toISOString(),
                                    independenceCriteria: docData.independenceCriteria || "",
                                    insufficientInfo: docData.insufficientInfo || "",
                                    // Add other fields here if needed
                                };
                                // Populate top-level fields for consistency
                                summary = docData.summary || undefined;
                                independenceCriteria = docData.independenceCriteria || "";
                                insufficientInfo = docData.insufficientInfo || "";

                                scrapingStatus = undefined; // Not applicable
                                summarizationStatus = undefined; // Not applicable
                                saveStatus = 'Saved'; // Already saved (implicitly)

                                logger.info(`Found recent data for website: ${normalizedWebsite}`);
                            } else {
                                status = 'To Process';
                                scrapingStatus = 'Pending';
                                summarizationStatus = 'Pending_Summary';
                                saveStatus = 'Pending_Save';
                                logger.info(`Found old data for website: ${normalizedWebsite}, marking for reprocessing.`);
                            }
                        } else {
                            status = 'To Process';
                            scrapingStatus = 'Pending';
                            summarizationStatus = 'Pending_Summary';
                            saveStatus = 'Pending_Save';
                            logger.warn(`Missing or invalid lastUpdated timestamp for website: ${normalizedWebsite}`);
                        }
                    } else {
                        status = 'To Process';
                        scrapingStatus = 'Pending';
                        summarizationStatus = 'Pending_Summary';
                        saveStatus = 'Pending_Save';
                        logger.info(`No data found for website: ${normalizedWebsite}`);
                    }
                } catch (dbError) {
                    logger.error(`Firestore query error for website "${normalizedWebsite}":`, dbError);
                    errorMessage = `Firestore error checking website: ${normalizedWebsite}`;
                    status = 'Error';
                    scrapingStatus = 'Failed_Error';
                    summarizationStatus = 'Failed_Summary';
                    saveStatus = 'Failed_Save'; // Cannot save if DB check fails
                }
            } else if (status !== 'Error' && !normalizedWebsite && originalWebsite) {
                // Website provided but was invalid format
                errorMessage = `Invalid website format: ${originalWebsite}`;
                status = 'Error';
                scrapingStatus = 'Failed_Error';
                summarizationStatus = 'Failed_Summary';
                saveStatus = 'Failed_Save';
            } else if (status !== 'Error' && !normalizedWebsite) {
                 // No website provided
                status = 'To Process'; // Can still be 'To Process' for name/country, but not for web-based steps
                scrapingStatus = undefined;
                summarizationStatus = undefined;
                saveStatus = undefined; // Cannot save without website
                logger.info("No website provided, skipping Firestore check, scraping, summarization, and saving.");
            }

            results.push({
                originalIndex, // Include original index
                originalData: { companyName: originalCompanyName, country: originalCountry, website: originalWebsite },
                normalizedData: { companyName: normalizedCompanyName, country: normalizedCountry, website: normalizedWebsite },
                status,
                scrapingStatus,
                summarizationStatus,
                saveStatus, // Include save status
                summary, // Include top-level summary
                independenceCriteria, // Include top-level flag
                insufficientInfo, // Include top-level flag
                ...(errorMessage && { errorMessage }),
                ...(fetchedData && { fetchedData }),
            });
        }
        logger.info(`normalizeAndCheck completed. Processed ${results.length} rows.`);
        if (!res.headersSent) { setCorsHeaders(req, res); }
        res.status(200).json(results);
    } catch (error: unknown) {
        logger.error("Error in normalizeAndCheck function:", error);
        const message = error instanceof Error ? error.message : "Unknown processing error";
        if (!res.headersSent) { setCorsHeaders(req, res); }
        res.status(500).json({ error: `Failed to process data: ${message}` });
    }
});


/**
 * Attempts to scrape text content from a single URL.
 * Prioritizes <article>, then <main>, then <p> tags.
 * @param url The full URL to scrape (including https://).
 * @returns The extracted text content (string) or null if scraping fails or yields minimal text.
 */
async function scrapeSingleUrl(url: string): Promise<string | null> {
    try {
        logger.info(`Attempting to scrape: ${url}`);
        const response = await axios.get(url, {
            timeout: 15000, // 15 second timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Connection': 'keep-alive',
            },
        });

        if (response.status === 200) {
            const $ = cheerio.load(response.data);
            let text = '';

            // Prioritize specific content tags
            $('article').each((i, el) => { text += $(el).text() + '\n\n'; });
            if (text.trim().length < 500) { // Only try <main> if <article> is short
                $('main').each((i, el) => { text += $(el).text() + '\n\n'; });
            }

            // Fallback to paragraph tags if still insufficient
            if (text.trim().length < 500) {
                logger.info(`Low text yield from article/main tags for ${url}, trying p tags.`);
                text = $('p').map((i, el) => $(el).text()).get().join('\n\n');
            }

            const sanitizedText = text.replace(/\s\s+/g, ' ').trim();
            logger.info(`Successfully scraped ${url}. Raw length: ${text.length}, Sanitized length: ${sanitizedText.length}`);

            // Return text only if it meets a minimum length threshold
            return sanitizedText.length > 50 ? sanitizedText : null;
        } else {
            logger.warn(`Scraping ${url} failed with status: ${response.status}`);
            return null;
        }
    } catch (error: unknown) {
        if (axios.isAxiosError(error)) {
            logger.error(`Axios error scraping ${url}: ${error.message}`, { status: error.response?.status });
        } else {
            logger.error(`General error scraping ${url}:`, error);
        }
        return null; // Indicate failure
    }
}


export const scrapeWebsiteContent = onRequest({ memory: "1GiB", timeoutSeconds: 120 }, async (req: Request, res: Response): Promise<void> => {
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
    }
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed"); return;
    }

    try {
        const { websiteUrl, companyName } = req.body as { websiteUrl?: string, companyName?: string };
        if (!websiteUrl || typeof websiteUrl !== 'string') {
            if (!res.headersSent) setCorsHeaders(req, res);
            res.status(400).json({ error: "Missing or invalid 'websiteUrl' in request body.", status: 'Failed_Error', scrapedText: null });
            return;
        }

        logger.info(`Received scrape request for: ${websiteUrl}`, { companyName });
        const baseUrl = `https://${websiteUrl}`;
        let combinedText = '';
        let finalStatus: ProcessedRowResult['scrapingStatus'] = 'Pending'; // Start as pending
        let errorMessage: string | undefined;
        const minTextLength = 1000; // Target combined text length

        // --- Try scraping main page ---
        let mainText = await scrapeSingleUrl(baseUrl);
        if (mainText) {
            combinedText += mainText;
        }

        // --- Try scraping /about if not enough text ---
        if (combinedText.length < minTextLength) {
            logger.info(`Text from ${baseUrl} is short (${combinedText.length}), trying /about...`);
            const aboutUrl = `${baseUrl}/about`;
            const aboutText = await scrapeSingleUrl(aboutUrl);
            if (aboutText) {
                combinedText += (combinedText.length > 0 ? '\n\n--- About Page ---\n\n' : '') + aboutText;
                logger.info(`Appended text from ${aboutUrl}`);
            }
        }

         // --- Try scraping /contact if not enough text ---
         if (combinedText.length < minTextLength) {
            logger.info(`Text still short (${combinedText.length}), trying /contact...`);
            const contactUrl = `${baseUrl}/contact`;
            const contactText = await scrapeSingleUrl(contactUrl);
            if (contactText) {
                combinedText += (combinedText.length > 0 ? '\n\n--- Contact Page ---\n\n' : '') + contactText;
                logger.info(`Appended text from ${contactUrl}`);
            }
        }

         // --- Try scraping /services if not enough text ---
         if (combinedText.length < minTextLength) {
            logger.info(`Text still short (${combinedText.length}), trying /services...`);
            const servicesUrl = `${baseUrl}/services`;
            const servicesText = await scrapeSingleUrl(servicesUrl);
            if (servicesText) {
                combinedText += (combinedText.length > 0 ? '\n\n--- Services Page ---\n\n' : '') + servicesText;
                logger.info(`Appended text from ${servicesUrl}`);
            }
        }

        // --- Final Check and Truncation ---
        if (combinedText.length > 50) { // Use a smaller threshold to determine success vs. failure
            finalStatus = 'Success';
            const maxLength = 15000; // Limit total text length for LLM
            if (combinedText.length > maxLength) {
                combinedText = combinedText.substring(0, maxLength) + '... [truncated]';
                logger.info(`Truncated combined scraped text for ${websiteUrl} to ${maxLength} characters.`);
            }
        } else {
            finalStatus = 'Failed_Scrape';
            errorMessage = `Scraping yielded no significant content from ${websiteUrl} or common subpages (/about, /contact, /services).`;
            logger.warn(errorMessage);
            combinedText = ''; // Ensure text is empty on failure
        }

        if (!res.headersSent) setCorsHeaders(req, res);
        res.status(200).json({
            scrapedText: finalStatus === 'Success' ? combinedText : null,
            status: finalStatus,
            ...(errorMessage && finalStatus !== 'Success' && { error: errorMessage }) // Only include error message on failure
        });

    } catch (error: unknown) {
        logger.error("Error in scrapeWebsiteContent function:", error);
        const message = error instanceof Error ? error.message : "Unknown processing error";
        if (!res.headersSent) { setCorsHeaders(req, res); }
        // Ensure status indicates error on unexpected failure
        res.status(500).json({ error: `Failed to process scraping request: ${message}`, status: 'Failed_Error', scrapedText: null });
    }
});


export const processAndSummarizeContent = onRequest({ memory: "1GiB", timeoutSeconds: 120 }, async (req: Request, res: Response): Promise<void> => {
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
    }
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed"); return;
    }

    try {
        const { scrapedText } = req.body as { scrapedText: string };

        if (!scrapedText || typeof scrapedText !== 'string' || scrapedText.trim() === "") {
            logger.error("Invalid input: 'scrapedText' is required and must be a non-empty string.", { body: req.body });
            if (!res.headersSent) { setCorsHeaders(req, res); }
            res.status(400).json({ error: "Invalid input: 'scrapedText' is required and must be a non-empty string." });
            return;
        }

        logger.info(`Calling summarizeContent Genkit flow with text length: ${scrapedText.length}`);

        const input: SummarizeContentInput = { companyText: scrapedText };
        const result: SummarizeContentOutput = await summarizeContentFlow(input);

        logger.info("summarizeContent Genkit flow completed successfully.", { result });
        if (!res.headersSent) { setCorsHeaders(req, res); }
        res.status(200).json(result);

    } catch (error: unknown) {
        logger.error("Error in processAndSummarizeContent function:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown AI processing error";
        if (!res.headersSent) { setCorsHeaders(req, res); }
        res.status(500).json({ error: `Failed to summarize content: ${errorMessage}` });
    }
});

// --- NEW FUNCTION FOR PHASE 6 ---
interface SaveDataPayload {
    originalData: { companyName: string | null; country: string | null; website: string | null };
    normalizedData: { companyName: string | null; country: string | null; website: string | null };
    summary?: string;
    independenceCriteria?: "Yes" | "";
    insufficientInfo?: "Yes" | "";
    // Add any other fields needed from ProcessedRowResult
}

// Define the type for the data to be saved to Firestore
interface CompanyDataToSave {
    website: string;
    originalCompanyName: string | null;
    originalCountry: string | null;
    originalWebsite: string | null;
    normalizedCompanyName: string | null;
    normalizedCountry: string | null;
    summary: string | null;
    independenceCriteria: "Yes" | "";
    insufficientInfo: "Yes" | "";
    lastUpdated: admin.firestore.FieldValue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any; // Allow for additional string keys with any value
}
export const saveCompanyData = onRequest({ memory: "512MiB", timeoutSeconds: 60 }, async (req: Request, res: Response): Promise<void> => {
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
    }
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed"); return;
    }

    try {
        const input = req.body as SaveDataPayload;

        // --- Input Validation ---
        if (!input || typeof input !== 'object') {
             logger.error("Invalid input: Missing request body.");
             if (!res.headersSent) setCorsHeaders(req, res);
             res.status(400).json({ error: "Invalid input: Missing request body.", success: false });
             return;
        }
        if (!input.normalizedData || !input.normalizedData.website) {
            logger.error("Invalid input: Missing normalized website.", { payload: input });
             if (!res.headersSent) setCorsHeaders(req, res);
            res.status(400).json({ error: "Invalid input: Normalized website is required to save data.", success: false });
            return;
        }
        // Basic check for other potentially missing data, adjust as needed
         if (!input.originalData) {
             logger.warn("Input is missing originalData field.", { payload: input });
             // Allow proceeding, but log it
         }


        const website = input.normalizedData.website; // Use normalized website as the key identifier

        // --- Prepare Data for Firestore ---
        const dataToSave: CompanyDataToSave = {
            // Use normalized website as the primary key field in the document
            website: website,
            // Store original data for reference
            originalCompanyName: input.originalData?.companyName ?? null,
            originalCountry: input.originalData?.country ?? null,
            originalWebsite: input.originalData?.website ?? null,
             // Store normalized data
            normalizedCompanyName: input.normalizedData.companyName ?? null,
            normalizedCountry: input.normalizedData.country ?? null,
             // Store AI results
            summary: input.summary ?? null,
            independenceCriteria: input.independenceCriteria ?? "",
            insufficientInfo: input.insufficientInfo ?? "", // Field name from Genkit output
            // Add timestamp
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            // Add other fields from payload if necessary
        };

        // Remove null/undefined values before saving? Optional, depends on preference.
        // Object.keys(dataToSave).forEach(key => (dataToSave[key] === null || dataToSave[key] === undefined) && delete dataToSave[key]);


        // --- Firestore Operation ---
        logger.info(`Attempting to save data for website: ${website}`);
        const companiesRef = db.collection('companies');
        const query = companiesRef.where('website', '==', website).limit(1);
        const snapshot = await query.get();

        if (!snapshot.empty) {
            // Document exists, update it
            const docId = snapshot.docs[0].id;
            await companiesRef.doc(docId).update(dataToSave);
            logger.info(`Updated company data for website: ${website} (docId: ${docId})`);
            if (!res.headersSent) setCorsHeaders(req, res);
            res.status(200).json({ success: true, message: `Data updated for ${website}.` });
        } else {
            // Document does not exist, add it
            const docRef = await companiesRef.add(dataToSave); // Use add for auto-generated ID
            logger.info(`Added new company data for website: ${website} (new docId: ${docRef.id})`);
            if (!res.headersSent) setCorsHeaders(req, res);
            res.status(200).json({ success: true, message: `Data saved for new company ${website}.` });
        }

    } catch (error: unknown) {
        logger.error(`Error saving company data for website "${(req.body as SaveDataPayload)?.normalizedData?.website}":`, error);
        const message = error instanceof Error ? error.message : "Unknown error saving data.";
        if (!res.headersSent) { setCorsHeaders(req, res); }
        res.status(500).json({ error: `Failed to save data: ${message}`, success: false });
    }
});

