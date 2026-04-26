package com.itbd.afirestore.exceptions.handler.error;


public record FieldError(
        String field,
        String errorCode,
        String errorMessage
) {
}
