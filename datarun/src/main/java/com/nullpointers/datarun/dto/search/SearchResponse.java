package com.nullpointers.datarun.dto.search;

import com.fasterxml.jackson.annotation.JsonProperty;

public record SearchResponse(String text,

                             @JsonProperty("source_file")
                             String sourceFile,

                             String location,

                             double score) {
}
