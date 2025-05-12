/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 * import {onMessagePublished} from "firebase-functions/v2/pubsub";
 * import {onObjectFinalized} from "firebase-functions/v2/storage";
 * import {onSchedule} from "firebase-functions/v2/scheduler";
 * import {onRequest} from "firebase-functions/v2/https";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import {onRequest} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import * as Busboy from "busboy";
import * as XLSX from "xlsx";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import * as cors from "cors";

// Import Genkit flow - assuming build places it correctly relative to lib/index.js
// Adjust path if necessary based on your build process
import {detectHeaders, DetectHeadersInput, DetectHeadersOutput} from "../../src/ai/flows/detect-headers-flow";


// Initialize CORS middleware with options allowing specific origins or all
// In production, restrict this to your app's domain
const corsHandler = cors({origin: true});


// Define the type for a row parsed from Excel
// Using any[] for flexibility, but could be more specific if needed
type ExcelRow = (string | number | boolean | Date | null)[];


export const parseSheet = onRequest({memory: "512MiB", timeoutSeconds: 60}, (req, res) => {
  // Handle CORS preflight requests and regular requests
  corsHandler(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    // Use Busboy to parse multipart/form-data
    const busboy = Busboy({headers: req.headers});
    const tmpdir = os.tmpdir();
    const fileWrites: Promise<void>[] = [];
    let uploadedFilePath = "";
    let fileBuffer: Buffer | null = null;

    // Listener for file stream
    busboy.on("file", (fieldname, file, filename) => {
      logger.info(`Processing file: ${filename.filename}`);

      // Note: Busboy types might show 'filename' directly, but examples often use the object structure.
      // Adjust based on actual library behavior if needed.
      const filepath = path.join(tmpdir, filename.filename);
      uploadedFilePath = filepath;

      const writeStream = fs.createWriteStream(filepath);
      file.pipe(writeStream);

      // Collect file buffer in memory (alternative to writing to disk)
      const chunks: Buffer[] = [];
       file.on("data", (chunk) => {
         chunks.push(chunk);
       });

      // File was processed by Busboy; wait for stream finish
      const promise = new Promise<void>((resolve, reject) => {
        file.on("end", () => {
           fileBuffer = Buffer.concat(chunks); // Store buffer when file stream ends
          writeStream.end();
        });
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
      });
      fileWrites.push(promise);
    });


    // Listener for completion of form parsing
    busboy.on("finish", async () => {
      try {
        // Wait for all file writes to complete (if writing to disk)
        // await Promise.all(fileWrites); - No longer strictly needed if using buffer

        if (!fileBuffer) {
            // If we didn't write to disk and buffer is empty, means no file was uploaded correctly
             if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
                // Fallback: read from disk if buffer failed but file exists
                logger.warn("Reading file from disk as buffer was null.");
                fileBuffer = fs.readFileSync(uploadedFilePath);
            } else {
                 throw new Error("No file uploaded or file buffer is empty.");
            }
        }

        logger.info("Parsing workbook from buffer...");
        // Parse the workbook directly from the buffer
        const workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        if (!worksheet) {
            throw new Error(`Sheet "${sheetName}" not found or empty.`);
        }

        // Use header: 1 to get array of arrays, defval: null for empty cells
        const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, { header: 1, defval: null });

        if (jsonData.length === 0) {
           res.status(200).json({ headers: [], rows: [] }); // Return empty if sheet has no data
           return; // Exit early
        }

        // Extract headers (first row), ensuring they are strings
        const headers: string[] = jsonData[0].map((header) => String(header ?? ""));
        // Extract rows (subsequent rows)
        const rows: ExcelRow[] = jsonData.slice(1);

        logger.info(`Parsed ${headers.length} headers and ${rows.length} rows.`);
        res.status(200).json({ headers, rows });
      } catch (error: unknown) {
        logger.error("Error parsing Excel file:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown parsing error";
        res.status(500).json({ error: `Failed to parse Excel file: ${errorMessage}` });
      } finally {
         // Clean up the temporary file if it was created
         if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
           try {
             fs.unlinkSync(uploadedFilePath);
             logger.info(`Temporary file deleted: ${uploadedFilePath}`);
           } catch (unlinkError) {
             logger.error(`Error deleting temporary file ${uploadedFilePath}:`, unlinkError);
           }
         }
      }
    });

     // Handle errors from Busboy
     busboy.on("error", (err) => {
       logger.error("Busboy error:", err);
       res.status(500).json({error: "Error processing form data."});
     });

    // Pipe request to Busboy - needed for Node.js streams < v16
     if ((req as any).rawBody) {
       busboy.end((req as any).rawBody);
     } else {
       req.pipe(busboy);
     }
  });
});


// New Function: detectHeaders
export const detectHeaders = onRequest({memory: "512MiB", timeoutSeconds: 60}, (req, res) => {
    corsHandler(req, res, async () => {
        if (req.method !== "POST") {
            res.status(405).send("Method Not Allowed");
            return;
        }

        try {
            const inputData = req.body as DetectHeadersInput;

            // Basic validation
            if (!inputData || !Array.isArray(inputData.headers) || inputData.headers.length === 0) {
                logger.error("Invalid input: 'headers' array is required.", { body: req.body });
                res.status(400).json({ error: "Invalid input: 'headers' array is required." });
                return;
            }

             logger.info("Calling detectHeaders Genkit flow with headers:", inputData.headers);

            // Call the Genkit flow
            const result: DetectHeadersOutput = await detectHeaders(inputData);

             logger.info("detectHeaders Genkit flow completed successfully.", { result });
            res.status(200).json(result);

        } catch (error: unknown) {
             logger.error("Error calling detectHeaders Genkit flow:", error);
             const errorMessage = error instanceof Error ? error.message : "Unknown AI processing error";
             // Consider more specific error codes based on Genkit errors if possible
             res.status(500).json({ error: `Failed to detect headers: ${errorMessage}` });
        }
    });
});
