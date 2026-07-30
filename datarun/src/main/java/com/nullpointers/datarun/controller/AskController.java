package com.nullpointers.datarun.controller;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class AskController {
    private final ChatClient chatClient;

    public AskController(ChatClient chatClient) {
        this.chatClient = chatClient;
    }

    @PostMapping("/ask")
    public Map<String, String> ask(@RequestBody AskRequest request) {

        String response = chatClient.prompt()
                .advisors(a-> a.param(ChatMemory.CONVERSATION_ID,request.sessionId()))
                .user(request.question())
                .call()
                .content();

        return Map.of("answer", response);
    }
}
