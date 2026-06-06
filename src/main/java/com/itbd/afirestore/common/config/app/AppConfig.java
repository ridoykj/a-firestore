package com.itbd.afirestore.common.config.app;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class AppConfig {
    @Bean
    ObjectMapper objectMapper() {
        return new ObjectMapper();
    }
}
