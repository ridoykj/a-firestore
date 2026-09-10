package com.itbd.afirestore.firestore.support;

/**
 * DUP-004: The single source of truth for connection identity — database-id normalization and the
 * connection key built from it.
 *
 * <p>The {@code "" -> "(default)"} mapping is the identity function for three different keys: the
 * backend connection key in {@code FirestoreManagerService}, the frontend tab id, and the
 * localStorage context key for saved queries, history, column prefs, and validation rules. It used
 * to be spelled out in six backend places (two spellings of the same ternary). A copy that trimmed
 * differently produced a tab whose requests hit one connection while its persisted state lived
 * under another key, so this stays in one place.</p>
 */
public final class FirestoreIds {

    /** Firestore's name for the unnamed database; the wire and key form of a blank database id. */
    public static final String DEFAULT_DATABASE_ID = "(default)";

    private FirestoreIds() {
    }

    /** Maps a null, blank, or whitespace database id to {@value #DEFAULT_DATABASE_ID}. */
    public static String normalizeDatabaseId(String databaseId) {
        return databaseId == null || databaseId.trim().isEmpty()
                ? DEFAULT_DATABASE_ID
                : databaseId.trim();
    }

    /** True when the id refers to the unnamed database, in either its blank or explicit form. */
    public static boolean isDefaultDatabaseId(String databaseId) {
        return DEFAULT_DATABASE_ID.equals(normalizeDatabaseId(databaseId));
    }

    /** Requires a non-blank project id, returning it trimmed. */
    public static String requireProjectId(String projectId) {
        if (projectId == null || projectId.trim().isEmpty()) {
            throw new IllegalArgumentException("projectId is required.");
        }
        return projectId.trim();
    }

    /**
     * The registry key for a connection. Always built from normalized parts so a blank and an
     * explicit {@value #DEFAULT_DATABASE_ID} resolve to the same client.
     */
    public static String connectionKey(String projectId, String databaseId) {
        return requireProjectId(projectId) + ":" + normalizeDatabaseId(databaseId);
    }
}
