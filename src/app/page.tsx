
"use client";

import type { ChangeEvent} from 'react';
import { useState, useEffect } from 'react';
import { Upload, Loader2, CheckCircle, XCircle, AlertCircle, FileCheck2, SearchCode, Bot, MessageSquareQuote, FileWarning, ShieldQuestion } from 'lucide-react'; // Added new icons

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Terminal } from "lucide-react";
import { parseSheetFunctionUrl, detectHeadersFunctionUrl, normalizeAndCheckFunctionUrl, scrapeWebsiteContentFunctionUrl, processAndSummarizeContentFunctionUrl } from '@/lib/config'; // Added processAndSummarizeContentFunctionUrl
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import type { DetectHeadersOutput } from '@/ai/flows/detect-headers-flow';
import type { SummarizeContentOutput } from '@/ai/flows/summarize-content-flow'; // Import SummarizeContentOutput
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

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


// Type for the result of processing a single row
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
    status: 'Fetched' | 'To Process' | 'Error';
    errorMessage?: string;
    fetchedData?: {
        summary?: string;
        lastUpdated?: string;
    };
    originalIndex: number;
    // Phase 4 fields
    scrapingStatus?: 'Pending' | 'Scraping' | 'Success' | 'Failed_Scrape' | 'Failed_Error';
    scrapedText?: string | null;
    scrapingErrorMessage?: string;
    // Phase 5 fields
    summarizationStatus?: 'Pending_Summary' | 'Summarizing' | 'Success_Summary' | 'Failed_Summary';
    summary?: string;
    independenceCriteria?: "Yes" | "";
    insufficientInfo?: "Yes" | "";
    summarizationErrorMessage?: string;
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
  const [scrapingErrors, setScrapingErrors] = useState<Record<number, string | null>>({});

  // --- Phase 5 State ---
  const [isSummarizingAny, setIsSummarizingAny] = useState<boolean>(false);


  // --- Calculated State ---
  const rowsToProcessCount = processedRows.filter(row => row.status === 'To Process' && row.scrapingStatus === 'Pending').length;
  const rowsSuccessfullyScrapedCount = processedRows.filter(row => row.scrapingStatus === 'Success').length;
  const rowsFailedScrapeCount = processedRows.filter(row => row.scrapingStatus === 'Failed_Scrape' || row.scrapingStatus === 'Failed_Error').length;


  // --- Effects ---
  useEffect(() => {
    if (rawHeaders.length > 0 && !confirmedHeaders && !aiSuggestedHeaders && !isDetectingHeaders && !isParsing) {
       callDetectHeaders();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawHeaders, confirmedHeaders, aiSuggestedHeaders, isDetectingHeaders, isParsing]);

  useEffect(() => {
    if (aiSuggestedHeaders) {
      setManualHeaderSelection({
        companyNameHeader: aiSuggestedHeaders.companyNameHeader,
        countryHeader: aiSuggestedHeaders.countryHeader,
        websiteHeader: aiSuggestedHeaders.websiteHeader,
      });
      setShowConfirmationUI(true);
    }
  }, [aiSuggestedHeaders]);

  // Effect to manage isSummarizingAny based on processedRows
  useEffect(() => {
    const anyRowSummarizing = processedRows.some(row => row.summarizationStatus === 'Summarizing');
    setIsSummarizingAny(anyRowSummarizing);
  }, [processedRows]);


  // --- API Calls ---
  const callDetectHeaders = async () => {
    if (!rawHeaders || rawHeaders.length === 0) return;
    setIsDetectingHeaders(true);
    setDetectHeadersError(null);
    setAiSuggestedHeaders(null);
    try {
      const response = await fetch(detectHeadersFunctionUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headers: rawHeaders }),
      });
      if (!response.ok) {
        let errorMsg = `Error detecting headers (Status: ${response.status})`;
        try { const errorData = await response.json(); if(errorData.error) errorMsg += `: ${errorData.error}`; } catch (e) { /* ignore */ }
        throw new Error(errorMsg);
      }
      const result: DetectHeadersOutput = await response.json();
      setAiSuggestedHeaders(result);
    } catch (error) {
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
    setIsScraping(false);
    setScrapingErrors({});
    setIsSummarizingAny(false); // Reset summarization state

    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.open('POST', parseSheetFunctionUrl, true);
      xhr.onload = () => {
        setIsParsing(false);
        if (xhr.status === 200) {
          try {
            const result = JSON.parse(xhr.responseText);
            if (result.error) {
               setParseError(`Function Error: ${result.error}`); setRawHeaders([]); setRawRows([]);
            } else if (result.headers && result.rows) {
              const safeHeaders = result.headers.map((h: any) => String(h ?? ""));
              const safeRows = result.rows.map((row: any[]) => row.map(cell => (cell === undefined ? null : cell)));
              setRawHeaders(safeHeaders); setRawRows(safeRows); setParseError(null);
            } else {
              setParseError("Invalid response format from the parse function."); setRawHeaders([]); setRawRows([]);
            }
          } catch (parseErr) {
             setParseError(`Failed to parse response. Error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`); setRawHeaders([]); setRawRows([]);
          }
        } else {
          let errorMessage = `Error calling parse function (Status: ${xhr.status})`;
          try { const errorResponse = JSON.parse(xhr.responseText); if(errorResponse.error) errorMessage += `: ${errorResponse.error}`; } catch (e) { /* Ignore */ }
          setParseError(errorMessage); setRawHeaders([]); setRawRows([]);
        }
         if (xhr.status !== 200) setUploadProgress(0);
      };
      xhr.onerror = () => {
        setIsParsing(false); setUploadProgress(0);
        setParseError("Network error: Failed to connect to the parsing service."); setRawHeaders([]); setRawRows([]);
      };
      xhr.send(formData);
    } catch (err) {
      setIsParsing(false); setUploadProgress(0);
      setParseError(`An unexpected error occurred. Error: ${err instanceof Error ? err.message : String(err)}`); setRawHeaders([]); setRawRows([]);
    } finally {
       if (event.target) event.target.value = '';
    }
  };

  const handleManualHeaderChange = (key: HeaderMappingKey, value: string) => {
     const selectedValue = value === "" ? null : value;
     setManualHeaderSelection(prev => ({ ...prev, [key]: selectedValue }));
  };

  const handleConfirmHeaders = async () => {
    const currentlyConfirmed = {
        name: manualHeaderSelection.companyNameHeader,
        country: manualHeaderSelection.countryHeader,
        website: manualHeaderSelection.websiteHeader,
    };
    setConfirmedHeaders(currentlyConfirmed);
    setShowConfirmationUI(false);

    setProcessedRows([]);
    setIsProcessingPhase3(true);
    setPhase3Error(null);
    setIsScraping(false);
    setScrapingErrors({});
    setIsSummarizingAny(false);

    try {
        const response = await fetch(normalizeAndCheckFunctionUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rows: rawRows, confirmedHeaders: currentlyConfirmed, headers: rawHeaders }),
        });
        if (!response.ok) {
            let errorMsg = `Error during normalization/check (Status: ${response.status})`;
             try { const errorData = await response.json(); if (errorData.error) errorMsg += `: ${errorData.error}`; } catch (e) { /* ignore */ }
             throw new Error(errorMsg);
        }
        const results: ProcessedRow[] = await response.json();
         const resultsWithInitialStatus = results.map((row, index) => ({
            ...row,
            originalIndex: index,
            scrapingStatus: row.scrapingStatus ?? (row.status === 'To Process' ? 'Pending' : undefined),
            summarizationStatus: (row.status === 'To Process' && (row.scrapingStatus ?? 'Pending') === 'Pending' && row.normalizedData.website)
                                ? 'Pending_Summary'
                                : undefined,
         }));
        setProcessedRows(resultsWithInitialStatus);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error during Phase 3 processing.";
        setPhase3Error(message);
    } finally {
        setIsProcessingPhase3(false);
    }
  };

  const handleScraping = async () => {
    if (!processedRows.length) return;

    const rowsToScrapeExist = processedRows.some(row => row.status === 'To Process' && row.scrapingStatus === 'Pending' && row.normalizedData.website);
    if (rowsToScrapeExist) {
        setIsScraping(true); // Set scraping active only if there are rows to scrape
    }
    // Set summarizing active if any of those scraped rows will then be summarized
    const rowsThatWillBeSummarized = processedRows.some(
        row => row.status === 'To Process' && row.scrapingStatus === 'Pending' && row.normalizedData.website
    );
    if (rowsThatWillBeSummarized) {
        setIsSummarizingAny(true);
    }


    setScrapingErrors({});
    let updatedRows = [...processedRows];

    const scrapingPromises = updatedRows.map(async (row, index) => {
        if (row.status === 'To Process' && row.normalizedData.website && row.scrapingStatus === 'Pending') {
            updatedRows[index] = { ...row, scrapingStatus: 'Scraping' };
            setProcessedRows([...updatedRows]);

            try {
                const scrapeResponse = await fetch(scrapeWebsiteContentFunctionUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        websiteUrl: row.normalizedData.website,
                        companyName: row.originalData.companyName,
                    }),
                });
                const scrapeResult: ScrapeResult = await scrapeResponse.json();
                if (!scrapeResponse.ok) { // Check response.ok here for scrape
                     updatedRows[index] = {
                        ...updatedRows[index],
                        scrapingStatus: scrapeResult.status || 'Failed_Error', // Use status from backend if available
                        scrapingErrorMessage: scrapeResult.error || `Scraping failed (Status: ${scrapeResponse.status})`,
                        summarizationStatus: 'Failed_Summary', // Fail summary if scrape fails
                        summarizationErrorMessage: 'Scraping failed, cannot summarize.',
                     };
                } else if (scrapeResult.status === 'Success' && scrapeResult.scrapedText) {
                    updatedRows[index] = {
                        ...updatedRows[index],
                        scrapingStatus: 'Success',
                        scrapedText: scrapeResult.scrapedText,
                        summarizationStatus: 'Summarizing', // Set to summarizing
                    };
                    setProcessedRows([...updatedRows]); // Update UI to show 'Summarizing'

                    // Now, call summarization
                    try {
                        const summarizeResponse = await fetch(processAndSummarizeContentFunctionUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ scrapedText: scrapeResult.scrapedText }),
                        });
                        const summaryResult: SummarizeContentOutput = await summarizeResponse.json();

                        if (!summarizeResponse.ok) { // Check response.ok for summarize
                             updatedRows[index] = {
                                ...updatedRows[index],
                                summarizationStatus: 'Failed_Summary',
                                summarizationErrorMessage: (summaryResult as any).error || `Summarization failed (Status: ${summarizeResponse.status})`,
                             };
                        } else {
                             updatedRows[index] = {
                                ...updatedRows[index],
                                summarizationStatus: 'Success_Summary',
                                summary: summaryResult.summary,
                                independenceCriteria: summaryResult.independenceCriteria,
                                insufficientInfo: summaryResult.insufficientInfo,
                             };
                        }
                    } catch (summaryError) {
                        const message = summaryError instanceof Error ? summaryError.message : "Unknown summarization error.";
                        updatedRows[index] = {
                            ...updatedRows[index],
                            summarizationStatus: 'Failed_Summary',
                            summarizationErrorMessage: message,
                        };
                    }
                } else { // Scraping "succeeded" but no text or other fail status
                    updatedRows[index] = {
                        ...updatedRows[index],
                        scrapingStatus: scrapeResult.status || 'Failed_Scrape',
                        scrapedText: null,
                        scrapingErrorMessage: scrapeResult.error || 'No significant content found.',
                        summarizationStatus: 'Failed_Summary',
                        summarizationErrorMessage: 'No content to summarize.',
                    };
                }
            } catch (error) { // Catch for scrape fetch or initial processing
                const message = error instanceof Error ? error.message : "Unknown scraping error.";
                 updatedRows[index] = {
                    ...updatedRows[index],
                    scrapingStatus: 'Failed_Error',
                    scrapedText: null,
                    scrapingErrorMessage: message,
                    summarizationStatus: 'Failed_Summary',
                    summarizationErrorMessage: 'Scraping error, cannot summarize.',
                 };
                setScrapingErrors(prev => ({ ...prev, [row.originalIndex]: message }));
            } finally {
                 setProcessedRows([...updatedRows]);
            }
        }
        return;
    });

    await Promise.allSettled(scrapingPromises);
    setIsScraping(false);
    // isSummarizingAny will be updated by the useEffect hook
};


  // --- Rendering Logic ---
   const renderCellContent = (cellData: string | number | boolean | Date | null): React.ReactNode => {
    return cellData !== null && cellData !== undefined ? String(cellData) : '';
  };

  const getHighlightClass = (header: string): string => {
     const currentSelection = confirmedHeaders ? {
         companyNameHeader: confirmedHeaders.name,
         countryHeader: confirmedHeaders.country,
         websiteHeader: confirmedHeaders.website
     } : manualHeaderSelection;
      if (!currentSelection) return "";
      if (header === currentSelection.companyNameHeader) return "bg-blue-100 dark:bg-blue-900/30 font-semibold";
      if (header === currentSelection.countryHeader) return "bg-green-100 dark:bg-green-900/30 font-semibold";
      if (header === currentSelection.websiteHeader) return "bg-yellow-100 dark:bg-yellow-900/30 font-semibold";
      return "";
  };

  const renderHeaderSelector = (label: string, mappingKey: HeaderMappingKey) => {
    const aiSuggestion = aiSuggestedHeaders?.[mappingKey] ?? null;
    const currentValue = manualHeaderSelection[mappingKey] ?? "";
    return (
        <div className="grid grid-cols-3 items-center gap-4">
            <Label htmlFor={`select-${mappingKey}`} className="text-right font-medium">{label}:</Label>
            <div className="col-span-2 flex items-center gap-2">
                 <Select
                    value={currentValue}
                    onValueChange={(value) => handleManualHeaderChange(mappingKey, value)}
                    disabled={!rawHeaders.length || isDetectingHeaders || isProcessingPhase3 || isScraping || isSummarizingAny}
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
                 {!aiSuggestion && currentValue && (
                     <FileCheck2 className="h-4 w-4 text-blue-500 ml-1 shrink-0" title="Manually selected"/>
                  )}
                  {!aiSuggestion && !currentValue && (
                     <XCircle className="h-4 w-4 text-muted-foreground ml-1 shrink-0" title="No suggestion"/>
                  )}
            </div>
        </div>
    );
};

 const renderStatusBadge = (status: ProcessedRow['status']) => {
      switch (status) {
          case 'Fetched': return <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">Fetched</Badge>;
          case 'To Process': return <Badge variant="outline" className="border-blue-400 text-blue-700 dark:border-blue-600 dark:text-blue-400">To Process</Badge>;
          case 'Error': return <Badge variant="destructive">Error</Badge>;
          default: return <Badge variant="secondary">Unknown</Badge>;
      }
  };

 const renderScrapingStatus = (row: ProcessedRow) => {
     if (!row.scrapingStatus || row.status === 'Fetched' || (row.status === 'Error' && !row.scrapingErrorMessage)) {
         return <span className="text-xs text-muted-foreground italic">N/A</span>;
     }
     const error = scrapingErrors[row.originalIndex];
     switch (row.scrapingStatus) {
         case 'Pending': return <Badge variant="outline">Pending Scrape</Badge>;
         case 'Scraping': return <Badge variant="secondary" className="animate-pulse"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Scraping...</Badge>;
         case 'Success':
             return (
                 <TooltipProvider>
                     <Tooltip><TooltipTrigger asChild><Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 cursor-help"><CheckCircle className="mr-1 h-3 w-3" /> Scraped</Badge></TooltipTrigger><TooltipContent><p className="max-w-xs text-xs">{row.scrapedText ? `Length: ${row.scrapedText.length}` : 'No text scraped.'}</p></TooltipContent></Tooltip>
                 </TooltipProvider>
             );
         case 'Failed_Scrape': case 'Failed_Error':
             return (
                 <TooltipProvider>
                     <Tooltip><TooltipTrigger asChild><Badge variant="destructive" className="cursor-help"><XCircle className="mr-1 h-3 w-3" /> Failed</Badge></TooltipTrigger><TooltipContent><p className="max-w-xs text-xs">{row.scrapingErrorMessage || error || 'Scraping failed.'}</p></TooltipContent></Tooltip>
                 </TooltipProvider>
             );
         default: return <Badge variant="secondary">Unknown</Badge>;
     }
 };

 const renderSummarizationStatus = (row: ProcessedRow) => {
    if (!row.summarizationStatus || row.scrapingStatus !== 'Success' ) {
         if (row.status === 'Fetched' || (row.status === 'Error' && !row.summarizationErrorMessage)) return <span className="text-xs text-muted-foreground italic">N/A</span>;
         if (row.scrapingStatus === 'Failed_Error' || row.scrapingStatus === 'Failed_Scrape') return <Badge variant="outline" className="border-orange-400 text-orange-700 dark:border-orange-600 dark:text-orange-400">Not Summarized</Badge>;
    }

     switch (row.summarizationStatus) {
         case 'Pending_Summary': return <Badge variant="outline">Pending Summary</Badge>;
         case 'Summarizing': return <Badge variant="secondary" className="animate-pulse"><Loader2 className="mr-1 h-3 w-3 animate-spin" />Summarizing...</Badge>;
         case 'Success_Summary':
             return (
                 <TooltipProvider>
                     <Tooltip>
                         <TooltipTrigger asChild>
                            <Badge variant="secondary" className="bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300 cursor-help flex flex-col items-start gap-0.5 py-1">
                                 <div className="flex items-center">
                                     <MessageSquareQuote className="mr-1 h-3 w-3" /> Summarized
                                 </div>
                                 {row.independenceCriteria === "Yes" && <div className="flex items-center text-xs"><ShieldQuestion className="mr-1 h-3 w-3 text-amber-600 dark:text-amber-400" /><span>May Not Be Indep.</span></div>}
                                 {row.insufficientInfo === "Yes" && <div className="flex items-center text-xs"><FileWarning className="mr-1 h-3 w-3 text-rose-600 dark:text-rose-400"/><span>Low Info</span></div>}
                             </Badge>
                         </TooltipTrigger>
                         <TooltipContent className="max-w-md">
                             <p className="text-sm font-semibold mb-1">Summary:</p>
                             <p className="text-xs mb-2">{row.summary || 'No summary available.'}</p>
                             {row.independenceCriteria === "Yes" && <p className="text-xs text-amber-700 dark:text-amber-300 mb-1">Potential Independence Issue: Company may be government-owned, non-profit, or a subsidiary.</p>}
                             {row.insufficientInfo === "Yes" && <p className="text-xs text-rose-700 dark:text-rose-300">Insufficient Information: The website text was broken, irrelevant, or too minimal for full analysis.</p>}
                         </TooltipContent>
                     </Tooltip>
                 </TooltipProvider>
             );
         case 'Failed_Summary':
             return (
                 <TooltipProvider>
                     <Tooltip><TooltipTrigger asChild><Badge variant="destructive" className="cursor-help"><XCircle className="mr-1 h-3 w-3" /> Failed</Badge></TooltipTrigger><TooltipContent><p className="max-w-xs text-xs">{row.summarizationErrorMessage || 'Summarization failed.'}</p></TooltipContent></Tooltip>
                 </TooltipProvider>
             );
         default: return <span className="text-xs text-muted-foreground italic">N/A</span>;
     }
 };


  return (
    <main className="flex min-h-screen flex-col items-center p-6 md:p-12 lg:p-24 bg-background">
        <TooltipProvider>
      <div className="w-full max-w-7xl space-y-8">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold">Overviewer 3</CardTitle>
            <CardDescription>Upload an XLSX file, confirm headers, process, scrape, and summarize company data.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
               <Label htmlFor="file-upload" className={`file-input-label ${isParsing || isProcessingPhase3 || isScraping || isSummarizingAny ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Upload className="mr-2 h-4 w-4" /> {fileName || 'Choose XLSX File'}
              </Label>
              <Input id="file-upload" type="file" accept=".xlsx" onChange={handleFileUpload} className="file-input" disabled={isParsing || isProcessingPhase3 || isScraping || isSummarizingAny} />
            </div>
             {isParsing && (<div className="space-y-2"><Progress value={uploadProgress} className="w-full" /><p className="text-sm text-muted-foreground text-center">{uploadProgress > 0 && uploadProgress < 100 ? `${uploadProgress}% Uploaded` : "Processing file..."}</p></div>)}
            {parseError && (<Alert variant="destructive"><Terminal className="h-4 w-4" /><AlertTitle>Parsing Error</AlertTitle><AlertDescription>{parseError}</AlertDescription></Alert>)}
          </CardContent>
        </Card>

         {rawHeaders.length > 0 && !confirmedHeaders && showConfirmationUI && (
             <Card className="shadow-md">
                 <CardHeader><CardTitle>Confirm Column Headers</CardTitle><CardDescription>AI has suggested columns. Review and confirm/correct the mapping.</CardDescription></CardHeader>
                 <CardContent className="space-y-4">
                    {isDetectingHeaders && (<div className="flex items-center justify-center space-x-2 p-4"><Loader2 className="h-5 w-5 animate-spin" /><span>Detecting headers...</span></div>)}
                    {detectHeadersError && (<Alert variant="destructive"><Terminal className="h-4 w-4" /><AlertTitle>Header Detection Error</AlertTitle><AlertDescription>{detectHeadersError}</AlertDescription></Alert>)}
                     {!isDetectingHeaders && aiSuggestedHeaders && (
                         <>
                             {renderHeaderSelector("Company Name", "companyNameHeader")}
                             {renderHeaderSelector("Country", "countryHeader")}
                             {renderHeaderSelector("Website URL", "websiteHeader")}
                              <Separator />
                              <div className="flex justify-end">
                                 <Button onClick={handleConfirmHeaders} disabled={isDetectingHeaders || isProcessingPhase3 || isScraping || isSummarizingAny}>
                                     <CheckCircle className="mr-2 h-4 w-4" /> Confirm & Process
                                 </Button>
                             </div>
                         </>
                     )}
                      {isDetectingHeaders && (
                         <div className="space-y-4">
                           {[1,2,3].map(i => (<div key={i} className="grid grid-cols-3 items-center gap-4"><Skeleton className="h-5 w-20 justify-self-end" /><div className="col-span-2 flex items-center gap-2"><Skeleton className="h-9 w-full" /></div></div>))}
                           <Separator />
                           <div className="flex justify-end"><Skeleton className="h-10 w-40" /></div>
                       </div>
                      )}
                 </CardContent>
             </Card>
         )}

         {isProcessingPhase3 && (<Card className="shadow-md"><CardContent className="p-6 flex items-center justify-center space-x-3"><Loader2 className="h-6 w-6 animate-spin text-primary" /><span className="text-lg font-medium">Normalizing and checking data...</span></CardContent></Card>)}
         {phase3Error && (<Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Processing Error (Phase 3)</AlertTitle><AlertDescription>{phase3Error}</AlertDescription></Alert>)}

         {confirmedHeaders && !isProcessingPhase3 && !phase3Error && rowsToProcessCount > 0 && (
             <Card className="shadow-md">
                 <CardHeader><CardTitle>Web Scraping & Summarization</CardTitle><CardDescription>{rowsToProcessCount} {rowsToProcessCount === 1 ? 'row needs' : 'rows need'} web content scraping and AI summarization.</CardDescription></CardHeader>
                 <CardContent><p className="text-sm text-muted-foreground mb-4">Click to attempt scraping & summarizing for rows marked 'To Process'. This may take time.</p></CardContent>
                 <CardFooter className="flex justify-end">
                     <Button onClick={handleScraping} disabled={isScraping || isProcessingPhase3 || isSummarizingAny}>
                         {(isScraping || isSummarizingAny) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <SearchCode className="mr-2 h-4 w-4" />}
                         {(isScraping || isSummarizingAny) ? 'Processing Web Content...' : `Start Scraping & Summarizing (${rowsToProcessCount})`}
                     </Button>
                 </CardFooter>
             </Card>
         )}
         {confirmedHeaders && !isProcessingPhase3 && processedRows.length > 0 && (rowsSuccessfullyScrapedCount > 0 || rowsFailedScrapeCount > 0) && (
            <Alert variant="default" className="mt-4">
                 <Bot className="h-4 w-4" /><AlertTitle>Processing Summary</AlertTitle>
                 <AlertDescription>Successfully scraped: {rowsSuccessfullyScrapedCount} | Failed to scrape: {rowsFailedScrapeCount}</AlertDescription>
                 <AlertDescription>Summarized: {processedRows.filter(r => r.summarizationStatus === 'Success_Summary').length} | Failed to summarize: {processedRows.filter(r => r.summarizationStatus === 'Failed_Summary').length}</AlertDescription>
             </Alert>
         )}

        {rawHeaders.length > 0 && rawRows.length > 0 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>File Contents: {fileName}</CardTitle>
              <CardDescription>
                {confirmedHeaders ? `Displaying ${processedRows.length > 0 ? processedRows.length : rawRows.length} rows with processing, scraping & summarization status.` : (aiSuggestedHeaders ? "Highlighting suggested columns. Confirm above." : "Awaiting header confirmation.")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] w-full rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                    <TableRow>
                       {confirmedHeaders && (
                           <>
                            <TableHead className="font-bold w-[130px] sticky left-0 bg-card z-20">Status</TableHead>
                            <TableHead className="font-bold w-[130px]">Scraping</TableHead>
                            <TableHead className="font-bold w-[150px]">AI Summary</TableHead> {/* New Column */}
                           </>
                       )}
                       {rawHeaders.map((header, index) => (<TableHead key={`${header}-${index}`} className={cn("font-semibold whitespace-nowrap", getHighlightClass(header))}>{header}</TableHead>))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                     {(processedRows.length > 0 ? processedRows : rawRows).map((item, rowIndex) => {
                         const isProcessed = (item as ProcessedRow).originalIndex !== undefined;
                         const rowData = isProcessed ? rawRows[(item as ProcessedRow).originalIndex] : item as ExcelRow;
                         const processedInfo = isProcessed ? (item as ProcessedRow) : null;
                         return (
                              <TableRow key={processedInfo?.originalIndex ?? rowIndex} className={cn(processedInfo?.status === 'Fetched' ? 'opacity-70' : '', (processedInfo?.scrapingStatus === 'Scraping' || processedInfo?.summarizationStatus === 'Summarizing') ? 'animate-pulse bg-muted/50' : '')}>
                                {confirmedHeaders && (
                                     <>
                                     <TableCell className="font-medium align-top sticky left-0 bg-card z-20 border-r">
                                        {processedInfo ? (<div className="flex flex-col items-start gap-1 w-[110px]">{renderStatusBadge(processedInfo.status)} {processedInfo.status === 'Fetched' && processedInfo.fetchedData?.summary && (<Tooltip><TooltipTrigger asChild><span className="text-xs text-muted-foreground truncate cursor-help">Summary: {processedInfo.fetchedData.summary}</span></TooltipTrigger><TooltipContent><p className="max-w-xs text-xs">{processedInfo.fetchedData.summary}</p></TooltipContent></Tooltip>)} {processedInfo.status === 'Error' && processedInfo.errorMessage && (<Tooltip><TooltipTrigger asChild><span className="text-xs text-destructive truncate cursor-help">{processedInfo.errorMessage}</span></TooltipTrigger><TooltipContent><p className="max-w-xs text-xs">{processedInfo.errorMessage}</p></TooltipContent></Tooltip>)}</div>) : isProcessingPhase3 ? (<Skeleton className="h-5 w-20" />) : (<Badge variant="outline">Pending</Badge>)}
                                     </TableCell>
                                     <TableCell className="font-medium align-top">
                                         {processedInfo ? (<div className="w-[110px]">{renderScrapingStatus(processedInfo)}</div>) : isProcessingPhase3 ? (<Skeleton className="h-5 w-20" />) : (<span className="text-xs text-muted-foreground italic">N/A</span>)}
                                     </TableCell>
                                     <TableCell className="font-medium align-top"> {/* New Cell */}
                                         {processedInfo ? (<div className="w-[130px]">{renderSummarizationStatus(processedInfo)}</div>) : (isProcessingPhase3 || isScraping || isSummarizingAny) ? (<Skeleton className="h-5 w-24" />) : (<span className="text-xs text-muted-foreground italic">N/A</span>)}
                                     </TableCell>
                                     </>
                                 )}
                                 {rawHeaders.map((header, cellIndex) => (<TableCell key={`${header}-${cellIndex}`} className={cn("whitespace-normal break-words align-top", getHighlightClass(header))}>{renderCellContent(rowData[cellIndex] !== undefined ? rowData[cellIndex] : null)}</TableCell>))}
                              </TableRow>
                         );
                     })}
                     {isProcessingPhase3 && processedRows.length === 0 && rawRows.slice(0, 5).map((_, idx) => (
                         <TableRow key={`skeleton-${idx}`}>
                             {confirmedHeaders && (<><TableCell><Skeleton className="h-5 w-20" /></TableCell><TableCell><Skeleton className="h-5 w-20" /></TableCell><TableCell><Skeleton className="h-5 w-24" /></TableCell></>)}
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
      </TooltipProvider>
    </main>
  );
}
