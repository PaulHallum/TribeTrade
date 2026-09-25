import { useState } from 'react';
import { motion } from 'motion/react';
import { 
  X, 
  Truck, 
  Calendar as CalendarIcon, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  RefreshCw, 
  Loader2, 
  FileText, 
  ExternalLink 
} from 'lucide-react';
import { format, parseISO, isValid, differenceInDays } from 'date-fns';
import { useToast } from '../../contexts/ToastContext';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { advanceComplianceDueDate, syncVehiclesToFirestoreEvents } from '../../services/vehicleComplianceService';
import { Vehicle } from '../../types/vehicle';

export interface VehicleComplianceModalProps {
  event: any; // Calendar event or compliance item
  tradeUserId: string;
  userId?: string;
  onClose: () => void;
  onNavigateToSettings?: () => void;
}

export default function VehicleComplianceModal({
  event,
  tradeUserId,
  userId,
  onClose,
  onNavigateToSettings
}: VehicleComplianceModalProps) {
  const { showToast } = useToast();
  const [renewing, setRenewing] = useState(false);

  const vehicleId = event.vehicleId;
  const complianceItemId = event.complianceItemId;
  const vehicleName = event.vehicleName || 'Vehicle';
  const registration = event.registration || '';
  const complianceTitle = event.complianceTitle || event.title;
  const isReminder = event.isReminder ?? event.title?.includes('1 Month Reminder');
  const dueDateStr = event.dueDateString || (event.startTime ? format(new Date(event.startTime), 'yyyy-MM-dd') : '');
  const notes = event.notes || event.description || '';

  const parsedDueDate = dueDateStr ? parseISO(dueDateStr) : null;
  const isDueValid = parsedDueDate && isValid(parsedDueDate);
  const daysDiff = isDueValid ? differenceInDays(parsedDueDate, new Date()) : null;

  const handleRenewOneYear = async () => {
    if (!tradeUserId || !vehicleId || !complianceItemId || !dueDateStr) {
      showToast('Unable to identify vehicle compliance record to update.', 'error');
      return;
    }

    setRenewing(true);
    try {
      // 1. Fetch current vehicles
      const userRef = doc(db, 'trade_users', tradeUserId);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        showToast('Trade user profile not found.', 'error');
        return;
      }

      const currentVehicles: Vehicle[] = snap.data()?.vehicles || [];
      const updatedVehicles = currentVehicles.map(v => {
        if (v.id !== vehicleId) return v;
        const updatedItems = v.complianceItems.map(item => {
          if (item.id !== complianceItemId) return item;
          const nextDate = advanceComplianceDueDate(item.dueDate || dueDateStr);
          return {
            ...item,
            dueDate: nextDate,
            lastCompletedDate: format(new Date(), 'yyyy-MM-dd')
          };
        });
        return { ...v, complianceItems: updatedItems, updatedAt: new Date().toISOString() };
      });

      // 2. Save back to Firestore
      await updateDoc(userRef, { vehicles: updatedVehicles });

      // 3. Re-sync calendar events
      if (userId) {
        await syncVehiclesToFirestoreEvents(tradeUserId, updatedVehicles, userId);
      }

      showToast(`Renewed ${complianceTitle} for another year! Calendar updated.`, 'success');
      onClose();
    } catch (err: any) {
      showToast('Failed to renew compliance record: ' + err.message, 'error');
    } finally {
      setRenewing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-zinc-950/40 backdrop-blur-md" 
        onClick={onClose} 
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="relative bg-white dark:bg-zinc-900 rounded-[28px] w-full max-w-md overflow-hidden flex flex-col shadow-2xl border border-zinc-200 dark:border-zinc-800"
      >
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
              isReminder 
                ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400' 
                : 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
            }`}>
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-sm text-zinc-900 dark:text-white uppercase tracking-tight">
                {isReminder ? '1-Month Advance Reminder' : 'Transport Compliance Due'}
              </h3>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                Vehicle Compliance Tracker
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body content */}
        <div className="p-5 space-y-4">
          {/* Vehicle info card */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-bold text-sm text-zinc-900 dark:text-white">
                {vehicleName}
              </span>
              {registration && (
                <span className="px-2 py-0.5 bg-amber-400 text-zinc-950 font-mono font-black text-xs rounded border border-amber-500 shadow-sm uppercase tracking-wider">
                  {registration}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 pt-1 border-t border-zinc-200/60 dark:border-zinc-700/60">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                Item: {complianceTitle}
              </span>
            </div>
          </div>

          {/* Status & Due Date alert banner */}
          <div className={`p-4 rounded-2xl border flex items-start gap-3 ${
            isReminder
              ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200'
              : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/50 text-rose-900 dark:text-rose-200'
          }`}>
            {isReminder ? (
              <Clock className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            )}
            <div className="space-y-1 text-xs">
              <span className="font-bold block">
                {isReminder 
                  ? 'Book now: Due in approximately 1 month!' 
                  : 'Important: Transport compliance is due!'}
              </span>
              <p className="text-[11px] opacity-80">
                {isDueValid ? (
                  <>Official Due Date: <strong>{format(parsedDueDate, 'EEEE, d MMMM yyyy')}</strong></>
                ) : (
                  <>Due Date: {dueDateStr || 'Not specified'}</>
                )}
                {daysDiff !== null && (
                  <span className="block mt-0.5 font-semibold">
                    {daysDiff < 0 
                      ? `⚠️ Overdue by ${Math.abs(daysDiff)} days` 
                      : daysDiff === 0 
                      ? '🚨 Due today!' 
                      : `⏳ ${daysDiff} days remaining`}
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Policy notes if any */}
          {notes && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Garage & Policy Notes
              </span>
              <p className="text-xs text-zinc-600 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-800/30 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800">
                {notes}
              </p>
            </div>
          )}

          <p className="text-[11px] text-zinc-400 dark:text-zinc-500 italic">
            This entry is automatically generated from your Vehicle Fleet Settings and recurs every year.
          </p>
        </div>

        {/* Footer actions */}
        <div className="p-4 bg-zinc-50 dark:bg-zinc-800/40 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
          {onNavigateToSettings ? (
            <button
              onClick={() => {
                onClose();
                onNavigateToSettings();
              }}
              className="text-xs font-bold text-zinc-600 dark:text-zinc-300 hover:text-emerald-600 dark:hover:text-emerald-400 flex items-center gap-1 px-3 py-2 rounded-xl transition-colors"
            >
              <span>Manage in Settings</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleRenewOneYear}
              disabled={renewing}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
            >
              {renewing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>Renew for Next Year (+1 Yr)</span>
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
