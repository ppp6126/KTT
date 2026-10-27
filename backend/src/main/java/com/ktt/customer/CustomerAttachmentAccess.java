package com.ktt.customer;

import com.ktt.attachment.AttachmentAccess;
import com.ktt.common.ApiException;
import com.ktt.security.CurrentUser;
import com.ktt.security.Perm;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;

import java.util.UUID;

@ApplicationScoped
public class CustomerAttachmentAccess implements AttachmentAccess {

    @Inject
    CurrentUser currentUser;

    @Override
    public String ownerType() {
        return "customer";
    }

    @Override
    public void check(UUID ownerId, boolean write) {
        if (!currentUser.can(write ? Perm.CUSTOMER_WRITE : Perm.CUSTOMER_READ)) {
            throw ApiException.forbidden("forbidden", "คุณไม่มีสิทธิ์เข้าถึงข้อมูลลูกค้า");
        }
        if (Customer.findById(ownerId) == null) {
            throw ApiException.notFound("ไม่พบลูกค้า");
        }
    }
}
