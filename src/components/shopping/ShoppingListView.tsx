import { useState, useEffect, useRef } from 'react';
import { 
  Package, 
  Plus, 
  Trash2, 
  Check, 
  Share2, 
  ExternalLink, 
  Search, 
  Wrench, 
  Paintbrush, 
  Hammer, 
  SlidersHorizontal,
  X,
  CheckCircle2,
  Circle,
  Warehouse,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import TheShedView from './TheShedView';
import { db } from '../../lib/firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { useAuth } from '../../App';
import { useToast } from '../../contexts/ToastContext';
import { detectCategory, splitBulkItems } from '../../lib/shoppingUtils';
import PageHeader from '../common/PageHeader';
import ConfirmModal from '../common/ConfirmModal';

export interface TradeSupplyItem {
  id: string;
  name: string;
  checked: boolean;
  category?: string;
  quantity?: string;
  createdAt?: any;
}

export const TRADE_SUPPLIERS = [
  { id: 'screwfix', name: 'Screwfix', url: 'https://www.screwfix.com/search?search=' },
  { id: 'toolstation', name: 'Toolstation', url: 'https://www.toolstation.com/search?q=' },
  { id: 'travisperkins', name: 'Travis Perkins', url: 'https://www.travisperkins.co.uk/search?text=' },
  { id: 'tradepoint', name: 'TradePoint (B&Q)', url: 'https://www.diy.com/search?term=' },
  { id: 'wickes', name: 'Wickes', url: 'https://www.wickes.co.uk/search?text=' },
  { id: 'dulux', name: 'Dulux Decorator Centre', url: 'https://www.duluxdecoratorcentre.co.uk/search?query=' },
];

export default function ShoppingListView() {
  const { tradeUserId } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'picklist' | 'shed'>('picklist');
  const [items, setItems] = useState<TradeSupplyItem[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<string>(() => {
    return localStorage.getItem('tribetrade_preferred_supplier') || 'screwfix';
  });
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const merchantScrollRef = useRef<HTMLDivElement>(null);

  const scrollMerchants = (direction: 'left' | 'right') => {
    if (merchantScrollRef.current) {
      merchantScrollRef.current.scrollBy({
        left: direction === 'left' ? -160 : 160,
        behavior: 'smooth'
      });
    }
  };
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
    const shoppingRef = collection(db, 'trade_users', tradeUserId, 'shoppingList');
    const unsubscribe = onSnapshot(shoppingRef, (snapshot) => {
      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as TradeSupplyItem[];
      setItems(list);
    });

    return () => unsubscribe();
  }, [tradeUserId]);

  const handleSelectSupplier = (id: string) => {
    setSelectedSupplier(id);
    localStorage.setItem('tribetrade_preferred_supplier', id);
  };

  const handleAddItem = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = newItemText.trim();
    if (!raw || !tradeUserId) return;

    const splitItems = splitBulkItems(raw);
    const toAdd = splitItems.length > 0 ? splitItems : [raw];

    try {
      const shoppingRef = collection(db, 'trade_users', tradeUserId, 'shoppingList');
      for (const item of toAdd) {
        const cat = detectCategory(item);
        await addDoc(shoppingRef, {
          name: item,
          checked: false,
          category: cat,
          createdAt: serverTimestamp()
        });
      }
      setNewItemText('');
      showToast(toAdd.length > 1 ? `Added ${toAdd.length} items to pick list` : `Added "${toAdd[0]}"`, 'success');
    } catch (err: any) {
      showToast('Failed to add item: ' + err.message, 'error');
    }
  };

  const handleToggleCheck = async (item: TradeSupplyItem) => {
    if (!tradeUserId) return;
    try {
      await updateDoc(doc(db, 'trade_users', tradeUserId, 'shoppingList', item.id), {
        checked: !item.checked
      });
    } catch (err: any) {
      showToast('Error updating item: ' + err.message, 'error');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!tradeUserId) return;
    try {
      await deleteDoc(doc(db, 'trade_users', tradeUserId, 'shoppingList', id));
    } catch (err: any) {
      showToast('Error deleting item: ' + err.message, 'error');
    }
  };

  const handleClearCompleted = async () => {
    if (!tradeUserId) return;
    const completed = items.filter(i => i.checked);
    if (completed.length === 0) return;

    setConfirmConfig({
      isOpen: true,
      title: 'Clear Picked Items',
      message: `Remove all ${completed.length} completed items from your materials pick list?`,
      confirmLabel: 'Clear Picked',
      variant: 'warning',
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          completed.forEach(item => {
            batch.delete(doc(db, 'trade_users', tradeUserId, 'shoppingList', item.id));
          });
          await batch.commit();
          showToast('Completed items cleared', 'info');
        } catch (err: any) {
          showToast('Failed to clear items: ' + err.message, 'error');
        }
      }
    });
  };

  const handleClearAll = async () => {
    if (!tradeUserId || items.length === 0) return;
    setConfirmConfig({
      isOpen: true,
      title: 'Wipe Pick List',
      message: 'Are you sure you want to delete all items from your supplies list?',
      confirmLabel: 'Clear All',
      variant: 'danger',
      onConfirm: async () => {
        try {
          const batch = writeBatch(db);
          items.forEach(item => {
            batch.delete(doc(db, 'trade_users', tradeUserId, 'shoppingList', item.id));
          });
          await batch.commit();
          showToast('All items cleared', 'info');
        } catch (err: any) {
          showToast('Failed to clear list: ' + err.message, 'error');
        }
      }
    });
  };

  const handleSearchMerchant = (itemName: string) => {
    const supplier = TRADE_SUPPLIERS.find(s => s.id === selectedSupplier) || TRADE_SUPPLIERS[0];
    const url = `${supplier.url}${encodeURIComponent(itemName)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleShareList = async () => {
    const active = items.filter(i => !i.checked);
    if (active.length === 0) {
      showToast('No unchecked items to share', 'info');
      return;
    }

    const text = `🛠️ TribeTrade Materials Pick List:\n\n` + 
      active.map(i => `• ${i.name} (${i.category || 'Materials'})`).join('\n') +
      `\n\nGenerated via TribeTrade`;

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'TribeTrade Supplies List',
          text: text
        });
        showToast('List shared', 'success');
      } catch (err) {
        // Fallback to copy
        copyToClipboard(text);
      }
    } else {
      copyToClipboard(text);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    showToast('Materials list copied to clipboard!', 'success');
  };

  const uncheckedCount = items.filter(i => !i.checked).length;
  const categories = Array.from(new Set(items.map(i => i.category || 'General Materials')));

  const filteredItems = items.filter(i => {
    if (filterCategory === 'all') return true;
    return (i.category || 'General Materials') === filterCategory;
  });

  return (
    <div className="max-w-4xl mx-auto pb-32 px-4 space-y-6">
      <PageHeader
        icon={activeTab === 'shed' ? Warehouse : Package}
        title={activeTab === 'shed' ? 'The Shed' : 'Trade Supplies & Materials'}
        subtitle={activeTab === 'shed' ? 'Company stock holding & materials inventory' : 'Tools, paint, fixings & supplier pick lists'}
      >
        <div className="flex items-center gap-2">
          {activeTab === 'picklist' && items.length > 0 && (
            <>
              <button
                onClick={handleShareList}
                className="p-2.5 bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-2xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                title="Share or Copy List"
              >
                <Share2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleClearAll}
                className="p-2.5 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-2xl hover:bg-red-100 dark:hover:bg-red-900/40 transition-all"
                title="Clear entire list"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </PageHeader>

      {/* Sub-tab Navigation */}
      <div className="flex bg-zinc-100 dark:bg-zinc-800/80 p-1.5 rounded-2xl border border-zinc-200/80 dark:border-zinc-700/80 gap-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('picklist')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'picklist'
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          <Package className="w-4 h-4 text-emerald-600" />
          <span>Materials Shopping List</span>
          {uncheckedCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-black rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
              {uncheckedCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('shed')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'shed'
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
              : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
          }`}
        >
          <Warehouse className="w-4 h-4 text-emerald-600" />
          <span>The Shed (Stock Holding)</span>
        </button>
      </div>

      {activeTab === 'shed' ? (
        <TheShedView onSwitchToPickList={() => setActiveTab('picklist')} />
      ) : (
        <>
          {/* Supplier Selector Bar */}
      <div className="bg-white dark:bg-zinc-900 p-4 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
            <Wrench className="w-3.5 h-3.5 text-emerald-600" /> Default Merchant Search:
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrollMerchants('left')}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              title="Scroll left"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollMerchants('right')}
              className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              title="Scroll right"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div ref={merchantScrollRef} className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none no-scrollbar scroll-smooth">
          {TRADE_SUPPLIERS.map(sup => (
            <button
              key={sup.id}
              onClick={() => handleSelectSupplier(sup.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedSupplier === sup.id
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {sup.name}
            </button>
          ))}
        </div>
      </div>

      {/* Fast Input Form */}
      <form onSubmit={handleAddItem} className="flex gap-2">
        <div className="relative flex-1">
          <input
            type="text"
            value={newItemText}
            onChange={(e) => setNewItemText(e.target.value)}
            placeholder="Add material or tool (e.g. 5L Brilliant White, 50mm screws, 15mm copper pipe)..."
            className="w-full pl-4 pr-10 py-3.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-zinc-900 dark:text-white placeholder:text-zinc-400 shadow-sm"
          />
          {newItemText && (
            <button
              type="button"
              onClick={() => setNewItemText('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          type="submit"
          disabled={!newItemText.trim()}
          className="px-5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-2xl flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95 shrink-0"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline text-xs font-black uppercase tracking-wider">Add</span>
        </button>
      </form>

      {/* Category Filter Pills */}
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
            All Items ({items.length})
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

      {/* Items List */}
      <div className="space-y-4">
        {filteredItems.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-12 text-center border border-zinc-200 dark:border-zinc-800 space-y-3">
            <Package className="w-12 h-12 text-zinc-300 dark:text-zinc-700 mx-auto" />
            <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Materials pick list is clear</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Add materials, fixings, tools, or paint above. You can also paste bulk lists copied from WhatsApp or site notes.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredItems.map(item => (
              <div
                key={item.id}
                className={`flex items-center justify-between gap-3 p-3.5 rounded-2xl border transition-all ${
                  item.checked
                    ? 'bg-zinc-50 dark:bg-zinc-900/40 border-zinc-200/60 dark:border-zinc-800/40 opacity-60'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm'
                }`}
              >
                <div 
                  onClick={() => handleToggleCheck(item)}
                  className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                >
                  <button
                    type="button"
                    className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-colors shrink-0 ${
                      item.checked
                        ? 'bg-emerald-500 border-emerald-500 text-white'
                        : 'border-zinc-300 dark:border-zinc-600 hover:border-emerald-500'
                    }`}
                  >
                    {item.checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </button>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${
                      item.checked
                        ? 'line-through text-zinc-400 dark:text-zinc-500'
                        : 'text-zinc-900 dark:text-white'
                    }`}>
                      {item.name}
                    </p>
                    {item.category && (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                        {item.category}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleSearchMerchant(item.name)}
                    className="p-2 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                    title={`Search on ${TRADE_SUPPLIERS.find(s => s.id === selectedSupplier)?.name}`}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteItem(item.id)}
                    className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
                    title="Delete item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Clear Completed Action */}
        {items.some(i => i.checked) && (
          <div className="pt-2 flex justify-end">
            <button
              onClick={handleClearCompleted}
              className="text-xs font-bold text-zinc-500 hover:text-red-600 dark:text-zinc-400 dark:hover:text-red-400 transition-colors"
            >
              Clear completed items ({items.filter(i => i.checked).length})
            </button>
          </div>
        )}
      </div>
        </>
      )}

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
