package com.ktt.auth;

import com.ktt.auth.AuthDtos.ChangePasswordRequest;
import com.ktt.auth.AuthDtos.ForgotPasswordRequest;
import com.ktt.auth.AuthDtos.LoginRequest;
import com.ktt.auth.AuthDtos.LoginResponse;
import com.ktt.auth.AuthDtos.Me;
import com.ktt.auth.AuthDtos.MfaCodeRequest;
import com.ktt.auth.AuthDtos.MfaDisableRequest;
import com.ktt.auth.AuthDtos.MfaSetupResponse;
import com.ktt.auth.AuthDtos.MfaVerifyRequest;
import com.ktt.auth.AuthDtos.RecoveryCodesResponse;
import com.ktt.auth.AuthDtos.ResetPasswordRequest;
import com.ktt.auth.AuthDtos.SessionInfo;
import com.ktt.security.CurrentUser;
import io.quarkus.security.Authenticated;
import jakarta.annotation.security.PermitAll;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.CookieParam;
import jakarta.ws.rs.DELETE;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.NewCookie;
import jakarta.ws.rs.core.Response;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Endpoint ยืนยันตัวตน. Refresh token อยู่ใน cookie HttpOnly + Secure + SameSite=Strict
 * ที่ path /api/auth เท่านั้น (JavaScript อ่านไม่ได้ และไม่ถูกส่งไปกับ API อื่น)
 */
@Path("/api/auth")
@Produces(MediaType.APPLICATION_JSON)
public class AuthResource {

    @Inject
    AuthService auth;

    @Inject
    MfaService mfa;

    @Inject
    AuthConfig config;

    @Inject
    CurrentUser currentUser;

    @POST
    @Path("/login")
    @PermitAll
    public Response login(@Valid LoginRequest req) {
        return withCookie(auth.login(req));
    }

    @POST
    @Path("/mfa/verify")
    @PermitAll
    public Response verifyMfa(@Valid MfaVerifyRequest req) {
        return withCookie(auth.verifyMfa(req));
    }

    /** ใช้ cookie ktt_rt ออก access token ใหม่ + หมุน refresh token */
    @POST
    @Path("/refresh")
    @PermitAll
    public Response refresh(@CookieParam("ktt_rt") String refreshToken) {
        try {
            return withCookie(auth.refresh(refreshToken));
        } catch (com.ktt.common.ApiException e) {
            if (e.status() == 401) {
                // ลบ cookie ที่ใช้ไม่ได้แล้ว
                return Response.status(401)
                        .type(MediaType.APPLICATION_JSON)
                        .entity(new com.ktt.common.ExceptionMappers.ErrorBody(e.code(), e.getMessage(), null))
                        .cookie(clearCookie())
                        .build();
            }
            throw e;
        }
    }

    @POST
    @Path("/logout")
    @PermitAll
    public Response logout(@CookieParam("ktt_rt") String refreshToken) {
        auth.logout(refreshToken, currentUser.isAuthenticated() ? currentUser.sessionId() : null);
        return Response.noContent().cookie(clearCookie()).build();
    }

    @GET
    @Path("/me")
    @Authenticated
    public Me me() {
        return auth.me(currentUser.id());
    }

    // ---------------------------------------------------------------- password

    /** เปลี่ยนรหัสผ่าน: คืน access token ใหม่ (ข้อจำกัด "ต้องเปลี่ยนรหัสผ่าน" หายไป) และตัด session อื่นทั้งหมด */
    @POST
    @Path("/password/change")
    @Authenticated
    public LoginResponse changePassword(@Valid ChangePasswordRequest req) {
        auth.changePassword(currentUser.id(), currentUser.sessionId(), req);
        return auth.reissue(currentUser.id(), currentUser.sessionId());
    }

    @POST
    @Path("/password/forgot")
    @PermitAll
    public Response forgotPassword(@Valid ForgotPasswordRequest req) {
        auth.forgotPassword(req.email());
        return Response.accepted(Map.of("message", "หากอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว")).build();
    }

    @POST
    @Path("/password/reset")
    @PermitAll
    public Response resetPassword(@Valid ResetPasswordRequest req) {
        auth.resetPassword(req);
        return Response.noContent().build();
    }

    // ---------------------------------------------------------------- 2FA

    @POST
    @Path("/mfa/setup")
    @Authenticated
    public MfaSetupResponse mfaSetup() {
        return mfa.setup(currentUser.id());
    }

    /** เปิดใช้ 2FA: คืน recovery codes + access token ใหม่ */
    @POST
    @Path("/mfa/enable")
    @Authenticated
    public Map<String, Object> mfaEnable(@Valid MfaCodeRequest req) {
        List<String> codes = mfa.enable(currentUser.id(), currentUser.sessionId(), req.code());
        LoginResponse tokens = auth.reissue(currentUser.id(), currentUser.sessionId());
        return Map.of("recoveryCodes", codes, "auth", tokens);
    }

    @POST
    @Path("/mfa/disable")
    @Authenticated
    public Response mfaDisable(@Valid MfaDisableRequest req) {
        mfa.disable(currentUser.id(), req.password(), req.code());
        return Response.noContent().build();
    }

    @POST
    @Path("/mfa/recovery-codes")
    @Authenticated
    public RecoveryCodesResponse regenerateRecoveryCodes(@Valid MfaCodeRequest req) {
        return new RecoveryCodesResponse(mfa.regenerateRecoveryCodes(currentUser.id(), req.code()));
    }

    // ---------------------------------------------------------------- sessions

    @GET
    @Path("/sessions")
    @Authenticated
    public List<SessionInfo> sessions() {
        return auth.listSessions(currentUser.id(), currentUser.sessionId());
    }

    @DELETE
    @Path("/sessions/{id}")
    @Authenticated
    public Response revokeSession(@PathParam("id") UUID id) {
        auth.revokeSession(currentUser.id(), id);
        return Response.noContent().build();
    }

    @POST
    @Path("/sessions/revoke-others")
    @Authenticated
    public Map<String, Integer> revokeOthers() {
        return Map.of("revoked", auth.revokeOtherSessions(currentUser.id(), currentUser.sessionId()));
    }

    // ---------------------------------------------------------------- cookie helpers

    private Response withCookie(AuthService.AuthOutcome outcome) {
        Response.ResponseBuilder rb = Response.ok(outcome.body());
        if (outcome.refreshToken() != null) {
            rb.cookie(refreshCookie(outcome.refreshToken(), (int) outcome.refreshMaxAgeSeconds()));
        }
        return rb.header("Cache-Control", "no-store").build();
    }

    private NewCookie refreshCookie(String value, int maxAge) {
        return new NewCookie.Builder(config.cookieName())
                .value(value)
                .path(config.cookiePath())
                .httpOnly(true)
                .secure(config.cookieSecure())
                .sameSite(NewCookie.SameSite.STRICT)
                .maxAge(maxAge)
                .build();
    }

    private NewCookie clearCookie() {
        return new NewCookie.Builder(config.cookieName())
                .value("")
                .path(config.cookiePath())
                .httpOnly(true)
                .secure(config.cookieSecure())
                .sameSite(NewCookie.SameSite.STRICT)
                .maxAge(0)
                .build();
    }
}
