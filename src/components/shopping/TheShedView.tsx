import { useState, useEffect, useMemo } from 'react';
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
  ArrowRight,
  Briefcase,
  Loader2,
  Star
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
import AssignStockModal from './AssignStockModal';
import { subscribeShedAllocations, ShedAllocationRecord, ShedStockItem } from '../../services/shedService';

interface TheShedViewProps {
  onSwitchToPickList?: () => void;
}

export default function TheShedView({ onSwitchToPickList }: TheShedViewProps) {
  const { tradeUserId } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'stock' | 'allocations'>('stock');
  const [stock, setStock] = useState<ShedStockItem[]>([]);
  const [allocations, setAllocations] = useState<ShedAllocationRecord[]>([]);
  const [loadingAllocations, setLoadingAllocations] = useState(false);
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState<number | string>(1);
  const [isKeyItem, setIsKeyItem] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [assignModalItem, setAssignModalItem] = useState<ShedStockItem | null>(null);
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
    const unsubscribeStock = onSnapshot(shedRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ShedStockItem[];
      // Sort alphabetically by name
      list.sort((a, b) => a.name.localeCompare(b.name));
      setStock(list);
    });

    const unsubscribeAllocations = subscribeShedAllocations(tradeUserId, (records) => {
      setAllocations(records);
      setLoadingAllocations(false);
    });

    return () => {
      unsubscribeStock();
      unsubscribeAllocations();
    };
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
        isKeyItem,
        reservedQuantity: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setName('');
      setQuantity(1);
      setIsKeyItem(false);
      showToast(`Added ${parsedQty}x "${trimmedName}" to The Shed`, 'success');
    } catch (err: any) {
      showToast('Failed to add stock item: ' + err.message, 'error');
    }
  };

  const handleToggleKeyItem = async (item: ShedStockItem) => {
    if (!tradeUserId) return;
    try {
      const newKeyVal = !item.isKeyItem;
      await updateDoc(doc(db, 'trade_users', tradeUserId, 'shedInventory', item.id), {
        isKeyItem: newKeyVal,
        updatedAt: serverTimestamp()
      });
      showToast(newKeyVal ? `Marked "${item.name}" as Key Item` : `Unmarked "${item.name}" as Key Item`, 'info');
    } catch (err: any) {
      showToast('Failed to update: ' + err.message, 'error');
    }
  };

  const handleUpdateQuantity = async (item: ShedStockItem, newQty: number) => {
    if (!tradeUserId) return;
    const finalQty = Math.max(0, newQty);
    try {
      if (finalQty <= 0 && !item.isKeyItem) {
        await deleteDoc(doc(db, 'trade_users', tradeUserId, 'shedInventory', item.id));
        showToast(`Used up "${item.name}" (removed from The Shed)`, 'info');
      } else {
        await updateDoc(doc(db, 'trade_users', tradeUserId, 'shedInventory', item.id), {
          quantity: finalQty,
          updatedAt: serverTimestamp()
        });
      }
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
  const outOfStockCount = stock.filter(i => {
    const q = Number(i.quantity) || 0;
    const reserved = Number(i.reservedQuantity || reservedMap[i.id] || 0);
    return Math.max(0, q - reserved) <= 0;
  }).length;
  const lowStockCount = stock.filter(i => {
    const q = Number(i.quantity) || 0;
    const reserved = Number(i.reservedQuantity || reservedMap[i.id] || 0);
    const avail = Math.max(0, q - reserved);
    return avail > 0 && avail <= 2;
  }).length;
  const lowOrOutItems = stock.filter(i => {
    const q = Number(i.quantity) || 0;
    const reserved = Number(i.reservedQuantity || reservedMap[i.id] || 0);
    return Math.max(0, q - reserved) <= 2;
  });

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

  // Map of reserved quantities per stock item from job allocations
  const reservedMap = useMemo(() => {
    const map: { [stockItemId: string]: number } = {};
    for (const a of allocations) {
      if (a.stockItemId) {
        map[a.stockItemId] = Number(((map[a.stockItemId] || 0) + (Number(a.quantity) || 0)).toFixed(2));
      }
    }
    return map;
  }, [allocations]);

  // Group allocations by target job/invoice
  const allocationsByJob = useMemo(() => {
    const groups: { [key: string]: { jobTitle: string; customerName?: string; targetType: string; items: ShedAllocationRecord[] } } = {};
    for (const alloc of allocations) {
      const key = alloc.targetId || alloc.jobTitle;
      if (!groups[key]) {
        groups[key] = {
          jobTitle: alloc.jobTitle,
          customerName: alloc.customerName,
          targetType: alloc.targetType,
          items: []
        };
      }
      groups[key].items.push(alloc);
    }
    return Object.values(groups);
  }, [allocations]);

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

      {/* View Switcher: Stock Inventory vs Job Allocations */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2">
        <button
          onClick={() => setActiveTab('stock')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'stock'
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <Warehouse className="w-3.5 h-3.5" />
          <span>Shed Stock ({totalItems})</span>
        </button>
        <button
          onClick={() => {
            setActiveTab('allocations');
            fetchAllocations();
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'allocations'
              ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 shadow-sm'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <Briefcase className="w-3.5 h-3.5" />
          <span>Allocated to Jobs {allocations.length > 0 && `(${allocations.length})`}</span>
        </button>
      </div>

      {activeTab === 'allocations' ? (
        <div className="space-y-3">
          {loadingAllocations ? (
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-10 text-center border border-zinc-200 dark:border-zinc-800">
              <Loader2 className="w-6 h-6 animate-spin text-zinc-400 mx-auto" />
              <p className="text-xs text-zinc-500 mt-2">Loading job allocations...</p>
            </div>
          ) : allocations.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 rounded-3xl p-10 text-center border border-zinc-200 dark:border-zinc-800 space-y-2">
              <Briefcase className="w-10 h-10 text-zinc-300 dark:text-zinc-700 mx-auto" />
              <h4 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">No stock allocated to jobs yet</h4>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                When you use materials on client jobs, quotes, or invoices, click "Assign to Job" on any stock item to deduct holding stock and log the allocation.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {allocations.map((alloc) => (
                <div
                  key={alloc.id}
                  className="p-4 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                        {alloc.targetType === 'quote' ? 'Quote' : alloc.targetType === 'invoice' ? 'Invoice' : 'Custom Job'}
                      </span>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                        {alloc.jobTitle}
                      </h4>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {alloc.quantity} {alloc.unit || 'units'} of {alloc.stockItemName}
                      </span>
                      {alloc.customerName && <span>• Client: {alloc.customerName}</span>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800">
                    <div className="text-right">
                      <span className="text-[10px] font-bold text-zinc-400 block">Charged</span>
                      <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                        {alloc.totalCharged > 0 ? `£${alloc.totalCharged.toFixed(2)}` : 'Included in Job'}
                      </span>
                    </div>
                    <span className="text-[11px] text-zinc-400 whitespace-nowrap">
                      {new Date(alloc.allocatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
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

        <div className="flex items-center justify-between pt-1 border-t border-zinc-100 dark:border-zinc-800/60">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={isKeyItem}
              onChange={(e) => setIsKeyItem(e.target.checked)}
              className="rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
            />
            <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
              <Star className={`w-3.5 h-3.5 ${isKeyItem ? 'text-amber-500 fill-amber-500' : 'text-zinc-400'}`} />
              <span>Key Item (Permanent staple — never auto-removed, flags on Hub when out of stock)</span>
            </span>
          </label>
          <span className="text-[10px] text-zinc-400 hidden sm:inline">
            Non-key items auto-delete when depleted to 0
          </span>
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
              const reserved = Number(item.reservedQuantity || reservedMap[item.id] || 0);
              const available = Math.max(0, Number((qty - reserved).toFixed(2)));
              const isOut = available <= 0;
              const isLow = available > 0 && available <= 2;
              const isKey = Boolean(item.isKeyItem);

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
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white truncate">
                          {item.name}
                        </h4>
                        {isKey && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 shrink-0">
                            <Star className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                            Key Item
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {item.category && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                            {item.category}
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
                          Available: {available} {item.unit || ''}
                        </span>
                        {reserved > 0 && (
                          <span className="text-[10px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800/40 px-1.5 py-0.5 rounded">
                            {reserved} reserved
                          </span>
                        )}
                        {isOut && (
                          <span className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/40 px-1.5 py-0.5 rounded">
                            {qty > 0 ? 'All Reserved' : 'Out of Stock'}
                          </span>
                        )}
                        {isLow && (
                          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 rounded">
                            Low ({available} left)
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleToggleKeyItem(item)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          isKey
                            ? 'text-amber-500 hover:text-amber-600 bg-amber-50 dark:bg-amber-950/40'
                            : 'text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                        title={isKey ? 'Key Item (stays in Shed when 0) - click to unmark' : 'Mark as Key Item (stays in Shed when 0)'}
                      >
                        <Star className={`w-4 h-4 ${isKey ? 'fill-amber-500' : ''}`} />
                      </button>
                      <button
                        onClick={() => handleDeleteItem(item)}
                        className="text-zinc-400 hover:text-red-500 p-1.5 transition-colors"
                        title="Delete from The Shed"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
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

                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      <button
                        onClick={() => setAssignModalItem(item)}
                        disabled={available <= 0}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition-all active:scale-95 text-zinc-700 dark:text-zinc-200 hover:text-blue-600 dark:hover:text-blue-400 bg-zinc-100 dark:bg-zinc-800 hover:bg-blue-50 dark:hover:bg-blue-950/30 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Assign stock to a Quote, Invoice, or Job"
                      >
                        <Briefcase className="w-3.5 h-3.5" />
                        <span>Assign to Job</span>
                      </button>

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
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reserved / Allocated Stock Grouped by Job */}
      <div className="pt-6 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider text-zinc-900 dark:text-white flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Reserved & Allocated Stock by Job
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Stock items dedicated or reserved for active trade jobs and invoices
            </p>
          </div>
          {allocations.length > 0 && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              {allocations.length} allocated item{allocations.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {allocationsByJob.length === 0 ? (
          <div className="p-6 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-center">
            <p className="text-xs text-zinc-400">
              No stock is currently reserved for any jobs. Click "Assign to Job" on any stock item above to allocate materials to a trade invoice.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {allocationsByJob.map((jobGroup, idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
                  <div className="min-w-0">
                    <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 mr-2">
                      {jobGroup.targetType === 'invoice' ? 'Invoice' : 'Direct Job'}
                    </span>
                    <h4 className="text-xs font-bold text-zinc-900 dark:text-white truncate inline">
                      {jobGroup.jobTitle}
                    </h4>
                    {jobGroup.customerName && (
                      <p className="text-[11px] text-zinc-500 mt-0.5">
                        Client: {jobGroup.customerName}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {jobGroup.items.map((it, itemIdx) => (
                    <div
                      key={it.id || itemIdx}
                      className="flex items-center justify-between text-xs py-1.5 px-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-100 dark:border-zinc-800"
                    >
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {it.stockItemName}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-blue-600 dark:text-blue-400">
                          {it.quantity} {it.unit || 'units'} reserved
                        </span>
                        {it.totalCharged > 0 && (
                          <span className="text-[10px] text-zinc-400">
                            (£{it.totalCharged.toFixed(2)})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </>
      )}

      {/* Assign Stock to Job Modal */}
      <AssignStockModal
        isOpen={Boolean(assignModalItem)}
        item={assignModalItem}
        tradeUserId={tradeUserId || ''}
        onClose={() => setAssignModalItem(null)}
      />

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
