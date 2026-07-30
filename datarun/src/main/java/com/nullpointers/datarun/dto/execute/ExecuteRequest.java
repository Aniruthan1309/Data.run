package com.nullpointers.datarun.dto.execute;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ExecuteRequest(
        @JsonProperty("file_id")
        String fileId,
        String code) {
}
