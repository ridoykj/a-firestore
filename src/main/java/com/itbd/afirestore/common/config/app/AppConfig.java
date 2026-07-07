package com.itbd.afirestore.common.config.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AppConfig {
    /**
     * WebFlux encodes every API response with this mapper. The JavaTimeModule and
     * ISO dates are required so DocumentDto's Instant createTime/updateTime reach the
     * frontend as strings (the document preview drops them otherwise).
     */
    @Bean
    ObjectMapper objectMapper() {
        return JsonMapper.builder()
                .addModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .build();
    }
}
