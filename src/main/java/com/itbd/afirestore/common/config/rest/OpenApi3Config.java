package com.itbd.afirestore.common.config.rest;


import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.media.*;
import io.swagger.v3.oas.models.responses.ApiResponse;
import io.swagger.v3.oas.models.servers.Server;
import io.swagger.v3.oas.models.tags.Tag;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springdoc.core.customizers.OperationCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Comparator;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;


@Configuration
public class OpenApi3Config {

    @Bean
    public OpenAPI openApiSpec() {
        return new OpenAPI().components(new Components()
                        .addSchemas("ApiErrorResponse", new ObjectSchema()
                                .addProperty("status", new IntegerSchema())
                                .addProperty("code", new StringSchema())
                                .addProperty("message", new StringSchema())
                                .addProperty("fieldErrors", new ArraySchema().items(
                                        new Schema<ArraySchema>().$ref("ApiFieldError"))))
                        .addSchemas("ApiFieldError", new ObjectSchema()
                                .addProperty("code", new StringSchema())
                                .addProperty("message", new StringSchema())
                                .addProperty("property", new StringSchema())
                                .addProperty("rejectedValue", new ObjectSchema())
                                .addProperty("path", new StringSchema())))
                .servers(List.of(
                        new Server().url("/").description("Local server")))
                .info(
                        new Info()
                                .title("a-firestore API Documentation")
                                .version("0.0.1-SNAPSHOT")
                                .description("a-firestore is a local, single-user Firestore power tool for browsing, querying, and managing Cloud Firestore data from the command line."));

    }


    @Bean
    public OperationCustomizer operationCustomizer() {
        // FFP-005: Add structured error responses per status code instead of catch-all 4xx/5xx
        return (operation, handlerMethod) -> {
            operation.getResponses().addApiResponse("400", new ApiResponse()
                    .description("Bad Request")
                    .content(new Content().addMediaType("*/*", new MediaType().schema(
                            new Schema<MediaType>().$ref("ApiErrorResponse")))));
            operation.getResponses().addApiResponse("409", new ApiResponse()
                    .description("Conflict")
                    .content(new Content().addMediaType("*/*", new MediaType().schema(
                            new Schema<MediaType>().$ref("ApiErrorResponse")))));
            operation.getResponses().addApiResponse("500", new ApiResponse()
                    .description("Internal Server Error")
                    .content(new Content().addMediaType("*/*", new MediaType().schema(
                            new Schema<MediaType>().$ref("ApiErrorResponse")))));
            return operation;
        };
    }

    @Bean
    public OpenApiCustomizer sortTagsAlphabetically() {
        // TODO: Sort by the api indexing name
        return this::extractedOpenApiTagOrder;
    }

    private void extractedOpenApiTagOrder(OpenAPI openApi) {
        final Pattern p = Pattern.compile("^\\d+");
        Comparator<Tag> c = new Comparator<Tag>() {
            @Override
            public int compare(Tag objectE1, Tag objectE2) {
                String object1 = objectE1.getName(), object2 = objectE2.getName();
                Matcher m = p.matcher(object1);
                Integer number1 = null;
                if (!m.find()) {
                    return object1.compareTo(object2);
                } else {
                    Integer number2 = null;
                    number1 = Integer.parseInt(m.group());
                    m = p.matcher(object2);
                    if (!m.find()) {
                        return object1.compareTo(object2);
                    } else {
                        number2 = Integer.parseInt(m.group());
                        int comparison = number1.compareTo(number2);
                        if (comparison != 0) {
                            return comparison;
                        } else {
                            return object1.compareTo(object2);
                        }
                    }
                }
            }
        };
        if (openApi.getTags() != null) {
            openApi.setTags(openApi.getTags()
                    .stream()
                    .sorted(c)
                    .toList());
        }
    }
}
