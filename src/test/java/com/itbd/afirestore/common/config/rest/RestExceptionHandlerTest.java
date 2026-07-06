package com.itbd.afirestore.common.config.rest;

import com.itbd.afirestore.common.exception.NotFoundException;
import com.itbd.afirestore.common.exception.handler.error.ErrorResponse;
import org.junit.jupiter.api.Test;
import org.springframework.core.MethodParameter;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.http.server.reactive.MockServerHttpRequest;
import org.springframework.mock.web.server.MockServerWebExchange;
import org.springframework.validation.BeanPropertyBindingResult;
import org.springframework.web.bind.MethodArgumentNotValidException;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * FFP-005: Structured diagnostics tests — stable error codes and correlation IDs.
 */
class RestExceptionHandlerTest {

    private final RestExceptionHandler handler = new RestExceptionHandler();

    private static MockServerWebExchange exchangeWithHeader(String correlationId) {
        MockServerHttpRequest.BaseBuilder<?> builder = MockServerHttpRequest.get("/api/test");
        if (correlationId != null) {
            builder.header(RestExceptionHandler.CORRELATION_HEADER, correlationId);
        }
        return MockServerWebExchange.from(builder.build());
    }

    @Test
    void resolveCorrelationIdUsesSuppliedHeader() {
        assertThat(RestExceptionHandler.resolveCorrelationId(exchangeWithHeader("client-id-1")))
                .isEqualTo("client-id-1");
    }

    @Test
    void resolveCorrelationIdGeneratesOneWhenHeaderIsMissing() {
        String generated = RestExceptionHandler.resolveCorrelationId(exchangeWithHeader(null));
        assertThat(generated).isNotBlank();
    }

    @Test
    void notFoundUsesStableCodeAndCorrelationId() {
        ResponseEntity<ErrorResponse> response =
                handler.handleNotFound(new NotFoundException("missing"), exchangeWithHeader("corr-404"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().httpStatus()).isEqualTo(404);
        assertThat(response.getBody().errorCode()).isEqualTo(RestExceptionHandler.CODE_NOT_FOUND);
        assertThat(response.getBody().correlationId()).isEqualTo("corr-404");
    }

    @Test
    void validationErrorsReturnMatchingBodyAndResponseStatus() throws Exception {
        Method method = SampleTarget.class.getDeclaredMethod("sample", String.class);
        MethodParameter parameter = new MethodParameter(method, 0);
        BeanPropertyBindingResult bindingResult = new BeanPropertyBindingResult(new Object(), "request");
        bindingResult.addError(new org.springframework.validation.FieldError(
                "request", "name", "must not be blank"));
        MethodArgumentNotValidException exception =
                new MethodArgumentNotValidException(parameter, bindingResult);

        ResponseEntity<ErrorResponse> response =
                handler.handleMethodArgumentNotValid(exception, exchangeWithHeader(null));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody()).isNotNull();
        // Regression: body used to claim 404 while the HTTP status was 400.
        assertThat(response.getBody().httpStatus()).isEqualTo(400);
        assertThat(response.getBody().errorCode()).isEqualTo(RestExceptionHandler.CODE_VALIDATION_FAILED);
        assertThat(response.getBody().correlationId()).isNotBlank();
        assertThat(response.getBody().fieldErrors()).hasSize(1);
        assertThat(response.getBody().fieldErrors().get(0).field()).isEqualTo("name");
    }

    @Test
    void unexpectedErrorsReturnInternalErrorCodeWithoutLeakingDetails() {
        ResponseEntity<ErrorResponse> response =
                handler.handleThrowable(new RuntimeException("secret internals"), exchangeWithHeader("corr-500"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().errorCode()).isEqualTo(RestExceptionHandler.CODE_INTERNAL_ERROR);
        assertThat(response.getBody().correlationId()).isEqualTo("corr-500");
        assertThat(response.getBody().message()).doesNotContain("secret internals");
    }

    @SuppressWarnings("unused")
    private static class SampleTarget {
        void sample(String name) {
        }
    }
}
