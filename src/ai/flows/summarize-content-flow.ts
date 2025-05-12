
'use server';
/**
 * @fileOverview AI flow to summarize company text and determine independence criteria.
 *
 * - summarizeContent - A function that takes company text and returns a summary and analysis.
 * - SummarizeContentInput - The input type for the summarizeContent function.
 * - SummarizeContentOutput - The return type for the summarizeContent function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'zod';

// Input Schema: Text scraped from a company's website.
const SummarizeContentInputSchema = z.object({
  companyText: z.string().describe('Text content scraped from the company website.'),
});
export type SummarizeContentInput = z.infer<typeof SummarizeContentInputSchema>;

// Output Schema: Summary and analysis of the company text.
const SummarizeContentOutputSchema = z.object({
  summary: z.string().describe(
    'A formal 2-3 sentence company overview. If information is insufficient, this will be a specific message.'
  ),
  independenceCriteria: z.enum(["Yes", ""]).describe(
    'Output "Yes" if the company is government-owned, non-profit, or a subsidiary. Otherwise, output "".'
  ),
  insufficientInfo: z.enum(["Yes", ""]).describe(
    'Output "Yes" if the text is broken, irrelevant, or too minimal for analysis. Otherwise, output "".'
  ),
});
export type SummarizeContentOutput = z.infer<typeof SummarizeContentOutputSchema>;

// Define the prompt for the LLM
const summarizeContentPrompt = ai.definePrompt({
  name: 'summarizeContentPrompt',
  input: { schema: SummarizeContentInputSchema },
  output: { schema: SummarizeContentOutputSchema },
  prompt: `You are a Transfer Pricing analyst. Based on the provided Company Text, generate a JSON object with the following three keys: "summary", "independenceCriteria", and "insufficientInfo".

1.  "summary": A formal 2-3 sentence company overview covering:
    - Main business activity
    - Key products/services offered
    - The industry or sector it operates in.
    If "insufficientInfo" is "Yes" (see below), this "summary" MUST be exactly: "Due to a website error or lack of information, the company’s business function could not be determined."

2.  "independenceCriteria": A string. Output "Yes" if the text explicitly states or strongly implies the company is government-owned, a non-profit entity, or owned by/a subsidiary of another parent company. Otherwise, output "".

3.  "insufficientInfo": A string. Output "Yes" if the provided text is clearly broken, contains error messages, is completely irrelevant to describing the company's business (e.g., placeholder text, login pages), or is too minimal to determine the business function. Otherwise, output "".

Company Text:
{{{companyText}}}
`,
});

// Define the Genkit flow
const summarizeContentFlow = ai.defineFlow(
  {
    name: 'summarizeContentFlow',
    inputSchema: SummarizeContentInputSchema,
    outputSchema: SummarizeContentOutputSchema,
  },
  async (input: SummarizeContentInput): Promise<SummarizeContentOutput> => {
    if (!input.companyText || input.companyText.trim() === "") {
        console.warn("summarizeContentFlow received empty companyText.");
        return {
            summary: "Due to a website error or lack of information, the company’s business function could not be determined.",
            independenceCriteria: "",
            insufficientInfo: "Yes",
        };
    }

    const { output } = await summarizeContentPrompt(input);

    if (!output) {
        throw new Error("LLM did not return an output for summarization.");
    }
    
    // Ensure the special summary for insufficientInfo is correctly set if LLM flags it
    if (output.insufficientInfo === "Yes" && output.summary !== "Due to a website error or lack of information, the company’s business function could not be determined.") {
        console.warn("LLM flagged insufficientInfo but provided a different summary. Overriding summary.");
        output.summary = "Due to a website error or lack of information, the company’s business function could not be determined.";
    }


    console.log("Summarization flow output:", output);
    return output;
  }
);

// Exported wrapper function
export async function summarizeContent(input: SummarizeContentInput): Promise<SummarizeContentOutput> {
  console.log("Calling summarizeContentFlow with input text length:", input.companyText.length);
  try {
    const result = await summarizeContentFlow(input);
    return result;
  } catch (error) {
    console.error("Error executing summarizeContentFlow:", error);
    throw error;
  }
}
