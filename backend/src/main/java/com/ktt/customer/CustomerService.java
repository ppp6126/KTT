package com.ktt.customer;

import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.PageResult;
import com.ktt.customer.CustomerDtos.ContactDto;
import com.ktt.customer.CustomerDtos.ContactRequest;
import com.ktt.customer.CustomerDtos.CustomerDto;
import com.ktt.customer.CustomerDtos.CustomerRequest;
import com.ktt.customer.CustomerDtos.CustomerRow;
import com.ktt.security.CurrentUser;
import io.quarkus.hibernate.orm.panache.PanacheQuery;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Parameters;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** FR-01 / US-01: ทะเบียนลูกค้า */
@ApplicationScoped
public class CustomerService {

    private static final Set<String> SORTABLE = Set.of("name", "createdAt", "updatedAt");

    @Inject
    AuditService audit;

    @Inject
    CurrentUser currentUser;

    @Transactional
    public PageResult<CustomerRow> list(String q, String type, String source, String sort, String dir, int page, int size) {
        StringBuilder where = new StringBuilder("1 = 1");
        Parameters p = new Parameters();
        if (q != null && !q.isBlank()) {
            where.append(" and (lower(name) like :q or taxId like :qRaw or phone like :qRaw or lower(email) like :q)");
            p.and("q", "%" + q.trim().toLowerCase() + "%");
            p.and("qRaw", "%" + q.trim() + "%");
        }
        if (type != null && !type.isBlank()) {
            where.append(" and customerType = :type");
            p.and("type", type);
        }
        if (source != null && !source.isBlank()) {
            where.append(" and source = :source");
            p.and("source", source);
        }
        String sortField = SORTABLE.contains(sort) ? sort : "name";
        Sort s = "desc".equalsIgnoreCase(dir) ? Sort.descending(sortField) : Sort.ascending(sortField);
        PanacheQuery<Customer> query = Customer.find(where.toString(), s, p);
        long total = query.count();
        List<CustomerRow> items = query.page(Page.of(page, size)).list().stream().map(CustomerService::toRow).toList();
        return new PageResult<>(items, total, page, size);
    }

    @Transactional
    public CustomerDto get(UUID id) {
        return toDto(require(id));
    }

    @Transactional
    public CustomerDto create(CustomerRequest req) {
        warnDuplicateTaxId(req, null);
        Customer c = new Customer();
        apply(c, req);
        c.createdBy = currentUser.id();
        c.persist();
        syncContacts(c, req.contacts());
        audit.log("customer", c.id, AuditService.ACTION_CREATE, null, auditView(c));
        return toDto(c);
    }

    @Transactional
    public CustomerDto update(UUID id, CustomerRequest req) {
        Customer c = require(id);
        warnDuplicateTaxId(req, c.id);
        Map<String, Object> before = auditView(c);
        apply(c, req);
        syncContacts(c, req.contacts());
        var d = audit.diff(before, auditView(c));
        audit.log("customer", c.id, AuditService.ACTION_UPDATE, d[0], d[1]);
        return toDto(c);
    }

    @Transactional
    public void delete(UUID id) {
        Customer c = require(id);
        Number leads = (Number) Customer.getEntityManager()
                .createNativeQuery("select count(*) from leads where customer_id = ?1 and deleted_at is null")
                .setParameter(1, c.id)
                .getSingleResult();
        if (leads.longValue() > 0) {
            throw ApiException.conflict("customer_in_use", "ลูกค้ารายนี้มีลีด/งานอยู่ " + leads + " รายการ ไม่สามารถลบได้");
        }
        Map<String, Object> before = auditView(c);
        for (Contact ct : c.contacts) {
            ct.softDelete();
        }
        c.softDelete();
        audit.log("customer", c.id, AuditService.ACTION_DELETE, before, null);
    }

    // ---------------------------------------------------------------- helpers

    private void apply(Customer c, CustomerRequest req) {
        c.customerType = req.type();
        c.name = req.name().trim();
        c.taxId = blankToNull(req.taxId());
        c.branchNo = Customer.TYPE_COMPANY.equals(req.type())
                ? (blankToNull(req.branchNo()) == null ? "00000" : req.branchNo())
                : null;
        c.phone = blankToNull(req.phone());
        c.email = blankToNull(req.email());
        c.lineId = blankToNull(req.lineId());
        c.billingAddress = blankToNull(req.billingAddress());
        c.source = req.source() == null || req.source().isBlank() ? "other" : req.source();
        c.note = blankToNull(req.note());
        if (req.pdpaConsent() && c.pdpaConsentAt == null) {
            c.pdpaConsentAt = Instant.now();
        } else if (!req.pdpaConsent()) {
            c.pdpaConsentAt = null;
        }
    }

    /** แทนที่รายชื่อผู้ติดต่อทั้งชุด: มี id = แก้ไข, ไม่มี id = เพิ่ม, ที่หายไป = ลบ (soft) */
    private void syncContacts(Customer c, List<ContactRequest> incoming) {
        List<ContactRequest> list = incoming == null ? List.of() : incoming;
        Map<UUID, Contact> existing = new HashMap<>();
        for (Contact ct : c.contacts) {
            existing.put(ct.id, ct);
        }
        List<Contact> result = new ArrayList<>();
        for (ContactRequest r : list) {
            Contact ct = r.id() == null ? null : existing.remove(r.id());
            if (ct == null) {
                ct = new Contact();
                ct.customer = c;
                ct.createdBy = currentUser.id();
            }
            ct.name = r.name().trim();
            ct.position = blankToNull(r.position());
            ct.phone = blankToNull(r.phone());
            ct.email = blankToNull(r.email());
            if (ct.id == null) {
                ct.persist();
            }
            result.add(ct);
        }
        for (Contact removed : existing.values()) {
            removed.softDelete();
        }
        c.contacts.clear();
        c.contacts.addAll(result);
    }

    /** เลขผู้เสียภาษี+สาขาซ้ำกับลูกค้าที่มีอยู่ → แจ้งเตือน (409) */
    private void warnDuplicateTaxId(CustomerRequest req, UUID selfId) {
        String taxId = blankToNull(req.taxId());
        if (taxId == null) {
            return;
        }
        String branch = Customer.TYPE_COMPANY.equals(req.type()) && blankToNull(req.branchNo()) != null ? req.branchNo() : null;
        Customer dup = branch == null
                ? Customer.find("taxId = ?1 and branchNo is null", taxId).firstResult()
                : Customer.find("taxId = ?1 and branchNo = ?2", taxId, branch).firstResult();
        if (dup == null && branch == null && Customer.TYPE_COMPANY.equals(req.type())) {
            dup = Customer.find("taxId = ?1 and branchNo = '00000'", taxId).firstResult();
        }
        if (dup != null && !dup.id.equals(selfId)) {
            throw new ApiException(409, "duplicate_tax_id", "เลขผู้เสียภาษีนี้ซ้ำกับลูกค้า \"" + dup.name + "\"",
                    Map.of("customerId", dup.id.toString()));
        }
    }

    private static Customer require(UUID id) {
        Customer c = Customer.findById(id);
        if (c == null) {
            throw ApiException.notFound("ไม่พบลูกค้า");
        }
        return c;
    }

    static CustomerRow toRow(Customer c) {
        return new CustomerRow(c.id, c.customerType, c.name, c.taxId, c.branchNo, c.phone, c.email, c.source, c.createdAt);
    }

    static CustomerDto toDto(Customer c) {
        List<ContactDto> contacts = c.contacts.stream()
                .filter(ct -> ct.deletedAt == null)
                .map(ct -> new ContactDto(ct.id, ct.name, ct.position, ct.phone, ct.email))
                .toList();
        return new CustomerDto(c.id, c.customerType, c.name, c.taxId, c.branchNo, c.phone, c.email, c.lineId,
                c.billingAddress, c.source, c.note, c.pdpaConsentAt, contacts, c.createdAt, c.updatedAt);
    }

    private static Map<String, Object> auditView(Customer c) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("type", c.customerType);
        m.put("name", c.name);
        m.put("taxId", c.taxId);
        m.put("branchNo", c.branchNo);
        m.put("phone", c.phone);
        m.put("email", c.email);
        m.put("lineId", c.lineId);
        m.put("billingAddress", c.billingAddress);
        m.put("source", c.source);
        m.put("note", c.note);
        m.put("pdpaConsent", c.pdpaConsentAt != null);
        m.put("contacts", c.contacts.stream().filter(ct -> ct.deletedAt == null).map(ct -> ct.name).toList());
        return m;
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
