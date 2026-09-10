package com.itbd.afirestore.common.exception.handler.error;

import com.itbd.afirestore.firestore.dto.DocumentDto;

/**
 * FFP-104/DUP-007: The 409 body for an optimistic-concurrency conflict. Extends the standard
 * {@link ErrorResponse} shape with the server's current copy of the document so the client can
 * render a conflict diff instead of blindly retrying.
 */
public record ConflictErrorResponse(
        Integer httpStatus,
        String errorCode,
        String message,
        String correlationId,
        DocumentDto latestDocument
) {
}
