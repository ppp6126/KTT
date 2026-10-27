package com.ktt.auth;

import com.ktt.common.Tokens;
import jakarta.enterprise.context.ApplicationScoped;
import org.bouncycastle.crypto.generators.Argon2BytesGenerator;
import org.bouncycastle.crypto.params.Argon2Parameters;

import java.security.MessageDigest;
import java.util.Base64;

/**
 * Argon2id ตามค่าแนะนำ OWASP (m=19 MiB, t=2, p=1) เก็บในรูปแบบ PHC string:
 * {@code $argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>}
 */
@ApplicationScoped
public class PasswordHasher {

    private static final int MEMORY_KB = 19456;
    private static final int ITERATIONS = 2;
    private static final int PARALLELISM = 1;
    private static final int SALT_LEN = 16;
    private static final int HASH_LEN = 32;
    private static final Base64.Encoder B64 = Base64.getEncoder().withoutPadding();
    private static final Base64.Decoder B64D = Base64.getDecoder();

    /** hash ปลอมไว้ verify เมื่อไม่พบอีเมล เพื่อให้เวลาตอบสนองเท่ากัน (กันการเดาอีเมล) */
    private volatile String dummyHash;

    public String hash(String password) {
        byte[] salt = Tokens.randomBytes(SALT_LEN);
        byte[] out = derive(password, salt, MEMORY_KB, ITERATIONS, PARALLELISM, HASH_LEN);
        return "$argon2id$v=19$m=" + MEMORY_KB + ",t=" + ITERATIONS + ",p=" + PARALLELISM
                + "$" + B64.encodeToString(salt) + "$" + B64.encodeToString(out);
    }

    public boolean verify(String password, String encoded) {
        if (password == null || encoded == null) {
            return false;
        }
        try {
            String[] parts = encoded.split("\\$");
            // ["", "argon2id", "v=19", "m=..,t=..,p=..", salt, hash]
            if (parts.length != 6 || !"argon2id".equals(parts[1])) {
                return false;
            }
            int m = 0;
            int t = 0;
            int p = 0;
            for (String kv : parts[3].split(",")) {
                String[] pair = kv.split("=");
                switch (pair[0]) {
                    case "m" -> m = Integer.parseInt(pair[1]);
                    case "t" -> t = Integer.parseInt(pair[1]);
                    case "p" -> p = Integer.parseInt(pair[1]);
                    default -> {
                        return false;
                    }
                }
            }
            byte[] salt = B64D.decode(parts[4]);
            byte[] expected = B64D.decode(parts[5]);
            byte[] actual = derive(password, salt, m, t, p, expected.length);
            return MessageDigest.isEqual(expected, actual);
        } catch (RuntimeException e) {
            return false;
        }
    }

    /** เรียกเมื่อไม่พบผู้ใช้ เพื่อใช้เวลาประมวลผลเท่ากับกรณีพบ */
    public void verifyDummy(String password) {
        String h = dummyHash;
        if (h == null) {
            h = hash("dummy-password-for-timing");
            dummyHash = h;
        }
        verify(password == null ? "" : password, h);
    }

    /** ต้องเปลี่ยน hash ใหม่หรือไม่ (เมื่อปรับพารามิเตอร์ในอนาคต) */
    public boolean needsRehash(String encoded) {
        return encoded == null || !encoded.startsWith("$argon2id$v=19$m=" + MEMORY_KB + ",t=" + ITERATIONS + ",p=" + PARALLELISM + "$");
    }

    private static byte[] derive(String password, byte[] salt, int memoryKb, int iterations, int parallelism, int len) {
        Argon2Parameters params = new Argon2Parameters.Builder(Argon2Parameters.ARGON2_id)
                .withVersion(Argon2Parameters.ARGON2_VERSION_13)
                .withMemoryAsKB(memoryKb)
                .withIterations(iterations)
                .withParallelism(parallelism)
                .withSalt(salt)
                .build();
        Argon2BytesGenerator gen = new Argon2BytesGenerator();
        gen.init(params);
        byte[] out = new byte[len];
        gen.generateBytes(password.toCharArray(), out);
        return out;
    }
}
