package com.ktt.lead;

import com.ktt.attachment.AttachmentAccess;
import com.ktt.common.ApiException;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.UUID;

/** US-04 แนบแบบแปลน/รูปหน้างานกับลีด */
@ApplicationScoped
public class LeadAttachmentAccess implements AttachmentAccess {

    @Inject
    LeadService leads;

    @Inject
    CurrentUser currentUser;

    @Override
    public String ownerType() {
        return "lead";
    }

    @Override
    public void check(UUID ownerId, boolean write) {
        if (write && !currentUser.can(Perm.LEAD_WRITE)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์แก้ไขลีด");
        }
        leads.requireVisible(ownerId);
    }
}
