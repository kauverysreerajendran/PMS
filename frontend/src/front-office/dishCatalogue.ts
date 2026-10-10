import type { FoodType } from "./menuApi";

export type CatalogueDish = { name: string; category: string; food_type: FoodType; meal_periods: string[]; price: number };

const dish = (name: string, category: string, food_type: FoodType, meal_periods: string[], price: number): CatalogueDish => ({ name, category, food_type, meal_periods, price });
const B = ["Breakfast", "Brunch"], L = ["Lunch", "Dinner"], S = ["Snacks"], D = ["Desserts"], V = ["Beverages"];

/** Common hotel dishes to start from; the owner's own menu items are offered alongside these. Prices are only suggestions. */
export const DISH_CATALOGUE: CatalogueDish[] = [
  dish("Idli", "South Indian", "veg", B, 80), dish("Medu Vada", "South Indian", "veg", B, 70), dish("Masala Dosa", "South Indian", "veg", B, 140),
  dish("Plain Dosa", "South Indian", "veg", B, 110), dish("Ghee Roast Dosa", "South Indian", "veg", B, 160), dish("Pongal", "South Indian", "veg", B, 120),
  dish("Upma", "South Indian", "veg", B, 100), dish("Uttapam", "South Indian", "veg", B, 130), dish("Poori Masala", "South Indian", "veg", B, 130),
  dish("Appam with Stew", "South Indian", "veg", B, 170), dish("Sambar", "South Indian", "veg", B, 40), dish("Coconut Chutney", "South Indian", "veg", B, 20),
  dish("Poha", "North Indian", "veg", B, 100), dish("Aloo Paratha", "North Indian", "veg", B, 150), dish("Chole Bhature", "North Indian", "veg", [...B, "Lunch"], 180),
  dish("Masala Omelette", "Eggs", "egg", B, 120), dish("Boiled Eggs (2)", "Eggs", "egg", B, 80), dish("Egg Bhurji", "Eggs", "egg", B, 130),
  dish("Pancakes with Maple Syrup", "Continental", "veg", B, 220), dish("French Toast", "Continental", "egg", B, 200), dish("Toast with Butter & Jam", "Continental", "veg", B, 110),
  dish("Fresh Fruit Platter", "Continental", "veg", B, 180), dish("Cornflakes with Milk", "Continental", "veg", B, 120), dish("Yogurt Parfait", "Continental", "veg", B, 190),
  dish("Paneer Butter Masala", "North Indian", "veg", L, 320), dish("Dal Makhani", "North Indian", "veg", L, 260), dish("Butter Chicken", "North Indian", "non_veg", L, 380),
  dish("Chicken Biryani", "Biryani & Rice", "non_veg", L, 360), dish("Veg Biryani", "Biryani & Rice", "veg", L, 280), dish("Jeera Rice", "Biryani & Rice", "veg", L, 180),
  dish("Steamed Rice", "Biryani & Rice", "veg", L, 120), dish("Butter Naan", "Breads", "veg", L, 60), dish("Tandoori Roti", "Breads", "veg", L, 40),
  dish("Chapati", "Breads", "veg", L, 30), dish("South Indian Meals", "Thali", "veg", ["Lunch"], 320), dish("North Indian Thali", "Thali", "veg", L, 380),
  dish("Fish Curry", "Seafood", "non_veg", L, 420), dish("Prawn Masala", "Seafood", "non_veg", L, 460), dish("Grilled Chicken", "Continental", "non_veg", L, 420),
  dish("Pasta Alfredo", "Continental", "veg", L, 340), dish("Veg Club Sandwich", "Snacks", "veg", [...S, "Lunch"], 220), dish("Chicken Club Sandwich", "Snacks", "non_veg", [...S, "Lunch"], 260),
  dish("French Fries", "Snacks", "veg", S, 150), dish("Veg Pakora", "Snacks", "veg", S, 140), dish("Samosa (2)", "Snacks", "veg", S, 80),
  dish("Paneer Tikka", "Starters", "veg", [...S, "Dinner"], 300), dish("Chicken 65", "Starters", "non_veg", [...S, "Dinner"], 320), dish("Tomato Soup", "Soups", "veg", [...L, ...S], 140),
  dish("Gulab Jamun (2)", "Desserts", "veg", D, 100), dish("Ice Cream Scoop", "Desserts", "veg", D, 120), dish("Payasam", "Desserts", "veg", D, 110),
  dish("Chocolate Brownie", "Desserts", "egg", D, 180), dish("Filter Coffee", "Hot Beverages", "beverage", [...V, ...B], 60), dish("Masala Chai", "Hot Beverages", "beverage", [...V, ...B], 50),
  dish("Green Tea", "Hot Beverages", "beverage", V, 70), dish("Cappuccino", "Hot Beverages", "beverage", V, 160), dish("Fresh Lime Soda", "Cold Beverages", "beverage", V, 90),
  dish("Fresh Orange Juice", "Cold Beverages", "beverage", [...V, ...B], 140), dish("Sweet Lassi", "Cold Beverages", "beverage", V, 110), dish("Tender Coconut", "Cold Beverages", "beverage", V, 90),
  dish("Mineral Water (1 L)", "Cold Beverages", "beverage", V, 40), dish("Welcome Drink", "Cold Beverages", "beverage", V, 0),
];

type StarterItem = { name: string; category: string; description: string | null; price: number; food_type: FoodType; prep_minutes: number | null;
  is_available: boolean; meal_periods: string[]; is_complimentary: boolean; components: string[] };
const combo = (name: string, price: number, food_type: FoodType, meal_periods: string[], components: string[], description: string): StarterItem =>
  ({ name, category: "Combos & Set Menus", description, price, food_type, prep_minutes: 20, is_available: true, meal_periods, is_complimentary: false, components });

/** Ready-made menu for a new restaurant: every catalogue dish plus a few popular set menus. */
export const STARTER_MENU: StarterItem[] = [
  ...DISH_CATALOGUE.map(entry => ({ ...entry, description: null, prep_minutes: entry.category.includes("Beverages") ? 5 : 15, is_available: true,
    is_complimentary: entry.price === 0, components: [] as string[] })),
  combo("South Indian Breakfast Platter", 260, "veg", ["Breakfast", "Brunch"], ["2 Idli", "Medu Vada", "Plain Dosa", "Sambar", "Coconut Chutney", "Filter Coffee"], "A full South Indian start to the day."),
  combo("Continental Breakfast", 450, "egg", ["Breakfast", "Brunch"], ["Toast with Butter & Jam", "Masala Omelette", "Fresh Fruit Platter", "Fresh Orange Juice", "Cappuccino"], "Eggs, toast, fruit, juice and coffee."),
  combo("North Indian Lunch Combo", 520, "veg", ["Lunch", "Dinner"], ["Paneer Butter Masala", "Dal Makhani", "Jeera Rice", "2 Butter Naan", "Gulab Jamun (2)"], "Curry, dal, rice, naan and dessert."),
  combo("Evening Tea Combo", 220, "veg", ["Snacks"], ["Samosa (2)", "Veg Pakora", "Masala Chai"], "Tea-time snacks with masala chai."),
  combo("Non-Veg Dinner Combo", 560, "non_veg", ["Dinner"], ["Butter Chicken", "Jeera Rice", "2 Butter Naan", "Ice Cream Scoop"], "Butter chicken with rice, naan and ice cream."),
];
