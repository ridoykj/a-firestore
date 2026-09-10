package com.itbd.afirestore.common.exception.handler.error;

/**
 * FFP-203/DUP-007: The 400 body for a query that needs a composite index. Extends the standard
 * {@link ErrorResponse} shape with the create-index URL, which is the only actionable part.
 */
public record IndexRequiredErrorResponse(
        Integer httpStatus,
        String errorCode,
        String message,
        String correlationId,
        String indexUrl
) {
}
