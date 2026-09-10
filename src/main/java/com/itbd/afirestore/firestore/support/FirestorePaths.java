package com.itbd.afirestore.firestore.support;

import java.util.ArrayList;
import java.util.List;

/**
 * DUP-001: The single source of truth for Firestore path normalization and the
 * collection/document parity rule.
 *
 * <p>A Firestore collection path has an odd number of segments ({@code users},
 * {@code users/alice/posts}); a document path has an even number ({@code users/alice}). That
 * decision used to be made by {@code path.split("/").length % 2} inlined at eight call sites, each
 * fed by one of six normalizers that stripped different amounts of slash. Because Java's
 * {@link String#split(String)} keeps leading and interior empty segments, how much a normalizer
 * stripped changed the segment count and therefore flipped the classification — {@code //users} was
 * a collection on one endpoint and a rejected document path on another.</p>
 *
 * <p>{@link #normalize(String)} drops <em>every</em> empty segment, so it is idempotent and every
 * predicate here normalizes before counting. Callers may pass raw or already-normalized input and
 * always get the same answer.</p>
 */
public final class FirestorePaths {

    private FirestorePaths() {
    }

    /**
     * Trims the path, then drops every empty segment — leading, trailing, and interior — so
     * {@code "/users/"}, {@code "//users"}, and {@code "users"} all normalize to {@code "users"},
     * and {@code "users//alice"} to {@code "users/alice"}. Returns {@code ""} for null or blank.
     */
    public static String normalize(String rawPath) {
        if (rawPath == null) {
            return "";
        }
        String trimmed = rawPath.trim();
        if (trimmed.isEmpty()) {
            return "";
        }
        String[] pieces = trimmed.split("/");
        List<String> segments = new ArrayList<>(pieces.length);
        for (String piece : pieces) {
            String segment = piece.trim();
            if (!segment.isEmpty()) {
                segments.add(segment);
            }
        }
        return String.join("/", segments);
    }

    /** Number of segments after normalization; {@code 0} for a blank path. */
    public static int segmentCount(String rawPath) {
        String normalized = normalize(rawPath);
        return normalized.isEmpty() ? 0 : normalized.split("/").length;
    }

    /** True when the path names a collection (odd, non-zero segment count). */
    public static boolean isCollection(String rawPath) {
        int count = segmentCount(rawPath);
        return count > 0 && count % 2 != 0;
    }

    /** True when the path names a document (even, non-zero segment count). */
    public static boolean isDocument(String rawPath) {
        int count = segmentCount(rawPath);
        return count > 0 && count % 2 == 0;
    }

    /**
     * Returns the normalized path, or throws {@link IllegalArgumentException} when it does not name
     * a document.
     */
    public static String requireDocument(String rawPath) {
        String normalized = normalize(rawPath);
        if (!isDocument(normalized)) {
            throw new IllegalArgumentException(
                    "A document path with an even number of segments is required, got: '" + rawPath + "'.");
        }
        return normalized;
    }

    /**
     * Returns the normalized path, or throws {@link IllegalArgumentException} when it does not name
     * a collection.
     */
    public static String requireCollection(String rawPath) {
        String normalized = normalize(rawPath);
        if (!isCollection(normalized)) {
            throw new IllegalArgumentException(
                    "A collection path with an odd number of segments is required, got: '" + rawPath + "'.");
        }
        return normalized;
    }

    /** Last segment of the path — a document id for a document path, a collection id otherwise. */
    public static String lastSegment(String rawPath) {
        String normalized = normalize(rawPath);
        if (normalized.isEmpty()) {
            return "";
        }
        int lastSlash = normalized.lastIndexOf('/');
        return lastSlash < 0 ? normalized : normalized.substring(lastSlash + 1);
    }

    /** Parent path, or {@code ""} for a single-segment or blank path. */
    public static String parent(String rawPath) {
        String normalized = normalize(rawPath);
        int lastSlash = normalized.lastIndexOf('/');
        return lastSlash < 0 ? "" : normalized.substring(0, lastSlash);
    }
}
