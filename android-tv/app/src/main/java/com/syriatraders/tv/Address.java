package com.syriatraders.tv;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Turns what the player types on the TV into the game's TV page address, and back. */
final class Address {
    private static final Pattern URL = Pattern.compile("^(https?)://([^/?#\\s]+)(\\S*)$", Pattern.CASE_INSENSITIVE);

    private Address() {}

    /**
     * "192.168.1.164:8080" becomes "http://192.168.1.164:8080/tv". A full link
     * (such as the online https link) is kept, with /tv added when it has no path.
     * Returns null when there is no usable address.
     */
    static String normalize(String input) {
        String text = input == null ? "" : input.trim();
        if (text.isEmpty()) return null;
        if (!text.toLowerCase(Locale.ROOT).matches("^https?://.*")) text = "http://" + text;
        Matcher m = URL.matcher(text);
        if (!m.matches()) return null;
        String scheme = m.group(1).toLowerCase(Locale.ROOT);
        String host = m.group(2);
        String rest = m.group(3);
        if (host.startsWith(":") || host.endsWith(":")) return null;
        if (rest.isEmpty() || rest.equals("/")) rest = "/tv";
        else if (rest.startsWith("?") || rest.startsWith("#")) rest = "/tv" + rest;
        return scheme + "://" + host + rest;
    }

    /** "http://192.168.1.164:8080/tv" -> "192.168.1.164:8080", for editing on the setup screen. */
    static String display(String full) {
        if (full.startsWith("http://") && full.endsWith("/tv")) {
            return full.substring("http://".length(), full.length() - "/tv".length());
        }
        return full;
    }
}
