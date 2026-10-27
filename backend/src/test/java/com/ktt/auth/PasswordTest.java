package com.ktt.auth;

import com.ktt.common.ApiException;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PasswordTest {

    private final PasswordHasher hasher = new PasswordHasher();

    @Test
    void hashAndVerify() {
        String h = hasher.hash("Correct-Horse-9");
        assertTrue(h.startsWith("$argon2id$v=19$m=19456,t=2,p=1$"));
        assertTrue(hasher.verify("Correct-Horse-9", h));
        assertFalse(hasher.verify("correct-horse-9", h));
        assertFalse(hasher.verify("Correct-Horse-9", "garbage"));
        assertFalse(hasher.needsRehash(h));
    }

    @Test
    void saltIsRandom() {
        assertNotEquals(hasher.hash("Same-Password-1"), hasher.hash("Same-Password-1"));
    }

    @Test
    void policy() {
        assertThrows(ApiException.class, () -> PasswordPolicy.check("short1", "a@b.com"));
        assertThrows(ApiException.class, () -> PasswordPolicy.check("onlyletterslong", "a@b.com"));
        assertThrows(ApiException.class, () -> PasswordPolicy.check("1234567890123", "a@b.com"));
        assertThrows(ApiException.class, () -> PasswordPolicy.check("somchai2024xx", "somchai@ktt.co.th"));
        assertDoesNotThrow(() -> PasswordPolicy.check("Bangkok-Site-77", "somchai@ktt.co.th"));
    }
}
