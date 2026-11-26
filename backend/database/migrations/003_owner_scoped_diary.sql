-- Apply to installations that already ran 001 and 002, before starting the new API.
USE ostrixai;
ALTER TABLE sync_events MODIFY inference_source ENUM('ON_DEVICE','IN_CLOUD','OFFLINE_ESSENTIAL') NOT NULL;
ALTER TABLE academic_sessions DROP PRIMARY KEY, ADD PRIMARY KEY (user_uid,id),
    ADD COLUMN session_details JSON NULL, ADD COLUMN content_hash BINARY(32) NULL;
ALTER TABLE session_concepts DROP PRIMARY KEY, ADD PRIMARY KEY (user_uid,id);
ALTER TABLE learning_memory_items DROP PRIMARY KEY, ADD PRIMARY KEY (user_uid,id),
    ADD COLUMN content_hash BINARY(32) NULL;
ALTER TABLE learning_review_results DROP PRIMARY KEY, ADD PRIMARY KEY (user_uid,id);
ALTER TABLE linguistic_corrections DROP PRIMARY KEY, ADD PRIMARY KEY (user_uid,id);
