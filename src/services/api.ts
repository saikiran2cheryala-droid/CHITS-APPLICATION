import { User, Chit, Member, ChitMonthRule, MonthlyDue, Payment, DashboardStats, MonthlyProfitDetails } from '../types';

const TOKEN_KEY = 'chit_manager_auth_token';
const USER_KEY = 'chit_manager_auth_user';

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setAuthSession(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getStoredUser(): User | null {
  const u = localStorage.getItem(USER_KEY);
  if (!u) return null;
  try {
    return JSON.parse(u);
  } catch {
    return null;
  }
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && !endpoint.includes('/api/auth/login')) {
      clearAuthSession();
    }
    let errMessage = `Error ${response.status}: ${response.statusText}`;
    try {
      const errorData = await response.json();
      if (errorData.error) errMessage = errorData.error;
    } catch {
      // Ignore JSON parse failure
    }
    throw new Error(errMessage);
  }

  return response.json();
}

export const api = {
  auth: {
    login: async (loginId: string, password: string) => {
      const res = await request<{ user: User; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ loginId, password }),
      });
      if (res.token && res.user) {
        setAuthSession(res.token, res.user);
      }
      return res;
    },
    me: () => request<{ user: User; token?: string }>('/api/auth/me'),
    logout: async () => {
      try {
        await request<{ success: boolean }>('/api/auth/logout', { method: 'POST' });
      } finally {
        clearAuthSession();
      }
    },
    forgotPassword: async (loginId: string) => {
      return request<{
        success: boolean;
        message: string;
        maskedPhone?: string;
        maskedEmail?: string;
        devCode?: string;
      }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ loginId }),
      });
    },
    verifyRecovery: async (loginId: string, recoveryCode: string) => {
      return request<{
        success: boolean;
        resetToken: string;
      }>('/api/auth/verify-recovery', {
        method: 'POST',
        body: JSON.stringify({ loginId, recoveryCode }),
      });
    },
    resetPassword: async (payload: { resetToken: string; newPassword: string; confirmPassword: string }) => {
      return request<{
        success: boolean;
        message: string;
      }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    changePassword: async (payload: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
      return request<{
        success: boolean;
        message: string;
      }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    updateSecuritySettings: async (payload: { name?: string; recovery_email?: string; recovery_phone?: string }) => {
      return request<{
        success: boolean;
        user: User;
      }>('/api/auth/update-security-settings', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
  },

  dashboard: {
    getStats: () =>
      request<{ stats: DashboardStats; chits: (Chit & { today_collection: number; pending_amount: number; total_collected: number; current_month: number })[] }>('/api/dashboard/stats'),
  },

  chits: {
    list: () => request<Chit[]>('/api/chits'),
    get: (id: string, month?: number) =>
      request<Chit & { rules: ChitMonthRule[]; members: Member[]; total_due?: number; total_collected: number; total_pending: number; paid_members_count?: number; pending_members_count?: number; selected_month?: number }>(
        `/api/chits/${id}${month ? `?month=${month}` : ''}`
      ),
    create: (payload: {
      name: string;
      chit_value: number;
      total_months: number;
      total_members: number;
      start_month: string;
      end_month: string;
      members: { customer_name: string; phone: string; ticket_number: string }[];
      rules: ChitMonthRule[];
    }) =>
      request<Chit>('/api/chits', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (
      id: string,
      payload: {
        name?: string;
        status?: string;
        chit_value?: number;
        start_month?: string;
        end_month?: string;
        total_months?: number;
        total_members?: number;
      }
    ) =>
      request<Chit>(`/api/chits/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    delete: (id: string) =>
      request<{ success: boolean; message?: string }>(`/api/chits/${id}`, { method: 'DELETE' }),
    updateRules: (id: string, rules: ChitMonthRule[]) =>
      request<{ success: boolean; message: string }>(`/api/chits/${id}/rules`, {
        method: 'PUT',
        body: JSON.stringify({ rules }),
      }),
    updateLiftPayouts: (id: string, payouts: { month_number: number; lift_payout: number }[]) =>
      request<{ success: boolean; message: string; updated_count: number }>(`/api/chits/${id}/rules/lift-payouts`, {
        method: 'PUT',
        body: JSON.stringify({ payouts }),
      }),
  },

  members: {
    list: (chitId: string) => request<Member[]>(`/api/chits/${chitId}/members`),
    create: (chitId: string, payload: { customer_name: string; phone: string; ticket_number: string }) =>
      request<Member>(`/api/chits/${chitId}/members`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    importBatch: (
      chitId: string,
      customers: { customer_name: string; phone: string; ticket_number?: string }[]
    ) =>
      request<{
        success: boolean;
        imported_count: number;
        skipped_count: number;
        duplicates_count: number;
        invalid_count: number;
        limit_skipped_count: number;
        imported: any[];
        skipped: any[];
      }>(`/api/chits/${chitId}/members/import`, {
        method: 'POST',
        body: JSON.stringify({ customers }),
      }),
    update: (memberId: string, payload: Partial<Member>) =>
      request<Member>(`/api/members/${memberId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    delete: (memberId: string) =>
      request<{ success: boolean; message?: string }>(`/api/members/${memberId}`, { method: 'DELETE' }),
    getProfile: (memberId: string) =>
      request<{
        member: Member & { chit_name: string; chit_value: number; total_months: number; start_month: string; end_month: string };
        dues: MonthlyDue[];
        payments: Payment[];
        total_paid: number;
        total_outstanding: number;
      }>(`/api/members/${memberId}/profile`),
  },

  monthView: {
    getData: (chitId: string, monthNumber: number) =>
      request<{
        rule: ChitMonthRule;
        dues: MonthlyDue[];
        stats: {
          total_due: number;
          total_paid: number;
          total_balance: number;
          count_paid: number;
          count_partial: number;
          count_pending: number;
        };
        lift: { id: string; lift_month: number; lift_amount_received: number; lift_date: string; notes?: string; customer_name: string; ticket_number: string } | null;
        profit?: MonthlyProfitDetails;
      }>(`/api/chits/${chitId}/months/${monthNumber}`),
    getProfit: (chitId: string, monthNumber: number) =>
      request<MonthlyProfitDetails>(`/api/chits/${chitId}/months/${monthNumber}/profit`),
  },

  lift: {
    record: (chitId: string, payload: {
      member_id: string;
      lift_month: number;
      lift_amount_received?: number;
      lift_amount?: number;
      lift_date: string;
      payment_method: string;
      reference_number?: string;
      notes?: string;
    }) =>
      request<{ success: boolean; message: string; lift?: any }>(`/api/chits/${chitId}/lift`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    update: (chitId: string, memberId: string, payload: {
      lift_month: number;
      lift_amount_received?: number;
      lift_amount?: number;
      lift_date: string;
      payment_method: string;
      reference_number?: string;
      notes?: string;
    }) =>
      request<{ success: boolean; message: string; lift?: any }>(`/api/chits/${chitId}/lift/${memberId}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    cancel: (chitId: string, memberId: string) =>
      request<{ success: boolean; message: string }>(`/api/chits/${chitId}/lift/${memberId}`, {
        method: 'DELETE',
      }),
  },

  payments: {
    record: (payload: {
      monthly_due_id: string;
      amount: number;
      payment_method: string;
      reference_no?: string;
      notes?: string;
      payment_date?: string;
      allow_overpayment?: boolean;
    }) =>
      request<{ payment: Payment; updatedDue: MonthlyDue }>('/api/payments', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    list: (params: { chit_id?: string; member_id?: string; limit?: number } = {}) => {
      const sp = new URLSearchParams();
      if (params.chit_id) sp.set('chit_id', params.chit_id);
      if (params.member_id) sp.set('member_id', params.member_id);
      if (params.limit) sp.set('limit', String(params.limit));
      return request<Payment[]>(`/api/payments?${sp.toString()}`);
    },
  },

  reports: {
    get: (chitId: string) =>
      request<{
        chit: Chit;
        monthlyCollection: any[];
        customerWise: any[];
        liftedMembers: any[];
        unliftedMembers: any[];
        totals: {
          grand_total_due: number;
          grand_total_collected: number;
          grand_total_outstanding: number;
        };
      }>(`/api/chits/${chitId}/reports`),
  },

  search: {
    query: (q: string) =>
      request<
        {
          id: string;
          customer_name: string;
          phone: string;
          ticket_number: string;
          chit_id: string;
          chit_name: string;
          chit_value: number;
          lift_month?: number | null;
          lift_status: 'lifted' | 'not_lifted';
        }[]
      >(`/api/search?q=${encodeURIComponent(q)}`),
  },
};
