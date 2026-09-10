package com.itbd.afirestore.common.exception;

/**
 * DUP-007: A Firestore operation that failed for a reason worth showing the user — a rejected write,
 * an unreachable emulator, an invalid SDK argument.
 *
 * <p>This is deliberately distinct from an unexpected {@link Throwable}: {@code RestExceptionHandler}
 * returns this message verbatim, while a genuinely unexpected error returns only a correlation ID
 * (FFP-005, pinned by {@code RestExceptionHandlerTest}). Before this type existed, every controller
 * method carried its own {@code onErrorResume(e -> …ResponseEntity.internalServerError().body(
 * Map.of("message", e.getMessage()))…)} to achieve the same thing, which is how three different
 * error shapes reached the client.</p>
 */
public class OperationFailedException extends RuntimeException {

    public OperationFailedException(String message, Throwable cause) {
        super(message, cause);
    }
}
