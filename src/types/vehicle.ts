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
