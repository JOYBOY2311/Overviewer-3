
"use client";

import type { ChangeEvent} from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Upload, Loader2, CheckCircle, XCircle, AlertCircle, FileCheck2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";
import { parseSheetFunctionUrl, detectHeadersFunctionUrl, normalizeAndCheckFunctionUrl } from '@/lib/config'; // Added normalizeAndCheckFunctionUrl
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import type { DetectHeadersOutput } from '@/ai/flows/detect-headers-flow';
import { cn } from "@/lib/utils"; // Import cn for conditional classes
import { Badge } from "@/components/ui/badge"; // Import Badge for status display

// Type for raw data parsed from Excel
type ExcelRow = (string | number | boolean | Date | null)[];

// Type for header mapping confirmed by user
type HeaderMappingKey = 'companyNameHeader' | 'countryHeader' | 'websiteHeader';
type ConfirmedHeaderMapping = {
    name: string | null;
    country: string | null;
    website: string | null;
};

// Type for the result of processing a single row in Phase 3
type ProcessedRow = {
    originalData: {
        companyName: string | null;
        country: string | null;
        website: string | null;
        [key: string]: string | number | boolean | Date | null; // Allow other original fields access by index signature later if needed
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
        lastUpdated?: string; // Store as string after JSON serialization
        // Add other relevant fields
    };
    // Added index to map back to original rows if needed, and for keys
    originalIndex: number;
};


export default function Home() {
  // --- Phase 1 State ---
  const [rawHeaders, setRawHeaders] = useState<string[]>([]); // Renamed for clarity
  const [rawRows, setRawRows] = useState<ExcelRow[]>([]);       // Renamed for clarity
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
    setRawHeaders([]); // Reset raw headers
    setRawRows([]);   // Reset raw rows
    setParseError(null);
    setIsParsing(true);
    setUploadProgress(0);
    setAiSuggestedHeaders(null);
    setConfirmedHeaders(null);
    setManualHeaderSelection({ companyNameHeader: null, countryHeader: null, websiteHeader: null });
    setIsDetectingHeaders(false);
    setDetectHeadersError(null);
    setShowConfirmationUI(false);
    setProcessedRows([]); // Reset processed rows
    setIsProcessingPhase3(false); // Reset phase 3 processing state
    setPhase3Error(null);      // Reset phase 3 error state


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
         const resultsWithIndex = results.map((row, index) => ({ ...row, originalIndex: index }));
        console.log("Received processed rows:", resultsWithIndex);
        setProcessedRows(resultsWithIndex);

    } catch (error) {
        console.error("Error calling normalizeAndCheck function:", error);
        const message = error instanceof Error ? error.message : "Unknown error during Phase 3 processing.";
        setPhase3Error(message);
    } finally {
        setIsProcessingPhase3(false);
    }
  };

  // --- Rendering Logic ---

   const renderCellContent = (cellData: string | number | boolean | Date | null): React.ReactNode => {
    // Simplified: Convert all to string or empty string for display
    // Original Date/Boolean handling removed as parseSheet now uses raw:true
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
                    disabled={!rawHeaders.length || isDetectingHeaders}
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

  return (
    <main className="flex min-h-screen flex-col items-center p-6 md:p-12 lg:p-24 bg-background">
      <div className="w-full max-w-7xl space-y-8"> {/* Increased max-width */}
        {/* --- File Upload Card --- */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold">Overviewer 3</CardTitle>
            <CardDescription>Upload an XLSX file, confirm headers, and check processing status.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
               <Label htmlFor="file-upload" className={`file-input-label ${isParsing || isProcessingPhase3 ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Upload className="mr-2 h-4 w-4" /> {fileName || 'Choose XLSX File'}
              </Label>
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileUpload}
                className="file-input"
                disabled={isParsing || isProcessingPhase3} // Disable during phase 3 processing too
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
                                 <Button onClick={handleConfirmHeaders} disabled={isDetectingHeaders || isProcessingPhase3}>
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


        {/* --- Data Table Card --- */}
        {rawHeaders.length > 0 && rawRows.length > 0 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>File Contents: {fileName}</CardTitle>
              <CardDescription>
                {confirmedHeaders
                    ? `Displaying ${processedRows.length > 0 ? processedRows.length : rawRows.length} rows with processing status.`
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
                       {/* Add Status column if headers are confirmed */}
                       {confirmedHeaders && (
                           <TableHead className="font-bold w-[120px]">Status</TableHead>
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
                    {/* Render raw rows until processed rows are available */}
                     {(processedRows.length > 0 ? processedRows : rawRows).map((item, rowIndex) => {
                         const isProcessed = (item as ProcessedRow).originalIndex !== undefined;
                         const rowData = isProcessed ? rawRows[(item as ProcessedRow).originalIndex] : item as ExcelRow;
                         const processedInfo = isProcessed ? (item as ProcessedRow) : null;

                         return (
                              <TableRow
                                key={processedInfo?.originalIndex ?? rowIndex}
                                className={cn(processedInfo?.status === 'Fetched' ? 'opacity-70' : '')}
                              >
                                {confirmedHeaders && ( // Display status cell only after confirmation
                                     <TableCell className="font-medium align-top sticky left-0 bg-card z-20 shadow-sm"> {/* Sticky status */}
                                        {processedInfo ? (
                                            <div className="flex flex-col items-start gap-1">
                                                {renderStatusBadge(processedInfo.status)}
                                                 {processedInfo.status === 'Fetched' && processedInfo.fetchedData?.summary && (
                                                     <span className="text-xs text-muted-foreground truncate w-28" title={processedInfo.fetchedData.summary}>
                                                         Summary: {processedInfo.fetchedData.summary}
                                                     </span>
                                                 )}
                                                {processedInfo.status === 'Error' && processedInfo.errorMessage && (
                                                     <span className="text-xs text-destructive truncate w-28" title={processedInfo.errorMessage}>
                                                        {processedInfo.errorMessage}
                                                     </span>
                                                 )}
                                            </div>

                                        ) : isProcessingPhase3 ? (
                                             <Skeleton className="h-5 w-20" /> // Show skeleton while processing this row
                                        ) : (
                                             <Badge variant="outline">Pending</Badge> // Default before processing starts
                                        )}
                                     </TableCell>
                                 )}
                                 {rawHeaders.map((header, cellIndex) => (
                                   <TableCell
                                       key={`${header}-${cellIndex}`}
                                       className={cn(
                                           "whitespace-normal break-words align-top", // Allow wrapping, align top
                                            getHighlightClass(header) // Apply highlighting
                                        )}
                                    >
                                     {/* Access rowData using cellIndex */}
                                     {renderCellContent(rowData[cellIndex] !== undefined ? rowData[cellIndex] : null)}
                                   </TableCell>
                                 ))}
                              </TableRow>
                         );
                     })}
                     {/* Show skeleton rows if processing phase 3 started but no results yet */}
                     {isProcessingPhase3 && processedRows.length === 0 && rawRows.slice(0, 5).map((_, idx) => (
                         <TableRow key={`skeleton-${idx}`}>
                             {confirmedHeaders && <TableCell><Skeleton className="h-5 w-20" /></TableCell>}
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
    </main>
  );
}
