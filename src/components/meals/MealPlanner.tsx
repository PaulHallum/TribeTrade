import { useState, useEffect, useRef, Suspense } from 'react';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import {
  Utensils,
  Sparkles,
  Camera,
  RefreshCw,
  ShoppingCart,
  Plus,
  Check,
  Trash2,
  ChevronLeft,
  Wand2,
  ExternalLink,
  Share2,
  Archive,
  ChefHat,
  Heart,
  Users,
  User,
  ShieldCheck,
  CalendarDays,
  Store,
  ArrowRight,
  ArrowLeft,
  Search,
  X,
  Loader2,
  ShieldAlert,
  ArrowLeftRight,
  Edit3,
  MessageCircle,
  Copy
} from 'lucide-react';
import { format } from 'date-fns';
import { shareToWhatsApp, shareViaWebShare, formatMealPlanText, copyToClipboard } from '../../lib/shareUtils';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, setDoc, doc, query, orderBy, addDoc, deleteDoc, updateDoc, getDocs, writeBatch, getCountFromServer } from 'firebase/firestore';
import { useAuth } from '../../App';
import { useSettings } from '../../contexts/SettingsContext';
import { useSubscriptionTier } from '../../hooks/useSubscriptionTier';
import { analyzePantryImage, extractIngredientsFromMeal } from '../../services/gemini';
import { logger } from '../../services/logger';
import CameraChoiceModal from '../common/CameraChoiceModal';
import ConfirmModal from '../common/ConfirmModal';
import SmartCaptureModal from '../smart/SmartCaptureModal';

const RecipeGallery = lazyWithRetry(() => import('./RecipeGallery'));
import { detectCategory, normalizeIngredient, splitBulkItems } from '../../lib/shoppingUtils';
import PageHeader from '../common/PageHeader';
import { useToast } from '../../contexts/ToastContext';



interface Meal {
  id: string;
  day: string;
  isJoint: boolean;
  kidsDinner?: string;
  adultsDinner?: string;
  jointDinner?: string;
  keyIngredients: string[];
  allIngredients: string[];
  sourceUrl: string;
  isManual?: boolean;
}

interface ShoppingItem {
  id: string;
  name: string;
  checked: boolean;
  suggested?: boolean;
  category?: string;
}


interface FamilyMember {
  id: string;
  name: string;
  role?: string;
  likedFoods?: string[];
  allergies?: string[];
  favoriteThings?: string[];
  memories?: string[];
}

export default function MealPlanner({ initialView }: { initialView?: 'planner' | 'shopping' | 'cookbook' }) {
  const { showToast } = useToast();
  const { tradeUserId, user } = useAuth();
  const { settings } = useSettings();
  const { subscriptionTier } = useSubscriptionTier();
  const [isGenerating, setIsGenerating] = useState(false);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'planner' | 'shopping' | 'cookbook'>(initialView || 'shopping');
  const [newItemName, setNewItemName] = useState('');
  const [mealSearchQuery, setMealSearchQuery] = useState('');
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [pantryItems, setPantryItems] = useState<string[]>([]);
  const [useItUpSuggestions, setUseItUpSuggestions] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
  const [showOptions, setShowOptions] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState<Meal | null>(null);
  const [showCaptureOptions, setShowCaptureOptions] = useState(false);
  const [showSmartCapture, setShowSmartCapture] = useState(false);
  const [smartCaptureMode, setSmartCaptureMode] = useState<'select' | 'camera' | 'file' | 'document'>('select');
  const [mealMode, setMealMode] = useState<'joint' | 'kids' | 'adults'>('joint');
  const [pantryImages, setPantryImages] = useState<string[]>([]);
  const [selectedSupermarket, setSelectedSupermarket] = useState<string>(() => {
    return localStorage.getItem('lastSelectedSupermarket') || 'tesco';
  });
  useEffect(() => {
    localStorage.setItem('lastSelectedSupermarket', selectedSupermarket);
  }, [selectedSupermarket]);
  const [savedRecipes, setSavedRecipes] = useState<any[]>([]);
  const [showRecipePickerModal, setShowRecipePickerModal] = useState<'joint' | 'kids' | 'adults' | null>(null);
  const [isExtractingIngredients, setIsExtractingIngredients] = useState(false);

  const [isShoppingMode, setIsShoppingMode] = useState(false);
  const [currentShopIndex, setCurrentShopIndex] = useState(0);
  const [hasOpenedCurrent, setHasOpenedCurrent] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => { }
  });
  const [recipeToPlan, setRecipeToPlan] = useState<any | null>(null);
  const [showDayPicker, setShowDayPicker] = useState(false);
  const [addIngredientsToShop, setAddIngredientsToShop] = useState(false);
  const [targetGroup, setTargetGroup] = useState<'joint' | 'kids' | 'adults'>('joint');

  const [showFavoritesDrawer, setShowFavoritesDrawer] = useState(false);
  const [favoriteRecipes, setFavoriteRecipes] = useState<any[]>([]);
  const [swapSourceDay, setSwapSourceDay] = useState<string | null>(null);
  const [editMealModal, setEditMealModal] = useState<{
    day: string;
    isJoint: boolean;
    kidsDinner: string;
    adultsDinner: string;
    jointDinner: string;
    keyIngredients: string;
  } | null>(null);

  useEffect(() => {
    if (!tradeUserId) return;
    const recipesRef = collection(db, 'trade_users', tradeUserId, 'recipes');
    return onSnapshot(recipesRef, (snap) => {
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFavoriteRecipes(list.filter((r: any) => r.isFavorite).slice(0, 10));
    });
  }, [tradeUserId]);

  const handleSaveDayMeal = async () => {
    if (!editMealModal || !tradeUserId) return;
    const { day, isJoint, kidsDinner, adultsDinner, jointDinner, keyIngredients } = editMealModal;
    const ingredientsArray = keyIngredients
      .split(',')
      .map(i => i.trim())
      .filter(Boolean);

    try {
      const mealDocRef = doc(db, 'trade_users', tradeUserId, 'meals', day);
      const data: any = {
        day,
        isJoint,
        keyIngredients: ingredientsArray,
        allIngredients: ingredientsArray,
        sourceUrl: '',
        isManual: true
      };

      if (isJoint) {
        data.jointDinner = jointDinner || null;
        data.kidsDinner = null;
        data.adultsDinner = null;
      } else {
        data.kidsDinner = kidsDinner || null;
        data.adultsDinner = adultsDinner || null;
        data.jointDinner = null;
      }

      await setDoc(mealDocRef, data, { merge: true });
      setEditMealModal(null);
      showToast(`Updated meal for ${day}!`, 'success');
    } catch (err) {
      logger.error('Failed to save day meal', err);
    }
  };

  const handleToggleDayJoint = async (mealItem: Meal | undefined, dayName: string) => {
    if (!tradeUserId) return;
    try {
      const mealDocRef = doc(db, 'trade_users', tradeUserId, 'meals', dayName);
      const currentlyJoint = mealItem ? mealItem.isJoint : ['Saturday', 'Sunday'].includes(dayName);
      const newIsJoint = !currentlyJoint;

      await setDoc(mealDocRef, {
        day: dayName,
        isJoint: newIsJoint
      }, { merge: true });

      showToast(`${dayName} set to ${newIsJoint ? 'Altogether' : 'Split Kids/Adults'}`, 'info');
    } catch (err) {
      logger.error('Failed to toggle meal split mode', err);
    }
  };

  const handleApplyPreset = async (preset: 'weekday-split' | 'all-joint' | 'all-split') => {
    if (!tradeUserId) return;
    try {
      const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      const weekends = ['Saturday', 'Sunday'];
      const allDays = [...weekdays, ...weekends];

      const batch = writeBatch(db);
      allDays.forEach(day => {
        const isJoint = preset === 'all-joint' ? true : preset === 'all-split' ? false : weekends.includes(day);
        const existing = meals.find(m => m.day === day);
        const mealDocRef = doc(db, 'trade_users', tradeUserId, 'meals', day);
        if (existing) {
          batch.update(mealDocRef, { isJoint });
        } else {
          batch.set(mealDocRef, { day, isJoint, keyIngredients: [], allIngredients: [] }, { merge: true });
        }
      });

      await batch.commit();
      showToast(
        preset === 'weekday-split'
          ? 'Set pattern: Weekdays Split & Weekends Altogether!'
          : preset === 'all-joint' ? 'Set pattern: All days Altogether' : 'Set pattern: All days Split',
        'success'
      );
    } catch (err) {
      logger.error('Failed to apply meal pattern preset', err);
    }
  };

  const handleAddIngredientsFromMeal = async (meal: Meal) => {
    if (!tradeUserId || !user) return;
    const ingredients = meal.allIngredients || meal.keyIngredients || [];
    if (ingredients.length === 0) {
      showToast('No ingredients found for this meal.', 'info');
      return;
    }
    let addedCount = 0;
    try {
      for (const ing of ingredients) {
        const normalized = normalizeIngredient(ing);
        const exists = shoppingList.some(item => !item.checked && item.name.toLowerCase() === normalized.toLowerCase());
        if (!exists) {
          await addDoc(collection(db, 'trade_users', tradeUserId, 'shoppingList'), {
            name: normalized,
            category: detectCategory(normalized),
            checked: false,
            authorId: user.uid,
            createdAt: new Date().toISOString()
          });
          addedCount++;
        }
      }
      if (addedCount > 0) {
        showToast(`Added ${addedCount} ingredient${addedCount === 1 ? '' : 's'} to your shopping list!`, 'success');
      } else {
        showToast('All ingredients are already on your shopping list!', 'info');
      }
    } catch (err) {
      logger.error('Failed to add meal ingredients to shopping list', err);
    }
  };

  const handleSwapMealDays = async (day1: string, day2: string) => {
    if (!tradeUserId || day1 === day2) return;
    try {
      const meal1 = meals.find(m => m.day === day1);
      const meal2 = meals.find(m => m.day === day2);

      const ref1 = doc(db, 'trade_users', tradeUserId, 'meals', day1);
      const ref2 = doc(db, 'trade_users', tradeUserId, 'meals', day2);

      const batch = writeBatch(db);

      if (meal1) {
        const { id, ...data1 } = meal1;
        batch.set(ref2, { ...data1, day: day2 }, { merge: true });
      } else {
        batch.delete(ref2);
      }

      if (meal2) {
        const { id, ...data2 } = meal2;
        batch.set(ref1, { ...data2, day: day1 }, { merge: true });
      } else {
        batch.delete(ref1);
      }

      await batch.commit();
      showToast(`Swapped meals between ${day1} and ${day2}!`, 'success');
    } catch (err) {
      logger.error('Failed to swap meal days', err);
    } finally {
      setSwapSourceDay(null);
    }
  };

  const handleDeleteDayMeal = async (day: string) => {
    if (!tradeUserId) return;
    try {
      await deleteDoc(doc(db, 'trade_users', tradeUserId, 'meals', day));
    } catch (err) {
      logger.error('Failed to delete day meal', err);
    }
  };

  const handleSaveAsRecipe = async (meal: Meal) => {
    if (!tradeUserId || !user) return;
    try {
      const limit = subscriptionTier === 'premium' ? 100 : 10;
      const countSnap = await getCountFromServer(collection(db, 'trade_users', tradeUserId, 'recipes'));
      if (countSnap.data().count >= limit) {
        showToast(
          `Recipe limit reached! ${subscriptionTier === 'premium' ? 'Premium tier' : 'You are on the Free tier which'} is limited to ${limit} recipes. ${subscriptionTier === 'free' ? 'Upgrade to Premium for 100 recipes!' : ''}`,
          'error'
        );
        return;
      }

      const title = meal.jointDinner || meal.adultsDinner || meal.kidsDinner || 'New Recipe';
      await addDoc(collection(db, 'trade_users', tradeUserId, 'recipes'), {
        title,
        ingredients: meal.allIngredients || meal.keyIngredients || [],
        instructions: '', // AI can fill this later if they edit
        sourceUrl: meal.sourceUrl || '',
        isFavorite: true,
        createdAt: new Date().toISOString()
      });
      showToast(`"${title}" saved to your cookbook!`, 'success');
    } catch (err) {
      logger.error('Failed to save recipe', err);
    }
  };

  const handleAddRecipeToPlan = async (day: string, group: 'joint' | 'kids' | 'adults', addIngredients: boolean = false) => {
    if (!tradeUserId || !recipeToPlan) return;
    try {
      const mealDocRef = doc(db, 'trade_users', tradeUserId, 'meals', day);

      let mealData: any = {
        day,
        keyIngredients: Array.from(new Set([...(recipeToPlan.ingredients || [])])),
        allIngredients: Array.from(new Set([...(recipeToPlan.ingredients || [])])),
        sourceUrl: recipeToPlan.sourceUrl || '',
        isManual: true
      };

      if (group === 'joint') {
        mealData.isJoint = true;
        mealData.jointDinner = recipeToPlan.title;
        mealData.kidsDinner = null;
        mealData.adultsDinner = null;
      } else if (group === 'kids') {
        mealData.isJoint = false;
        mealData.kidsDinner = recipeToPlan.title;
        mealData.jointDinner = null;
        const existing = meals.find(m => m.day === day);
        if (existing && !existing.isJoint && existing.adultsDinner) {
          mealData.adultsDinner = existing.adultsDinner;
          mealData.keyIngredients = Array.from(new Set([...(existing.keyIngredients || []), ...(recipeToPlan.ingredients || [])]));
          mealData.allIngredients = Array.from(new Set([...(existing.allIngredients || []), ...(recipeToPlan.ingredients || [])]));
        } else {
          mealData.adultsDinner = null;
        }
      } else if (group === 'adults') {
        mealData.isJoint = false;
        mealData.adultsDinner = recipeToPlan.title;
        mealData.jointDinner = null;
        const existing = meals.find(m => m.day === day);
        if (existing && !existing.isJoint && existing.kidsDinner) {
          mealData.kidsDinner = existing.kidsDinner;
          mealData.keyIngredients = Array.from(new Set([...(existing.keyIngredients || []), ...(recipeToPlan.ingredients || [])]));
          mealData.allIngredients = Array.from(new Set([...(existing.allIngredients || []), ...(recipeToPlan.ingredients || [])]));
        } else {
          mealData.kidsDinner = null;
        }
      }

      await setDoc(mealDocRef, mealData, { merge: true });

      if (addIngredients && recipeToPlan.ingredients) {
        for (const ing of recipeToPlan.ingredients) {
          const normalized = normalizeIngredient(ing);
          await addDoc(collection(db, 'trade_users', tradeUserId, 'shoppingList'), {
            name: normalized,
            category: detectCategory(normalized),
            checked: false,
            authorId: user?.uid,
            createdAt: new Date().toISOString()
          });
        }
      }

      setShowDayPicker(false);
      setRecipeToPlan(null);
      setView('planner');
    } catch (err) {
      logger.error('Failed to add recipe to plan', err);
    }
  };

  const handleShareDayMeal = async (dayMeal: Meal | null, dayName: string, method: 'whatsapp' | 'webshare' | 'copy') => {
    const todayFormattedDate = format(new Date(), 'EEEE, MMM d');
    const isToday = dayName.toLowerCase() === format(new Date(), 'EEEE').toLowerCase();
    const dateLabel = isToday ? todayFormattedDate : dayName;
    const text = formatMealPlanText(dayMeal, dayName, dateLabel);

    if (method === 'whatsapp') {
      shareToWhatsApp(text);
      showToast(`Shared ${dayName}'s meal plan to WhatsApp!`, 'success');
    } else if (method === 'webshare') {
      const shared = await shareViaWebShare({
        title: `${dayName}'s Meal Plan`,
        text: text
      });
      if (!shared) {
        shareToWhatsApp(text);
      }
    } else {
      const copied = await copyToClipboard(text);
      if (copied) {
        showToast(`${dayName}'s meal plan copied to clipboard!`, 'success');
      }
    }
  };

  const supermarkets = [
    { id: 'asda', name: 'Asda', url: 'https://www.asda.com/groceries/search/' },
    { id: 'tesco', name: 'Tesco', url: 'https://www.tesco.com/groceries/en-GB/search?query=' },
    { id: 'sainsburys', name: 'Sainsbury\'s', url: 'https://www.sainsburys.co.uk/gol-ui/SearchResults/' },
    { id: 'morrisons', name: 'Morrisons', url: 'https://groceries.morrisons.com/search?q=' },
    { id: 'ocado', name: 'Ocado', url: 'https://www.ocado.com/search?q=' },
    { id: 'waitrose', name: 'Waitrose', url: 'https://www.waitrose.com/ecom/shop/search?&searchTerm=' }
  ];

  const uncheckedItems = shoppingList.filter(item => !item.checked);
  const currentShopItem = uncheckedItems[currentShopIndex];

  const openSupermarketWindow = (itemName: string) => {
    const url = `${supermarkets.find(s => s.id === selectedSupermarket)?.url}${encodeURIComponent(itemName)}`;

    const width = 450;
    const height = window.innerHeight;
    const left = window.screen.width - width;
    const top = 0;

    const win = window.open(url, 'tribe-shopping', `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`);
    setHasOpenedCurrent(true);
  };

  const handleNextItem = async () => {
    // Mark current as complete
    if (currentShopItem) {
      await toggleItem(currentShopItem);
    }

    if (currentShopIndex < uncheckedItems.length - 1) {
      // Stay on same index because the list shrunken
      setHasOpenedCurrent(false);
    } else {
      setIsShoppingMode(false);
      setHasOpenedCurrent(false);
    }
  };

  const handleSkipItem = () => {
    if (currentShopIndex < uncheckedItems.length - 1) {
      setCurrentShopIndex(prev => prev + 1);
      setHasOpenedCurrent(false);
    } else {
      setIsShoppingMode(false);
    }
  };

  const handlePrevItem = () => {
    if (currentShopIndex > 0) {
      const prevIdx = currentShopIndex - 1;
      setCurrentShopIndex(prevIdx);
      setHasOpenedCurrent(false);
    }
  };

  useEffect(() => {
    if (isShoppingMode) {
      if (uncheckedItems.length === 0) {
        setIsShoppingMode(false);
      } else if (currentShopIndex >= uncheckedItems.length) {
        setCurrentShopIndex(Math.max(0, uncheckedItems.length - 1));
      }
    }
  }, [uncheckedItems.length, isShoppingMode, currentShopIndex]);

  const handleCameraClick = () => {
    setShowCaptureOptions(true);
  };

  const handleChoice = (choice: 'camera' | 'file' | 'document') => {
    setSmartCaptureMode(choice);
    setShowCaptureOptions(false);
    setShowSmartCapture(true);
  };

  const removePhoto = (index: number) => {
    setPantryImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleAnalyzePantry = async () => {
    if (pantryImages.length === 0) return;
    setIsGenerating(true);
    try {
      // PRIVACY: Pantry photos are used for one-time analysis and then discarded.
      // They are NEVER persisted to the cloud or local storage.
      const res = await analyzePantryImage(pantryImages);
      const normalizedItems = (res.items || []).map(normalizeIngredient);
      setPantryItems(prev => Array.from(new Set([...prev, ...normalizedItems])));
      setUseItUpSuggestions((res.useItUpSuggestions || []) as any);
      logger.info('Pantry analyzed successfully');
    } catch (err) {
      logger.error('Failed to analyze pantry', err);
    } finally {
      setPantryImages([]); // Wreak and purge state holding the Base64 image data immediately from memory
      setIsGenerating(false);
    }
  };

  useEffect(() => {
    if (!tradeUserId) return;

    const mealsRef = collection(db, 'trade_users', tradeUserId, 'meals');
    const unsubMeals = onSnapshot(mealsRef, (snapshot) => {
      const mealList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Meal[];

      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const sorted = mealList.sort((a, b) => days.indexOf(a.day) - days.indexOf(b.day));

      setMeals(sorted);
      setLoading(false);
    });

    const shoppingRef = collection(db, 'trade_users', tradeUserId, 'shoppingList');
    const unsubShopping = onSnapshot(shoppingRef, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ShoppingItem[];
      setShoppingList(items);
    });

    const membersRef = collection(db, 'trade_users', tradeUserId, 'members');
    const unsubMembers = onSnapshot(membersRef, (snapshot) => {
      const memberList = snapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        role: doc.data().role,
        likedFoods: doc.data().likedFoods || [],
        allergies: doc.data().allergies || [],
        favoriteThings: doc.data().favoriteThings || [],
        memories: doc.data().memories || []
      })) as FamilyMember[];
      setMembers(memberList);
    });

    const recipesRef = collection(db, 'trade_users', tradeUserId, 'recipes');
    const unsubRecipes = onSnapshot(recipesRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setSavedRecipes(list);
    });

    return () => {
      unsubMeals();
      unsubShopping();
      unsubMembers();
      unsubRecipes();
    };
  }, [tradeUserId]);

  useEffect(() => {
    if (initialView) {
      setView(initialView);
    }
  }, [initialView]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view]);

  const clearPlan = async () => {
    if (!tradeUserId) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Clear Weekly Plan',
      message: 'Are you sure you want to clear the entire meal plan for this week? this cannot be undone.',
      confirmLabel: 'Clear Plan',
      onConfirm: async () => {
        try {
          const deletePromises = meals.map(meal =>
            deleteDoc(doc(db, 'trade_users', tradeUserId, 'meals', meal.id))
          );
          await Promise.all(deletePromises);
        } catch (error) {
          logger.error('Error clearing meal plan', error);
        }
      }
    });
  };

  const shareShoppingList = () => {
    const listText = shoppingList
      .filter(i => !i.checked)
      .map(i => `• ${i.name}`)
      .join('\n');

    const text = `🛒 *Our Shopping List*\n\n${listText}\n\nGenerated by Tribe`;

    if (navigator.share) {
      navigator.share({
        title: 'Shopping List',
        text: text
      }).catch(() => {
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      });
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    }
  };

  const addItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!tradeUserId || !newItemName.trim() || !user) return;

    if (subscriptionTier === 'free' && shoppingList.length >= 50) {
      showToast('Shopping list limit reached! You are on the Free tier which is limited to 50 items. Upgrade to Premium for unlimited items.', 'error');
      return;
    }

    try {
      const splitNames = splitBulkItems(newItemName.trim());
      for (const name of splitNames) {
        const normalizedName = normalizeIngredient(name);
        const category = detectCategory(normalizedName);
        await addDoc(collection(db, 'trade_users', tradeUserId, 'shoppingList'), {
          name: normalizedName,
          category,
          checked: false,
          authorId: user.uid,
          createdAt: new Date().toISOString()
        });
      }
      setNewItemName('');
      if (splitNames.length > 1) {
        showToast(`Added ${splitNames.length} items to shopping list!`, 'success');
      }
    } catch (error) {
      logger.error('Error adding shopping item', error);
    }
  };

  const toggleItem = async (item: ShoppingItem) => {
    if (!tradeUserId) return;
    try {
      await updateDoc(doc(db, 'trade_users', tradeUserId, 'shoppingList', item.id), {
        checked: !item.checked,
        checkedAt: !item.checked ? new Date().toISOString() : null
      });
    } catch (error) {
      logger.error('Error toggling shopping item', error);
    }
  };

  const deleteItem = async (id: string) => {
    if (!tradeUserId) return;
    try {
      await deleteDoc(doc(db, 'trade_users', tradeUserId, 'shoppingList', id));
    } catch (error) {
      logger.error('Error deleting shopping item', error);
    }
  };

  const clearShoppingList = async () => {
    if (!tradeUserId) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Clear Shopping List',
      message: 'Are you sure you want to remove all items from your shopping list?',
      confirmLabel: 'Clear List',
      onConfirm: async () => {
        try {
          const deletePromises = shoppingList.map(item =>
            deleteDoc(doc(db, 'trade_users', tradeUserId, 'shoppingList', item.id))
          );
          await Promise.all(deletePromises);
        } catch (error) {
          logger.error('Error clearing shopping list', error);
        }
      }
    });
  };


  const generateShoppingList = async () => {
    if (!tradeUserId || !user) return;

    // Normalize and Deduplicate
    const rawIngredients = meals.flatMap(m => m.allIngredients || m.keyIngredients || []);
    const normalizedMap = new Map<string, string>();

    rawIngredients.forEach(ing => {
      const normalized = normalizeIngredient(ing);
      const key = normalized.toLowerCase();
      if (!normalizedMap.has(key)) {
        normalizedMap.set(key, normalized);
      }
    });

    const uniqueNormalized = Array.from(normalizedMap.values());

    // Filter out items already in the shopping list OR in the pantry
    const existingNames = shoppingList.map(i => i.name.toLowerCase());
    const pantryNames = pantryItems.map(i => i.toLowerCase());

    let newIngredients = uniqueNormalized.filter(ing => {
      const lowerIng = ing.toLowerCase();
      // Only keep if it doesn't already exist or a very close match doesn't exist
      return !existingNames.some(en => en === lowerIng || en.includes(lowerIng) || lowerIng.includes(en)) &&
        !pantryNames.some(pn => lowerIng === pn || lowerIng.includes(pn) || pn.includes(lowerIng));
    });

    if (subscriptionTier === 'free') {
      const totalAllowed = 50;
      const currentCount = shoppingList.length;
      if (currentCount >= totalAllowed) {
        showToast('Shopping list limit reached! You are on the Free tier which is limited to 50 items. Upgrade to Premium for unlimited items.', 'error');
        return;
      }
      if (currentCount + newIngredients.length > totalAllowed) {
        const remaining = totalAllowed - currentCount;
        newIngredients = newIngredients.slice(0, remaining);
        showToast(`Only added ${remaining} items. Shopping list limit is 50 items on the Free tier. Upgrade to Premium for unlimited items!`, 'warning');
      }
    }

    try {
      for (const ing of newIngredients) {
        await addDoc(collection(db, 'trade_users', tradeUserId, 'shoppingList'), {
          name: ing,
          category: detectCategory(ing),
          checked: false,
          suggested: true,
          authorId: user.uid,
          createdAt: new Date().toISOString()
        });
      }
      setView('shopping');
    } catch (error) {
      logger.error('Error generating shopping list', error);
    }
  };

  if (isShoppingMode) {
    const itemsToShop = shoppingList.filter(i => !i.checked);
    const uncheckedItems = shoppingList.filter(i => !i.checked);
    const currentShopItem = uncheckedItems[currentShopIndex];

    const openSupermarketWindow = (itemName: string) => {
      const links: Record<string, string> = {
        tesco: `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(itemName)}`,
        sainsburys: `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(itemName)}`,
        asda: `https://www.asda.com/groceries/search/${encodeURIComponent(itemName)}`,
        morrisons: `https://groceries.morrisons.com/search?q=${encodeURIComponent(itemName)}`,
        waitrose: `https://www.waitrose.com/ecom/shop/search?&searchTerm=${encodeURIComponent(itemName)}`,
        ocado: `https://www.ocado.com/search?q=${encodeURIComponent(itemName)}`
      };

      window.open(links[selectedSupermarket] || links.tesco, '_blank', 'width=800,height=800,left=200,top=100');
      setHasOpenedCurrent(true);
    };

    const handleNextItem = async () => {
      if (currentShopItem) {
        await toggleItem(currentShopItem);
      }
      setHasOpenedCurrent(false);
      if (currentShopIndex === uncheckedItems.length - 1) {
        setIsShoppingMode(false);
        setCurrentShopIndex(0);
      } else {
        setCurrentShopIndex(0);
      }
    };

    const handleSkipItem = () => {
      setHasOpenedCurrent(false);
      if (currentShopIndex < uncheckedItems.length - 1) {
        setCurrentShopIndex(prev => prev + 1);
      } else {
        setIsShoppingMode(false);
        setCurrentShopIndex(0);
      }
    };

    return (
      <div className="fixed inset-0 z-50 bg-white dark:bg-zinc-900 flex flex-col">
        <div className="flex-1 overflow-y-auto pb-40">
          <div className="max-w-2xl mx-auto p-4 space-y-6 mt-10">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-zinc-900 dark:text-white uppercase tracking-tight">Shopping Mode</h2>
              <button
                onClick={() => setIsShoppingMode(false)}
                className="p-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 rounded-xl font-bold text-xs uppercase tracking-widest"
              >
                Exit
              </button>
            </div>


            {shoppingList.length === 0 && (
              <div className="text-center py-12 text-zinc-400">
                <ShoppingCart className="w-12 h-12 mx-auto mb-4 opacity-20" />
                <p>Your shopping list is empty.</p>
              </div>
            )}
          </div>
        </div>

        <AnimatePresence>
          {isShoppingMode && currentShopItem && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-zinc-900/90 backdrop-blur-md"
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[40px] overflow-hidden text-center border border-zinc-200 dark:border-zinc-800"
              >
                <div className="p-8 space-y-8">
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-2">
                      <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">Next Recommendation</p>
                    </div>
                    <h3 className="text-4xl font-black text-zinc-900 dark:text-white tracking-tight leading-none px-4">
                      {currentShopItem.name}
                    </h3>
                    <p className="text-xs font-bold text-zinc-400 uppercase tracking-widest">
                      {currentShopIndex + 1} of {uncheckedItems.length} items
                    </p>
                  </div>

                  <div className="space-y-3">
                    {hasOpenedCurrent ? (
                      <button
                        onClick={handleNextItem}
                        className="w-full py-6 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-3xl font-black text-xs uppercase tracking-[0.2em] active:scale-95 transition-all"
                      >
                        {currentShopIndex === uncheckedItems.length - 1 ? 'Finish List' : 'Next Item'}
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => openSupermarketWindow(currentShopItem.name)}
                          className="w-full py-6 bg-emerald-500 text-white rounded-3xl font-black text-xs uppercase tracking-[0.2em] active:scale-95 transition-all flex items-center justify-center gap-3"
                        >
                          <Search className="w-4 h-4" />
                          Add to Basket
                        </button>
                        <button
                          onClick={handleSkipItem}
                          className="w-full py-6 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-3xl font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all"
                        >
                          Skip Item
                        </button>
                      </>
                    )}
                  </div>

                  <button
                    onClick={() => setIsShoppingMode(false)}
                    className="text-[10px] font-black text-zinc-400 uppercase tracking-widest hover:text-red-500 transition-colors"
                  >
                    Close Shopping View
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        <ConfirmModal
          isOpen={confirmConfig.isOpen}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto pb-40">
      <PageHeader
        icon={Utensils}
        title="Meal Planner"
        subtitle="Your custom family meal plan"
        extra={
          <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-400/10 p-1 rounded-2xl flex gap-1 items-center">
            <button 
              onClick={() => {
                showToast("Snap a photo of your fridge, pantry, or ingredients to generate custom 'Use It Up' recipes with AI!", "info");
                handleCameraClick();
              }}
              className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors text-slate-600 dark:text-slate-400"
              title="Use It Up — Scan Pantry/Fridge Ingredients"
            >
              <Camera size={18} />
            </button>
            <button
              onClick={() => {
                if (view === 'shopping') {
                  shareShoppingList();
                } else {
                  const todayDayName = format(new Date(), 'EEEE');
                  const todayMeal = meals.find(m => m.day === todayDayName) || null;
                  handleShareDayMeal(todayMeal, todayDayName, 'webshare');
                }
              }}
              className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-750 transition-colors text-slate-600 dark:text-slate-400"
              title={view === 'shopping' ? 'Share Shopping List' : "Share Today's Meal Plan"}
            >
              <Share2 size={18} />
            </button>
          </div>
        }
      />

      {subscriptionTier === 'free' && (view === 'shopping' || view === 'cookbook') && (
        <div className="mb-4 mt-2 px-3 py-2 bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-400/10 rounded-2xl flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
            {view === 'shopping' ? (
              <span>You are currently using the <strong>Free Tier</strong>, which limits you to <strong>50 shopping list items</strong>.</span>
            ) : (
              <span>You are currently using the <strong>Free Tier</strong>, which limits you to <strong>10 cookbook recipes</strong>.</span>
            )}
          </div>
          <a href="/?view=settings" className="ml-3 shrink-0 px-3 py-1 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-colors text-xs whitespace-nowrap">Upgrade to Premium</a>
        </div>
      )}

      <div className="flex items-center justify-between gap-4 mb-5 mt-2 flex-wrap">
        <div className="bg-gradient-to-r from-emerald-500/10 to-blue-500/10 border border-emerald-500/20 dark:border-emerald-400/10 p-1 rounded-2xl flex gap-1 w-fit">
          {[
            { id: 'shopping', label: 'Shopping List', icon: ShoppingCart },
            { id: 'cookbook', label: 'Recipes', icon: ChefHat },
            { id: 'planner', label: 'Meal Plan', icon: CalendarDays },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setView(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${view === tab.id
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
            >
              <tab.icon size={14} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {view === 'cookbook' && (
        <Suspense fallback={<div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>}>
          <RecipeGallery
            members={members}
            onAddToPlan={(recipe) => {
              setRecipeToPlan(recipe);
              setShowDayPicker(true);
            }}
            onScanRecipe={handleCameraClick}
          />
        </Suspense>
      )}

      {view === 'shopping' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between px-1">
            <form onSubmit={addItem} className="relative flex-1 w-full flex gap-2">
              <div className="relative flex-1">
                <Plus className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="Add item to shopping list..."
                  className="w-full pl-11 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-3 bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all active:scale-95 shrink-0 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </form>
            <div className="flex gap-2 w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={generateShoppingList}
                className="flex-1 sm:flex-none px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-sm"
              >
                <Wand2 className="w-4 h-4" />
                Sync Meals
              </button>
              <button
                type="button"
                onClick={clearShoppingList}
                className="p-3 bg-red-500 text-white rounded-2xl hover:bg-red-600 transition-all active:scale-95 shadow-sm shrink-0 flex items-center justify-center"
                title="Clear All"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500 font-medium">
                {subscriptionTier === 'free' ? `Shopping List Capacity: ${shoppingList.length} / 50 items` : `Shopping List: ${shoppingList.length} items`}
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                  <Store className="w-3 h-3" />
                  Select Supermarket
                </h4>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {supermarkets.map((sm) => (
                  <button
                    key={sm.id}
                    type="button"
                    onClick={() => setSelectedSupermarket(sm.id)}
                    className={`py-3 px-1 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border-2 ${selectedSupermarket === sm.id
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'bg-zinc-50 dark:bg-zinc-800 border-zinc-100 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-200'
                      }`}
                  >
                    {sm.name}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setIsShoppingMode(true)}
              disabled={shoppingList.filter(i => !i.checked).length === 0}
              className="w-full py-4 bg-emerald-500 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-3 disabled:opacity-50 disabled:hover:bg-emerald-500"
            >
              <ShoppingCart className="w-4 h-4" /> Start Shopping Session
            </button>

            {/* Grouped Aisle Shopping List */}
            <div className="space-y-4 pt-4 border-t border-zinc-100 dark:border-zinc-800">
              {(() => {
                const categoriesOrder = ['Produce', 'Dairy & Chilled', 'Bakery', 'Meat & Seafood', 'Cupboard & Pantry', 'Frozen', 'Household & Toiletries', 'Other'];
                const activeItems = shoppingList.filter(i => !i.checked);
                const completedItems = shoppingList.filter(i => i.checked);

                if (shoppingList.length === 0) {
                  return (
                    <div className="text-center py-8">
                      <ShoppingCart className="w-12 h-12 text-zinc-200 dark:text-zinc-700 mx-auto mb-3" />
                      <p className="text-sm font-medium text-zinc-500">Your list is empty</p>
                      <p className="text-xs text-zinc-400 mt-1">Click sync meals or type above to add items.</p>
                    </div>
                  );
                }

                return (
                  <>
                    {categoriesOrder.map(cat => {
                      const catItems = activeItems.filter(i => (i.category || detectCategory(i.name)) === cat);
                      if (catItems.length === 0) return null;

                      return (
                        <div key={cat} className="space-y-2">
                          <div className="flex items-center gap-2 px-1">
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                              {cat} ({catItems.length})
                            </span>
                          </div>
                          <div className="space-y-2">
                            {catItems.map(item => (
                              <div
                                key={item.id}
                                className="flex items-center justify-between pt-3 pb-3 pr-3 pl-5 bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700 shadow-sm rounded-xl transition-all relative overflow-hidden"
                              >
                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
                                <div className="flex items-center gap-3">
                                  <button
                                    onClick={() => toggleItem(item)}
                                    className="w-6 h-6 rounded-lg border-2 border-zinc-300 dark:border-zinc-600 hover:border-emerald-500 flex items-center justify-center transition-all"
                                  >
                                    {item.checked && <Check className="w-3.5 h-3.5" />}
                                  </button>
                                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                    {item.name}
                                  </span>
                                </div>
                                <button
                                  onClick={() => deleteItem(item.id)}
                                  className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}

                    {completedItems.length > 0 && (
                      <div className="space-y-2 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">
                          Completed ({completedItems.length})
                        </span>
                        <div className="space-y-2">
                          {completedItems.map(item => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between pt-3 pb-3 pr-3 pl-5 bg-zinc-50/50 dark:bg-zinc-800/50 rounded-xl transition-all relative overflow-hidden"
                            >
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => toggleItem(item)}
                                  className="w-6 h-6 rounded-lg bg-emerald-500 text-white flex items-center justify-center transition-all"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-sm font-medium text-zinc-400 line-through">
                                  {item.name}
                                </span>
                              </div>
                              <button
                                onClick={() => deleteItem(item.id)}
                                className="p-2 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {shoppingList.some(i => i.checked) && (
            <button
              onClick={() => {
                setConfirmConfig({
                  isOpen: true,
                  title: 'Clear Checked Items',
                  message: 'Are you sure you want to remove all checked items from your shopping list?',
                  confirmLabel: 'Clear Items',
                  onConfirm: () => {
                    const checkedItems = shoppingList.filter(i => i.checked);
                    checkedItems.forEach(i => deleteItem(i.id));
                  }
                });
              }}
              className="w-full py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Clear Completed Items
            </button>
          )}
        </div>
      )}

      {view === 'planner' && (
        <>
          <AnimatePresence>
            {pantryImages.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4 bg-white dark:bg-zinc-900 p-6 rounded-[32px] border border-zinc-100 dark:border-zinc-800 overflow-hidden mb-6"
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs font-black text-zinc-400 uppercase tracking-widest px-1">Captured Photos</h3>
                  <p className="text-[10px] text-zinc-400 font-bold">{pantryImages.length} ready for analysis</p>
                </div>
                <div className="flex flex-wrap gap-4">
                  {pantryImages.map((img, idx) => (
                    <div key={idx} className="relative group/img w-24 h-24 rounded-2xl overflow-hidden border-2 border-white dark:border-zinc-800">
                      <img
                        src={`data:image/jpeg;base64,${img}`}
                        className="w-full h-full object-cover"
                        alt="Pantry"
                      />
                      <button
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={handleCameraClick}
                    className="w-24 h-24 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col items-center justify-center gap-2 text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all group"
                  >
                    <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-bold uppercase tracking-widest">Add More</span>
                  </button>
                </div>

                <button
                  onClick={handleAnalyzePantry}
                  disabled={isGenerating}
                  className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-2xl hover:opacity-90 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isGenerating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5 text-emerald-500" />}
                  Analyze {pantryImages.length} {pantryImages.length === 1 ? 'Photo' : 'Photos'}
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between px-1 mb-4">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                value={mealSearchQuery}
                onChange={(e) => setMealSearchQuery(e.target.value)}
                placeholder="Search weekly meals or ingredients..."
                className="w-full pl-11 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-zinc-900 dark:text-white placeholder:text-zinc-400"
              />
              {mealSearchQuery && (
                <button
                  type="button"
                  onClick={() => setMealSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="flex gap-2 w-full sm:w-auto shrink-0">
              <button
                type="button"
                onClick={handleCameraClick}
                className="flex-1 sm:flex-none px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95 shadow-sm"
              >
                <Camera className="w-4 h-4" />
                Scan Pantry
              </button>
              <button
                type="button"
                onClick={clearPlan}
                className="flex-1 sm:flex-none px-6 py-3 bg-red-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-red-600 transition-all active:scale-95 shadow-sm"
              >
                <Trash2 className="w-4 h-4" />
                Clear Week
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 no-scrollbar">
            <span className="text-[11px] font-bold text-zinc-400 whitespace-nowrap">Preset Pattern:</span>
            <button
              type="button"
              onClick={() => handleApplyPreset('weekday-split')}
              className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50 rounded-xl text-xs font-bold whitespace-nowrap hover:bg-emerald-100 transition-all flex items-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5" />
              Split Weekdays & Joint Weekends
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('all-joint')}
              className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold whitespace-nowrap hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
            >
              All Altogether
            </button>
            <button
              type="button"
              onClick={() => handleApplyPreset('all-split')}
              className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-bold whitespace-nowrap hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
            >
              All Split
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
              .filter(day => {
                if (!mealSearchQuery.trim()) return true;
                const q = mealSearchQuery.toLowerCase();
                const item = meals.find(m => m.day === day);
                if (day.toLowerCase().includes(q)) return true;
                if (!item) return false;
                return (
                  item.jointDinner?.toLowerCase().includes(q) ||
                  item.kidsDinner?.toLowerCase().includes(q) ||
                  item.adultsDinner?.toLowerCase().includes(q) ||
                  item.keyIngredients?.some(ing => ing.toLowerCase().includes(q))
                );
              })
              .map((day, i) => {
              const item = meals.find(m => m.day === day);
              const isWeekend = ['Saturday', 'Sunday'].includes(day);
              const currentJoint = item ? item.isJoint : isWeekend;

              if (!item || (!item.jointDinner && !item.kidsDinner && !item.adultsDinner)) {
                return (
                  <motion.div
                    key={day}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-zinc-50 dark:bg-zinc-900/30 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex flex-col justify-between min-h-[160px]"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-bold text-base text-zinc-900 dark:text-white">{day}</h3>
                        <button
                          type="button"
                          onClick={() => handleToggleDayJoint(item, day)}
                          title="Toggle between Altogether & Split Kids/Adults"
                          className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border transition-all ${currentJoint
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                              : 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800'
                            }`}
                        >
                          {currentJoint ? 'Altogether' : 'Split Kids/Adults'}
                        </button>
                      </div>
                      <p className="text-xs text-zinc-400">
                        {currentJoint ? 'No meal planned yet.' : 'Separate meals for kids & adults.'}
                      </p>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button
                        type="button"
                        onClick={() => setEditMealModal({
                          day,
                          isJoint: currentJoint,
                          kidsDinner: item?.kidsDinner || '',
                          adultsDinner: item?.adultsDinner || '',
                          jointDinner: item?.jointDinner || '',
                          keyIngredients: (item?.keyIngredients || []).join(', ')
                        })}
                        className="flex-1 py-2 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all flex items-center justify-center gap-1 shadow-sm"
                      >
                        <Plus size={14} /> Add Meal
                      </button>
                      <button
                        type="button"
                        onClick={() => setView('cookbook')}
                        className="py-2 px-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-all flex items-center justify-center gap-1"
                        title="Pick from Cookbook"
                      >
                        <ChefHat size={14} />
                      </button>
                    </div>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={item.day}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl pt-4 pb-4 pr-4 pl-5 transition-all group relative overflow-hidden shadow-sm"
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1.5" style={{ backgroundColor: settings.themeColor }} />
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base text-zinc-900 dark:text-white">{item.day}</h3>
                      <button
                        type="button"
                        onClick={() => handleToggleDayJoint(item, day)}
                        title="Click to toggle between Altogether & Split Kids/Adults"
                        className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border transition-all ${item.isJoint
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                            : 'bg-indigo-50 text-indigo-600 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800'
                          }`}
                      >
                        {item.isJoint ? 'Altogether' : 'Split Kids/Adults'}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditMealModal({
                        day,
                        isJoint: item.isJoint,
                        kidsDinner: item.kidsDinner || '',
                        adultsDinner: item.adultsDinner || '',
                        jointDinner: item.jointDinner || '',
                        keyIngredients: (item.keyIngredients || []).join(', ')
                      })}
                      className="p-1.5 text-zinc-400 hover:text-emerald-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                      title="Edit Day Meal"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    {item.isJoint ? (
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500 dark:text-emerald-400 block mb-0.5">Altogether</span>
                        <p className="text-zinc-900 dark:text-white font-bold text-sm leading-tight">{item.jointDinner || 'No dinner specified'}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-500 block mb-0.5">Kids Only</span>
                          <p className="text-zinc-900 dark:text-white font-bold text-sm leading-tight">{item.kidsDinner || <span className="text-zinc-400 font-normal italic">None set</span>}</p>
                        </div>
                        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/50">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-rose-500 block mb-0.5">Adults Only</span>
                          <p className="text-zinc-900 dark:text-white font-bold text-sm leading-tight">{item.adultsDinner || <span className="text-zinc-400 font-normal italic">None set</span>}</p>
                        </div>
                      </div>
                    )}

                    {/* Top Row: Ingredients Button */}
                    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800">
                      <button
                        onClick={() => setSelectedMeal(item)}
                        className="w-full flex items-center justify-center py-2 px-3 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl text-xs font-bold text-zinc-700 dark:text-zinc-300 transition-all border border-zinc-200/50 dark:border-zinc-700/50"
                      >
                        <Utensils className="w-3.5 h-3.5 mr-1.5 text-emerald-500" />
                        View / Edit Ingredients
                      </button>
                    </div>

                    {/* Bottom Row: Action Icons Below Ingredients */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        onClick={() => handleAddIngredientsFromMeal(item)}
                        className="p-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-xl hover:bg-emerald-100 transition-all border border-transparent hover:border-emerald-200"
                        title="Add Ingredients to Shopping List"
                      >
                        <ShoppingCart className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setSwapSourceDay(item.day)}
                        className="p-2 bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400 rounded-xl hover:bg-amber-100 transition-all border border-transparent hover:border-amber-200"
                        title="Swap Meal Day"
                      >
                        <ArrowLeftRight className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleShareDayMeal(item, item.day, 'webshare')}
                        className="p-2 bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-100 transition-all border border-transparent hover:border-blue-200"
                        title="Share Day Meal"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteDayMeal(item.day)}
                        className="p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 transition-all border border-transparent hover:border-red-200"
                        title="Clear Day Meal"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      {/* Quick Swap Day Modal */}
      <AnimatePresence>
        {swapSourceDay && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 w-full max-w-sm rounded-[32px] p-6 border border-zinc-200 dark:border-zinc-800 space-y-4 text-center"
            >
              <div className="w-12 h-12 bg-amber-50 dark:bg-amber-950/30 text-amber-500 rounded-2xl flex items-center justify-center mx-auto">
                <ArrowLeftRight className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-zinc-900 dark:text-white">Swap Meal Day</h3>
                <p className="text-xs text-zinc-500 mt-1">Swap {swapSourceDay}'s meal with another day:</p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-2">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
                  .filter(d => d !== swapSourceDay)
                  .map(targetDay => (
                    <button
                      key={targetDay}
                      onClick={() => handleSwapMealDays(swapSourceDay, targetDay)}
                      className="py-2.5 px-3 bg-zinc-50 dark:bg-zinc-800 hover:bg-amber-50 dark:hover:bg-amber-950/40 hover:text-amber-600 rounded-xl text-xs font-bold transition-all border border-zinc-100 dark:border-zinc-700"
                    >
                      {targetDay}
                    </button>
                  ))}
              </div>
              <button
                onClick={() => setSwapSourceDay(null)}
                className="w-full py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 text-xs font-bold rounded-xl mt-2"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Quick Add Favorites Drawer */}
      <AnimatePresence>
        {showFavoritesDrawer && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-zinc-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-md h-full bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 p-6 overflow-y-auto space-y-6 flex flex-col justify-between"
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-4">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 bg-rose-50 dark:bg-rose-950/30 text-rose-500 rounded-xl">
                      <Heart className="w-5 h-5 fill-current" />
                    </div>
                    <div>
                      <h3 className="font-black text-lg text-zinc-900 dark:text-white">Quick Add Favorites</h3>
                      <p className="text-xs text-zinc-400">Top family recipes</p>
                    </div>
                  </div>
                  <button onClick={() => setShowFavoritesDrawer(false)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full">
                    <X className="w-5 h-5 text-zinc-400" />
                  </button>
                </div>

                {favoriteRecipes.length === 0 ? (
                  <div className="text-center py-12 text-zinc-400 space-y-2">
                    <Heart className="w-10 h-10 mx-auto opacity-30" />
                    <p className="text-xs font-bold">No favorite recipes saved yet.</p>
                    <p className="text-[11px]">Heart any recipe in your Cookbook to see it here!</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {favoriteRecipes.map(recipe => (
                      <div key={recipe.id} className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800 space-y-3">
                        <div className="flex items-start justify-between">
                          <h4 className="font-bold text-sm text-zinc-900 dark:text-white">{recipe.title}</h4>
                          <span className="text-[9px] font-black uppercase text-rose-500 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-full">Favorite</span>
                        </div>
                        <p className="text-xs text-zinc-500 line-clamp-1">
                          {(recipe.ingredients || []).join(', ')}
                        </p>
                        <button
                          onClick={() => {
                            setRecipeToPlan(recipe);
                            setShowFavoritesDrawer(false);
                            setShowDayPicker(true);
                          }}
                          className="w-full py-2 bg-emerald-500 text-white font-bold text-xs rounded-xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-1.5"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add to Meal Plan
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => setShowFavoritesDrawer(false)}
                className="w-full py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-bold text-xs rounded-xl"
              >
                Close Drawer
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Day Meal Modal */}
      <AnimatePresence>
        {editMealModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setEditMealModal(null)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[32px] overflow-hidden p-6 border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div>
                  <h3 className="text-lg font-black text-zinc-900 dark:text-white">Edit {editMealModal.day} Meal</h3>
                  <p className="text-xs text-zinc-500">Configure dinner options for this day</p>
                </div>
                <button onClick={() => setEditMealModal(null)} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400 block mb-1.5">Dining Structure</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setEditMealModal(prev => prev ? { ...prev, isJoint: true } : null)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${editMealModal.isJoint
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 border-emerald-300 dark:border-emerald-700'
                          : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
                        }`}
                    >
                      Altogether (Joint)
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditMealModal(prev => prev ? { ...prev, isJoint: false } : null)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${!editMealModal.isJoint
                          ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 border-indigo-300 dark:border-indigo-700'
                          : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 border-zinc-200 dark:border-zinc-700'
                        }`}
                    >
                      Split (Kids & Adults)
                    </button>
                  </div>
                </div>

                {editMealModal.isJoint ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-black uppercase tracking-widest text-emerald-500">Altogether Dinner</label>
                      <button
                        type="button"
                        onClick={() => setShowRecipePickerModal('joint')}
                        className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
                      >
                        <ChefHat className="w-3.5 h-3.5" />
                        Pick Saved Recipe
                      </button>
                    </div>
                    <input
                      type="text"
                      value={editMealModal.jointDinner}
                      onChange={(e) => setEditMealModal(prev => prev ? { ...prev, jointDinner: e.target.value } : null)}
                      placeholder="e.g. Spaghetti Bolognese with Garlic Bread"
                      className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500 font-medium text-zinc-900 dark:text-white"
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-blue-500">Kids Dinner</label>
                        <button
                          type="button"
                          onClick={() => setShowRecipePickerModal('kids')}
                          className="flex items-center gap-1 text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <ChefHat className="w-3.5 h-3.5" />
                          Pick Saved Recipe
                        </button>
                      </div>
                      <input
                        type="text"
                        value={editMealModal.kidsDinner}
                        onChange={(e) => setEditMealModal(prev => prev ? { ...prev, kidsDinner: e.target.value } : null)}
                        placeholder="e.g. Fish Fingers, Chips & Peas"
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 font-medium text-zinc-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-black uppercase tracking-widest text-rose-500">Adults Dinner</label>
                        <button
                          type="button"
                          onClick={() => setShowRecipePickerModal('adults')}
                          className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 hover:underline"
                        >
                          <ChefHat className="w-3.5 h-3.5" />
                          Pick Saved Recipe
                        </button>
                      </div>
                      <input
                        type="text"
                        value={editMealModal.adultsDinner}
                        onChange={(e) => setEditMealModal(prev => prev ? { ...prev, adultsDinner: e.target.value } : null)}
                        placeholder="e.g. Thai Green Curry & Jasmine Rice"
                        className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-rose-500 font-medium text-zinc-900 dark:text-white"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Key Ingredients (Comma separated)</label>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!editMealModal) return;
                        const mealNames = editMealModal.isJoint
                          ? editMealModal.jointDinner
                          : [editMealModal.kidsDinner, editMealModal.adultsDinner].filter(Boolean).join(', ');

                        if (!mealNames.trim()) {
                          showToast('Please type a meal description first!', 'info');
                          return;
                        }

                        setIsExtractingIngredients(true);
                        try {
                          const extracted = await extractIngredientsFromMeal(mealNames);
                          if (extracted.length > 0) {
                            setEditMealModal(prev => prev ? { ...prev, keyIngredients: extracted.join(', ') } : null);
                            showToast('Extracted key ingredients for this meal!', 'success');
                          } else {
                            showToast('Could not extract ingredients. Try typing main items manually.', 'info');
                          }
                        } catch (err) {
                          logger.error('Failed to extract ingredients', err);
                          showToast('Failed to extract ingredients automatically.', 'error');
                        } finally {
                          setIsExtractingIngredients(false);
                        }
                      }}
                      disabled={isExtractingIngredients}
                      className="flex items-center gap-1 text-[10px] font-bold text-emerald-500 hover:text-emerald-600 transition-colors disabled:opacity-50"
                    >
                      {isExtractingIngredients ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3 text-emerald-500" />}
                      AI Extract Ingredients
                    </button>
                  </div>
                  <input
                    type="text"
                    value={editMealModal.keyIngredients}
                    onChange={(e) => setEditMealModal(prev => prev ? { ...prev, keyIngredients: e.target.value } : null)}
                    placeholder="e.g. Pasta, Minced Beef, Garlic Bread"
                    className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs focus:ring-2 focus:ring-emerald-500 text-zinc-900 dark:text-white"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">These will auto-sync to your shopping list when you click Sync Meals.</p>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditMealModal(null)}
                  className="flex-1 py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-xl text-xs font-bold hover:bg-zinc-200 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveDayMeal}
                  className="flex-1 py-3 bg-emerald-500 text-white rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all shadow-sm"
                >
                  Save Meal
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Recipe Picker Modal for Edit Meal */}
      <AnimatePresence>
        {showRecipePickerModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-zinc-900 w-full max-w-md rounded-[32px] p-6 border border-zinc-200 dark:border-zinc-800 space-y-4 max-h-[80vh] flex flex-col justify-between shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div className="flex items-center gap-2">
                  <ChefHat className="w-5 h-5 text-emerald-500" />
                  <h3 className="text-base font-black text-zinc-900 dark:text-white">Select Saved Recipe</h3>
                </div>
                <button onClick={() => setShowRecipePickerModal(null)} className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto space-y-2 flex-1 pr-1">
                {savedRecipes.length === 0 ? (
                  <div className="py-8 text-center text-zinc-400 space-y-2">
                    <ChefHat className="w-10 h-10 mx-auto opacity-30" />
                    <p className="text-xs font-bold">No saved recipes in Cookbook yet.</p>
                  </div>
                ) : (
                  savedRecipes.map(recipe => (
                    <button
                      key={recipe.id}
                      type="button"
                      onClick={() => {
                        if (!editMealModal) return;
                        const recipeIngredientsStr = (recipe.ingredients || []).join(', ');
                        setEditMealModal(prev => {
                          if (!prev) return null;
                          const existingIngs = prev.keyIngredients
                            ? prev.keyIngredients.split(',').map(s => s.trim()).filter(Boolean)
                            : [];
                          const combined = Array.from(new Set([...existingIngs, ...(recipe.ingredients || [])])).join(', ');
                          const field = showRecipePickerModal;
                          if (field === 'joint') {
                            return { ...prev, jointDinner: recipe.title, keyIngredients: combined || recipeIngredientsStr };
                          } else if (field === 'kids') {
                            return { ...prev, kidsDinner: recipe.title, keyIngredients: combined || recipeIngredientsStr };
                          } else {
                            return { ...prev, adultsDinner: recipe.title, keyIngredients: combined || recipeIngredientsStr };
                          }
                        });
                        setShowRecipePickerModal(null);
                        showToast(`Loaded "${recipe.title}" & ingredients!`, 'success');
                      }}
                      className="w-full text-left p-3 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-2xl border border-zinc-100 dark:border-zinc-800 transition-all group"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs text-zinc-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400">{recipe.title}</h4>
                        <span className="text-[10px] text-emerald-500 font-bold opacity-0 group-hover:opacity-100 transition-opacity">Select →</span>
                      </div>
                      {recipe.ingredients?.length > 0 && (
                        <p className="text-[10px] text-zinc-400 line-clamp-1 mt-1">
                          {(recipe.ingredients || []).join(', ')}
                        </p>
                      )}
                    </button>
                  ))
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowRecipePickerModal(null)}
                className="w-full py-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-xs font-bold rounded-xl"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Ingredients Modal */}
      <AnimatePresence>
        {selectedMeal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMeal(null)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-[32px]  overflow-hidden"
            >
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white">Ingredients</h3>
                  <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">{selectedMeal.day}</p>
                </div>
                <button
                  onClick={() => setSelectedMeal(null)}
                  className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors"
                >
                  <X className="w-6 h-6 text-zinc-400" />
                </button>
              </div>
              <div className="p-6 max-h-[60vh] overflow-y-auto">
                {(() => {
                  const rawIngs = [...(selectedMeal.keyIngredients || []), ...(selectedMeal.allIngredients || [])];
                  const uniqueIngredients = Array.from(
                    new Map(rawIngs.map(ing => [ing.toLowerCase().trim(), ing.trim()])).values()
                  ).filter(Boolean);

                  if (uniqueIngredients.length === 0) {
                    return (
                      <div className="py-8 text-center text-zinc-400 space-y-2">
                        <Utensils className="w-10 h-10 mx-auto opacity-30 text-emerald-500" />
                        <p className="text-xs font-bold">No ingredients listed for this meal yet.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">
                          Ingredients ({uniqueIngredients.length})
                        </h4>
                        <span className="text-[10px] text-zinc-400">Click bin icon to delete any item</span>
                      </div>
                      <div className="space-y-2">
                        {uniqueIngredients.map((ing, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between p-3 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800/80 group/ing"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                              <span className="text-xs font-bold text-zinc-900 dark:text-white">{ing}</span>
                            </div>
                            <button
                              type="button"
                              onClick={async () => {
                                if (!tradeUserId || !selectedMeal?.id) return;
                                const targetLower = ing.toLowerCase().trim();
                                const updatedKey = (selectedMeal.keyIngredients || []).filter(item => item.toLowerCase().trim() !== targetLower);
                                const updatedAll = (selectedMeal.allIngredients || []).filter(item => item.toLowerCase().trim() !== targetLower);

                                try {
                                  await updateDoc(doc(db, 'trade_users', tradeUserId, 'meals', selectedMeal.id), {
                                    keyIngredients: updatedKey,
                                    allIngredients: updatedAll
                                  });
                                  setSelectedMeal(prev => prev ? { ...prev, keyIngredients: updatedKey, allIngredients: updatedAll } : null);
                                  showToast(`Removed "${ing}"`, 'success');
                                } catch (err: any) {
                                  logger.error('Failed to remove ingredient', err);
                                  showToast('Failed to remove ingredient', 'error');
                                }
                              }}
                              className="p-1.5 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                              title={`Delete ${ing}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  onClick={() => setSelectedMeal(null)}
                  className="w-full py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 font-bold rounded-2xl"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <CameraChoiceModal
        isOpen={showCaptureOptions}
        onClose={() => setShowCaptureOptions(false)}
        onChoice={handleChoice}
        title="Analyze Cupboard"
      />

      <AnimatePresence>
        {showSmartCapture && (
          <SmartCaptureModal
            onClose={() => setShowSmartCapture(false)}
            initialMode={smartCaptureMode}
            members={members}
            onImageCaptured={(base64) => {
              setPantryImages(prev => [...prev, base64]);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDayPicker && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDayPicker(false)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-sm bg-white dark:bg-zinc-900 rounded-[32px] p-8 text-center border border-zinc-200 dark:border-zinc-800"
            >
              <h3 className="text-xl font-bold mb-2">Add to Weekly Plan</h3>
              <p className="text-sm text-zinc-500 mb-6">Which day would you like to add "{recipeToPlan?.title}" to?</p>

              <div className="space-y-2 mb-6 text-left">
                <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Who is this for?</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'joint', label: 'Altogether', color: 'border-emerald-500 text-emerald-600' },
                    { id: 'kids', label: 'Kids Only', color: 'border-blue-500 text-blue-600' },
                    { id: 'adults', label: 'Adults Only', color: 'border-rose-500 text-rose-600' }
                  ].map(group => {
                    const hasKids = members.some(m => ['Son', 'Daughter'].includes(m.role || ''));
                    const hasAdults = members.some(m => ['Dad', 'Mum', 'Grandparent'].includes(m.role || ''));

                    if (group.id === 'kids' && !hasKids) return null;
                    if (group.id === 'adults' && !hasAdults) return null;

                    return (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => setTargetGroup(group.id as any)}
                        className={`py-2.5 rounded-xl border-2 text-[10px] font-bold uppercase transition-all text-center ${targetGroup === group.id
                            ? `${group.color} bg-zinc-50 dark:bg-zinc-800`
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50'
                          }`}
                      >
                        {group.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-6">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                  <button
                    key={day}
                    onClick={() => {
                      handleAddRecipeToPlan(day, targetGroup, addIngredientsToShop);
                    }}
                    className="py-3 bg-zinc-50 dark:bg-zinc-800 rounded-xl text-sm font-bold hover:bg-emerald-500 hover:text-white transition-all"
                  >
                    {day}
                  </button>
                ))}
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                <label className="flex items-center justify-center gap-3 cursor-pointer group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={addIngredientsToShop}
                      onChange={(e) => setAddIngredientsToShop(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="w-5 h-5 border-2 border-zinc-300 dark:border-zinc-600 rounded-md peer-checked:bg-emerald-500 peer-checked:border-emerald-500 transition-all flex items-center justify-center">
                      <Check className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" />
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
                    Add ingredients to shopping list
                  </span>
                </label>
              </div>

              <button
                onClick={() => setShowDayPicker(false)}
                className="mt-6 text-xs font-bold text-zinc-400 uppercase tracking-widest hover:text-red-500"
              >
                Cancel
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmLabel={confirmConfig.confirmLabel}
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

