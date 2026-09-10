package com.itbd.afirestore.common.exception;

import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * FFP-203/DUP-007: A query that Firestore refuses to serve until a composite index exists.
 *
 * <p>Firestore reports this as {@code FAILED_PRECONDITION} with a create-index URL buried in the
 * message. Detection used to live in the workbench controller's error ladder, which meant only that
 * one endpoint translated it; it now lives here and is thrown by the query service so
 * {@code RestExceptionHandler} can render the {@code INDEX_REQUIRED} payload for any caller.</p>
 */
public class IndexRequiredException extends RuntimeException {

    /** Matches the create-index URL inside a Firestore error message. */
    private static final Pattern INDEX_URL_PATTERN = Pattern.compile("(https?://[^\\s\"']+)");

    private static final String DEFAULT_MESSAGE =
            "This query needs a Firestore composite index. Create it, then rerun the query.";

    private final String indexUrl;

    public IndexRequiredException(String message, String indexUrl, Throwable cause) {
        super(message, cause);
        this.indexUrl = indexUrl;
    }

    /** The create-index URL Firestore suggested, or {@code ""} when the message named none. */
    public String getIndexUrl() {
        return indexUrl == null ? "" : indexUrl;
    }

    /**
     * Returns an {@code IndexRequiredException} when {@code error} (or any of its causes) is a
     * missing-composite-index failure, otherwise {@code null} so the caller can rethrow the
     * original.
     */
    public static IndexRequiredException from(Throwable error) {
        Throwable current = error;
        while (current != null) {
            String message = current.getMessage();
            if (message != null) {
                String lower = message.toLowerCase(Locale.ROOT);
                boolean indexError = lower.contains("requires an index")
                        || lower.contains("create_composite")
                        || (lower.contains("failed_precondition") && lower.contains("index"));
                if (indexError) {
                    Matcher matcher = INDEX_URL_PATTERN.matcher(message);
                    return new IndexRequiredException(
                            DEFAULT_MESSAGE, matcher.find() ? matcher.group(1) : "", error);
                }
            }
            current = current.getCause();
        }
        return null;
    }
}
