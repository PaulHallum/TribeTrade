import { db } from '../lib/firebase';
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp
} from 'firebase/firestore';
import { detectCategory } from '../lib/shoppingUtils';
import { Quote, Invoice, QuoteItem } from '../types/quote';

export interface ShedStockItem {
  id: string;
  name: string;
  quantity: number;
  reservedQuantity?: number;
  isKeyItem?: boolean;
  category?: string;
  unit?: string;
  costPrice?: number;
  supplier?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface ShedAllocationRecord {
  id?: string;
  stockItemId: string;
  stockItemName: string;
  quantity: number;
  unit?: string;
  targetType: 'invoice' | 'quote' | 'custom';
  targetId?: string | null;
  jobTitle: string;
  customerName?: string;
  unitPrice: number;
  totalCharged: number;
  allocatedAt: string;
  jobDate?: string;
  status?: 'active' | 'completed' | 'unreserved';
  completedAt?: string;
}

export interface AssignStockParams {
  tradeUserId: string;
  stockItemId: string;
  stockItemName: string;
  quantityToAssign: number;
  unit?: string;
  unitPrice?: number;
  targetType: 'invoice' | 'quote' | 'custom';
  targetId?: string;
  jobTitle: string;
  customerName?: string;
  jobDate?: string;
}

/**
 * Adds or updates materials/items in "The Shed" inventory.
 * If an item with a matching name already exists, increments its quantity.
 * Otherwise creates a new stock record.
 */
export async function addOrUpdateShedStock(
  tradeUserId: string,
  items: Array<{
    name: string;
    quantity: number;
    category?: string;
    unit?: string;
    costPrice?: number;
    supplier?: string;
  }>
): Promise<{ addedCount: number; updatedCount: number }> {
  if (!tradeUserId || !items || items.length === 0) {
    return { addedCount: 0, updatedCount: 0 };
  }

  const shedRef = collection(db, 'trade_users', tradeUserId, 'shedInventory');
  const snap = await getDocs(shedRef);
  const existingDocs = snap.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<ShedStockItem, 'id'>)
  }));

  let addedCount = 0;
  let updatedCount = 0;

  for (const item of items) {
    const trimmedName = item.name.trim();
    if (!trimmedName) continue;
    const lowerName = trimmedName.toLowerCase();
    const qty = Math.max(0, Number(item.quantity) || 1);

    const existing = existingDocs.find(
      d => d.name.trim().toLowerCase() === lowerName
    );

    if (existing) {
      const newQty = Number((Number(existing.quantity || 0) + qty).toFixed(2));
      await updateDoc(doc(db, 'trade_users', tradeUserId, 'shedInventory', existing.id), {
        quantity: newQty,
        updatedAt: serverTimestamp(),
        ...(item.category ? { category: item.category } : {}),
        ...(item.unit ? { unit: item.unit } : {})
      });
      existing.quantity = newQty;
      updatedCount++;
    } else {
      const category = item.category || detectCategory(trimmedName);
      const newDoc = await addDoc(shedRef, {
        name: trimmedName,
        quantity: qty,
        category,
        unit: item.unit || 'units',
        costPrice: item.costPrice || 0,
        supplier: item.supplier || '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      existingDocs.push({
        id: newDoc.id,
        name: trimmedName,
        quantity: qty,
        category,
        unit: item.unit || 'units'
      });
      addedCount++;
    }
  }

  return { addedCount, updatedCount };
}

/**
 * Assigns stock from The Shed to a Job (Quote, Invoice, or custom trade job).
 * Decrements the quantity in The Shed and appends the line item to the target Quote/Invoice.
 */
export async function assignStockToJob(params: AssignStockParams): Promise<void> {
  const {
    tradeUserId,
    stockItemId,
    stockItemName,
    quantityToAssign,
    unit = 'units',
    unitPrice = 0,
    targetType,
    targetId,
    jobTitle,
    customerName = ''
  } = params;

  if (!tradeUserId || !stockItemId || quantityToAssign <= 0) {
    throw new Error('Invalid assignment parameters');
  }

  // 1. Decrement quantity in The Shed
  const stockDocRef = doc(db, 'trade_users', tradeUserId, 'shedInventory', stockItemId);
  const stockSnap = await getDoc(stockDocRef);
  if (stockSnap.exists()) {
    const data = stockSnap.data();
    const currentQty = Number(data?.quantity || 0);
    const currentReserved = Number(data?.reservedQuantity || 0);
    const isKeyItem = Boolean(data?.isKeyItem);
    const newQty = Math.max(0, Number((currentQty - quantityToAssign).toFixed(2)));
    const newReserved = Math.max(0, Number((currentReserved - quantityToAssign).toFixed(2)));

    if (newQty <= 0 && !isKeyItem) {
      await deleteDoc(stockDocRef);
    } else {
      await updateDoc(stockDocRef, {
        quantity: newQty,
        reservedQuantity: newReserved,
        updatedAt: serverTimestamp()
      });
    }
  }

  // 2. If assigning to an existing Invoice, append material line item and recalculate totals
  if (targetType === 'invoice' && targetId) {
    const invRef = doc(db, 'trade_users', tradeUserId, 'invoices', targetId);
    const invSnap = await getDoc(invRef);
    if (invSnap.exists()) {
      const invData = invSnap.data() as Invoice;
      const currentItems: QuoteItem[] = invData.items || [];
      const itemTotal = Number((quantityToAssign * unitPrice).toFixed(2));

      const newItem: QuoteItem = {
        id: `shed_${Date.now()}`,
        description: `${stockItemName} (allocated from The Shed)`,
        type: 'material',
        quantity: quantityToAssign,
        unit: unit,
        unitPrice: unitPrice,
        total: itemTotal
      };

      const updatedItems = [...currentItems, newItem];
      const subtotalLabour = updatedItems
        .filter(i => i.type === 'labour')
        .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
      const subtotalMaterials = updatedItems
        .filter(i => i.type === 'material')
        .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
      const otherTotal = updatedItems
        .filter(i => i.type !== 'labour' && i.type !== 'material')
        .reduce((sum, i) => sum + (Number(i.total) || 0), 0);

      const netTotal = Number((subtotalLabour + subtotalMaterials + otherTotal).toFixed(2));
      const vatRate = invData.vatRate || 20;
      const vatAmount = invData.isVatRegistered
        ? Number(((netTotal * vatRate) / 100).toFixed(2))
        : 0;
      const grandTotal = Number((netTotal + vatAmount).toFixed(2));

      await updateDoc(invRef, {
        items: updatedItems,
        subtotalLabour,
        subtotalMaterials,
        netTotal,
        vatAmount,
        grandTotal,
        updatedAt: new Date().toISOString()
      });
    }
  }

  // 3. If assigning to an existing Quote, append material line item and recalculate totals
  if (targetType === 'quote' && targetId) {
    const quoteRef = doc(db, 'trade_users', tradeUserId, 'quotes', targetId);
    const quoteSnap = await getDoc(quoteRef);
    if (quoteSnap.exists()) {
      const quoteData = quoteSnap.data() as Quote;
      const currentItems: QuoteItem[] = quoteData.items || [];
      const itemTotal = Number((quantityToAssign * unitPrice).toFixed(2));

      const newItem: QuoteItem = {
        id: `shed_${Date.now()}`,
        description: `${stockItemName} (allocated from The Shed)`,
        type: 'material',
        quantity: quantityToAssign,
        unit: unit,
        unitPrice: unitPrice,
        total: itemTotal
      };

      const updatedItems = [...currentItems, newItem];
      const subtotalLabour = updatedItems
        .filter(i => i.type === 'labour')
        .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
      const subtotalMaterials = updatedItems
        .filter(i => i.type === 'material')
        .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
      const otherTotal = updatedItems
        .filter(i => i.type !== 'labour' && i.type !== 'material')
        .reduce((sum, i) => sum + (Number(i.total) || 0), 0);

      const netTotal = Number((subtotalLabour + subtotalMaterials + otherTotal).toFixed(2));
      const vatRate = quoteData.vatRate || 20;
      const vatAmount = quoteData.isVatRegistered
        ? Number(((netTotal * vatRate) / 100).toFixed(2))
        : 0;
      const grandTotal = Number((netTotal + vatAmount).toFixed(2));

      await updateDoc(quoteRef, {
        items: updatedItems,
        subtotalLabour,
        subtotalMaterials,
        netTotal,
        vatAmount,
        grandTotal,
        updatedAt: new Date().toISOString()
      });
    }
  }

  // 4. Log allocation audit record in shedAllocations
  const allocRef = collection(db, 'trade_users', tradeUserId, 'shedAllocations');
  const jobDate = params.jobDate || new Date().toISOString().split('T')[0];
  await addDoc(allocRef, {
    stockItemId,
    stockItemName,
    quantity: quantityToAssign,
    unit,
    targetType,
    targetId: targetId || null,
    jobTitle,
    customerName,
    unitPrice,
    totalCharged: Number((quantityToAssign * unitPrice).toFixed(2)),
    allocatedAt: new Date().toISOString(),
    jobDate,
    status: 'active'
  });
}

/**
 * Fetches recent stock allocations to jobs for The Shed overview.
 */
export async function getRecentShedAllocations(
  tradeUserId: string,
  maxCount = 25
): Promise<ShedAllocationRecord[]> {
  if (!tradeUserId) return [];
  const allocRef = collection(db, 'trade_users', tradeUserId, 'shedAllocations');
  const q = query(allocRef, orderBy('allocatedAt', 'desc'), limit(maxCount));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({
    id: d.id,
    ...(d.data() as Omit<ShedAllocationRecord, 'id'>)
  }));
}

/**
 * Real-time subscription to stock allocations for a trade user.
 */
export function subscribeShedAllocations(
  tradeUserId: string,
  onUpdate: (allocations: ShedAllocationRecord[]) => void
): () => void {
  if (!tradeUserId) {
    onUpdate([]);
    return () => {};
  }
  const allocRef = collection(db, 'trade_users', tradeUserId, 'shedAllocations');
  const q = query(allocRef, orderBy('allocatedAt', 'desc'), limit(100));
  return onSnapshot(
    q,
    (snapshot) => {
      const list = snapshot.docs.map(d => ({
        id: d.id,
        ...(d.data() as Omit<ShedAllocationRecord, 'id'>)
      }));
      onUpdate(list);
    },
    (err) => {
      console.error('Error subscribing to shed allocations:', err);
      onUpdate([]);
    }
  );
}

/**
 * Reserves a quantity of stock in The Shed for an accepted job / quote.
 */
export async function reserveShedStock(
  tradeUserId: string,
  stockItemId: string,
  quantityToReserve: number
): Promise<void> {
  if (!tradeUserId || !stockItemId || quantityToReserve <= 0) return;
  const stockDocRef = doc(db, 'trade_users', tradeUserId, 'shedInventory', stockItemId);
  const stockSnap = await getDoc(stockDocRef);
  if (stockSnap.exists()) {
    const currentReserved = Number(stockSnap.data()?.reservedQuantity || 0);
    const newReserved = Number((currentReserved + quantityToReserve).toFixed(2));
    await updateDoc(stockDocRef, {
      reservedQuantity: newReserved,
      updatedAt: serverTimestamp()
    });
  }
}

/**
 * Releases reserved stock back to available pool (e.g. if a quote is cancelled / unbooked).
 */
export async function releaseShedStock(
  tradeUserId: string,
  stockItemId: string,
  quantityToRelease: number
): Promise<void> {
  if (!tradeUserId || !stockItemId || quantityToRelease <= 0) return;
  const stockDocRef = doc(db, 'trade_users', tradeUserId, 'shedInventory', stockItemId);
  const stockSnap = await getDoc(stockDocRef);
  if (stockSnap.exists()) {
    const currentReserved = Number(stockSnap.data()?.reservedQuantity || 0);
    const newReserved = Math.max(0, Number((currentReserved - quantityToRelease).toFixed(2)));
    await updateDoc(stockDocRef, {
      reservedQuantity: newReserved,
      updatedAt: serverTimestamp()
    });
  }
}

/**
 * Unreserves stock allocated to a job, returning the quantity to The Shed
 * and removing or updating the line item from the linked invoice/quote.
 */
export async function unreserveStockAllocation(
  tradeUserId: string,
  allocationId: string
): Promise<void> {
  if (!tradeUserId || !allocationId) return;

  const allocDocRef = doc(db, 'trade_users', tradeUserId, 'shedAllocations', allocationId);
  const allocSnap = await getDoc(allocDocRef);
  if (!allocSnap.exists()) return;

  const allocData = allocSnap.data() as ShedAllocationRecord;
  const { stockItemId, stockItemName, quantity, targetType, targetId } = allocData;

  // 1. Restore stock in The Shed
  if (stockItemId && quantity > 0) {
    const stockDocRef = doc(db, 'trade_users', tradeUserId, 'shedInventory', stockItemId);
    const stockSnap = await getDoc(stockDocRef);
    if (stockSnap.exists()) {
      const currentQty = Number(stockSnap.data()?.quantity || 0);
      const newQty = Number((currentQty + quantity).toFixed(2));
      await updateDoc(stockDocRef, {
        quantity: newQty,
        updatedAt: serverTimestamp()
      });
    } else {
      // Recreate item in The Shed if it was deleted when reaching 0
      await setDoc(stockDocRef, {
        id: stockItemId,
        name: stockItemName,
        quantity: quantity,
        unit: allocData.unit || 'units',
        costPrice: allocData.unitPrice || 0,
        category: detectCategory(stockItemName),
        reservedQuantity: 0,
        isKeyItem: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }
  }

  // 2. Remove line item from linked invoice if target is invoice
  if (targetType === 'invoice' && targetId) {
    try {
      const invRef = doc(db, 'trade_users', tradeUserId, 'invoices', targetId);
      const invSnap = await getDoc(invRef);
      if (invSnap.exists()) {
        const invData = invSnap.data() as Invoice;
        const currentItems: QuoteItem[] = invData.items || [];
        let removed = false;
        const updatedItems = currentItems.filter(item => {
          if (!removed && (item.description.includes(stockItemName) || item.id.startsWith('shed_'))) {
            removed = true;
            return false;
          }
          return true;
        });

        const subtotalLabour = updatedItems
          .filter(i => i.type === 'labour')
          .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
        const subtotalMaterials = updatedItems
          .filter(i => i.type === 'material')
          .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
        const otherTotal = updatedItems
          .filter(i => i.type !== 'labour' && i.type !== 'material')
          .reduce((sum, i) => sum + (Number(i.total) || 0), 0);

        const netTotal = Number((subtotalLabour + subtotalMaterials + otherTotal).toFixed(2));
        const vatRate = invData.vatRate || 20;
        const vatAmount = invData.isVatRegistered
          ? Number(((netTotal * vatRate) / 100).toFixed(2))
          : 0;
        const grandTotal = Number((netTotal + vatAmount).toFixed(2));

        await updateDoc(invRef, {
          items: updatedItems,
          subtotalLabour,
          subtotalMaterials,
          netTotal,
          vatAmount,
          grandTotal,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.warn('Failed to update invoice items during unreserve:', err);
    }
  }

  // 3. Remove line item from linked quote if target is quote
  if (targetType === 'quote' && targetId) {
    try {
      const quoteRef = doc(db, 'trade_users', tradeUserId, 'quotes', targetId);
      const quoteSnap = await getDoc(quoteRef);
      if (quoteSnap.exists()) {
        const quoteData = quoteSnap.data() as Quote;
        const currentItems: QuoteItem[] = quoteData.items || [];
        let removed = false;
        const updatedItems = currentItems.filter(item => {
          if (!removed && (item.description.includes(stockItemName) || item.id.startsWith('shed_'))) {
            removed = true;
            return false;
          }
          return true;
        });

        const subtotalLabour = updatedItems
          .filter(i => i.type === 'labour')
          .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
        const subtotalMaterials = updatedItems
          .filter(i => i.type === 'material')
          .reduce((sum, i) => sum + (Number(i.total) || 0), 0);
        const otherTotal = updatedItems
          .filter(i => i.type !== 'labour' && i.type !== 'material')
          .reduce((sum, i) => sum + (Number(i.total) || 0), 0);

        const netTotal = Number((subtotalLabour + subtotalMaterials + otherTotal).toFixed(2));
        const vatRate = quoteData.vatRate || 20;
        const vatAmount = quoteData.isVatRegistered
          ? Number(((netTotal * vatRate) / 100).toFixed(2))
          : 0;
        const grandTotal = Number((netTotal + vatAmount).toFixed(2));

        await updateDoc(quoteRef, {
          items: updatedItems,
          subtotalLabour,
          subtotalMaterials,
          netTotal,
          vatAmount,
          grandTotal,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.warn('Failed to update quote items during unreserve:', err);
    }
  }

  // 4. Delete the allocation document
  await deleteDoc(allocDocRef);
}

/**
 * Unreserves all allocations for a given job.
 */
export async function unreserveJobAllocations(
  tradeUserId: string,
  allocations: ShedAllocationRecord[]
): Promise<void> {
  if (!tradeUserId || !allocations || allocations.length === 0) return;
  for (const alloc of allocations) {
    if (alloc.id) {
      await unreserveStockAllocation(tradeUserId, alloc.id);
    }
  }
}

/**
 * Marks an allocation record as completed when a job has passed or finishes.
 */
export async function markAllocationCompleted(
  tradeUserId: string,
  allocationId: string
): Promise<void> {
  if (!tradeUserId || !allocationId) return;
  const allocDocRef = doc(db, 'trade_users', tradeUserId, 'shedAllocations', allocationId);
  await updateDoc(allocDocRef, {
    status: 'completed',
    completedAt: new Date().toISOString()
  });
}

/**
 * Removes all stock allocations associated with an invoice or quote.
 * Used when an invoice or quote is deleted, returning reserved stock back to The Shed.
 */
export async function removeAllocationsForTarget(
  tradeUserId: string,
  targetId: string,
  restoreStock: boolean = true
): Promise<void> {
  if (!tradeUserId || !targetId) return;

  try {
    const allocRef = collection(db, 'trade_users', tradeUserId, 'shedAllocations');
    const q = query(allocRef, where('targetId', '==', targetId));
    const snap = await getDocs(q);

    for (const allocDoc of snap.docs) {
      const data = allocDoc.data() as ShedAllocationRecord;
      if (restoreStock && data.stockItemId && data.quantity > 0) {
        const stockDocRef = doc(db, 'trade_users', tradeUserId, 'shedInventory', data.stockItemId);
        const stockSnap = await getDoc(stockDocRef);
        if (stockSnap.exists()) {
          const currentQty = Number(stockSnap.data()?.quantity || 0);
          await updateDoc(stockDocRef, {
            quantity: Number((currentQty + data.quantity).toFixed(2)),
            updatedAt: serverTimestamp()
          });
        } else {
          await setDoc(stockDocRef, {
            id: data.stockItemId,
            name: data.stockItemName,
            quantity: data.quantity,
            unit: data.unit || 'units',
            costPrice: data.unitPrice || 0,
            category: detectCategory(data.stockItemName),
            reservedQuantity: 0,
            isKeyItem: false,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        }
      }
      await deleteDoc(allocDoc.ref);
    }
  } catch (err) {
    console.error('Failed to cleanup allocations for target:', targetId, err);
  }
}

