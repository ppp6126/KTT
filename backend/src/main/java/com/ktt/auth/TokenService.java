package com.ktt.auth;

import com.ktt.security.TokenClaims;
import com.ktt.settings.AppSettings;
import io.smallrye.jwt.build.Jwt;
import io.smallrye.jwt.build.JwtClaimsBuilder;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;

import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;

/** ออก access token (JWT RS256) ใส่สิทธิ์ทั้งหมดของผู้ใช้ใน claim "groups" */
@ApplicationScoped
public class TokenService {

    @Inject
    AuthConfig config;

    @Inject
    AppSettings settings;

    @ConfigProperty(name = "ktt.jwt.issuer")
    String issuer;

    public record AccessToken(String token, long expiresIn, Set<String> permissions, String restriction) {
    }

    public AccessToken issue(User user, UUID sessionId) {
        String restriction = restrictionFor(user);
        Set<String> perms = restriction == null ? effectivePermissions(user) : Set.of();
        long ttl = config.accessTokenTtl().toSeconds();

        JwtClaimsBuilder builder = Jwt.issuer(issuer)
                .subject(user.id.toString())
                .upn(user.email)
                .groups(perms)
                .claim(TokenClaims.SESSION_ID, sessionId.toString())
                .claim(TokenClaims.NAME, user.name)
                .claim(TokenClaims.ROLE, user.role.code)
                .expiresIn(ttl);
        if (restriction != null) {
            builder.claim(TokenClaims.RESTRICTION, restriction);
        }
        return new AccessToken(builder.sign(), ttl, effectivePermissions(user), restriction);
    }

    /** owner ได้ทุกสิทธิ์เสมอ (กันกรณีเพิ่มสิทธิ์ใหม่แล้วลืมผูกกับ owner) */
    public Set<String> effectivePermissions(User user) {
        if (Role.OWNER.equals(user.role.code)) {
            return Permission.<Permission>listAll().stream().map(p -> p.code).collect(Collectors.toCollection(TreeSet::new));
        }
        return user.role.permissionCodes();
    }

    /** token แบบจำกัด: ต้องเปลี่ยนรหัสผ่านก่อน หรือ บทบาทนี้บังคับ 2FA แต่ยังไม่ได้ตั้ง */
    public String restrictionFor(User user) {
        if (user.mustChangePassword) {
            return TokenClaims.RESTRICT_PASSWORD_CHANGE;
        }
        if (!user.mfaEnabled && settings.mfaRequiredRoles().contains(user.role.code)) {
            return TokenClaims.RESTRICT_MFA_SETUP;
        }
        return null;
    }
}
