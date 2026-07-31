package com.nullpointers.datarun.controller;

public record AskRequest(String sessionId, String question, String fileId) {
}
