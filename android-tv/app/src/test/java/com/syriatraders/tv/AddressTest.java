package com.syriatraders.tv;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

public class AddressTest {
    @Test
    public void addsSchemeAndTvPath() {
        assertEquals("http://192.168.1.164:8080/tv", Address.normalize("192.168.1.164:8080"));
        assertEquals("http://192.168.1.164:8080/tv", Address.normalize("  192.168.1.164:8080/ "));
        assertEquals("http://192.168.1.164:8080/tv", Address.normalize("HTTP://192.168.1.164:8080"));
    }

    @Test
    public void keepsFullLinks() {
        assertEquals("http://192.168.1.164:8080/tv", Address.normalize("http://192.168.1.164:8080/tv"));
        assertEquals("https://pc.example.ts.net/tv", Address.normalize("https://pc.example.ts.net"));
        assertEquals("http://pc:8080/tv?room=AB12CD", Address.normalize("pc:8080?room=AB12CD"));
        assertEquals("http://pc:8080/?tv=1", Address.normalize("pc:8080/?tv=1"));
    }

    @Test
    public void rejectsEmptyOrBroken() {
        assertNull(Address.normalize(""));
        assertNull(Address.normalize("   "));
        assertNull(Address.normalize(null));
        assertNull(Address.normalize("http://"));
        assertNull(Address.normalize("192.168.1.164 8080"));
        assertNull(Address.normalize(":8080"));
    }

    @Test
    public void displaysShortFormForEditing() {
        assertEquals("192.168.1.164:8080", Address.display("http://192.168.1.164:8080/tv"));
        assertEquals("https://pc.example.ts.net/tv", Address.display("https://pc.example.ts.net/tv"));
    }
}
