package com.ktt.site;

import com.ktt.attachment.AttachmentAccess;
import com.ktt.common.ApiException;
import com.ktt.project.ProjectService;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.UUID;

/** รูปถ่าย/ไฟล์ของรายงานหน้างาน: ต้องเห็นโครงการ และถ้าจะอัปโหลดต้องมีสิทธิ์บันทึกหน้างาน */
public abstract class SiteAttachmentAccess implements AttachmentAccess {

    @Inject
    ProjectService projects;

    protected abstract UUID projectOf(UUID ownerId);

    @Override
    public void check(UUID ownerId, boolean write) {
        UUID projectId = projectOf(ownerId);
        if (projectId == null) {
            throw ApiException.notFound("ไม่พบรายการ");
        }
        if (write) {
            projects.requireReportable(projectId);
        } else {
            projects.requireVisible(projectId);
        }
    }

    @ApplicationScoped
    public static class DailyReportAccess extends SiteAttachmentAccess {
        @Override
        public String ownerType() {
            return "daily_report";
        }

        @Override
        protected UUID projectOf(UUID id) {
            DailyReport x = DailyReport.findById(id);
            return x == null ? null : x.projectId;
        }
    }

    @ApplicationScoped
    public static class PunchAccess extends SiteAttachmentAccess {
        @Override
        public String ownerType() {
            return "punch_item";
        }

        @Override
        protected UUID projectOf(UUID id) {
            PunchItem x = PunchItem.findById(id);
            return x == null ? null : x.projectId;
        }
    }

    @ApplicationScoped
    public static class QcAccess extends SiteAttachmentAccess {
        @Override
        public String ownerType() {
            return "qc_inspection";
        }

        @Override
        protected UUID projectOf(UUID id) {
            QcInspection x = QcInspection.findById(id);
            return x == null ? null : x.projectId;
        }
    }

    @ApplicationScoped
    public static class SafetyAccess extends SiteAttachmentAccess {
        @Override
        public String ownerType() {
            return "safety_log";
        }

        @Override
        protected UUID projectOf(UUID id) {
            SafetyLog x = SafetyLog.findById(id);
            return x == null ? null : x.projectId;
        }
    }

    @ApplicationScoped
    public static class IssueAccess extends SiteAttachmentAccess {
        @Override
        public String ownerType() {
            return "project_issue";
        }

        @Override
        protected UUID projectOf(UUID id) {
            ProjectIssue x = ProjectIssue.findById(id);
            return x == null ? null : x.projectId;
        }
    }
}
