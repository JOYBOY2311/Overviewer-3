
"use client";

import type { ChangeEvent} from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Upload, Loader2, CheckCircle, XCircle, AlertCircle, FileCheck2, SearchCode, Bot } from 'lucide-react'; // Added SearchCode, Bot

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'; // Added CardFooter
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";
import { parseSheetFunctionUrl, detectHeadersFunctionUrl, normalizeAndCheckFunctionUrl, scrapeWebsiteContentFunctionUrl } from '@/lib/config'; // Added scrapeWebsiteContentFunctionUrl
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import type { DetectHeadersOutput } from '@/ai/flows/detect-headers-flow';
import { cn } from "@/lib/utils"; // Import cn for conditional classes
import { Badge } from "@/components/ui/badge"; // Import Badge for status display
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip" // Import Tooltip components

// Type for raw data parsed from Excel
type ExcelRow = (string | number | boolean | Date | null)[];

// Type for header mapping confirmed by user
type HeaderMappingKey = 'companyNameHeader' | 'countryHeader' | 'websiteHeader';
type ConfirmedHeaderMapping = {
    name: string | null;
    country: string | null;
    website: string | null;
};

// Type definition for the response from scrapeWebsiteContent function
type ScrapeResult = {
    scrapedText: string | null;
    status: 'Success' | 'Failed_Scrape' | 'Failed_Error';
    error?: string;
};


// Type for the result of processing a single row (Phases 3 & 4)
type ProcessedRow = {
    originalData: {
        companyName: string | null;
        country: string | null;
        website: string | null;
        [key: string]: string | number | boolean | Date | null;
    };
    normalizedData: {
        companyName: string | null;
        country: string | null;
        website: string | null;
    };
    status: 'Fetched' | 'To Process' | 'Error'; // Phase 3 status
    errorMessage?: string; // Phase 3 error
    fetchedData?: {
        summary?: string;
        lastUpdated?: string; // Store as string after JSON serialization
    };
    originalIndex: number; // Added index for mapping
    // Phase 4 fields
    scrapingStatus?: 'Pending' | 'Scraping' | 'Success' | 'Failed_Scrape' | 'Failed_Error';
    scrapedText?: string | null;
    scrapingErrorMessage?: string; // Phase 4 error
};


export default function Home() {
  // --- Phase 1 State ---
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<ExcelRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // --- Phase 2 State ---
  const [aiSuggestedHeaders, setAiSuggestedHeaders] = useState<DetectHeadersOutput | null>(null);
  const [isDetectingHeaders, setIsDetectingHeaders] = useState<boolean>(false);
  const [detectHeadersError, setDetectHeadersError] = useState<string | null>(null);
  const [manualHeaderSelection, setManualHeaderSelection] = useState<DetectHeadersOutput>({
      companyNameHeader: null,
      countryHeader: null,
      websiteHeader: null,
  });
  const [confirmedHeaders, setConfirmedHeaders] = useState<ConfirmedHeaderMapping | null>(null);
  const [showConfirmationUI, setShowConfirmationUI] = useState<boolean>(false);

  // --- Phase 3 State ---
  const [processedRows, setProcessedRows] = useState<ProcessedRow[]>([]);
  const [isProcessingPhase3, setIsProcessingPhase3] = useState<boolean>(false);
  const [phase3Error, setPhase3Error] = useState<string | null>(null);

  // --- Phase 4 State ---
  const [isScraping, setIsScraping] = useState<boolean>(false);
  const [scrapingErrors, setScrapingErrors] = useState<Record<number, string | null>>({}); // Store errors per row index


  // --- Calculated State ---
  const rowsToProcessCount = processedRows.filter(row => row.status === 'To Process' && row.scrapingStatus === 'Pending').length;
  const rowsSuccessfullyScrapedCount = processedRows.filter(row => row.scrapingStatus === 'Success').length;
  const rowsFailedScrapeCount = processedRows.filter(row => row.scrapingStatus === 'Failed_Scrape' || row.scrapingStatus === 'Failed_Error').length;


  // --- Effects ---

  // Effect to trigger AI header detection when headers are available
  useEffect(() => {
    if (rawHeaders.length > 0 && !confirmedHeaders && !aiSuggestedHeaders && !isDetectingHeaders && !isParsing) {
       callDetectHeaders();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawHeaders, confirmedHeaders, aiSuggestedHeaders, isDetectingHeaders, isParsing]); // Dependencies ensure this runs when headers are ready

  // Effect to update manual selection when AI suggestions arrive
  useEffect(() => {
    if (aiSuggestedHeaders) {
      setManualHeaderSelection({
        companyNameHeader: aiSuggestedHeaders.companyNameHeader,
        countryHeader: aiSuggestedHeaders.countryHeader,
        websiteHeader: aiSuggestedHeaders.websiteHeader,
      });
      setShowConfirmationUI(true); // Show confirmation UI once suggestions are loaded
    }
  }, [aiSuggestedHeaders]);

  // --- API Calls ---

  const callDetectHeaders = async () => {
    if (!rawHeaders || rawHeaders.length === 0) return;
    console.log("Calling detectHeaders function with headers:", rawHeaders);
    setIsDetectingHeaders(true);
    setDetectHeadersError(null);
    setAiSuggestedHeaders(null); // Reset previous suggestions

    try {
      const response = await fetch(detectHeadersFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers: rawHeaders }), // Pass rawHeaders
      });

      if (!response.ok) {
        let errorMsg = `Error detecting headers (Status: ${response.status})`;
        try {
            const errorData = await response.json();
            if(errorData.error) errorMsg += `: ${errorData.error}`;
        } catch (e) { /* ignore if response not json */ }
        throw new Error(errorMsg);
      }

      const result: DetectHeadersOutput = await response.json();
      console.log("Received AI suggestions:", result);
      setAiSuggestedHeaders(result);
      // Manual selection state will be updated by the useEffect hook watching aiSuggestedHeaders

    } catch (error) {
      console.error("Error calling detectHeaders function:", error);
      const message = error instanceof Error ? error.message : "Unknown error during header detection.";
      setDetectHeadersError(message);
    } finally {
      setIsDetectingHeaders(false);
    }
  };

  // --- Event Handlers ---

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset ALL states for a new file
    setFileName(file.name);
    setRawHeaders([]);
    setRawRows([]);
    setParseError(null);
    setIsParsing(true);
    setUploadProgress(0);
    setAiSuggestedHeaders(null);
    setConfirmedHeaders(null);
    setManualHeaderSelection({ companyNameHeader: null, countryHeader: null, websiteHeader: null });
    setIsDetectingHeaders(false);
    setDetectHeadersError(null);
    setShowConfirmationUI(false);
    setProcessedRows([]);
    setIsProcessingPhase3(false);
    setPhase3Error(null);
    setIsScraping(false); // Reset scraping state
    setScrapingErrors({}); // Reset scraping errors


    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
        }
      };

      xhr.open('POST', parseSheetFunctionUrl, true);

      xhr.onload = () => {
        setIsParsing(false); // Parsing attempt finished
        if (xhr.status === 200) {
          try {
            const result = JSON.parse(xhr.responseText);
            if (result.error) {
               setParseError(`Function Error: ${result.error}`);
               setRawHeaders([]);
               setRawRows([]);
            } else if (result.headers && result.rows) {
              // Ensure headers are strings and rows are arrays of primitives/null
              const safeHeaders = result.headers.map((h: any) => String(h ?? ""));
              const safeRows = result.rows.map((row: any[]) =>
                  row.map(cell => (cell === undefined ? null : cell))
              );
              setRawHeaders(safeHeaders);
              setRawRows(safeRows);
              setParseError(null);
              // AI detection will be triggered by useEffect watching rawHeaders
            } else {
              setParseError("Invalid response format from the parse function.");
              setRawHeaders([]);
              setRawRows([]);
            }
          } catch (parseErr) {
             console.error("Error parsing function response:", parseErr);
             setParseError(`Failed to parse response from the function. Error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
             setRawHeaders([]);
             setRawRows([]);
          }
        } else {
          console.error("Error calling parseSheet function:", xhr.statusText, xhr.responseText);
          let errorMessage = `Error calling parse function (Status: ${xhr.status})`;
          try {
             const errorResponse = JSON.parse(xhr.responseText);
             if(errorResponse.error) errorMessage += `: ${errorResponse.error}`;
          } catch (e) { /* Ignore if response is not JSON */ }
          setParseError(errorMessage);
          setRawHeaders([]);
          setRawRows([]);
        }
         if (xhr.status !== 200) {
            setUploadProgress(0);
         }
      };

      xhr.onerror = () => {
        setIsParsing(false);
        setUploadProgress(0);
        console.error("Network error during upload:", xhr.statusText);
        setParseError("Network error: Failed to connect to the parsing service.");
        setRawHeaders([]);
        setRawRows([]);
      };

      xhr.send(formData);

    } catch (err) {
      setIsParsing(false);
      setUploadProgress(0);
      console.error("Error setting up the upload request:", err);
      setParseError(`An unexpected error occurred during setup. Error: ${err instanceof Error ? err.message : String(err)}`);
      setRawHeaders([]);
      setRawRows([]);
    } finally {
       if (event.target) {
           event.target.value = '';
       }
    }
  };

  const handleManualHeaderChange = (key: HeaderMappingKey, value: string) => {
     // Allow deselecting by mapping empty string value to null
     const selectedValue = value === "" ? null : value;
     setManualHeaderSelection(prev => ({
         ...prev,
         [key]: selectedValue,
     }));
  };

  const handleConfirmHeaders = async () => { // Make async
    const currentlyConfirmed = {
        name: manualHeaderSelection.companyNameHeader,
        country: manualHeaderSelection.countryHeader,
        website: manualHeaderSelection.websiteHeader,
    };
    setConfirmedHeaders(currentlyConfirmed);
    setShowConfirmationUI(false); // Hide confirmation UI after confirming
    console.log("Headers confirmed:", currentlyConfirmed);

    // --- Trigger Phase 3 ---
    setProcessedRows([]); // Clear previous results
    setIsProcessingPhase3(true);
    setPhase3Error(null);
    setIsScraping(false); // Ensure scraping state is reset
    setScrapingErrors({});

    try {
        console.log("Calling normalizeAndCheck with:", { rows: rawRows, confirmedHeaders: currentlyConfirmed, headers: rawHeaders }); // Log headers
        const response = await fetch(normalizeAndCheckFunctionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: rawRows, confirmedHeaders: currentlyConfirmed, headers: rawHeaders }), // Send headers too
        });

        if (!response.ok) {
            let errorMsg = `Error during normalization/check (Status: ${response.status})`;
             try {
                 const errorData = await response.json();
                 if (errorData.error) errorMsg += `: ${errorData.error}`;
             } catch (e) { /* ignore if response not json */ }
             throw new Error(errorMsg);
        }

        const results: ProcessedRow[] = await response.json();
         // Add originalIndex to map back easily
         const resultsWithIndex = results.map((row, index) => ({
            ...row,
            originalIndex: index,
            // Initialize scraping status if not set by backend (e.g., if status is Fetched or Error)
            scrapingStatus: row.scrapingStatus ?? (row.status === 'To Process' ? 'Pending' : undefined),
         }));
        console.log("Received processed rows:", resultsWithIndex);
        setProcessedRows(resultsWithIndex);
        // Scraping will be triggered manually via button

    } catch (error) {
        console.error("Error calling normalizeAndCheck function:", error);
        const message = error instanceof Error ? error.message : "Unknown error during Phase 3 processing.";
        setPhase3Error(message);
    } finally {
        setIsProcessingPhase3(false);
    }
  };

  const handleScraping = async () => {
    if (!processedRows.length) return;

    console.log("Starting scraping process...");
    setIsScraping(true);
    setScrapingErrors({}); // Clear previous errors

    // Create a copy to modify and update state progressively
    let updatedRows = [...processedRows];

    // Collect promises for all scraping calls
    const scrapingPromises = updatedRows.map(async (row, index) => {
        if (row.status === 'To Process' && row.normalizedData.website && row.scrapingStatus === 'Pending') {
            // Update UI immediately to show 'Scraping'
            updatedRows[index] = { ...row, scrapingStatus: 'Scraping' };
            setProcessedRows([...updatedRows]); // Update state to show 'Scraping'

            try {
                const response = await fetch(scrapeWebsiteContentFunctionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        websiteUrl: row.normalizedData.website,
                        companyName: row.originalData.companyName,
                    }),
                });

                if (!response.ok) {
                    let errorMsg = `Scraping failed (Status: ${response.status})`;
                    let resultStatus : ProcessedRow['scrapingStatus'] = 'Failed_Error';
                    try {
                        const errorData = await response.json();
                         if(errorData.error) errorMsg += `: ${errorData.error}`;
                         if(errorData.status) resultStatus = errorData.status; // Use status from backend if available
                    } catch (e) { /* ignore if response not json */ }
                    throw new Error(errorMsg);
                }

                const result: ScrapeResult = await response.json();
                console.log(`Scraping result for row ${row.originalIndex}:`, result);

                // Update the specific row in the copied array
                 updatedRows[index] = {
                    ...updatedRows[index],
                    scrapingStatus: result.status, // 'Success', 'Failed_Scrape', 'Failed_Error'
                    scrapedText: result.scrapedText,
                    scrapingErrorMessage: result.error,
                 };

            } catch (error) {
                console.error(`Error scraping website for row ${row.originalIndex}:`, error);
                 const message = error instanceof Error ? error.message : "Unknown scraping error.";
                 updatedRows[index] = {
                    ...updatedRows[index],
                    scrapingStatus: 'Failed_Error',
                    scrapedText: null,
                    scrapingErrorMessage: message,
                 };
                // Update scraping errors state
                setScrapingErrors(prev => ({ ...prev, [row.originalIndex]: message }));
            } finally {
                 // Update state after each row finishes to show progress
                 setProcessedRows([...updatedRows]);
            }
        }
        // Return void or a marker, not modifying original array directly
        return;
    });

    // Wait for all scraping attempts to finish (or fail)
    await Promise.allSettled(scrapingPromises);

    console.log("Scraping process finished.");
    setIsScraping(false);
};


  // --- Rendering Logic ---

   const renderCellContent = (cellData: string | number | boolean | Date | null): React.ReactNode => {
    // Simplified: Convert all to string or empty string for display
    return cellData !== null && cellData !== undefined ? String(cellData) : '';
  };

  // Helper to get highlight class based on confirmed or suggested headers
  const getHighlightClass = (header: string): string => {
     const currentSelection = confirmedHeaders ? {
         companyNameHeader: confirmedHeaders.name,
         countryHeader: confirmedHeaders.country,
         websiteHeader: confirmedHeaders.website
     } : manualHeaderSelection; // Use manual selection for highlighting before confirmation

      if (!currentSelection) return "";

      if (header === currentSelection.companyNameHeader) return "bg-blue-100 dark:bg-blue-900/30 font-semibold";
      if (header === currentSelection.countryHeader) return "bg-green-100 dark:bg-green-900/30 font-semibold";
      if (header === currentSelection.websiteHeader) return "bg-yellow-100 dark:bg-yellow-900/30 font-semibold";
      return "";
  };

  const renderHeaderSelector = (label: string, mappingKey: HeaderMappingKey) => {
    const aiSuggestion = aiSuggestedHeaders?.[mappingKey] ?? null;
    const currentValue = manualHeaderSelection[mappingKey] ?? ""; // Use empty string for Select value when null

    return (
        <div className="grid grid-cols-3 items-center gap-4">
            <Label htmlFor={`select-${mappingKey}`} className="text-right font-medium">{label}:</Label>
            <div className="col-span-2 flex items-center gap-2">
                 <Select
                    value={currentValue}
                    onValueChange={(value) => handleManualHeaderChange(mappingKey, value)}
                    disabled={!rawHeaders.length || isDetectingHeaders || isProcessingPhase3 || isScraping}
                >
                    <SelectTrigger id={`select-${mappingKey}`} className="w-full">
                        <SelectValue placeholder="Select Header..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="">(None)</SelectItem>
                        {rawHeaders.map((h, idx) => (
                            <SelectItem key={`${h}-${idx}`} value={h}>{h}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                 {aiSuggestion && currentValue !== aiSuggestion && (
                     <span className="text-xs text-muted-foreground whitespace-nowrap">(AI: {aiSuggestion})</span>
                 )}
                 {aiSuggestion && currentValue === aiSuggestion && (
                     <CheckCircle className="h-4 w-4 text-green-500 ml-1 shrink-0" title={`AI suggested: ${aiSuggestion}`} />
                 )}
                 {!aiSuggestion && currentValue && ( // User selected something, AI didn't suggest
                     <FileCheck2 className="h-4 w-4 text-blue-500 ml-1 shrink-0" title="Manually selected"/>
                 )}
                  {!aiSuggestion && !currentValue && ( // Nothing selected, nothing suggested
                     <XCircle className="h-4 w-4 text-muted-foreground ml-1 shrink-0" title="No suggestion"/>
                  )}
            </div>

        </div>
    );
};

 const renderStatusBadge = (status: ProcessedRow['status']) => {
      switch (status) {
          case 'Fetched':
              return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Fetched</Badge>;
          case 'To Process':
              return <Badge variant="outline" className="border-blue-400 text-blue-700 dark:border-blue-600 dark:text-blue-400">To Process</Badge>;
          case 'Error':
              return <Badge variant="destructive">Error</Badge>;
          default:
              return <Badge variant="secondary">Unknown</Badge>;
      }
  };

 const renderScrapingStatus = (row: ProcessedRow) => {
     if (!row.scrapingStatus || row.status === 'Fetched' || row.status === 'Error') {
         return <span className="text-xs text-muted-foreground italic">N/A</span>; // Not applicable if Fetched or Error in Phase 3
     }

     const error = scrapingErrors[row.originalIndex];

     switch (row.scrapingStatus) {
         case 'Pending':
             return <Badge variant="outline">Pending Scrape</Badge>;
         case 'Scraping':
             return (
                 <Badge variant="secondary" className="animate-pulse">
                     <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                     Scraping...
                 </Badge>
             );
         case 'Success':
             return (
                 <TooltipProvider>
                     <Tooltip>
                         <TooltipTrigger asChild>
                             <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 cursor-help">
                                 <CheckCircle className="mr-1 h-3 w-3" /> Scraped
                             </Badge>
                         </TooltipTrigger>
                         <TooltipContent>
                             <p className="max-w-xs text-xs">
                                 {row.scrapedText ? `Length: ${row.scrapedText.length}` : 'No text scraped.'}
                             </p>
                         </TooltipContent>
                     </Tooltip>
                 </TooltipProvider>
             );
         case 'Failed_Scrape':
         case 'Failed_Error':
             return (
                 <TooltipProvider>
                     <Tooltip>
                         <TooltipTrigger asChild>
                             <Badge variant="destructive" className="cursor-help">
                                <XCircle className="mr-1 h-3 w-3" /> Failed
                             </Badge>
                         </TooltipTrigger>
                         <TooltipContent>
                             <p className="max-w-xs text-xs">{row.scrapingErrorMessage || error || 'Scraping failed.'}</p>
                         </TooltipContent>
                     </Tooltip>
                 </TooltipProvider>
             );
         default:
             return <Badge variant="secondary">Unknown</Badge>;
     }
 };


  return (
    <main className="flex min-h-screen flex-col items-center p-6 md:p-12 lg:p-24 bg-background">
        <TooltipProvider> {/* Wrap main content */}
      <div className="w-full max-w-7xl space-y-8"> {/* Increased max-width */}
        {/* --- File Upload Card --- */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold">Overviewer 3</CardTitle>
            <CardDescription>Upload an XLSX file, confirm headers, check processing status, and initiate scraping.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
               <Label htmlFor="file-upload" className={`file-input-label ${isParsing || isProcessingPhase3 || isScraping ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Upload className="mr-2 h-4 w-4" /> {fileName || 'Choose XLSX File'}
              </Label>
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileUpload}
                className="file-input"
                disabled={isParsing || isProcessingPhase3 || isScraping} // Disable during all processing phases
              />
            </div>
             {isParsing && (
                <div className="space-y-2">
                    <Progress value={uploadProgress} className="w-full" />
                    <p className="text-sm text-muted-foreground text-center">{uploadProgress > 0 && uploadProgress < 100 ? `${uploadProgress}% Uploaded` : "Processing file..."}</p>
                </div>
             )}
            {parseError && (
                 <Alert variant="destructive">
                  <Terminal className="h-4 w-4" />
                  <AlertTitle>Parsing Error</AlertTitle>
                  <AlertDescription>
                    {parseError}
                  </AlertDescription>
                </Alert>
            )}
          </CardContent>
        </Card>

         {/* --- Header Confirmation Card --- */}
         {rawHeaders.length > 0 && !confirmedHeaders && showConfirmationUI && (
             <Card className="shadow-md">
                 <CardHeader>
                     <CardTitle>Confirm Column Headers</CardTitle>
                     <CardDescription>
                        AI has suggested the following columns. Please review and confirm or correct the mapping before proceeding.
                     </CardDescription>
                 </CardHeader>
                 <CardContent className="space-y-4">
                    {isDetectingHeaders && (
                         <div className="flex items-center justify-center space-x-2 p-4">
                             <Loader2 className="h-5 w-5 animate-spin" />
                             <span>Detecting headers...</span>
                         </div>
                     )}
                    {detectHeadersError && (
                         <Alert variant="destructive">
                          <Terminal className="h-4 w-4" />
                          <AlertTitle>Header Detection Error</AlertTitle>
                          <AlertDescription>
                            {detectHeadersError}
                          </AlertDescription>
                        </Alert>
                    )}
                     {!isDetectingHeaders && aiSuggestedHeaders && ( // Only show selectors when suggestions are ready
                         <>
                             {renderHeaderSelector("Company Name", "companyNameHeader")}
                             {renderHeaderSelector("Country", "countryHeader")}
                             {renderHeaderSelector("Website URL", "websiteHeader")}

                              <Separator />

                              <div className="flex justify-end">
                                 <Button onClick={handleConfirmHeaders} disabled={isDetectingHeaders || isProcessingPhase3 || isScraping}>
                                     <CheckCircle className="mr-2 h-4 w-4" /> Confirm & Process
                                 </Button>
                             </div>
                         </>
                     )}
                     {/* Loading Skeleton for AI suggestions */}
                      {isDetectingHeaders && (
                         <div className="space-y-4">
                           <div className="grid grid-cols-3 items-center gap-4">
                               <Skeleton className="h-5 w-20 justify-self-end" />
                               <div className="col-span-2 flex items-center gap-2"><Skeleton className="h-9 w-full" /></div>
                           </div>
                           <div className="grid grid-cols-3 items-center gap-4">
                               <Skeleton className="h-5 w-16 justify-self-end" />
                               <div className="col-span-2 flex items-center gap-2"><Skeleton className="h-9 w-full" /></div>
                           </div>
                           <div className="grid grid-cols-3 items-center gap-4">
                               <Skeleton className="h-5 w-24 justify-self-end" />
                               <div className="col-span-2 flex items-center gap-2"><Skeleton className="h-9 w-full" /></div>
                           </div>
                           <Separator />
                           <div className="flex justify-end"><Skeleton className="h-10 w-40" /></div>
                       </div>
                      )}
                 </CardContent>
             </Card>
         )}


        {/* --- Phase 3 Processing Indicator & Error --- */}
         {isProcessingPhase3 && (
             <Card className="shadow-md">
                 <CardContent className="p-6 flex items-center justify-center space-x-3">
                     <Loader2 className="h-6 w-6 animate-spin text-primary" />
                     <span className="text-lg font-medium">Normalizing and checking data against Firestore...</span>
                 </CardContent>
             </Card>
         )}
         {phase3Error && (
             <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Processing Error (Phase 3)</AlertTitle>
              <AlertDescription>
                {phase3Error}
              </AlertDescription>
            </Alert>
         )}

        {/* --- Scraping Trigger Card --- */}
         {confirmedHeaders && !isProcessingPhase3 && !phase3Error && rowsToProcessCount > 0 && (
             <Card className="shadow-md">
                 <CardHeader>
                     <CardTitle>Web Scraping</CardTitle>
                     <CardDescription>
                         {rowsToProcessCount} {rowsToProcessCount === 1 ? 'row needs' : 'rows need'} web content scraping.
                     </CardDescription>
                 </CardHeader>
                 <CardContent>
                     <p className="text-sm text-muted-foreground mb-4">
                         Click the button below to attempt scraping the website content for rows marked 'To Process'.
                         This may take some time depending on the number of websites.
                     </p>
                 </CardContent>
                 <CardFooter className="flex justify-end">
                     <Button onClick={handleScraping} disabled={isScraping || isProcessingPhase3}>
                         {isScraping ? (
                             <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                         ) : (
                             <SearchCode className="mr-2 h-4 w-4" />
                         )}
                         {isScraping ? 'Scraping in Progress...' : `Start Scraping (${rowsToProcessCount})`}
                     </Button>
                 </CardFooter>
             </Card>
         )}
          {/* Scraping Summary Info */}
         {confirmedHeaders && !isProcessingPhase3 && processedRows.length > 0 && (rowsSuccessfullyScrapedCount > 0 || rowsFailedScrapeCount > 0) && (
            <Alert variant="default" className="mt-4">
                 <Bot className="h-4 w-4" />
                 <AlertTitle>Scraping Summary</AlertTitle>
                 <AlertDescription>
                     Successfully scraped: {rowsSuccessfullyScrapedCount} | Failed: {rowsFailedScrapeCount}
                 </AlertDescription>
             </Alert>
         )}


        {/* --- Data Table Card --- */}
        {rawHeaders.length > 0 && rawRows.length > 0 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>File Contents: {fileName}</CardTitle>
              <CardDescription>
                {confirmedHeaders
                    ? `Displaying ${processedRows.length > 0 ? processedRows.length : rawRows.length} rows with processing & scraping status.`
                    : (aiSuggestedHeaders
                        ? "Highlighting suggested columns. Please confirm above."
                        : "Awaiting header confirmation.")
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] w-full rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                    <TableRow>
                       {/* Add Status & Scraping columns if headers are confirmed */}
                       {confirmedHeaders && (
                           <>
                            <TableHead className="font-bold w-[130px] sticky left-0 bg-card z-20">Status</TableHead>
                            <TableHead className="font-bold w-[130px]">Scraping</TableHead>
                           </>
                       )}
                       {rawHeaders.map((header, index) => (
                         <TableHead
                            key={`${header}-${index}`}
                            className={cn(
                                "font-semibold whitespace-nowrap", // Make headers bold
                                getHighlightClass(header) // Apply highlighting
                            )}
                         >
                           {header}
                         </TableHead>
                       ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                     {(processedRows.length > 0 ? processedRows : rawRows).map((item, rowIndex) => {
                         const isProcessed = (item as ProcessedRow).originalIndex !== undefined;
                         const rowData = isProcessed ? rawRows[(item as ProcessedRow).originalIndex] : item as ExcelRow;
                         const processedInfo = isProcessed ? (item as ProcessedRow) : null;

                         return (
                              <TableRow
                                key={processedInfo?.originalIndex ?? rowIndex}
                                className={cn(
                                    processedInfo?.status === 'Fetched' ? 'opacity-70' : '',
                                    (processedInfo?.scrapingStatus === 'Scraping') ? 'animate-pulse bg-muted/50' : '' // Pulse during scraping
                                 )}
                              >
                                {confirmedHeaders && ( // Display status cells only after confirmation
                                     <>
                                     {/* Phase 3 Status Cell (Sticky) */}
                                     <TableCell className="font-medium align-top sticky left-0 bg-card z-20 border-r">
                                        {processedInfo ? (
                                            <div className="flex flex-col items-start gap-1 w-[110px]">
                                                {renderStatusBadge(processedInfo.status)}
                                                 {processedInfo.status === 'Fetched' && processedInfo.fetchedData?.summary && (
                                                     <Tooltip>
                                                         <TooltipTrigger asChild>
                                                            <span className="text-xs text-muted-foreground truncate cursor-help">
                                                                Summary: {processedInfo.fetchedData.summary}
                                                            </span>
                                                          </TooltipTrigger>
                                                          <TooltipContent>
                                                              <p className="max-w-xs text-xs">{processedInfo.fetchedData.summary}</p>
                                                          </TooltipContent>
                                                     </Tooltip>
                                                 )}
                                                {processedInfo.status === 'Error' && processedInfo.errorMessage && (
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span className="text-xs text-destructive truncate cursor-help">
                                                                {processedInfo.errorMessage}
                                                            </span>
                                                        </TooltipTrigger>
                                                        <TooltipContent>
                                                            <p className="max-w-xs text-xs">{processedInfo.errorMessage}</p>
                                                        </TooltipContent>
                                                    </Tooltip>
                                                 )}
                                            </div>
                                        ) : isProcessingPhase3 ? (
                                             <Skeleton className="h-5 w-20" />
                                        ) : (
                                             <Badge variant="outline">Pending</Badge>
                                        )}
                                     </TableCell>
                                     {/* Phase 4 Scraping Status Cell */}
                                     <TableCell className="font-medium align-top">
                                         {processedInfo ? (
                                              <div className="w-[110px]">
                                                 {renderScrapingStatus(processedInfo)}
                                              </div>
                                         ) : isProcessingPhase3 ? (
                                             <Skeleton className="h-5 w-20" />
                                         ) : (
                                             <span className="text-xs text-muted-foreground italic">N/A</span>
                                         )}
                                     </TableCell>
                                     </>
                                 )}
                                 {rawHeaders.map((header, cellIndex) => (
                                   <TableCell
                                       key={`${header}-${cellIndex}`}
                                       className={cn(
                                           "whitespace-normal break-words align-top",
                                            getHighlightClass(header)
                                        )}
                                    >
                                     {renderCellContent(rowData[cellIndex] !== undefined ? rowData[cellIndex] : null)}
                                   </TableCell>
                                 ))}
                              </TableRow>
                         );
                     })}
                     {/* Show skeleton rows if processing phase 3 started but no results yet */}
                     {isProcessingPhase3 && processedRows.length === 0 && rawRows.slice(0, 5).map((_, idx) => (
                         <TableRow key={`skeleton-${idx}`}>
                             {confirmedHeaders && (
                                <>
                                 <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                 <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                                </>
                             )}
                             {rawHeaders.map((h, hIdx) => <TableCell key={`sk-cell-${hIdx}`}><Skeleton className="h-5 w-full" /></TableCell>)}
                         </TableRow>
                     ))}
                  </TableBody>
                </Table>
                 {rawRows.length === 0 && !isParsing && fileName && <p className="p-4 text-center text-muted-foreground">No data found in the first sheet.</p>}
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
      </TooltipProvider> {/* Close TooltipProvider */}
    </main>
  );
}
