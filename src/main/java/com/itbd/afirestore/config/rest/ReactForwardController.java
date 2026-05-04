package com.itbd.afirestore.config.rest;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;

@Controller
public class ReactForwardController {

    @GetMapping("{path:^(?!api|public|css|js|images|assets|content)[^\\.]*}/**")
    public String handleForward(@PathVariable(required = false) String path) {
        return "forward:/";
    }
}
