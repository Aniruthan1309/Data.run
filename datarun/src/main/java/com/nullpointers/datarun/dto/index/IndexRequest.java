package com.nullpointers.datarun.dto.index;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public record IndexRequest(@JsonProperty("file_id")
                            String fileId,

                           List<IndexChunk> chunks) {
}
