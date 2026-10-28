import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface Dashboard {
  asOf: string;
  kpis: {
    billedMtd: number;
    billedYtd: number;
    receivedMtd: number;
    receivedYtd: number;
    costMtd: number;
    costYtd: number;
    grossMarginYtdPct: number | null;
    arOutstanding: number;
    arOverdue: number;
    apOutstanding: number;
    apOverdue: number;
    backlog: number;
    cashNext4Weeks: number | null;
  };
  months: { month: string; billed: number; received: number; cost: number }[];
  pipeline: {
    leads: { status: string; count: number; value: number }[];
    quotesOpen: number;
    quotesOpenValue: number;
    winRatePct: number | null;
    quotesWon: number;
    quotesDecided: number;
  };
  projects: {
    id: string;
    code: string;
    name: string;
    managerName: string | null;
    progressPct: number;
    plannedPct: number;
    variancePct: number;
    budgetUsedPct: number | null;
    marginPct: number | null;
    contractAmount: number | null;
    behind: boolean;
    overBudget: boolean;
  }[];
  alerts: {
    approvalsPending: number;
    permitsSoon: number;
    permitsExpired: number;
    ticketsOpen: number;
    ticketsUrgent: number;
    lowStock: number;
    milestonesReady: number;
    overdueReceivables: number;
    overduePayables: number;
  };
  satisfaction: { count: number; overall: number | null; recommendPct: number | null };
}

@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);

  get(): Observable<Dashboard> {
    return this.http.get<Dashboard>('/api/dashboard');
  }
}
