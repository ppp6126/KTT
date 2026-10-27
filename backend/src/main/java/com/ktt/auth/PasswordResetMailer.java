package com.ktt.auth;

import io.quarkus.mailer.Mail;
import io.quarkus.mailer.Mailer;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import org.eclipse.microprofile.config.inject.ConfigProperty;
import org.jboss.logging.Logger;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.time.Duration;

@ApplicationScoped
public class PasswordResetMailer {

    private static final Logger LOG = Logger.getLogger(PasswordResetMailer.class);

    @Inject
    Mailer mailer;

    @ConfigProperty(name = "ktt.app.base-url")
    String baseUrl;

    @ConfigProperty(name = "ktt.app.name")
    String appName;

    @ConfigProperty(name = "quarkus.mailer.mock", defaultValue = "false")
    boolean mock;

    public void send(User user, String rawToken, Duration ttl) {
        String link = baseUrl + "/reset-password?token=" + URLEncoder.encode(rawToken, StandardCharsets.UTF_8);
        String html = """
                <div style="font-family:Sarabun,Tahoma,sans-serif;font-size:15px;color:#222">
                  <p>เรียน คุณ%s</p>
                  <p>มีการขอรีเซ็ตรหัสผ่านสำหรับบัญชี %s ในระบบ %s</p>
                  <p><a href="%s" style="display:inline-block;padding:10px 18px;background:#1f4e79;color:#fff;text-decoration:none;border-radius:6px">ตั้งรหัสผ่านใหม่</a></p>
                  <p>ลิงก์นี้ใช้ได้ครั้งเดียว และหมดอายุใน %d นาที</p>
                  <p style="color:#777">หากคุณไม่ได้เป็นผู้ขอ ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้งานได้ตามปกติ</p>
                </div>
                """.formatted(escape(user.name), escape(user.email), escape(appName), link, ttl.toMinutes());
        try {
            mailer.send(Mail.withHtml(user.email, "[" + appName + "] ตั้งรหัสผ่านใหม่", html));
            if (mock) {
                LOG.infof("[DEV] Password reset link for %s: %s", user.email, link);
            }
        } catch (RuntimeException e) {
            // ไม่ให้ความผิดพลาดของอีเมลเปิดเผยว่าอีเมลนี้มีอยู่ในระบบ
            LOG.error("Cannot send password reset email", e);
        }
    }

    private static String escape(String s) {
        if (s == null) {
            return "";
        }
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;");
    }
}
