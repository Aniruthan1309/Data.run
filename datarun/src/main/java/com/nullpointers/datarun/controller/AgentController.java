package com.nullpointers.datarun.controller;

import com.nullpointers.datarun.client.PythonServiceClient;
import com.nullpointers.datarun.dto.clean.CleanRequest;
import com.nullpointers.datarun.dto.clean.CleanResponse;
import com.nullpointers.datarun.dto.index.IndexRequest;
import com.nullpointers.datarun.dto.index.IndexResponse;
import com.nullpointers.datarun.dto.parse.ParseCsvResponse;
import com.nullpointers.datarun.dto.parse.ParsePdfResponse;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api")
public class AgentController {

    private final PythonServiceClient pythonServiceClient;

    public AgentController(PythonServiceClient pythonServiceClient) {
        this.pythonServiceClient = pythonServiceClient;
    }

    @PostMapping(value = "/upload/csv", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ParseCsvResponse uploadCsv(@RequestParam("file") MultipartFile file) {
        return pythonServiceClient.parseCsv(file);
    }

    @PostMapping(value = "/upload/pdf", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ParsePdfResponse uploadPdf(@RequestParam("file") MultipartFile file) {
        return pythonServiceClient.parsePdf(file);
    }

    @PostMapping("/index")
    public IndexResponse index(@RequestBody IndexRequest request) {
        return pythonServiceClient.index(request);
    }

    @PostMapping("/clean")
    public CleanResponse clean(@RequestBody CleanRequest request) {
        return pythonServiceClient.clean(request);
    }
}
