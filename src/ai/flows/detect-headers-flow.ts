
'use server';
/**
 * @fileOverview AI flow to detect specific headers (Company Name, Country, Website) from a list.
 *
 * - detectHeaders - A function that takes a list of headers and returns suggested mappings.
 * - DetectHeadersInput - The input type for the detectHeaders function.
 * - DetectHeadersOutput - The return type for the detectHeaders function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// Input Schema: An array of header strings from the Excel file.
const DetectHeadersInputSchema = z.object({
  headers: z.array(z.string()).describe('An array of header strings extracted from the uploaded file.'),
});
export type DetectHeadersInput = z.infer<typeof DetectHeadersInputSchema>;

// Output Schema: Mapping of semantic types to the best matching header string.
// Null indicates no suitable header was found for that category.
const DetectHeadersOutputSchema = z.object({
  companyNameHeader: z.string().nullable().describe('The header string identified as representing the Company Name, or null if none found.'),
  countryHeader: z.string().nullable().describe('The header string identified as representing the Country, or null if none found.'),
  websiteHeader: z.string().nullable().describe('The header string identified as representing the Website URL, or null if none found.'),
});
export type DetectHeadersOutput = z.infer<typeof DetectHeadersOutputSchema>;

// Define the prompt for the LLM
const detectHeadersPrompt = ai.definePrompt({
  name: 'detectHeadersPrompt',
  input: { schema: DetectHeadersInputSchema },
  output: { schema: DetectHeadersOutputSchema },
  prompt: `Given the following list of headers from a spreadsheet:
{{#each headers}}
- {{{this}}}
{{/each}}

Analyze these headers and identify which one corresponds best to each of the following categories:
1.  **Company Name**: Look for headers like 'Company', 'Organization', 'Firm Name', 'Business Name', etc.
2.  **Country**: Look for headers like 'Country', 'Location', 'Region', 'Based In', etc.
3.  **Website URL**: Look for headers like 'Website', 'URL', 'Web Address', 'Homepage', 'Site', etc.

Return the exact header string from the list that best matches each category. If no suitable header is found for a category, return null for that category.
`,
});

// Define the Genkit flow
const detectHeadersFlow = ai.defineFlow(
  {
    name: 'detectHeadersFlow',
    inputSchema: DetectHeadersInputSchema,
    outputSchema: DetectHeadersOutputSchema,
  },
  async (input: DetectHeadersInput) => {
    // Ensure headers list is not empty
    if (!input.headers || input.headers.length === 0) {
        console.warn("detectHeadersFlow received empty headers array.");
        return {
            companyNameHeader: null,
            countryHeader: null,
            websiteHeader: null,
        };
    }
    // Call the LLM prompt
    const { output } = await detectHeadersPrompt(input);

    // Validate output - ensure returned headers actually exist in the input list or are null
    const validOutput: DetectHeadersOutput = {
        companyNameHeader: output?.companyNameHeader && input.headers.includes(output.companyNameHeader) ? output.companyNameHeader : null,
        countryHeader: output?.countryHeader && input.headers.includes(output.countryHeader) ? output.countryHeader : null,
        websiteHeader: output?.websiteHeader && input.headers.includes(output.websiteHeader) ? output.websiteHeader : null,
    };

    console.log("Genkit flow output:", validOutput);
    return validOutput;
  }
);

// Exported wrapper function to be called by the Firebase Function
export async function detectHeaders(input: DetectHeadersInput): Promise<DetectHeadersOutput> {
    console.log("Calling detectHeadersFlow with input:", input);
  try {
    const result = await detectHeadersFlow(input);
    return result;
  } catch (error) {
    console.error("Error executing detectHeadersFlow:", error);
    // Re-throw or handle as appropriate for the calling function
    throw error;
  }
}
