package com.nullpointers.datarun.client;
import com.nullpointers.datarun.dto.clean.*;
import com.nullpointers.datarun.dto.execute.ExecuteRequest;
import com.nullpointers.datarun.dto.execute.ExecuteResponse;
import com.nullpointers.datarun.dto.index.*;
import com.nullpointers.datarun.dto.parse.*;
import com.nullpointers.datarun.dto.search.SearchRequest;
import com.nullpointers.datarun.dto.search.SearchResponse;
import com.nullpointers.datarun.exception.PythonServiceException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

@Component
public class PythonServiceClient {

    private static final Logger log =
            LoggerFactory.getLogger(PythonServiceClient.class);

    private final RestClient restClient;

    public PythonServiceClient(
            @Value("${pyservice.base-url}") String baseUrl) {

        this.restClient = RestClient.builder()
                .baseUrl(baseUrl)
                .build();
    }

    public ParseCsvResponse parseCsv(MultipartFile file) {
        return postMultipart("/parse/csv", file, ParseCsvResponse.class);
    }

    public ParsePdfResponse parsePdf(MultipartFile file) {
        return postMultipart("/parse/pdf", file, ParsePdfResponse.class);
    }

    public CleanResponse clean(CleanRequest request) {
        return post("/clean", request, CleanResponse.class);
    }

    public IndexResponse index(IndexRequest request) {
        return post("/index", request, IndexResponse.class);
    }

    public ExecuteResponse execute(ExecuteRequest request) {
        return post("/execute", request, ExecuteResponse.class);
    }

    public List<SearchResponse> search(SearchRequest request) {

        try {

            log.info("Calling /search");

            return restClient.post()
                    .uri("/search")
                    .body(request)
                    .retrieve()
                    .body(new ParameterizedTypeReference<List<SearchResponse>>() {});

        } catch (RestClientException ex) {

            throw new PythonServiceException(
                    "Failed to call /search", ex);

        }

    }

    private <T> T post(
            String uri,
            Object body,
            Class<T> responseType) {

        try {

            log.info("Calling {}", uri);

            return restClient.post()
                    .uri(uri)
                    .body(body)
                    .retrieve()
                    .body(responseType);

        } catch (RestClientException ex) {

            throw new PythonServiceException(
                    "Failed to call " + uri,
                    ex);

        }

    }

    private <T> T postMultipart(
            String uri,
            MultipartFile file,
            Class<T> responseType) {

        try {

            log.info("Uploading {}", file.getOriginalFilename());

            return restClient.post()
                    .uri(uri)
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(createMultipart(file))
                    .retrieve()
                    .body(responseType);

        } catch (RestClientException ex) {

            throw new PythonServiceException(
                    "Failed to upload file",
                    ex);

        }

    }

    private MultiValueMap<String,Object> createMultipart(
            MultipartFile file) {

        try {

            ByteArrayResource resource =
                    new ByteArrayResource(file.getBytes()) {

                        @Override
                        public String getFilename() {
                            return file.getOriginalFilename();
                        }

                    };

            MultiValueMap<String,Object> body =
                    new LinkedMultiValueMap<>();

            body.add("file", resource);

            return body;

        } catch (IOException ex) {

            throw new PythonServiceException(
                    "Unable to read uploaded file",
                    ex);

        }

    }

}