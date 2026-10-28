package com.ktt.backup;

import org.junit.jupiter.api.Test;

import java.util.Arrays;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CsvWriterTest {

    @Test
    void quotesOnlyWhenNeeded() {
        assertEquals("abc", CsvWriter.cell("abc"));
        assertEquals("", CsvWriter.cell(null));
        assertEquals("\"a,b\"", CsvWriter.cell("a,b"));
        assertEquals("\"say \"\"hi\"\"\"", CsvWriter.cell("say \"hi\""));
        assertEquals("\"line1\nline2\"", CsvWriter.cell("line1\nline2"));
        assertEquals("\" padded\"", CsvWriter.cell(" padded"));
    }

    @Test
    void lineEndsWithCrlf() {
        assertEquals("1,,\"ก,ข\"\r\n", CsvWriter.line(Arrays.asList("1", null, "ก,ข")));
        assertEquals("{a,b}", CsvWriter.array(new Object[]{"a", "b"}));
    }
}
