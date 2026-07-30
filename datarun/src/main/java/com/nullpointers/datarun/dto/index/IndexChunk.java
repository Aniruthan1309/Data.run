package com.nullpointers.datarun.dto.index;

import com.fasterxml.jackson.annotation.JsonProperty;

public record IndexChunk(String text,

                         @JsonProperty("source_file")
                         String sourceFile,

                         String location) {
}
