package com.nullpointers.datarun.dto.clean;

import com.fasterxml.jackson.annotation.JsonProperty;

public record CleanRequest(
        @JsonProperty("file_id")
        String fileId,

        String operation,

        String column) {
}
