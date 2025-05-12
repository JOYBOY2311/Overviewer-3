
/**
 * Import function triggers from their respective submodules:
 * ... (comments) ...
 */

import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import { Request, Response } from "express";
// import * as Busboy from "busboy"; // <--- REMOVED THIS
import Busboy from 'busboy'; // <--- ADDED THIS (Default Import)
import * as XLSX from "xlsx";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import * as admin from 'firebase-admin'; // Added Firebase Admin SDK
import axios from 'axios'; // Added Axios for scraping
import * as cheerio from 'cheerio'; // Added Cheerio for scraping


// Import Genkit flow - Renamed import, REMOVED DetectHeadersOutput type import
import { detectHeaders as detectHeadersFlow, DetectHeadersInput, DetectHeadersOutput } from "../../src/ai/flows/detect-headers-flow"; // Assuming path is resolved

// --- Initialize Firebase Admin SDK ---
// Do this once globally
try {
    admin.initializeApp();
    logger.info("Firebase Admin SDK initialized successfully.");
} catch (error) {
    logger.error("Error initializing Firebase Admin SDK:", error);
    // If initialization fails, subsequent Firestore operations will likely fail.
    // Consider how to handle this based on your app's requirements.
    // For now, log the error and let the functions proceed (they will likely fail later).
}
const db = admin.firestore(); // Get Firestore instance
// ------------------------------------


// Define the type for a row parsed from Excel
type ExcelRow = (string | number | boolean | Date | null)[];

// Define the mapping structure confirmed by the user
type ConfirmedHeaderMapping = {
    name: string | null;
    country: string | null;
    website: string | null;
};

// Define the structure for the result of processing a single row in Phase 3 & 4
type ProcessedRowResult = {
    originalData: {
        companyName: string | null;
        country: string | null;
        website: string | null;
        // Add other original fields if needed
    };
    normalizedData: {
        companyName: string | null;
        country: string | null;
        website: string | null;
    };
    status: 'Fetched' | 'To Process' | 'Error';
    errorMessage?: string; // Optional error message for this row (from normalization/Firestore check)
    fetchedData?: { // Optional data fetched from Firestore
        summary?: string; // Example field, adjust as needed
        lastUpdated?: admin.firestore.Timestamp | string; // Keep timestamp for server logic, string for client
        // Add other relevant fields from Firestore doc
    };
    // Added for Phase 4
    scrapingStatus?: 'Pending' | 'Scraping' | 'Success' | 'Failed_Scrape' | 'Failed_Error';
    scrapedText?: string | null;
    scrapingErrorMessage?: string; // Specific error message for scraping
};

// --- Helper function for Manual CORS ---
const setCorsHeaders = (req: Request, res: Response): void => {
    res.set("Access-Control-Allow-Origin", "*"); // Adjust for production if needed
    res.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS, POST, PUT");
    res.set("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
};
// --------------------------------------

export const parseSheet = onRequest({ memory: "512MiB", timeoutSeconds: 60 }, (req: Request, res: Response) => {
    // --- Manual CORS Handling ---
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
    }
    // --------------------------

    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed"); return;
    }

    try { // Added outer try block for synchronous errors like Busboy constructor
        const busboy = Busboy({ headers: req.headers }); // Call remains the same, relies on default import now
        const tmpdir = os.tmpdir();
        const fileWrites: Promise<void>[] = [];
        let uploadedFilePath = "";
        let fileBuffer: Buffer | null = null;

        busboy.on("file", (fieldname: string, file: NodeJS.ReadableStream, filename: Busboy.FileInfo) => { // Corrected FileInfo type usage if needed based on @types/busboy
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
                // Enforce cellDates: false to avoid potential date object issues downstream
                // If dates are needed, handle conversion carefully later.
                const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: false });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                if (!worksheet) { throw new Error(`Sheet "${sheetName}" not found or empty.`); }
                // Parse with raw: true to get raw cell values (strings, numbers, booleans)
                const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, { header: 1, defval: null, raw: true });
                if (jsonData.length === 0) { logger.info("Sheet contains no data."); res.status(200).json({ headers: [], rows: [] }); return; }

                // Ensure headers are strings
                const headers: string[] = jsonData[0].map((header) => String(header ?? ""));

                // Ensure rows are arrays of primitive types or null
                const rows: ExcelRow[] = jsonData.slice(1).map(row =>
                    row.map(cell => (cell === undefined ? null : cell)) // Replace undefined with null
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

    } catch(error) { // Catch synchronous errors (e.g., Busboy constructor failure)
         logger.error("Synchronous error in parseSheet:", error);
         const errorMessage = error instanceof Error ? error.message : "Unknown error";
          if (!res.headersSent) { setCorsHeaders(req, res); }
         res.status(500).json({ error: `Failed to process request: ${errorMessage}` });
    }
});


export const detectHeaders = onRequest({ memory: "512MiB", timeoutSeconds: 60 }, (req: Request, res: Response) => {
    // --- Manual CORS Handling ---
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
    }
    // --------------------------

    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed"); return;
    }

    try {
        const inputData = req.body as DetectHeadersInput; // Type assertion used here
        if (!inputData || !Array.isArray(inputData.headers) || inputData.headers.length === 0) {
            logger.error("Invalid input: 'headers' array is required.", { body: req.body });
            if (!res.headersSent) { setCorsHeaders(req, res); }
            res.status(400).json({ error: "Invalid input: 'headers' array is required and must not be empty." });
            return;
        }

        logger.info("Calling detectHeaders Genkit flow with headers:", inputData.headers);

        // Call the RENAMED Genkit flow import using .then() and .catch()
        detectHeadersFlow(inputData).then((result: DetectHeadersOutput) => { // Explicitly type result
            logger.info("detectHeaders Genkit flow completed successfully.", { result });
            if (!res.headersSent) { setCorsHeaders(req, res); }
            res.status(200).json(result);
        }).catch((error: Error) => { // Catch block expects Error type
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


// --- Phase 3: Normalize and Check Function ---
export const normalizeAndCheck = onRequest({ memory: "1GiB", timeoutSeconds: 120 }, async (req: Request, res: Response): Promise<void> => {
    // --- Manual CORS Handling ---
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
    }
    // --------------------------

    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed"); return;
    }

    let allHeaders: string[] = []; // Keep track of headers for index lookup

    try {
        // --- Input Validation ---
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
        allHeaders = inputHeaders; // Store headers for index lookup

        logger.info(`Starting normalizeAndCheck for ${rows.length} rows.`);
        const results: ProcessedRowResult[] = [];
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        // --- Helper Function to get index safely ---
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


        // --- Processing Logic ---
        for (const row of rows) {
            let status: 'Fetched' | 'To Process' | 'Error' = 'To Process';
            let fetchedData: ProcessedRowResult['fetchedData'] | undefined = undefined;
            let errorMessage: string | undefined = undefined;
            let scrapingStatus: ProcessedRowResult['scrapingStatus'] = 'Pending'; // Initialize scraping status

            // Extract Original Data (handle potential index errors)
            const originalCompanyName = nameIndex !== -1 ? String(row[nameIndex] ?? '') : null;
            const originalCountry = countryIndex !== -1 ? String(row[countryIndex] ?? '') : null;
            const originalWebsite = websiteIndex !== -1 ? String(row[websiteIndex] ?? '') : null;

            // Normalize Data
            const normalizedCompanyName = originalCompanyName ? originalCompanyName.trim().toLowerCase() : null;
            const normalizedCountry = originalCountry ? originalCountry.trim().toLowerCase() : null;
            let normalizedWebsite: string | null = null;
            if (originalWebsite) {
                try {
                    let tempWebsite = originalWebsite.trim().toLowerCase();
                    // Basic normalization: remove http(s)://, www., trailing /
                    tempWebsite = tempWebsite.replace(/^https?:\/\//, '');
                    tempWebsite = tempWebsite.replace(/^www\./, '');
                    tempWebsite = tempWebsite.replace(/\/$/, '');
                    // Basic validation: check for presence of a dot and no spaces
                    if (tempWebsite.includes('.') && !tempWebsite.includes(' ')) {
                         normalizedWebsite = tempWebsite;
                    } else {
                        logger.warn(`Invalid website format skipped: ${originalWebsite}`);
                        // Keep normalizedWebsite as null if format seems wrong
                    }
                } catch (normError) {
                    logger.error(`Error normalizing website "${originalWebsite}":`, normError);
                    errorMessage = `Error normalizing website: ${originalWebsite}`;
                    status = 'Error';
                    scrapingStatus = 'Failed_Error'; // Cannot scrape if normalization failed
                }
            }

            // Firestore Check (only if normalization didn't error and website is present)
            if (status !== 'Error' && normalizedWebsite) {
                 try {
                    const companiesRef = db.collection('companies');
                    const query = companiesRef.where('website', '==', normalizedWebsite).limit(1);
                    const snapshot = await query.get();

                    if (!snapshot.empty) {
                        const doc = snapshot.docs[0];
                        const docData = doc.data();

                        if (docData.lastUpdated && docData.lastUpdated instanceof admin.firestore.Timestamp) {
                            const lastUpdatedTimestamp = docData.lastUpdated; // Keep as Timestamp
                            const lastUpdatedDate = lastUpdatedTimestamp.toDate();
                            if (lastUpdatedDate > sixMonthsAgo) {
                                status = 'Fetched';
                                fetchedData = {
                                    summary: docData.summary || null, // Adjust field names as needed
                                    lastUpdated: lastUpdatedTimestamp, // Keep as Timestamp for server
                                    // Add other relevant fields
                                };
                                scrapingStatus = undefined; // No scraping needed if fetched
                                logger.info(`Found recent data for website: ${normalizedWebsite}`);
                            } else {
                                status = 'To Process'; // Data is old
                                scrapingStatus = 'Pending'; // Needs scraping
                                logger.info(`Found old data for website: ${normalizedWebsite}, marking for reprocessing.`);
                            }
                        } else {
                            status = 'To Process'; // Missing or invalid timestamp
                            scrapingStatus = 'Pending'; // Needs scraping
                            logger.warn(`Missing or invalid lastUpdated timestamp for website: ${normalizedWebsite}`);
                        }
                    } else {
                        status = 'To Process'; // Not found
                        scrapingStatus = 'Pending'; // Needs scraping
                        logger.info(`No data found for website: ${normalizedWebsite}`);
                    }
                } catch (dbError) {
                    logger.error(`Firestore query error for website "${normalizedWebsite}":`, dbError);
                    errorMessage = `Firestore error checking website: ${normalizedWebsite}`;
                    status = 'Error';
                    scrapingStatus = 'Failed_Error'; // Cannot scrape if DB check failed
                }
            } else if (status !== 'Error' && !normalizedWebsite && originalWebsite) {
                // Website existed but was invalid format after normalization attempt
                 errorMessage = `Invalid website format: ${originalWebsite}`;
                 status = 'Error';
                 scrapingStatus = 'Failed_Error'; // Cannot scrape invalid URL
            } else if (status !== 'Error' && !normalizedWebsite) {
                 // No website provided
                 status = 'To Process'; // Still processable maybe, but no website to check/scrape
                 scrapingStatus = undefined; // Cannot scrape without a website
                 logger.info("No website provided, skipping Firestore check and scraping.");
            } else if (status === 'Error') {
                 // Error occurred during normalization, already handled scrapingStatus
                 logger.info("Skipping Firestore check due to prior normalization error.");
            }


            results.push({
                originalData: { companyName: originalCompanyName, country: originalCountry, website: originalWebsite },
                normalizedData: { companyName: normalizedCompanyName, country: normalizedCountry, website: normalizedWebsite },
                status,
                scrapingStatus, // Include initial scraping status
                ...(errorMessage && { errorMessage }), // Add error message if present
                ...(fetchedData && {
                    fetchedData: {
                        ...fetchedData,
                        // Convert timestamp to string for JSON serialization if needed by client,
                        // but maybe client doesn't need it directly? Let's keep it as Timestamp for now.
                        // lastUpdated: fetchedData.lastUpdated instanceof admin.firestore.Timestamp
                        //                 ? fetchedData.lastUpdated.toDate().toISOString()
                        //                 : undefined,
                    }
                }),
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


// --- Phase 4: Scrape Website Content Function ---

// Helper function to scrape a single URL
async function scrapeSingleUrl(url: string): Promise<string | null> {
    try {
        logger.info(`Attempting to scrape: ${url}`);
        const response = await axios.get(url, {
            timeout: 15000, // 15 seconds timeout
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36', // Mimic browser
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
            if (text.length < 500) { // If article is short or non-existent, try main
                 $('main').each((i, el) => { text += $(el).text() + '\n\n'; });
            }
            // If still very little text, resort to paragraphs
            if (text.trim().length < 500) {
                logger.info(`Low text from article/main tags for ${url}, trying p tags.`);
                text = $('p').map((i, el) => $(el).text()).get().join('\n\n');
            }

            const sanitizedText = text.replace(/\s\s+/g, ' ').trim();
            logger.info(`Successfully scraped ${url}, raw length: ${text.length}, sanitized length: ${sanitizedText.length}`);
            return sanitizedText.length > 50 ? sanitizedText : null; // Return null if very little text found
        } else {
            logger.warn(`Scraping ${url} failed with status: ${response.status}`);
            return null;
        }
    } catch (error: any) {
        if (axios.isAxiosError(error)) {
            logger.error(`Axios error scraping ${url}: ${error.message}`, { status: error.response?.status });
        } else {
            logger.error(`Error scraping ${url}:`, error);
        }
        return null;
    }
}

export const scrapeWebsiteContent = onRequest({ memory: "1GiB", timeoutSeconds: 60 }, async (req: Request, res: Response): Promise<void> => {
     // --- Manual CORS Handling ---
    setCorsHeaders(req, res);
    if (req.method === "OPTIONS") {
        res.status(204).send(""); return;
    }
    // --------------------------

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

        const fullUrl = `https://${websiteUrl}`;
        let scrapedText: string | null = null;
        let finalStatus: ProcessedRowResult['scrapingStatus'] = 'Failed_Error'; // Default to error
        let errorMessage: string | undefined;

        try {
             scrapedText = await scrapeSingleUrl(fullUrl);

             // Optionally try '/about' page if main page yielded little text
             if (!scrapedText || scrapedText.length < 1000) { // Threshold for trying /about
                logger.info(`Main page scrape for ${websiteUrl} yielded little text, trying /about...`);
                const aboutUrl = `${fullUrl}/about`;
                const aboutText = await scrapeSingleUrl(aboutUrl);
                if (aboutText) {
                    scrapedText = (scrapedText ? scrapedText + '\n\n--- About Page ---\n\n' : '') + aboutText;
                    logger.info(`Appended text from ${aboutUrl}`);
                }
             }

             if (scrapedText && scrapedText.length > 0) {
                 finalStatus = 'Success';
                 // Limit length
                 const maxLength = 10000; // Approx 10k characters
                 if (scrapedText.length > maxLength) {
                     scrapedText = scrapedText.substring(0, maxLength) + '... [truncated]';
                     logger.info(`Truncated scraped text for ${websiteUrl} to ${maxLength} characters.`);
                 }
             } else {
                 finalStatus = 'Failed_Scrape';
                 errorMessage = `Scraping successful but yielded no significant content from ${websiteUrl} or its /about page.`;
                 logger.warn(errorMessage);
             }

        } catch (scrapeError: any) {
            logger.error(`Unexpected error during scraping process for ${websiteUrl}:`, scrapeError);
            finalStatus = 'Failed_Error';
            errorMessage = scrapeError instanceof Error ? scrapeError.message : "Unknown scraping error occurred.";
            scrapedText = null; // Ensure text is null on error
        }


        if (!res.headersSent) setCorsHeaders(req, res);
        res.status(200).json({
            scrapedText,
            status: finalStatus,
            ...(errorMessage && { error: errorMessage }) // Include error message if scrape failed
        });

    } catch (error: unknown) {
        logger.error("Error in scrapeWebsiteContent function:", error);
        const message = error instanceof Error ? error.message : "Unknown processing error";
        if (!res.headersSent) { setCorsHeaders(req, res); }
        res.status(500).json({ error: `Failed to process scraping request: ${message}`, status: 'Failed_Error', scrapedText: null });
    }
});
