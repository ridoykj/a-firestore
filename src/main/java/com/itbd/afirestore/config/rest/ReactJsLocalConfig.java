package com.itbd.afirestore.config.rest;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.config.CorsRegistry;
import org.springframework.web.reactive.config.WebFluxConfigurer;

@Configuration
//@Profile("local")
public class ReactJsLocalConfig implements WebFluxConfigurer {
    //    @Bean
//    public WebMvcConfigurer corsConfigurer() {
//        return new WebMvcConfigurer() {
//            @Override
//            public void addCorsMappings(final CorsRegistry registry) {
//                registry.addMapping("/**").allowedMethods("*").allowedOrigins("http://localhost:4200");
//            }
//        };
//    }
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**").allowedMethods("*").allowedOrigins("http://localhost:5173");

    }
}
