/** Visit types shown on the booking page. Moves into the database (per practice) in a later phase. */
export interface VisitType { id: string; name: string; duration: number; providers: string[]; description?: string }

export const VISIT_TYPES: VisitType[] = [
  { id: 'cleaning', name: 'Cleaning & Checkup', duration: 45, providers: ['Dr. Mensah', 'Dr. Patel', 'RDH Nguyen', 'RDH Brooks'] },
  { id: 'exam', name: 'New Patient Comprehensive Exam', duration: 60, providers: ['Dr. Mensah', 'Dr. Patel'] },
  { id: 'emergency', name: 'Emergency Tooth Pain / Exam', duration: 30, providers: ['Dr. Mensah', 'Dr. Patel'] },
  { id: 'cosmetic', name: 'Cosmetic Dentistry Consultation', duration: 30, providers: ['Dr. Patel'] },
  { id: 'whitening', name: 'In-Office Teeth Whitening', duration: 45, providers: ['Dr. Patel', 'RDH Brooks'] },
  { id: 'recall', name: 'Perio Recall Maintenance', duration: 30, providers: ['RDH Nguyen', 'RDH Brooks'] },
];
