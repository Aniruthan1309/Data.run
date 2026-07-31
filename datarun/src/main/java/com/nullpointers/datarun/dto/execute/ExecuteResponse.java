package com.nullpointers.datarun.dto.execute;

import com.fasterxml.jackson.annotation.JsonProperty;

public record ExecuteResponse(String stdout,

                              @JsonProperty("chart_base64")
                              String chartBase64,

                              String error) {
}
