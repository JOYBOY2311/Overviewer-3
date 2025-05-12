
"use client";

import type { ChangeEvent} from 'react';
import { useState } from 'react';
import { Upload } from 'lucide-react';

import { Button } from '@/components/ui/button'; // Keep Button if needed for other actions, maybe remove if unused now
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress'; // Import Progress
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert" // Import Alert
import { Terminal } from "lucide-react" // Import icon for Alert
import { parseSheetFunctionUrl } from '@/lib/config'; // Import function URL

type ExcelRow = (string | number | boolean | Date | null)[];

export default function Home() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0); // State for progress

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setHeaders([]);
    setRows([]);
    setError(null);
    setIsLoading(true);
    setUploadProgress(0); // Reset progress

    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();

      // Track progress
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          setUploadProgress(percentComplete);
        }
      };

      xhr.open('POST', parseSheetFunctionUrl, true); // Use the function URL from config

      xhr.onload = () => {
        setIsLoading(false);
        if (xhr.status === 200) {
          try {
            const result = JSON.parse(xhr.responseText);
            if (result.error) {
               setError(`Function Error: ${result.error}`);
               setHeaders([]);
               setRows([]);
            } else if (result.headers && result.rows) {
              setHeaders(result.headers);
              setRows(result.rows);
              setError(null);
            } else {
              setError("Invalid response format from the function.");
              setHeaders([]);
              setRows([]);
            }
          } catch (parseError) {
             console.error("Error parsing function response:", parseError);
             setError(`Failed to parse response from the function. Error: ${parseError instanceof Error ? parseError.message : String(parseError)}`);
             setHeaders([]);
             setRows([]);
          }
        } else {
          console.error("Error calling parseSheet function:", xhr.statusText, xhr.responseText);
          let errorMessage = `Error calling parse function (Status: ${xhr.status})`;
          try {
             const errorResponse = JSON.parse(xhr.responseText);
             if(errorResponse.error) {
                errorMessage += `: ${errorResponse.error}`
             }
          } catch (e) {
             // Ignore if response is not JSON
          }
          setError(errorMessage);
          setHeaders([]);
          setRows([]);
        }
         // Reset progress after completion (success or error)
         // Keep showing 100% for a moment if successful
         if (xhr.status !== 200) {
            setUploadProgress(0);
         }
      };

      xhr.onerror = () => {
        setIsLoading(false);
        setUploadProgress(0); // Reset progress on network error
        console.error("Network error during upload:", xhr.statusText);
        setError("Network error: Failed to connect to the parsing service.");
        setHeaders([]);
        setRows([]);
      };

      xhr.send(formData);

    } catch (err) {
      setIsLoading(false);
      setUploadProgress(0); // Reset progress on unexpected error
      console.error("Error setting up the upload request:", err);
      setError(`An unexpected error occurred during setup. Error: ${err instanceof Error ? err.message : String(err)}`);
      setHeaders([]);
      setRows([]);
    } finally {
       // Don't set isLoading to false here, it's handled in onload/onerror
       // Reset file input value to allow re-uploading the same file
       if (event.target) {
           event.target.value = '';
       }
    }
  };

   const renderCellContent = (cellData: string | number | boolean | Date | null): React.ReactNode => {
     // Dates might come as strings from JSON, attempt to parse if they look like ISO strings
    if (typeof cellData === 'string') {
       // Basic check for ISO-like date format (YYYY-MM-DDTHH:mm:ss.sssZ)
      const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/;
       if (isoDateRegex.test(cellData)) {
         try {
           return new Date(cellData).toLocaleDateString();
         } catch (e) {
           // If parsing fails, fall back to string display
           return cellData;
         }
       }
    }
    if (cellData instanceof Date) {
      return cellData.toLocaleDateString(); // Or format as needed
    }
    if (typeof cellData === 'boolean') {
        return cellData ? 'TRUE' : 'FALSE';
    }
    return cellData !== null ? String(cellData) : '';
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-6 md:p-12 lg:p-24 bg-background">
      <div className="w-full max-w-6xl space-y-8">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold">Overviewer 3</CardTitle>
            <CardDescription>Upload an XLSX file to view its contents via backend parsing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
               <Label htmlFor="file-upload" className={`file-input-label ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                <Upload className="mr-2 h-4 w-4" /> {fileName || 'Choose XLSX File'}
              </Label>
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" // More specific MIME type
                onChange={handleFileUpload}
                className="file-input" // Hidden input
                disabled={isLoading}
              />
            </div>
             {isLoading && (
                <div className="space-y-2">
                    <Progress value={uploadProgress} className="w-full" />
                    <p className="text-sm text-muted-foreground text-center">{uploadProgress}% Uploaded</p>
                </div>
             )}
            {error && (
                 <Alert variant="destructive">
                  <Terminal className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    {error}
                  </AlertDescription>
                </Alert>
            )}
          </CardContent>
        </Card>

        {headers.length > 0 && (
          <Card className="shadow-md">
            <CardHeader>
              <CardTitle>File Contents: {fileName}</CardTitle>
              <CardDescription>Displaying the first sheet of the uploaded Excel file.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px] w-full rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 bg-secondary z-10">
                    <TableRow>
                      {headers.map((header, index) => (
                        <TableHead key={index} className="font-medium whitespace-nowrap">
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {headers.map((header, cellIndex) => ( // Iterate using headers length
                          <TableCell key={cellIndex} className="whitespace-nowrap">
                             {/* Access row data by index, matching header index */}
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
