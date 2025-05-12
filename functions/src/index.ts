
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

// Define the structure for the result of processing a single row in Phase 3
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
    errorMessage?: string; // Optional error message for this row
    fetchedData?: { // Optional data fetched from Firestore
        summary?: string; // Example field, adjust as needed
        lastUpdated?: Date;
        // Add other relevant fields from Firestore doc
    };
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
                            const lastUpdatedDate = docData.lastUpdated.toDate();
                            if (lastUpdatedDate > sixMonthsAgo) {
                                status = 'Fetched';
                                fetchedData = {
                                    summary: docData.summary || null, // Adjust field names as needed
                                    lastUpdated: lastUpdatedDate,
                                    // Add other relevant fields
                                };
                                logger.info(`Found recent data for website: ${normalizedWebsite}`);
                            } else {
                                status = 'To Process'; // Data is old
                                logger.info(`Found old data for website: ${normalizedWebsite}, marking for reprocessing.`);
                            }
                        } else {
                            status = 'To Process'; // Missing or invalid timestamp
                            logger.warn(`Missing or invalid lastUpdated timestamp for website: ${normalizedWebsite}`);
                        }
                    } else {
                        status = 'To Process'; // Not found
                        logger.info(`No data found for website: ${normalizedWebsite}`);
                    }
                } catch (dbError) {
                    logger.error(`Firestore query error for website "${normalizedWebsite}":`, dbError);
                    errorMessage = `Firestore error checking website: ${normalizedWebsite}`;
                    status = 'Error';
                }
            } else if (status !== 'Error' && !normalizedWebsite && originalWebsite) {
                // Website existed but was invalid format after normalization attempt
                 errorMessage = `Invalid website format: ${originalWebsite}`;
                 status = 'Error';
            } else if (status !== 'Error') {
                // No website provided or error occurred earlier
                 logger.info("Skipping Firestore check as normalizedWebsite is null or status is Error.");
            }


            results.push({
                originalData: { companyName: originalCompanyName, country: originalCountry, website: originalWebsite },
                normalizedData: { companyName: normalizedCompanyName, country: normalizedCountry, website: normalizedWebsite },
                status,
                ...(errorMessage && { errorMessage }), // Add error message if present
                ...(fetchedData && { fetchedData }), // Add fetched data if present
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
