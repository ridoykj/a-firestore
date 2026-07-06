package com.itbd.afirestore.common.config.rest;

import com.itbd.afirestore.common.exception.NotFoundException;
import com.itbd.afirestore.common.exception.handler.error.ErrorResponse;
import com.itbd.afirestore.common.exception.handler.error.FieldError;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import jakarta.validation.ConstraintViolationException;
import lombok.extern.slf4j.Slf4j;
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
import org.springframework.web.server.ServerWebExchange;

import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * FFP-005: Every handled error is logged with a correlation ID and returned as a
 * structured {@link ErrorResponse} carrying a stable machine-readable error code.
 */
@Slf4j
@Hidden
@RestControllerAdvice(annotations = RestController.class)
public class RestExceptionHandler {

    static final String CORRELATION_HEADER = "X-Request-ID";

    static final String CODE_NOT_FOUND = "NOT_FOUND";
    static final String CODE_VALIDATION_FAILED = "VALIDATION_FAILED";
    static final String CODE_REQUEST_FAILED = "REQUEST_FAILED";
    static final String CODE_CONFLICT = "CONFLICT";
    static final String CODE_INTERNAL_ERROR = "INTERNAL_ERROR";

    /**
     * Uses the client-supplied X-Request-ID when present, otherwise generates one so
     * every error response can be matched to its log entry.
     */
    static String resolveCorrelationId(ServerWebExchange exchange) {
        String supplied = exchange == null
                ? null
                : exchange.getRequest().getHeaders().getFirst(CORRELATION_HEADER);
        if (supplied != null && !supplied.isBlank()) {
            return supplied.trim();
        }
        return UUID.randomUUID().toString();
    }

    @ExceptionHandler(NotFoundException.class)
    public ResponseEntity<ErrorResponse> handleNotFound(final NotFoundException exception,
            final ServerWebExchange exchange) {
        final String correlationId = resolveCorrelationId(exchange);
        log.info("Not found [correlationId={}]: {}", correlationId, exception.getMessage());
        final ErrorResponse errorResponse = new ErrorResponse(HttpStatus.NOT_FOUND.value(),
                CODE_NOT_FOUND, exception.getMessage(), correlationId, Collections.emptyList());
        return new ResponseEntity<>(errorResponse, HttpStatus.NOT_FOUND);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleMethodArgumentNotValid(
            final MethodArgumentNotValidException exception, final ServerWebExchange exchange) {
        final String correlationId = resolveCorrelationId(exchange);
        final BindingResult bindingResult = exception.getBindingResult();
        final List<FieldError> fieldErrors = bindingResult.getFieldErrors()
                .stream()
                .map(error -> new FieldError(error.getField(), error.getCode(), error.getDefaultMessage()))
                .toList();
        log.info("Validation failed [correlationId={}]: {} field error(s)", correlationId, fieldErrors.size());
        final ErrorResponse errorResponse = new ErrorResponse(HttpStatus.BAD_REQUEST.value(),
                CODE_VALIDATION_FAILED, "Validation failed", correlationId, fieldErrors);
        return new ResponseEntity<>(errorResponse, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(
            final ResponseStatusException exception, final ServerWebExchange exchange) {
        final String correlationId = resolveCorrelationId(exchange);
        log.info("Request failed [correlationId={}]: status={} reason={}",
                correlationId, exception.getStatusCode().value(), exception.getReason());
        final ErrorResponse errorResponse = new ErrorResponse(
                exception.getStatusCode().value(),
                CODE_REQUEST_FAILED,
                exception.getReason(),
                correlationId,
                Collections.emptyList());
        return new ResponseEntity<>(errorResponse, exception.getStatusCode());
    }

    @ExceptionHandler(Throwable.class)
    @ApiResponse(responseCode = "500", description = "Internal Server Error")
    public ResponseEntity<ErrorResponse> handleThrowable(final Throwable exception,
            final ServerWebExchange exchange) {
        final String correlationId = resolveCorrelationId(exchange);
        log.error("Internal error [correlationId={}]: {} - {}",
                correlationId, exception.getClass().getSimpleName(), exception.getMessage(), exception);

        if (exception instanceof AsyncRequestNotUsableException) {
            log.warn("Client disconnected during request [correlationId={}]. Suppressing error response.",
                    correlationId);
            return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
        }

        final ErrorResponse errorResponse = new ErrorResponse(
                HttpStatus.INTERNAL_SERVER_ERROR.value(),
                CODE_INTERNAL_ERROR,
                "An unexpected error occurred. Reference ID: " + correlationId,
                correlationId,
                Collections.emptyList());
        return new ResponseEntity<>(errorResponse, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    @ExceptionHandler(HandlerMethodValidationException.class)
    public ResponseEntity<ErrorResponse> handleHandlerMethodValidation(
            final HandlerMethodValidationException exception, final ServerWebExchange exchange) {
        final String correlationId = resolveCorrelationId(exchange);

        final List<FieldError> fieldErrors = exception.getParameterValidationResults().stream()
                .flatMap(parameterResult -> {
                    String parameterName = parameterResult.getMethodParameter().getParameterName();
                    return parameterResult.getResolvableErrors().stream()
                            .map(error -> new FieldError(
                                    parameterName,
                                    error.getCodes() != null && error.getCodes().length > 0
                                            ? error.getCodes()[0]
                                            : null,
                                    error.getDefaultMessage()
                            ));
                })
                .collect(Collectors.toList());

        log.info("Validation failed [correlationId={}]: {} parameter error(s)", correlationId, fieldErrors.size());
        final ErrorResponse errorResponse = new ErrorResponse(
                HttpStatus.BAD_REQUEST.value(),
                CODE_VALIDATION_FAILED,
                "Validation failed",
                correlationId,
                fieldErrors
        );
        return new ResponseEntity<>(errorResponse, HttpStatus.BAD_REQUEST);
    }

    @ExceptionHandler({DataIntegrityViolationException.class, ConstraintViolationException.class})
    public ResponseEntity<ErrorResponse> handleDataIntegrityViolation(final Exception exception,
            final ServerWebExchange exchange) {
        final String correlationId = resolveCorrelationId(exchange);
        String userMessage = "A data integrity error occurred. The requested operation could not be completed.";

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

        log.warn("Data integrity violation [correlationId={}]: {}", correlationId, userMessage);
        ErrorResponse errorResponse = new ErrorResponse(
                HttpStatus.CONFLICT.value(),
                CODE_CONFLICT,
                userMessage,
                correlationId,
                Collections.emptyList()
        );

        return new ResponseEntity<>(errorResponse, HttpStatus.CONFLICT);
    }
}
