package com.ktt.site;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class QcRulesTest {

    private static SiteDtos.QcItem i(String r) {
        return new SiteDtos.QcItem("x", r, null);
    }

    @Test
    void anyFailMeansFail() {
        assertEquals("fail", QcRules.result(List.of(i("pass"), i("fail"), i(null))));
    }

    @Test
    void uncheckedMeansPending() {
        assertEquals("pending", QcRules.result(List.of(i("pass"), i(null))));
        assertEquals("pending", QcRules.result(List.of(i("na"))));
    }

    @Test
    void allPassIgnoringNa() {
        assertEquals("pass", QcRules.result(List.of(i("pass"), i("na"))));
    }
}
