package com.nullpointers.datarun.controller;

import com.nullpointers.datarun.client.PythonServiceClient;
import com.nullpointers.datarun.dto.execute.ExecuteRequest;
import com.nullpointers.datarun.dto.execute.ExecuteResponse;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/test")
public class ExecuteTestController {

    private final PythonServiceClient pythonServiceClient;

    public ExecuteTestController(PythonServiceClient pythonServiceClient) {
        this.pythonServiceClient = pythonServiceClient;
    }

    @PostMapping("/execute")
    public ExecuteResponse execute(@RequestBody ExecuteRequest request) {
        return pythonServiceClient.execute(request);
    }
}