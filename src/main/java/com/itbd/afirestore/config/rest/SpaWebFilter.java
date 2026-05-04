package com.itbd.afirestore.config.rest;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;
import org.springframework.web.server.WebFilter;
import org.springframework.web.server.WebFilterChain;
import reactor.core.publisher.Mono;

import java.util.List;

@Slf4j
@Component
public class SpaWebFilter implements WebFilter {

    private static final List<String> EXCLUDED_PREFIXES = List.of(
            "/api",
            "/docs",
            "/v3/api-docs",
            "/swagger-ui",
            "/ui",
            "/actuator",
            "/error"
    );

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, WebFilterChain chain) {
        ServerHttpRequest request = exchange.getRequest();
        String path = request.getPath().value();

        if (shouldForwardToIndex(request, path)) {
            ServerHttpRequest indexRequest = request.mutate().path("/index.html").build();
            return chain.filter(exchange.mutate().request(indexRequest).build());
        }

        return chain.filter(exchange);
    }

    private boolean shouldForwardToIndex(ServerHttpRequest request, String path) {
        if (!(HttpMethod.GET.equals(request.getMethod()) || HttpMethod.HEAD.equals(request.getMethod()))) {
            return false;
        }
        if (path.contains(".")) {
            return false;
        }
        if (EXCLUDED_PREFIXES.stream().anyMatch(path::startsWith)) {
            return false;
        }
        return request.getHeaders().getAccept().stream()
                .anyMatch(mediaType -> mediaType.isCompatibleWith(MediaType.TEXT_HTML));
    }
}
