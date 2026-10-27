package com.ktt.common;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ThaiTaxIdTest {

    @Test
    void checksum() {
        // check digit = (11 - (Σ d[i]*(13-i)) mod 11) mod 10
        assertTrue(ThaiTaxId.Validator.isValidTaxId("0105558000014"));
        assertTrue(ThaiTaxId.Validator.isValidTaxId("1101700207030"));
        assertFalse(ThaiTaxId.Validator.isValidTaxId("1101700207031"));
        assertFalse(ThaiTaxId.Validator.isValidTaxId("12345"));
        assertFalse(ThaiTaxId.Validator.isValidTaxId("abcdefghijklm"));
    }
}
