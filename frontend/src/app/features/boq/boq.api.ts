import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface BoqSummary {
  id: string;
  leadId: string;
  name: string;
  optionLabel: string | null;
  subtotalCost: number | null;
  subtotalSell: number;
  grandTotal: number;
  marginPct: number | null;
  itemCount: number;
  updatedAt: string;
}

export interface BoqItem {
  id: string;
  parentId: string | null;
  level: number;
  sortOrder: number;
  number: string;
  description: string;
  unit: string | null;
  quantity: number;
  materialId: string | null;
  laborId: string | null;
  equipmentId: string | null;
  unitMaterialCost: number | null;
  unitLabor: number | null;
  unitEquipment: number | null;
  materialAmount: number | null;
  laborAmount: number | null;
  equipmentAmount: number | null;
  lineCost: number | null;
  unitSell: number | null;
  lineSell: number;
  leaf: boolean;
  note: string | null;
}

export interface Boq {
  id: string;
  leadId: string;
  leadTitle: string | null;
  customerId: string | null;
  customerName: string | null;
  name: string;
  optionLabel: string | null;
  overheadPct: number | null;
  profitPct: number | null;
  contingencyPct: number | null;
  discountAmount: number;
  vatPct: number;
  whtPct: number;
  subtotalCost: number | null;
  subtotalSell: number;
  vatAmount: number;
  grandTotal: number;
  marginPct: number | null;
  factorFMode: 'none' | 'manual' | 'table';
  factorFValue: number | null;
  factorFTableId: string | null;
  projectName: string | null;
  projectLocation: string | null;
  ownerAgency: string | null;
  notes: string | null;
  canViewCost: boolean;
  items: BoqItem[];
  updatedAt: string;
}

export interface ItemInput {
  key: string;
  parentKey: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  materialId: string | null;
  laborId: string | null;
  equipmentId: string | null;
  unitMaterialCost: number;
  unitLabor: number;
  unitEquipment: number;
  note: string | null;
}

export interface BoqHeader {
  name: string;
  optionLabel: string | null;
  overheadPct: number;
  profitPct: number;
  contingencyPct: number;
  discountAmount: number;
  vatPct: number;
  whtPct: number;
  factorFMode: string;
  factorFValue: number | null;
  factorFTableId: string | null;
  projectName: string | null;
  projectLocation: string | null;
  ownerAgency: string | null;
  notes: string | null;
}

export interface PickItem {
  type: 'material' | 'labor' | 'equipment';
  id: string;
  code: string;
  name: string;
  unit: string;
  unitCost: number;
}

export interface TemplateSummary {
  id: string;
  name: string;
  jobType: string | null;
  description: string | null;
  itemCount: number;
  updatedAt: string;
}

export interface TemplateItem {
  id: string;
  parentId: string | null;
  level: number;
  sortOrder: number;
  description: string;
  unit: string | null;
  quantity: number;
  materialId: string | null;
  laborId: string | null;
  equipmentId: string | null;
  note: string | null;
}

export interface Template {
  id: string;
  name: string;
  jobType: string | null;
  description: string | null;
  items: TemplateItem[];
}

export interface FactorTable {
  id: string;
  name: string;
  workType: string;
  advancePct: number | null;
  retentionPct: number | null;
  interestPct: number | null;
  vatPct: number | null;
  note: string | null;
  rows: { cost: number; factor: number }[];
}

export interface Gov4Row {
  number: string;
  level: number;
  leaf: boolean;
  description: string;
  quantity: number | null;
  unit: string | null;
  materialUnit: number | null;
  materialAmount: number;
  laborUnit: number | null;
  laborAmount: number;
  total: number;
  note: string | null;
}

export interface GovForm {
  projectName: string | null;
  projectLocation: string | null;
  ownerAgency: string | null;
  customerName: string | null;
  boqName: string;
  form4: Gov4Row[];
  totalMaterial: number;
  totalLabor: number;
  totalCost: number;
  form5: { number: string; description: string; cost: number; factorF: number; price: number }[];
  factorFMode: string;
  factorFTableName: string | null;
  factorF: number;
  totalPrice: number;
  totalPriceRounded: number;
}

@Injectable({ providedIn: 'root' })
export class BoqApi {
  private readonly http = inject(HttpClient);

  listForLead(leadId: string): Observable<BoqSummary[]> {
    return this.http.get<BoqSummary[]>('/api/boqs', { params: { leadId } });
  }

  get(id: string): Observable<Boq> {
    return this.http.get<Boq>(`/api/boqs/${id}`);
  }

  create(input: { leadId: string; name: string; optionLabel?: string | null; templateId?: string | null; copyFromId?: string | null }): Observable<Boq> {
    return this.http.post<Boq>('/api/boqs', input);
  }

  updateHeader(id: string, h: BoqHeader): Observable<Boq> {
    return this.http.put<Boq>(`/api/boqs/${id}`, h);
  }

  saveItems(id: string, items: ItemInput[]): Observable<Boq> {
    return this.http.put<Boq>(`/api/boqs/${id}/items`, { items });
  }

  copy(id: string, name: string, optionLabel: string | null): Observable<Boq> {
    return this.http.post<Boq>(`/api/boqs/${id}/copy`, { name, optionLabel });
  }

  refreshPrices(id: string): Observable<Boq> {
    return this.http.post<Boq>(`/api/boqs/${id}/refresh-prices`, {});
  }

  insertTemplate(id: string, templateId: string): Observable<Boq> {
    return this.http.post<Boq>(`/api/boqs/${id}/insert-template/${templateId}`, {});
  }

  saveAsTemplate(id: string, name: string): Observable<{ templateId: string }> {
    return this.http.post<{ templateId: string }>(`/api/boqs/${id}/save-as-template`, { name });
  }

  delete(id: string): Observable<unknown> {
    return this.http.delete(`/api/boqs/${id}`);
  }

  govForm(id: string): Observable<GovForm> {
    return this.http.get<GovForm>(`/api/boqs/${id}/gov-form`);
  }

  pick(q: string, type?: string): Observable<PickItem[]> {
    let params = new HttpParams().set('q', q);
    if (type) params = params.set('type', type);
    return this.http.get<PickItem[]>('/api/pricing/pick', { params });
  }

  templates(): Observable<TemplateSummary[]> {
    return this.http.get<TemplateSummary[]>('/api/boq-templates');
  }

  template(id: string): Observable<Template> {
    return this.http.get<Template>(`/api/boq-templates/${id}`);
  }

  saveTemplate(id: string | null, body: { name: string; jobType: string | null; description: string | null; items: ItemInput[] }): Observable<Template> {
    return id ? this.http.put<Template>(`/api/boq-templates/${id}`, body) : this.http.post<Template>('/api/boq-templates', body);
  }

  deleteTemplate(id: string): Observable<unknown> {
    return this.http.delete(`/api/boq-templates/${id}`);
  }

  factorTables(): Observable<FactorTable[]> {
    return this.http.get<FactorTable[]>('/api/factor-f-tables');
  }

  saveFactorTable(id: string | null, body: Omit<FactorTable, 'id'>): Observable<FactorTable> {
    return id ? this.http.put<FactorTable>(`/api/factor-f-tables/${id}`, body) : this.http.post<FactorTable>('/api/factor-f-tables', body);
  }

  deleteFactorTable(id: string): Observable<unknown> {
    return this.http.delete(`/api/factor-f-tables/${id}`);
  }
}
