import app, { auth } from "../lib/firebase";
import { logger } from "./logger";
import { incrementAiUsage } from "./usageService";
import { getGenerativeModel } from "firebase/ai";
import { withSilentRetry, safeParseJSON, parseAndValidateJSON, NLPResponseSchema, PantryAnalysisSchema, googleAI, FLASH_3_1_LITE } from "./ai/aiUtils";


async function assertLimitAndIncrement() {
  const user = auth.currentUser;
  if (user) {
    await incrementAiUsage(user.uid);
  }
}

/**
 * 1. DAILY BRIEFING
 */
export async function generateDailyBriefing(items: any[], businessName: string = 'Business', loggedInUser: string = 'Trade Partner') {
  await assertLimitAndIncrement();
  return withSilentRetry(async () => {
    const now = new Date();
    const todayStr = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeOfDay = now.getHours() < 12 ? 'Morning' : now.getHours() < 17 ? 'Afternoon' : 'Evening';
    const prompt = `Create a professional, concise UK morning trade briefing for "${businessName}" on behalf of "${loggedInUser}".
Today is: ${todayStr}
Time of Day: ${timeOfDay}
Here are the upcoming items for the next 7 days: ${JSON.stringify(items)}. 
RULES:
- STRICT DATE RANGE: Only mention items that fall within today (${todayStr}) and the next 7 days. Do NOT reference anything outside this window.
- Use the exact date "${todayStr}" as today. Do NOT assume or calculate a different date.
- When referring to days, use the correct day of the week based on the actual dates in the data — do not guess.
- RULES FOR MEMBER ATTRIBUTION & PERSONALISATION:
  * Address "${loggedInUser}" directly as "You" / "Your schedule" for items assigned to them or where their name is mentioned (e.g., "You have...").
  * Attribute items assigned to other adults or specific family members explicitly to their name (e.g., "Sarah has...").
  * Group items assigned to children/kids explicitly under their names or "The kids have..." (e.g., "The kids have swimming on Thursday").
  * For items assigned to "all" / "family" or unassigned general items, refer to them as shared family plans (e.g., "As a family, you have..."). DO NOT attribute unassigned or family items solely to "${loggedInUser}".
- Format with exactly these four sections on their own lines: **Today:** | **Coming Up:** | **Reminders:** | **Fun Strategy:**
- Each section heading must be bold (e.g. **Today:**) and appear at the start of a new line, followed by the content on the next line. Do NOT use asterisks (*) as bullet points.
- NO markdown headers (###). Use plain text under each bold heading.
- Return the briefing as plain text.`;
    const model = getGenerativeModel(googleAI, { 
      model: FLASH_3_1_LITE,
      generationConfig: { 
        temperature: 0.8, // Warm & friendly briefing
        thinkingConfig: { thinkingBudget: 1024 }
      }
    });
    
    let briefingText = "";
    try {
      const result = await model.generateContent(prompt);
      briefingText = result.response.text();
    } catch (err: any) {
      logger.error("Daily briefing generation failed:", err);
      throw err;
    }
    
    if (!briefingText) {
      throw new Error('Daily briefing AI response was empty.');
    }
    return briefingText;
  });
}

/**
 * 2. NATURAL LANGUAGE (Main Chat)
 */
export async function processNaturalLanguage(input: string, members: any[] = [], history: any[] = [], schedule: any[] = [], businessName: string = 'Business') {
  await assertLimitAndIncrement();
  try {
    // Feature 4: Selective Context Window
    const recentHistory = history.slice(-5);
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
    
    const relevantSchedule = schedule.filter(item => {
      if (!item.date) return true;
      return new Date(item.date) <= threeDaysFromNow;
    }).slice(0, 10);
 
    const contents: { role: "user" | "model" | "system", parts: { text: string }[] }[] = recentHistory.map(h => ({
      role: (h.role === 'assistant' ? 'model' : 'user'),
      parts: [{ text: h.text || '' }]
    }));
 
    const systemInstruction = `TribeTrade UK trade and business assistant for ${businessName}.
Members: ${JSON.stringify(members)}
Schedule: ${JSON.stringify(relevantSchedule)}
Date: ${new Date().toISOString().split('T')[0]} (${new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}) (Local UK time: ${new Date().toLocaleString('en-GB')})

RULES:
- STRICT 100% ACCURACY & ZERO HALLUCINATION RULE: NEVER invent, speculate, or hallucinate real-world jobs, customer details, materials, or dates. Only extract details explicitly present in the input text.
- TRADE JOB & SITE APPOINTMENT SCHEDULING:
  * When the user dictates a job booking, site visit, installation, service, or client appointment with a date and/or time (e.g. "Book in a job for Dave on Tuesday at 9am to fit radiator at 14 High Street", "Job tomorrow 2pm boiler service for Sarah", "Site survey next Friday at 10am"), output CREATE_CALENDAR_EVENT with:
    - "title": Job summary (e.g. "Boiler service - Sarah" or "Fit radiator - Dave")
    - "startTime": ISO string
    - "endTime": ISO string (estimate 1-2 hours for service/inspection, 3-4 hours for repair, or 8 hours for full-day fitout if not specified)
    - "location": Customer address or postcode if mentioned
    - "description": Job scope, customer details, or phone number if mentioned
  * If the user mentions a time but NO date: assume TODAY (or TOMORROW if the time has already passed).
  * If the user asks for a job/appointment but NO date or time is given: action="NONE", ask the user for their preferred date/time in "message".
- CREATE_QUOTE: If the user asks to create, draft, or calculate a quote or estimate (e.g. "Draft a quote for Dave for bathroom tiling, 2 days labour at £250 and £80 for grout", "Quote Sarah £450 for consumer unit replacement"), return action "CREATE_QUOTE" with data:
  {
    "customerName": "...",
    "jobTitle": "...",
    "customerAddress": "...",
    "customerPhone": "...",
    "items": [
      {
        "description": "...",
        "type": "labour"|"material"|"hire"|"other",
        "quantity": 1,
        "unit": "hours"|"days"|"units"|"litres"|"metres",
        "unitPrice": 100,
        "total": 100
      }
    ],
    "notes": "..."
  }
  Always break down labour vs materials/consumables (e.g. paint, tiles, timber, copper pipe) into distinct item objects. If rates are not mentioned, use reasonable estimates or quantity 1. In "message", provide a friendly confirmation mentioning that you've prepared the quote draft and that it must be reviewed before sending.
- CREATE_TASK: If the user dictates a to-do, reminder, follow-up, or trade action without a fixed calendar appointment time (e.g., "Remind me to order 15mm copper pipe", "Call Travis Perkins tomorrow at 8am", "Invoice Mrs Robinson for completed tiling"), output CREATE_TASK with "dueDate" as an ISO string.
- CREATE_SHOPPING_ITEM: If the user asks to add materials, supplies, or items to The Shed / shopping list (e.g., "Add 15mm copper pipe to materials list", "Need 2 bags of multi-finish plaster"), output CREATE_SHOPPING_ITEM with "name" and "category" ("Essentials"|"Fresh"|"Frozen"|"Household"|"Other").
- SEARCH_NEARBY: If the user asks for nearby merchants, trade counters, suppliers, or local services, return action "SEARCH_NEARBY" with data: { "query": "..." } containing their specific request summary.
- DATE CALCULATION: Be highly precise with dates. "Before the end of May" means May 31st (or earlier), NOT June 1st. Use UK local time context. Return full ISO strings for dueDate/startTime/endTime.

Return JSON:
{
  "actions": [
    {
      "action": "NONE"|"CREATE_TASK"|"CREATE_CALENDAR_EVENT"|"CREATE_NOTE"|"CREATE_SHOPPING_ITEM"|"SEARCH_NEARBY"|"CREATE_QUOTE",
      "data": { "title": "...", "description": "...", "name": "...", "category": "Essentials|Fresh|Frozen|Household|Other", "dueDate": "ISO", "assignedTo": "memberId|null", "location": "...", "startTime": "ISO", "endTime": "ISO", "query": "...", "customerName": "...", "jobTitle": "...", "items": [] }
    }
  ],
  "message": "..."
}`;

    contents.push({ role: 'user', parts: [{ text: input }] });

    const model = getGenerativeModel(googleAI, { 
      model: FLASH_3_1_LITE,
      systemInstruction,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1 // Precision for data entry/chat
      }
    });

    let rawResponseText = "";
    try {
      const result = await model.generateContent({ contents });
      const response = result.response;
      
      // Feature: Handle native function calls ("The Hands")
      const calls = response.functionCalls();
      if (calls && calls.length > 0) {
        const call = calls[0];
        return {
          actions: [{ action: call.name, data: call.args as any }],
          message: `OK, I've started that ${call.name.toLowerCase().replace('create_', '')} for you.`
        };
      }

      rawResponseText = response.text();
    } catch (err: any) {
      logger.error("AI command generation failed:", err);
      throw err;
    }

    if (!rawResponseText) {
      throw new Error('NLP AI response was empty.');
    }
    return parseAndValidateJSON(rawResponseText, NLPResponseSchema);
  } catch (error) {
    logger.error('NLP failed', error);
    throw error;
  }
}

/**
 * 4. PANTRY ANALYSIS
 * Relies on the ephemeral image processing architecture: image strings are processed
 * directly in short-lived memory and never saved to cloud storage or Firestore.
 */
export async function analyzePantryImage(base64Images: string[]) {
  await assertLimitAndIncrement();
  try {
    const parts: any[] = base64Images.map(img => ({ inlineData: { data: img, mimeType: "image/jpeg" } }));
    parts.push({ text: `Analyze these images of a pantry/fridge. 
    1. List all food items found.
    2. Suggest 3 "Use it Up" recipe ideas that specifically use 2 or more of these items.
    
    Return JSON:
    {
      "items": ["string"],
      "useItUpSuggestions": ["string"]
    }` });

    const model = getGenerativeModel(googleAI, { 
      model: FLASH_3_1_LITE,
      generationConfig: { responseMimeType: "application/json" }
    });

    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    const response = result.response;

    if (!response.text()) {
      throw new Error('Pantry analysis AI response was empty.');
    }
    return parseAndValidateJSON(response.text(), PantryAnalysisSchema);
  } catch (error) {
    logger.error('Pantry analysis failed', error);
    throw error;
  }
}


/**
 * 7. LOCAL RECOMMENDATIONS (Google Search Grounding)
 */
export async function getRecipeIngredients(mealName: string) {
  await assertLimitAndIncrement();
  const prompt = `Give me a list of basic ingredients only for the meal "${mealName}".
  Return ONLY a JSON array of strings containing the ingredients. For example: ["Ingredient 1", "Ingredient 2"].
  Do not include cooking steps, instructions, or extra commentary. Return only basic ingredients.`;

  try {
    const model = getGenerativeModel(googleAI, { 
      model: FLASH_3_1_LITE,
      generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0.2
      }
    });

    const result = await model.generateContent(prompt);
    const response = result.response;

    if (!response.text()) {
      throw new Error('Ingredients lookup AI response was empty.');
    }
    return safeParseJSON(response.text());
  } catch (error) {
    logger.error('Ingredients lookup failed', error);
    throw error;
  }
}

export async function getRecipeInstructionsAndPrepTime(title: string, ingredients: string[]) {
  await assertLimitAndIncrement();
  const prompt = `Based on the recipe title "${title}" and its ingredients: ${JSON.stringify(ingredients)}, generate:
  1. A realistic preparation time (e.g. "15 mins" or "1 hour").
  2. Clear, step-by-step cooking instructions.
  
  Return JSON:
  {
    "prepTime": "string",
    "instructions": "string"
  }`;

  try {
    const model = getGenerativeModel(googleAI, { 
      model: FLASH_3_1_LITE,
      generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0.3
      }
    });

    const result = await model.generateContent(prompt);
    const response = result.response;

    if (!response.text()) {
      throw new Error('Instructions and prep time lookup AI response was empty.');
    }
    return safeParseJSON(response.text());
  } catch (error) {
    logger.error('Instructions and prep time lookup failed', error);
    throw error;
  }
}

export async function generatePlaceRecommendations(
  location: string, 
  timeframe: string, 
  radius: number, 
  context: string, 
  wildcard: boolean = false, 
  mode: string[] = ['family'], 
  exclusions: string = '',
  customQuery: string = '',
  placesJson: string = '[]'
) {
  const modeString = mode.includes('family') ? 'family activities' : `activities specifically tailored for: ${mode.join(', ')}`;    const timeLabel = timeframe === 'today' ? 'Today' : timeframe === '14days' ? 'Next 14 days' : 'Next 7 days';
    const today = new Date().toLocaleDateString('en-GB');

    try {
        const nearbyPrompt = `You are a strict local UK family guide curator.
The user is looking for recommendations near ${location} (within ${radius} miles).
Timeframe: ${timeLabel} from TODAY (${today}).
Context & Favourites: ${context}
${customQuery ? `Specific Search: "${customQuery}"` : `Style: ${wildcard ? 'Unexpected/quirky' : 'Reliable/highly-rated'}`}
Exclusions: ${exclusions || 'none'}

CRITICAL INSTRUCTIONS:
1. DO NOT invent or hallucinate places. You MUST ONLY curate and choose from the places provided in this JSON list:
=== VERIFIED PLACES ===
${placesJson}
=======================
2. Evaluate these real places. STRICTLY EXCLUDE any places that match the user's Exclusions: "${exclusions}".
3. Pick up to 9 of the remaining places that best fit the family context (even if they don't perfectly match interests). If none fit or all are excluded, return an empty array.
4. Ensure the \`exact_distance_miles\` you output matches the distance value provided in the verified places (if any), or estimate based on standard local distances if missing.
5. If a place is located inside a larger venue (e.g. a splash park inside a major theme park), explicitly mention this in the 'reason' or 'description' so the family knows full admission might be required.
6. Carefully estimate the \`cost\` based on real-world prices: 'Free' (public parks), '£' (cheap/local), '££' (standard attractions), or '£££' (major theme parks like Paultons).
7. For each chosen place, write a personalized 'reason' explaining why it's a good option for this specific family.
8. Set the 'categoryBadge' to 'special_event' if it is clearly an event, pop-up, or market, or 'family_all' if it's a regular place.

Return ONLY JSON:
{
  "places": [
    {
      "name": "Exact Name of Place/Event",
      "categoryBadge": "special_event|family_all",
      "cost": "Free|£|££|£££",
      "reason": "Why this matches their family profile...",
      "description": "Brief description...",
      "exact_distance_miles": 5.2,
      "estimated_drive_time": "15 mins",
      "location": "Address or location"
    }
  ]
}`;

        const model = getGenerativeModel(googleAI, { 
            model: FLASH_3_1_LITE,
            generationConfig: { 
                responseMimeType: "application/json",
                temperature: 0.2,
                maxOutputTokens: 4096,
                thinkingConfig: { thinkingBudget: 1024 }
            }
        });

        const aiResult = await model.generateContent(nearbyPrompt).catch(err => {
            logger.warn('Nearby AI generation warning', err);
            return null;
        });

        let aiPlaces: any[] = [];
        if (aiResult && aiResult.response && aiResult.response.text()) {
            const data = safeParseJSON(aiResult.response.text());
            aiPlaces = Array.isArray(data?.places) ? data.places : [];
        }

        return {
            places: aiPlaces,
            fairs: []
        };
    } catch (error) {
        logger.error('Place recommendations failed', error);
        throw error;
    }
}

/**
 * 8. SUPPORT TICKET FIX GENERATOR
 */
export async function generateSupportTicketFix(category: string, message: string): Promise<string> {
  await assertLimitAndIncrement();
  return withSilentRetry(async () => {
    const prompt = `You are a Senior Technical Support Engineer. A user has reported an issue.
Category: ${category}
Issue Description: ${message}

Provide a clear, step-by-step troubleshooting guide or a technical fix to resolve this issue. Keep it concise, actionable, and formatted nicely in plain text or markdown without unnecessary filler.`;

    const model = getGenerativeModel(googleAI, { 
      model: FLASH_3_1_LITE,
      generationConfig: { temperature: 0.2 }
    });
    
    const result = await model.generateContent(prompt);
    const response = result.response;
    
    if (!response.text()) {
      throw new Error('AI response was empty.');
    }
    
    return response.text();
  });
}

/**
 * 9. SMART CONVERT
 */
export async function smartConvertBriefing(briefingContent: string): Promise<any[]> {
  await assertLimitAndIncrement();
  return withSilentRetry(async () => {
    const prompt = `Based on the following daily briefing, identify any tasks or preparations needed for upcoming events that haven't been done yet (e.g., buying gifts, RSVPing, getting supplies, preparing outfits).
Create separate tasks for each. Do not duplicate existing tasks if they are already mentioned as being done.

Briefing:
${briefingContent}

Return ONLY a JSON array of objects with 'title', 'category' (Essentials|Household|Other), and 'dueDate' (ISO string, estimate based on the event date).
Example:
[
  { "title": "Buy gift for Jack's birthday", "category": "Other", "dueDate": "2026-07-16T10:00:00.000Z" }
]`;
    const model = getGenerativeModel(googleAI, { 
      model: FLASH_3_1_LITE,
      generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0.2,
        thinkingConfig: { thinkingBudget: 1024 }
      }
    });
    
    const result = await model.generateContent(prompt);
    const response = result.response;
    
    if (!response.text()) {
      throw new Error('AI response was empty.');
    }
    
    return safeParseJSON(response.text());
  });
}

/**
 * 10. EXTRACT INGREDIENTS FROM MEAL DESCRIPTION
 */
export async function extractIngredientsFromMeal(mealText: string): Promise<string[]> {
  if (!mealText || !mealText.trim()) return [];
  await assertLimitAndIncrement();
  return withSilentRetry(async () => {
    const prompt = `Extract core raw grocery ingredients from these meal descriptions: "${mealText}".
Return a JSON array of 3 to 10 concise UK grocery ingredient names (e.g. ["Fish fingers", "Potatoes", "Baked beans", "Bread", "Butter"]).
Return ONLY JSON array format: ["item 1", "item 2"]`;

    const model = getGenerativeModel(googleAI, { 
      model: FLASH_3_1_LITE,
      generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const parsed = safeParseJSON(responseText);
    if (Array.isArray(parsed)) {
      return parsed.map((item: any) => String(item).trim()).filter(Boolean);
    }
    return [];
  });
}

/**
 * 11. FORMAT SPECIFIC SEARCH RESULTS
 * Formats a raw Google Places API JSON list and user timeframe into clean structured Markdown.
 */
export async function formatSpecificSearch(rawPlaces: any[], timeframe: string): Promise<string> {
  await assertLimitAndIncrement();
  return withSilentRetry(async () => {
    const systemInstruction = 'You are a local UK guide. You will be provided with a JSON list of verified local venues and a user timeframe (e.g., this weekend). Act STRICTLY as a formatter. DO NOT invent places. Review the JSON and write a clean, structured Markdown response. List the venues, their distance, their rating, and explicitly state their opening hours relevant to the requested timeframe.';

    const prompt = `Requested Timeframe: ${timeframe}\n\nVerified Local Venues JSON:\n${JSON.stringify(rawPlaces, null, 2)}`;

    const model = getGenerativeModel(googleAI, { 
      model: FLASH_3_1_LITE,
      systemInstruction
    });

    const result = await model.generateContent(prompt);
    const response = result.response;

    if (!response.text()) {
      throw new Error('Specific search AI formatting response was empty.');
    }

    return response.text();
  });
}

/**
 * 12. FORMAT DISCOVER SEARCH RESULTS
 * Formats raw Google Places API JSON list and family profile context into categorized Markdown sections.
 */
export async function formatDiscoverSearch(rawPlaces: any[], familyContext: string): Promise<string> {
  await assertLimitAndIncrement();
  return withSilentRetry(async () => {
    const systemInstruction = 'You are a local UK family guide. Review this provided JSON list of verified venues. DO NOT invent places. Select the absolute best matches for the provided family profile. Categorize the results logically (e.g., Action & Adventure, Animals & Nature, Worth the Drive). You are encouraged to provide up to 5 to 7 venues per category if the data is rich. Output strictly in clean Markdown with distance and a 1-sentence reason why it fits the family.';

    const prompt = `Family Profile Context: ${familyContext}\n\nVerified Local Venues JSON:\n${JSON.stringify(rawPlaces, null, 2)}`;

    const model = getGenerativeModel(googleAI, { 
      model: FLASH_3_1_LITE,
      systemInstruction
    });

    const result = await model.generateContent(prompt);
    const response = result.response;

    if (!response.text()) {
      throw new Error('Discover search AI formatting response was empty.');
    }

    return response.text();
  });
}

/**
 * 13. GENERATE VENUE REASONS
 * Generates personalized 1-sentence reasons for each selected venue.
 */
export async function generateVenueReasons(venues: { name: string; types?: string[]; rating?: number }[], context: string): Promise<Record<string, string>> {
  if (!venues || venues.length === 0) return {};
  await assertLimitAndIncrement();
  return withSilentRetry(async () => {
    const prompt = `You are a local UK family guide. For each venue in the list below, write a single concise, engaging 1-sentence reason explaining why it is a great local option for the family (Context/Query: "${context}").
DO NOT mention opening hours. Focus strictly on why it suits the family/activity.

Venues:
${JSON.stringify(venues, null, 2)}

Return ONLY a JSON object mapping each exact venue name to its 1-sentence reason string:
{
  "Venue Name": "1-sentence reason..."
}`;

    const model = getGenerativeModel(googleAI, { 
      model: FLASH_3_1_LITE,
      generationConfig: { 
        responseMimeType: "application/json",
        temperature: 0.3
      }
    });

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    const parsed = safeParseJSON(text);
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  });
}
