import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { MileageEntry, HMRC_STANDARD_MILEAGE_RATE } from '../types/vehicle';
import { logger } from './logger';

/**
 * Real-time subscription to van mileage entries for a trade user.
 */
export function subscribeMileageEntries(
  tradeUserId: string,
  onUpdate: (entries: MileageEntry[]) => void
): () => void {
  if (!tradeUserId) {
    onUpdate([]);
    return () => {};
  }

  const entriesRef = collection(db, 'trade_users', tradeUserId, 'mileageEntries');
  const q = query(entriesRef, orderBy('date', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const list: MileageEntry[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const miles = typeof data.miles === 'number' ? data.miles : parseFloat(data.miles) || 0;
        const ratePerMile = typeof data.ratePerMile === 'number' ? data.ratePerMile : HMRC_STANDARD_MILEAGE_RATE;
        const totalClaim = typeof data.totalClaim === 'number' ? data.totalClaim : Number((miles * ratePerMile).toFixed(2));

        return {
          id: docSnap.id,
          vehicleId: data.vehicleId || '',
          vehicleReg: data.vehicleReg || '',
          vehicleName: data.vehicleName || '',
          date: data.date || new Date().toISOString().split('T')[0],
          startOdometer: data.startOdometer,
          endOdometer: data.endOdometer,
          miles,
          purpose: data.purpose || 'Trade visit',
          startLocation: data.startLocation || '',
          destination: data.destination || '',
          jobId: data.jobId || '',
          jobTitle: data.jobTitle || '',
          ratePerMile,
          totalClaim,
          notes: data.notes || '',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
          authorId: data.authorId || ''
        } as MileageEntry;
      });
      onUpdate(list);
    },
    (err) => {
      logger.error('Error subscribing to mileage entries:', err);
      onUpdate([]);
    }
  );
}

/**
 * Create or update a mileage log entry in Firestore.
 */
export async function saveMileageEntry(
  tradeUserId: string,
  entry: Partial<MileageEntry>
): Promise<string> {
  if (!tradeUserId) throw new Error('Missing tradeUserId');

  const miles = typeof entry.miles === 'number' ? entry.miles : parseFloat(entry.miles as any) || 0;
  const ratePerMile = typeof entry.ratePerMile === 'number' ? entry.ratePerMile : HMRC_STANDARD_MILEAGE_RATE;
  const totalClaim = Number((miles * ratePerMile).toFixed(2));

  const entriesRef = collection(db, 'trade_users', tradeUserId, 'mileageEntries');
  const entryId = entry.id || `mileage_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const docRef = doc(entriesRef, entryId);

  const rawPayload: any = {
    ...entry,
    id: entryId,
    miles,
    ratePerMile,
    totalClaim,
    date: entry.date || new Date().toISOString().split('T')[0],
    updatedAt: serverTimestamp()
  };

  if (!entry.id) {
    rawPayload.createdAt = serverTimestamp();
  }

  // Filter out any undefined values so Firestore does not throw an error
  const payload = Object.fromEntries(
    Object.entries(rawPayload).filter(([_, v]) => v !== undefined)
  );

  await setDoc(docRef, payload, { merge: true });
  return entryId;
}

/**
 * Delete a mileage entry.
 */
export async function deleteMileageEntry(
  tradeUserId: string,
  entryId: string
): Promise<void> {
  if (!tradeUserId || !entryId) return;
  const docRef = doc(db, 'trade_users', tradeUserId, 'mileageEntries', entryId);
  await deleteDoc(docRef);
}

/**
 * Generate and trigger download of an HMRC / accountant compliant CSV mileage log.
 */
export function generateMileageCsv(
  entries: MileageEntry[],
  filenamePrefix = 'TribeTrade_HMRC_Mileage_Log'
): void {
  const headers = [
    'Date',
    'Vehicle Name',
    'Registration',
    'Journey Purpose / Description',
    'Start Location',
    'Destination',
    'Job Ref / Title',
    'Start Odometer',
    'End Odometer',
    'Business Miles',
    'HMRC Rate (£/mile)',
    'Total Claim (£)',
    'Notes'
  ];

  const escapeCell = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = entries.map((entry) => [
    escapeCell(entry.date),
    escapeCell(entry.vehicleName || 'Primary Van'),
    escapeCell(entry.vehicleReg || ''),
    escapeCell(entry.purpose),
    escapeCell(entry.startLocation || ''),
    escapeCell(entry.destination || ''),
    escapeCell(entry.jobTitle || entry.jobId || ''),
    escapeCell(entry.startOdometer !== undefined ? entry.startOdometer : ''),
    escapeCell(entry.endOdometer !== undefined ? entry.endOdometer : ''),
    escapeCell(entry.miles.toFixed(1)),
    escapeCell(entry.ratePerMile.toFixed(2)),
    escapeCell(entry.totalClaim.toFixed(2)),
    escapeCell(entry.notes || '')
  ]);

  // Summary Row at the bottom
  const totalMiles = entries.reduce((acc, curr) => acc + (curr.miles || 0), 0);
  const totalClaim = entries.reduce((acc, curr) => acc + (curr.totalClaim || 0), 0);

  const summaryRow = [
    escapeCell('TOTALS'),
    escapeCell(''),
    escapeCell(''),
    escapeCell(`${entries.length} logged business trips`),
    escapeCell(''),
    escapeCell(''),
    escapeCell(''),
    escapeCell(''),
    escapeCell(''),
    escapeCell(totalMiles.toFixed(1)),
    escapeCell(''),
    escapeCell(totalClaim.toFixed(2)),
    escapeCell('HMRC approved mileage rate compliance')
  ];

  const csvContent = [
    headers.join(','),
    ...rows.map(r => r.join(',')),
    summaryRow.join(',')
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const dateStr = new Date().toISOString().split('T')[0];
  link.setAttribute('download', `${filenamePrefix}_${dateStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
