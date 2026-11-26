-- OstrixAi Migration 001: Initial Schema (Sync Events)
CREATE DATABASE IF NOT EXISTS ostrixai
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ostrixai;

CREATE TABLE IF NOT EXISTS sync_events (
    user_uid VARCHAR(128) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    event_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    note_text MEDIUMTEXT NOT NULL,
    answer_text MEDIUMTEXT NOT NULL,
    inference_source ENUM('ON_DEVICE', 'IN_CLOUD') NOT NULL,
    is_complex BOOLEAN NOT NULL,
    occurred_at DATETIME(6) NOT NULL,
    received_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (user_uid, event_id),
    INDEX idx_user_occurred (user_uid, occurred_at DESC)
) ENGINE=InnoDB;
