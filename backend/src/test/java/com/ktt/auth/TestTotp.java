package com.ktt.auth;

/** ให้ integration test นอกแพ็กเกจ auth สร้างรหัส TOTP ได้ */
public final class TestTotp {

    private TestTotp() {
    }

    public static String code(String base32Secret) {
        return new TotpService().generate(Base32.decode(base32Secret), java.time.Instant.now().getEpochSecond() / 30);
    }
}
