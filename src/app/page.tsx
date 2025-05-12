"use client";

import type { ChangeEvent} from 'react';
import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';


type ExcelRow = (string | number | boolean | Date | null)[];

export default function Home() {
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<ExcelRow[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleFileUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setHeaders([]);
    setRows([]);
    setError(null);
    setIsLoading(true);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        if (!data) {
          throw new Error("Failed to read file data.");
        }
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        // Use header: 1 to get array of arrays
        const jsonData = XLSX.utils.sheet_to_json<ExcelRow>(worksheet, { header: 1, defval: null });

        if (jsonData.length === 0) {
          setHeaders([]);
          setRows([]);
          setError("The uploaded file is empty or could not be parsed correctly.");
          setIsLoading(false);
          return;
        }

        // Ensure all headers are strings
        const extractedHeaders = jsonData[0].map(header => String(header ?? ''));
        const extractedRows = jsonData.slice(1);

        setHeaders(extractedHeaders);
        setRows(extractedRows);
        setError(null);
      } catch (err) {
        console.error("Error parsing Excel file:", err);
        setError(`Failed to parse the Excel file. Please ensure it's a valid .xlsx file. Error: ${err instanceof Error ? err.message : String(err)}`);
        setHeaders([]);
        setRows([]);
      } finally {
        setIsLoading(false);
      }
    };

    reader.onerror = (err) => {
        console.error("Error reading file:", err);
        setError("Failed to read the file.");
        setIsLoading(false);
    }

    reader.readAsArrayBuffer(file);
  };

   const renderCellContent = (cellData: string | number | boolean | Date | null): React.ReactNode => {
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
            <CardDescription>Upload an XLSX file to view its contents.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
               <Label htmlFor="file-upload" className="file-input-label">
                <Upload className="mr-2 h-4 w-4" /> {fileName || 'Choose XLSX File'}
              </Label>
              <Input
                id="file-upload"
                type="file"
                accept=".xlsx"
                onChange={handleFileUpload}
                className="file-input" // Hidden input
                disabled={isLoading}
              />
            </div>
             {isLoading && <p className="text-sm text-muted-foreground">Processing file...</p>}
            {error && <p className="text-sm text-destructive">{error}</p>}
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
                        {row.map((cell, cellIndex) => (
                          <TableCell key={cellIndex} className="whitespace-nowrap">
                            {renderCellContent(cell)}
                          </TableCell>
                        ))}
                         {/* Pad row with empty cells if shorter than header */}
                        {Array.from({ length: Math.max(0, headers.length - row.length) }).map((_, padIndex) => (
                          <TableCell key={`pad-${padIndex}`} />
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
