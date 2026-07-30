package com.nullpointers.datarun.dto.parse;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

public record ParseCsvResponse(@JsonProperty("file_id")
                               String fileId,

                               List<ColumnInfo> columns,

                               @JsonProperty("row_count")
                               int rowCount,

                               List<Map<String,Object>> preview) {
}
