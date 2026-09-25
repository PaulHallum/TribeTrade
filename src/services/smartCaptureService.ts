import { getGenerativeModel } from "firebase/ai";
import { logger } from "./logger";
import { withSilentRetry, safeParseJSON, googleAI, FLASH_3_1_LITE } from "./ai/aiUtils";
import { lookupPlaceDetails } from "./placesService";
import { incrementSmartCaptureUsage, incrementSmartConvertUsage } from "./usageService";
import { auth } from "../lib/firebase";

/**
 * Aggressively strip HTML to minimize token count and increase speed.
 * Removes scripts, styles, and other non-content elements.
 */
export function stripHtml(html: string): string {
  if (typeof window === 'undefined') return html; 
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Remove heavy/useless elements for AI
    const toRemove = doc.querySelectorAll('script, style, link, svg, path, head, footer, nav');
    toRemove.forEach(el => el.remove());
    
    // Get text and collapse whitespace
    return (doc.body.textContent || "").replace(/\s+/g, ' ').trim();
  } catch (e) {
    return html.replace(/<[^>]*>/g, ''); // Fallback simple regex
  }
}

export interface SmartConversionResult {
  actions: {
    action: 'CREATE_TASK' | 'CREATE_CALENDAR_EVENT' | 'CREATE_NOTE' | 'CREATE_SHOPPING_ITEM' | 'CREATE_RECIPE';
    data: {
      title?: string;
      description?: string;
      content?: string;
      dueDate?: string;
      startTime?: string;
      endTime?: string;
      location?: string;
      category?: string;
      name?: string;
      ingredients?: string[];
      instructions?: string;
      prepTime?: string;
      servings?: string;
    };
  }[];
  summary: string;
}

function clampPastTaskDates(result: any) {
  if (!result || !Array.isArray(result.actions)) return result;
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sanitizedActions: any[] = [];
  
  result.actions.forEach((act: any) => {
    if (act.action === 'CREATE_TASK' && act.data?.dueDate) {
      const parsedDate = new Date(act.data.dueDate);
      if (!isNaN(parsedDate.getTime()) && parsedDate < todayStart) {
        // Clamp past-dated tasks to today at 09:00 local time
        const clamped = new Date(todayStart);
        clamped.setHours(9, 0, 0, 0);
        act.data.dueDate = clamped.toISOString();
      }
      sanitizedActions.push(act);
    } else if (act.action === 'CREATE_CALENDAR_EVENT') {
      const loc = act.data?.location ? act.data.location.trim() : '';
      const invalidLocs = ['', 'tbc', 'tbd', 'unknown', 'n/a', 'none', 'to be confirmed'];
      const isLocValid = loc.length > 0 && !invalidLocs.includes(loc.toLowerCase());

      if (!isLocValid) {
        // STRICT ZERO HALLUCINATION RULE: If a calendar event does not have a verified, specific location,
        // convert it to a CREATE_TASK to check location/dates instead of putting an unverified event on the calendar.
        const clampedDate = new Date(todayStart);
        clampedDate.setHours(9, 0, 0, 0);
        sanitizedActions.push({
          action: 'CREATE_TASK',
          data: {
            title: `Check dates & location for ${act.data?.title || 'event'}`,
            description: act.data?.description || 'Event location or date is unconfirmed.',
            dueDate: act.data?.startTime || clampedDate.toISOString(),
            assignedTo: act.data?.assignedTo || 'all'
          }
        });
      } else {
        sanitizedActions.push(act);
      }
    } else {
      sanitizedActions.push(act);
    }
  });

  result.actions = sanitizedActions;
  return result;
}

export async function processSmartCapture(input: { text?: string; imageBase64?: string; mimeType?: string }, members: any[] = [], language: string = "English", isBriefingContext: boolean = false) {
  const user = auth.currentUser;
  if (user) {
    await incrementSmartCaptureUsage(user.uid);
  }

  const parts: any[] = [];
  
  if (input.text) {
    // Aggressive cleaning to keep context lean and fast. Limit to 4000 for speed.
    const cleanText = stripHtml(input.text).substring(0, 4000); 
    parts.push({ text: `Analyze this content and extract actionable items:\n\n${cleanText}` });
  }

  if (input.imageBase64) {
    parts.push({ inlineData: { data: input.imageBase64, mimeType: input.mimeType || "image/jpeg" } });
  }

  const systemInstruction = `Tribe: The Family Hub UK family assistant. Extract actionable data for Tribe: The Family Hub app.
Date: ${new Date().toLocaleString('en-GB')}
RULES:
- STRICT 100% ACCURACY & ZERO HALLUCINATION RULE: NEVER invent, speculate, or hallucinate real-world events, shows, locations, or dates. Only extract items explicitly present in the input text. Do NOT output a CREATE_CALENDAR_EVENT action if the venue location or date is missing, unconfirmed, or non-existent. If location or date details are missing, output ONLY a CREATE_TASK to "Check dates and location for [Event Title]".
${isBriefingContext ? '- CONTEXT: The input text is a Daily Briefing summarizing EXISTING events/tasks. NEVER use CREATE_CALENDAR_EVENT for anything mentioned in the briefing. The event is already in the calendar. INSTEAD, ONLY suggest proactive preparation tasks (CREATE_TASK) or shopping items (CREATE_SHOPPING_ITEM) needed for those events (e.g., "Buy birthday gift for [Name]", "Get car ready for MOT", "Prepare documents").' : ''}
- ${isBriefingContext ? 'DO NOT USE' : 'CREATE_CALENDAR_EVENT:'} ONLY for definite scheduled appointments with a 100% verified location that the user is confirmed to be attending. If the user is asking to 'book', 'buy', 'arrange', or 'plan' something (like 'book tickets for the British Motor Show'), it MUST be a CREATE_TASK, NOT a calendar event.
- PREP TASKS & RSVPS:
  * For RSVP tasks: ALWAYS schedule the CREATE_TASK for 7 days AFTER today (1 week after invite detection date).
  * For Birthday or Party gifts: ALWAYS output a CREATE_TASK titled "Buy birthday gift for [Name]" (or "Buy gift for [Name]") scheduled for 7 days BEFORE the actual event/party date (or TODAY if the event date is less than 7 days away - NEVER set a date in the past!).
- CREATE_TASK: Todos without specific times, or prep tasks for events, booking tickets, or arranging things.
- CREATE_SHOPPING_ITEM: Items to buy.
- CREATE_RECIPE: Cooking instructions/recipes. Extract title, ingredients (array), and instructions.
- CREATE_NOTE: General info, standard retail receipts, everything else. (CRITICAL: If a receipt is for a flight, hotel booking, ticket, or scheduled event reservation, DO NOT create a note. Instead, extract the dates and location and output a CREATE_CALENDAR_EVENT or CREATE_TASK if unconfirmed).
- LISTS: If a user provides a list of items (e.g. "buy milk bread and eggs"), return SEPARATE action objects for each item. Do NOT group them into one string. AI MUST check the list for distinct items even if commas are missing.
- TIME & EVENT DURATION: Always try to extract specific times. If a time (e.g., "7pm", "noon", "15:30") is mentioned, reflect this in the ISO string. If no time is mentioned, use 09:00 as default. For CREATE_CALENDAR_EVENT, smartly estimate realistic start and end times based on the event type: an appointment or meeting is typically 1 hour (e.g., 10:00 to 11:00); a birthday party, dinner, or social event is typically 3 to 4 hours (e.g., 14:00 to 17:00 or 18:00); an all-day event, trip, festival, or holiday spans the whole day or 8 to 12 hours (e.g., 09:00 to 18:00). Always provide both "startTime" and "endTime" as ISO strings.
- DATE CALCULATION: Be highly precise with dates. "Before the end of May" means May 31st (or earlier), NOT June 1st. Use the exact end-of-month date when requested.
- EVENT DETAILS & URLs: If the input relates to a real-world event, show, or place, use Google Search to find specific details. You MUST structure the "description" (for tasks/events) or "content" (for notes) EXACTLY as follows:
  **What's On:** [A summary of what it is and what to expect]
  **Logistics:**
  - 📅 **Dates:** [Dates it runs from and to]
  - 📍 **Location:** [[Location Name]](https://maps.google.com/?q=[URL encoded location])
  - 🔗 **Tickets/Website:** [URL for ticket information]
  - ℹ️ **Requirements:** [Any requirements that may be needed]

Return JSON:
{
  "actions": [{
    "action": ${isBriefingContext ? '"CREATE_TASK"|"CREATE_NOTE"|"CREATE_SHOPPING_ITEM"|"CREATE_RECIPE"' : '"CREATE_TASK"|"CREATE_CALENDAR_EVENT"|"CREATE_NOTE"|"CREATE_SHOPPING_ITEM"|"CREATE_RECIPE"'},
    "data": { "title": "...", "description": "...", "content": "...", "dueDate": "ISO", "startTime": "ISO", "endTime": "ISO", "location": "...", "category": "...", "name": "...", "ingredients": ["..."], "instructions": "...", "prepTime": "...", "servings": "..." }
  }],
  "summary": "Brief summary"
}`;

  return withSilentRetry(async () => {
    const model = getGenerativeModel(googleAI, { 
      model: FLASH_3_1_LITE,
      systemInstruction,
      generationConfig: {
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 1024 }
      }
    });

    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    const response = result.response;

    if (!response.text()) {
      logger.error('Gemini returned no text', { result });
      throw new Error('AI response was empty.');
    }

    const parsed = safeParseJSON(response.text()) as SmartConversionResult;
    return clampPastTaskDates(parsed);
  });
}

export async function processSmartConvert(content: string, members: any[] = [], forecast: any[] = []) {
  const user = auth.currentUser;
  if (user) {
    await incrementSmartConvertUsage(user.uid);
  }

  const parts = [
    { text: `Create a comprehensive and helpful "Plan of Attack" from these notes. 
Use your internal knowledge to add value beyond just what is written in the notes.

Date: ${new Date().toLocaleString('en-GB')}
Full Member List: ${JSON.stringify(members)}
Active Members (Present/Available): ${JSON.stringify(members.filter(m => m.isHere || m.active))}
Weather Forecast: ${JSON.stringify(forecast)}

NOTES:
${content}

RULES:
- STRICT 100% ACCURACY & ZERO HALLUCINATION RULE: NEVER invent, speculate, or hallucinate real-world events, shows, locations, or dates that are not explicitly present in the input text or 100% verified. Do NOT output a CREATE_CALENDAR_EVENT action if the venue location or date is missing, unconfirmed, or non-existent. If location or date details are missing, output ONLY a CREATE_TASK to "Check dates and location for [Event Title]".
- TITLE: The title should just be the name of the event or location (e.g., "London Eye"). Do NOT prefix with "Look at" or "Book" unless generating a specific task action.
- SECTIONS: A detailed markdown plan strictly divided into exactly two sections:
  **What's On:** Context and AI-injected knowledge (e.g., facts about the event, what to expect, catering options). Expand this well.
  **Logistics:** Use bullets for the following, but only include them if the information is available (hide if empty):
  - 📅 **Dates:** [Dates/Times]
  - 📍 **Location:** [[Location Name]](https://maps.google.com/?q=[URL encoded location])
  - 🔗 **Tickets/Website:** [URL]
- ASSIGNMENT: Identify who the task or event is likely for. PRIORITIZE Active Members for immediate tasks.
- FORMATTING: Use bold section headers (e.g. **What's On:**) and START A NEW LINE for every section. Use bullet points for details.
- ACTIONS: If the content describes a new scheduled event with a confirmed location, include a CREATE_CALENDAR_EVENT action. If converting an existing event or note that already describes a scheduled event, or if location is missing, omit CREATE_CALENDAR_EVENT and output only preparation tasks.
- PREP TASKS & RSVPS:
  * For RSVP tasks: ALWAYS schedule the CREATE_TASK for 7 days AFTER today (${new Date().toLocaleString('en-GB')}) - exactly 1 week after invite detection.
  * For Birthday or Anniversary parties: ALWAYS include a CREATE_TASK titled "Buy birthday gift for [Name]" (or "Buy gift for [Name]") scheduled for 7 days BEFORE the actual event date (or TODAY if the event date is less than 7 days away - NEVER schedule in the past).
- REPLY: If it's an invitation, generate a short, friendly reply draft. If the content is NOT an invitation, omit the 'replyDraft' key entirely or set it to null.
- NO ALLERGY REMINDERS: Do NOT automatically append or inject allergy warnings, reminders, or notes about bringing dairy-free alternatives for Rosie (due to allergies to Soya, Egg, and Milk) into the plan content.

Return JSON:
{
  "title": "Clean Event/Location Name",
  "expandedContent": "**What's On:** [context/insights]\n\n**Logistics:**\n- 📅 **Dates:** [dates]\n- 📍 **Location:** [[location]](url)\n- 🔗 **Tickets/Website:** [url]",
  "summary": "Brief 1-sentence summary",
  "replyDraft": "Optional friendly reply to the invite",
  "actions": [
    {
      "action": "CREATE_TASK"|"CREATE_CALENDAR_EVENT"|"CREATE_SHOPPING_ITEM",
      "data": { 
        "title": "...", 
        "description": "...", 
        "dueDate": "ISO", 
        "startTime": "ISO", 
        "location": "...",
        "assignedTo": "Member Name or ID from the list, or 'all'"
      }
    }
  ]
}

IMPORTANT:
- Do not be too brief. The user wants to feel like they have a well-researched plan.
- If the notes contain multiple events, extract only the next 3 upcoming ones.
- Return ONLY valid JSON. No conversational filler.` }
  ];

  try {
    const model = getGenerativeModel(googleAI, { 
      model: FLASH_3_1_LITE,
      generationConfig: { 
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 1024 }
      }
    });

    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    let parsed = safeParseJSON(result.response.text());
    if (parsed) {
      parsed = clampPastTaskDates(parsed);
    }
    if (parsed && parsed.title) {
      try {
        const placeInfo = await lookupPlaceDetails(parsed.title);
        if (placeInfo && placeInfo.mapsUrl) {
          parsed.mapsUrl = placeInfo.mapsUrl;
          if (placeInfo.address) {
            parsed.address = placeInfo.address;
          }
        }
      } catch (e) {
        logger.info('Place lookup enrichment skipped', e);
      }
    }
    return parsed;
  } catch (error) {
    logger.error('Smart convert processing failed', error);
    throw error;
  }
}
