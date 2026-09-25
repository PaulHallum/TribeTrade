import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ChefHat, Heart, Plus, Search, Trash2, Calendar, ChevronRight, Clock, Users, Utensils, X, Sparkles, Camera, ExternalLink, Save, Wand2, ShieldAlert, Edit } from 'lucide-react';
import { db } from '../../lib/firebase';
import { collection, onSnapshot, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '../../App';
import { useSettings } from '../../contexts/SettingsContext';
import { getRecipeIngredients, getRecipeInstructionsAndPrepTime } from '../../services/gemini';
import { useToast } from '../../contexts/ToastContext';
import { useSubscriptionTier } from '../../hooks/useSubscriptionTier';
import ConfirmModal from '../common/ConfirmModal';

interface Recipe {
  id: string;
  title: string;
  ingredients: string[];
  instructions?: string;
  isFavorite: boolean;
  prepTime?: string;
  servings?: string;
  imageUrl?: string;
  sourceUrl?: string;
  createdAt: string;
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

interface RecipeGalleryProps {
  members: FamilyMember[];
  onAddToPlan: (recipe: Recipe) => void;
  onScanRecipe: () => void;
}

export default function RecipeGallery({ members, onAddToPlan, onScanRecipe }: RecipeGalleryProps) {
  const { showToast } = useToast();
  const { tradeUserId } = useAuth();
  const { settings } = useSettings();
  const { subscriptionTier } = useSubscriptionTier();
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    variant?: 'danger' | 'warning' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [isAddingManual, setIsAddingManual] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [newRecipe, setNewRecipe] = useState({
    title: '',
    ingredients: '',
    instructions: '',
    prepTime: '',
    servings: ''
  });
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [newIng, setNewIng] = useState('');
  const [targetAudience, setTargetAudience] = useState<'all' | 'adults' | 'kids'>('all');
  const [isGeneratingInstructions, setIsGeneratingInstructions] = useState(false);
  const [isLookingUpIngredients, setIsLookingUpIngredients] = useState(false);

  const handleAIIngredientsLookup = async () => {
    if (!newRecipe.title.trim()) {
      showToast('Please enter a recipe title first!', 'info');
      return;
    }
    setIsLookingUpIngredients(true);
    try {
      const res = await getRecipeIngredients(newRecipe.title.trim());
      if (Array.isArray(res)) {
        setIngredients(res);
      } else {
        showToast('Failed to parse ingredients lookup.', 'error');
      }
    } catch (err) {
      console.error('Ingredients lookup failed', err);
      showToast('Failed to look up ingredients.', 'error');
    } finally {
      setIsLookingUpIngredients(false);
    }
  };

  const handleAICookingInstructions = async () => {
    if (!newRecipe.title.trim()) {
      showToast('Please enter a recipe title first!', 'info');
      return;
    }
    setIsGeneratingInstructions(true);
    try {
      const res = await getRecipeInstructionsAndPrepTime(newRecipe.title.trim(), ingredients);
      if (res) {
        setNewRecipe(prev => ({
          ...prev,
          instructions: res.instructions || '',
          prepTime: res.prepTime || prev.prepTime
        }));
      }
    } catch (err) {
      console.error('Failed to generate instructions', err);
      showToast('Failed to generate cooking instructions.', 'error');
    } finally {
      setIsGeneratingInstructions(false);
    }
  };

  useEffect(() => {
    if (!tradeUserId) return;

    const recipesRef = collection(db, 'trade_users', tradeUserId, 'recipes');
    return onSnapshot(recipesRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Recipe[];
      const sorted = list.sort((a, b) => {
        if (!!a.isFavorite !== !!b.isFavorite) return a.isFavorite ? -1 : 1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
      setRecipes(sorted);
      setLoading(false);
    });
  }, [tradeUserId]);

  const filteredRecipes = recipes
    .filter(r => 
      r.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.ingredients.some(ing => ing.toLowerCase().includes(searchQuery.toLowerCase()))
    )
    .sort((a, b) => {
      if (!!a.isFavorite !== !!b.isFavorite) return a.isFavorite ? -1 : 1;
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

  const deleteRecipe = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tradeUserId) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Delete Recipe',
      message: 'Are you sure you want to delete this recipe?',
      confirmLabel: 'Delete',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'trade_users', tradeUserId, 'recipes', id));
          showToast('Recipe deleted successfully', 'success');
        } catch (err: any) {
          showToast('Failed to delete recipe: ' + err.message, 'error');
        }
      }
    });
  };

  const toggleFavorite = async (recipe: Recipe, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!tradeUserId) return;
    await updateDoc(doc(db, 'trade_users', tradeUserId, 'recipes', recipe.id), {
      isFavorite: !recipe.isFavorite
    });
  };

  const handleEditRecipe = (recipe: Recipe) => {
    setEditingRecipeId(recipe.id);
    setNewRecipe({
      title: recipe.title || '',
      ingredients: '',
      instructions: recipe.instructions || '',
      prepTime: recipe.prepTime || '',
      servings: recipe.servings || ''
    });
    setIngredients(recipe.ingredients || []);
    setIsAddingManual(true);
    setSelectedRecipe(null);
  };

  const handleCloseManual = () => {
    setIsAddingManual(false);
    setEditingRecipeId(null);
    setIngredients([]);
    setNewIng('');
    setTargetAudience('all');
    setNewRecipe({ title: '', ingredients: '', instructions: '', prepTime: '', servings: '' });
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeUserId || !newRecipe.title) return;

    const limit = subscriptionTier === 'premium' ? 100 : 10;
    if (!editingRecipeId && recipes.length >= limit) {
      showToast(
        `Recipe limit reached! ${subscriptionTier === 'premium' ? 'Premium tier' : 'You are on the Free tier which'} is limited to ${limit} recipes. ${subscriptionTier === 'free' ? 'Upgrade to Premium for 100 recipes!' : ''}`,
        'error'
      );
      return;
    }

    try {
      if (editingRecipeId) {
        await updateDoc(doc(db, 'trade_users', tradeUserId, 'recipes', editingRecipeId), {
          title: newRecipe.title,
          instructions: newRecipe.instructions,
          prepTime: newRecipe.prepTime,
          servings: newRecipe.servings,
          ingredients: ingredients,
        });
      } else {
        await addDoc(collection(db, 'trade_users', tradeUserId, 'recipes'), {
          title: newRecipe.title,
          instructions: newRecipe.instructions,
          prepTime: newRecipe.prepTime,
          servings: newRecipe.servings,
          ingredients: ingredients,
          isFavorite: false,
          createdAt: new Date().toISOString()
        });
      }

      handleCloseManual();
    } catch (err) {
      console.error('Failed to save manual recipe', err);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      <p className="text-zinc-500 font-medium">Opening the family cookbook...</p>
    </div>
  );

  const adults = members.filter(m => ['Dad', 'Mum', 'Grandparent'].includes(m.role || ''));
  const kids = members.filter(m => ['Son', 'Daughter'].includes(m.role || ''));
  const activeMembers = targetAudience === 'adults' ? adults : targetAudience === 'kids' ? kids : members;

  const allergyWarnings: { name: string; allergy: string }[] = [];
  ingredients.forEach(ing => {
    activeMembers.forEach(m => {
      m.allergies?.forEach(allergy => {
        if (allergy && ing.toLowerCase().includes(allergy.toLowerCase())) {
          allergyWarnings.push({ name: m.name, allergy });
        }
      });
    });
  });

  const uniqueWarnings = allergyWarnings.filter((v, i, a) => 
    a.findIndex(t => t.name === v.name && t.allergy === v.allergy) === i
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between px-1">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input 
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recipes or ingredients..."
            className="w-full pl-11 pr-4 py-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            onClick={() => setIsAddingManual(true)}
            className="flex-1 sm:flex-none px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Create Recipe
          </button>
          <button 
            onClick={onScanRecipe}
            className="flex-1 sm:flex-none px-6 py-3 bg-emerald-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all active:scale-95"
          >
            <Camera className="w-4 h-4" />
            Scan New
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-zinc-500 font-medium">
          Cookbook Capacity: {recipes.length} / {subscriptionTier === 'premium' ? '100' : '10'} recipes
        </p>
      </div>

      {filteredRecipes.length === 0 ? (
        <div className="py-20 text-center bg-zinc-50 dark:bg-zinc-900/50 rounded-[32px] border-2 border-dashed border-zinc-200 dark:border-zinc-800">
          <ChefHat className="w-12 h-12 text-zinc-300 mx-auto mb-4" />
          <p className="text-zinc-500 font-medium">{searchQuery ? 'No recipes match your search' : 'Your family cookbook is empty'}</p>
          <button 
            onClick={onScanRecipe}
            className="mt-4 text-emerald-500 font-bold hover:underline flex items-center gap-2 mx-auto"
          >
            <Sparkles className="w-4 h-4" />
            Add your first recipe
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredRecipes.map((recipe) => (
            <motion.div
              key={recipe.id}
              layout
              onClick={() => setSelectedRecipe(recipe)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden  transition-all cursor-pointer group flex flex-col"
            >
              {recipe.imageUrl ? (
                <div className="aspect-video w-full relative overflow-hidden">
                  <img src={recipe.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt={recipe.title} />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <button 
                    onClick={(e) => toggleFavorite(recipe, e)}
                    className="absolute top-3 right-3 p-2 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white/40 transition-colors"
                  >
                    <Heart className={`w-4 h-4 ${recipe.isFavorite ? 'fill-rose-500 text-rose-500' : ''}`} />
                  </button>
                </div>
              ) : (
                <div className="p-4 flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600">
                    <ChefHat className="w-5 h-5" />
                  </div>
                  <button 
                    onClick={(e) => toggleFavorite(recipe, e)}
                    className={`p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors ${recipe.isFavorite ? 'text-rose-500' : 'text-zinc-400'}`}
                  >
                    <Heart className={`w-4 h-4 ${recipe.isFavorite ? 'fill-current' : ''}`} />
                  </button>
                </div>
              )}
              
              <div className="p-4 space-y-3 flex-1 flex flex-col">
                <div>
                  <h4 className="font-bold text-zinc-900 dark:text-white leading-tight mb-1">{recipe.title}</h4>
                  <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">
                    {recipe.ingredients.length} Ingredients
                  </p>
                </div>

                <div className="flex items-center gap-4 text-[10px] font-bold text-zinc-400 uppercase tracking-widest pt-2">
                  {recipe.prepTime && (
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      {recipe.prepTime}
                    </div>
                  )}
                  {recipe.servings && (
                    <div className="flex items-center gap-1.5">
                      <Users className="w-3 h-3" />
                      {recipe.servings}
                    </div>
                  )}
                </div>

                <div className="pt-4 mt-auto flex gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddToPlan(recipe);
                    }}
                    className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-emerald-600 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    Add to Plan
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditRecipe(recipe);
                    }}
                    className="p-2.5 bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:text-emerald-500 rounded-xl transition-colors border border-transparent hover:border-emerald-100"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={(e) => deleteRecipe(recipe.id, e)}
                    className="p-2.5 bg-zinc-50 dark:bg-zinc-800 text-zinc-400 hover:text-red-500 rounded-xl transition-colors border border-transparent hover:border-red-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Recipe Detail Modal */}
      <AnimatePresence>
        {isAddingManual && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleCloseManual}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-xl bg-white dark:bg-zinc-900 rounded-[32px] overflow-hidden flex flex-col max-h-[90vh] border border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-900 dark:bg-white flex items-center justify-center text-white dark:text-zinc-900">
                    {editingRecipeId ? <Edit className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                  </div>
                  <h3 className="text-xl font-bold text-zinc-900 dark:text-white uppercase tracking-tight">{editingRecipeId ? 'Edit Recipe' : 'Create Recipe'}</h3>
                </div>
                <button onClick={handleCloseManual} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                  <X className="w-6 h-6 text-zinc-400" />
                </button>
              </div>

              <form onSubmit={handleManualSave} className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Recipe Title</label>
                  <div className="flex gap-2">
                    <input 
                      required
                      type="text"
                      value={newRecipe.title}
                      onChange={(e) => setNewRecipe({ ...newRecipe, title: e.target.value })}
                      placeholder="e.g. Sunday Roast Chicken"
                      className="flex-1 p-4 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleAIIngredientsLookup}
                      disabled={isLookingUpIngredients || !newRecipe.title.trim()}
                      className="px-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all disabled:opacity-50"
                    >
                      {isLookingUpIngredients ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Sparkles size={14} className="text-white" />
                      )}
                      <span>AI Lookup</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Who is this for?</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'all', label: 'All Family' },
                      { id: 'adults', label: 'Adults Only' },
                      { id: 'kids', label: 'Kids Only' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setTargetAudience(opt.id as any);
                          const adultsCount = members.filter(m => ['Dad', 'Mum', 'Grandparent'].includes(m.role || '')).length;
                          const kidsCount = members.filter(m => ['Son', 'Daughter'].includes(m.role || '')).length;
                          let val = '';
                          if (opt.id === 'all') {
                            val = `${members.length > 0 ? members.length : 4} people`;
                          } else if (opt.id === 'adults') {
                            val = `${adultsCount > 0 ? adultsCount : 2} adults`;
                          } else if (opt.id === 'kids') {
                            val = `${kidsCount > 0 ? kidsCount : 2} kids`;
                          }
                          setNewRecipe(prev => ({ ...prev, servings: val }));
                        }}
                        className={`py-2.5 rounded-xl border-2 text-[10px] font-bold uppercase transition-all text-center ${
                          targetAudience === opt.id
                            ? 'border-emerald-500 text-emerald-600 bg-zinc-50 dark:bg-zinc-800'
                            : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Prep Time</label>
                    <input 
                      type="text"
                      value={newRecipe.prepTime}
                      onChange={(e) => setNewRecipe({ ...newRecipe, prepTime: e.target.value })}
                      placeholder="e.g. 20 mins"
                      className="w-full p-4 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all text-sm outline-none"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Servings</label>
                    <input 
                      type="text"
                      value={newRecipe.servings}
                      onChange={(e) => setNewRecipe({ ...newRecipe, servings: e.target.value })}
                      placeholder="e.g. 4 people"
                      className="w-full p-4 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all text-sm outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest px-1">Ingredients</label>
                  <div className="flex gap-2">
                    <input 
                      type="text"
                      value={newIng}
                      onChange={(e) => setNewIng(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          if (newIng.trim()) {
                            const lines = newIng.split('\n').map(l => l.trim()).filter(Boolean);
                            setIngredients(prev => [...prev, ...lines]);
                            setNewIng('');
                          }
                        }
                      }}
                      placeholder="Add ingredient (or paste multiple lines) and press Enter"
                      className="flex-1 p-4 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all text-sm outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (newIng.trim()) {
                          const lines = newIng.split('\n').map(l => l.trim()).filter(Boolean);
                          setIngredients(prev => [...prev, ...lines]);
                          setNewIng('');
                        }
                      }}
                      className="p-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 rounded-2xl font-bold transition-all"
                    >
                      <Plus className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="max-h-60 overflow-y-auto space-y-1.5 mt-2 p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-100 dark:border-zinc-800">
                    {ingredients.length === 0 ? (
                      <p className="text-xs text-zinc-400 p-3 italic text-center">No ingredients added yet.</p>
                    ) : (
                      ingredients.map((ing, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2.5 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-100 dark:border-zinc-800">
                          <span className="text-sm text-zinc-700 dark:text-zinc-300">{ing}</span>
                          <button
                            type="button"
                            onClick={() => setIngredients(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-zinc-400 hover:text-red-500 rounded-lg transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {uniqueWarnings.length > 0 && (
                  <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-2xl flex items-start gap-3 text-xs text-amber-800 dark:text-amber-300">
                    <ShieldAlert className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                    <div>
                      <span className="font-bold uppercase tracking-wider text-[10px]">Allergy Warnings Flagged</span>
                      <ul className="list-disc pl-4 mt-1.5 space-y-1">
                        {uniqueWarnings.map((w, idx) => (
                          <li key={idx}><strong>{w.name}</strong> is allergic to <strong>{w.allergy}</strong></li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <label className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Instructions</label>
                    <button
                      type="button"
                      onClick={handleAICookingInstructions}
                      disabled={isGeneratingInstructions || !newRecipe.title.trim()}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all disabled:opacity-50 active:scale-95"
                    >
                      {isGeneratingInstructions ? (
                        <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Sparkles size={12} className="text-white" />
                      )}
                      <span>AI Instructions</span>
                    </button>
                  </div>
                  <textarea 
                    rows={6}
                    value={newRecipe.instructions}
                    onChange={(e) => setNewRecipe({ ...newRecipe, instructions: e.target.value })}
                    placeholder="Describe how to make it..."
                    className="w-full p-4 bg-zinc-50 dark:bg-zinc-800 border-none rounded-2xl focus:ring-2 focus:ring-zinc-900 dark:focus:ring-white transition-all resize-none text-sm outline-none"
                  />
                </div>

                <div className="pt-4">
                  <button 
                    type="submit"
                    className="w-full py-4 bg-emerald-500 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-3"
                  >
                    <Save className="w-4 h-4" /> {editingRecipeId ? 'Update Recipe' : 'Save to Cookbook'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {selectedRecipe && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedRecipe(null)}
              className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-[32px] overflow-hidden flex flex-col max-h-[85vh] border border-zinc-200 dark:border-zinc-800"
            >
              <div className="p-6 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center text-white">
                    <ChefHat className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-white leading-tight">{selectedRecipe.title}</h3>
                    <div className="flex items-center gap-3 text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                      {selectedRecipe.prepTime && <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {selectedRecipe.prepTime}</span>}
                      {selectedRecipe.servings && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {selectedRecipe.servings}</span>}
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedRecipe(null)} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors">
                  <X className="w-6 h-6 text-zinc-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 sm:p-10 space-y-8">
                {selectedRecipe.imageUrl && (
                  <img src={selectedRecipe.imageUrl} className="w-full aspect-video object-cover rounded-3xl mb-8" alt={selectedRecipe.title} />
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <div className="md:col-span-1 space-y-4">
                    <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">Ingredients</h4>
                    <ul className="space-y-3">
                      {selectedRecipe.ingredients.map((ing, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-zinc-700 dark:text-zinc-300">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                          {ing}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="md:col-span-2 space-y-4">
                    <h4 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em]">Instructions</h4>
                    {selectedRecipe.instructions ? (
                      <div className="prose dark:prose-invert max-w-none">
                        <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">
                          {selectedRecipe.instructions}
                        </p>
                      </div>
                    ) : (
                      <div className="py-8 text-center bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border-2 border-dashed border-zinc-100 dark:border-zinc-800">
                        <Utensils className="w-8 h-8 text-zinc-200 mx-auto mb-2" />
                        <p className="text-xs text-zinc-400 uppercase tracking-widest font-bold">No instructions saved</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-zinc-50 dark:bg-zinc-800/50 border-t border-zinc-100 dark:border-zinc-800 flex gap-3">
                <button 
                  onClick={() => {
                    handleEditRecipe(selectedRecipe);
                  }}
                  className="px-6 py-4 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-2xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider"
                >
                  <Edit className="w-4 h-4" />
                  Edit Recipe
                </button>
                <button 
                  onClick={() => {
                    onAddToPlan(selectedRecipe);
                    setSelectedRecipe(null);
                  }}
                  className="flex-1 py-4 bg-emerald-500 text-white font-black text-xs uppercase tracking-[0.2em] rounded-2xl hover:bg-emerald-600 transition-all flex items-center justify-center gap-3"
                >
                  <Calendar className="w-4 h-4" />
                  Add to Weekly Plan
                </button>
                {selectedRecipe.sourceUrl && (
                  <a 
                    href={selectedRecipe.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-4 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-2xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 transition-all"
                  >
                    <ExternalLink className="w-5 h-5" />
                  </a>
                )}
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
        variant={confirmConfig.variant}
        onConfirm={confirmConfig.onConfirm}
        onClose={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

function Loader2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
