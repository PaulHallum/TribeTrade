export type ComplianceType = 'mot' | 'insurance' | 'service' | 'tax' | 'custom';

export interface VehicleComplianceItem {
  id: string;
  type: ComplianceType;
  title: string; // e.g. "MOT", "Vehicle Insurance", "Annual Service", "Road Tax"
  dueDate: string; // YYYY-MM-DD
  notes?: string; // Policy number, garage name, testing station, or reference
  costEstimate?: number;
  lastCompletedDate?: string;
}

export type VehicleType = 'van' | 'pickup' | 'car' | 'tipper' | 'trailer' | 'other';

export interface Vehicle {
  id: string;
  name: string; // e.g. "Primary Van - Ford Transit"
  registration: string; // UK registration plate (e.g. "VA21 XYZ")
  makeModel?: string;
  vehicleType?: VehicleType;
  complianceItems: VehicleComplianceItem[];
  createdAt?: string;
  updatedAt?: string;
}

export function createDefaultComplianceItems(): VehicleComplianceItem[] {
  return [
    {
      id: 'mot',
      type: 'mot',
      title: 'MOT',
      dueDate: '',
      notes: ''
    },
    {
      id: 'insurance',
      type: 'insurance',
      title: 'Vehicle Insurance',
      dueDate: '',
      notes: ''
    },
    {
      id: 'service',
      type: 'service',
      title: 'Annual Service',
      dueDate: '',
      notes: ''
    },
    {
      id: 'tax',
      type: 'tax',
      title: 'Road Tax (VED)',
      dueDate: '',
      notes: ''
    }
  ];
}

export const HMRC_STANDARD_MILEAGE_RATE = 0.45; // 45p per mile for first 10,000 miles (HMRC simplified expenses)

export interface MileageEntry {
  id: string;
  vehicleId?: string;
  vehicleReg?: string;
  vehicleName?: string;
  date: string; // YYYY-MM-DD
  startOdometer?: number;
  endOdometer?: number;
  miles: number;
  purpose: string; // e.g. "Site survey", "Collection from Screwfix", "Emergency callout"
  startLocation?: string;
  destination?: string;
  jobId?: string;
  jobTitle?: string;
  ratePerMile: number; // HMRC rate default 0.45
  totalClaim: number; // miles * ratePerMile
  notes?: string;
  createdAt?: string;
  authorId?: string;
}
