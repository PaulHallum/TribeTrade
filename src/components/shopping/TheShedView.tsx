import { useState, useEffect } from 'react';
import { 
  Warehouse, 
  Plus, 
  Trash2, 
  Search, 
  Minus, 
  ShoppingCart, 
  Package, 
  AlertTriangle,
  Layers,
  ArrowRight
} from 'lucide-react';
import { db } from '../../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp 
} from 'firebase/firestore';
import { useAuth } from '../../App';
import { useToast } from '../../contexts/ToastContext';
import { detectCategory } from '../../lib/shoppingUtils';
import ConfirmModal from '../common/ConfirmModal';

export interface ShedStockItem {
  id: string;
  name: string;
  quantity: number;
  category?: string;
  unit?: string;
  createdAt?: any;
  updatedAt?: any;
}

interface TheShedViewProps {
  onSwitchToPickList?: () => void;
}

export default function TheShedView({ onSwitchToPickList }: TheShedViewProps) {
  const { tradeUserId } = useAuth();
  const { showToast } = useToast();

  const [stock, setStock] = useState<ShedStockItem[]>([]);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
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

  useEffect(() => {
    if (!tradeUserId) return;
    const shedRef = collection(db, 'trade_users', tradeUserId, 'shedInventory');
    const unsubscribe = onSnapshot(shedRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ShedStockItem[];
      // Sort alphabetically by name
      list.sort((a, b) => a.name.localeCompare(b.name));
      setStock(list);
    });

    return () => unsubscribe();
  }, [tradeUserId]);

  const handleAddStock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName || !tradeUserId) return;

    const parsedQty = Math.max(0, parseFloat(String(quantity)) || 0.5);
    const category = detectCategory(trimmedName);

    try {
      const shedRef = collection(db, 'trade_users', tradeUserId, 'shedInventory');
      await addDoc(shedRef, {
        name: trimmedName,
        quantity: parsedQty,
        category,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setName('');
      setQuantity(1);
      showToast(`Added ${parsedQty}x "${trimmedName}" to The Shed`, 'success');
    } catch (err: any) {
      showToast('Failed to add stock item: ' + err.message, 'error');
    }
  };

  const handleUpdateQuantity = async (item: ShedStockItem, newQty: number) => {
    if (!tradeUserId) return;
    const finalQty = Math.max(0, newQty);
    try {
      await updateDoc(doc(db, 'trade_users', tradeUserId, 'shedInventory', item.id), {
        quantity: finalQty,
        updatedAt: serverTimestamp()
      });
    } catch (err: any) {
      showToast('Failed to update quantity: ' + err.message, 'error');
    }
  };

  const handleDeleteItem = (item: ShedStockItem) => {
    if (!tradeUserId) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Remove Stock Item',
      message: `Are you sure you want to remove "${item.name}" from The Shed?`,
      confirmLabel: 'Remove',
      variant: 'danger',
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'trade_users', tradeUserId, 'shedInventory', item.id));
          showToast(`Removed "${item.name}"`, 'info');
        } catch (err: any) {
          showToast('Failed to delete item: ' + err.message, 'error');
        }
      }
    });
  };

  const handleSendToPickList = async (item: ShedStockItem) => {
    if (!tradeUserId) return;
    try {
      const shoppingRef = collection(db, 'trade_users', tradeUserId, 'shoppingList');
      await addDoc(shoppingRef, {
        name: item.name,
        checked: false,
        category: item.category || detectCategory(item.name),
        createdAt: serverTimestamp()
      });
      showToast(`Added "${item.name}" to Shopping List (1-click)`, 'success');
    } catch (err: any) {
      showToast('Failed to add to shopping list: ' + err.message, 'error');
    }
  };

  const totalItems = stock.length;
  const totalUnits = stock.reduce((acc, curr) => acc + (Number(curr.quantity) || 0), 0);
  const outOfStockCount = stock.filter(i => (Number(i.quantity) || 0) === 0).length;
  const lowStockCount = stock.filter(i => {
    const q = Number(i.quantity) || 0;
    return q > 0 && q <= 2;
  }).length;
  const lowOrOutItems = stock.filter(i => (Number(i.quantity) || 0) <= 2);

  const handleAddAllLowStockToShoppingList = async () => {
    if (!tradeUserId || lowOrOutItems.length === 0) return;
    try {
      const shoppingRef = collection(db, 'trade_users', tradeUserId, 'shoppingList');
      for (const item of lowOrOutItems) {
        await addDoc(shoppingRef, {
          name: item.name,
          checked: false,
          category: item.category || detectCategory(item.name),
          createdAt: serverTimestamp()
        });
      }
      showToast(`Added ${lowOrOutItems.length} low stock items to Shopping List!`, 'success');
    } catch (err: any) {
      showToast('Failed to add items to shopping list: ' + err.message, 'error');
    }
  };

  const categories = Array.from(new Set(stock.map(i => i.category || 'General Materials')));

  const filteredStock = stock.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.category && item.category.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesCategory = filterCategory === 'all' || (item.category || 'General Materials') === filterCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs font-semibold">
            <Warehouse className="w-3.5 h-3.5 text-emerald-600" />
            Stock Lines
          </div>
          <p className="text-xl font-black text-zinc-900 dark:text-white mt-1">{totalItems}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs font-semibold">
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            Total Units
          </div>
          <p className="text-xl font-black text-zinc-900 dark:text-white mt-1">{totalUnits}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-3.5 rounded-2xl">
          <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 text-xs font-semibold">
            <AlertTriangle className={`w-3.5 h-3.5 ${outOfStockCount > 0 ? 'text-red-500' : 'text-zinc-400'}`} />
            Out of Stock
          </div>
          <p className={`text-xl font-black mt-1 ${outOfStockCount > 0 ? 'text-red-500' : 'text-zinc-900 dark:text-white'}`}>
            {outOfStockCount}
          </p>
        </div>
      </div>

      {/* Low Stock Reorder Banner */}
      {lowOrOutItems.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-2xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200 truncate">
              {lowOrOutItems.length} item{lowOrOutItems.length > 1 ? 's are' : ' is'} low or out of stock in The Shed
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddAllLowStockToShoppingList}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 active:scale-95 text-white rounded-xl text-xs font-bold shrink-0 flex items-center gap-1.5 shadow-sm transition-all"
            title="Add all low stock items to shopping list"
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Buy All Low Stock</span>
          </button>
        </div>
      )}

      {/* Add Stock Form */}
      <form onSubmit={handleAddStock} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-3xl shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-wider text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
            <Warehouse className="w-4 h-4 text-emerald-600" /> Log Stock Holding in The Shed
          </h3>
          <span className="text-[11px] text-zinc-400">Company Held Inventory</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Stock item name (e.g. 15mm Copper Elbows, Dulux White 5L, M8 Bolts)..."
            className="flex-1 px-4 py-3 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-zinc-900 dark:text-white placeholder:text-zinc-400"
          />

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700/80 rounded-2xl px-3 py-1.5 shrink-0">
              <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400 mr-2">Qty:</span>
              <input
                type="number"
                min="0"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-16 bg-transparent text-sm font-black text-center text-zinc-900 dark:text-white outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={!name.trim()}
              className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span className="text-xs font-black uppercase tracking-wider">Add to Shed</span>
            </button>
          </div>
        </div>
      </form>

      {/* Search & Category Filter */}
      {stock.length > 0 && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search company stock in The Shed..."
              className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-xs focus:ring-2 focus:ring-emerald-500 outline-none text-zinc-900 dark:text-white placeholder:text-zinc-400 shadow-sm"
            />
          </div>

          {categories.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setFilterCategory('all')}
                className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  filterCategory === 'all'
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                All Stock ({stock.length})
              </button>
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                    filterCategory === cat
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stock Items List */}
      <div className="space-y-3">
        {filteredStock.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-10 text-center border border-zinc-200 dark:border-zinc-800 space-y-3">
            <Warehouse className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto" />
            <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">
              {searchQuery ? 'No stock matching search' : 'The Shed is currently empty'}
            </h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              {searchQuery
                ? 'Try a different search term or clear the filter.'
                : 'Log materials, tools, fixings and fittings that your business currently holds in storage or your van.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredStock.map(item => {
              const qty = Number(item.quantity) || 0;
              const isOut = qty === 0;
              const isLow = qty > 0 && qty <= 2;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3 ${
                    isOut
                      ? 'bg-red-50/40 dark:bg-red-950/15 border-red-200/60 dark:border-red-900/30'
                      : isLow
                      ? 'bg-amber-50/40 dark:bg-amber-950/15 border-amber-200/60 dark:border-amber-900/30'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                        {item.name}
                      </h4>
                      <div className="flex items-center gap-2 mt-1">
                        {item.category && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            {item.category}
                          </span>
                        )}
                        {isOut && (
                          <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded">
                            Out of Stock
                          </span>
                        )}
                        {isLow && (
                          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
                            Low ({qty} left)
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => handleDeleteItem(item)}
                      className="text-zinc-400 hover:text-red-500 p-1 transition-colors"
                      title="Delete from The Shed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Quantity Stepper & Quick Actions */}
                  <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
                    <div className="flex items-center gap-1.5 bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl">
                      <button
                        onClick={() => {
                          const step = qty <= 1 ? 0.5 : 1;
                          handleUpdateQuantity(item, Math.max(0, Number((qty - step).toFixed(2))));
                        }}
                        disabled={qty <= 0}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 disabled:opacity-30 hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors shadow-xs"
                        title="Reduce quantity"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={qty}
                        onChange={(e) => handleUpdateQuantity(item, Math.max(0, parseFloat(e.target.value) || 0))}
                        className="w-12 text-center text-sm font-black text-zinc-900 dark:text-white bg-transparent outline-none"
                      />
                      <button
                        onClick={() => {
                          const step = qty < 1 ? 0.5 : 1;
                          handleUpdateQuantity(item, Number((qty + step).toFixed(2)));
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors shadow-xs"
                        title="Increase quantity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      onClick={() => handleSendToPickList(item)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all active:scale-95 ${
                        isLow || isOut
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                          : 'text-zinc-600 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                      }`}
                      title="Add to shopping list in one click"
                    >
                      <ShoppingCart className="w-3.5 h-3.5" />
                      <span>Buy More</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
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
