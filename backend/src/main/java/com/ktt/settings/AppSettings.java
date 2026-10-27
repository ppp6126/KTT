package com.ktt.settings;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import jakarta.persistence.EntityManager;
import jakarta.transaction.Transactional;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/** อ่าน/เขียนตาราง app_settings (value เป็น jsonb) */
@ApplicationScoped
@Transactional
public class AppSettings {

    public static final String DISCOUNT_APPROVAL_THRESHOLD_PCT = "quotation.discount_approval_threshold_pct";
    public static final String DEFAULT_VALIDITY_DAYS = "quotation.default_validity_days";
    public static final String YEAR_FORMAT = "document.year_format";
    public static final String MFA_REQUIRED_ROLES = "auth.mfa_required_roles";

    @Inject
    EntityManager em;

    @Inject
    ObjectMapper mapper;

    public JsonNode get(String key) {
        List<?> rows = em.createNativeQuery("select cast(value as text) from app_settings where key = ?1")
                .setParameter(1, key)
                .getResultList();
        if (rows.isEmpty() || rows.get(0) == null) {
            return null;
        }
        try {
            return mapper.readTree(rows.get(0).toString());
        } catch (Exception e) {
            throw new IllegalStateException("Invalid JSON in app_settings." + key, e);
        }
    }

    public void set(String key, JsonNode value, UUID userId) {
        em.createNativeQuery("""
                        insert into app_settings (key, value, updated_at, updated_by)
                        values (?1, cast(?2 as jsonb), now(), ?3)
                        on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = excluded.updated_by
                        """)
                .setParameter(1, key)
                .setParameter(2, value.toString())
                .setParameter(3, userId)
                .executeUpdate();
    }

    public List<String> mfaRequiredRoles() {
        JsonNode node = get(MFA_REQUIRED_ROLES);
        List<String> roles = new ArrayList<>();
        if (node != null && node.isArray()) {
            node.forEach(n -> roles.add(n.asText()));
        }
        return roles;
    }

    public BigDecimal discountApprovalThresholdPct() {
        JsonNode node = get(DISCOUNT_APPROVAL_THRESHOLD_PCT);
        return node == null ? new BigDecimal("5") : node.decimalValue();
    }
}
