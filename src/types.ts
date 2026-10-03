export type PaymentStatus = 'PENDING' | 'PARTIAL' | 'PAID';
export type MemberStatus = 'active' | 'inactive';
export type PaymentMethod = 'Cash' | 'UPI' | 'PhonePe' | 'Google Pay' | 'Bank Transfer' | 'Cheque' | 'Other';

export interface User {
  id: string;
  login_id: string;
  username: string;
  name: string;
  role: 'admin' | 'manager';
  recovery_email?: string;
  recovery_phone?: string;
  is_active?: boolean;
  password_changed_at?: string | null;
  password_expires_at?: string | null;
  is_password_expired?: boolean;
  security_question?: string;
  created_at: string;
  updated_at?: string;
  last_login_at?: string;
}

export interface ChitMonthRule {
  id?: string;
  chit_id?: string;
  month_number: number;
  month_name: string;
  pre_lift_payment: number;
  post_lift_payment: number;
  monthly_chit_value: number;
  expected_lift_payout: number;
}

export interface Chit {
  id: string;
  name: string;
  chit_value: number;
  monthly_chit_value?: number;
  total_months: number;
  total_members: number;
  start_month: string;
  end_month: string;
  status: 'active' | 'completed' | 'draft';
  created_at: string;
  updated_at: string;
  // Computed / aggregated
  current_month?: number;
  active_members_count?: number;
  total_collected?: number;
  total_pending?: number;
  total_due?: number;
  paid_members_count?: number;
  pending_members_count?: number;
  selected_month?: number;
  lifted_members_count?: number;
  unlifted_members_count?: number;
  members?: Member[];
  rules?: ChitMonthRule[];
  total_projected_profit?: number;
  total_projected_collection?: number;
  total_projected_payout?: number;
  projected_monthly?: Array<{
    month_number: number;
    month_name: string;
    pre_lift_payment: number;
    post_lift_payment: number;
    pre_lift_count: number;
    post_lift_count: number;
    projected_collection: number;
    lift_payout: number;
    profit_or_loss: number;
    is_profit: boolean;
    manager_add_required?: number;
  }>;
}

export interface Member {
  id: string;
  chit_id: string;
  customer_name: string;
  phone: string;
  ticket_number: string;
  status: MemberStatus;
  join_date: string;
  created_at: string;
  // Lift info joined
  lift_id?: string | null;
  lift_status?: 'not_lifted' | 'lifted';
  lift_month?: number | null;
  lift_amount_received?: number | null; // Total paid to customer so far
  lift_amount?: number | null; // Configured / agreed lift payout
  remaining_payout?: number | null; // Remaining lift payout
  payout_status?: 'PARTIAL' | 'PAID' | string | null;
  lift_date?: string | null;
  payment_method?: PaymentMethod | string | null;
  reference_number?: string | null;
  lift_payment_method?: PaymentMethod | string | null;
  lift_reference_number?: string | null;
  lift_notes?: string | null;
  lift_status_text?: string | null;
  lift_created_at?: string | null;
  lift_updated_at?: string | null;
  transactions?: LiftPayoutTransaction[];
}

export interface LiftPayoutTransaction {
  id: string;
  lift_id: string;
  chit_id: string;
  member_id: string;
  amount: number;
  payment_date: string;
  payment_method: PaymentMethod | string;
  reference_number?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface LiftDetail {
  id: string;
  chit_id: string;
  member_id: string;
  lift_month: number;
  lift_amount_received: number; // Total amount paid to customer
  lift_amount?: number; // Configured / agreed lift payout
  remaining_payout?: number; // Remaining lift payout
  payout_status?: 'PARTIAL' | 'PAID' | string;
  lift_date: string;
  payment_method?: PaymentMethod | string;
  reference_number?: string | null;
  notes?: string | null;
  status?: string;
  created_at: string;
  updated_at?: string | null;
  customer_name?: string;
  phone?: string;
  ticket_number?: string;
  transactions?: LiftPayoutTransaction[];
}

export interface MonthlyDue {
  id: string;
  chit_id: string;
  member_id: string;
  month_number: number;
  month_name: string;
  due_amount: number;
  paid_amount: number;
  balance_amount: number;
  status: PaymentStatus;
  due_date: string;
  generated_at: string;
  // Augmented details
  customer_name?: string;
  phone?: string;
  ticket_number?: string;
  chit_name?: string;
  chit_current_month?: number;
  lift_status?: 'not_lifted' | 'lifted';
  lift_id?: string | null;
  lift_month?: number | null;
  lift_amount?: number | null;
  lift_amount_received?: number | null;
  remaining_payout?: number | null;
  payout_status?: 'PARTIAL' | 'PAID' | string | null;
  lift_date?: string | null;
  last_payment_method?: PaymentMethod | string | null;
  last_payment_date?: string | null;
  last_payment_reference?: string | null;
  last_payment_notes?: string | null;
  last_payment_amount?: number | null;
  last_payment_updated_at?: string | null;
}

export interface Payment {
  id: string;
  monthly_due_id: string;
  chit_id: string;
  member_id: string;
  month_number: number;
  month_name: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_no: string;
  notes: string;
  payment_date: string;
  created_at: string;
  updated_at?: string | null;
  customer_name?: string;
  ticket_number?: string;
  phone?: string;
  chit_name?: string;
}

export interface DashboardStats {
  totalActiveChits: number;
  totalMembers: number;
  todayCollection: number;
  thisMonthCollection: number;
  totalPendingAmount: number;
  totalOutstanding: number;
  totalCollected?: number;
  totalPaidCustomers: number;
  totalPendingCustomers: number;
  recentPayments?: any[];
  totalDue?: number;
  totalCollection?: number;
  totalPending?: number;
  totalAssumedProfit?: number;
  totalProjectedChitProfit?: number;
  totalProjectedCollection?: number;
  totalProjectedLiftPayout?: number;
  actualCurrentMonthProfit?: number;
  projectedProfitBreakdown?: Array<{
    chit_id: string;
    chit_name: string;
    chit_value: number;
    total_months: number;
    total_members: number;
    status: string;
    total_projected_profit: number;
    total_projected_collection: number;
    total_projected_payout: number;
    monthly_projections: Array<{
      month_number: number;
      month_name: string;
      pre_lift_payment: number;
      post_lift_payment: number;
      pre_lift_count: number;
      post_lift_count: number;
      projected_collection: number;
      lift_payout: number;
      profit_or_loss: number;
      is_profit: boolean;
      manager_add_required?: number;
    }>;
  }>;
  assumedProfitBreakdown?: any[];
}

export interface ChitSummaryCardData {
  chit: Chit;
  currentMonth: number;
  todayCollection: number;
  pendingAmount: number;
  totalCollection: number;
}

export interface MonthlyProfitDetails {
  month_number: number;
  month_name?: string;
  // 1. PROJECTED MONTHLY PROFIT (Configured rules only, independent of payments)
  projected_collection?: number;
  configured_lift_payout?: number;
  projected_profit?: number;
  is_profit?: boolean;
  manager_add_required?: number;
  pre_lift_payment?: number;
  post_lift_payment?: number;
  pre_lift_count?: number;
  post_lift_count?: number;
  total_members?: number;

  // 2. ACTUAL MONTHLY PROFIT (Based on money received)
  actual_collection?: number;
  actual_lift_payout?: number;
  actual_profit?: number;
  actual_manager_add_required?: number;

  // Legacy / compatibility fields
  total_collection: number;
  total_due?: number;
  lift_payout: number | null;
  profit: number | null;
  has_lift: boolean;
  is_projected?: boolean;
  lifted_member_name: string | null;
  ticket_number?: string | null;
}
