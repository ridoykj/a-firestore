package com.itbd.afirestore.common.exception.handler.error;


public record FieldError(
        String field,
        String errorCode,
        String errorMessage
) {
}
