package com.ktt.attachment;

import java.util.UUID;

/**
 * แต่ละโมดูลที่มีไฟล์แนบ implement ตัวนี้ เพื่อบอกว่าผู้ใช้ปัจจุบันอ่าน/แก้ไฟล์ของรายการนั้นได้หรือไม่
 * (เช่น ลีดของคนอื่น ฝ่ายขายที่ไม่มี lead.read_all ต้องเปิดไม่ได้)
 */
public interface AttachmentAccess {

    /** ownerType ที่รับผิดชอบ เช่น "lead" */
    String ownerType();

    /** โยน ApiException ถ้าไม่มีสิทธิ์ หรือไม่พบรายการ */
    void check(UUID ownerId, boolean write);
}
