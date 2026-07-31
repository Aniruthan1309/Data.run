package com.nullpointers.datarun.dto.parse;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

public record ParsePdfResponse(@JsonProperty("file_id")
                               String fileId,

                               @JsonProperty("page_count")
                               int pageCount,

                               List<PdfChunk> chunks) {
}
