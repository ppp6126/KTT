import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { PageResult } from '../../core/api/api-error';

export interface UserRow {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  roleId: string;
  roleCode: string;
  roleName: string;
  active: boolean;
  mfaEnabled: boolean;
  locked: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RoleDto {
  id: string;
  code: string;
  name: string;
  description: string | null;
  system: boolean;
  permissions: string[];
  userCount: number;
}

export interface PermissionDto {
  code: string;
  module: string;
  action: string;
  description: string;
}

export interface UserInput {
  email?: string;
  name: string;
  phone: string | null;
  roleId: string;
  active?: boolean;
  temporaryPassword?: string | null;
}

export interface RoleInput {
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
}

@Injectable({ providedIn: 'root' })
export class UsersApi {
  private readonly http = inject(HttpClient);

  list(q: { q?: string; roleId?: string; active?: boolean | null; page: number; size: number }): Observable<PageResult<UserRow>> {
    let params = new HttpParams().set('page', q.page).set('size', q.size);
    if (q.q) params = params.set('q', q.q);
    if (q.roleId) params = params.set('roleId', q.roleId);
    if (q.active !== undefined && q.active !== null) params = params.set('active', q.active);
    return this.http.get<PageResult<UserRow>>('/api/users', { params });
  }

  create(input: UserInput): Observable<{ user: UserRow; temporaryPassword: string }> {
    return this.http.post<{ user: UserRow; temporaryPassword: string }>('/api/users', input);
  }

  update(id: string, input: UserInput): Observable<UserRow> {
    return this.http.put<UserRow>(`/api/users/${id}`, input);
  }

  delete(id: string): Observable<unknown> {
    return this.http.delete(`/api/users/${id}`);
  }

  resetPassword(id: string): Observable<{ temporaryPassword: string }> {
    return this.http.post<{ temporaryPassword: string }>(`/api/users/${id}/reset-password`, {});
  }

  resetMfa(id: string): Observable<unknown> {
    return this.http.post(`/api/users/${id}/reset-mfa`, {});
  }

  unlock(id: string): Observable<unknown> {
    return this.http.post(`/api/users/${id}/unlock`, {});
  }

  revokeSessions(id: string): Observable<unknown> {
    return this.http.post(`/api/users/${id}/revoke-sessions`, {});
  }

  roles(): Observable<RoleDto[]> {
    return this.http.get<RoleDto[]>('/api/roles');
  }

  permissions(): Observable<PermissionDto[]> {
    return this.http.get<PermissionDto[]>('/api/permissions');
  }

  createRole(input: RoleInput): Observable<RoleDto> {
    return this.http.post<RoleDto>('/api/roles', input);
  }

  updateRole(id: string, input: RoleInput): Observable<RoleDto> {
    return this.http.put<RoleDto>(`/api/roles/${id}`, input);
  }

  deleteRole(id: string): Observable<unknown> {
    return this.http.delete(`/api/roles/${id}`);
  }
}
