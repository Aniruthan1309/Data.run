package com.nullpointers.datarun.controller;

import com.nullpointers.datarun.dto.index.IndexRequest;
import com.nullpointers.datarun.dto.index.IndexResponse;
import com.nullpointers.datarun.tools.AgentTools;
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
    private final AgentTools agentTools;

    public AskController(ChatClient chatClient, AgentTools agentTools) {
        this.chatClient = chatClient;
        this.agentTools = agentTools;
    }
    @PostMapping("/ask")
    public Map<String, String> ask(@RequestBody AskRequest request) {

        String response = chatClient.prompt()
                .advisors(a -> a.param(ChatMemory.CONVERSATION_ID, request.sessionId()))
                .user(u -> u.text("Context: fileId={fileId}\n\nQuestion: {question}")
                        .param("fileId", request.fileId())
                        .param("question", request.question()))
                .call()
                .content();

        return Map.of("answer", response);
    }
}

