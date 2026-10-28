package com.ktt.attachment;

import com.ktt.audit.AuditService;
import com.ktt.common.ApiException;
import com.ktt.common.FileStorage;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.inject.Instance;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@ApplicationScoped
public class AttachmentService {

    public static final Set<String> CATEGORIES = Set.of(
            "plan", "site_photo", "deed", "permit", "contract", "invoice", "receipt", "certificate",
            "drawing", "report", "correspondence", "before", "after", "other");
    public static final long MAX_BYTES = 50L * 1024 * 1024;

    @Inject
    FileStorage storage;

    @Inject
    Instance<AttachmentAccess> accessors;

    @Inject
    CurrentUser currentUser;

    @Inject
    AuditService audit;

    public record AttachmentDto(UUID id, String ownerType, UUID ownerId, String fileName, String mime, String category,
                                long sizeBytes, boolean image, Instant createdAt, UUID createdBy) {
    }

    public void checkAccess(String ownerType, UUID ownerId, boolean write) {
        if (!currentUser.can(write ? Perm.ATTACHMENT_WRITE : Perm.ATTACHMENT_READ)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์จัดการไฟล์แนบ");
        }
        for (AttachmentAccess a : accessors) {
            if (a.ownerType().equals(ownerType)) {
                a.check(ownerId, write);
                return;
            }
        }
        throw ApiException.badRequest("invalid_owner", "ไม่รองรับการแนบไฟล์กับข้อมูลประเภทนี้");
    }

    @Transactional
    public List<AttachmentDto> list(String ownerType, UUID ownerId) {
        checkAccess(ownerType, ownerId, false);
        return Attachment.listFor(ownerType, ownerId).stream().map(AttachmentService::toDto).toList();
    }

    @Transactional
    public AttachmentDto upload(String ownerType, UUID ownerId, String category, Path file, String fileName, long size) {
        checkAccess(ownerType, ownerId, true);
        FileStorage.checkAllowed(fileName);
        if (size > MAX_BYTES) {
            throw ApiException.badRequest("file_too_large", "ไฟล์ต้องไม่เกิน 50 MB");
        }
        Attachment a = new Attachment();
        a.ownerType = ownerType;
        a.ownerId = ownerId;
        a.fileName = cleanName(fileName);
        a.mime = FileStorage.guessMime(fileName);
        a.category = category != null && CATEGORIES.contains(category) ? category : "other";
        a.sizeBytes = size;
        a.fileKey = storage.store(file, fileName);
        a.createdBy = currentUser.id();
        a.persist();
        audit.log("attachment", a.id, AuditService.ACTION_CREATE, null,
                Map.of("ownerType", ownerType, "ownerId", ownerId.toString(), "fileName", a.fileName));
        return toDto(a);
    }

    /** ใช้ภายในโมดูลอื่น (เช่น Daily Report) ที่ตรวจสิทธิ์เองแล้ว */
    @Transactional(Transactional.TxType.MANDATORY)
    public AttachmentDto attachTrusted(String ownerType, UUID ownerId, String category, Path file, String fileName, long size) {
        FileStorage.checkAllowed(fileName);
        Attachment a = new Attachment();
        a.ownerType = ownerType;
        a.ownerId = ownerId;
        a.fileName = cleanName(fileName);
        a.mime = FileStorage.guessMime(fileName);
        a.category = category != null && CATEGORIES.contains(category) ? category : "other";
        a.sizeBytes = size;
        a.fileKey = storage.store(file, fileName);
        a.createdBy = currentUser.id();
        a.persist();
        return toDto(a);
    }

    @Transactional
    public Attachment forDownload(UUID id) {
        Attachment a = Attachment.findById(id);
        if (a == null) {
            throw ApiException.notFound("ไม่พบไฟล์");
        }
        checkAccess(a.ownerType, a.ownerId, false);
        return a;
    }

    @Transactional
    public void delete(UUID id) {
        Attachment a = Attachment.findById(id);
        if (a == null) {
            throw ApiException.notFound("ไม่พบไฟล์");
        }
        checkAccess(a.ownerType, a.ownerId, true);
        a.softDelete();
        audit.log("attachment", a.id, AuditService.ACTION_DELETE,
                Map.of("ownerType", a.ownerType, "ownerId", a.ownerId.toString(), "fileName", a.fileName), null);
    }

    public Path path(Attachment a) {
        return storage.resolve(a.fileKey);
    }

    public static AttachmentDto toDto(Attachment a) {
        return new AttachmentDto(a.id, a.ownerType, a.ownerId, a.fileName, a.mime, a.category, a.sizeBytes,
                FileStorage.IMAGE_EXT.contains(FileStorage.extension(a.fileName)), a.createdAt, a.createdBy);
    }

    private static String cleanName(String name) {
        if (name == null || name.isBlank()) {
            return "file";
        }
        String n = name.replace('\\', '/');
        n = n.substring(n.lastIndexOf('/') + 1);
        return n.length() > 200 ? n.substring(n.length() - 200) : n;
    }
}
