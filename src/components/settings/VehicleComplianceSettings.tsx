import React, { useState } from 'react';
import { 
  Truck, 
  Plus, 
  Trash2, 
  Calendar as CalendarIcon, 
  ShieldCheck, 
  Wrench, 
  FileText, 
  AlertTriangle, 
  Check, 
  Loader2, 
  ChevronDown, 
  ChevronUp,
  RefreshCw,
  Clock
} from 'lucide-react';
import { parseISO, isValid, format, differenceInDays } from 'date-fns';
import { Vehicle, VehicleComplianceItem, createDefaultComplianceItems, VehicleType } from '../../types/vehicle';
import { advanceComplianceDueDate, syncVehiclesToFirestoreEvents } from '../../services/vehicleComplianceService';
import { useToast } from '../../contexts/ToastContext';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import ConfirmModal from '../common/ConfirmModal';

interface VehicleComplianceSettingsProps {
  tradeUserId: string;
  userId: string;
  initialVehicles?: Vehicle[];
}

export default function VehicleComplianceSettings({
  tradeUserId,
  userId,
  initialVehicles = []
}: VehicleComplianceSettingsProps) {
  const { showToast } = useToast();
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [saving, setSaving] = useState(false);
  const [expandedVehicleId, setExpandedVehicleId] = useState<string | null>(
    initialVehicles.length > 0 ? initialVehicles[0].id : null
  );

  // New vehicle form state
  const [isAddingVehicle, setIsAddingVehicle] = useState(false);
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehicleReg, setNewVehicleReg] = useState('');
  const [newVehicleType, setNewVehicleType] = useState<VehicleType>('van');
  const [newVehicleMakeModel, setNewVehicleMakeModel] = useState('');

  // Delete vehicle confirmation state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    vehicleId: string;
    vehicleName: string;
  }>({
    isOpen: false,
    vehicleId: '',
    vehicleName: ''
  });

  // Keep local state in sync if initialVehicles updates externally
  React.useEffect(() => {
    if (initialVehicles && initialVehicles.length > 0) {
      setVehicles(initialVehicles);
      if (!expandedVehicleId) {
        setExpandedVehicleId(initialVehicles[0].id);
      }
    }
  }, [initialVehicles]);

  const handleAddVehicle = () => {
    if (!newVehicleName.trim()) {
      showToast('Please enter a vehicle description or name.', 'error');
      return;
    }

    const newVehicle: Vehicle = {
      id: `veh_${Date.now()}`,
      name: newVehicleName.trim(),
      registration: newVehicleReg.trim().toUpperCase(),
      vehicleType: newVehicleType,
      makeModel: newVehicleMakeModel.trim(),
      complianceItems: createDefaultComplianceItems(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const updated = [...vehicles, newVehicle];
    setVehicles(updated);
    setExpandedVehicleId(newVehicle.id);
    setIsAddingVehicle(false);
    setNewVehicleName('');
    setNewVehicleReg('');
    setNewVehicleMakeModel('');
    showToast(`Added ${newVehicle.name}. Don't forget to save changes!`, 'info');
  };

  const handleUpdateItem = (
    vehicleId: string,
    itemId: string,
    field: keyof VehicleComplianceItem,
    value: any
  ) => {
    setVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;
        const updatedItems = v.complianceItems.map(item => {
          if (item.id !== itemId) return item;
          return { ...item, [field]: value };
        });
        return { ...v, complianceItems: updatedItems, updatedAt: new Date().toISOString() };
      })
    );
  };

  const handleAdvanceYear = (vehicleId: string, itemId: string, currentDueDate: string) => {
    if (!currentDueDate) {
      showToast('Please set an initial due date first.', 'error');
      return;
    }
    const newDate = advanceComplianceDueDate(currentDueDate);
    handleUpdateItem(vehicleId, itemId, 'dueDate', newDate);
    showToast(`Renewed for next year! Due date set to ${format(parseISO(newDate), 'dd/MM/yyyy')}.`, 'success');
  };

  const handleAddCustomItem = (vehicleId: string) => {
    const customTitle = prompt('Enter transport compliance item name (e.g. LOLER Inspection, Breakdown Cover, Tachograph):');
    if (!customTitle || !customTitle.trim()) return;

    const newItem: VehicleComplianceItem = {
      id: `custom_${Date.now()}`,
      type: 'custom',
      title: customTitle.trim(),
      dueDate: '',
      notes: ''
    };

    setVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;
        return {
          ...v,
          complianceItems: [...v.complianceItems, newItem],
          updatedAt: new Date().toISOString()
        };
      })
    );
  };

  const handleRemoveItem = (vehicleId: string, itemId: string) => {
    setVehicles(prev =>
      prev.map(v => {
        if (v.id !== vehicleId) return v;
        return {
          ...v,
          complianceItems: v.complianceItems.filter(i => i.id !== itemId),
          updatedAt: new Date().toISOString()
        };
      })
    );
  };

  const handleDeleteVehicle = (vehicleId: string) => {
    setVehicles(prev => prev.filter(v => v.id !== vehicleId));
    setDeleteConfirm({ isOpen: false, vehicleId: '', vehicleName: '' });
    showToast('Vehicle removed. Click Save to apply.', 'info');
  };

  const handleSaveAll = async () => {
    if (!tradeUserId) return;
    setSaving(true);
    try {
      // 1. Update Firestore trade_users document
      const tid = tradeUserId;
      await setDoc(doc(db, 'trade_users', tid), {
        vehicles: vehicles
      }, { merge: true });

      // 2. Synchronise calendar events with 1-month advance reminders & due date
      await syncVehiclesToFirestoreEvents(tradeUserId, vehicles, userId);

      showToast('Vehicle fleet compliance and calendar entries updated successfully!', 'success');
    } catch (err: any) {
      showToast('Failed to save vehicle settings: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (dueDateString: string) => {
    if (!dueDateString) {
      return (
        <span className="text-[10px] font-semibold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
          Not set
        </span>
      );
    }

    const parsed = parseISO(dueDateString);
    if (!isValid(parsed)) return null;

    const diff = differenceInDays(parsed, new Date());

    if (diff < 0) {
      return (
        <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 px-2 py-0.5 rounded-full flex items-center gap-1">
          <AlertTriangle className="w-3 h-3" /> Overdue by {Math.abs(diff)}d
        </span>
      );
    } else if (diff <= 30) {
      return (
        <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 px-2 py-0.5 rounded-full flex items-center gap-1">
          <Clock className="w-3 h-3" /> Due in {diff}d (Reminder Active)
        </span>
      );
    } else {
      return (
        <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/50 px-2 py-0.5 rounded-full">
          Due in {diff} days
        </span>
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 mt-4 flex-wrap gap-2">
        <h4 className="text-xs font-bold text-zinc-600 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2">
          <Truck className="w-4 h-4 text-emerald-500" />
          <span>Vehicle & Transport Fleet Compliance</span>
        </h4>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddingVehicle(true)}
            className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-200 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Vehicle</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 p-5 rounded-3xl border border-zinc-200 dark:border-zinc-800 space-y-4">
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
          Track when your vehicle MOT, Insurance, Servicing, and Road Tax are due. Setting dates here automatically projects them into your Calendar every year, with both a <strong>1-month advance reminder</strong> and a <strong>due date entry</strong> so critical transport deadlines are never missed.
        </p>

        {/* Add vehicle form modal / collapsible box */}
        {isAddingVehicle && (
          <div className="p-4 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200 dark:border-zinc-700 rounded-2xl space-y-3">
            <h5 className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              New Vehicle Details
            </h5>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                  Vehicle Name / Nickname *
                </label>
                <input
                  type="text"
                  value={newVehicleName}
                  onChange={e => setNewVehicleName(e.target.value)}
                  placeholder="e.g. Primary Work Van"
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                  UK Registration Plate
                </label>
                <input
                  type="text"
                  value={newVehicleReg}
                  onChange={e => setNewVehicleReg(e.target.value.toUpperCase())}
                  placeholder="e.g. VA21 XYZ"
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-mono font-bold uppercase text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                  Vehicle Type
                </label>
                <select
                  value={newVehicleType}
                  onChange={e => setNewVehicleType(e.target.value as VehicleType)}
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="van">Panel Van</option>
                  <option value="pickup">Pick-up Truck</option>
                  <option value="tipper">Tipper / Dropside</option>
                  <option value="car">Car / Estate</option>
                  <option value="trailer">Trailer / Plant</option>
                  <option value="other">Other Transport</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
                  Make & Model
                </label>
                <input
                  type="text"
                  value={newVehicleMakeModel}
                  onChange={e => setNewVehicleMakeModel(e.target.value)}
                  placeholder="e.g. Ford Transit 350 L3H2"
                  className="w-full px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setIsAddingVehicle(false)}
                className="px-3 py-1.5 text-xs text-zinc-500 hover:text-zinc-700 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleAddVehicle}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs"
              >
                Add to Fleet
              </button>
            </div>
          </div>
        )}

        {/* Vehicles list */}
        {vehicles.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl">
            <Truck className="w-8 h-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-2" />
            <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
              No transport vehicles registered yet
            </p>
            <p className="text-[11px] text-zinc-400 max-w-sm mx-auto mt-1 mb-3">
              Add your work van, pick-up, or car to automatically track MOTs, servicing, and insurance deadlines.
            </p>
            <button
              onClick={() => setIsAddingVehicle(true)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs inline-flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add First Vehicle</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {vehicles.map(vehicle => {
              const isExpanded = expandedVehicleId === vehicle.id;

              return (
                <div
                  key={vehicle.id}
                  className="border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden bg-zinc-50/50 dark:bg-zinc-800/30"
                >
                  {/* Vehicle card header */}
                  <div
                    onClick={() => setExpandedVehicleId(isExpanded ? null : vehicle.id)}
                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-zinc-900 dark:text-white">
                            {vehicle.name}
                          </span>
                          {vehicle.registration && (
                            <span className="px-2 py-0.5 bg-amber-400 text-zinc-950 font-mono font-black text-[10px] rounded border border-amber-500 shadow-sm uppercase tracking-wider">
                              {vehicle.registration}
                            </span>
                          )}
                          <span className="text-[10px] font-semibold text-zinc-400 uppercase tracking-widest">
                            ({vehicle.vehicleType || 'van'})
                          </span>
                        </div>
                        {vehicle.makeModel && (
                          <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                            {vehicle.makeModel}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm({
                            isOpen: true,
                            vehicleId: vehicle.id,
                            vehicleName: vehicle.name
                          });
                        }}
                        className="p-1.5 text-zinc-400 hover:text-rose-500 transition-colors rounded-lg"
                        title="Delete Vehicle"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        className="p-1 text-zinc-400"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded compliance items */}
                  {isExpanded && (
                    <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 space-y-4">
                      {/* Registration & Make/Model quick edit */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-zinc-100 dark:border-zinc-800">
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                            Registration Number
                          </label>
                          <input
                            type="text"
                            value={vehicle.registration || ''}
                            onChange={e => {
                              const val = e.target.value.toUpperCase();
                              setVehicles(prev =>
                                prev.map(v => v.id === vehicle.id ? { ...v, registration: val } : v)
                              );
                            }}
                            placeholder="e.g. VA21 XYZ"
                            className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs font-mono font-bold uppercase text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">
                            Make & Model
                          </label>
                          <input
                            type="text"
                            value={vehicle.makeModel || ''}
                            onChange={e => {
                              const val = e.target.value;
                              setVehicles(prev =>
                                prev.map(v => v.id === vehicle.id ? { ...v, makeModel: val } : v)
                              );
                            }}
                            placeholder="e.g. Ford Transit 350 L3H2"
                            className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                        </div>
                      </div>

                      {/* Compliance checklist */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black uppercase tracking-wider text-zinc-500">
                            Compliance Dates & Annual Cycles
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddCustomItem(vehicle.id)}
                            className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add Custom Check (e.g. LOLER)
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-2.5">
                          {vehicle.complianceItems.map(item => {
                            return (
                              <div
                                key={item.id}
                                className="p-3 bg-zinc-50 dark:bg-zinc-800/40 border border-zinc-200/80 dark:border-zinc-800 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                              >
                                <div className="space-y-1 min-w-[140px]">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-zinc-900 dark:text-white">
                                      {item.title}
                                    </span>
                                  </div>
                                  <div>
                                    {getStatusBadge(item.dueDate)}
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
                                  <div className="flex flex-col">
                                    <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                                      Due Date
                                    </label>
                                    <input
                                      type="date"
                                      value={item.dueDate || ''}
                                      onChange={e => handleUpdateItem(vehicle.id, item.id, 'dueDate', e.target.value)}
                                      className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                  </div>

                                  <div className="flex flex-col flex-1 sm:w-44">
                                    <label className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">
                                      Policy / Garage Notes
                                    </label>
                                    <input
                                      type="text"
                                      value={item.notes || ''}
                                      onChange={e => handleUpdateItem(vehicle.id, item.id, 'notes', e.target.value)}
                                      placeholder="e.g. Garage name or policy #"
                                      className="px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                  </div>

                                  <div className="flex items-center gap-1 self-end sm:self-center pt-2 sm:pt-4">
                                    <button
                                      type="button"
                                      onClick={() => handleAdvanceYear(vehicle.id, item.id, item.dueDate)}
                                      title="Renew for next year (+1 Year)"
                                      className="px-2.5 py-1.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 text-[10px] font-black rounded-lg transition-colors flex items-center gap-1"
                                    >
                                      <RefreshCw className="w-3 h-3" />
                                      <span>+1 Yr</span>
                                    </button>

                                    {item.type === 'custom' && (
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveItem(vehicle.id, item.id)}
                                        className="p-1.5 text-zinc-400 hover:text-rose-500 transition-colors rounded-lg"
                                        title="Remove check"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Save Action */}
        <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex justify-end">
          <button
            onClick={handleSaveAll}
            disabled={saving}
            className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all active:scale-95 shadow-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            <span>Save Fleet Changes</span>
          </button>
        </div>
      </div>

      <ConfirmModal
        isOpen={deleteConfirm.isOpen}
        title="Remove Vehicle"
        message={`Are you sure you want to remove "${deleteConfirm.vehicleName}" from your fleet? Its compliance items and calendar entries will be removed.`}
        confirmLabel="Remove Vehicle"
        variant="danger"
        onConfirm={() => handleDeleteVehicle(deleteConfirm.vehicleId)}
        onClose={() => setDeleteConfirm({ isOpen: false, vehicleId: '', vehicleName: '' })}
      />
    </div>
  );
}
