import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResult } from '../../core/api/api-error';

export type ProjectStatus = 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
type Tone = '' | 'ok' | 'warn' | 'danger';

export const PROJECT_STATUS: Record<ProjectStatus, { label: string; tone: Tone }> = {
  planning: { label: 'เตรียมงาน', tone: '' },
  active: { label: 'กำลังก่อสร้าง', tone: 'warn' },
  on_hold: { label: 'หยุดชั่วคราว', tone: 'danger' },
  completed: { label: 'ส่งมอบแล้ว', tone: 'ok' },
  cancelled: { label: 'ยกเลิก', tone: '' },
};

export const WEATHER: Record<string, { label: string; icon: string }> = {
  sunny: { label: 'แดดจัด', icon: 'sunny' },
  cloudy: { label: 'มีเมฆ', icon: 'cloud' },
  rain: { label: 'ฝนตก', icon: 'rainy' },
  storm: { label: 'พายุ', icon: 'thunderstorm' },
};

export const DAILY_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: 'ร่าง', tone: '' },
  submitted: { label: 'ส่งแล้ว', tone: 'warn' },
  acknowledged: { label: 'PM รับทราบ', tone: 'ok' },
};

export const SEVERITY: Record<string, { label: string; tone: Tone }> = {
  low: { label: 'ต่ำ', tone: '' },
  medium: { label: 'ปานกลาง', tone: 'warn' },
  high: { label: 'สูง', tone: 'danger' },
  critical: { label: 'วิกฤต', tone: 'danger' },
};

export const ISSUE_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: 'เปิด', tone: 'danger' },
  in_progress: { label: 'กำลังแก้', tone: 'warn' },
  resolved: { label: 'แก้แล้ว', tone: 'ok' },
  closed: { label: 'ปิด', tone: '' },
};

export const PUNCH_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: 'ต้องแก้ไข', tone: 'danger' },
  fixed: { label: 'แก้แล้ว รอตรวจ', tone: 'warn' },
  verified: { label: 'ตรวจรับแล้ว', tone: 'ok' },
};

export const QC_RESULT: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'ยังตรวจไม่ครบ', tone: '' },
  pass: { label: 'ผ่าน', tone: 'ok' },
  fail: { label: 'ไม่ผ่าน', tone: 'danger' },
  conditional: { label: 'ผ่านแบบมีเงื่อนไข', tone: 'warn' },
};

export const SAFETY_KIND: Record<string, { label: string; icon: string }> = {
  toolbox: { label: 'Toolbox talk', icon: 'record_voice_over' },
  inspection: { label: 'ตรวจความปลอดภัย', icon: 'fact_check' },
  training: { label: 'อบรม', icon: 'school' },
  near_miss: { label: 'เหตุเกือบเกิด', icon: 'warning' },
  incident: { label: 'อุบัติเหตุ', icon: 'emergency' },
};

export const WORKER_TRADES = ['ช่างปูน', 'ช่างไม้', 'ช่างเหล็ก', 'ช่างไฟฟ้า', 'ช่างประปา', 'ช่างสี', 'ช่างกระเบื้อง', 'กรรมกร'];

export interface ProjectRow {
  id: string;
  code: string;
  name: string;
  customerId: string;
  customerName: string | null;
  status: ProjectStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  progressPct: number;
  plannedPct: number;
  managerName: string | null;
  contractAmount: number | null;
  updatedAt: string;
}

export interface Member {
  userId: string;
  name?: string;
  roleLabel: string | null;
}

export interface ContractSummary {
  id: string;
  docNo: string;
  status: string;
  amount: number;
  revisedAmount: number;
  billedAmount: number;
  receivedAmount: number;
}

export interface Counters {
  openIssues: number;
  openRisks: number;
  openPunch: number;
  dailyReports: number;
  pendingQc: number;
  openSafety: number;
  attachments: number;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  customerId: string;
  customerName: string | null;
  leadId: string | null;
  quotationId: string | null;
  quotationNo: string | null;
  siteAddress: string | null;
  status: ProjectStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  managerId: string | null;
  managerName: string | null;
  foremanId: string | null;
  foremanName: string | null;
  budgetCost: number | null;
  progressPct: number;
  plannedPct: number;
  notes: string | null;
  members: Member[];
  contract: ContractSummary | null;
  counters: Counters;
  canEdit: boolean;
  canReport: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectSave {
  name: string;
  customerId: string;
  siteAddress: string | null;
  status: ProjectStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  managerId: string | null;
  foremanId: string | null;
  budgetCost: number | null;
  notes: string | null;
  members: { userId: string; roleLabel: string | null }[];
}

export interface Task {
  id: string;
  parentId: string | null;
  sortOrder: number;
  depth: number;
  name: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  weight: number;
  progressPct: number;
  plannedPct: number;
  rollupWeight: number;
  predecessorId: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  isMilestone: boolean;
  leaf: boolean;
  late: boolean;
}

export interface TaskInput {
  id: string | null;
  key: string;
  parentKey: string | null;
  predecessorKey: string | null;
  name: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  weight: number;
  progressPct: number;
  assigneeId: string | null;
  isMilestone: boolean;
}

export interface CurvePoint {
  date: string;
  plannedPct: number | null;
  actualPct: number | null;
}

export interface CategoryProgress {
  taskId: string;
  name: string;
  weightPct: number;
  actualPct: number;
  plannedPct: number;
}

export interface Schedule {
  projectId: string;
  asOf: string;
  actualPct: number;
  plannedPct: number;
  variancePct: number;
  tasks: Task[];
  categories: CategoryProgress[];
  curve: CurvePoint[];
}

// ---------------------------------------------------------------- site

export interface WorkerLine {
  trade: string;
  count: number;
}

export interface DailyReportRow {
  id: string;
  reportDate: string;
  status: string;
  weatherAm: string | null;
  weatherPm: string | null;
  workersTotal: number;
  summary: string | null;
  photos: number;
  createdByName: string | null;
  submittedAt: string | null;
}

export interface TaskProgress {
  taskId: string;
  taskName?: string;
  previousPct?: number;
  progressPct: number;
  note: string | null;
}

export interface DailyReport {
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  reportDate: string;
  weatherAm: string | null;
  weatherPm: string | null;
  workers: WorkerLine[];
  workersTotal: number;
  workDone: string | null;
  workPlanned: string | null;
  problems: string | null;
  materialsIn: string | null;
  equipment: string | null;
  visitors: string | null;
  safetyNote: string | null;
  status: string;
  submittedAt: string | null;
  submittedByName: string | null;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  createdByName: string | null;
  tasks: TaskProgress[];
  canEdit: boolean;
  canSubmit: boolean;
  canAcknowledge: boolean;
  createdAt: string;
}

export interface DailyReportSave {
  reportDate: string;
  weatherAm: string | null;
  weatherPm: string | null;
  workers: WorkerLine[];
  workDone: string | null;
  workPlanned: string | null;
  problems: string | null;
  materialsIn: string | null;
  equipment: string | null;
  visitors: string | null;
  safetyNote: string | null;
  tasks: { taskId: string; progressPct: number; note: string | null }[];
}

export interface Issue {
  id: string;
  projectId: string;
  kind: 'issue' | 'risk';
  title: string;
  description: string | null;
  severity: string;
  likelihood: string | null;
  status: string;
  ownerId: string | null;
  ownerName: string | null;
  dueDate: string | null;
  resolution: string | null;
  closedAt: string | null;
  overdue: boolean;
  createdByName: string | null;
  createdAt: string;
}

export interface Punch {
  id: string;
  projectId: string;
  itemNo: number;
  location: string | null;
  description: string;
  responsible: string | null;
  dueDate: string | null;
  status: string;
  fixedAt: string | null;
  verifiedAt: string | null;
  verifiedByName: string | null;
  photos: number;
  overdue: boolean;
  createdAt: string;
}

export interface QcItem {
  text: string;
  result: 'pass' | 'fail' | 'na' | null;
  note: string | null;
}

export interface QcTemplate {
  id: string;
  name: string;
  category: string | null;
  items: string[];
}

export interface Qc {
  id: string;
  projectId: string;
  taskId: string | null;
  taskName: string | null;
  title: string;
  inspectedOn: string;
  inspectorId: string | null;
  inspectorName: string | null;
  result: string;
  items: QcItem[];
  notes: string | null;
  passCount: number;
  failCount: number;
  photos: number;
  createdAt: string;
}

export interface Safety {
  id: string;
  projectId: string;
  logDate: string;
  kind: string;
  title: string;
  detail: string | null;
  peopleCount: number | null;
  injuredCount: number;
  severity: string;
  correctiveAction: string | null;
  status: string;
  createdByName: string | null;
  photos: number;
  createdAt: string;
}

export interface PhotoRef {
  id: string;
  fileName: string;
  date: string;
  caption: string | null;
}

export interface ProgressReport {
  project: Project;
  schedule: Schedule;
  periodFrom: string;
  periodTo: string;
  reports: DailyReportRow[];
  workSummary: string;
  nextPlan: string | null;
  manDays: number;
  rainDays: number;
  openIssues: Issue[];
  photos: PhotoRef[];
}

@Injectable({ providedIn: 'root' })
export class ProjectsApi {
  private readonly http = inject(HttpClient);

  list(f: { q?: string; status?: string; customerId?: string; page: number; size: number }): Observable<PageResult<ProjectRow>> {
    let params = new HttpParams().set('page', f.page).set('size', f.size);
    if (f.q) params = params.set('q', f.q);
    if (f.status) params = params.set('status', f.status);
    if (f.customerId) params = params.set('customerId', f.customerId);
    return this.http.get<PageResult<ProjectRow>>('/api/projects', { params });
  }

  get(id: string): Observable<Project> {
    return this.http.get<Project>(`/api/projects/${id}`);
  }

  create(body: ProjectSave): Observable<Project> {
    return this.http.post<Project>('/api/projects', body);
  }

  update(id: string, body: ProjectSave): Observable<Project> {
    return this.http.put<Project>(`/api/projects/${id}`, body);
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`/api/projects/${id}`);
  }

  schedule(id: string): Observable<Schedule> {
    return this.http.get<Schedule>(`/api/projects/${id}/schedule`);
  }

  saveSchedule(id: string, tasks: TaskInput[]): Observable<Schedule> {
    return this.http.put<Schedule>(`/api/projects/${id}/schedule`, { tasks });
  }

  // ---- daily reports
  dailyList(projectId: string, page = 0, size = 30): Observable<PageResult<DailyReportRow>> {
    const params = new HttpParams().set('page', page).set('size', size);
    return this.http.get<PageResult<DailyReportRow>>(`/api/projects/${projectId}/daily-reports`, { params });
  }

  daily(id: string): Observable<DailyReport> {
    return this.http.get<DailyReport>(`/api/daily-reports/${id}`);
  }

  createDaily(projectId: string, body: DailyReportSave): Observable<DailyReport> {
    return this.http.post<DailyReport>(`/api/projects/${projectId}/daily-reports`, body);
  }

  updateDaily(id: string, body: DailyReportSave): Observable<DailyReport> {
    return this.http.put<DailyReport>(`/api/daily-reports/${id}`, body);
  }

  submitDaily(id: string): Observable<DailyReport> {
    return this.http.post<DailyReport>(`/api/daily-reports/${id}/submit`, {});
  }

  acknowledgeDaily(id: string): Observable<DailyReport> {
    return this.http.post<DailyReport>(`/api/daily-reports/${id}/acknowledge`, {});
  }

  deleteDaily(id: string): Observable<void> {
    return this.http.delete<void>(`/api/daily-reports/${id}`);
  }

  // ---- issues / punch / qc / safety (CRUD รูปแบบเดียวกัน)
  records<T>(projectId: string, kind: 'issues' | 'punch' | 'qc' | 'safety'): Observable<T[]> {
    return this.http.get<T[]>(`/api/projects/${projectId}/${kind}`);
  }

  saveRecord<T>(projectId: string, kind: 'issues' | 'punch' | 'qc' | 'safety', id: string | null, body: unknown): Observable<T> {
    return id
      ? this.http.put<T>(`/api/projects/${projectId}/${kind}/${id}`, body)
      : this.http.post<T>(`/api/projects/${projectId}/${kind}`, body);
  }

  deleteRecord(projectId: string, kind: 'issues' | 'punch' | 'qc' | 'safety', id: string): Observable<void> {
    return this.http.delete<void>(`/api/projects/${projectId}/${kind}/${id}`);
  }

  qcTemplates(): Observable<QcTemplate[]> {
    return this.http.get<QcTemplate[]>('/api/qc-templates');
  }

  saveQcTemplate(id: string | null, body: { name: string; category: string | null; items: string[] }): Observable<QcTemplate> {
    return id ? this.http.put<QcTemplate>(`/api/qc-templates/${id}`, body) : this.http.post<QcTemplate>('/api/qc-templates', body);
  }

  deleteQcTemplate(id: string): Observable<void> {
    return this.http.delete<void>(`/api/qc-templates/${id}`);
  }

  progressReport(projectId: string, from?: string, to?: string): Observable<ProgressReport> {
    let params = new HttpParams();
    if (from) params = params.set('from', from);
    if (to) params = params.set('to', to);
    return this.http.get<ProgressReport>(`/api/projects/${projectId}/progress-report`, { params });
  }
}
