package com.nullpointers.datarun.dto.search;

import com.fasterxml.jackson.annotation.JsonProperty;

public record SearchResponse(
        String text,
        String file_id,
        Integer page,
        double distance
) {}
