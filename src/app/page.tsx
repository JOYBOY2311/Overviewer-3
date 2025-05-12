
"use client";

import type { ChangeEvent} from 'react';
import { useState, useEffect, useCallback } from 'react';
import { Upload, Loader2, CheckCircle, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";
import { parseSheetFunctionUrl, detectHeadersFunctionUrl } from '@/lib/config';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton'; // Import Skeleton
import type { DetectHeadersOutput } from '@/ai/flows/detect-headers-flow'; // Import type

type ExcelRow = (string | number | boolean | Date | null)[];

type HeaderMappingKey = 'companyNameHeader' | 'countryHeader' | 'websiteHeader';
type ConfirmedHeaderMapping = {
    name: string | null;
    country: string | null;
    website: string | null;
};

export default function Home() {
  // File & Parsing State
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  // AI Header Detection State
  const [aiSuggestedHeaders, setAiSuggestedHeaders] = useState<DetectHeadersOutput | null>(null);
  const [isDetectingHeaders, setIsDetectingHeaders] = useState<boolean>(false);
  const [detectHeadersError, setDetectHeadersError] = useState<string | null>(null);

  // User Confirmation State
  const [manualHeaderSelection, setManualHeaderSelection] = useState<DetectHeadersOutput>({
      companyNameHeader: null,
      countryHeader: null,
      websiteHeader: null,
  });
  const [confirmedHeaders, setConfirmedHeaders] = useState<ConfirmedHeaderMapping | null>(null);
  const [showConfirmationUI, setShowConfirmationUI] = useState<boolean>(false);


  // --- Effects ---

  // Effect to trigger AI header detection when headers are available
  useEffect(() => {
    if (headers.length > 0 && !confirmedHeaders && !aiSuggestedHeaders && !isDetectingHeaders && !isParsing) {
       callDetectHeaders();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headers, confirmedHeaders, aiSuggestedHeaders, isDetectingHeaders, isParsing]); // Dependencies ensure this runs when headers are ready

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
    if (!headers || headers.length === 0) return;
    console.log("Calling detectHeaders function with headers:", headers);
    setIsDetectingHeaders(true);
    setDetectHeadersError(null);
    setAiSuggestedHeaders(null); // Reset previous suggestions

    try {
      const response = await fetch(detectHeadersFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ headers }),
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

    // Reset all states
    setFileName(file.name);
    setHeaders([]);
    setRows([]);
    setParseError(null);
    setIsParsing(true);
    setUploadProgress(0);
    setAiSuggestedHeaders(null);
    setConfirmedHeaders(null);
    setManualHeaderSelection({ companyNameHeader: null, countryHeader: null, websiteHeader: null });
    setIsDetectingHeaders(false);
    setDetectHeadersError(null);
    setShowConfirmationUI(false);


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
               setHeaders([]);
               setRows([]);
            } else if (result.headers && result.rows) {
              setHeaders(result.headers);
              setRows(result.rows);
              setParseError(null);
              // AI detection will be triggered by useEffect watching headers
            } else {
              setParseError("Invalid response format from the parse function.");
              setHeaders([]);
              setRows([]);
            }
          } catch (parseErr) {
             console.error("Error parsing function response:", parseErr);
             setParseError(`Failed to parse response from the function. Error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`);
             setHeaders([]);
             setRows([]);
          }
        } else {
          console.error("Error calling parseSheet function:", xhr.statusText, xhr.responseText);
          let errorMessage = `Error calling parse function (Status: ${xhr.status})`;
          try {
             const errorResponse = JSON.parse(xhr.responseText);
             if(errorResponse.error) errorMessage += `: ${errorResponse.error}`;
          } catch (e) { /* Ignore if response is not JSON */ }
          setParseError(errorMessage);
          setHeaders([]);
          setRows([]);
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
        setHeaders([]);
        setRows([]);
      };

      xhr.send(formData);

    } catch (err) {
      setIsParsing(false);
      setUploadProgress(0);
      console.error("Error setting up the upload request:", err);
      setParseError(`An unexpected error occurred during setup. Error: ${err instanceof Error ? err.message : String(err)}`);
      setHeaders([]);
      setRows([]);
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

  const handleConfirmHeaders = () => {
    setConfirmedHeaders({
        name: manualHeaderSelection.companyNameHeader,
        country: manualHeaderSelection.countryHeader,
        website: manualHeaderSelection.websiteHeader,
    });
    setShowConfirmationUI(false); // Hide confirmation UI after confirming
    console.log("Headers confirmed:", manualHeaderSelection);
    // TODO: Proceed to Phase 3 logic using confirmedHeaders
  };

  // --- Rendering Logic ---

   const renderCellContent = (cellData: string | number | boolean | Date | null): React.ReactNode => {
    if (typeof cellData === 'string') {
      const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;
       if (isoDateRegex.test(cellData)) {
         try {
           return new Date(cellData).toLocaleDateString();
         } catch (e) { return cellData; }
       }
    }
    if (cellData instanceof Date) {
      return cellData.toLocaleDateString();
    }
    if (typeof cellData === 'boolean') {
        return cellData ? 'TRUE' : 'FALSE';
    }
    return cellData !== null ? String(cellData) : '';
  };

  // Helper to get highlight class based on confirmed or suggested headers
  const getHighlightClass = (header: string): string => {
     const currentSelection = confirmedHeaders ? {
         companyNameHeader: confirmedHeaders.name,
         countryHeader: confirmedHeaders.country,
         websiteHeader: confirmedHeaders.website
     } : manualHeaderSelection; // Use manual selection for highlighting before confirmation

      if (!currentSelection) return "";

      if (header === currentSelection.companyNameHeader) return "bg-blue-100 dark:bg-blue-900/30";
      if (header === currentSelection.countryHeader) return "bg-green-100 dark:bg-green-900/30";
      if (header === currentSelection.websiteHeader) return "bg-yellow-100 dark:bg-yellow-900/30";
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
                    disabled={!headers.length || isDetectingHeaders}
                >
                    <SelectTrigger id={`select-${mappingKey}`} className="w-full">
                        <SelectValue placeholder="Select Header..." />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="">(None)</SelectItem>
                        {headers.map((h, idx) => (
                            <SelectItem key={`${h}-${idx}`} value={h}>{h}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                 {aiSuggestion && currentValue !== aiSuggestion && (
                     <span className="text-xs text-muted-foreground whitespace-nowrap">(AI suggested: {aiSuggestion})</span>
                 )}
                 {aiSuggestion && currentValue === aiSuggestion && (
                     <CheckCircle className="h-4 w-4 text-green-500 ml-1 shrink-0" />
                 )}
                 {!aiSuggestion && (
                    <XCircle className="h-4 w-4 text-muted-foreground ml-1 shrink-0" />
                 )}
            </div>

        </div>
    );
};


  return (
    <main className="flex min-h-screen flex-col items-center p-6 md:p-12 lg:p-24 bg-background">
      <div className="w-full max-w-6xl space-y-8">
        {/* --- File Upload Card --- */}
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold">Overviewer 3</CardTitle>
            <CardDescription>Upload an XLSX file to view its contents and identify key columns.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
               <Label htmlFor="file-upload" className={`file-input-label ${isParsing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Upload className="mr-2 h-4 w-4" /> {fileName || 'Choose XLSX File'}
              </Label>
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFileUpload}
                className="file-input"
                disabled={isParsing}
              />
            </div>
             {isParsing && (
                <div className="space-y-2">
                    <Progress value={uploadProgress} className="w-full" />
                    <p className="text-sm text-muted-foreground text-center">{uploadProgress}% Uploaded</p>
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
         {headers.length > 0 && !confirmedHeaders && showConfirmationUI && (
             <Card className="shadow-md">
                 <CardHeader>
                     <CardTitle>Confirm Column Headers</CardTitle>
                     <CardDescription>
                        AI has suggested the following columns. Please review and confirm or correct the mapping.
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
                          <AlertTitle>Detection Error</AlertTitle>
                          <AlertDescription>
                            {detectHeadersError}
                          </AlertDescription>
                        </Alert>
                    )}
                     {!isDetectingHeaders && aiSuggestedHeaders && (
                         <>
                             {renderHeaderSelector("Company Name", "companyNameHeader")}
                             {renderHeaderSelector("Country", "countryHeader")}
                             {renderHeaderSelector("Website URL", "websiteHeader")}

                              <Separator />

                              <div className="flex justify-end">
                                 <Button onClick={handleConfirmHeaders} disabled={isDetectingHeaders}>
                                     <CheckCircle className="mr-2 h-4 w-4" /> Confirm Headers
                                 </Button>
                             </div>
                         </>
                     )}
                     {!isDetectingHeaders && !detectHeadersError && !aiSuggestedHeaders && (
                         // Initial state or if AI somehow returns nothing without error
                         <div className="flex items-center justify-center space-x-2 p-4 text-muted-foreground">
                             <span>Waiting for AI suggestions...</span>
                         </div>
                     )}


                 </CardContent>
             </Card>
         )}

          {/* --- Loading Skeletons for Header Confirmation --- */}
            {isDetectingHeaders && headers.length > 0 && !confirmedHeaders && (
                <Card className="shadow-md">
                    <CardHeader>
                        <Skeleton className="h-6 w-1/3" />
                        <Skeleton className="h-4 w-2/3 mt-1" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 items-center gap-4">
                           <Skeleton className="h-5 w-20 justify-self-end" />
                            <div className="col-span-2 flex items-center gap-2">
                                <Skeleton className="h-9 w-full" />
                            </div>
                        </div>
                         <div className="grid grid-cols-3 items-center gap-4">
                           <Skeleton className="h-5 w-16 justify-self-end" />
                            <div className="col-span-2 flex items-center gap-2">
                                <Skeleton className="h-9 w-full" />
                            </div>
                        </div>
                         <div className="grid grid-cols-3 items-center gap-4">
                           <Skeleton className="h-5 w-24 justify-self-end" />
                            <div className="col-span-2 flex items-center gap-2">
                                <Skeleton className="h-9 w-full" />
                            </div>
                        </div>
                        <Separator />
                         <div className="flex justify-end">
                           <Skeleton className="h-10 w-36" />
                         </div>
                    </CardContent>
                </Card>
            )}


        {/* --- Data Table Card --- */}
        {headers.length > 0 && rows.length > 0 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>File Contents: {fileName}</CardTitle>
              <CardDescription>
                Displaying the first sheet. {confirmedHeaders ? "Columns confirmed." : (aiSuggestedHeaders ? "Highlighting suggested columns." : "Awaiting header confirmation.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] w-full rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-secondary z-10">
                    <TableRow>
                      {headers.map((header, index) => (
                        <TableHead
                            key={index}
                            className={cn(
                                "font-medium whitespace-nowrap",
                                getHighlightClass(header) // Apply highlighting
                            )}
                        >
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {headers.map((header, cellIndex) => (
                          <TableCell
                              key={cellIndex}
                              className={cn(
                                  "whitespace-nowrap",
                                   getHighlightClass(header) // Apply highlighting
                                )}
                           >
                            {renderCellContent(row[cellIndex] !== undefined ? row[cellIndex] : null)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
