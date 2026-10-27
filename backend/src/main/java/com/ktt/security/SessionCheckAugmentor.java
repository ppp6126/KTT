package com.ktt.security;

import com.ktt.auth.SessionActiveChecker;
import io.quarkus.security.AuthenticationFailedException;
import io.quarkus.security.identity.AuthenticationRequestContext;
import io.quarkus.security.identity.SecurityIdentity;
import io.quarkus.security.identity.SecurityIdentityAugmentor;
import io.smallrye.mutiny.Uni;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.util.UUID;

/**
 * ทุก request ที่มี access token: ตรวจว่า session (claim "sid") ยังไม่ถูกยกเลิก.
 * ทำให้ logout / ปิดผู้ใช้ / เปลี่ยนรหัสผ่าน มีผลทันที (ภายใน 30 วินาทีของ cache) แม้ JWT ยังไม่หมดอายุ
 */
@ApplicationScoped
public class SessionCheckAugmentor implements SecurityIdentityAugmentor {

    @Inject
    SessionActiveChecker checker;

    @Override
    public Uni<SecurityIdentity> augment(SecurityIdentity identity, AuthenticationRequestContext context) {
        if (identity.isAnonymous() || !(identity.getPrincipal() instanceof JsonWebToken jwt)) {
            return Uni.createFrom().item(identity);
        }
        String sid = TokenClaims.string(jwt, TokenClaims.SESSION_ID);
        if (sid == null) {
            return Uni.createFrom().failure(new AuthenticationFailedException("Token has no session"));
        }
        UUID sessionId;
        try {
            sessionId = UUID.fromString(sid);
        } catch (IllegalArgumentException e) {
            return Uni.createFrom().failure(new AuthenticationFailedException("Invalid session id"));
        }
        return context.runBlocking(() -> {
            if (!checker.isActive(sessionId)) {
                throw new AuthenticationFailedException("Session revoked or expired");
            }
            return identity;
        });
    }
}
