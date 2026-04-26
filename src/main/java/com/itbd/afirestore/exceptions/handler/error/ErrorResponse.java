package com.itbd.afirestore.exceptions.handler.error;


import java.util.List;
public record ErrorResponse(
        Integer httpStatus,
        String exception,
        String message,
        List<FieldError> fieldErrors
) {
}