import React, { useState, useEffect } from 'react';
import { 
  X, 
  Truck, 
  Plus, 
  Download, 
  Trash2, 
  Edit3, 
  Calendar, 
  MapPin, 
  FileSpreadsheet, 
  CheckCircle2, 
  Search, 
  ShieldAlert,
  Loader2,
  Navigation,
  PoundSterling,
  Building,
  FileText,
  Route
} from 'lucide-react';
import { MileageEntry, HMRC_STANDARD_MILEAGE_RATE, Vehicle } from '../../types/vehicle';
import { Invoice, Quote } from '../../types/quote';
import { subscribeInvoices } from '../../services/invoiceService';
import { subscribeQuotes } from '../../services/quoteService';
import { 
  subscribeMileageEntries, 
  saveMileageEntry, 
  deleteMileageEntry, 
  generateMileageCsv 
} from '../../services/mileageService';
import { formatCurrency } from '../../services/quotePdfService';
import { useToast } from '../../contexts/ToastContext';
import ConfirmModal from '../common/ConfirmModal';
import { db } from '../../lib/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { calculateDrivingDistance, geocodeUkAddress, extractUkPostcode } from '../../services/routeService';

interface MileageLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  tradeUserId: string;
  vehicles?: Vehicle[];
  initialJobContext?: {
    jobId?: string;
    jobTitle?: string;
    customerAddress?: string;
  };
}

export default function MileageLogModal({
  isOpen,
  onClose,
  tradeUserId,
  vehicles = [],
  initialJobContext
}: MileageLogModalProps) {
  const { showToast } = useToast();

  const [entries, setEntries] = useState<MileageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);

  // Active fleet vehicles & base workshop address
  const [activeVehicles, setActiveVehicles] = useState<Vehicle[]>(vehicles);
  const [baseAddress, setBaseAddress] = useState<string>('');
  const [isCustomVehicle, setIsCustomVehicle] = useState(false);

  // Route calculation state
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false);
  const [isReturnTrip, setIsReturnTrip] = useState(false);
  const [oneWayMiles, setOneWayMiles] = useState<number | null>(null);

  // Form inputs
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(
    vehicles.length > 0 ? vehicles[0].id : ''
  );
  const [vehicleReg, setVehicleReg] = useState<string>(
    vehicles.length > 0 ? vehicles[0].registration : ''
  );
  const [vehicleName, setVehicleName] = useState<string>(
    vehicles.length > 0 ? vehicles[0].name : ''
  );
  const [purpose, setPurpose] = useState('');
  const [startLocation, setStartLocation] = useState('Base / Workshop');
  const [destination, setDestination] = useState(initialJobContext?.customerAddress || '');
  const [jobTitle, setJobTitle] = useState(initialJobContext?.jobTitle || '');
  const [miles, setMiles] = useState<string>('');
  const [ratePerMile, setRatePerMile] = useState<number>(HMRC_STANDARD_MILEAGE_RATE);
  const [startOdometer, setStartOdometer] = useState<string>('');
  const [endOdometer, setEndOdometer] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Invoices & Quotes for pulling client address & job details
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [showInvoicePicker, setShowInvoicePicker] = useState(false);
  const [linkedJobId, setLinkedJobId] = useState<string | undefined>(initialJobContext?.jobId);

  // Delete modal state
  const [deleteConfig, setDeleteConfig] = useState<{
    isOpen: boolean;
    id: string;
    description: string;
  }>({
    isOpen: false,
    id: '',
    description: ''
  });

  // Subscribe to real-time entries
  useEffect(() => {
    if (!isOpen || !tradeUserId) return;
    setLoading(true);

    const unsub = subscribeMileageEntries(tradeUserId, (list) => {
      setEntries(list);
      setLoading(false);
    });

    return () => unsub();
  }, [isOpen, tradeUserId]);

  // Subscribe to real-time invoices & quotes for address and job details lookup
  useEffect(() => {
    if (!isOpen || !tradeUserId) return;
    const unsubInvoices = subscribeInvoices(tradeUserId, (list) => {
      setInvoices(list);
    });
    const unsubQuotes = subscribeQuotes(tradeUserId, (qList) => {
      setQuotes(qList);
    });
    return () => {
      unsubInvoices();
      unsubQuotes();
    };
  }, [isOpen, tradeUserId]);

  // Subscribe to registered vehicles & business base address from profile
  useEffect(() => {
    if (!tradeUserId) return;

    const unsubBiz = onSnapshot(doc(db, 'trade_users', tradeUserId), (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.vehicles && Array.isArray(data.vehicles) && data.vehicles.length > 0) {
          setActiveVehicles(data.vehicles);
          if (!selectedVehicleId) {
            setSelectedVehicleId(data.vehicles[0].id);
            setVehicleName(data.vehicles[0].name);
            setVehicleReg(data.vehicles[0].registration || '');
          }
        }
        
        // Construct real base address from settings
        const baseParts = [data.addressLine1, data.addressLine2, data.townCity, data.postcode].filter(Boolean);
        if (baseParts.length > 0) {
          const fullBase = baseParts.join(', ');
          setBaseAddress(fullBase);
          setStartLocation(prev => {
            if (prev === 'Base / Workshop' || !prev) {
              return fullBase;
            }
            return prev;
          });
        }
      }
    });

    return () => unsubBiz();
  }, [tradeUserId, selectedVehicleId]);

  // If vehicle selection changes in form
  const handleVehicleSelect = (vId: string) => {
    if (vId === 'custom') {
      setSelectedVehicleId('custom');
      setIsCustomVehicle(true);
      setVehicleName('');
      setVehicleReg('');
      return;
    }
    setIsCustomVehicle(false);
    setSelectedVehicleId(vId);
    const found = activeVehicles.find(v => v.id === vId);
    if (found) {
      setVehicleName(found.name);
      setVehicleReg(found.registration);
    }
  };

  // Route calculation handler
  const handleCalculateRoute = async () => {
    if (!startLocation.trim() || !destination.trim()) {
      showToast('Please enter both a start location and destination to calculate miles', 'warning');
      return;
    }

    setIsCalculatingRoute(true);
    try {
      const res = await calculateDrivingDistance(startLocation, destination);
      if (res && res.miles > 0) {
        setOneWayMiles(res.miles);
        const targetMiles = isReturnTrip ? Math.round(res.miles * 2 * 10) / 10 : res.miles;
        setMiles(targetMiles.toFixed(1));
        showToast(`Route calculated: ${targetMiles} miles (${res.source === 'road-osrm' ? 'driving road distance' : 'estimated route'})`, 'success');
      } else {
        showToast('Could not calculate exact route. Please check UK postcodes or addresses.', 'warning');
      }
    } catch (err) {
      showToast('Failed to calculate route distance. You can enter miles manually.', 'warning');
    } finally {
      setIsCalculatingRoute(false);
    }
  };

  // Return trip toggle handler (doubles or restores miles)
  const handleToggleReturnTrip = () => {
    const nextReturn = !isReturnTrip;
    setIsReturnTrip(nextReturn);

    const currentMiles = parseFloat(miles);
    if (oneWayMiles && oneWayMiles > 0) {
      const newTotal = nextReturn ? Math.round(oneWayMiles * 2 * 10) / 10 : oneWayMiles;
      setMiles(newTotal.toFixed(1));
    } else if (!isNaN(currentMiles) && currentMiles > 0) {
      const newTotal = nextReturn ? Math.round(currentMiles * 2 * 10) / 10 : Math.round((currentMiles / 2) * 10) / 10;
      setMiles(newTotal.toFixed(1));
    }
  };

  // Auto-calculate miles when start & end odometer entered
  const handleOdometerChange = (startStr: string, endStr: string) => {
    setStartOdometer(startStr);
    setEndOdometer(endStr);
    const startVal = parseFloat(startStr);
    const endVal = parseFloat(endStr);
    if (!isNaN(startVal) && !isNaN(endVal) && endVal >= startVal) {
      setMiles((endVal - startVal).toFixed(1));
    }
  };

  const handleSelectInvoice = (inv: Invoice) => {
    const rawInv = inv as any;

    // 1. Gather all address parts from invoice
    let rawAddress = (rawInv.customerAddress || rawInv.siteAddress || rawInv.location || '').trim();

    // If invoice is linked to a quote, check if source quote has fuller address or postcode
    if (inv.quoteId && quotes.length > 0) {
      const linkedQuote = quotes.find(q => q.id === inv.quoteId || q.quoteNumber === inv.quoteNumber);
      if (linkedQuote) {
        const qRaw = ((linkedQuote as any).customerAddress || (linkedQuote as any).siteAddress || '').trim();
        if (extractUkPostcode(qRaw) && !extractUkPostcode(rawAddress)) {
          rawAddress = qRaw;
        } else if (qRaw.length > rawAddress.length) {
          rawAddress = qRaw;
        }
      }
    }

    // Replace linebreaks (\r\n) with commas so the full multi-line address fits in the input without truncation
    let fullAddress = rawAddress.replace(/[\r\n]+/g, ', ').replace(/,\s*,/g, ',').trim();

    // Check if distinct address lines / postcode fields exist on invoice document
    const extraParts = [
      rawInv.addressLine1,
      rawInv.addressLine2,
      rawInv.townCity || rawInv.city,
      rawInv.county,
      rawInv.customerPostcode || rawInv.postcode || rawInv.sitePostcode || rawInv.zip
    ].filter(Boolean).map((s: string) => String(s).trim());

    if (extraParts.length > 0) {
      for (const part of extraParts) {
        if (!fullAddress.toLowerCase().includes(part.toLowerCase())) {
          fullAddress = fullAddress ? `${fullAddress}, ${part}` : part;
        }
      }
    }

    if (fullAddress) {
      setDestination(fullAddress);

      // If the address doesn't contain a postcode, automatically resolve the UK postcode via geocoder
      if (!extractUkPostcode(fullAddress)) {
        geocodeUkAddress(fullAddress).then(geo => {
          if (geo?.postcode) {
            setDestination(prev => {
              if (!extractUkPostcode(prev)) {
                return `${prev}, ${geo.postcode}`;
              }
              return prev;
            });
          }
        }).catch(() => {});
      }
    } else {
      showToast(`Invoice ${inv.invoiceNumber} has no client address recorded`, 'warning');
    }

    // 2. Purpose & Reason
    const generatedPurpose = inv.jobTitle 
      ? `${inv.jobTitle} - ${inv.customerName}` 
      : `Site visit - ${inv.customerName || 'Client'} (${inv.invoiceNumber})`;
    setPurpose(generatedPurpose);

    // 3. Job / Quote Ref
    const refText = inv.jobTitle ? `${inv.jobTitle} (${inv.invoiceNumber})` : inv.invoiceNumber;
    setJobTitle(refText);
    setLinkedJobId(inv.id);

    // 4. Job Description into Notes
    if (!notes.trim() && inv.jobDescription) {
      setNotes(inv.jobDescription);
    }

    setShowInvoicePicker(false);
    showToast(`Pulled details from ${inv.invoiceNumber} (${inv.customerName})`, 'success');
  };

  const handleEdit = (entry: MileageEntry) => {
    setEditingEntryId(entry.id);
    setDate(entry.date);
    setSelectedVehicleId(entry.vehicleId || '');
    setVehicleName(entry.vehicleName || '');
    setVehicleReg(entry.vehicleReg || '');
    setPurpose(entry.purpose);
    setStartLocation(entry.startLocation || '');
    setDestination(entry.destination || '');
    setJobTitle(entry.jobTitle || '');
    setLinkedJobId(entry.jobId || undefined);
    setMiles(String(entry.miles));
    setRatePerMile(entry.ratePerMile || HMRC_STANDARD_MILEAGE_RATE);
    setStartOdometer(entry.startOdometer !== undefined ? String(entry.startOdometer) : '');
    setEndOdometer(entry.endOdometer !== undefined ? String(entry.endOdometer) : '');
    setNotes(entry.notes || '');
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setEditingEntryId(null);
    setDate(new Date().toISOString().split('T')[0]);
    setPurpose('');
    setStartLocation(baseAddress || 'Base / Workshop');
    setDestination(initialJobContext?.customerAddress || '');
    setJobTitle(initialJobContext?.jobTitle || '');
    setLinkedJobId(initialJobContext?.jobId);
    setShowInvoicePicker(false);
    setMiles('');
    setStartOdometer('');
    setEndOdometer('');
    setNotes('');
    setIsReturnTrip(false);
    setOneWayMiles(null);
    setIsCustomVehicle(false);
    setIsFormOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const milesNum = parseFloat(miles);
    if (isNaN(milesNum) || milesNum <= 0) {
      showToast('Please enter a valid mileage greater than zero', 'warning');
      return;
    }
    if (!purpose.trim()) {
      showToast('Please provide a journey purpose or reason', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      await saveMileageEntry(tradeUserId, {
        id: editingEntryId || undefined,
        vehicleId: selectedVehicleId || undefined,
        vehicleName: vehicleName || 'Trade Van',
        vehicleReg: vehicleReg || undefined,
        date,
        purpose: purpose.trim(),
        startLocation: startLocation.trim(),
        destination: destination.trim(),
        jobId: linkedJobId || initialJobContext?.jobId,
        jobTitle: jobTitle.trim() || undefined,
        miles: milesNum,
        ratePerMile,
        startOdometer: startOdometer ? parseFloat(startOdometer) : undefined,
        endOdometer: endOdometer ? parseFloat(endOdometer) : undefined,
        notes: notes.trim()
      });

      showToast(editingEntryId ? 'Mileage journey updated' : 'Mileage journey logged', 'success');
      resetForm();
    } catch (err: any) {
      showToast('Failed to save mileage: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfig.id) return;
    try {
      await deleteMileageEntry(tradeUserId, deleteConfig.id);
      showToast('Mileage entry deleted', 'info');
    } catch (err: any) {
      showToast('Failed to delete entry: ' + err.message, 'error');
    } finally {
      setDeleteConfig({ isOpen: false, id: '', description: '' });
    }
  };

  const handleExportCsv = () => {
    if (entries.length === 0) {
      showToast('No mileage entries to export', 'warning');
      return;
    }
    try {
      generateMileageCsv(entries);
      showToast('Downloaded HMRC-compliant mileage log CSV', 'success');
    } catch (err: any) {
      showToast('Export failed: ' + err.message, 'error');
    }
  };

  if (!isOpen) return null;

  // Filtered journeys
  const query = searchQuery.toLowerCase().trim();
  const filteredEntries = entries.filter(e => {
    if (!query) return true;
    return (
      e.purpose.toLowerCase().includes(query) ||
      (e.destination && e.destination.toLowerCase().includes(query)) ||
      (e.jobTitle && e.jobTitle.toLowerCase().includes(query)) ||
      (e.vehicleReg && e.vehicleReg.toLowerCase().includes(query))
    );
  });

  const totalMiles = entries.reduce((acc, curr) => acc + (curr.miles || 0), 0);
  const totalTaxClaim = entries.reduce((acc, curr) => acc + (curr.totalClaim || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-zinc-950/70 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between shrink-0 bg-zinc-50/50 dark:bg-zinc-800/30">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                Van Mileage Log
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  HMRC 45p/mi
                </span>
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Record business journeys, travel to job sites, and export spreadsheet reports for your tax return.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Metric Cards Banner */}
          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <div className="p-3 sm:p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block truncate">
                Total Business Miles
              </span>
              <div className="text-base sm:text-xl font-bold text-zinc-900 dark:text-white mt-0.5">
                {totalMiles.toFixed(1)} <span className="text-xs font-normal text-zinc-500">mi</span>
              </div>
              <p className="text-[10px] text-zinc-400 mt-0.5">{entries.length} trips logged</p>
            </div>

            <div className="p-3 sm:p-4 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-2xl border border-emerald-200/50 dark:border-emerald-800/40">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 block truncate">
                Allowable Tax Claim
              </span>
              <div className="text-base sm:text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {formatCurrency(totalTaxClaim)}
              </div>
              <p className="text-[10px] text-emerald-600/70 dark:text-emerald-400/70 mt-0.5">@ 45p per mile rate</p>
            </div>

            <div className="p-3 sm:p-4 bg-zinc-50 dark:bg-zinc-800/40 rounded-2xl border border-zinc-100 dark:border-zinc-800 flex flex-col justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block truncate">
                Quick Actions
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <button
                  onClick={handleExportCsv}
                  className="flex-1 py-1 px-2 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-bold flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all"
                  title="Export spreadsheet for accountant or Xero"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span className="hidden sm:inline">Export CSV</span>
                  <span className="sm:hidden">CSV</span>
                </button>
              </div>
            </div>
          </div>

          {/* Action Row & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search mileage by purpose, site, job, or reg..."
                className="w-full pl-9 pr-4 py-2 bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <button
              onClick={() => {
                if (isFormOpen) {
                  resetForm();
                } else {
                  setIsFormOpen(true);
                }
              }}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md active:scale-95 shrink-0"
            >
              {isFormOpen ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              <span>{isFormOpen ? 'Close Form' : '+ Log Journey'}</span>
            </button>
          </div>

          {/* Log Journey Form (Collapsible) */}
          {isFormOpen && (
            <form onSubmit={handleSubmit} className="p-4 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl border border-zinc-200 dark:border-zinc-700/80 space-y-3">
              <h3 className="text-xs font-black uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                {editingEntryId ? 'Edit Mileage Entry' : 'Log New Business Journey'}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Date */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 block mb-1">Date</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white"
                  />
                </div>

                {/* Vehicle Selection */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-zinc-500">Vehicle</label>
                    {activeVehicles.length > 0 && !isCustomVehicle && (
                      <button
                        type="button"
                        onClick={() => handleVehicleSelect('custom')}
                        className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                      >
                        + Other Van
                      </button>
                    )}
                    {isCustomVehicle && activeVehicles.length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleVehicleSelect(activeVehicles[0].id)}
                        className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                      >
                        Select Fleet Van
                      </button>
                    )}
                  </div>
                  {activeVehicles.length > 0 && !isCustomVehicle ? (
                    <select
                      value={selectedVehicleId}
                      onChange={e => handleVehicleSelect(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white"
                    >
                      {activeVehicles.map(v => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.registration || 'No Reg'})
                        </option>
                      ))}
                      <option value="custom">+ Different / Hire Vehicle</option>
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="e.g. Ford Transit (VA21 XYZ) or Hire Van"
                      value={vehicleName}
                      onChange={e => setVehicleName(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white"
                    />
                  )}
                </div>

                {/* Purpose / Journey Type */}
                <div>
                  <label className="text-[10px] font-bold text-zinc-500 block mb-1">Purpose / Reason</label>
                  <input
                    type="text"
                    placeholder="e.g. Site survey, Travis Perkins collection, Callout"
                    value={purpose}
                    onChange={e => setPurpose(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Start Location */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-bold text-zinc-500">From (Start)</label>
                    {baseAddress && (
                      <button
                        type="button"
                        onClick={() => setStartLocation(baseAddress)}
                        className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold hover:underline flex items-center gap-1"
                        title="Reset to your registered workshop / business base address"
                      >
                        <Building className="w-2.5 h-2.5" />
                        <span>Use Base</span>
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder={baseAddress ? `e.g. ${baseAddress}` : "e.g. Unit 4 Trade Park, Guildford GU1 4RF"}
                    value={startLocation}
                    onChange={e => setStartLocation(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white"
                  />
                </div>

                {/* Destination */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400">To / Client Site</label>
                    <button
                      type="button"
                      onClick={() => setShowInvoicePicker(prev => !prev)}
                      className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1"
                      title="Select an existing invoice to auto-fill client site address, purpose, and job ref"
                    >
                      <FileText className="w-2.5 h-2.5" />
                      <span>{showInvoicePicker ? 'Close' : 'Pull from Invoice'}</span>
                    </button>
                  </div>
                  {showInvoicePicker && (
                    <div className="mb-2 p-2 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl space-y-1 animate-in fade-in duration-150">
                      <label className="text-[10px] font-semibold text-emerald-900 dark:text-emerald-300 block">
                        Select Existing Invoice:
                      </label>
                      {invoices.length === 0 ? (
                        <p className="text-[11px] text-zinc-500 italic py-0.5">No invoices found for this account.</p>
                      ) : (
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const selected = invoices.find(i => i.id === e.target.value);
                            if (selected) handleSelectInvoice(selected);
                          }}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        >
                          <option value="" disabled>Choose an invoice...</option>
                          {invoices.map((inv) => (
                            <option key={inv.id} value={inv.id}>
                              {inv.invoiceNumber || 'INV'} • {inv.customerName || 'Client'}{inv.jobTitle ? ` — ${inv.jobTitle}` : ''}{inv.customerAddress ? ` (${inv.customerAddress})` : ' (No address)'}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                  <input
                    type="text"
                    placeholder="e.g. 14 High St, Guildford GU1 3AA"
                    value={destination}
                    onChange={e => setDestination(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white"
                  />
                </div>

                {/* Linked Job (Optional) */}
                <div>
                  <label className="text-[10px] font-medium text-zinc-600 dark:text-zinc-400 block mb-1">Job / Quote Ref (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Bathroom Refurb or Q-1002"
                    value={jobTitle}
                    onChange={e => setJobTitle(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl text-xs text-zinc-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Automated Road Route Calculation Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-emerald-50/70 dark:bg-emerald-950/25 rounded-xl border border-emerald-200/50 dark:border-emerald-800/40">
                <div className="flex items-center gap-1.5 text-xs text-emerald-800 dark:text-emerald-300 font-medium">
                  <Navigation className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Auto-calculate road miles from postcodes / addresses</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleReturnTrip}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                      isReturnTrip 
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' 
                        : 'bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-emerald-500'
                    }`}
                    title="Double the miles for a two-way round trip"
                  >
                    🔁 Return Trip (2x)
                  </button>
                  <button
                    type="button"
                    onClick={handleCalculateRoute}
                    disabled={isCalculatingRoute || !destination.trim()}
                    className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isCalculatingRoute ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Route className="w-3.5 h-3.5" />
                    )}
                    <span>Calculate Miles</span>
                  </button>
                </div>
              </div>

              {/* Miles and Odometer Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3 bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700/60">
                <div>
                  <label className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 block mb-1">
                    Miles Driven *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    placeholder="e.g. 24.5"
                    value={miles}
                    onChange={e => setMiles(e.target.value)}
                    required
                    className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs font-medium text-zinc-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-medium text-zinc-500 block mb-1">Rate (£/mile)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={ratePerMile}
                    onChange={e => setRatePerMile(parseFloat(e.target.value) || HMRC_STANDARD_MILEAGE_RATE)}
                    className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-400 block mb-1">Start Odo (opt)</label>
                  <input
                    type="number"
                    placeholder="e.g. 45100"
                    value={startOdometer}
                    onChange={e => handleOdometerChange(e.target.value, endOdometer)}
                    className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-zinc-400 block mb-1">End Odo (opt)</label>
                  <input
                    type="number"
                    placeholder="e.g. 45125"
                    value={endOdometer}
                    onChange={e => handleOdometerChange(startOdometer, e.target.value)}
                    className="w-full px-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Total Claim Preview */}
              {parseFloat(miles) > 0 && (
                <div className="flex items-center justify-between text-xs px-1 text-zinc-600 dark:text-zinc-300">
                  <span>HMRC Allowable Claim for this journey:</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(Number(((parseFloat(miles) || 0) * ratePerMile).toFixed(2)))}
                  </span>
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-1.5 bg-zinc-200 hover:bg-zinc-300 dark:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                  <span>{editingEntryId ? 'Update Journey' : 'Save Mileage Entry'}</span>
                </button>
              </div>
            </form>
          )}

          {/* List of Journeys */}
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-400">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
              <p className="text-xs">Loading mileage logs...</p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="py-12 text-center bg-zinc-50 dark:bg-zinc-800/30 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-6 space-y-2">
              <Truck className="w-8 h-8 text-zinc-400 mx-auto" />
              <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">No journeys recorded</p>
              <p className="text-[11px] text-zinc-400 max-w-sm mx-auto">
                Log your daily van trips to jobs, merchants, or client quotes to build an HMRC-compliant mileage log.
              </p>
              <button
                onClick={() => setIsFormOpen(true)}
                className="mt-2 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Log First Journey
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEntries.map(entry => {
                const [y, m, d] = (entry.date || '').split('-');
                const ukDate = y && m && d ? `${d}/${m}/${y}` : entry.date;
                return (
                <div
                  key={entry.id}
                  className="p-3 bg-white dark:bg-zinc-800/60 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-emerald-500/30 transition-all shadow-sm"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[11px] font-mono font-medium text-zinc-500 dark:text-zinc-400 shrink-0">
                        {ukDate}
                      </span>
                      {entry.vehicleReg && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-300 uppercase shrink-0">
                          {entry.vehicleReg}
                        </span>
                      )}
                      <h4 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                        {entry.purpose}
                      </h4>
                    </div>

                    <div className="flex items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                      {entry.startLocation && entry.destination ? (
                        <span className="truncate">
                          {entry.startLocation} &rarr; {entry.destination}
                        </span>
                      ) : (
                        <span>{entry.vehicleName || 'Primary Van'}</span>
                      )}
                      {entry.jobTitle && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium truncate">
                            Job: {entry.jobTitle}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right side: Miles, Claim & Actions */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800">
                    <div className="text-left sm:text-right shrink-0">
                      <div className="text-xs sm:text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        {entry.miles.toFixed(1)} miles
                      </div>
                      <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(entry.totalClaim)} claim
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => handleEdit(entry)}
                        className="p-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-700 dark:text-zinc-200 rounded-lg transition-all"
                        title="Edit journey"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfig({
                          isOpen: true,
                          id: entry.id,
                          description: `${entry.miles} mi on ${entry.date} (${entry.purpose})`
                        })}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-lg transition-all"
                        title="Delete journey"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          )}

          {/* Statutory Financial Notice */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-300 mt-4">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="font-bold">AI Assistant Financial Disclaimer:</strong> TribeTrade is a trade productivity assistant, not a chartered accountant or registered tax adviser. HMRC simplified vehicle expenses allow 45p per business mile up to 10,000 miles (25p thereafter) when using your own vehicle. All travel logs and claims must be checked with your accountant before filing.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 flex items-center justify-between shrink-0">
          <button
            onClick={handleExportCsv}
            disabled={entries.length === 0}
            className="px-3 py-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Download Mileage Spreadsheet</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-white rounded-xl text-xs font-bold transition-all active:scale-95"
          >
            Close
          </button>
        </div>
      </div>

      {/* Delete Confirmation */}
      <ConfirmModal
        isOpen={deleteConfig.isOpen}
        title="Delete Mileage Entry"
        message={`Are you sure you want to remove the journey for ${deleteConfig.description}? This cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onClose={() => setDeleteConfig({ isOpen: false, id: '', description: '' })}
      />
    </div>
  );
}
