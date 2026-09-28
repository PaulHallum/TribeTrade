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
    action: 'CREATE_TASK' | 'CREATE_CALENDAR_EVENT' | 'CREATE_NOTE' | 'CREATE_SHOPPING_ITEM' | 'CREATE_RECIPE' | 'CREATE_QUOTE' | 'ADD_TO_SHED_STOCK';
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
      customerName?: string;
      customerAddress?: string;
      customerPhone?: string;
      jobTitle?: string;
      jobDescription?: string;
      merchant?: string;
      orderNumber?: string;
      items?: any[];
      quantity?: number;
      unit?: string;
      unitPrice?: number;
      excluded?: boolean;
      subtotalLabour?: number;
      subtotalMaterials?: number;
      grandTotal?: number;
      notes?: string;
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
    } else if (act.action === 'ADD_TO_SHED_STOCK') {
      if (!Array.isArray(act.data?.items) || act.data.items.length === 0) {
        if (act.data?.name || act.data?.title) {
          act.data = {
            ...act.data,
            items: [{
              name: act.data.name || act.data.title,
              quantity: Number(act.data.quantity) || 1,
              category: act.data.category || 'Materials',
              unit: act.data.unit || 'units',
              unitPrice: Number(act.data.unitPrice) || 0,
              excluded: false
            }]
          };
        } else {
          act.data = {
            ...act.data,
            items: []
          };
        }
      } else {
        act.data.items = act.data.items.map((i: any) => ({
          ...i,
          name: i.name || 'Trade item',
          quantity: Math.max(1, Number(i.quantity) || 1),
          unit: i.unit || 'units',
          category: i.category || 'Materials',
          unitPrice: Number(i.unitPrice) || 0,
          excluded: i.excluded === true ? true : false
        }));
      }
      sanitizedActions.push(act);
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
    try {
      await incrementSmartCaptureUsage(user.uid);
    } catch (e: any) {
      if (e?.message === 'LIMIT_EXCEEDED') throw e;
      logger.warn('Usage counter increment failed:', e);
    }
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

  const systemInstruction = `TribeTrade UK trade and business assistant. Extract actionable data from trade job notes, merchant slips, customer inquiries, and handwritten paper scribbles.
Date: ${new Date().toLocaleString('en-GB')}
RULES:
- STRICT 100% ACCURACY & ZERO HALLUCINATION RULE: NEVER invent or hallucinate customer details, jobs, or materials not present in the input text or image.
- HANDWRITTEN PAPER SCRIBBLES & TRADE NOTE INTELLIGENCE:
  1. QUOTATION / ESTIMATE / JOB PRICING:
     When the paper scribble or note looks like a job estimate, quote draft, or client pricing calculation (e.g. customer name/address, job scope like boiler install, rewiring, bathroom tiling, plastering, labour days/rates, materials costs):
     Return action: "CREATE_QUOTE" with:
     {
       "customerName": "Customer name or 'Prospective Client'",
       "customerAddress": "Site address or postcode if mentioned",
       "customerPhone": "Phone if mentioned",
       "jobTitle": "Short descriptive job summary (e.g. 'Kitchen Rewire' or 'Boiler Replacement')",
       "jobDescription": "Full scope of works outlined",
       "items": [
         {
           "description": "Labour / Materials item description",
           "type": "labour" | "material" | "hire" | "other",
           "quantity": 1,
           "unit": "hours" | "days" | "units" | "pack" | "metres",
           "unitPrice": 100,
           "total": 100
         }
       ],
       "subtotalLabour": 0,
       "subtotalMaterials": 0,
       "grandTotal": 0,
       "notes": "Any payment terms, validity or notes"
     }
  2. SHOPPING LIST / MATERIALS TO BUY:
     When the scribble is an unpurchased list of materials to buy from a trade merchant (e.g. Screwfix, Toolstation, Travis Perkins) (e.g. 'Need 15mm copper pipe, 2x 22mm elbows, flux'):
     Return separate "CREATE_SHOPPING_ITEM" actions for EACH distinct trade item with:
     { "name": "Item name with quantity/dimensions (e.g. '15mm Copper Pipe 3m')", "category": "Materials" | "Tools" | "Fixings" | "Consumables" | "Other" }
  2a. TRADE ORDER / RECEIPT / INVOICE / EMAIL (SCREWFIX, TOOLSTATION, ETC. - ASSIGN TO THE SHED):
     When the image, text, or email is an order confirmation, till receipt, delivery note, or PDF from a trade supplier (such as Screwfix, Toolstation, Travis Perkins, City Plumbing, CEF, Selco, B&Q, etc.):
     Extract ALL individual parts, fittings, fixings, materials, or tools into an "ADD_TO_SHED_STOCK" action with:
     {
       "merchant": "Merchant / Supplier Name (e.g. Screwfix)",
       "orderNumber": "Order or invoice number if present",
       "items": [
         {
           "name": "Clean, descriptive item name (e.g. '15mm Lever Ball Valve', 'Dulux Trade White Emulsion 5L', 'M8 Hex Bolts 50mm')",
           "quantity": 1,
           "unit": "units" | "pack" | "metres" | "rolls",
           "category": "Materials" | "Tools" | "Fixings" | "Consumables" | "Other",
           "unitPrice": 4.50,
           "excluded": false
         }
       ],
       "total": 0.00
     }
  3. SCHEDULED JOB / DIARY APPOINTMENT:
     When the scribble details a confirmed appointment with date and time:
     Return action: "CREATE_CALENDAR_EVENT" with:
     { "title": "Job title - Client", "startTime": "ISO", "endTime": "ISO", "location": "Address", "description": "Scope" }
  4. TASK / REMINDER:
     For to-dos without fixed appointment times (e.g. 'Call Travis Perkins', 'Send invoice to Dave'):
     Return action: "CREATE_TASK" with title, description, and dueDate (ISO string).
  5. GENERAL NOTE:
     For general site notes, access codes, paint codes, or reference info: Return action: "CREATE_NOTE" with title and content.

Return JSON:
{
  "actions": [{
    "action": "CREATE_QUOTE"|"CREATE_TASK"|"CREATE_CALENDAR_EVENT"|"CREATE_NOTE"|"CREATE_SHOPPING_ITEM"|"ADD_TO_SHED_STOCK"|"CREATE_RECIPE",
    "data": { 
      "title": "...", 
      "description": "...", 
      "content": "...", 
      "dueDate": "ISO", 
      "startTime": "ISO", 
      "endTime": "ISO", 
      "location": "...", 
      "category": "...", 
      "name": "...", 
      "customerName": "...", 
      "jobTitle": "...", 
      "items": [], 
      "grandTotal": 0 
    }
  }],
  "summary": "Brief summary of what was extracted from the notes"
}`;

  return withSilentRetry(async () => {
    const model = getGenerativeModel(googleAI, { 
      model: FLASH_3_1_LITE,
      systemInstruction,
      generationConfig: {
        responseMimeType: "application/json"
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
    try {
      await incrementSmartConvertUsage(user.uid);
    } catch (e: any) {
      if (e?.message === 'LIMIT_EXCEEDED') throw e;
      logger.warn('Usage counter increment failed:', e);
    }
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
- ACTIONS:
  * If the content describes a new scheduled event with a confirmed location, include a CREATE_CALENDAR_EVENT action.
  * TRADE ORDERS, RECEIPTS & PARTS (ASSIGN TO THE SHED): If the notes, email, or text contain an order confirmation, till receipt, invoice, or parts list from a trade merchant (e.g. Screwfix, Toolstation, Travis Perkins, Selco), include an action 'ADD_TO_SHED_STOCK' with data:
    {
      "merchant": "Merchant Name (e.g. Screwfix)",
      "orderNumber": "Order or invoice number if present",
      "items": [
        { "name": "Clean item description", "quantity": 1, "unit": "units" | "pack", "category": "Materials" | "Tools" | "Fixings", "unitPrice": 0.00, "excluded": false }
      ]
    }
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
      "action": "CREATE_TASK"|"CREATE_CALENDAR_EVENT"|"CREATE_SHOPPING_ITEM"|"ADD_TO_SHED_STOCK",
      "data": { 
        "title": "...", 
        "description": "...", 
        "dueDate": "ISO", 
        "startTime": "ISO", 
        "location": "...",
        "assignedTo": "Member Name or ID from the list, or 'all'",
        "merchant": "...",
        "items": []
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
        responseMimeType: "application/json"
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
