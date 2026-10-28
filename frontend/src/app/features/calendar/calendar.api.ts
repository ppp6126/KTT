import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface CalItem {
  id: string;
  source: string;
  kind: string;
  title: string;
  subtitle: string | null;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;
  link: string | null;
  projectCode: string | null;
  amount: number | null;
  editable: boolean;
}

export interface CalEvent {
  id: string;
  title: string;
  kind: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  location: string | null;
  projectId: string | null;
  projectCode: string | null;
  isPrivate: boolean;
  notes: string | null;
  createdBy: string;
  createdByName: string | null;
  editable: boolean;
}

export type CalEventSave = Omit<CalEvent, 'id' | 'projectCode' | 'createdBy' | 'createdByName' | 'editable'>;

/** แหล่งข้อมูลในปฏิทิน: สีใช้ลำดับ palette เดียวกับกราฟ (ห้ามสลับ) และมีชื่อกำกับทุกที่ */
export const CAL_SOURCES: { key: string; label: string; color: string }[] = [
  { key: 'event', label: 'นัดหมาย', color: '#2a78d6' },
  { key: 'project', label: 'โครงการ', color: '#eb6834' },
  { key: 'sales', label: 'งานขาย', color: '#1baf7a' },
  { key: 'finance', label: 'การเงิน', color: '#eda100' },
  { key: 'purchase', label: 'จัดซื้อ', color: '#e87ba4' },
  { key: 'permit', label: 'ใบอนุญาต', color: '#008300' },
  { key: 'service', label: 'แจ้งซ่อม', color: '#6250d6' },
];

export const EVENT_KIND: Record<string, string> = {
  meeting: 'ประชุม',
  site_visit: 'ดูหน้างาน',
  inspection: 'ตรวจรับงาน',
  delivery: 'ส่งของ',
  handover: 'ส่งมอบงาน',
  other: 'อื่น ๆ',
};

@Injectable({ providedIn: 'root' })
export class CalendarApi {
  private readonly http = inject(HttpClient);

  items(from: string, to: string): Observable<CalItem[]> {
    return this.http.get<CalItem[]>('/api/calendar', { params: new HttpParams().set('from', from).set('to', to) });
  }

  event(id: string): Observable<CalEvent> {
    return this.http.get<CalEvent>(`/api/calendar/events/${id}`);
  }

  save(id: string | null, body: CalEventSave): Observable<CalEvent> {
    return id ? this.http.put<CalEvent>(`/api/calendar/events/${id}`, body) : this.http.post<CalEvent>('/api/calendar/events', body);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/calendar/events/${id}`);
  }
}
