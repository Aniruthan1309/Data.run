package com.nullpointers.datarun.dto.index;

import com.fasterxml.jackson.annotation.JsonProperty;

public record IndexResponse(
        @JsonProperty("indexed_count")
        int indexedCount) {
}
