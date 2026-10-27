package com.ktt.project;

import com.ktt.attachment.AttachmentAccess;
import com.ktt.common.ApiException;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.UUID;

/** เอกสารโครงการ (แบบ ใบอนุญาต หนังสือโต้ตอบ รูปถ่าย) */
@ApplicationScoped
public class ProjectAttachmentAccess implements AttachmentAccess {

    @Inject
    ProjectService projects;

    @Inject
    CurrentUser currentUser;

    @Override
    public String ownerType() {
        return "project";
    }

    @Override
    public void check(UUID ownerId, boolean write) {
        if (write && !currentUser.can(Perm.PROJECT_WRITE) && !currentUser.can(Perm.SITE_REPORT)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์แนบเอกสารโครงการ");
        }
        projects.requireVisible(ownerId);
    }
}
