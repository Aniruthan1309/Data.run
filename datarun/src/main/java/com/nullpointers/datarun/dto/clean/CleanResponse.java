package com.nullpointers.datarun.dto.clean;

import com.fasterxml.jackson.annotation.JsonProperty;

public record CleanResponse(@JsonProperty("file_id")
                            String fileId,

                            String summary) {
}
