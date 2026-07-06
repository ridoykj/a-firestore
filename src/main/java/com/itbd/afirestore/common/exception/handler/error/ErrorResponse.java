package com.itbd.afirestore.common.exception.handler.error;


import java.util.List;

/**
 * FFP-005: Structured API error body with a stable machine-readable code and a
 * request correlation ID that also appears in the server logs.
 */
public record ErrorResponse(
        Integer httpStatus,
        String errorCode,
        String message,
        String correlationId,
        List<FieldError> fieldErrors
) {
}
