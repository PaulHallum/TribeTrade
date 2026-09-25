export const detectCategory = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes('paint') || lower.includes('brush') || lower.includes('roller') || lower.includes('emulsion') || lower.includes('gloss') || lower.includes('primer') || lower.includes('undercoat') || lower.includes('sandpaper') || lower.includes('filler') || lower.includes('caulk') || lower.includes('masking tape') || lower.includes('varnish') || lower.includes('stain') || lower.includes('white spirit') || lower.includes('turps')) return 'Paint & Decorating';
  if (lower.includes('screw') || lower.includes('nail') || lower.includes('bolt') || lower.includes('fixing') || lower.includes('anchor') || lower.includes('plug') || lower.includes('rawl') || lower.includes('silicone') || lower.includes('sealant') || lower.includes('adhesive') || lower.includes('glue') || lower.includes('grip fill') || lower.includes('no more nails') || lower.includes('bracket') || lower.includes('hinge') || lower.includes('washer')) return 'Fixings & Adhesives';
  if (lower.includes('drill') || lower.includes('saw') || lower.includes('hammer') || lower.includes('blade') || lower.includes('bit') || lower.includes('tape measure') || lower.includes('level') || lower.includes('chisel') || lower.includes('knife') || lower.includes('spanner') || lower.includes('wrench') || lower.includes('pliers') || lower.includes('screwdriver') || lower.includes('trowel') || lower.includes('torch')) return 'Tools & Hardware';
  if (lower.includes('pipe') || lower.includes('copper') || lower.includes('valve') || lower.includes('trap') || lower.includes('solder') || lower.includes('compression') || lower.includes('pushfit') || lower.includes('radiator') || lower.includes('boiler') || lower.includes('waste') || lower.includes('tap') || lower.includes('flux') || lower.includes('ptfe')) return 'Plumbing & Heating';
  if (lower.includes('cable') || lower.includes('wire') || lower.includes('socket') || lower.includes('switch') || lower.includes('back box') || lower.includes('fuse') || lower.includes('junction') || lower.includes('conduit') || lower.includes('wago') || lower.includes('breaker') || lower.includes('consumer unit') || lower.includes('downlight') || lower.includes('bulb') || lower.includes('lamp')) return 'Electrical & Lighting';
  if (lower.includes('timber') || lower.includes('wood') || lower.includes('plywood') || lower.includes('mdf') || lower.includes('batten') || lower.includes('stud') || lower.includes('plasterboard') || lower.includes('plaster') || lower.includes('cement') || lower.includes('sand') || lower.includes('board') || lower.includes('skirting') || lower.includes('architrave') || lower.includes('insulation')) return 'Building & Timber';
  if (lower.includes('glove') || lower.includes('mask') || lower.includes('respirator') || lower.includes('goggle') || lower.includes('glasses') || lower.includes('ear defender') || lower.includes('hi vis') || lower.includes('rubble') || lower.includes('sack') || lower.includes('dust sheet') || lower.includes('wipe') || lower.includes('knee pad')) return 'PPE & Site Essentials';
  return 'General Materials';
};

export const splitBulkItems = (input: string): string[] => {
  if (!input || !input.trim()) return [];

  // 1. First split by newlines, commas, " and ", " & ", or "+"
  let items = input
    .split(/[\n,\r]+|\s+and\s+|\s+&\s+|\s+\+\s+/i)
    .map(item => item.trim())
    .filter(item => item.length > 0);

  // 2. If after delimiter splitting we have items with spaces, check if they can be split into individual items if space-separated without punctuation/prepositions
  const result: string[] = [];
  for (const item of items) {
    // If item contains spaces, check if it looks like a space-delimited list (e.g. "Milk butter eggs bleach clean wipes")
    // If it doesn't contain common multi-word ingredient phrases or measurements, split by whitespace.
    const words = item.split(/\s+/).filter(w => w.length > 0);
    
    // If single word or short phrase, keep as is
    if (words.length <= 1) {
      result.push(item);
    } else {
      // Check if words are distinct items or part of a multi-word phrase
      // If words don't form single recognized categories or known double-word items, split each word
      // Let's check if splitting by whitespace yields valid items
      let isCombinedList = false;
      // If every word (or most words) in the space-separated string independently resolves to a category or valid item
      const itemCategories = words.map(w => detectCategory(w));
      const nonOtherCount = itemCategories.filter(cat => cat !== 'Other').length;

      // If at least 2 words match known categories (like milk -> Dairy, butter -> Dairy, eggs -> Dairy, bleach -> Household), or words >= 3
      if (words.length >= 2 && (nonOtherCount >= 2 || words.length >= 3)) {
        // Exclude standard multi-word items like "ice cream", "paper towel", "loo roll", "sour cream", "olive oil", "ground beef"
        const lowerItem = item.toLowerCase();
        const knownMultiWords = ['ice cream', 'paper towel', 'toilet paper', 'loo roll', 'sour cream', 'olive oil', 'ground beef', 'peanut butter', 'coconut milk', 'baking powder', 'baking soda', 'heavy cream', 'cream cheese', 'maple syrup', 'soy sauce', 'full fat'];
        
        const isKnownMulti = knownMultiWords.some(mw => lowerItem.includes(mw));
        if (!isKnownMulti) {
          isCombinedList = true;
        }
      }

      if (isCombinedList) {
        words.forEach(w => result.push(w));
      } else {
        result.push(item);
      }
    }
  }

  return Array.from(new Set(result));
};

export const normalizeIngredient = (name: string) => {
  // 1. Convert to lowercase
  let cleaned = name.toLowerCase();
  
  // Strip leading action verbs/articles like "add", "buy", "get", "some", "a", "an", "the", "please", "need", "want"
  cleaned = cleaned.replace(/^(please\s+|can\s+you\s+|could\s+you\s+)?(add|buy|get|need|want|some|a|an|the|of)\s+/i, '').trim();
  cleaned = cleaned.replace(/^(some|a|an|the|of)\s+/i, '').trim();

  // Strip trailing shopping list suffixes like "to/on/for shopping list", "to/on/for the shopping list", "to/on/for my shopping list"
  cleaned = cleaned.replace(/\s+(to|on|for)\s+(the\s+|my\s+)?shopping\s+list$/i, '').trim();
  
  // 2. STICKY: Remove common measurements and quantities
  // Match numbers (including fractions like 1/2) and common units
  const measureRegex = /^(\d+\s*?|\d+\/\d+\s*?|(one|two|three|four|five|six|seven|eight|nine|ten)\s*?)+(cups?|tbsp?|tsp?|tablespoons?|teaspoons?|ml|g|kg|oz|lbs?|packets?|cans?|dashes|jars?|cloves?|heads?|bunches?|bottles?|large|medium|small|big|handfuls?|x\s*?\d+)\s*?(of)?\s*/i;
  cleaned = cleaned.replace(measureRegex, '');

  // 3. Remove leading numbers and basic quantities
  cleaned = cleaned.replace(/^[\d\s.\-/x]+/, '');

  // 4. Remove common preparation words if they are leading or trailing
  const prepWords = ['chopped', 'diced', 'sliced', 'minced', 'grated', 'shredded', 'peeled', 'crushed', 'beaten', 'drained', 'rinsed', 'pitted', 'seeded'];
  prepWords.forEach(word => {
    const regex = new RegExp(`(^|\\s)${word}(\\s|$)`, 'i');
    cleaned = cleaned.replace(regex, ' ').trim();
  });

  // 5. Final cleaning 
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  if (!cleaned) return name;

  // 6. Capitalization
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};
