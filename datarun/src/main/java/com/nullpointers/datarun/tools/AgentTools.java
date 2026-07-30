package com.nullpointers.datarun.tools;

import com.nullpointers.datarun.client.PythonServiceClient;
import com.nullpointers.datarun.dto.clean.CleanRequest;
import com.nullpointers.datarun.dto.clean.CleanResponse;
import com.nullpointers.datarun.dto.execute.ExecuteRequest;
import com.nullpointers.datarun.dto.execute.ExecuteResponse;
import com.nullpointers.datarun.dto.index.IndexRequest;
import com.nullpointers.datarun.dto.index.IndexResponse;
import com.nullpointers.datarun.dto.search.SearchRequest;
import com.nullpointers.datarun.dto.search.SearchResponse;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class AgentTools {
    private final PythonServiceClient pythonServiceClient;

    public AgentTools(PythonServiceClient pythonServiceClient) {
        this.pythonServiceClient = pythonServiceClient;
    }

    @Tool(description = "Execute Python code on the uploaded dataset")
    public ExecuteResponse runPython(ExecuteRequest request) {
        return pythonServiceClient.execute(request);
    }

    @Tool(description = "Search indexed documents semantically")
    public List<SearchResponse> searchDocuments(SearchRequest request) {
        System.out.println("===== TOOL CALLED =====");
        return pythonServiceClient.search(request);
    }

    @Tool(description = "Clean the uploaded dataset")
    public CleanResponse cleanData(CleanRequest request) {
        return pythonServiceClient.clean(request);
    }

    @Tool(description = "Index parsed document chunks")
    public IndexResponse indexDocument(IndexRequest request) {
        return pythonServiceClient.index(request);
    }
}
