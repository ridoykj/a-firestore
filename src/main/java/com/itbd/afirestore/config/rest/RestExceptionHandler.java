package com.itbd.afirestore.config.rest;

import com.itbd.afirestore.exceptions.NotFoundException;
import com.itbd.afirestore.exceptions.handler.error.ErrorResponse;
import com.itbd.afirestore.exceptions.handler.error.FieldError;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.server.ResponseStatusException;

import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Hidden
@RestControllerAdvice(annotations = RestController.class)
public class RestExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(RestExceptionHandler.class);

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(final NotFoundException exception) {
        final ErrorResponse errorResponse = new ErrorResponse(HttpStatus.NOT_FOUND.value(), exception.getClass().getSimpleName(), exception.getMessage(), Collections.emptyList());
        return new ResponseEntity<>(errorResponse, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleMethodArgumentNotValid(
            final MethodArgumentNotValidException exception) {
        final BindingResult bindingResult = exception.getBindingResult();
        final List<FieldError> fieldErrors = bindingResult.getFieldErrors()
                .stream()
                .map(error -> new FieldError(error.getField(), error.getCode(), error.getDefaultMessage()))
                .toList();
        final ErrorResponse errorResponse = new ErrorResponse(HttpStatus.NOT_FOUND.value(), exception.getClass().getSimpleName(), "Validation failed", fieldErrors);
        return new ResponseEntity<>(errorResponse, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(
            final ResponseStatusException exception) {
        final ErrorResponse errorResponse = new ErrorResponse(
                exception.getStatusCode().value(),
                exception.getClass().getSimpleName(),
                exception.getReason(),
                Collections.emptyList());
        return new ResponseEntity<>(errorResponse, exception.getStatusCode());
    }

    @ExceptionHandler(Throwable.class)
    @ApiResponse(responseCode = "4xx/5xx", description = "Error")
    public ResponseEntity<ErrorResponse> handleThrowable(final Throwable exception) {
//        log.error("Rest API call exception: {}", exception.toString());
        exception.printStackTrace(); // TODO: remove and add logging

        if (exception instanceof AsyncRequestNotUsableException) {
            log.warn("Client disconnected during request. Suppressing error response. Exception: {}", exception.getMessage());
            // Return NO_CONTENT (204) or OK (200) with an empty body.
            // Do NOT try to write an ErrorResponse body, as the connection is already closed
            // or expecting binary data.
            return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
        }
        final ErrorResponse errorResponse = new ErrorResponse(HttpStatus.INTERNAL_SERVER_ERROR.value(), exception.getClass().getSimpleName(), exception.getMessage(), Collections.emptyList());
        return new ResponseEntity<>(errorResponse, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ErrorResponse> handleHandlerMethodValidation(
            final HandlerMethodValidationException exception) {

        final List<FieldError> fieldErrors = exception.getParameterValidationResults().stream()
                .flatMap(parameterResult -> {
                    String parameterName = parameterResult.getMethodParameter().getParameterName();
                    return parameterResult.getResolvableErrors().stream()
                            .map(error -> new FieldError(
                                    parameterName,
                                    error.getCodes().toString(),
                                    error.getDefaultMessage()
                            ));
                })
                .collect(Collectors.toList());

        final ErrorResponse errorResponse = new ErrorResponse(
                HttpStatus.BAD_REQUEST.value(),
                exception.getClass().getSimpleName(),
                "Validation failed",
                fieldErrors
        );
        return new ResponseEntity<>(errorResponse, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler({DataIntegrityViolationException.class, ConstraintViolationException.class})
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolation(final Exception exception) {
        String userMessage = "A data integrity error occurred. The requested operation could not be completed.";
        String exceptionName = exception.getClass().getSimpleName();

        Throwable rootCause = exception.getCause();
        if (exception instanceof DataIntegrityViolationException dive && dive.getMostSpecificCause() != null) {
            rootCause = dive.getMostSpecificCause();
        }

        if (rootCause != null && rootCause.getMessage() != null) {
            String rootMessage = rootCause.getMessage();

            if (rootMessage.contains("violates unique constraint")) {
                userMessage = "A record with this value already exists. Please provide a unique value.";

                Pattern detailPattern = Pattern.compile("Key \\((.*?)\\)=\\((.*?)\\) already exists.");
                Matcher matcher = detailPattern.matcher(rootMessage);
                if (matcher.find()) {
                    String fieldName = matcher.group(1);
                    String value = matcher.group(2);
                    userMessage = String.format("The value '%s' already exists for the field '%s'. Please use a different value.", value, fieldName);
                }
            } else if (rootMessage.contains("violates foreign key constraint")) {
                userMessage = "This record cannot be deleted or modified because it is referenced by other data.";
            } else if (rootMessage.contains("null value in column")) {
                userMessage = "A required field is missing. Please provide all mandatory values.";
            }
        }

        ErrorResponse errorResponse = new ErrorResponse(
                HttpStatus.CONFLICT.value(),
                exceptionName,
                userMessage,
                Collections.emptyList()
        );

        return new ResponseEntity<>(errorResponse, HttpStatus.CONFLICT);
    }
}