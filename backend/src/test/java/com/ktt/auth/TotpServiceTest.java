package com.ktt.auth;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TotpServiceTest {

    private final TotpService totp = new TotpService();
    /** RFC 6238 test secret "12345678901234567890" */
    private final String secret = Base32.encode("12345678901234567890".getBytes(StandardCharsets.US_ASCII));

    @Test
    void rfc6238Vectors() {
        byte[] key = Base32.decode(secret);
        assertEquals("287082", totp.generate(key, 59 / 30));
        assertEquals("081804", totp.generate(key, 1111111109L / 30));
        assertEquals("050471", totp.generate(key, 1111111111L / 30));
    }

    @Test
    void acceptsCurrentAndAdjacentWindow() {
        byte[] key = Base32.decode(secret);
        long now = 1_700_000_000L;
        long step = now / 30;
        assertEquals(step, totp.verifyAt(secret, totp.generate(key, step), 0, now));
        assertEquals(step - 1, totp.verifyAt(secret, totp.generate(key, step - 1), 0, now));
        assertEquals(-1, totp.verifyAt(secret, totp.generate(key, step - 3), 0, now));
    }

    @Test
    void rejectsReplay() {
        byte[] key = Base32.decode(secret);
        long now = 1_700_000_000L;
        long step = now / 30;
        assertEquals(-1, totp.verifyAt(secret, totp.generate(key, step), step, now));
    }

    @Test
    void rejectsMalformed() {
        assertEquals(-1, totp.verifyAt(secret, "12ab56", 0, 59));
        assertEquals(-1, totp.verifyAt(secret, null, 0, 59));
    }

    @Test
    void base32RoundTrip() {
        byte[] data = {0, 1, 2, (byte) 250, 99, 17, 42};
        assertTrue(java.util.Arrays.equals(data, Base32.decode(Base32.encode(data))));
    }
}
