package com.ktt.security;

import io.quarkus.security.identity.SecurityIdentity;
import jakarta.enterprise.context.RequestScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.jwt.JsonWebToken;

import java.util.UUID;

/** ผู้ใช้ที่ login อยู่ใน request นี้ */
@RequestScoped
public class CurrentUser {

    @Inject
    SecurityIdentity identity;

    public boolean isAuthenticated() {
        return !identity.isAnonymous();
    }

    public UUID id() {
        JsonWebToken jwt = jwt();
        return jwt == null || jwt.getSubject() == null ? null : UUID.fromString(jwt.getSubject());
    }

    public UUID sessionId() {
        JsonWebToken jwt = jwt();
        if (jwt == null) {
            return null;
        }
        String sid = TokenClaims.string(jwt, TokenClaims.SESSION_ID);
        return sid == null ? null : UUID.fromString(sid);
    }

    public boolean can(String permission) {
        return identity.hasRole(permission);
    }

    public boolean canViewCost() {
        return can(Perm.COST_VIEW);
    }

    private JsonWebToken jwt() {
        if (identity.isAnonymous()) {
            return null;
        }
        return identity.getPrincipal() instanceof JsonWebToken jwt ? jwt : null;
    }
}
