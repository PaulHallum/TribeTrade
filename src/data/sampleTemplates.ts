export const SAMPLE_TRADE_JOB_NOTE = `Enquiry from Sarah Jenkins (07700 900123) - 24 Richmond Avenue:
Need full consumer unit upgrade to 18th edition RCBO metal board, plus 4x double socket additions in home office, and outdoor security floodlight installation.
Looking for quote this week, work to be completed next Tuesday or Wednesday. Customer requesting 20% deposit terms.`;

export const SAMPLE_SCHOOL_CIRCULAR = `Enquiry from Sarah Jenkins (07700 900123) - 24 Richmond Avenue:
Need full consumer unit upgrade to 18th edition RCBO metal board, plus 4x double socket additions in home office, and outdoor security floodlight installation.
Looking for quote this week, work to be completed next Tuesday or Wednesday. Customer requesting 20% deposit terms.`;

export interface SampleMealPlanItem {
  day: string;
  name: string;
  category: 'Dinner' | 'Lunch' | 'Breakfast';
  servings: number;
  prepTime: string;
  ingredients: { name: string; amount: string; category: string }[];
}

export const SAMPLE_MEAL_PLAN: SampleMealPlanItem[] = [
  {
    day: 'Monday',
    name: 'Creamy Tuscan Garlic Chicken & Pasta',
    category: 'Dinner',
    servings: 4,
    prepTime: '25 mins',
    ingredients: [
      { name: 'Chicken Breasts', amount: '500g', category: 'Meat & Seafood' },
      { name: 'Penne Pasta', amount: '350g', category: 'Pantry' },
      { name: 'Heavy Cream', amount: '200ml', category: 'Dairy & Eggs' },
      { name: 'Baby Spinach', amount: '100g', category: 'Produce' },
      { name: 'Sun-Dried Tomatoes', amount: '80g', category: 'Pantry' },
      { name: 'Garlic Cloves', amount: '3', category: 'Produce' },
    ],
  },
  {
    day: 'Tuesday',
    name: 'Sheet Pan Beef Tacos with Guacamole',
    category: 'Dinner',
    servings: 4,
    prepTime: '20 mins',
    ingredients: [
      { name: 'Lean Minced Beef', amount: '500g', category: 'Meat & Seafood' },
      { name: 'Taco Shells', amount: '8 pack', category: 'Pantry' },
      { name: 'Ripe Avocados', amount: '2', category: 'Produce' },
      { name: 'Cheddar Cheese', amount: '150g', category: 'Dairy & Eggs' },
      { name: 'Salsa', amount: '1 jar', category: 'Pantry' },
      { name: 'Lime', amount: '1', category: 'Produce' },
    ],
  },
  {
    day: 'Wednesday',
    name: 'Roasted Mediterranean Veggie Bowl',
    category: 'Dinner',
    servings: 4,
    prepTime: '30 mins',
    ingredients: [
      { name: 'Halloumi Cheese', amount: '225g', category: 'Dairy & Eggs' },
      { name: 'Quinoa', amount: '200g', category: 'Pantry' },
      { name: 'Courgettes', amount: '2', category: 'Produce' },
      { name: 'Red Bell Peppers', amount: '2', category: 'Produce' },
      { name: 'Olive Oil', amount: '2 tbsp', category: 'Pantry' },
    ],
  },
];
