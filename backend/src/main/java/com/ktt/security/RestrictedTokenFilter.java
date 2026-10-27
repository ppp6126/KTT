package com.ktt.security;

import com.ktt.common.ExceptionMappers.ErrorBody;
import io.quarkus.security.identity.SecurityIdentity;
import jakarta.inject.Inject;
import jakarta.ws.rs.container.ContainerRequestContext;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.jwt.JsonWebToken;
import org.jboss.resteasy.reactive.server.ServerRequestFilter;

import java.util.Map;

/**
 * token ที่มี claim "rst" (ต้องเปลี่ยนรหัสผ่าน / ต้องตั้ง 2FA) เรียกได้เฉพาะ /api/auth/**.
 * (token แบบนี้ไม่มีสิทธิ์ใน groups อยู่แล้ว ตัวกรองนี้เป็นชั้นป้องกันซ้ำและส่ง code ที่ frontend ใช้พาไปหน้าที่ถูกต้อง)
 */
public class RestrictedTokenFilter {

    @Inject
    SecurityIdentity identity;

    @ServerRequestFilter
    public Response check(ContainerRequestContext ctx) {
        if (identity.isAnonymous() || !(identity.getPrincipal() instanceof JsonWebToken jwt)) {
            return null;
        }
        String restriction = TokenClaims.string(jwt, TokenClaims.RESTRICTION);
        if (restriction == null) {
            return null;
        }
        String path = ctx.getUriInfo().getPath();
        if (path.startsWith("/")) {
            path = path.substring(1);
        }
        if (path.startsWith("api/auth/") || path.equals("api/auth")) {
            return null;
        }
        String message = TokenClaims.RESTRICT_PASSWORD_CHANGE.equals(restriction)
                ? "กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน"
                : "บทบาทของคุณต้องเปิดใช้การยืนยันตัวตน 2 ขั้นตอนก่อนใช้งาน";
        return Response.status(403)
                .type(MediaType.APPLICATION_JSON)
                .entity(new ErrorBody("restricted_" + restriction, message, Map.of("restriction", restriction)))
                .build();
    }
}
