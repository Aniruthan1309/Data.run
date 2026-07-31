package com.nullpointers.datarun.dto.search;

public record SearchRequest(String query,

                            int top_k) {
}
