# Backend Gaps

This document lists the API endpoints that the frontend needs but are not yet implemented in the backend.

## Required Endpoints

The following endpoints need to be implemented in the backend to support the content system:

1. **GET /courses** — Returns a list of all courses with their metadata (id, title, summary, level, hours, prerequisites, topics).

2. **GET /courses/{id}** — Returns a specific course by ID, including its topics and their concepts.

3. **GET /lessons/{id}** — Returns a single lesson by its ID, including its blocks, objectives, and check question data.

4. **GET /concepts/{id}/graph** — Returns a concept and its prerequisite graph, including the concept ID, title, prerequisite concept IDs, and the lesson IDs associated with the concept.

5. **POST /lessons/{id}/complete** — Marks a lesson as completed for a user. Request body should include:
   - `userId`: the user's ID
   - `checkResult`: boolean indicating whether the check question was answered correctly
   - This endpoint updates the user's progress state (completion and estimatedMastery) in sessionStorage.

## Schema Reference

All request/response shapes should follow the [CONTENT_SCHEMA.md](CONTENT_SCHEMA.md) definition.

## Priority

- High: GET /courses, GET /courses/{id} (needed to render the course browser)
- Medium: GET /lessons/{id}, GET /concepts/{id}/graph (needed to render lesson content)
- Low: POST /lessons/{id}/complete (needed for progress tracking)