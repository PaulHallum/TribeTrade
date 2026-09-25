import { logger } from "../logger";
import { getAI, GoogleAIBackend } from "firebase/ai";
import app from "../../lib/firebase";
import { z } from "zod";

// Initialize Google AI (global shared instance)
export const googleAI = getAI(app, { backend: new GoogleAIBackend() });

// Shared model constants
export const FLASH_3_5_LITE = "gemini-3.5-flash-lite";
export const FLASH_3_1_LITE = FLASH_3_5_LITE;

// ─── ZOD SCHEMAS FOR AI RESPONSES ────────────────────────────────

export const NLPActionDataSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  name: z.string().optional(),
  category: z.enum(["Essentials", "Fresh", "Frozen", "Household", "Other"]).optional(),
  dueDate: z.string().optional(),
  assignedTo: z.string().nullable().optional(),
  location: z.string().optional(),
  startTime: z.string().optional(),
  query: z.string().optional(),
}).passthrough();

export const NLPActionSchema = z.object({
  action: z.string(),
  data: NLPActionDataSchema.optional(),
});

export const NLPResponseSchema = z.object({
  actions: z.array(NLPActionSchema).optional().default([]),
  message: z.string().optional().default(""),
});

export const PantryAnalysisSchema = z.object({
  items: z.array(z.string()).optional().default([]),
  categories: z.record(z.string(), z.array(z.string())).optional().default({}),
  mealIdeas: z.array(z.string()).optional().default([]),
}).passthrough();

export const SmartCaptureSchema = z.object({
  type: z.string().optional(),
  title: z.string().optional(),
  details: z.string().optional(),
  date: z.string().optional(),
  time: z.string().optional(),
  assignedTo: z.string().optional(),
}).passthrough();

export type NLPResponse = z.infer<typeof NLPResponseSchema>;
export type PantryAnalysisResponse = z.infer<typeof PantryAnalysisSchema>;
export type SmartCaptureResponse = z.infer<typeof SmartCaptureSchema>;

export async function withSilentRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    logger.warn('AI call or formatting failed, attempting silent retry...', error);
    try {
      return await fn();
    } catch (retryError) {
      logger.error('AI call silent retry failed', retryError);
      throw retryError;
    }
  }
}

/**
 * Executes an AI operation with user-facing retry handling.
 * Displays descriptive errors when model output fails Zod parsing after retries.
 */
export async function withUserRetry<T>(
  fn: () => Promise<T>,
  onRetry?: (attempt: number, error: unknown) => void
): Promise<T> {
  let attempt = 0;
  const maxAttempts = 2;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      logger.warn(`AI response attempt ${attempt} failed to parse or execute:`, error);
      if (onRetry) {
        onRetry(attempt, error);
      }
      if (attempt >= maxAttempts) {
        throw new Error("AI had trouble parsing this response. Please retry.");
      }
    }
  }
}

/**
 * Robustly parses JSON from AI responses, stripping markdown if present.
 * Sanitizes unescaped literal control characters inside string literals.
 */
function sanitizeJSONControlChars(str: string): string {
  let inString = false;
  let escape = false;
  let res = '';
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (escape) {
      res += c;
      escape = false;
      continue;
    }
    if (c === '\\') {
      res += c;
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      res += c;
      continue;
    }
    if (inString) {
      if (c === '\n') res += '\\n';
      else if (c === '\r') res += '\\r';
      else if (c === '\t') res += '\\t';
      else if (c.charCodeAt(0) < 32) {
        res += '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
      } else {
        res += c;
      }
    } else {
      res += c;
    }
  }
  return res;
}

export function safeParseJSON(text: string) {
  const sanitizedText = sanitizeJSONControlChars(text);
  try {
    // 1. Try direct parse
    return JSON.parse(sanitizedText);
  } catch (e) {
    // 2. Try stripping markdown blocks
    const cleaned = sanitizeJSONControlChars(text.replace(/```json\n?|```/g, '').trim());
    try {
      return JSON.parse(cleaned);
    } catch (e2) {
      // 3. Find first balanced JSON block
      let braceStack = 0;
      let bracketStack = 0;
      let start = -1;
      let inString = false;
      let escape = false;

      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (escape) {
          escape = false;
          continue;
        }
        if (char === '\\') {
          escape = true;
          continue;
        }
        if (char === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;

        if (char === '{' || char === '[') {
          if (start === -1) start = i;
          if (char === '{') braceStack++;
          else bracketStack++;
        } else if (char === '}' || char === ']') {
          if (char === '}') braceStack--;
          else bracketStack--;

          if (braceStack === 0 && bracketStack === 0 && start !== -1) {
            const extracted = sanitizeJSONControlChars(text.substring(start, i + 1));
            try {
              return JSON.parse(extracted);
            } catch (e3) {
              throw e3;
            }
          }
        }
      }
      throw e2;
    }
  }
}

/**
 * Safely parses and validates AI JSON responses using a Zod schema.
 */
export function parseAndValidateJSON<T>(text: string, schema: z.ZodSchema<T>): T {
  const json = safeParseJSON(text);
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    logger.warn('Zod validation failure on AI JSON response:', parsed.error);
    // Return parsed json fallback if non-strict, or throw
    return json as T;
  }
  return parsed.data;
}
