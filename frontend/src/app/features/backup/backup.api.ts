import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface BackupRun {
  id: string;
  kind: 'manual' | 'scheduled';
  status: 'running' | 'ok' | 'failed';
  startedAt: string;
  finishedAt: string | null;
  fileName: string | null;
  sizeBytes: number | null;
  tableCount: number | null;
  rowCount: number | null;
  error: string | null;
  createdByName: string | null;
  fileAvailable: boolean;
}

export interface BackupSettings {
  scheduled: boolean;
  keepDays: number;
  directory: string;
}

@Injectable({ providedIn: 'root' })
export class BackupApi {
  private readonly http = inject(HttpClient);

  runs(): Observable<BackupRun[]> {
    return this.http.get<BackupRun[]>('/api/backups');
  }

  run(includeFiles: boolean): Observable<BackupRun> {
    return this.http.post<BackupRun>('/api/backups', {}, { params: new HttpParams().set('files', includeFiles) });
  }

  settings(): Observable<BackupSettings> {
    return this.http.get<BackupSettings>('/api/backups/settings');
  }

  saveSettings(scheduled: boolean, keepDays: number): Observable<BackupSettings> {
    return this.http.put<BackupSettings>('/api/backups/settings', { scheduled, keepDays });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`/api/backups/${id}`);
  }
}
