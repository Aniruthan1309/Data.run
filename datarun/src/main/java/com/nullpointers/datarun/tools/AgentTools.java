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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class AgentTools {
    private final PythonServiceClient pythonServiceClient;
    private static final Logger log = LoggerFactory.getLogger(AgentTools.class);

    public AgentTools(PythonServiceClient pythonServiceClient) {
        this.pythonServiceClient = pythonServiceClient;
    }

    @Tool(description = "Execute Python code on the uploaded dataset")
    public ExecuteResponse runPython(

            @ToolParam(description = "ID of the uploaded dataset")
            String fileId,

            @ToolParam(description = "Python code to execute on the dataset")
            String code) {

        ExecuteRequest request = new ExecuteRequest(fileId, code);
        return pythonServiceClient.execute(request);
    }
    @Tool(description = "Search indexed documents semantically")
    public List<SearchResponse> searchDocuments(
            @ToolParam(description = "natural language search query") String query,
            @ToolParam(description = "number of results to return") int topK) {

        if (query == null || query.isBlank()) {
            log.warn("searchDocuments called with blank query");
            return List.of();
        }
        try {
            return pythonServiceClient.search(new SearchRequest(query, topK));
        } catch (Exception ex) {
            log.error("searchDocuments failed", ex);
            return List.of();
        }
    }

    @Tool(description = "Clean an uploaded dataset")
    public CleanResponse cleanData(

            @ToolParam(description = "ID of the uploaded dataset")
            String fileId,

            @ToolParam(description = """
                Cleaning operation.
                Supported values:
                drop_nulls,
                fill_nulls,
                cast_dtype,
                dedupe
                """)
            String operation,

            @ToolParam(description = "Column to operate on. Optional for dataset-wide operations.")
            String column,

            @ToolParam(description = """
                Optional extra value required by some operations.
                Examples:
                - fill_nulls -> value to fill (0, Unknown, etc.)
                - cast_dtype -> target type (int, float64, string)
                Leave empty for operations that don't require it.
                """)
            String extraArg
    ) {

        return pythonServiceClient.clean(
                new CleanRequest(fileId, operation, column, extraArg)
        );
    }

    @Tool(description = "Index parsed document chunks")
    public IndexResponse indexDocument(IndexRequest request) {
        return pythonServiceClient.index(request);
    }
}
